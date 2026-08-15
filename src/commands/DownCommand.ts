import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface DownCommandDeps {
  resolver: SandboxResolver;
  terminal: Terminal;
}

/** Stops a sandbox's services, keeping their data for the next start. */
export class DownCommand implements Command {
  readonly flags = [] as const;

  private readonly resolver: SandboxResolver;
  private readonly terminal: Terminal;

  constructor({ resolver, terminal }: DownCommandDeps) {
    this.resolver = resolver;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const { workspace, record } = this.resolver.resolveOrEnclosing(argumentList.at(0));
    if (!workspace.manifest.composeFile()) {
      this.terminal.info('This project declares no services. Nothing to stop.');
      return;
    }
    this.terminal.heading(`Stopping services for ${record.name}`);
    workspace.composeStackFor(record).stop(workspace.environmentFor(record));
  }
}
