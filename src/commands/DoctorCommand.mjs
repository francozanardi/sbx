/** Reports whether this project is ready for `sbx create`, and exits non-zero when it is not. */
export class DoctorCommand {
  constructor({ inspector, terminal }) {
    this.inspector = inspector;
    this.terminal = terminal;
  }

  async execute() {
    const checks = await this.inspector.inspect();
    this.terminal.heading('sbx doctor');
    this.terminal.blank();
    for (const check of checks) {
      this.terminal.info(`${this.markFor(check)} ${check.name}`);
      this.terminal.detail(`    ${check.detail}`);
    }
    this.terminal.blank();
    this.reportVerdict(checks);
  }

  markFor(check) {
    if (check.ok === true) return 'ok  ';
    if (check.ok === false) return 'FAIL';
    return 'note';
  }

  reportVerdict(checks) {
    const failed = checks.filter((check) => check.ok === false);
    if (failed.length === 0) {
      this.terminal.info('Ready. `sbx create <name>` should work.');
      return;
    }
    this.terminal.error(`${failed.length} check(s) failed: ${failed.map((check) => check.name).join(', ')}`);
    process.exitCode = 1;
  }
}
