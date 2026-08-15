import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface CodeCommandDeps {
  resolver: SandboxResolver;
  processRunner: ProcessRunner;
}

/**
 * Opens a sandbox's directory in an editor.
 *
 * The editor is `$SBX_EDITOR` (default `code`) and no sandbox environment
 * is injected.
 */
export class CodeCommand implements Command {
  readonly flags = [] as const;

  private readonly resolver: SandboxResolver;
  private readonly processRunner: ProcessRunner;

  constructor({ resolver, processRunner }: CodeCommandDeps) {
    this.resolver = resolver;
    this.processRunner = processRunner;
  }

  execute(argumentList: ArgumentList): void {
    const spec = argumentList.require(0, 'a sandbox name');
    const { record } = this.resolver.resolve(spec);
    const editor = process.env.SBX_EDITOR ?? 'code';
    this.processRunner.runProgram(editor, [record.directory]);
  }
}
