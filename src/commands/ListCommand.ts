import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';

export interface ListCommandDeps {
  workspace: ProjectWorkspace;
  terminal: Terminal;
}

/** Shows every sandbox of the current project and whether its services are up. */
export class ListCommand implements Command {
  private readonly workspace: ProjectWorkspace;
  private readonly terminal: Terminal;

  constructor({ workspace, terminal }: ListCommandDeps) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  execute(): void {
    const records = this.workspace.registry.list().sort((left, right) => left.slot - right.slot);
    if (records.length === 0) {
      this.terminal.info('No sandboxes yet. Create one with `sbx create <name>`.');
      return;
    }
    this.terminal.table(
      ['name', 'slot', 'branch', 'services', 'directory'],
      records.map((record) => [
        record.name,
        record.slot,
        this.workspace.branchOf(record) ?? '(detached)',
        this.describeServices(record),
        record.directory,
      ]),
    );
  }

  private describeServices(record: SandboxRecord): string {
    if (!this.workspace.manifest.composeFile()) return '-';
    try {
      const running = this.workspace.composeStackFor(record).runningServices(this.workspace.environmentFor(record));
      return running.length === 0 ? 'down' : `up (${String(running.length)})`;
    } catch {
      return 'unknown';
    }
  }
}
