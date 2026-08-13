import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type SandboxReporter } from '@/cli/SandboxReporter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface UpCommandDeps {
  workspace: ProjectWorkspace;
  reporter: SandboxReporter;
  terminal: Terminal;
}

/** Starts a sandbox's stateful services and waits until they are healthy. */
export class UpCommand implements Command {
  readonly flags = [] as const;

  private readonly workspace: ProjectWorkspace;
  private readonly reporter: SandboxReporter;
  private readonly terminal: Terminal;

  constructor({ workspace, reporter, terminal }: UpCommandDeps) {
    this.workspace = workspace;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.requireSandbox(argumentList.require(0, 'a sandbox name'));
    if (!this.workspace.manifest.composeFile()) {
      this.terminal.info('This project declares no services. Nothing to start.');
      return;
    }
    this.terminal.heading(`Starting services for ${record.name}`);
    this.workspace.composeStackFor(record).start(this.workspace.environmentFor(record));
    this.terminal.blank();
    this.reporter.describe(record);
  }
}
