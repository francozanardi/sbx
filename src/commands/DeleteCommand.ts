import { SandboxRemover } from '@/application/SandboxRemover.js';
import { type SandboxResolver } from '@/application/SandboxResolver.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';
import { SbxError } from '@/domain/SbxError.js';

export interface DeleteCommandDeps {
  resolver: SandboxResolver;
  terminal: Terminal;
}

/** Removes a sandbox and everything that belongs to it. */
export class DeleteCommand implements Command {
  readonly flags = ['force'] as const;

  private readonly resolver: SandboxResolver;
  private readonly terminal: Terminal;

  constructor({ resolver, terminal }: DeleteCommandDeps) {
    this.resolver = resolver;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    const spec = argumentList.at(0) ?? this.refuseToInfer();
    const { projectName, record, workspace, hostClones, hostMissing } = this.resolver.resolve(spec, { requireClone: false });
    this.terminal.heading(`Deleting sandbox ${projectName}/${record.name}`);
    if (hostMissing) {
      this.terminal.warn(`Host clone of "${projectName}" is not reachable — the host git remote will not be unregistered.`);
    }
    const remover = new SandboxRemover({ workspace, clones: hostClones, terminal: this.terminal });
    remover.remove(record, { force: argumentList.hasFlag('force') });
  }

  /**
   * Every other per-sandbox command takes the sandbox you are standing
   * in when you leave the name off. Delete does not: it removes that
   * directory, so inferring it would delete the caller's own working
   * directory from under them on a bare `sbx delete`. The sandbox is
   * still named for them — the name just has to be typed.
   */
  private refuseToInfer(): never {
    const enclosing = this.resolver.enclosing();
    throw new SbxError(
      'Missing a sandbox name.',
      enclosing
        ? `Delete is the one command that does not assume the sandbox you are in, because it would remove this directory. You are in "${enclosing.record.name}" — run \`sbx delete ${enclosing.record.name}\` from somewhere else to delete it.`
        : 'Name the sandbox to delete. `sbx list --all` shows every sandbox on this machine.',
    );
  }
}
