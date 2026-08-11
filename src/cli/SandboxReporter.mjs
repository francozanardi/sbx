/** Prints what a single sandbox is: where it lives and which port each role got. */
export class SandboxReporter {
  constructor(workspace, terminal) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  describe(record) {
    this.terminal.heading(`sandbox ${record.name}`);
    this.terminal.info(`  slot      ${record.slot}`);
    this.terminal.info(`  branch    ${record.branch}`);
    this.terminal.info(`  worktree  ${record.worktree}`);
    this.terminal.blank();
    this.describePorts(record);
  }

  describePorts(record) {
    const ports = this.workspace.portBlockFor(record.slot).resolve();
    const variableNames = this.workspace.manifest.portVariableNames();
    const rows = Object.entries(ports).map(([role, port]) => [role, String(port), variableNames[role]]);
    this.terminal.table(['role', 'port', 'variable'], rows);
  }
}
