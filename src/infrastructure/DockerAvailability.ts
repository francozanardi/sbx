import { MissingProgramError } from '@/domain/MissingProgramError.js';
import { SbxError } from '@/domain/SbxError.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

/**
 * Confirms Docker can actually be used before a command depends on it.
 *
 * Without this, a stopped daemon surfaces as a Compose command exiting
 * non-zero somewhere in the middle of creating a sandbox — after a clone
 * exists, and with the real explanation buried in the output of a step the
 * reader did not ask about.
 *
 * The answer is cached: the daemon does not stop mid-command, and the probe
 * is not free.
 */
export class DockerAvailability {
  private readonly processRunner: ProcessRunner;
  private confirmed = false;

  constructor(processRunner: ProcessRunner) {
    this.processRunner = processRunner;
  }

  /** @throws when Docker is missing or its daemon is not answering. */
  assertReady(): void {
    if (this.confirmed) return;
    try {
      this.processRunner.captureProgram('docker', ['version', '--format', '{{.Server.Version}}']);
    } catch (error) {
      throw this.explain(error);
    }
    this.confirmed = true;
  }

  private explain(error: unknown): SbxError {
    if (error instanceof MissingProgramError) {
      return new SbxError(
        'Docker is not installed, or not on PATH.',
        'This project declares services in its manifest. Install Docker, or remove `compose` from sandbox.config.json.',
      );
    }
    return new SbxError(
      'Docker is installed but its daemon is not answering.',
      'Start it (`systemctl --user start docker` for rootless, `sudo systemctl start docker` otherwise) and run this again.',
    );
  }
}
