import { SbxError } from '@/domain/SbxError.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type HelpText } from '@/cli/HelpText.js';

export const HELP_TOKENS = new Set(['help', '--help', '-h']);

export interface Command {
  /**
   * Flags this command accepts, without the leading `--`. Declared here
   * rather than read ad hoc so that anything else on the command line is
   * refused centrally, and no command can forget to.
   */
  readonly flags: readonly string[];
  execute(argumentList: ArgumentList): Promise<void> | void;
}

/** Sends a command line to the command that owns it, or prints the help page. */
export class CommandRouter {
  private readonly commandsByName: ReadonlyMap<string, Command>;
  private readonly helpText: HelpText;

  constructor(commandsByName: ReadonlyMap<string, Command>, helpText: HelpText) {
    this.commandsByName = commandsByName;
    this.helpText = helpText;
  }

  async route(tokens: readonly string[], argumentList: ArgumentList): Promise<void> {
    const commandName = tokens[0];
    if (!commandName || HELP_TOKENS.has(commandName)) {
      this.helpText.print();
      return;
    }
    const command = this.commandsByName.get(commandName);
    if (!command) {
      throw new SbxError(
        `Unknown command "${commandName}".`,
        `Known commands: ${[...this.commandsByName.keys()].join(', ')}.`,
      );
    }
    argumentList.rejectUnknownFlags(commandName, command.flags);
    await command.execute(argumentList);
  }
}
