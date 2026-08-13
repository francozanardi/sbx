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
   * Clones the project into `destinationPath` and positions its working
   * tree.
   *
   * The default lane-first behaviour is: fetch `origin`, then check out
   * whatever branch `origin` calls default (usually `main`), tracking it.
   * No local branch is invented on the sandbox's behalf. The sandbox lands
   * on the same starting point a fresh clone of the remote would land on.
   *
   * `startPoint` overrides the ref used, and skips no step: origin is still
   * fetched so that a `--from=origin/…` ref is current. `branch` asks for a
   * local branch of that name to be created at the chosen point, which is
   * what the per-task use of a sandbox usually wants.
   */
  create(destinationPath, { branch = null, startPoint = null } = {}) {
    this.processRunner.runProgram('git', ['clone', '--quiet', this.repositoryDirectory, destinationPath]);
    this.nameRemotes(destinationPath);

    const hasOrigin = this.hasRemote(destinationPath, 'origin');
    if (hasOrigin) {
      this.updateOriginRefs(destinationPath);
    }

    const ref = startPoint ?? this.defaultStartPoint(destinationPath, hasOrigin);
    const commit = this.resolveIn(destinationPath, ref);
    if (!commit) {
      throw new SbxError(
        `"${ref}" does not name a commit in this sandbox.`,
        'Pass --from=<ref> with a branch, tag or commit git can resolve.',
      );
    }

    if (branch) {
      this.processRunner.runProgram('git', ['checkout', '--quiet', '-B', branch, commit], { cwd: destinationPath });
    } else {
      this.checkoutRef(destinationPath, ref, commit);
    }
  }

  /**
   * Fetches from `origin` and sets `origin/HEAD` to whatever the remote
   * calls default. Both steps are best-effort: an offline machine, a remote
   * that refuses the fetch, or a remote with no `HEAD` should not fail the
   * whole create. The sandbox still ends up on something reasonable.
   *
   * `captureProgram` is used for `set-head` because the command has no
   * `--quiet` in older git and prints an informational line either way.
   */
  updateOriginRefs(destinationPath) {
    try {
      this.processRunner.runProgram('git', ['fetch', '--quiet', 'origin'], { cwd: destinationPath });
    } catch {
      return;
    }
    try {
      this.processRunner.captureProgram('git', ['remote', 'set-head', 'origin', '--auto'], { cwd: destinationPath });
    } catch {}
  }

  defaultStartPoint(destinationPath, hasOrigin) {
    if (hasOrigin && this.hasRef(destinationPath, 'refs/remotes/origin/HEAD')) {
      return 'origin/HEAD';
    }
    return this.currentBranch() ?? 'HEAD';
  }

  /**
   * Checks out `ref` in a way that matches what a fresh `git clone` would
   * do: `origin/main` becomes a local `main` tracking it, a local branch
   * checks itself out, anything else lands detached.
   */
  checkoutRef(destinationPath, ref, commit) {
    const remoteMatch = ref.match(/^origin\/(.+)$/);
    if (remoteMatch) {
      const branchName = remoteMatch[1] === 'HEAD' ? this.resolveOriginHead(destinationPath) : remoteMatch[1];
      if (branchName) {
        this.processRunner.runProgram(
          'git',
          ['checkout', '--quiet', '-B', branchName, '--track', `origin/${branchName}`],
          { cwd: destinationPath },
        );
        return;
      }
    }
    if (this.isLocalBranch(destinationPath, ref)) {
      this.processRunner.runProgram('git', ['checkout', '--quiet', ref], { cwd: destinationPath });
      return;
    }
    this.processRunner.runProgram('git', ['checkout', '--quiet', '--detach', commit], { cwd: destinationPath });
  }

  resolveOriginHead(destinationPath) {
    try {
      const ref = this.processRunner.captureProgram(
        'git',
        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
        { cwd: destinationPath },
      );
      return ref.replace(/^origin\//, '');
    } catch {
      return null;
    }
  }

  hasRemote(directory, name) {
    try {
      this.processRunner.captureProgram('git', ['remote', 'get-url', name], { cwd: directory });
      return true;
    } catch {
      return false;
    }
  }

  hasRef(directory, ref) {
    try {
      this.processRunner.captureProgram('git', ['show-ref', '--verify', '--quiet', ref], { cwd: directory });
      return true;
    } catch {
      return false;
    }
  }

  isLocalBranch(directory, ref) {
    return this.hasRef(directory, `refs/heads/${ref}`);
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
