import { SbxError } from '@/domain/SbxError.js';

const DEFAULT_STRIDE = 10;
const DEFAULT_MAX_SLOTS = 9;
const HOOK_PHASES = new Set(['prepare', 'populate']);

export type HookPhase = 'prepare' | 'populate';

export interface Hook {
  readonly name: string;
  readonly phase: HookPhase;
  readonly run: string;
}

export interface EnvFileEntry {
  readonly from: string;
  readonly to: string;
}

export type BasePorts = Record<string, number>;
export type PortEnvNames = Record<string, string>;
export type StaticVariables = Record<string, string>;
export type GenerateSpec = Record<string, number>;

interface RawPorts {
  base?: BasePorts;
  env?: PortEnvNames;
  stride?: number;
  maxSlots?: number;
}

interface RawManifest {
  name?: string;
  ports?: RawPorts;
  hooks?: unknown;
  sandboxRoot?: string;
  compose?: string;
  env?: EnvFileEntry[];
  generate?: GenerateSpec;
  variables?: StaticVariables;
  secrets?: string;
}

/**
 * Validated view over a project's `sandbox.config.json`. Every accessor
 * returns a value the rest of the tool can use without re-checking it;
 * anything missing or malformed fails here, naming the offending field.
 *
 * Relative paths in the manifest are resolved against the directory the
 * manifest was found in, which is treated as the project root.
 */
export class ProjectManifest {
  private readonly raw: RawManifest;
  private readonly _name: string;
  private readonly _basePorts: BasePorts;
  private readonly _hooks: readonly Hook[];
  readonly rootDirectory: string;

  constructor(raw: unknown, rootDirectory: string) {
    this.raw = normalizeRaw(raw);
    this.rootDirectory = rootDirectory;
    this._name = this.requireName();
    const ports = this.requirePorts();
    this._basePorts = this.requireBasePorts(ports);
    this._hooks = this.requireHooks();
  }

  private requireName(): string {
    const value = this.raw.name;
    if (typeof value !== 'string' || value.length === 0) {
      throw new SbxError(
        'sandbox.config.json: `name` is missing.',
        'It must be a non-empty string — it names the state directory and the Compose projects.',
      );
    }
    return value;
  }

  private requirePorts(): RawPorts {
    const ports = this.raw.ports;
    if (!ports || typeof ports !== 'object') {
      throw new SbxError(
        'sandbox.config.json: `ports` is missing.',
        'Declare at least `ports.base`, mapping one role to the port it uses today.',
      );
    }
    return ports;
  }

  private requireBasePorts(ports: RawPorts): BasePorts {
    const base = ports.base;
    if (!base || Object.keys(base).length === 0) {
      throw new SbxError(
        'sandbox.config.json: `ports.base` is empty.',
        'Map at least one role to the port it uses today, as in `"base": { "api": 3000 }`.',
      );
    }
    for (const [role, port] of Object.entries(base)) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new SbxError(
          `sandbox.config.json: \`ports.base.${role}\` is not a port number.`,
          'It must be an integer between 1 and 65535.',
        );
      }
    }
    return base;
  }

  private requireHooks(): readonly Hook[] {
    const hooks = this.raw.hooks;
    if (hooks === undefined) return [];
    if (!Array.isArray(hooks)) {
      throw new SbxError(
        'sandbox.config.json: `hooks` must be an array.',
        'Each entry is `{ "name": "...", "phase": "prepare" | "populate", "run": "..." }`.',
      );
    }
    const seen = new Set<string>();
    const validated: Hook[] = [];
    for (let index = 0; index < hooks.length; index += 1) {
      const raw = hooks[index] as Partial<Hook> | null | undefined;
      const where = `sandbox.config.json: \`hooks[${String(index)}]\``;
      if (!raw || typeof raw !== 'object') {
        throw new SbxError(
          `${where} is not an object.`,
          'Each entry is `{ "name": "...", "phase": "prepare" | "populate", "run": "..." }`.',
        );
      }
      if (typeof raw.name !== 'string' || raw.name.length === 0) {
        throw new SbxError(`${where}.name is missing.`, 'A non-empty string used in logs and error messages.');
      }
      if (seen.has(raw.name)) {
        throw new SbxError(`${where}.name "${raw.name}" is already used.`, 'Every hook name must be unique.');
      }
      seen.add(raw.name);
      if (typeof raw.phase !== 'string' || !HOOK_PHASES.has(raw.phase)) {
        throw new SbxError(
          `${where}.phase must be "prepare" or "populate".`,
          '`prepare` runs on every `sbx rebuild`; `populate` also runs with --data and --hard.',
        );
      }
      if (typeof raw.run !== 'string' || raw.run.length === 0) {
        throw new SbxError(`${where}.run is missing.`, 'A non-empty shell command line.');
      }
      validated.push({ name: raw.name, phase: raw.phase, run: raw.run });
    }
    return validated;
  }

  name(): string {
    return this._name;
  }

  basePorts(): BasePorts {
    return this._basePorts;
  }

  /**
   * Environment variable each port role is published under. A role with no
   * entry in `ports.env` falls back to its own name in upper snake case
   * plus `_PORT`, so a manifest only spells out the names that do not
   * follow that shape.
   */
  portVariableNames(): PortEnvNames {
    const configured = this.raw.ports?.env ?? {};
    const names: PortEnvNames = {};
    for (const role of Object.keys(this._basePorts)) {
      names[role] = configured[role] ?? this.defaultVariableNameFor(role);
    }
    return names;
  }

  defaultVariableNameFor(role: string): string {
    return `${role.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_PORT`;
  }

  portStride(): number {
    return this.raw.ports?.stride ?? DEFAULT_STRIDE;
  }

  maxSlots(): number {
    return this.raw.ports?.maxSlots ?? DEFAULT_MAX_SLOTS;
  }

  /** Where sandbox clones are created, or null to fall back to the tool's own default. */
  sandboxRoot(): string | null {
    return this.raw.sandboxRoot ?? null;
  }

  /** Compose file describing the stateful services, or null when the project needs none. */
  composeFile(): string | null {
    return this.raw.compose ?? null;
  }

  /** Files to render into each sandbox, as `{ from, to }` pairs of project-relative paths. */
  environmentFiles(): readonly EnvFileEntry[] {
    return this.raw.env ?? [];
  }

  /** Variable name to byte length, for secrets minted once per sandbox. */
  generatedSecrets(): GenerateSpec {
    return this.raw.generate ?? {};
  }

  /**
   * Fixed values every sandbox of this project gets, for settings that
   * belong to the repository rather than to the machine — a shared build
   * cache directory, a log level, a feature flag.
   */
  staticVariables(): StaticVariables {
    return this.raw.variables ?? {};
  }

  /** Path to the shared secrets file, or null to fall back to the tool's own default. */
  secretsFile(): string | null {
    return this.raw.secrets ?? null;
  }

  /** Every declared hook, in order, as `{ name, phase, run }`. */
  hooks(): readonly Hook[] {
    return this._hooks;
  }

  /** Hooks in the given phase, in declaration order. */
  hooksForPhase(phase: HookPhase): readonly Hook[] {
    return this._hooks.filter((hook) => hook.phase === phase);
  }
}

function normalizeRaw(raw: unknown): RawManifest {
  if (raw === null || typeof raw !== 'object') return {};
  return raw;
}
