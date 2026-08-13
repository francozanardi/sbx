import { SbxError } from './SbxError.mjs';

const DEFAULT_STRIDE = 10;
const DEFAULT_MAX_SLOTS = 9;
const HOOK_PHASES = new Set(['prepare', 'populate']);

/**
 * Validated view over a project's `sandbox.config.json`. Every accessor
 * returns a value the rest of the tool can use without re-checking it;
 * anything missing or malformed fails here, naming the offending field.
 *
 * Relative paths in the manifest are resolved against the directory the
 * manifest was found in, which is treated as the project root.
 */
export class ProjectManifest {
  constructor(raw, rootDirectory) {
    this.raw = raw;
    this.rootDirectory = rootDirectory;
    this.validate();
  }

  validate() {
    if (typeof this.raw?.name !== 'string' || this.raw.name.length === 0) {
      throw new SbxError('sandbox.config.json: `name` is missing.', 'It must be a non-empty string — it names the state directory and the Compose projects.');
    }
    const ports = this.raw.ports;
    if (!ports || typeof ports !== 'object') {
      throw new SbxError('sandbox.config.json: `ports` is missing.', 'Declare at least `ports.base`, mapping one role to the port it uses today.');
    }
    this.validatePortRoles(ports);
    this.validateHooks();
  }

  /**
   * Hooks are an ordered list of `{ name, phase, run }` objects. The
   * position in the list is the order they run in. Phase decides which
   * `sbx rebuild` mode picks them up.
   */
  validateHooks() {
    const hooks = this.raw.hooks;
    if (hooks === undefined) return;
    if (!Array.isArray(hooks)) {
      throw new SbxError(
        'sandbox.config.json: `hooks` must be an array.',
        'Each entry is `{ "name": "...", "phase": "prepare" | "populate", "run": "..." }`.',
      );
    }
    const seen = new Set();
    for (let index = 0; index < hooks.length; index += 1) {
      const hook = hooks[index];
      const where = `sandbox.config.json: \`hooks[${index}]\``;
      if (!hook || typeof hook !== 'object') {
        throw new SbxError(`${where} is not an object.`, 'Each entry is `{ "name": "...", "phase": "prepare" | "populate", "run": "..." }`.');
      }
      if (typeof hook.name !== 'string' || hook.name.length === 0) {
        throw new SbxError(`${where}.name is missing.`, 'A non-empty string used in logs and error messages.');
      }
      if (seen.has(hook.name)) {
        throw new SbxError(`${where}.name "${hook.name}" is already used.`, 'Every hook name must be unique.');
      }
      seen.add(hook.name);
      if (!HOOK_PHASES.has(hook.phase)) {
        throw new SbxError(`${where}.phase must be "prepare" or "populate".`, '`prepare` runs on every `sbx rebuild`; `populate` also runs with --data and --hard.');
      }
      if (typeof hook.run !== 'string' || hook.run.length === 0) {
        throw new SbxError(`${where}.run is missing.`, 'A non-empty shell command line.');
      }
    }
  }

  validatePortRoles(ports) {
    const base = ports.base;
    if (!base || Object.keys(base).length === 0) {
      throw new SbxError('sandbox.config.json: `ports.base` is empty.', 'Map at least one role to the port it uses today, as in `"base": { "api": 3000 }`.');
    }
    for (const [role, port] of Object.entries(base)) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new SbxError(`sandbox.config.json: \`ports.base.${role}\` is not a port number.`, 'It must be an integer between 1 and 65535.');
      }
    }
  }

  name() {
    return this.raw.name;
  }

  basePorts() {
    return this.raw.ports.base;
  }

  /**
   * Environment variable each port role is published under. A role with no
   * entry in `ports.env` falls back to its own name in upper snake case
   * plus `_PORT`, so a manifest only spells out the names that do not
   * follow that shape.
   */
  portVariableNames() {
    const configured = this.raw.ports.env ?? {};
    const names = {};
    for (const role of Object.keys(this.basePorts())) {
      names[role] = configured[role] ?? this.defaultVariableNameFor(role);
    }
    return names;
  }

  defaultVariableNameFor(role) {
    return `${role.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_PORT`;
  }

  portStride() {
    return this.raw.ports.stride ?? DEFAULT_STRIDE;
  }

  maxSlots() {
    return this.raw.ports.maxSlots ?? DEFAULT_MAX_SLOTS;
  }

  /** Where sandbox clones are created, or null to fall back to the tool's own default. */
  sandboxRoot() {
    return this.raw.sandboxRoot ?? null;
  }

  /** Compose file describing the stateful services, or null when the project needs none. */
  composeFile() {
    return this.raw.compose ?? null;
  }

  /** Files to render into each sandbox, as `{ from, to }` pairs of project-relative paths. */
  environmentFiles() {
    return this.raw.env ?? [];
  }

  /** Variable name to byte length, for secrets minted once per sandbox. */
  generatedSecrets() {
    return this.raw.generate ?? {};
  }

  /**
   * Fixed values every sandbox of this project gets, for settings that
   * belong to the repository rather than to the machine — a shared build
   * cache directory, a log level, a feature flag.
   */
  staticVariables() {
    return this.raw.variables ?? {};
  }

  /** Path to the shared secrets file, or null to fall back to the tool's own default. */
  secretsFile() {
    return this.raw.secrets ?? null;
  }

  /** Every declared hook, in order, as `{ name, phase, run }`. */
  hooks() {
    return this.raw.hooks ?? [];
  }

  /** Hooks in the given phase, in declaration order. */
  hooksForPhase(phase) {
    return this.hooks().filter((hook) => hook.phase === phase);
  }
}
