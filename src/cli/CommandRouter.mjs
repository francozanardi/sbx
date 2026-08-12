import { SbxError } from '../domain/SbxError.mjs';

export const HELP_TOKENS = new Set(['help', '--help', '-h']);

/** Sends a command line to the command that owns it, or prints the help page. */
export class CommandRouter {
  constructor(commandsByName, helpText) {
    this.commandsByName = commandsByName;
    this.helpText = helpText;
  }

  async route(tokens, argumentList) {
    const [commandName] = tokens;
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
    await command.execute(argumentList);
  }
}
