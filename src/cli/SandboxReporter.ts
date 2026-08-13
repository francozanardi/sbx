import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { type Terminal } from '@/cli/Terminal.js';

/** Prints what a single sandbox is: where it lives and which port each role got. */
export class SandboxReporter {
  private readonly workspace: ProjectWorkspace;
  private readonly terminal: Terminal;

  constructor(workspace: ProjectWorkspace, terminal: Terminal) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  describe(record: SandboxRecord): void {
    this.terminal.heading(`sandbox ${record.name}`);
    this.terminal.info(`  slot       ${String(record.slot)}`);
    this.terminal.info(`  branch     ${this.describeBranch(record)}`);
    this.terminal.info(`  directory  ${record.directory}`);
    this.terminal.blank();
    this.describePorts(record);
  }

  private describeBranch(record: SandboxRecord): string {
    if (!this.workspace.hasClone(record)) return '(clone missing)';
    return this.workspace.branchOf(record) ?? '(detached)';
  }

  private describePorts(record: SandboxRecord): void {
    const ports = this.workspace.portBlockFor(record.slot).resolve();
    const variableNames = this.workspace.manifest.portVariableNames();
    const rows = Object.entries(ports).map(([role, port]) => [role, String(port), variableNames[role] ?? '']);
    this.terminal.table(['role', 'port', 'variable'], rows);
  }
}
