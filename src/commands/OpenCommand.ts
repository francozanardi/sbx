import { spawnSync } from 'node:child_process';
import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface OpenCommandDeps {
  workspace: ProjectWorkspace;
  terminal: Terminal;
}

/**
 * Spawns an interactive subshell inside a sandbox, with its directory as
 * the working directory and its environment already loaded.
 */
export class OpenCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly terminal: Terminal;

  constructor({ workspace, terminal }: OpenCommandDeps) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const variables = this.workspace.environmentFor(record);
    const shell = process.env.SHELL ?? '/bin/bash';
    this.terminal.info(`Entering ${record.name}. Type \`exit\` to leave.`);
    const result = spawnSync(shell, [], {
      cwd: record.directory,
      env: { ...process.env, ...variables },
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (typeof result.status === 'number' && result.status !== 0) {
      process.exitCode = result.status;
    }
  }
}
