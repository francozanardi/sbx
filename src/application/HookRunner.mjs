import { SbxError } from '../domain/SbxError.mjs';

/**
 * Runs a project's lifecycle hooks inside a sandbox: the commands that
 * install dependencies, migrate its database, seed it, or reset it.
 *
 * Hooks are shell command lines written by the project, executed from the
 * root of the sandbox's clone with the sandbox's variables in the
 * environment. A hook the manifest does not define is skipped silently —
 * not every project has something to do at every point of the lifecycle.
 */
export class HookRunner {
  constructor(processRunner, terminal) {
    this.processRunner = processRunner;
    this.terminal = terminal;
  }

  /** @returns true when a hook was defined and ran, false when there was nothing to do. */
  run(manifest, hookName, sandboxDirectory, variables) {
    const commandLine = manifest.hook(hookName);
    if (!commandLine) return false;
    this.terminal.step(`${hookName}: ${commandLine}`);
    try {
      this.processRunner.runShell(commandLine, { cwd: sandboxDirectory, env: variables });
    } catch (error) {
      throw new SbxError(`The \`${hookName}\` hook failed: ${error.message}`, error.hint);
    }
    return true;
  }
}
