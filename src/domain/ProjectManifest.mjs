import { SbxError } from './SbxError.mjs';

const DEFAULT_STRIDE = 10;
const DEFAULT_MAX_SLOTS = 9;

/**
 * Validated view over a project's `sandbox.config.mjs`. Every accessor
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
      throw new SbxError('sandbox.config.mjs: `name` is missing.', 'It must be a non-empty string — it names the state directory and the Compose projects.');
    }
    const ports = this.raw.ports;
    if (!ports || typeof ports !== 'object') {
      throw new SbxError('sandbox.config.mjs: `ports` is missing.', 'Declare at least `ports.base`, mapping one role to the port it uses today.');
    }
    this.validatePortRoles(ports);
  }

  validatePortRoles(ports) {
    const base = ports.base;
    if (!base || Object.keys(base).length === 0) {
      throw new SbxError('sandbox.config.mjs: `ports.base` is empty.', 'Map at least one role to the port it uses today, as in `base: { api: 3000 }`.');
    }
    for (const [role, port] of Object.entries(base)) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new SbxError(`sandbox.config.mjs: \`ports.base.${role}\` is not a port number.`, 'It must be an integer between 1 and 65535.');
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

  /** Where worktrees are created, or null to fall back to the tool's own default. */
  worktreeRoot() {
    return this.raw.worktreeRoot ?? null;
  }

  /** Compose file describing the stateful services, or null when the project needs none. */
  composeFile() {
    return this.raw.compose ?? null;
  }

  /** Files to render into each worktree, as `{ from, to }` pairs of project-relative paths. */
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

  /** Shell command registered under the given lifecycle hook, or null when unset. */
  hook(hookName) {
    return this.raw.hooks?.[hookName] ?? null;
  }
}
