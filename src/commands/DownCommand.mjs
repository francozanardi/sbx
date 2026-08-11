/** Stops a sandbox's services, keeping their data for the next start. */
export class DownCommand {
  constructor({ workspace, terminal }) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  summary() {
    return "Stop a sandbox's services, keeping its data.";
  }

  usage() {
    return 'sbx down <name>';
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    if (!this.workspace.manifest.composeFile()) {
      this.terminal.info('This project declares no services. Nothing to stop.');
      return;
    }
    this.terminal.heading(`Stopping services for ${record.name}`);
    this.workspace.composeStackFor(record).stop(this.workspace.environmentFor(record));
  }
}
