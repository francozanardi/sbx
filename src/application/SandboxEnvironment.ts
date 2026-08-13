import { type PortBlock } from '@/domain/PortBlock.js';
import { type ProjectManifest } from '@/domain/ProjectManifest.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { type EnvMap } from '@/infrastructure/ProcessRunner.js';
import { type SecretsMap } from '@/infrastructure/SecretsFile.js';

/**
 * Every variable one sandbox is described by: its identity, its port
 * block, the secrets minted for it, and the credentials shared by the
 * whole project.
 *
 * The same map is used to render the sandbox's env files and to run its
 * hooks and commands, so a template and the process that reads the
 * rendered file can never disagree about a value.
 *
 * A per-sandbox generated secret wins over a project-wide one of the same
 * name, because the narrower value is the one that was minted for this
 * sandbox specifically.
 */
export class SandboxEnvironment {
  private readonly manifest: ProjectManifest;
  private readonly record: SandboxRecord;
  private readonly portBlock: PortBlock;
  private readonly projectSecrets: SecretsMap;
  private readonly currentBranch: string | null;

  constructor(
    manifest: ProjectManifest,
    record: SandboxRecord,
    portBlock: PortBlock,
    projectSecrets: SecretsMap,
    currentBranch: string | null,
  ) {
    this.manifest = manifest;
    this.record = record;
    this.portBlock = portBlock;
    this.projectSecrets = projectSecrets;
    this.currentBranch = currentBranch;
  }

  variables(): EnvMap {
    return {
      ...this.manifest.staticVariables(),
      ...this.projectSecrets,
      ...this.record.generatedSecrets,
      ...this.portVariables(),
      ...this.identityVariables(),
    };
  }

  private portVariables(): EnvMap {
    const variableNames = this.manifest.portVariableNames();
    const ports = this.portBlock.resolve();
    const variables: EnvMap = {};
    for (const [role, port] of Object.entries(ports)) {
      const name = variableNames[role];
      if (name) variables[name] = String(port);
    }
    return variables;
  }

  /**
   * `SBX_BRANCH` reports whatever is checked out at this moment, and is
   * empty on a detached head. Anything deriving a durable name from a
   * sandbox wants `SBX_NAME`, which does not move.
   */
  private identityVariables(): EnvMap {
    return {
      SBX_PROJECT: this.manifest.name(),
      SBX_NAME: this.record.name,
      SBX_SLOT: String(this.record.slot),
      SBX_DIRECTORY: this.record.directory,
      SBX_BRANCH: this.currentBranch ?? '',
    };
  }
}
