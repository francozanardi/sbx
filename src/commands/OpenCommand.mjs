/** Opens a sandbox's worktree in an editor. */
export class OpenCommand {
  constructor({ workspace, processRunner }) {
    this.workspace = workspace;
    this.processRunner = processRunner;
  }

  summary() {
    return "Open a sandbox's worktree in your editor.";
  }

  usage() {
    return 'sbx open <name>   (editor from $SBX_EDITOR, default `code`)';
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const editor = process.env.SBX_EDITOR ?? 'code';
    this.processRunner.runProgram(editor, [record.worktree]);
  }
}
