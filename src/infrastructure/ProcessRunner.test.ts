import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MissingProgramError } from '@/domain/MissingProgramError.js';
import { SbxError } from '@/domain/SbxError.js';
import { ProcessRunner } from '@/infrastructure/ProcessRunner.js';

const runner = new ProcessRunner();
const missingDirectory = path.join(os.tmpdir(), 'sbx-does-not-exist-4f2a9c');

describe('ProcessRunner — failures that look alike', () => {
  it('reports a missing program as one that has to be installed', () => {
    expect(() => runner.captureProgram('sbx-not-a-real-program', [])).toThrow(MissingProgramError);
  });

  /**
   * Both cases arrive as an identical ENOENT — same code, same syscall,
   * same path — so nothing but an explicit check can tell them apart.
   */
  it('reports a missing working directory as itself, not as a missing program', () => {
    expect(() => runner.captureProgram('node', ['--version'], { cwd: missingDirectory })).toThrow(SbxError);
    expect(() => runner.captureProgram('node', ['--version'], { cwd: missingDirectory })).not.toThrow(
      MissingProgramError,
    );
    expect(() => runner.captureProgram('node', ['--version'], { cwd: missingDirectory })).toThrow(/does not exist/);
  });
});

describe('ProcessRunner — exit statuses', () => {
  it('throws on a non-zero status, quoting the command', () => {
    expect(() => runner.captureProgram('node', ['-e', 'process.exit(3)'])).toThrow(/exited with status 3/);
  });

  it('forwardProgram hands the status back instead of throwing', () => {
    expect(runner.forwardProgram('node', ['-e', 'process.exit(42)'])).toBe(42);
    expect(runner.forwardProgram('node', ['-e', ''])).toBe(0);
  });

  it('forwardProgram reports a signalled child the way a shell does', () => {
    const status = runner.forwardProgram('node', ['-e', 'process.kill(process.pid, "SIGTERM")']);
    expect(status).toBe(128 + os.constants.signals.SIGTERM);
  });

  it('forwardProgram still throws when the program could not start', () => {
    expect(() => runner.forwardProgram('sbx-not-a-real-program', [])).toThrow(MissingProgramError);
  });
});

describe('ProcessRunner — environment', () => {
  it('adds the given variables to the inherited environment', () => {
    const output = runner.captureProgram('node', ['-e', 'process.stdout.write(process.env.SBX_TEST_VALUE ?? "")'], {
      env: { SBX_TEST_VALUE: 'present' },
    });
    expect(output).toBe('present');
  });
});
