/** Shows one sandbox in full: its identity and the port each role got. */
export class InfoCommand {
  constructor({ workspace, reporter }) {
    this.workspace = workspace;
    this.reporter = reporter;
  }

  summary() {
    return 'Show a sandbox and its port block.';
  }

  usage() {
    return 'sbx info <name>';
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    this.reporter.describe(record);
  }
}
