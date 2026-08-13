import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface OpenCommandDeps {
  workspace: ProjectWorkspace;
  processRunner: ProcessRunner;
  terminal: Terminal;
}

/**
 * Spawns an interactive subshell inside a sandbox, with its directory as
 * the working directory and its environment already loaded.
 *
 * The shell's exit status becomes sbx's own, so `exit 1` from inside a
 * sandbox reads the same as it does from any other shell.
 */
export class OpenCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly processRunner: ProcessRunner;
  private readonly terminal: Terminal;

  constructor({ workspace, processRunner, terminal }: OpenCommandDeps) {
    this.workspace = workspace;
    this.processRunner = processRunner;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const shell = process.env.SHELL ?? '/bin/bash';
    this.terminal.info(`Entering ${record.name}. Type \`exit\` to leave.`);
    process.exitCode = this.processRunner.forwardProgram(shell, [], {
      cwd: record.directory,
      env: this.workspace.environmentFor(record),
    });
  }
}
