import { spawnSync } from 'node:child_process';
import { MissingProgramError } from '../domain/MissingProgramError.mjs';
import { SbxError } from '../domain/SbxError.mjs';

/**
 * Runs child processes to completion, one at a time, with their output
 * going straight to this terminal. Commands are synchronous on purpose:
 * every step of a sandbox lifecycle depends on the previous one having
 * finished, and interleaved output from parallel steps would be unreadable.
 *
 * A non-zero exit status throws. Callers that expect failure catch it.
 */
export class ProcessRunner {
  /** Runs a program directly, without a shell, so arguments need no quoting. */
  runProgram(file, args, { cwd, env } = {}) {
    const result = spawnSync(file, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    this.throwOnFailure(result, file, [file, ...args].join(' '), 'above');
  }

  /** Runs a program and returns its stdout instead of forwarding it. */
  captureProgram(file, args, { cwd, env } = {}) {
    const result = spawnSync(file, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
    this.throwOnFailure(result, file, [file, ...args].join(' '), result.stderr);
    return result.stdout.trim();
  }

  /** Runs a command line through the user's shell, for hooks written as plain strings. */
  runShell(commandLine, { cwd, env } = {}) {
    const result = spawnSync(commandLine, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: true,
    });
    this.throwOnFailure(result, null, commandLine, 'above');
  }

  throwOnFailure(result, program, description, output) {
    if (result.error) throw this.spawnFailure(result.error, program, description);
    if (result.status === 0) return;
    throw new SbxError(`\`${description}\` exited with status ${result.status}.`, this.outputHint(output));
  }

  /**
   * A missing executable arrives as a bare ENOENT naming the syscall, which
   * says nothing about the fact that a tool has to be installed first.
   */
  spawnFailure(error, program, description) {
    if (error.code === 'ENOENT' && program) return new MissingProgramError(program);
    return new SbxError(`Could not run \`${description}\`: ${error.message}`);
  }

  outputHint(output) {
    if (output === 'above') return 'Its output is above.';
    const trimmed = typeof output === 'string' ? output.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  }
}
