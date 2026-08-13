import { SbxError } from '@/domain/SbxError.js';

const ALLOWED = /^[a-z0-9][a-z0-9-]{0,30}$/;

/**
 * Identifier a sandbox is addressed by. The character set is the
 * intersection of what a Docker Compose project name, a git branch and a
 * directory name all accept, so one string can safely become all three.
 */
export class SandboxName {
  readonly value: string;

  /** @throws if the value cannot be used as a compose project, branch and directory name at once. */
  constructor(value: unknown) {
    if (typeof value !== 'string' || !ALLOWED.test(value)) {
      throw new SbxError(
        `Invalid sandbox name "${String(value)}".`,
        'Use lowercase letters, digits and dashes, starting with a letter or digit, up to 31 characters — the intersection of what a Compose project, a git branch and a directory all accept.',
      );
    }
    this.value = value;
  }

  toString(): string {
    return this.value;
  }
}
