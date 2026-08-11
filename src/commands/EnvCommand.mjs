/**
 * Prints a sandbox's variables as shell exports, for loading them into an
 * existing session with `eval "$(sbx env <name>)"`.
 *
 * Values are single-quoted so a secret containing spaces or shell
 * metacharacters survives the eval intact.
 */
export class EnvCommand {
  constructor({ workspace, terminal }) {
    this.workspace = workspace;
    this.terminal = terminal;
  }

  summary() {
    return "Print a sandbox's variables as shell exports.";
  }

  usage() {
    return 'sbx env <name>';
  }

  async execute(argumentList) {
    const record = this.workspace.registry.get(argumentList.require(0, 'a sandbox name'));
    const variables = this.workspace.environmentFor(record);
    for (const name of Object.keys(variables).sort()) {
      this.terminal.info(`export ${name}=${this.quote(variables[name])}`);
    }
  }

  quote(value) {
    return `'${String(value).replaceAll("'", `'\\''`)}'`;
  }
}
