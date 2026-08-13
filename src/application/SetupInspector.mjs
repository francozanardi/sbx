import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SandboxRecord } from '../domain/SandboxRecord.mjs';
import { SlotAllocator } from '../domain/SlotAllocator.mjs';

/**
 * Answers "would `sbx create` work here?" without creating anything.
 *
 * Every check reads the project's own checkout, not a sandbox, so it
 * reports on the files as they are right now — including ones not committed
 * yet, which a sandbox would not see.
 *
 * Each check returns `{ name, ok, detail }`. `ok` is null for findings that
 * are worth reporting but are not failures.
 */
export class SetupInspector {
  constructor({ workspace, clones, portProbe, secretGenerator, templateRenderer, dockerAvailability }) {
    this.workspace = workspace;
    this.clones = clones;
    this.portProbe = portProbe;
    this.secretGenerator = secretGenerator;
    this.templateRenderer = templateRenderer;
    this.dockerAvailability = dockerAvailability;
  }

  async inspect() {
    const variables = this.previewVariables();
    return [
      this.checkRepository(),
      await this.checkPorts(),
      this.checkSecrets(),
      this.checkSecretsSyntax(),
      ...this.checkTemplates(variables),
      this.checkCompose(variables),
      this.checkDocker(),
      this.checkSandboxLocation(),
      this.checkHooks(),
    ].filter(Boolean);
  }

  /**
   * The variable map the next sandbox would resolve. The generated secrets
   * are real but thrown away — only their presence matters to a render.
   */
  previewVariables() {
    const slot = this.nextSlot();
    const generatedSecrets = {};
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

  nextSlot() {
    const allocator = new SlotAllocator(this.workspace.manifest.maxSlots());
    return allocator.allocate(this.workspace.registry.list().map((record) => record.slot));
  }

  /**
   * A sandbox is cloned at a commit, so a repository with no history cannot
   * host one yet. Git's own message for that case names a revision rather
   * than the situation, which is worth translating.
   */
  checkRepository() {
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

  async checkPorts() {
    const slot = this.nextSlot();
    const ports = this.workspace.portBlockFor(slot).ports();
    const taken = await this.portProbe.findTaken(ports);
    if (taken.length > 0) {
      return { name: 'ports', ok: false, detail: `slot ${slot} wants ${ports.join(', ')} — ${taken.join(', ')} in use` };
    }
    return { name: 'ports', ok: true, detail: `slot ${slot} free: ${ports.join(', ')}` };
  }

  checkSecrets() {
    const secretsPath = this.workspace.secretsPath();
    if (!fs.existsSync(secretsPath)) {
      return { name: 'secrets', ok: null, detail: `${secretsPath} does not exist yet — it is created empty on first create` };
    }
    const count = Object.keys(this.workspace.secrets.read()).length;
    return { name: 'secrets', ok: true, detail: `${count} values from ${secretsPath}` };
  }

  checkSecretsSyntax() {
    const malformed = this.workspace.secrets.malformedLineNumbers();
    if (malformed.length === 0) return null;
    const subject =
      malformed.length === 1 ? `line ${malformed[0]} is ignored` : `lines ${malformed.join(', ')} are ignored`;
    return {
      name: 'secrets syntax',
      ok: false,
      detail: `in ${this.workspace.secretsPath()}, ${subject}: neither a comment nor KEY=value`,
    };
  }

  checkDocker() {
    if (!this.workspace.manifest.composeFile()) return null;
    try {
      this.dockerAvailability.assertReady();
      return { name: 'docker', ok: true, detail: 'daemon is answering' };
    } catch (error) {
      return { name: 'docker', ok: false, detail: `${error.message} ${error.hint ?? ''}`.trim() };
    }
  }

  checkTemplates(variables) {
    return this.workspace.manifest.environmentFiles().map((file) => this.checkOneTemplate(file, variables));
  }

  checkOneTemplate(file, variables) {
    const name = `template ${file.from}`;
    const templatePath = path.resolve(this.workspace.manifest.rootDirectory, file.from);
    if (!fs.existsSync(templatePath)) {
      return { name, ok: false, detail: `not found at ${templatePath}` };
    }
    try {
      this.templateRenderer.render(fs.readFileSync(templatePath, 'utf8'), variables);
      return { name, ok: true, detail: `renders into ${file.to}` };
    } catch (error) {
      return { name, ok: false, detail: error.message };
    }
  }

  checkCompose(variables) {
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
      return { name: 'services', ok: false, detail: error.message };
    }
  }

  /**
   * Hardlinks cannot cross a filesystem boundary, and two kinds of sharing
   * depend on them. Against the repository it is git's object database,
   * which a clone borrows instead of duplicating; against the home
   * directory it is the package manager's cache. Losing either turns a
   * near-free copy into a real one, in time and in disk.
   */
  checkSandboxLocation() {
    const root = this.workspace.sandboxRoot();
    const device = fs.statSync(this.nearestExistingDirectory(root)).dev;
    const unshared = [];
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

  nearestExistingDirectory(directory) {
    let current = path.resolve(directory);
    while (!fs.existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
    return current;
  }

  checkHooks() {
    const hooks = this.workspace.manifest.hooks();
    if (hooks.length === 0) return { name: 'hooks', ok: null, detail: 'none declared' };
    const summary = hooks.map((hook) => `${hook.name} (${hook.phase})`).join(', ');
    return { name: 'hooks', ok: true, detail: summary };
  }
}
