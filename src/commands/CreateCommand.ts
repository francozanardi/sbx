import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type SandboxCreator, type CreateOptions } from '@/application/SandboxCreator.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type SandboxReporter } from '@/cli/SandboxReporter.js';
import { type Terminal } from '@/cli/Terminal.js';
import { SandboxName } from '@/domain/SandboxName.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { type GitClones } from '@/infrastructure/GitClones.js';

export interface CreateCommandDeps {
  workspace: ProjectWorkspace;
  creator: SandboxCreator;
  clones: GitClones;
  reporter: SandboxReporter;
  terminal: Terminal;
}

/** Creates a sandbox and leaves it ready to run the project. */
export class CreateCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly creator: SandboxCreator;
  private readonly reporter: SandboxReporter;
  private readonly terminal: Terminal;

  constructor({ workspace, creator, reporter, terminal }: CreateCommandDeps) {
    this.workspace = workspace;
    this.creator = creator;
    this.reporter = reporter;
    this.terminal = terminal;
  }

  async execute(argumentList: ArgumentList): Promise<void> {
    const name = new SandboxName(argumentList.require(0, 'a sandbox name'));
    const options: CreateOptions = {
      branch: argumentList.flag('branch'),
      startPoint: argumentList.flag('from'),
      runHooks: !argumentList.hasFlag('no-hooks'),
    };
    this.terminal.heading(`Creating sandbox ${name.toString()}`);
    const record = await this.createAndReportFailure(name, options);
    this.terminal.blank();
    this.reporter.describe(record);
  }

  private async createAndReportFailure(name: SandboxName, options: CreateOptions): Promise<SandboxRecord> {
    const existedBefore = this.isRegistered(name);
    try {
      return await this.creator.create(name, options);
    } catch (error) {
      if (!existedBefore && this.isRegistered(name)) {
        this.terminal.warn(`"${name.toString()}" was left half-created. Run \`sbx delete ${name.toString()}\` before trying again.`);
      }
      throw error;
    }
  }

  private isRegistered(name: SandboxName): boolean {
    return this.workspace.registry.find(name.toString()) !== null;
  }
}
