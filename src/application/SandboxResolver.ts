import fs from 'node:fs';
import path from 'node:path';
import { ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { ProjectManifest } from '@/domain/ProjectManifest.js';
import { type SandboxRecord } from '@/domain/SandboxRecord.js';
import { SbxError } from '@/domain/SbxError.js';
import { type DockerAvailability } from '@/infrastructure/DockerAvailability.js';
import { GitClones } from '@/infrastructure/GitClones.js';
import { type HomePath } from '@/infrastructure/HomePath.js';
import { JsonSandboxRegistry } from '@/infrastructure/JsonSandboxRegistry.js';
import { type ProcessRunner } from '@/infrastructure/ProcessRunner.js';

const MANIFEST_FILENAME = 'sandbox.config.json';
const SPEC_SHAPE = 'A sandbox is `<name>` or `<project>/<name>`, as in `lane-a` or `tscaps/lane-a`.';

export interface ResolveOptions {
  /**
   * When true (the default) the sandbox's clone must still be on disk.
   * `sbx delete` sets this to false because it is exactly what is called
   * to clean up after a clone that vanished.
   */
  readonly requireClone?: boolean;
}

export interface ResolvedSandbox {
  readonly projectName: string;
  readonly record: SandboxRecord;
  readonly workspace: ProjectWorkspace;
  /** Git operations on the project's host clone. */
  readonly hostClones: GitClones;
  /** True when the workspace was built from the sandbox itself because no host was reachable. */
  readonly hostMissing: boolean;
}

interface Candidate {
  projectName: string;
  record: SandboxRecord;
}

/**
 * Finds a sandbox anywhere on this machine and builds the workspace and
 * git handles that act on it.
 *
 * A sandbox is addressed either as `<name>` (when the name is unique
 * across projects) or as `<project>/<name>` (always unambiguous). Bare
 * names resolve to the current project when the tool was invoked from
 * inside one, which keeps day-to-day use identical to the local flow
 * even in a house that has other projects.
 *
 * When the target sandbox belongs to the same project as the workspace
 * sbx was invoked in, that local workspace is reused verbatim. Every
 * subtle edge case the local flow already handles — a clone the user
 * removed by hand, a manifest that fails to parse partway through —
 * therefore keeps behaving the way it always did.
 *
 * Otherwise the workspace is built from the host project's manifest when
 * the host clone can be found, or from the sandbox's own committed
 * manifest as a last resort — enough to tear down what remains.
 */
export class SandboxResolver {
  private readonly homePath: HomePath;
  private readonly processRunner: ProcessRunner;
  private readonly dockerAvailability: DockerAvailability;
  private readonly preferredWorkspace: ProjectWorkspace | null;
  private readonly preferredProject: string | null;

  constructor(
    homePath: HomePath,
    processRunner: ProcessRunner,
    dockerAvailability: DockerAvailability,
    preferredWorkspace: ProjectWorkspace | null,
  ) {
    this.homePath = homePath;
    this.processRunner = processRunner;
    this.dockerAvailability = dockerAvailability;
    this.preferredWorkspace = preferredWorkspace;
    this.preferredProject = preferredWorkspace ? preferredWorkspace.manifest.name() : null;
  }

  resolve(spec: string, options: ResolveOptions = {}): ResolvedSandbox {
    const parsed = this.parseSpec(spec);
    const candidates = this.findCandidates(parsed.project, parsed.name);
    if (candidates.length === 0) throw this.notFound(spec, parsed);
    const only = candidates[0];
    const chosen = candidates.length === 1 && only ? only : this.pickAmongMany(candidates, spec, parsed);
    const resolved = this.buildResolved(chosen);
    if (options.requireClone !== false) this.rejectMissingClone(resolved);
    return resolved;
  }

  private parseSpec(spec: string): { project: string | null; name: string } {
    const slash = spec.indexOf('/');
    if (slash < 0) return { project: null, name: spec };
    const project = spec.slice(0, slash);
    const name = spec.slice(slash + 1);
    if (!project || !name || name.includes('/')) {
      throw new SbxError(`"${spec}" is not a valid sandbox reference.`, SPEC_SHAPE);
    }
    return { project, name };
  }

  private findCandidates(project: string | null, name: string): Candidate[] {
    const projectNames = project ? [project] : this.homePath.knownProjectNames();
    const matches: Candidate[] = [];
    for (const projectName of projectNames) {
      const registry = this.registryFor(projectName);
      let record: SandboxRecord | null;
      try {
        record = registry.find(name);
      } catch {
        continue;
      }
      if (record) matches.push({ projectName, record });
    }
    return matches;
  }

  private pickAmongMany(candidates: Candidate[], spec: string, parsed: { project: string | null; name: string }): Candidate {
    if (parsed.project === null && this.preferredProject !== null) {
      const local = candidates.find((candidate) => candidate.projectName === this.preferredProject);
      if (local) return local;
    }
    const listing = candidates.map((candidate) => `${candidate.projectName}/${candidate.record.name}`).join(', ');
    throw new SbxError(
      `"${spec}" matches ${String(candidates.length)} sandboxes: ${listing}.`,
      'Address it as `<project>/<name>` to pick one.',
    );
  }

  private notFound(spec: string, parsed: { project: string | null; name: string }): SbxError {
    if (parsed.project) {
      return new SbxError(
        `No sandbox "${parsed.name}" in project "${parsed.project}".`,
        `Run \`sbx list --all\` to see every sandbox on this machine.`,
      );
    }
    return new SbxError(
      `No sandbox named "${spec}" on this machine.`,
      `Run \`sbx list --all\` to see what is here, or \`sbx create ${spec}\` inside a project to make one.`,
    );
  }

  private registryFor(projectName: string): JsonSandboxRegistry {
    return new JsonSandboxRegistry(path.join(this.homePath.stateDirectoryFor(projectName), 'state.json'));
  }

  /**
   * When the target sandbox belongs to the project sbx was invoked
   * inside, the current workspace already has everything the command
   * needs. Reusing it means the local flow keeps its exact behavior —
   * same manifest, same git handles — even when the resolver runs.
   *
   * Otherwise the workspace is built from the host clone if we can find
   * it (via `git remote get-url host` on any of that project's live
   * clones), and from the sandbox's own manifest as a last resort so a
   * broken source repository does not block cleanup.
   */
  private buildResolved(candidate: Candidate): ResolvedSandbox {
    if (this.preferredWorkspace && candidate.projectName === this.preferredProject && !this.preferredWorkspace.enclosingSandbox()) {
      // The current workspace is the actual host of the target's project.
      // Reusing it means the local flow keeps its exact behavior for the
      // common case. When cwd is inside a sandbox the manifest was loaded
      // from a clone, not the host — the shortcut would then point git
      // operations at the wrong repository, so we fall through to global
      // discovery which finds the real host through `git remote host`.
      return {
        projectName: candidate.projectName,
        record: candidate.record,
        workspace: this.preferredWorkspace,
        hostClones: this.preferredWorkspace.clones,
        hostMissing: false,
      };
    }
    const hostDirectory = this.discoverHostDirectory(candidate);
    const hostMissing = hostDirectory === null;
    const manifestSource = hostDirectory ?? candidate.record.directory;
    const manifest = this.loadManifest(manifestSource, candidate);
    const hostClones = new GitClones(this.processRunner, manifestSource);
    const workspace = new ProjectWorkspace(manifest, this.homePath, this.processRunner, this.dockerAvailability, hostClones);
    return { projectName: candidate.projectName, record: candidate.record, workspace, hostClones, hostMissing };
  }

  private discoverHostDirectory(candidate: Candidate): string | null {
    const own = this.hostUrlFrom(candidate.record.directory);
    if (own) return own;
    const registry = this.registryFor(candidate.projectName);
    for (const record of registry.list()) {
      if (record.name === candidate.record.name) continue;
      const url = this.hostUrlFrom(record.directory);
      if (url) return url;
    }
    return null;
  }

  private hostUrlFrom(cloneDirectory: string): string | null {
    if (!fs.existsSync(cloneDirectory)) return null;
    const probe = new GitClones(this.processRunner, cloneDirectory);
    const url = probe.remoteUrl('host', cloneDirectory);
    if (!url) return null;
    if (!fs.existsSync(url)) return null;
    return url;
  }

  private loadManifest(directory: string, candidate: Candidate): ProjectManifest {
    const manifestPath = path.join(directory, MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) {
      throw new SbxError(
        `Sandbox "${candidate.projectName}/${candidate.record.name}" cannot be reached: no ${MANIFEST_FILENAME} at ${directory}, and no other clone of "${candidate.projectName}" is available to load it from.`,
        `Run \`sbx delete ${candidate.projectName}/${candidate.record.name} --force\` to drop the registry entry, then remove ${candidate.record.directory} by hand if it is still there.`,
      );
    }
    let contents: string;
    try {
      contents = fs.readFileSync(manifestPath, 'utf8');
    } catch (error) {
      throw new SbxError(`${manifestPath} could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new SbxError(
        `${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        'JSON allows no comments and no trailing commas.',
      );
    }
    return new ProjectManifest(parsed, directory);
  }

  private rejectMissingClone(resolved: ResolvedSandbox): void {
    if (resolved.workspace.hasClone(resolved.record)) return;
    throw new SbxError(
      `Sandbox "${resolved.projectName}/${resolved.record.name}" is registered, but its clone is gone from ${resolved.record.directory}.`,
      `Something removed it outside sbx. \`sbx delete ${resolved.projectName}/${resolved.record.name} --force\` drops the stale entry, and \`sbx create ${resolved.record.name}\` builds it again.`,
    );
  }
}
