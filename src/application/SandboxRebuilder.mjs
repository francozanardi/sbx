/**
 * Brings a sandbox in line with what the project declares right now, at
 * one of three severities:
 *
 *   'code': env files rendered, services started, install and migrate
 *           re-run. Safe and idempotent — this is the default `sbx
 *           rebuild` and also what `sbx create` uses to converge a fresh
 *           clone.
 *   'data': everything 'code' does, plus reset and seed at the end.
 *           Rewrites the seeded data through the project's reset hook.
 *   'hard': destroys the sandbox's services and their volumes, then does
 *           everything 'data' does with a slight difference — the reset
 *           hook is skipped because empty volumes already carry no data.
 *
 * Each mode is a strict superset of the previous one in cost. Install
 * and migrate are idempotent, so running them at the top of every mode
 * is close to free when there is nothing new to apply.
 */
export class SandboxRebuilder {
  constructor({ workspace, environmentFileWriter, hookRunner, terminal }) {
    this.workspace = workspace;
    this.environmentFileWriter = environmentFileWriter;
    this.hookRunner = hookRunner;
    this.terminal = terminal;
  }

  /** @returns the variable map the sandbox was rendered and run with. */
  rebuild(record, { runHooks, mode = 'code' }) {
    const variables = this.workspace.environmentFor(record);
    this.writeEnvironmentFiles(record, variables);
    if (mode === 'hard') this.destroyServices(record, variables);
    this.startServices(record, variables);
    if (runHooks) this.runHooks(mode, record, variables);
    return variables;
  }

  runHooks(mode, record, variables) {
    this.runHook('install', record, variables);
    this.runHook('migrate', record, variables);
    if (mode === 'data') this.runHook('reset', record, variables);
    if (mode === 'data' || mode === 'hard') this.runHook('seed', record, variables);
  }

  runHook(name, record, variables) {
    this.hookRunner.run(this.workspace.manifest, name, record.directory, variables);
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
