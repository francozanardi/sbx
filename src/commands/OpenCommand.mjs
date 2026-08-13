/** Opens a sandbox's directory in an editor. */
export class OpenCommand {
  constructor({ workspace, processRunner }) {
    this.workspace = workspace;
    this.processRunner = processRunner;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const editor = process.env.SBX_EDITOR ?? 'code';
    this.processRunner.runProgram(editor, [record.directory]);
  }
}
