import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { SandboxReporter } from '@/cli/SandboxReporter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface InfoCommandDeps {
  resolver: SandboxResolver;
  terminal: Terminal;
}

/** Shows one sandbox in full: its identity and the port each role got. */
export class InfoCommand implements Command {
  readonly flags = [] as const;

  private readonly resolver: SandboxResolver;
  private readonly terminal: Terminal;

  constructor({ resolver, terminal }: InfoCommandDeps) {
    this.resolver = resolver;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const { workspace, record } = this.resolver.resolveOrEnclosing(argumentList.at(0));
    new SandboxReporter(workspace, this.terminal).describe(record);
  }
}
