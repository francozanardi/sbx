import { type Terminal } from '@/cli/Terminal.js';
import { type HookPhase } from '@/domain/ProjectManifest.js';
import { SbxError } from '@/domain/SbxError.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { type EnvMap } from '@/infrastructure/ProcessRunner.js';
import { type EnvironmentFileWriter } from '@/application/EnvironmentFileWriter.js';
import { type HookRunner } from '@/application/HookRunner.js';
import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';

export type RebuildMode = 'prepare' | 'populate' | 'hard';

export interface RebuildOptions {
  runHooks: boolean;
  mode?: RebuildMode;
}

export interface RebuilderDeps {
  workspace: ProjectWorkspace;
  environmentFileWriter: EnvironmentFileWriter;
  hookRunner: HookRunner;
  terminal: Terminal;
}

/**
 * Brings a sandbox in line with what the project declares right now.
 *
 * The manifest lists hooks in two phases:
 *
 *   'prepare':  bring the sandbox to the branch's declared state.
 *               Idempotent and forward-only, safe to re-run.
 *   'populate': reset and rewrite the sandbox's runtime data.
 *               Destructive of anything a user may have accumulated.
 *
 * Modes:
 *
 *   'prepare'  runs the prepare hooks.
 *   'populate' also runs the populate hooks.
 *   'hard'     destroys the sandbox's services and their volumes first,
 *              then runs everything as 'populate'.
 *
 * Every mode also re-renders the env files and starts the services
 * before any hook runs, because a hook that expects them to be up
 * would otherwise fail on a first invocation.
 */
export class SandboxRebuilder {
  private readonly workspace: ProjectWorkspace;
  private readonly environmentFileWriter: EnvironmentFileWriter;
  private readonly hookRunner: HookRunner;
  private readonly terminal: Terminal;

  constructor({ workspace, environmentFileWriter, hookRunner, terminal }: RebuilderDeps) {
    this.workspace = workspace;
    this.environmentFileWriter = environmentFileWriter;
    this.hookRunner = hookRunner;
    this.terminal = terminal;
  }

  /** @returns the variable map the sandbox was rendered and run with. */
  rebuild(record: SandboxRecord, { runHooks, mode = 'prepare' }: RebuildOptions): EnvMap {
    this.reportMovedPorts(record);
    const variables = this.workspace.environmentFor(record);
    this.writeEnvironmentFiles(record, variables);
    if (mode === 'hard') this.destroyServices(record, variables);
    this.startServices(record, variables);
    if (runHooks) this.runHooks(mode, record, variables);
    return variables;
  }

  /**
   * A rebuild is where a manifest edit reaches an existing sandbox, so it
   * is where the sandbox silently changes ports. Rendering the new numbers
   * is the right thing to do; doing it without saying so is not, because
   * the services are already up on the old ones and anything registered
   * off this machine still points at them.
   */
  private reportMovedPorts(record: SandboxRecord): void {
    const current = this.workspace.portBlockFor(record.slot);
    const moved = current.movedFrom(record.ports);
    if (moved.length === 0) return;
    this.terminal.warn(
      `${record.name} changes ports: ${moved.join(', ')}. Its services are running on the old ones — \`sbx down ${record.name}\` then \`sbx up ${record.name}\` moves them, and anything registered outside this machine, such as an OAuth redirect URI, has to be updated by hand.`,
    );
    this.workspace.registry.save(record.withPorts(current.resolve()));
  }

  private runHooks(mode: RebuildMode, record: SandboxRecord, variables: EnvMap): void {
    this.runPhase('prepare', record, variables);
    if (mode === 'populate' || mode === 'hard') this.runPhase('populate', record, variables);
  }

  private runPhase(phase: HookPhase, record: SandboxRecord, variables: EnvMap): void {
    for (const hook of this.workspace.manifest.hooksForPhase(phase)) {
      this.hookRunner.run(hook, record.directory, variables);
    }
  }

  private writeEnvironmentFiles(record: SandboxRecord, variables: EnvMap): void {
    this.workspace.secrets.ensureExists();
    let written: string[];
    try {
      written = this.environmentFileWriter.write(this.workspace.manifest, record.directory, variables);
    } catch (error) {
      throw this.explainStaleTemplates(record, error);
    }
    for (const file of written) this.terminal.step(`rendered ${file}`);
  }

  /**
   * A sandbox renders the templates of the commit it has checked out,
   * which is `origin/HEAD` unless the create asked for something else —
   * not the working tree the developer is looking at. When a render
   * fails and the host's copy of that same template differs, that gap is
   * almost always the reason, and the raw error points the other way: it
   * reads as "add these variables", when they were just removed on
   * purpose and the sandbox is rendering the version from before.
   */
  private explainStaleTemplates(record: SandboxRecord, error: unknown): unknown {
    if (!(error instanceof SbxError)) return error;
    const templates = this.workspace.manifest.environmentFiles().map((file) => file.from);
    const stale = this.workspace.clones.provenDifferencesFrom('host/HEAD', templates, record.directory);
    if (stale.length === 0) return error;
    return new SbxError(
      error.message,
      `"${record.name}" has checked out a commit whose ${stale.join(', ')} differs from the copy in your checkout — it is rendering the older version, so this may be a fix you have already made but the sandbox does not have yet. ` +
        `Compare with \`git -C ${record.directory} diff host/HEAD -- ${stale.join(' ')}\`, then either push and \`sbx rebuild ${record.name}\`, or re-create it with \`--from=HEAD\`.` +
        (error.hint ? `\n\nIf the sandbox is on the right commit: ${error.hint}` : ''),
    );
  }

  private destroyServices(record: SandboxRecord, variables: EnvMap): void {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('destroying services and volumes');
    this.workspace.composeStackFor(record).destroy(variables);
  }

  private startServices(record: SandboxRecord, variables: EnvMap): void {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('starting services');
    this.workspace.composeStackFor(record).start(variables);
  }
}
