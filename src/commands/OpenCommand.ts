import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';
import { type EnvMap, type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface OpenCommandDeps {
  resolver: SandboxResolver;
  processRunner: ProcessRunner;
  terminal: Terminal;
}

/**
 * Spawns an interactive subshell inside a sandbox, with its directory as
 * the working directory and its environment already loaded.
 *
 * The shell's exit status becomes sbx's own, so `exit 1` from inside a
 * sandbox reads the same as it does from any other shell.
 *
 * A manifest that fails to yield a full environment (for example, one
 * with a malformed `ports.env` entry) does not block the shell: the
 * point of `sbx open` is to give you a place to fix problems from, and
 * an interactive shell is the least useful thing to withhold when
 * things are broken. The shell inherits the parent environment instead
 * and a warning names what could not be loaded.
 */
export class OpenCommand implements Command {
  readonly flags = [] as const;

  private readonly resolver: SandboxResolver;
  private readonly processRunner: ProcessRunner;
  private readonly terminal: Terminal;

  constructor({ resolver, processRunner, terminal }: OpenCommandDeps) {
    this.resolver = resolver;
    this.processRunner = processRunner;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const { workspace, record } = this.resolver.resolveOrEnclosing(argumentList.at(0));
    const shell = process.env.SHELL ?? '/bin/bash';
    this.terminal.info(`Entering ${record.name}. Type \`exit\` to leave.`);
    const env = this.buildEnvOrWarn(() => workspace.environmentFor(record));
    const options = env ? { cwd: record.directory, env } : { cwd: record.directory };
    process.exitCode = this.processRunner.forwardProgram(shell, [], options);
  }

  private buildEnvOrWarn(build: () => EnvMap): EnvMap | null {
    try {
      return build();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.terminal.warn(`Sandbox variables could not be loaded: ${message}`);
      this.terminal.warn('Opening the shell without them so you can fix the manifest.');
      return null;
    }
  }
}
