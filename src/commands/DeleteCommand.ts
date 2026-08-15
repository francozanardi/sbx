import { SandboxRemover } from '@/application/SandboxRemover.js';
import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface DeleteCommandDeps {
  resolver: SandboxResolver;
  terminal: Terminal;
}

/** Removes a sandbox and everything that belongs to it. */
export class DeleteCommand implements Command {
  readonly flags = ['force'] as const;

  private readonly resolver: SandboxResolver;
  private readonly terminal: Terminal;

  constructor({ resolver, terminal }: DeleteCommandDeps) {
    this.resolver = resolver;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const spec = argumentList.require(0, 'a sandbox name');
    const { projectName, record, workspace, hostClones, hostMissing } = this.resolver.resolve(spec, { requireClone: false });
    this.terminal.heading(`Deleting sandbox ${projectName}/${record.name}`);
    if (hostMissing) {
      this.terminal.warn(`Host clone of "${projectName}" is not reachable — the host git remote will not be unregistered.`);
    }
    const remover = new SandboxRemover({ workspace, clones: hostClones, terminal: this.terminal });
    remover.remove(record, { force: argumentList.hasFlag('force') });
  }
}
