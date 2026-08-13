/**
 * Writes a starting manifest into a project that has none, and says what
 * is left to decide.
 *
 * The manifest is JSON and carries no comments, so the keys it leaves out
 * are named here instead: a scaffold that stubbed them would be guessing,
 * but a scaffold that stays silent about them hides the format.
 */
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
    this.printRequired();
    this.printOptional();
    this.terminal.info('Then run `sbx doctor`. It reports what would break before you spend a');
    this.terminal.info('create on finding out.');
  }

  printRequired() {
    this.terminal.heading('Fill in');
    this.terminal.info('  ports.base    One entry per port your stack binds, with the value it');
    this.terminal.info('                uses today. Slot 0 is this checkout on exactly those');
    this.terminal.info('                numbers; sandbox N shifts each by N x stride. Your app');
    this.terminal.info('                must read them from the environment — a hardcoded port');
    this.terminal.info('                is what makes two sandboxes collide.');
    this.terminal.info('  hooks         Shell commands run from the sandbox root: install,');
    this.terminal.info('                migrate, seed, reset.');
    this.terminal.blank();
  }

  printOptional() {
    this.terminal.heading('Add if you need them');
    this.terminal.info('  ports.env     Variable each role is published under. Defaults to');
    this.terminal.info('                ROLE_PORT, so `app` arrives as APP_PORT.');
    this.terminal.info('  compose       Compose file for stateful services, one project per');
    this.terminal.info('                sandbox. Omit it if state lives in files.');
    this.terminal.info('  env           Files rendered into each sandbox from templates in the');
    this.terminal.info('                repo, as { from, to } pairs.');
    this.terminal.info('  generate      Variable to byte length, for secrets minted once per');
    this.terminal.info('                sandbox and never rotated.');
    this.terminal.info('  variables     Fixed values every sandbox of this project gets.');
    this.terminal.info('  secrets       Path to the shared credentials file.');
    this.terminal.info('  sandboxRoot   Where the clones go.');
    this.terminal.blank();
  }
}
