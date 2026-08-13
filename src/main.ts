#!/usr/bin/env node
import { ArgumentList } from '@/cli/ArgumentList.js';
import { CommandRegistry } from '@/cli/CommandRegistry.js';
import { CommandRouter, HELP_TOKENS } from '@/cli/CommandRouter.js';
import { ErrorReporter } from '@/cli/ErrorReporter.js';
import { HelpText } from '@/cli/HelpText.js';
import { Terminal } from '@/cli/Terminal.js';
import { HomePath } from '@/infrastructure/HomePath.js';
import { ManifestLoader } from '@/infrastructure/ManifestLoader.js';
import { ProcessRunner } from '@/infrastructure/ProcessRunner.js';

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
  const first = tokens[0];
  if (!first || !standalone.has(first)) {
    try {
      commands = registry.forProject(new ManifestLoader().loadFrom(process.cwd()));
    } catch (error) {
      // Asking for help in a directory with no manifest is how someone
      // finds out `sbx init` exists, so it must not be a hard failure.
      if (!HELP_TOKENS.has(first ?? 'help')) throw error;
      const message = error instanceof Error ? error.message : String(error);
      terminal.warn(message);
      terminal.blank();
    }
  }
  await new CommandRouter(commands, helpText).route(tokens, new ArgumentList(tokens.slice(1)));
} catch (error) {
  new ErrorReporter(terminal, process.env.SBX_DEBUG === '1').report(error);
  process.exitCode = 1;
}
