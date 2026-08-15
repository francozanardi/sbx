import path from 'node:path';
import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type ArgumentList } from '@/cli/ArgumentList.js';
import { type Command } from '@/cli/CommandRouter.js';
import { type Terminal } from '@/cli/Terminal.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { SbxError } from '@/domain/SbxError.js';
import { type HomePath } from '@/infrastructure/HomePath.js';
import { JsonSandboxRegistry } from '@/infrastructure/JsonSandboxRegistry.js';

export interface ListCommandDeps {
  workspace: ProjectWorkspace | null;
  homePath: HomePath;
  terminal: Terminal;
}

/**
 * Lists sandboxes.
 *
 * Default: the current project's sandboxes, with a `services` column that
 * reads Compose. With `--all`: every project's sandboxes, drawn from
 * `~/.sbx/<project>/state.json`, with no `services` column because that
 * would need the manifest and clone of each project.
 *
 * `--all` also runs when the tool is invoked outside a project, so
 * "where are all my sandboxes?" has an answer from any directory.
 */
export class ListCommand implements Command {
  readonly flags = ['all'] as const;

  private readonly workspace: ProjectWorkspace | null;
  private readonly homePath: HomePath;
  private readonly terminal: Terminal;

  constructor({ workspace, homePath, terminal }: ListCommandDeps) {
    this.workspace = workspace;
    this.homePath = homePath;
    this.terminal = terminal;
  }

  execute(argumentList: ArgumentList): void {
    if (argumentList.hasFlag('all')) {
      this.listAllProjects();
      return;
    }
    if (!this.workspace) {
      throw new SbxError(
        'sbx list needs a sandbox.config.json in this directory or a parent, and none was found.',
        'Run `sbx list --all` to list sandboxes from every project on this machine.',
      );
    }
    this.listCurrentProject(this.workspace);
  }

  private listCurrentProject(workspace: ProjectWorkspace): void {
    const records = workspace.registry.list().sort((left, right) => left.slot - right.slot);
    if (records.length === 0) {
      this.terminal.info('No sandboxes yet for this project. Create one with `sbx create <name>`.');
      if (this.otherProjectsHaveSandboxes(workspace)) {
        this.terminal.info('Other projects on this machine have sandboxes — run `sbx list --all` to see them.');
      }
      return;
    }
    this.terminal.table(
      ['name', 'slot', 'branch', 'services', 'directory'],
      records.map((record) => [
        record.name,
        record.slot,
        this.describeBranch(workspace, record),
        this.describeServices(workspace, record),
        record.directory,
      ]),
    );
  }

  private listAllProjects(): void {
    const rows: [string, string, number, string][] = [];
    for (const { projectName, records, readable } of this.everyProject()) {
      if (!readable) {
        rows.push([projectName, '(registry unreadable)', 0, '-']);
        continue;
      }
      for (const record of records) {
        rows.push([projectName, record.name, record.slot, record.directory]);
      }
    }
    if (rows.length === 0) {
      this.terminal.info('No sandboxes on this machine. Create one with `sbx create <name>` inside a project.');
      return;
    }
    this.terminal.table(['project', 'name', 'slot', 'directory'], rows);
  }

  /**
   * A state directory exists for every project that ever ran `sbx
   * create`, and it outlives the last sandbox in it. Pointing at
   * `--all` has to count actual records, or a project that was emptied
   * months ago keeps advertising sandboxes that are not there.
   */
  private otherProjectsHaveSandboxes(workspace: ProjectWorkspace): boolean {
    const own = workspace.manifest.name();
    return this.everyProject().some((entry) => entry.projectName !== own && entry.records.length > 0);
  }

  private everyProject(): { projectName: string; records: SandboxRecord[]; readable: boolean }[] {
    return this.homePath.knownProjectNames().map((projectName) => {
      const registry = new JsonSandboxRegistry(path.join(this.homePath.stateDirectoryFor(projectName), 'state.json'));
      try {
        return { projectName, records: registry.list().sort((left, right) => left.slot - right.slot), readable: true };
      } catch {
        return { projectName, records: [], readable: false };
      }
    });
  }

  /**
   * A record whose clone is gone still belongs in the listing — it is what
   * `sbx delete` needs to clean up — but reporting a branch for it would
   * be reporting on a directory that is not there.
   */
  private describeBranch(workspace: ProjectWorkspace, record: SandboxRecord): string {
    if (!workspace.hasClone(record)) return '(clone missing)';
    return workspace.branchOf(record) ?? '(detached)';
  }

  private describeServices(workspace: ProjectWorkspace, record: SandboxRecord): string {
    if (!workspace.manifest.composeFile()) return '-';
    if (!workspace.hasClone(record)) return 'unknown';
    try {
      const running = workspace.composeStackFor(record).runningServices(workspace.environmentFor(record));
      return running.length === 0 ? 'down' : `up (${String(running.length)})`;
    } catch {
      return 'unknown';
    }
  }
}
