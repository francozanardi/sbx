import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { SbxError } from '@/domain/SbxError.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

export interface RunCommandDeps {
  resolver: SandboxResolver;
  processRunner: ProcessRunner;
}

/**
 * Runs a command inside a sandbox: from its directory, with its port block
 * and credentials in the environment.
 *
 * This is the command agents drive sandboxes with, so it is a transparent
 * wrapper: the child's exit status becomes sbx's own, and a child that
 * merely failed prints nothing extra. Anything else would make a failing
 * test suite indistinguishable from a broken sandbox.
 */
export class RunCommand implements Command {
  readonly flags = [] as const;

  private readonly resolver: SandboxResolver;
  private readonly processRunner: ProcessRunner;

  constructor({ resolver, processRunner }: RunCommandDeps) {
    this.resolver = resolver;
    this.processRunner = processRunner;
  }

  execute(argumentList: ArgumentList): void {
    const { workspace, record } = this.resolver.resolveOrEnclosing(argumentList.at(0));
    const [program, ...programArguments] = argumentList.passthrough;
    if (!program) {
      throw new SbxError('Missing the command to run.', 'Put it after `--`, as in `sbx run sb-1 -- npm run dev`.');
    }
    process.exitCode = this.processRunner.forwardProgram(program, programArguments, {
      cwd: record.directory,
      env: workspace.environmentFor(record),
    });
  }
}
