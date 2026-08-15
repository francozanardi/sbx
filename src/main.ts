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
  const first = tokens[0];
  let commands = standalone;
  // `init` is the one command that must not touch a parent's manifest —
  // it exists to write a fresh one, and a broken manifest three directories
  // up should not stop it. Everything else goes through the loader, and
  // falls back to the standalone map (with `list --all` and `init`) if the
  // loader fails.
  if (first !== 'init') {
    try {
      commands = registry.forProject(new ManifestLoader().loadFrom(process.cwd()));
    } catch (error) {
      const key = first ?? 'help';
      const availableInFallback = standalone.has(key);
      const isHelp = HELP_TOKENS.has(key);
      if (!availableInFallback && !isHelp) throw error;
      if (isHelp) {
        const message = error instanceof Error ? error.message : String(error);
        terminal.warn(message);
        terminal.blank();
      }
    }
  }
  await new CommandRouter(commands, helpText).route(tokens, new ArgumentList(tokens.slice(1)));
} catch (error) {
  new ErrorReporter(terminal, process.env.SBX_DEBUG === '1').report(error);
  process.exitCode = 1;
}
