/**
 * Brings a sandbox in line with the project as it stands now.
 *
 *   sbx rebuild <name>         install + migrate
 *   sbx rebuild <name> --data  install + migrate + reset + seed
 *   sbx rebuild <name> --hard  destroy services and volumes, then install + migrate + seed
 *
 * The default is safe and idempotent. The two flags escalate: `--data`
 * throws seeded data away and rewrites it, `--hard` goes further and
 * rebuilds the sandbox's stateful services from empty. Each mode is a
 * strict superset of the one above it in cost, so a user picking the
 * next level up cannot end up with less than what the previous mode
 * would have produced.
 */
export class RebuildCommand {
  constructor({ workspace, rebuilder, reporter, terminal }) {
    this.workspace = workspace;
    this.rebuilder = rebuilder;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const mode = this.modeOf(argumentList);
    this.terminal.heading(`Rebuilding sandbox ${record.name}`);
    this.rebuilder.rebuild(record, {
      runHooks: !argumentList.hasFlag('no-hooks'),
      mode,
    });
    this.terminal.blank();
    this.reporter.describe(record);
  }

  modeOf(argumentList) {
    if (argumentList.hasFlag('hard')) return 'hard';
    if (argumentList.hasFlag('data')) return 'populate';
    return 'prepare';
  }
}
