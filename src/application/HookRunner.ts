import { type Hook } from '@/domain/ProjectManifest.js';
import { SbxError } from '@/domain/SbxError.js';
import { type EnvMap, type ProcessRunner } from '@/infrastructure/ProcessRunner.js';
import { type Terminal } from '@/cli/Terminal.js';

/**
 * Runs one lifecycle hook: the shell command a project declared under
 * some name and phase, executed from the sandbox's clone with the
 * sandbox's variables in the environment.
 *
 * A hook that exits non-zero is fatal to whatever operation invoked it,
 * because a failed install means dependencies are wrong and a failed
 * migrate means the schema is wrong, and there is no useful "the rest
 * of the sandbox is fine" state to fall back to.
 */
export class HookRunner {
  private readonly processRunner: ProcessRunner;
  private readonly terminal: Terminal;

  constructor(processRunner: ProcessRunner, terminal: Terminal) {
    this.processRunner = processRunner;
    this.terminal = terminal;
  }

  run(hook: Hook, sandboxDirectory: string, variables: EnvMap): void {
    this.terminal.step(`${hook.name}: ${hook.run}`);
    try {
      this.processRunner.runShell(hook.run, { cwd: sandboxDirectory, env: variables });
    } catch (error) {
      const hint = error instanceof SbxError ? error.hint : null;
      const message = error instanceof Error ? error.message : String(error);
      throw new SbxError(`The \`${hook.name}\` hook failed: ${message}`, hint);
    }
  }
}
