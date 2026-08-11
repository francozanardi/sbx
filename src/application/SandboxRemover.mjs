import fs from 'node:fs';

/**
 * Takes a sandbox apart: its services and their volumes, its worktree, its
 * registry entry, and optionally the branch it was on.
 *
 * Every step is best-effort and reported rather than fatal. A teardown
 * that refuses to finish because one piece was already gone leaves the
 * slot occupied forever, which is worse than a warning.
 */
export class SandboxRemover {
  constructor({ workspace, worktrees, terminal }) {
    this.workspace = workspace;
    this.worktrees = worktrees;
    this.terminal = terminal;
  }

  remove(record, { deleteBranch }) {
    this.destroyServices(record);
    this.removeWorktree(record);
    if (deleteBranch) this.removeBranch(record);
    this.workspace.registry.remove(record.name);
  }

  destroyServices(record) {
    if (!this.workspace.manifest.composeFile()) return;
    this.attempt('remove services and volumes', () => {
      this.workspace.composeStackFor(record).destroy(this.workspace.environmentFor(record));
    });
  }

  removeWorktree(record) {
    if (fs.existsSync(record.worktree)) {
      this.attempt(`remove worktree ${record.worktree}`, () => this.worktrees.remove(record.worktree));
    }
    this.attempt('prune worktree list', () => this.worktrees.prune());
  }

  removeBranch(record) {
    this.attempt(`delete branch ${record.branch}`, () => this.worktrees.deleteBranch(record.branch));
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
