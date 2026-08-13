import fs from 'node:fs';
import path from 'node:path';
import { PortBlock } from '@/domain/PortBlock.js';
import { type ProjectManifest } from '@/domain/ProjectManifest.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { SbxError } from '@/domain/SbxError.js';
import { ComposeStack } from '@/infrastructure/ComposeStack.js';
import { type DockerAvailability } from '@/infrastructure/DockerAvailability.js';
import { type GitClones } from '@/infrastructure/GitClones.js';
import { type HomePath } from '@/infrastructure/HomePath.js';
import { JsonSandboxRegistry } from '@/infrastructure/JsonSandboxRegistry.js';
import { type EnvMap, type ProcessRunner } from '@/infrastructure/ProcessRunner.js';
import { SecretsFile } from '@/infrastructure/SecretsFile.js';
import { SandboxEnvironment } from '@/application/SandboxEnvironment.js';

/**
 * Resolves everything that is scoped to one project: where its registry
 * and secrets live, where its sandboxes go, and the collaborators that act
 * on a single sandbox of it.
 *
 * Paths configured in the manifest win over the tool's own defaults, so a
 * project can keep its sandboxes somewhere specific without the tool
 * knowing why.
 */
export class ProjectWorkspace {
  readonly manifest: ProjectManifest;
  private readonly homePath: HomePath;
  private readonly processRunner: ProcessRunner;
  private readonly dockerAvailability: DockerAvailability;
  readonly clones: GitClones;
  readonly registry: JsonSandboxRegistry;
  readonly secrets: SecretsFile;

  constructor(
    manifest: ProjectManifest,
    homePath: HomePath,
    processRunner: ProcessRunner,
    dockerAvailability: DockerAvailability,
    clones: GitClones,
  ) {
    this.manifest = manifest;
    this.homePath = homePath;
    this.processRunner = processRunner;
    this.dockerAvailability = dockerAvailability;
    this.clones = clones;
    this.registry = new JsonSandboxRegistry(path.join(this.stateDirectory(), 'state.json'));
    this.secrets = new SecretsFile(this.secretsPath());
  }

  stateDirectory(): string {
    return this.homePath.stateDirectoryFor(this.manifest.name());
  }

  secretsPath(): string {
    const configured = this.manifest.secretsFile();
    return configured
      ? this.homePath.expand(configured)
      : path.join(this.stateDirectory(), 'secrets.env');
  }

  sandboxRoot(): string {
    const configured = this.manifest.sandboxRoot();
    return configured
      ? this.homePath.expand(configured)
      : this.homePath.defaultSandboxRootFor(this.manifest.name());
  }

  sandboxPathFor(sandboxName: string): string {
    return path.join(this.sandboxRoot(), sandboxName);
  }

  /**
   * The sandbox this command was invoked from, or null in the host
   * checkout.
   *
   * A sandbox carries the project's manifest like any other clone, so
   * running sbx from inside one loads that manifest and resolves the same
   * per-project registry. Everything keyed by name keeps working; what
   * silently moves is the repository the tool treats as the host.
   */
  enclosingSandbox(): SandboxRecord | null {
    const root = path.resolve(this.manifest.rootDirectory);
    return this.registry.list().find((record) => path.resolve(record.directory) === root) ?? null;
  }

  /**
   * @throws when the command would write to the host's repository but was
   *   run from inside a sandbox, where "the host" is a different clone.
   */
  requireHostCheckout(action: string): void {
    const enclosing = this.enclosingSandbox();
    if (!enclosing) return;
    const host = this.clones.remoteUrl('host');
    throw new SbxError(
      `This directory is sandbox "${enclosing.name}", not the project's host checkout, and ${action} from inside one writes to the wrong repository.`,
      host
        ? `A sandbox created here would be cloned from "${enclosing.name}" and register its \`sbx-\` remote inside it, leaving the host unaware of either. Run this from the host checkout at ${host}.`
        : `A sandbox created here would be cloned from "${enclosing.name}" and register its \`sbx-\` remote inside it, leaving the host unaware of either. Run this from the host checkout.`,
    );
  }

  /** True when the sandbox's clone is still where the registry says it is. */
  hasClone(record: SandboxRecord): boolean {
    return fs.existsSync(record.directory);
  }

  /**
   * The named sandbox, with its clone confirmed to still exist.
   *
   * Every command that acts *on* a sandbox goes through this rather than
   * the registry, because a record whose directory was removed behind
   * sbx's back otherwise produces a plausible-looking success: a rebuild
   * that renders nothing, a listing that reports a branch it read from
   * somewhere else.
   */
  requireSandbox(name: string): SandboxRecord {
    const record = this.registry.get(name);
    if (!this.hasClone(record)) {
      throw new SbxError(
        `Sandbox "${record.name}" is registered, but its clone is gone from ${record.directory}.`,
        `Something removed it outside sbx. \`sbx delete ${record.name} --force\` drops the stale entry, and \`sbx create ${record.name}\` builds it again.`,
      );
    }
    return record;
  }

  portBlockFor(slot: number): PortBlock {
    return new PortBlock(this.manifest.basePorts(), this.manifest.portStride(), slot);
  }

  /** The branch a sandbox has checked out right now, or null when detached. */
  branchOf(record: SandboxRecord): string | null {
    return this.clones.currentBranch(record.directory);
  }

  /** The full variable map a sandbox's templates, hooks and commands see. */
  environmentFor(record: SandboxRecord): EnvMap {
    const environment = new SandboxEnvironment(
      this.manifest,
      record,
      this.portBlockFor(record.slot),
      this.secrets.read(),
      this.branchOf(record),
    );
    return environment.variables();
  }

  composeStackFor(record: SandboxRecord): ComposeStack {
    const composeFile = this.manifest.composeFile();
    return new ComposeStack(this.processRunner, this.dockerAvailability, {
      projectName: `${this.manifest.name()}-${record.name}`,
      composeFilePath: composeFile ? path.resolve(record.directory, composeFile) : null,
      projectDirectory: record.directory,
    });
  }
}
