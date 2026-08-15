import fs from 'node:fs';
import { type Terminal } from '@/cli/Terminal.js';
import { SbxError } from '@/domain/SbxError.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { type GitClones, type UnsavedBranch } from '@/infrastructure/GitClones.js';
import { type EnvMap } from '@/infrastructure/ProcessRunner.js';
import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';

export interface SandboxRemoverDeps {
  workspace: ProjectWorkspace;
  clones: GitClones;
  terminal: Terminal;
}

export interface RemoveOptions {
  force: boolean;
}

/**
 * Takes a sandbox apart: its services and their volumes, its clone, and
 * its registry entry.
 *
 * A sandbox owns its refs, so its directory is the only copy of whatever
 * was committed inside it. Removal therefore refuses to run while it would
 * destroy work that exists nowhere else, and says how to rescue it. Once
 * that check passes, every step is best-effort and reported rather than
 * fatal.
 */
export class SandboxRemover {
  private readonly workspace: ProjectWorkspace;
  private readonly clones: GitClones;
  private readonly terminal: Terminal;

  constructor({ workspace, clones, terminal }: SandboxRemoverDeps) {
    this.workspace = workspace;
    this.clones = clones;
    this.terminal = terminal;
  }

  remove(record: SandboxRecord, { force }: RemoveOptions): void {
    if (!force) this.rejectUnsavedWork(record);
    this.destroyServices(record);
    this.removeDirectory(record);
    this.clones.unregisterHostRemote(`sbx-${record.name}`);
    this.workspace.registry.remove(record.name);
  }

  /**
   * Docker Compose finds containers by project name, so tearing them down
   * does not need the sandbox's environment variables to be resolvable.
   * When the manifest is broken in a way that stops the env from being
   * built (a bad `ports.env` entry, for example), we still call compose
   * with an empty override so the teardown itself is not held hostage to
   * an unrelated config problem.
   */
  private buildEnvironmentForTeardown(record: SandboxRecord): EnvMap {
    try {
      return this.workspace.environmentFor(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.terminal.warn(`Sandbox variables could not be resolved (${message}); tearing services down with no overrides — compose finds them by project name.`);
      return {};
    }
  }

  private rejectUnsavedWork(record: SandboxRecord): void {
    if (!fs.existsSync(record.directory)) return;
    const { branches, changes } = this.surveyWork(record);
    if (branches.length === 0 && changes.length === 0) return;
    throw new SbxError(
      `"${record.name}" holds work that exists nowhere else: ${this.describe(branches, changes)}.`,
      `Push it, or pull it into the project with \`git -C ${this.workspace.manifest.rootDirectory} fetch sbx-${record.name} <branch>\`. Pass --force to delete it anyway.`,
    );
  }

  /**
   * A survey that could not be completed is not a survey that found
   * nothing. Git failing here used to read as "nothing to lose", and the
   * sandbox went with it.
   */
  private surveyWork(record: SandboxRecord): { branches: UnsavedBranch[]; changes: string[] } {
    try {
      return {
        branches: this.clones.unsavedBranches(record.directory),
        changes: this.clones.uncommittedPaths(record.directory),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SbxError(
        `Could not check "${record.name}" for work that exists nowhere else: ${message}`,
        'Its commits and edits are only in this clone, so sbx will not delete it on a guess. Repair the repository, or pass --force to delete it without the check.',
      );
    }
  }

  private describe(branches: readonly UnsavedBranch[], changes: readonly string[]): string {
    const parts = branches.map((branch) => `${String(branch.commits)} commit(s) on ${branch.branch}`);
    if (changes.length > 0) parts.push(`uncommitted ${this.nameFiles(changes)}`);
    return parts.join(', ');
  }

  private nameFiles(changes: readonly string[]): string {
    const paths = changes.map((change) => change.slice(3));
    if (paths.length <= 3) return paths.join(', ');
    return `${paths.slice(0, 3).join(', ')} and ${String(paths.length - 3)} more`;
  }

  /**
   * Services that outlive their sandbox are the worst kind of leak: the
   * registry no longer points to them, so sbx cannot find them for
   * another try. This step therefore fails loudly rather than best-effort
   * — a compose error stops the delete before the registry entry goes,
   * so the next `sbx delete` (once the reason is fixed) starts over from
   * the same known state.
   */
  private destroyServices(record: SandboxRecord): void {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('remove services and volumes');
    try {
      this.workspace.composeStackFor(record).destroy(this.buildEnvironmentForTeardown(record));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SbxError(
        `Could not remove services and volumes for "${record.name}": ${message}`,
        `The sandbox is still registered so you can try again. To tear the containers down by hand: docker compose --project-name ${this.workspace.manifest.name()}-${record.name} down --volumes --remove-orphans`,
      );
    }
  }

  private removeDirectory(record: SandboxRecord): void {
    if (!fs.existsSync(record.directory)) return;
    this.attempt(`remove ${record.directory}`, () => { this.clones.remove(record.directory); });
  }

  private attempt(description: string, action: () => void): void {
    this.terminal.step(description);
    try {
      action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.terminal.warn(`Could not ${description}: ${message}`);
    }
  }
}
