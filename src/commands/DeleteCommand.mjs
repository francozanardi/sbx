/** Removes a sandbox and everything that belongs to it. */
export class DeleteCommand {
  constructor({ workspace, remover, terminal }) {
    this.workspace = workspace;
    this.remover = remover;
    this.terminal = terminal;
  }

  async execute(argumentList) {
    const name = argumentList.require(0, 'a sandbox name');
    const record = this.workspace.registry.get(name);
    this.terminal.heading(`Deleting sandbox ${name}`);
    this.remover.remove(record, { force: argumentList.hasFlag('force') });
  }
}
