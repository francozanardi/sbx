/** Creates and removes the git worktrees that back sandboxes. */
export class GitWorktrees {
  constructor(processRunner, repositoryDirectory) {
    this.processRunner = processRunner;
    this.repositoryDirectory = repositoryDirectory;
  }

  add(worktreePath, branch, startPoint) {
    this.processRunner.runProgram('git', ['worktree', 'add', '-b', branch, worktreePath, startPoint], {
      cwd: this.repositoryDirectory,
    });
  }

  /**
   * Removes the worktree and prunes the stale administrative entry that a
   * manually deleted directory leaves behind.
   */
  remove(worktreePath) {
    this.processRunner.runProgram('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: this.repositoryDirectory,
    });
  }

  prune() {
    this.processRunner.runProgram('git', ['worktree', 'prune'], { cwd: this.repositoryDirectory });
  }

  deleteBranch(branch) {
    this.processRunner.runProgram('git', ['branch', '-D', branch], { cwd: this.repositoryDirectory });
  }

  branchExists(branch) {
    try {
      this.processRunner.captureProgram('git', ['rev-parse', '--verify', `refs/heads/${branch}`], {
        cwd: this.repositoryDirectory,
      });
      return true;
    } catch {
      return false;
    }
  }

  currentBranch() {
    return this.processRunner.captureProgram('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: this.repositoryDirectory,
    });
  }
}
