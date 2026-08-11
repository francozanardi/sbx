import { SbxError } from '../domain/SbxError.mjs';

export const HELP_TOKENS = new Set(['help', '--help', '-h']);

/** Sends a command line to the command that owns it, and prints the help text. */
export class CommandRouter {
  constructor(commandsByName, terminal) {
    this.commandsByName = commandsByName;
    this.terminal = terminal;
  }

  async route(tokens, argumentList) {
    const [commandName] = tokens;
    if (!commandName || HELP_TOKENS.has(commandName)) {
      this.printHelp();
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

  printHelp() {
    this.terminal.heading('sbx — named local sandboxes of a repository');
    this.terminal.blank();
    for (const command of this.commandsByName.values()) {
      this.terminal.info(`  ${command.usage()}`);
      this.terminal.detail(`    ${command.summary()}`);
      this.terminal.blank();
    }
  }
}
