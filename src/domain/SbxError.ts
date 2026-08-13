/**
 * A failure this tool anticipated and can explain. Anything thrown that is
 * not one of these is a bug, and is reported as such rather than dressed up
 * as advice — the difference tells a reader whether to change what they did
 * or to fix the tool.
 *
 * `message` says what went wrong. `hint` says what to do about it, and is
 * printed on its own line, so neither has to carry both jobs.
 */
export class SbxError extends Error {
  readonly hint: string | null;

  constructor(message: string, hint: string | null = null) {
    super(message);
    this.name = 'SbxError';
    this.hint = hint;
  }
}
