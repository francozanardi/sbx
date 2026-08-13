import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { SbxError } from '@/domain/SbxError.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface RunCommandDeps {
  workspace: ProjectWorkspace;
  processRunner: ProcessRunner;
}

/**
 * Runs a command inside a sandbox: from its directory, with its port block
 * and credentials in the environment.
 */
export class RunCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly processRunner: ProcessRunner;

  constructor({ workspace, processRunner }: RunCommandDeps) {
    this.workspace = workspace;
    this.processRunner = processRunner;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const [program, ...programArguments] = argumentList.passthrough;
    if (!program) {
      throw new SbxError('Missing the command to run.', 'Put it after `--`, as in `sbx run sb-1 -- npm run dev`.');
    }
    this.processRunner.runProgram(program, programArguments, {
      cwd: record.directory,
      env: this.workspace.environmentFor(record),
    });
  }
}
