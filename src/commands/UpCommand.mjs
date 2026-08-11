/** Starts a sandbox's stateful services and waits until they are healthy. */
export class UpCommand {
  constructor({ workspace, reporter, terminal }) {
    this.workspace = workspace;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  summary() {
    return "Start a sandbox's services.";
  }

  usage() {
    return 'sbx up <name>';
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    if (!this.workspace.manifest.composeFile()) {
      this.terminal.info('This project declares no services. Nothing to start.');
      return;
    }
    this.terminal.heading(`Starting services for ${record.name}`);
    this.workspace.composeStackFor(record).start(this.workspace.environmentFor(record));
    this.terminal.blank();
    this.reporter.describe(record);
  }
}
