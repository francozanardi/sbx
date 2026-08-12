/** Shows one sandbox in full: its identity and the port each role got. */
export class InfoCommand {
  constructor({ workspace, reporter }) {
    this.workspace = workspace;
    this.reporter = reporter;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    this.reporter.describe(record);
  }
}
