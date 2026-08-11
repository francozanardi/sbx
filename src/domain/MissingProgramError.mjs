import { SbxError } from './SbxError.mjs';

/**
 * An external program the tool depends on is not installed. Distinct from a
 * program that ran and failed, because the remedy is different and callers
 * that know what the program is for can say something more useful than the
 * generic message.
 */
export class MissingProgramError extends SbxError {
  constructor(program) {
    super(`\`${program}\` is not installed, or not on PATH.`, 'Install it, or fix PATH, then run this again.');
    this.name = 'MissingProgramError';
    this.program = program;
  }
}
