import { type Terminal } from '@/cli/Terminal.js';
import { type HookPhase } from '@/domain/ProjectManifest.js';
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
    const variables = this.workspace.environmentFor(record);
    this.writeEnvironmentFiles(record, variables);
    if (mode === 'hard') this.destroyServices(record, variables);
    this.startServices(record, variables);
    if (runHooks) this.runHooks(mode, record, variables);
    return variables;
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
    const written = this.environmentFileWriter.write(this.workspace.manifest, record.directory, variables);
    for (const file of written) this.terminal.step(`rendered ${file}`);
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
