/** Brings an existing sandbox up to date with the project as it stands now. */
export class SyncCommand {
  constructor({ workspace, synchronizer, reporter, terminal }) {
    this.workspace = workspace;
    this.synchronizer = synchronizer;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    this.terminal.heading(`Syncing sandbox ${record.name}`);
    this.synchronizer.sync(record, { runHooks: !argumentList.hasFlag('no-hooks') });
    this.terminal.blank();
    this.reporter.describe(record);
  }
}
