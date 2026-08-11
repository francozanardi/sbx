/** Removes a sandbox and everything that belongs to it. */
export class DeleteCommand {
  constructor({ workspace, remover, terminal }) {
    this.workspace = workspace;
    this.remover = remover;
    this.terminal = terminal;
  }

  summary() {
    return 'Delete a sandbox: services, volumes, worktree, registry entry.';
  }

  usage() {
    return 'sbx delete <name> [--delete-branch]';
  }

  async execute(argumentList) {
    const name = argumentList.require(0, 'a sandbox name');
    const record = this.workspace.registry.get(name);
    this.terminal.heading(`Deleting sandbox ${name}`);
    this.remover.remove(record, { deleteBranch: argumentList.hasFlag('delete-branch') });
    if (!argumentList.hasFlag('delete-branch')) {
      this.terminal.info(`Branch ${record.branch} was kept. Delete it with \`git branch -D ${record.branch}\`.`);
    }
  }
}
