import fs from 'node:fs';
import { SbxError } from '../domain/SbxError.mjs';

/**
 * Creates and removes the git clones that back sandboxes, and answers
 * questions about one.
 *
 * A clone rather than a worktree is what makes a sandbox independent of
 * the branch anyone else is on: it owns its refs, so it can check out
 * `main`, or the same branch another sandbox already has, and ordinary git
 * commands behave the way they do in any repository.
 *
 * Cloning from a local path lets git hardlink the object database instead
 * of copying it, which is why a sandbox costs close to nothing on disk.
 * The hardlinks are safe because git never rewrites an object file in
 * place: repacking writes new files, and the other clone's names keep the
 * old ones alive. Passing `--local` explicitly is deliberately avoided —
 * it turns a cross-filesystem clone into a hard failure, where plain
 * `git clone` falls back to copying.
 */
export class GitClones {
  constructor(processRunner, repositoryDirectory) {
    this.processRunner = processRunner;
    this.repositoryDirectory = repositoryDirectory;
  }

  /**
   * Clones the project into `destinationPath` and leaves it on a branch
   * called `branch`, starting at `startPoint` as that revision resolves in
   * the project's own repository.
   */
  create(destinationPath, branch, startPoint) {
    const commit = this.resolve(startPoint);
    this.processRunner.runProgram('git', ['clone', '--quiet', this.repositoryDirectory, destinationPath]);
    this.nameRemotes(destinationPath);
    this.processRunner.runProgram('git', ['checkout', '--quiet', '-B', branch, commit], { cwd: destinationPath });
  }

  /**
   * Points `origin` at whatever the project calls `origin`, and the project
   * itself at `host`, so that pushing, fetching and starting a branch from
   * `origin/main` work exactly as they do in the project's own checkout.
   *
   * A project with no `origin` of its own leaves the sandbox with only
   * `host`, which is the whole truth in that case.
   */
  nameRemotes(destinationPath) {
    this.processRunner.runProgram('git', ['remote', 'rename', 'origin', 'host'], { cwd: destinationPath });
    const upstream = this.originUrl();
    if (upstream) {
      this.processRunner.runProgram('git', ['remote', 'add', 'origin', upstream], { cwd: destinationPath });
    }
  }

  originUrl() {
    try {
      return this.processRunner.captureProgram('git', ['remote', 'get-url', 'origin'], {
        cwd: this.repositoryDirectory,
      });
    } catch {
      return null;
    }
  }

  resolve(revision) {
    const commit = this.resolveIn(this.repositoryDirectory, revision);
    if (!commit) {
      throw new SbxError(
        `"${revision}" does not name a commit in this repository.`,
        'Pass --from=<ref> with a branch, tag or commit that exists here.',
      );
    }
    return commit;
  }

  remove(destinationPath) {
    fs.rmSync(destinationPath, { recursive: true, force: true });
  }

  /** The branch checked out right now, or null when the clone is detached or gone. */
  currentBranch(directory = this.repositoryDirectory) {
    try {
      const branch = this.processRunner.captureProgram('git', ['branch', '--show-current'], { cwd: directory });
      return branch.length > 0 ? branch : null;
    } catch {
      return null;
    }
  }

  /**
   * Branches of the clone whose commits exist nowhere but this directory,
   * as `{ branch, commits }` counts.
   *
   * A branch is safe once its tip has been pushed to one of the clone's
   * remotes, and equally safe once the project itself holds the commit —
   * a fetch into the project rescues the work without the clone ever
   * hearing about it, and refusing to notice that would make the advice
   * this refusal gives impossible to follow.
   */
  unsavedBranches(directory) {
    return this.localBranches(directory)
      .map((branch) => ({ branch, commits: this.commitsOffRemotes(directory, branch) }))
      .filter((candidate) => candidate.commits > 0)
      .filter((candidate) => !this.projectHas(this.resolveIn(directory, candidate.branch)));
  }

  localBranches(directory) {
    try {
      const listed = this.processRunner.captureProgram(
        'git',
        ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
        { cwd: directory },
      );
      return listed.length > 0 ? listed.split('\n') : [];
    } catch {
      return [];
    }
  }

  commitsOffRemotes(directory, branch) {
    try {
      const counted = this.processRunner.captureProgram(
        'git',
        ['rev-list', '--count', branch, '--not', '--remotes'],
        { cwd: directory },
      );
      return Number(counted);
    } catch {
      return 0;
    }
  }

  resolveIn(directory, revision) {
    try {
      return this.processRunner.captureProgram('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
        cwd: directory,
      });
    } catch {
      return null;
    }
  }

  projectHas(commit) {
    if (!commit) return false;
    try {
      this.processRunner.captureProgram('git', ['cat-file', '-e', `${commit}^{commit}`], {
        cwd: this.repositoryDirectory,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Paths the clone has modified, staged or left untracked. */
  uncommittedPaths(directory) {
    try {
      const listed = this.processRunner.captureProgram('git', ['status', '--porcelain'], { cwd: directory });
      return listed.length > 0 ? listed.split('\n') : [];
    } catch {
      return [];
    }
  }
}
