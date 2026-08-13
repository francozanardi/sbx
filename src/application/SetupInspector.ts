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
 * reports on the files as they are right now — including ones not committed
 * yet, which a sandbox would not see.
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
    const results: (CheckResult | null)[] = [
      this.checkRepository(),
      await this.checkPorts(),
      this.checkSecrets(),
      this.checkSecretsSyntax(),
      ...this.checkTemplates(variables),
      this.checkCompose(variables),
      this.checkDocker(),
      this.checkSandboxLocation(),
      this.checkHooks(),
    ];
    return results.filter((result): result is CheckResult => result !== null);
  }

  private previewVariables(): EnvMap {
    const slot = this.nextSlot();
    const generatedSecrets: Record<string, string> = {};
    for (const [name, byteLength] of Object.entries(this.workspace.manifest.generatedSecrets())) {
      generatedSecrets[name] = this.secretGenerator.generate(byteLength);
    }
    const record = new SandboxRecord({
      name: 'preview',
      slot,
      directory: this.workspace.sandboxPathFor('preview'),
      createdAt: new Date().toISOString(),
      generatedSecrets,
    });
    return this.workspace.environmentFor(record);
  }

  private nextSlot(): number {
    const allocator = new SlotAllocator(this.workspace.manifest.maxSlots());
    return allocator.allocate(this.workspace.registry.list().map((record) => record.slot));
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
      const message = error instanceof Error ? error.message : String(error);
      const hint = error instanceof SbxError ? error.hint ?? '' : '';
      return { name: 'docker', ok: false, detail: `${message} ${hint}`.trim() };
    }
  }

  private checkTemplates(variables: EnvMap): CheckResult[] {
    return this.workspace.manifest.environmentFiles().map((file) => this.checkOneTemplate(file, variables));
  }

  private checkOneTemplate(file: EnvFileEntry, variables: EnvMap): CheckResult {
    const name = `template ${file.from}`;
    const templatePath = path.resolve(this.workspace.manifest.rootDirectory, file.from);
    if (!fs.existsSync(templatePath)) {
      return { name, ok: false, detail: `not found at ${templatePath}` };
    }
    try {
      this.templateRenderer.render(fs.readFileSync(templatePath, 'utf8'), variables);
      return { name, ok: true, detail: `renders into ${file.to}` };
    } catch (error) {
      return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private checkCompose(variables: EnvMap): CheckResult {
    const composeFile = this.workspace.manifest.composeFile();
    if (!composeFile) return { name: 'services', ok: null, detail: 'no compose file declared' };
    const composePath = path.resolve(this.workspace.manifest.rootDirectory, composeFile);
    if (!fs.existsSync(composePath)) {
      return { name: 'services', ok: false, detail: `${composeFile} not found at ${composePath}` };
    }
    try {
      this.templateRenderer.render(fs.readFileSync(composePath, 'utf8'), variables);
      return { name: 'services', ok: true, detail: `${composeFile} resolves every variable it uses` };
    } catch (error) {
      return { name: 'services', ok: false, detail: error instanceof Error ? error.message : String(error) };
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
