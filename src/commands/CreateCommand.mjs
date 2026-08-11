import { SandboxName } from '../domain/SandboxName.mjs';

/** Creates a sandbox and leaves it ready to run the project. */
export class CreateCommand {
  constructor({ workspace, creator, worktrees, reporter, terminal }) {
    this.workspace = workspace;
    this.creator = creator;
    this.worktrees = worktrees;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  summary() {
    return 'Create a sandbox: worktree, port block, services, seeded data.';
  }

  usage() {
    return 'sbx create <name> [--branch=<branch>] [--from=<ref>] [--no-hooks]';
  }

  async execute(argumentList) {
    const name = new SandboxName(argumentList.require(0, 'a sandbox name'));
    const options = {
      branch: argumentList.flag('branch', name.toString()),
      startPoint: argumentList.flag('from', this.worktrees.currentBranch()),
      runHooks: !argumentList.hasFlag('no-hooks'),
    };
    this.terminal.heading(`Creating sandbox ${name}`);
    const record = await this.createAndReportFailure(name, options);
    this.terminal.blank();
    this.reporter.describe(record);
  }

  /**
   * A half-finished sandbox is still registered, and saying so is what
   * keeps its slot from staying occupied by something nobody can name.
   *
   * The entry has to be one this run created: a failure on a name that was
   * already registered says nothing about the health of what is under it.
   */
  async createAndReportFailure(name, options) {
    const existedBefore = this.isRegistered(name);
    try {
      return await this.creator.create(name, options);
    } catch (error) {
      if (!existedBefore && this.isRegistered(name)) {
        this.terminal.warn(`"${name}" was left half-created. Run \`sbx delete ${name}\` before trying again.`);
      }
      throw error;
    }
  }

  isRegistered(name) {
    return this.workspace.registry.find(name.toString()) !== null;
  }
}
