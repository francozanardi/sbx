import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type EnvFileEntry } from '@/domain/ProjectManifest.js';
import { SandboxRecord } from '@/domain/SandboxRecord.js';
import { SbxError } from '@/domain/SbxError.js';
import { SlotAllocator } from '@/domain/SlotAllocator.js';
import { type DockerAvailability } from '@/infrastructure/DockerAvailability.js';
import { type GitClones } from '@/infrastructure/GitClones.js';
import { type PortProbe } from '@/infrastructure/PortProbe.js';
import { type EnvMap } from '@/infrastructure/ProcessRunner.js';
import { type SecretGenerator } from '@/infrastructure/SecretGenerator.js';
import { type TemplateRenderer } from '@/infrastructure/TemplateRenderer.js';
import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';

export interface CheckResult {
  name: string;
  ok: boolean | null;
  detail: string;
}

type Produced = CheckResult | CheckResult[] | null;

export interface SetupInspectorDeps {
  workspace: ProjectWorkspace;
  clones: GitClones;
  portProbe: PortProbe;
  secretGenerator: SecretGenerator;
  templateRenderer: TemplateRenderer;
  dockerAvailability: DockerAvailability;
}

/**
 * Answers "would `sbx create` work here?" without creating anything.
 *
 * Every check reads the project's own checkout, not a sandbox, so it
 * reports on the files as they are right now. Where that differs from what
 * a sandbox would see — a template that exists but was never committed —
 * the difference is itself one of the things worth reporting.
 *
 * No check may end the run. The whole point of the command is to list
 * everything that is wrong in one pass, so a check that throws becomes a
 * failed check and the rest still run.
 */
export class SetupInspector {
  private readonly workspace: ProjectWorkspace;
  private readonly clones: GitClones;
  private readonly portProbe: PortProbe;
  private readonly secretGenerator: SecretGenerator;
  private readonly templateRenderer: TemplateRenderer;
  private readonly dockerAvailability: DockerAvailability;

  constructor({ workspace, clones, portProbe, secretGenerator, templateRenderer, dockerAvailability }: SetupInspectorDeps) {
    this.workspace = workspace;
    this.clones = clones;
    this.portProbe = portProbe;
    this.secretGenerator = secretGenerator;
    this.templateRenderer = templateRenderer;
    this.dockerAvailability = dockerAvailability;
  }

  async inspect(): Promise<CheckResult[]> {
    const variables = this.previewVariables();
    const checks: [string, () => Promise<Produced> | Produced][] = [
      ['checkout', () => this.checkNotInsideSandbox()],
      ['git repository', () => this.checkRepository()],
      ['ports', () => this.checkPorts()],
      ['port drift', () => this.checkPortDrift()],
      ['secrets', () => this.checkSecrets()],
      ['secrets syntax', () => this.checkSecretsSyntax()],
      ['templates', () => this.checkTemplates(variables)],
      ['rendered files', () => this.checkDestinations()],
      ['services', () => this.checkCompose(variables)],
      ['docker', () => this.checkDocker()],
      ['sandbox location', () => this.checkSandboxLocation()],
      ['hooks', () => this.checkHooks()],
    ];
    const results: CheckResult[] = [];
    for (const [name, produce] of checks) results.push(...(await this.attempt(name, produce)));
    return results;
  }

  private async attempt(name: string, produce: () => Promise<Produced> | Produced): Promise<CheckResult[]> {
    try {
      const produced = await produce();
      if (produced === null) return [];
      return Array.isArray(produced) ? produced : [produced];
    } catch (error) {
      return [{ name, ok: false, detail: this.explain(error) }];
    }
  }

  private explain(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const hint = error instanceof SbxError ? error.hint ?? '' : '';
    return `${message} ${hint}`.trim();
  }

  /**
   * The variable map a sandbox created right now would see. Null when it
   * cannot be built at all — every slot taken, an unreadable registry —
   * because the checks that consume it should say they were skipped rather
   * than repeat a failure the check that owns it already reported.
   */
  private previewVariables(): EnvMap | null {
    try {
      const generatedSecrets: Record<string, string> = {};
      for (const [name, byteLength] of Object.entries(this.workspace.manifest.generatedSecrets())) {
        generatedSecrets[name] = this.secretGenerator.generate(byteLength);
      }
      const record = new SandboxRecord({
        name: 'preview',
        slot: this.nextSlot(),
        directory: this.workspace.sandboxPathFor('preview'),
        createdAt: new Date().toISOString(),
        generatedSecrets,
      });
      return this.workspace.environmentFor(record);
    } catch {
      return null;
    }
  }

