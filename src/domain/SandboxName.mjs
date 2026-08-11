import { SbxError } from './SbxError.mjs';

const ALLOWED = /^[a-z0-9][a-z0-9-]{0,30}$/;

/**
 * Identifier a sandbox is addressed by. The character set is the
 * intersection of what a Docker Compose project name, a git branch and a
 * directory name all accept, so one string can safely become all three.
 */
export class SandboxName {
  /** @throws if the value cannot be used as a compose project, branch and directory name at once. */
  constructor(value) {
    if (typeof value !== 'string' || !ALLOWED.test(value)) {
      throw new SbxError(
        `Invalid sandbox name "${value}".`,
        'Use lowercase letters, digits and dashes, starting with a letter or digit, up to 31 characters — the intersection of what a Compose project, a git branch and a directory all accept.',
      );
    }
    this.value = value;
  }

  toString() {
    return this.value;
  }
}
