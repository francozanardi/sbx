/** Shows every sandbox of the current project and whether its services are up. */
export class ListCommand {
  constructor({ workspace, terminal }) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  async execute() {
    const records = this.workspace.registry.list().sort((left, right) => left.slot - right.slot);
    if (records.length === 0) {
      this.terminal.info('No sandboxes yet. Create one with `sbx create <name>`.');
      return;
    }
    this.terminal.table(
      ['name', 'slot', 'branch', 'services', 'directory'],
      records.map((record) => [
        record.name,
        record.slot,
        this.workspace.branchOf(record) ?? '(detached)',
        this.describeServices(record),
        record.directory,
      ]),
    );
  }

  /**
   * Reporting the service state must never be the reason listing fails —
   * a stopped Docker daemon should still let the user see what exists.
   */
  describeServices(record) {
    if (!this.workspace.manifest.composeFile()) return '-';
    try {
      const running = this.workspace.composeStackFor(record).runningServices(this.workspace.environmentFor(record));
      return running.length === 0 ? 'down' : `up (${running.length})`;
    } catch {
      return 'unknown';
    }
  }
}