  private nextSlot(): number {
    const allocator = new SlotAllocator(this.workspace.manifest.maxSlots());
    return allocator.allocate(this.workspace.registry.list().map((record) => record.slot));
  }

  /**
   * Doctor reports on whichever checkout it was run from, and from inside
   * a sandbox that is the wrong one: the ports it calls free are the ports
   * of a machine it is already using, and `sbx create` is refused here.
   */
  private checkNotInsideSandbox(): CheckResult | null {
    const enclosing = this.workspace.enclosingSandbox();
    if (!enclosing) return null;
    return {
      name: 'checkout',
      ok: false,
      detail: `this directory is sandbox "${enclosing.name}", not the host checkout — run sbx from the host so it reports on the repository sandboxes are cloned from`,
    };
  }

  private checkRepository(): CheckResult {
    const branch = this.clones.currentBranch();
    if (!branch) {
      return {
        name: 'git repository',
        ok: false,
        detail: 'no branch to start from — this must be a git repository with at least one commit',
      };
    }
    return { name: 'git repository', ok: true, detail: `new sandboxes start from ${branch}` };
  }

  private async checkPorts(): Promise<CheckResult> {
    const slot = this.nextSlot();
    const ports = this.workspace.portBlockFor(slot).ports();
    const taken = await this.portProbe.findTaken(ports);
    if (taken.length > 0) {
      return { name: 'ports', ok: false, detail: `slot ${String(slot)} wants ${ports.join(', ')} — ${taken.join(', ')} in use` };
    }
    return { name: 'ports', ok: true, detail: `slot ${String(slot)} free: ${ports.join(', ')}` };
  }

  /**
   * Editing `ports.base` or `ports.stride` renumbers every sandbox that
   * already exists, because a port block is derived on every read. The
   * next rebuild of each one will move it; saying so before that happens
   * is the whole job of this command.
   */
  private checkPortDrift(): CheckResult | null {
    const drifted = this.workspace.registry
      .list()
      .map((record) => ({ record, moved: this.workspace.portBlockFor(record.slot).movedFrom(record.ports) }))
      .filter((entry) => entry.moved.length > 0);
    if (drifted.length === 0) return null;
    const summary = drifted.map((entry) => `${entry.record.name} (${entry.moved.join(', ')})`).join('; ');
    return {
      name: 'port drift',
      ok: false,
      detail: `the manifest no longer yields the ports these sandboxes were built on: ${summary} — their next rebuild moves them`,
    };
  }

  private checkSecrets(): CheckResult {
    const secretsPath = this.workspace.secretsPath();
    if (!fs.existsSync(secretsPath)) {
      return { name: 'secrets', ok: null, detail: `${secretsPath} does not exist yet — it is created empty on first create` };
    }
    const count = Object.keys(this.workspace.secrets.read()).length;
    return { name: 'secrets', ok: true, detail: `${String(count)} values from ${secretsPath}` };
  }

  private checkSecretsSyntax(): CheckResult | null {
    const malformed = this.workspace.secrets.malformedLineNumbers();
    if (malformed.length === 0) return null;
    const subject =
      malformed.length === 1
        ? `line ${String(malformed[0])} is ignored`
        : `lines ${malformed.join(', ')} are ignored`;
    return {
      name: 'secrets syntax',
      ok: false,
      detail: `in ${this.workspace.secretsPath()}, ${subject}: neither a comment nor KEY=value`,
    };
  }

  private checkDocker(): CheckResult | null {
    if (!this.workspace.manifest.composeFile()) return null;
    try {
      this.dockerAvailability.assertReady();
      return { name: 'docker', ok: true, detail: 'daemon is answering' };
    } catch (error) {
      return { name: 'docker', ok: false, detail: this.explain(error) };
    }
  }

  private checkTemplates(variables: EnvMap | null): CheckResult[] {
    return this.workspace.manifest.environmentFiles().map((file) => this.checkOneTemplate(file, variables));
  }

