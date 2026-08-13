import { SbxError } from '../domain/SbxError.mjs';

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
  constructor(processRunner, terminal) {
    this.processRunner = processRunner;
    this.terminal = terminal;
  }

  run(hook, sandboxDirectory, variables) {
    this.terminal.step(`${hook.name}: ${hook.run}`);
    try {
      this.processRunner.runShell(hook.run, { cwd: sandboxDirectory, env: variables });
    } catch (error) {
      throw new SbxError(`The \`${hook.name}\` hook failed: ${error.message}`, error.hint);
    }
  }
}
