import { SbxError } from '@/domain/SbxError.js';
import { type Terminal } from '@/cli/Terminal.js';

/**
 * Prints a failure as the last thing a command does.
 *
 * The split that matters to a reader is whether the tool anticipated this:
 * an anticipated failure is a statement about their project, and comes with
 * something to do about it. Anything else is a defect in the tool, and
 * saying so stops a reader from hunting for a mistake they did not make.
 */
export class ErrorReporter {
  private readonly terminal: Terminal;
  private readonly stacksEnabled: boolean;

  constructor(terminal: Terminal, stacksEnabled: boolean) {
    this.terminal = terminal;
    this.stacksEnabled = stacksEnabled;
  }

  report(error: unknown): void {
    if (error instanceof SbxError) {
      this.terminal.error(error.message);
      if (error.hint) this.terminal.errorHint(error.hint);
    } else {
      this.terminal.error(`unexpected failure: ${this.messageOf(error)}`);
      this.terminal.errorHint('This is a defect in sbx rather than a problem with your project.');
      if (!this.stacksEnabled) this.terminal.errorHint('Re-run with SBX_DEBUG=1 to see where it came from.');
    }
    if (this.stacksEnabled && error instanceof Error && error.stack) {
      this.terminal.errorHint(error.stack);
    }
  }

  private messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
