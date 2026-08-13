import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface CodeCommandDeps {
  workspace: ProjectWorkspace;
  processRunner: ProcessRunner;
}

/**
 * Opens a sandbox's directory in an editor.
 *
 * The editor is `$SBX_EDITOR` (default `code`) and no sandbox environment
 * is injected.
 */
export class CodeCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly processRunner: ProcessRunner;

  constructor({ workspace, processRunner }: CodeCommandDeps) {
    this.workspace = workspace;
    this.processRunner = processRunner;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const editor = process.env.SBX_EDITOR ?? 'code';
    this.processRunner.runProgram(editor, [record.directory]);
  }
}
