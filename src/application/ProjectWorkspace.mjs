import path from 'node:path';
import { PortBlock } from '../domain/PortBlock.mjs';
import { ComposeStack } from '../infrastructure/ComposeStack.mjs';
import { JsonSandboxRegistry } from '../infrastructure/JsonSandboxRegistry.mjs';
import { SandboxEnvironment } from './SandboxEnvironment.mjs';
import { SecretsFile } from '../infrastructure/SecretsFile.mjs';

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
  constructor(manifest, homePath, processRunner, dockerAvailability, clones) {
    this.manifest = manifest;
    this.homePath = homePath;
    this.processRunner = processRunner;
    this.dockerAvailability = dockerAvailability;
    this.clones = clones;
    this.registry = new JsonSandboxRegistry(path.join(this.stateDirectory(), 'state.json'));
    this.secrets = new SecretsFile(this.secretsPath());
  }

  stateDirectory() {
    return this.homePath.stateDirectoryFor(this.manifest.name());
  }

  secretsPath() {
    const configured = this.manifest.secretsFile();
    return configured
      ? this.homePath.expand(configured)
      : path.join(this.stateDirectory(), 'secrets.env');
  }

  sandboxRoot() {
    const configured = this.manifest.sandboxRoot();
    return configured
      ? this.homePath.expand(configured)
      : this.homePath.defaultSandboxRootFor(this.manifest.name());
  }

  sandboxPathFor(sandboxName) {
    return path.join(this.sandboxRoot(), sandboxName);
  }

  portBlockFor(slot) {
    return new PortBlock(this.manifest.basePorts(), this.manifest.portStride(), slot);
  }

  /** The branch a sandbox has checked out right now, or null when detached. */
  branchOf(record) {
    return this.clones.currentBranch(record.directory);
  }

  /** The full variable map a sandbox's templates, hooks and commands see. */
  environmentFor(record) {
    const environment = new SandboxEnvironment(
      this.manifest,
      record,
      this.portBlockFor(record.slot),
      this.secrets.read(),
      this.branchOf(record),
    );
    return environment.variables();
  }

  composeStackFor(record) {
    const composeFile = this.manifest.composeFile();
    return new ComposeStack(this.processRunner, this.dockerAvailability, {
      projectName: `${this.manifest.name()}-${record.name}`,
      composeFilePath: composeFile ? path.resolve(record.directory, composeFile) : null,
      projectDirectory: record.directory,
    });
  }
}
