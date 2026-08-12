import { SbxError } from '../domain/SbxError.mjs';

/**
 * Runs a command inside a sandbox: from its worktree, with its port block
 * and credentials in the environment.
 *
 * This is how the project's own dev commands reach a sandbox — they read
 * the ports from the environment and need no flags of their own.
 */
export class RunCommand {
  constructor({ workspace, processRunner }) {
    this.workspace = workspace;
    this.processRunner = processRunner;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const [program, ...programArguments] = argumentList.passthrough;
    if (!program) {
      throw new SbxError('Missing the command to run.', 'Put it after `--`, as in `sbx run sb-1 -- npm run dev`.');
    }
    this.processRunner.runProgram(program, programArguments, {
      cwd: record.worktree,
      env: this.workspace.environmentFor(record),
    });
  }
}
