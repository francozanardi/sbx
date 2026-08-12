#!/usr/bin/env node
import { ArgumentList } from './cli/ArgumentList.mjs';
import { CommandRegistry } from './cli/CommandRegistry.mjs';
import { CommandRouter, HELP_TOKENS } from './cli/CommandRouter.mjs';
import { ErrorReporter } from './cli/ErrorReporter.mjs';
import { HelpText } from './cli/HelpText.mjs';
import { Terminal } from './cli/Terminal.mjs';
import { HomePath } from './infrastructure/HomePath.mjs';
import { ManifestLoader } from './infrastructure/ManifestLoader.mjs';
import { ProcessRunner } from './infrastructure/ProcessRunner.mjs';

const terminal = new Terminal();
const tokens = process.argv.slice(2);
const registry = new CommandRegistry({
  terminal,
  processRunner: new ProcessRunner(),
  homePath: new HomePath(),
});
const helpText = new HelpText(terminal);

try {
  const standalone = registry.standalone();
  let commands = standalone;
  if (!standalone.has(tokens[0])) {
    try {
      commands = registry.forProject(await new ManifestLoader().loadFrom(process.cwd()));
    } catch (error) {
      // Asking for help in a directory with no manifest is how someone
      // finds out `sbx init` exists, so it must not be a hard failure.
      if (!HELP_TOKENS.has(tokens[0] ?? 'help')) throw error;
      terminal.warn(error.message);
      terminal.blank();
    }
  }
  await new CommandRouter(commands, helpText).route(tokens, new ArgumentList(tokens.slice(1)));
} catch (error) {
  new ErrorReporter(terminal, process.env.SBX_DEBUG === '1').report(error);
  process.exitCode = 1;
}
