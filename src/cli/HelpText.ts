import { type Terminal } from '@/cli/Terminal.js';

interface CommandEntry {
  usage: string;
  summary: string;
}

/**
 * The top-level help output shown when sbx is invoked with no command or
 * with `help` / `--help` / `-h`.
 */
export class HelpText {
  private readonly terminal: Terminal;
  private readonly commandEntries: readonly CommandEntry[];

  constructor(terminal: Terminal) {
    this.terminal = terminal;
    this.commandEntries = [
      {
        usage: 'sbx create <name> [--branch=<branch>] [--from=<ref>] [--no-hooks]',
        summary: 'Create a sandbox: clone, port block, services, seeded data. Default: fetch origin and check out its default branch. --branch creates a local branch of that name. --from picks a starting ref. Run it from the host checkout, not from inside a sandbox.',
      },
      {
        usage: 'sbx rebuild <name> [--data | --hard] [--no-hooks]',
        summary: 'Bring an existing sandbox in line with the current project. Default: install and migrate. With --data: also reset and seed, replacing the seeded data. With --hard: also destroy services and volumes first, for cases where the database has to be rebuilt (a branch that removes a migration, drifted state).',
      },
      {
        usage: 'sbx list [--all]',
        summary: "List this project's sandboxes. With --all: every project's sandboxes on this machine, drawn from ~/.sbx. Runs from any directory when --all is given.",
      },
      { usage: 'sbx info <sandbox>', summary: 'Show a sandbox and its port block.' },
      { usage: 'sbx up <sandbox>', summary: "Start a sandbox's services." },
      { usage: 'sbx down <sandbox>', summary: "Stop a sandbox's services, keeping its data." },
      {
        usage: 'sbx run <sandbox> -- <command> [args...]',
        summary: "Run a command in a sandbox's directory and environment. Its output and exit status pass through unchanged.",
      },
      {
        usage: 'sbx open <sandbox>',
        summary: "Start an interactive subshell in a sandbox: its directory as cwd, its variables in the environment. Type `exit` to leave.",
      },
      {
        usage: 'sbx code <sandbox>   (editor from $SBX_EDITOR, default `code`)',
        summary: "Open a sandbox's directory in your editor. Env vars are not injected; run `sbx open` inside a terminal to load them.",
      },
      {
        usage: 'sbx delete <sandbox> [--force]',
        summary: 'Delete a sandbox: services, volumes, clone, host remote, registry entry. Refuses while it holds unsaved work.',
      },
      { usage: 'sbx doctor', summary: 'Check this project for anything that would break `sbx create`.' },
      { usage: 'sbx init', summary: 'Write a starting sandbox.config.json into this project.' },
    ];
  }

  print(): void {
    this.printPitch();
    this.printGettingStarted();
    this.printCommands();
    this.printEnvironment();
    this.printReadMore();
  }

  private printPitch(): void {
    this.terminal.heading('sbx — several copies of your project on one machine, running side by side.');
    this.terminal.blank();
    this.terminal.info('Made for running coding agents in parallel. One sandbox per agent, each with');
    this.terminal.info('its own clone of the repository, port block, services and data.');
    this.terminal.blank();
  }

  private printGettingStarted(): void {
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

  private printCommands(): void {
    this.terminal.heading('Commands');
    for (const entry of this.commandEntries) {
      this.terminal.info(`  ${entry.usage}`);
      this.terminal.detail(`    ${entry.summary}`);
      this.terminal.blank();
    }
    this.terminal.detail('  <sandbox> is `<name>` or `<project>/<name>`. Bare names resolve to the current project;');
    this.terminal.detail('  the qualified form works from any directory and disambiguates when the name is shared.');
    this.terminal.blank();
  }

  private printEnvironment(): void {
    this.terminal.heading('Environment');
    this.terminal.info('  SBX_EDITOR    Editor invoked by `sbx code` (default: code).');
    this.terminal.info('  SBX_DEBUG=1   Include stack traces in error output.');
    this.terminal.blank();
  }

  private printReadMore(): void {
    this.terminal.heading('Read more');
    this.terminal.info('  https://github.com/francozanardi/sbx');
  }
}
