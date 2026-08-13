import fs from 'node:fs';
import { type Terminal } from '@/cli/Terminal.js';
import { SbxError } from '@/domain/SbxError.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { type GitClones, type UnsavedBranch } from '@/infrastructure/GitClones.js';
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

  private rejectUnsavedWork(record: SandboxRecord): void {
    if (!fs.existsSync(record.directory)) return;
    const branches = this.clones.unsavedBranches(record.directory);
    const changes = this.clones.uncommittedPaths(record.directory);
    if (branches.length === 0 && changes.length === 0) return;
    throw new SbxError(
      `"${record.name}" holds work that exists nowhere else: ${this.describe(branches, changes)}.`,
      `Push it, or pull it into the project with \`git -C ${this.workspace.manifest.rootDirectory} fetch sbx-${record.name} <branch>\`. Pass --force to delete it anyway.`,
    );
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

  private destroyServices(record: SandboxRecord): void {
    if (!this.workspace.manifest.composeFile()) return;
    this.attempt('remove services and volumes', () => {
      this.workspace.composeStackFor(record).destroy(this.workspace.environmentFor(record));
    });
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
