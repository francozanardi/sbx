import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { MissingProgramError } from '@/domain/MissingProgramError.js';
import { SbxError } from '@/domain/SbxError.js';

export type EnvMap = Record<string, string>;

export interface RunOptions {
  cwd?: string;
  env?: EnvMap;
}

interface SpawnResultLike {
  error?: NodeJS.ErrnoException | Error | undefined;
  status: number | null;
  signal?: NodeJS.Signals | null;
}

/**
 * Runs child processes to completion, one at a time, with their output
 * going straight to this terminal. Commands are synchronous on purpose:
 * every step of a sandbox lifecycle depends on the previous one having
 * finished, and interleaved output from parallel steps would be unreadable.
 *
 * A non-zero exit status throws, except in `forwardProgram`, which hands
 * the status back for a caller whose whole job is to relay it.
 */
export class ProcessRunner {
  /** Runs a program directly, without a shell, so arguments need no quoting. */
  runProgram(file: string, args: readonly string[], { cwd, env }: RunOptions = {}): void {
    this.assertWorkingDirectory(cwd);
    const result = spawnSync(file, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    this.throwOnFailure(result, file, this.describe(file, args), 'above');
  }

  /**
   * Runs a program and returns its exit status rather than throwing on a
   * non-zero one, so a caller acting as a transparent wrapper can relay it.
   * A program that could not be started at all still throws — that is a
   * failure of the wrapper, not a result of the wrapped command.
   */
  forwardProgram(file: string, args: readonly string[], { cwd, env }: RunOptions = {}): number {
    this.assertWorkingDirectory(cwd);
    const result = spawnSync(file, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    if (result.error) throw this.spawnFailure(result.error, file, this.describe(file, args));
    return this.exitCodeOf(result);
  }

  /** Runs a program and returns its stdout instead of forwarding it. */
  captureProgram(file: string, args: readonly string[], { cwd, env }: RunOptions = {}): string {
    this.assertWorkingDirectory(cwd);
    const result = spawnSync(file, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    this.throwOnFailure(result, file, this.describe(file, args), result.stderr);
    return result.stdout.trim();
  }

  /** Runs a command line through the user's shell, for hooks written as plain strings. */
  runShell(commandLine: string, { cwd, env }: RunOptions = {}): void {
    this.assertWorkingDirectory(cwd);
    const result = spawnSync(commandLine, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: true,
    });
    this.throwOnFailure(result, null, commandLine, 'above');
  }

  /**
   * A command whose working directory is gone fails with the same bare
   * ENOENT a missing executable does, and the error object cannot tell the
   * two apart — same code, same syscall, same path. Left alone, a sandbox
   * whose clone was deleted behind sbx's back reports that `git`, or
   * whatever the hook invoked, is not installed.
   */
  private assertWorkingDirectory(cwd: string | undefined): void {
    if (cwd === undefined || fs.existsSync(cwd)) return;
    throw new SbxError(
      `The working directory ${cwd} does not exist, so nothing can run there.`,
      'If this is a sandbox, its clone was removed outside sbx. `sbx delete <name> --force` drops the stale entry, then create it again.',
    );
  }

  private describe(file: string, args: readonly string[]): string {
    return [file, ...args].join(' ');
  }

  private exitCodeOf(result: SpawnResultLike): number {
    if (typeof result.status === 'number') return result.status;
    const signal = result.signal;
    if (signal) return 128 + os.constants.signals[signal];
    return 1;
  }

  private throwOnFailure(
    result: SpawnResultLike,
    program: string | null,
    description: string,
    output: string | undefined,
  ): void {
    if (result.error) throw this.spawnFailure(result.error, program, description);
    if (result.status === 0) return;
    throw new SbxError(
      `\`${description}\` exited with status ${String(result.status)}.`,
      this.outputHint(output),
    );
  }

  /**
   * A missing executable arrives as a bare ENOENT naming the syscall, which
   * says nothing about the fact that a tool has to be installed first.
   */
  private spawnFailure(error: NodeJS.ErrnoException | Error, program: string | null, description: string): SbxError {
    if ('code' in error && error.code === 'ENOENT' && program) return new MissingProgramError(program);
    return new SbxError(`Could not run \`${description}\`: ${error.message}`);
  }

  private outputHint(output: string | undefined): string | null {
    if (output === 'above') return 'Its output is above.';
    const trimmed = typeof output === 'string' ? output.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  }
}
