/**
 * Opens a sandbox's directory in an editor.
 *
 * The editor is `$SBX_EDITOR` (default `code`) and no sandbox environment
 * is injected. Modern editors run in single-instance mode: if one is
 * already open, this invocation only sends it an "open folder" message,
 * so any env vars set here would not reach the running process. Loading
 * env into an integrated terminal is `sbx open`'s job, run once per
 * terminal that needs the ports and credentials.
 */
export class CodeCommand {
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
