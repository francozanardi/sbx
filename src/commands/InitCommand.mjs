/** Writes a starting manifest into a project that has none. */
export class InitCommand {
  constructor({ scaffolder, terminal }) {
    this.scaffolder = scaffolder;
    this.terminal = terminal;
  }

  async execute() {
    const result = this.scaffolder.scaffold(process.cwd());
    this.terminal.heading(`Wrote ${result.manifestPath}`);
    this.terminal.blank();
    this.terminal.info(`  project    ${result.projectName}`);
    this.terminal.info(`  toolchain  ${result.ecosystem}${result.marker ? ` (found ${result.marker})` : ''}`);
    this.terminal.blank();
    this.terminal.info('Next: fill in `ports.base` with the ports your stack binds, make the');
    this.terminal.info('project read them from the environment, then run `sbx doctor`.');
  }
}
