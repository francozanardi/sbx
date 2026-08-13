import { spawnSync } from 'node:child_process';

/**
 * Spawns an interactive subshell inside a sandbox, with its directory as
 * the working directory and its environment already loaded.
 *
 * A subshell is used rather than modifying the caller's shell because a
 * process cannot change its parent's cwd or environment. The subshell
 * inherits stdio, so from the user's point of view it is their shell,
 * with the sandbox already active; `exit` (or Ctrl-D) returns them to
 * where they were.
 */
export class OpenCommand {
  constructor({ workspace, terminal }) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const variables = this.workspace.environmentFor(record);
    const shell = process.env.SHELL || '/bin/bash';
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
