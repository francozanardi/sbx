/** Re-runs the project's seed hook against a sandbox, optionally wiping it first. */
export class SeedCommand {
  constructor({ workspace, hookRunner, terminal }) {
    this.workspace = workspace;
    this.hookRunner = hookRunner;
    this.terminal = terminal;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const variables = this.workspace.environmentFor(record);
    this.terminal.heading(`Seeding ${record.name}`);
    if (argumentList.hasFlag('reset')) this.runHook('reset', record, variables);
    this.runHook('seed', record, variables);
  }

  runHook(hookName, record, variables) {
    const ran = this.hookRunner.run(this.workspace.manifest, hookName, record.worktree, variables);
    if (!ran) this.terminal.warn(`This project defines no \`${hookName}\` hook.`);
  }
}
