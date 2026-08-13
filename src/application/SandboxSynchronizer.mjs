/**
 * Brings a sandbox in line with what the project declares right now: env
 * files rendered from the current templates and secrets, services running,
 * and the install and migrate hooks re-run.
 *
 * Every step here is safe to repeat, which is what lets a sandbox that
 * already holds work pick up a changed template, a filled-in credential or
 * a new dependency without being recreated. Seeding is deliberately absent:
 * it is the one hook that replaces data a sandbox may have earned.
 */
export class SandboxSynchronizer {
  constructor({ workspace, environmentFileWriter, hookRunner, terminal }) {
    this.workspace = workspace;
    this.environmentFileWriter = environmentFileWriter;
    this.hookRunner = hookRunner;
    this.terminal = terminal;
  }

  /** @returns the variable map the sandbox was rendered and run with. */
  sync(record, { runHooks }) {
    const variables = this.workspace.environmentFor(record);
    this.writeEnvironmentFiles(record, variables);
    this.startServices(record, variables);
    if (runHooks) this.runConvergingHooks(record, variables);
    return variables;
  }

  writeEnvironmentFiles(record, variables) {
    this.workspace.secrets.ensureExists();
    const written = this.environmentFileWriter.write(this.workspace.manifest, record.directory, variables);
    for (const file of written) this.terminal.step(`rendered ${file}`);
  }

  startServices(record, variables) {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('starting services');
    this.workspace.composeStackFor(record).start(variables);
  }

  runConvergingHooks(record, variables) {
    for (const hookName of ['install', 'migrate']) {
      this.hookRunner.run(this.workspace.manifest, hookName, record.directory, variables);
    }
  }
}