  private checkOneTemplate(file: EnvFileEntry, variables: EnvMap | null): CheckResult {
    const name = `template ${file.from}`;
    const templatePath = path.resolve(this.workspace.manifest.rootDirectory, file.from);
    if (!fs.existsSync(templatePath)) {
      return { name, ok: false, detail: `not found at ${templatePath}` };
    }
    if (!this.clones.committed(file.from)) {
      return {
        name,
        ok: false,
        detail: 'exists here but is not committed — a sandbox renders the templates of its own clone, which would not have this file',
      };
    }
    if (variables === null) {
      return { name, ok: null, detail: 'not rendered: the variables a sandbox would see could not be resolved' };
    }
    try {
      this.templateRenderer.render(fs.readFileSync(templatePath, 'utf8'), variables);
      return { name, ok: true, detail: `renders into ${file.to}` };
    } catch (error) {
      return { name, ok: false, detail: this.explain(error) };
    }
  }

  /**
   * Rendered files are per-sandbox output that happens to live in a
   * checkout. Committing one means every sandbox rewrites a tracked file
   * with its own ports and secrets, which shows as a permanent local
   * modification, makes `sbx delete` refuse forever, and puts credentials
   * one `git add -A` away from the remote.
   */
  private checkDestinations(): CheckResult[] {
    return this.workspace.manifest
      .environmentFiles()
      .map((file) => this.checkOneDestination(file))
      .filter((result): result is CheckResult => result !== null);
  }

  private checkOneDestination(file: EnvFileEntry): CheckResult | null {
    const name = `rendered ${file.to}`;
    if (this.clones.committed(file.to)) {
      return {
        name,
        ok: false,
        detail: `${file.to} is committed. Every sandbox overwrites it with its own ports and secrets, so it reads as modified forever and \`sbx delete\` refuses. Remove it from git and add it to .gitignore`,
      };
    }
    if (!this.clones.ignores(file.to)) {
      return {
        name,
        ok: null,
        detail: `${file.to} is not covered by .gitignore. It is generated per sandbox, so it shows as untracked and \`sbx delete\` will refuse without --force`,
      };
    }
    return null;
  }

  private checkCompose(variables: EnvMap | null): CheckResult {
    const composeFile = this.workspace.manifest.composeFile();
    if (!composeFile) return { name: 'services', ok: null, detail: 'no compose file declared' };
    const composePath = path.resolve(this.workspace.manifest.rootDirectory, composeFile);
    if (!fs.existsSync(composePath)) {
      return { name: 'services', ok: false, detail: `${composeFile} not found at ${composePath}` };
    }
    if (!this.clones.committed(composeFile)) {
      return {
        name: 'services',
        ok: false,
        detail: `${composeFile} exists here but is not committed — a sandbox reads it from its own clone, which would not have it`,
      };
    }
    if (variables === null) {
      return { name: 'services', ok: null, detail: 'not checked: the variables a sandbox would see could not be resolved' };
    }
    try {
      this.templateRenderer.render(fs.readFileSync(composePath, 'utf8'), variables);
      return { name: 'services', ok: true, detail: `${composeFile} resolves every variable it uses` };
    } catch (error) {
      return { name: 'services', ok: false, detail: this.explain(error) };
    }
  }

  private checkSandboxLocation(): CheckResult | null {
    const root = this.workspace.sandboxRoot();
    const device = fs.statSync(this.nearestExistingDirectory(root)).dev;
    const unshared: string[] = [];
    if (device !== fs.statSync(this.workspace.manifest.rootDirectory).dev) {
      unshared.push('git objects will be copied per sandbox, not hardlinked');
    }
    if (device !== fs.statSync(os.homedir()).dev) {
      unshared.push('dependency caches will be copied, not linked');
    }
    if (unshared.length === 0) return null;
    return {
      name: 'sandbox location',
      ok: null,
      detail: `${root} is on another filesystem — ${unshared.join('; ')}`,
    };
  }

  private nearestExistingDirectory(directory: string): string {
    let current = path.resolve(directory);
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
    return current;
  }

  private checkHooks(): CheckResult {
    const hooks = this.workspace.manifest.hooks();
    if (hooks.length === 0) return { name: 'hooks', ok: null, detail: 'none declared' };
    const summary = hooks.map((hook) => `${hook.name} (${hook.phase})`).join(', ');
    return { name: 'hooks', ok: true, detail: summary };
  }
}
