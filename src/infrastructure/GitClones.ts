import fs from 'node:fs';
import { SbxError } from '@/domain/SbxError.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface CreateCloneOptions {
  branch?: string | null;
  startPoint?: string | null;
}

export interface UnsavedBranch {
  branch: string;
  commits: number;
}

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
  private readonly processRunner: ProcessRunner;
  readonly repositoryDirectory: string;

  constructor(processRunner: ProcessRunner, repositoryDirectory: string) {
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
  create(destinationPath: string, { branch = null, startPoint = null }: CreateCloneOptions = {}): void {
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

  private updateOriginRefs(destinationPath: string): void {
    try {
      this.processRunner.runProgram('git', ['fetch', '--quiet', 'origin'], { cwd: destinationPath });
    } catch {
      return;
    }
    try {
      this.processRunner.captureProgram('git', ['remote', 'set-head', 'origin', '--auto'], { cwd: destinationPath });
    } catch {
      // Best-effort.
    }
  }

  private defaultStartPoint(destinationPath: string, hasOrigin: boolean): string {
    if (hasOrigin && this.hasRef(destinationPath, 'refs/remotes/origin/HEAD')) {
      return 'origin/HEAD';
    }
    return this.currentBranch() ?? 'HEAD';
  }

  private checkoutRef(destinationPath: string, ref: string, commit: string): void {
    const remoteMatch = /^origin\/(.+)$/.exec(ref);
    const captured = remoteMatch?.[1];
    if (captured !== undefined) {
      const branchName = captured === 'HEAD' ? this.resolveOriginHead(destinationPath) : captured;
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

  private resolveOriginHead(destinationPath: string): string | null {
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

  private hasRemote(directory: string, name: string): boolean {
    try {
      this.processRunner.captureProgram('git', ['remote', 'get-url', name], { cwd: directory });
      return true;
    } catch {
      return false;
    }
  }

  private hasRef(directory: string, ref: string): boolean {
    try {
      this.processRunner.captureProgram('git', ['show-ref', '--verify', '--quiet', ref], { cwd: directory });
      return true;
    } catch {
      return false;
    }
  }

  private isLocalBranch(directory: string, ref: string): boolean {
    return this.hasRef(directory, `refs/heads/${ref}`);
  }

  private nameRemotes(destinationPath: string): void {
    this.processRunner.runProgram('git', ['remote', 'rename', 'origin', 'host'], { cwd: destinationPath });
    const upstream = this.originUrl();
    if (upstream) {
      this.processRunner.runProgram('git', ['remote', 'add', 'origin', upstream], { cwd: destinationPath });
    }
  }

  private originUrl(): string | null {
    try {
      return this.processRunner.captureProgram('git', ['remote', 'get-url', 'origin'], {
        cwd: this.repositoryDirectory,
      });
    } catch {
      return null;
    }
  }

  remove(destinationPath: string): void {
    fs.rmSync(destinationPath, { recursive: true, force: true });
  }

  registerHostRemote(remoteName: string, targetPath: string): void {
    try {
      this.processRunner.captureProgram('git', ['remote', 'add', remoteName, targetPath], {
        cwd: this.repositoryDirectory,
      });
    } catch {
      try {
        this.processRunner.captureProgram('git', ['remote', 'set-url', remoteName, targetPath], {
          cwd: this.repositoryDirectory,
        });
      } catch {
        // Best-effort.
      }
    }
  }

  unregisterHostRemote(remoteName: string): void {
    try {
      this.processRunner.captureProgram('git', ['remote', 'remove', remoteName], {
        cwd: this.repositoryDirectory,
      });
    } catch {
      // Best-effort.
    }
  }

  /** The branch checked out right now, or null when the clone is detached or gone. */
  currentBranch(directory: string = this.repositoryDirectory): string | null {
    try {
      const branch = this.processRunner.captureProgram('git', ['branch', '--show-current'], { cwd: directory });
      return branch.length > 0 ? branch : null;
    } catch {
      return null;
    }
  }

  unsavedBranches(directory: string): UnsavedBranch[] {
    return this.localBranches(directory)
      .map((branch) => ({ branch, commits: this.commitsOffRemotes(directory, branch) }))
      .filter((candidate) => candidate.commits > 0)
      .filter((candidate) => !this.projectHas(this.resolveIn(directory, candidate.branch)));
  }

  private localBranches(directory: string): string[] {
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

  private commitsOffRemotes(directory: string, branch: string): number {
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

  private resolveIn(directory: string, revision: string): string | null {
    try {
      return this.processRunner.captureProgram('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
        cwd: directory,
      });
    } catch {
      return null;
    }
  }

  private projectHas(commit: string | null): boolean {
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
  uncommittedPaths(directory: string): string[] {
    try {
      const listed = this.processRunner.captureProgram('git', ['status', '--porcelain'], { cwd: directory });
      return listed.length > 0 ? listed.split('\n') : [];
    } catch {
      return [];
    }
  }
}
