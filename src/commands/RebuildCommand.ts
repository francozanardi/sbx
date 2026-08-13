import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type RebuildMode, type SandboxRebuilder } from '@/application/SandboxRebuilder.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type SandboxReporter } from '@/cli/SandboxReporter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface RebuildCommandDeps {
  workspace: ProjectWorkspace;
  rebuilder: SandboxRebuilder;
  reporter: SandboxReporter;
  terminal: Terminal;
}

/**
 * Brings a sandbox in line with the project as it stands now.
 *
 *   sbx rebuild <name>         install + migrate
 *   sbx rebuild <name> --data  install + migrate + reset + seed
 *   sbx rebuild <name> --hard  destroy services and volumes, then install + migrate + seed
 */
export class RebuildCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly rebuilder: SandboxRebuilder;
  private readonly reporter: SandboxReporter;
  private readonly terminal: Terminal;

  constructor({ workspace, rebuilder, reporter, terminal }: RebuildCommandDeps) {
    this.workspace = workspace;
    this.rebuilder = rebuilder;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
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

  private modeOf(argumentList: ArgumentList): RebuildMode {
    if (argumentList.hasFlag('hard')) return 'hard';
    if (argumentList.hasFlag('data')) return 'populate';
    return 'prepare';
  }
}
