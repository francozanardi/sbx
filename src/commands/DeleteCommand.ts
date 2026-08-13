import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type SandboxRemover } from '@/application/SandboxRemover.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface DeleteCommandDeps {
  workspace: ProjectWorkspace;
  remover: SandboxRemover;
  terminal: Terminal;
}

/** Removes a sandbox and everything that belongs to it. */
export class DeleteCommand implements Command {
  readonly flags = ['force'] as const;

  private readonly workspace: ProjectWorkspace;
  private readonly remover: SandboxRemover;
  private readonly terminal: Terminal;

  constructor({ workspace, remover, terminal }: DeleteCommandDeps) {
    this.workspace = workspace;
    this.remover = remover;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    this.workspace.requireHostCheckout('deleting a sandbox');
    const name = argumentList.require(0, 'a sandbox name');
    const record = this.workspace.registry.get(name);
    this.terminal.heading(`Deleting sandbox ${name}`);
    this.remover.remove(record, { force: argumentList.hasFlag('force') });
  }
}
