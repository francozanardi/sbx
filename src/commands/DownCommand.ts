import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface DownCommandDeps {
  workspace: ProjectWorkspace;
  terminal: Terminal;
}

/** Stops a sandbox's services, keeping their data for the next start. */
export class DownCommand implements Command {
  readonly flags = [] as const;

  private readonly workspace: ProjectWorkspace;
  private readonly terminal: Terminal;

  constructor({ workspace, terminal }: DownCommandDeps) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.requireSandbox(argumentList.require(0, 'a sandbox name'));
    if (!this.workspace.manifest.composeFile()) {
      this.terminal.info('This project declares no services. Nothing to stop.');
      return;
    }
    this.terminal.heading(`Stopping services for ${record.name}`);
    this.workspace.composeStackFor(record).stop(this.workspace.environmentFor(record));
  }
}
