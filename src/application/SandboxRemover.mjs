import fs from 'node:fs';
import { SbxError } from '../domain/SbxError.mjs';

/**
 * Takes a sandbox apart: its services and their volumes, its clone, and
 * its registry entry.
 *
 * A sandbox owns its refs, so its directory is the only copy of whatever
 * was committed inside it. Removal therefore refuses to run while it would
 * destroy work that exists nowhere else, and says how to rescue it. Once
 * that check passes, every step is best-effort and reported rather than
 * fatal: a teardown that refuses to finish because one piece was already
 * gone leaves the slot occupied forever, which is worse than a warning.
 */
export class SandboxRemover {
  constructor({ workspace, clones, terminal }) {
    this.workspace = workspace;
    this.clones = clones;
    this.terminal = terminal;
  }

  remove(record, { force }) {
    if (!force) this.rejectUnsavedWork(record);
    this.destroyServices(record);
    this.removeDirectory(record);
    this.workspace.registry.remove(record.name);
  }

  rejectUnsavedWork(record) {
    if (!fs.existsSync(record.directory)) return;
    const branches = this.clones.unsavedBranches(record.directory);
    const changes = this.clones.uncommittedPaths(record.directory);
    if (branches.length === 0 && changes.length === 0) return;
    throw new SbxError(
      `"${record.name}" holds work that exists nowhere else: ${this.describe(branches, changes)}.`,
      `Push it, or pull it into the project with \`git -C ${this.workspace.manifest.rootDirectory} fetch ${record.directory} <branch>\`. Pass --force to delete it anyway.`,
    );
  }

  describe(branches, changes) {
    const parts = branches.map((branch) => `${branch.commits} commit(s) on ${branch.branch}`);
    if (changes.length > 0) parts.push(`uncommitted ${this.nameFiles(changes)}`);
    return parts.join(', ');
  }

  /**
   * Naming the files is what separates a lockfile the install hook rewrote
   * from work worth keeping, which is the whole decision being asked for.
   */
  nameFiles(changes) {
    const paths = changes.map((change) => change.slice(3));
    if (paths.length <= 3) return paths.join(', ');
    return `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`;
  }

  destroyServices(record) {
    if (!this.workspace.manifest.composeFile()) return;
    this.attempt('remove services and volumes', () => {
      this.workspace.composeStackFor(record).destroy(this.workspace.environmentFor(record));
    });
  }

  removeDirectory(record) {
    if (!fs.existsSync(record.directory)) return;
    this.attempt(`remove ${record.directory}`, () => this.clones.remove(record.directory));
  }

  attempt(description, action) {
    this.terminal.step(description);
    try {
      action();
    } catch (error) {
      this.terminal.warn(`Could not ${description}: ${error.message}`);
    }
  }
}
