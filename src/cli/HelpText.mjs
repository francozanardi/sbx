/**
 * The top-level help output shown when sbx is invoked with no command or
 * with `help` / `--help` / `-h`.
 *
 * Rich enough that a first-time human learns what sbx is, how to start,
 * and where to read more; rich enough that an agent knows the setup and
 * daily-use guides live in dedicated skills, not in this listing.
 */
export class HelpText {
  constructor(terminal) {
    this.terminal = terminal;
    this.commandEntries = [
      {
        usage: 'sbx create <name> [--branch=<branch>] [--from=<ref>] [--no-hooks]',
        summary: 'Create a sandbox: clone, port block, services, seeded data.',
      },
      {
        usage: 'sbx sync <name> [--no-hooks]',
        summary: 'Bring an existing sandbox up to date: re-render its env files, start its services, re-run install and migrate.',
      },
      { usage: 'sbx list', summary: 'List the sandboxes of this project.' },
      { usage: 'sbx info <name>', summary: 'Show a sandbox and its port block.' },
      { usage: 'sbx up <name>', summary: "Start a sandbox's services." },
      { usage: 'sbx down <name>', summary: "Stop a sandbox's services, keeping its data." },
      { usage: 'sbx seed <name> [--reset]', summary: 'Seed a sandbox. With --reset, wipe its data first.' },
      {
        usage: 'sbx run <name> -- <command> [args...]',
        summary: "Run a command in a sandbox's directory and environment.",
      },
      { usage: 'sbx env <name>', summary: "Print a sandbox's variables as shell exports." },
      {
        usage: 'sbx open <name>   (editor from $SBX_EDITOR, default `code`)',
        summary: "Open a sandbox's directory in your editor.",
      },
      {
        usage: 'sbx delete <name> [--force]',
        summary: 'Delete a sandbox: services, volumes, clone, registry entry. Refuses while it holds unsaved work.',
      },
      { usage: 'sbx doctor', summary: 'Check this project for anything that would break `sbx create`.' },
      { usage: 'sbx init', summary: 'Write a starting sandbox.config.json into this project.' },
    ];
  }

  print() {
    this.printPitch();
    this.printGettingStarted();
    this.printCommands();
    this.printEnvironment();
    this.printReadMore();
  }

  printPitch() {
    this.terminal.heading('sbx — several copies of your project on one machine, running side by side.');
    this.terminal.blank();
    this.terminal.info('Made for running coding agents in parallel. One sandbox per agent, each with');
    this.terminal.info('its own clone of the repository, port block, services and data.');
    this.terminal.blank();
  }

  printGettingStarted() {
    this.terminal.heading('Getting started');
    this.terminal.info('  Inside a repository:');
    this.terminal.info('    sbx init      Write a starting sandbox.config.json here.');
    this.terminal.info('    sbx doctor    Report what would still break `sbx create`.');
    this.terminal.blank();
    this.terminal.info('  For agents, install the guides that cover setup and daily use:');
    this.terminal.info('    npx skills add francozanardi/sbx');
    this.terminal.info('  Then ask the agent: "set up sbx on this project", or');
    this.terminal.info('  "work in sandbox <name>" once one exists.');
    this.terminal.blank();
  }

  printCommands() {
    this.terminal.heading('Commands');
    for (const entry of this.commandEntries) {
      this.terminal.info(`  ${entry.usage}`);
      this.terminal.detail(`    ${entry.summary}`);
      this.terminal.blank();
    }
  }

  printEnvironment() {
    this.terminal.heading('Environment');
    this.terminal.info('  SBX_EDITOR    Editor invoked by `sbx open` (default: code).');
    this.terminal.info('  SBX_DEBUG=1   Include stack traces in error output.');
    this.terminal.blank();
  }

  printReadMore() {
    this.terminal.heading('Read more');
    this.terminal.info('  https://github.com/francozanardi/sbx');
  }
}
