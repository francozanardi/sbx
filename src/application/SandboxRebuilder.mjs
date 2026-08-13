/**
 * Brings a sandbox in line with what the project declares right now.
 *
 * The manifest lists hooks in two phases:
 *
 *   'prepare':  bring the sandbox to the branch's declared state.
 *               Idempotent and forward-only, safe to re-run.
 *               (e.g. install dependencies, apply migrations, build
 *                generated artifacts)
 *   'populate': reset and rewrite the sandbox's runtime data.
 *               Destructive of anything a user may have accumulated.
 *               (e.g. reset the database, seed known rows, warm a cache)
 *
 * Modes:
 *
 *   'prepare'  runs the prepare hooks. `sbx rebuild <name>`.
 *   'populate' also runs the populate hooks. `sbx rebuild --data`.
 *   'hard'     destroys the sandbox's services and their volumes first,
 *              then runs everything as 'populate'. `sbx rebuild --hard`.
 *
 * Every mode also re-renders the env files and starts the services
 * before any hook runs, because a hook that expects them to be up
 * would otherwise fail on a first invocation.
 */
export class SandboxRebuilder {
  constructor({ workspace, environmentFileWriter, hookRunner, terminal }) {
    this.workspace = workspace;
    this.environmentFileWriter = environmentFileWriter;
    this.hookRunner = hookRunner;
    this.terminal = terminal;
  }

  /** @returns the variable map the sandbox was rendered and run with. */
  rebuild(record, { runHooks, mode = 'prepare' }) {
    const variables = this.workspace.environmentFor(record);
    this.writeEnvironmentFiles(record, variables);
    if (mode === 'hard') this.destroyServices(record, variables);
    this.startServices(record, variables);
    if (runHooks) this.runHooks(mode, record, variables);
    return variables;
  }

  runHooks(mode, record, variables) {
    this.runPhase('prepare', record, variables);
    if (mode === 'populate' || mode === 'hard') this.runPhase('populate', record, variables);
  }

  runPhase(phase, record, variables) {
    for (const hook of this.workspace.manifest.hooksForPhase(phase)) {
      this.hookRunner.run(hook, record.directory, variables);
    }
  }

  writeEnvironmentFiles(record, variables) {
    this.workspace.secrets.ensureExists();
    const written = this.environmentFileWriter.write(this.workspace.manifest, record.directory, variables);
    for (const file of written) this.terminal.step(`rendered ${file}`);
  }

  destroyServices(record, variables) {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('destroying services and volumes');
    this.workspace.composeStackFor(record).destroy(variables);
  }

  startServices(record, variables) {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('starting services');
    this.workspace.composeStackFor(record).start(variables);
  }
}
