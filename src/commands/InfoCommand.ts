import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type SandboxReporter } from '@/cli/SandboxReporter.js';

export interface InfoCommandDeps {
  workspace: ProjectWorkspace;
  reporter: SandboxReporter;
}

/** Shows one sandbox in full: its identity and the port each role got. */
export class InfoCommand implements Command {
  readonly flags = [] as const;

  private readonly workspace: ProjectWorkspace;
  private readonly reporter: SandboxReporter;

  constructor({ workspace, reporter }: InfoCommandDeps) {
    this.workspace = workspace;
    this.reporter = reporter;
  }

  execute(argumentList: ArgumentList): void {
    const record = this.workspace.requireSandbox(argumentList.require(0, 'a sandbox name'));
    this.reporter.describe(record);
  }
}
