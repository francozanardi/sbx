import { type CheckResult, type SetupInspector } from '@/application/SetupInspector.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';

export interface DoctorCommandDeps {
  inspector: SetupInspector;
  terminal: Terminal;
}

/** Reports whether this project is ready for `sbx create`, and exits non-zero when it is not. */
export class DoctorCommand implements Command {
  readonly flags = [] as const;

  private readonly inspector: SetupInspector;
  private readonly terminal: Terminal;

  constructor({ inspector, terminal }: DoctorCommandDeps) {
    this.inspector = inspector;
    this.terminal = terminal;
  }

  async execute(): Promise<void> {
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

  private markFor(check: CheckResult): string {
    if (check.ok === true) return 'ok  ';
    if (check.ok === false) return 'FAIL';
    return 'note';
  }

  private reportVerdict(checks: readonly CheckResult[]): void {
    const failed = checks.filter((check) => check.ok === false);
    if (failed.length === 0) {
      this.terminal.info('Ready. `sbx create <name>` should work.');
      return;
    }
    this.terminal.error(`${String(failed.length)} check(s) failed: ${failed.map((check) => check.name).join(', ')}`);
    process.exitCode = 1;
  }
}
