import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { SandboxReporter } from '@/cli/SandboxReporter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface UpCommandDeps {
  resolver: SandboxResolver;
  terminal: Terminal;
}

/** Starts a sandbox's stateful services and waits until they are healthy. */
export class UpCommand implements Command {
  readonly flags = [] as const;

  private readonly resolver: SandboxResolver;
  private readonly terminal: Terminal;

  constructor({ resolver, terminal }: UpCommandDeps) {
    this.resolver = resolver;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const { workspace, record } = this.resolver.resolveOrEnclosing(argumentList.at(0));
    if (!workspace.manifest.composeFile()) {
      this.terminal.info('This project declares no services. Nothing to start.');
      return;
    }
    this.terminal.heading(`Starting services for ${record.name}`);
    workspace.composeStackFor(record).start(workspace.environmentFor(record));
    this.terminal.blank();
    new SandboxReporter(workspace, this.terminal).describe(record);
  }
}
