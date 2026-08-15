import { ManifestField, MANIFEST_FILENAME } from '@/domain/ManifestField.js';
import { SbxError } from '@/domain/SbxError.js';

const DEFAULT_STRIDE = 10;
const DEFAULT_MAX_SLOTS = 9;
const MAX_PORT = 65535;
const MINIMUM_SECRET_BYTES = 16;
const MAXIMUM_SECRET_BYTES = 1024;
const HOOK_PHASES = new Set(['prepare', 'populate']);
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_VARIABLE_PREFIX = 'SBX_';

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

/**
 * Validated view over a project's `sandbox.config.json`. Every accessor
 * returns a value the rest of the tool can use without re-checking it;
 * anything missing or malformed fails when the offending field is asked
 * for, naming that field.
 *
 * Validation is lazy per field so a mistake in one section only breaks
 * commands that read that section: `sbx list` reports what the registry
 * knows even when a hook or a port variable is malformed. Commands that
 * need to walk the whole manifest ask `checkAll()` — that is what `sbx
 * doctor` uses to list every problem in one pass.
 *
 * Relative paths in the manifest are resolved against the directory the
 * manifest was found in, which is treated as the project root.
 */
export class ProjectManifest {
  readonly rootDirectory: string;
  private readonly root: ManifestField;

  private cachedName?: string;
  private cachedBasePorts?: BasePorts;
  private cachedPortStride?: number;
  private cachedMaxSlots?: number;
  private cachedPortVariableNames?: PortEnvNames;
  private cachedHooks?: readonly Hook[];
  private cachedEnvironmentFiles?: readonly EnvFileEntry[];
  private cachedGeneratedSecrets?: GenerateSpec;
  private cachedStaticVariables?: StaticVariables;
  private sandboxRootResolved = false;
  private cachedSandboxRoot: string | null = null;
  private composeFileResolved = false;
  private cachedComposeFile: string | null = null;
  private secretsFileResolved = false;
  private cachedSecretsFile: string | null = null;

  private portDomainChecked = false;
  private variableCollisionsChecked = false;

  constructor(raw: unknown, rootDirectory: string) {
    this.rootDirectory = rootDirectory;
    this.root = this.requireObject(raw);
  }

  name(): string {
    this.cachedName ??= this.root
      .at('name')
      .string('It names the state directory and the Compose project of every sandbox.');
    return this.cachedName;
  }

  basePorts(): BasePorts {
    const value = this.resolveBasePorts();
    this.ensurePortDomainValid();
    return value;
  }

  portStride(): number {
    const value = this.resolvePortStride();
    this.ensurePortDomainValid();
    return value;
  }

  maxSlots(): number {
    const value = this.resolveMaxSlots();
    this.ensurePortDomainValid();
    return value;
  }

  /** Environment variable each port role is published under. */
  portVariableNames(): PortEnvNames {
    const value = this.resolvePortVariableNames();
    this.ensureVariableCollisionsChecked();
    return value;
  }

  defaultVariableNameFor(role: string): string {
    return `${role.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_PORT`;
  }

  /** Where sandbox clones are created, or null to fall back to the tool's own default. */
  sandboxRoot(): string | null {
    if (!this.sandboxRootResolved) {
      this.cachedSandboxRoot = this.root
        .at('sandboxRoot')
        .optionalString('It is where sandbox clones are created. `~` is expanded; leave it out to use `~/sandboxes/<project>`.');
      this.sandboxRootResolved = true;
    }
    return this.cachedSandboxRoot;
  }

  /** Compose file describing the stateful services, or null when the project needs none. */
  composeFile(): string | null {
    if (!this.composeFileResolved) {
      this.cachedComposeFile = this.optionalRelativePath(
        this.root.at('compose'),
        "It is the path to the Compose file, relative to the repository root, and is read from each sandbox's own clone.",
      );
      this.composeFileResolved = true;
    }
    return this.cachedComposeFile;
  }

  /** Files to render into each sandbox, as `{ from, to }` pairs of project-relative paths. */
  environmentFiles(): readonly EnvFileEntry[] {
    this.cachedEnvironmentFiles ??= this.requireEnvironmentFiles(this.root.at('env'));
    return this.cachedEnvironmentFiles;
  }

  /** Variable name to byte length, for secrets minted once per sandbox. */
  generatedSecrets(): GenerateSpec {
    const value = this.resolveGeneratedSecrets();
    this.ensureVariableCollisionsChecked();
    return value;
  }

  /**
   * Fixed values every sandbox of this project gets, for settings that
   * belong to the repository rather than to the machine — a shared build
   * cache directory, a log level, a feature flag.
   */
  staticVariables(): StaticVariables {
    const value = this.resolveStaticVariables();
    this.ensureVariableCollisionsChecked();
    return value;
  }

  /** Path to the shared secrets file, or null to fall back to the tool's own default. */
  secretsFile(): string | null {
    if (!this.secretsFileResolved) {
      this.cachedSecretsFile = this.root
        .at('secrets')
        .optionalString('It is the path to the shared credentials file. `~` is expanded; leave it out to use `~/.sbx/<project>/secrets.env`.');
      this.secretsFileResolved = true;
    }
    return this.cachedSecretsFile;
  }

  /** Every declared hook, in order, as `{ name, phase, run }`. */
  hooks(): readonly Hook[] {
    this.cachedHooks ??= this.requireHooks(this.root.at('hooks'));
    return this.cachedHooks;
  }

  /** Hooks in the given phase, in declaration order. */
  hooksForPhase(phase: HookPhase): readonly Hook[] {
    return this.hooks().filter((hook) => hook.phase === phase);
  }

  /**
   * Walks every field to surface every validation error the manifest
   * carries. `sbx doctor` and any command that wants "validate the whole
   * file before doing work" call this; day-to-day commands rely on lazy
   * per-field validation instead.
   */
  checkAll(): void {
    this.name();
    this.basePorts();
    this.portStride();
    this.maxSlots();
    this.portVariableNames();
    this.hooks();
    this.environmentFiles();
    this.generatedSecrets();
    this.staticVariables();
    this.composeFile();
    this.sandboxRoot();
    this.secretsFile();
  }

  private requireObject(raw: unknown): ManifestField {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new SbxError(
        `${MANIFEST_FILENAME} does not hold a JSON object.`,
        'The whole file is one object, starting with `{` and declaring at least `name` and `ports.base`.',
      );
    }
    return new ManifestField('', raw);
  }

  private resolveBasePorts(): BasePorts {
    this.cachedBasePorts ??= this.requireBasePorts(this.root.at('ports'));
    return this.cachedBasePorts;
  }

  private resolvePortStride(): number {
    this.cachedPortStride ??= this.root
      .at('ports')
      .at('stride')
      .optionalInteger(
        'It is how far apart two consecutive slots sit. Leave it out to use the default of 10.',
        { min: 1, max: MAX_PORT },
        DEFAULT_STRIDE,
      );
    return this.cachedPortStride;
  }

  private resolveMaxSlots(): number {
    this.cachedMaxSlots ??= this.root
      .at('ports')
      .at('maxSlots')
      .optionalInteger(
        'It caps how many sandboxes this project can have at once. Leave it out to use the default of 9.',
        { min: 1, max: MAX_PORT },
        DEFAULT_MAX_SLOTS,
      );
    return this.cachedMaxSlots;
  }

  private resolvePortVariableNames(): PortEnvNames {
    this.cachedPortVariableNames ??= this.requirePortVariableNames(this.root.at('ports'), this.resolveBasePorts());
    return this.cachedPortVariableNames;
  }

  private resolveGeneratedSecrets(): GenerateSpec {
    this.cachedGeneratedSecrets ??= this.requireGeneratedSecrets(this.root.at('generate'));
    return this.cachedGeneratedSecrets;
  }

  private resolveStaticVariables(): StaticVariables {
    this.cachedStaticVariables ??= this.requireStaticVariables(this.root.at('variables'));
    return this.cachedStaticVariables;
  }

  private ensurePortDomainValid(): void {
    if (this.portDomainChecked) return;
    this.rejectCollidingPorts(this.resolveBasePorts(), this.resolvePortStride(), this.resolveMaxSlots());
    this.portDomainChecked = true;
  }

  private ensureVariableCollisionsChecked(): void {
    if (this.variableCollisionsChecked) return;
    this.rejectVariableCollisions(
      this.resolvePortVariableNames(),
      this.resolveGeneratedSecrets(),
      this.resolveStaticVariables(),
    );
    this.variableCollisionsChecked = true;
  }

  private requireBasePorts(ports: ManifestField): BasePorts {
    const base = ports.at('base');
    if (!base.present() || base.isEmptyObject()) {
      throw base.reject(
        'is missing',
        'Map at least one role to the port it uses today, as in `"base": { "api": 3000 }`.',
      );
    }
    const resolved: BasePorts = {};
    for (const [role, port] of base.entries('Each key is a role name and each value is the port it uses today.')) {
      resolved[role] = port.integer('Ports run from 1 to 65535. Use the port the project binds today.', {
        min: 1,
        max: MAX_PORT,
      });
    }
    return resolved;
  }

  /**
   * Environment variable each port role is published under. A role with no
   * entry in `ports.env` falls back to its own name in upper snake case
   * plus `_PORT`, so a manifest only spells out the names that do not
   * follow that shape.
   */
  private requirePortVariableNames(ports: ManifestField, basePorts: BasePorts): PortEnvNames {
    const configured = ports.at('env');
    for (const [role] of configured.optionalEntries('Each key is a role from `ports.base` and each value is the variable it is published under.')) {
      if (!(role in basePorts)) {
        throw configured.at(role).reject(
          `names a role \`ports.base\` does not declare (it has: ${Object.keys(basePorts).join(', ')})`,
          'Only roles with a base port can be published. Add the role to `ports.base`, or drop this entry.',
        );
      }
    }
    const names: PortEnvNames = {};
    for (const role of Object.keys(basePorts)) {
      const declared = configured.at(role);
      const name = declared.present()
        ? declared.string('It is the environment variable this role is published under, as in `"api": "HTTP_PORT"`.')
        : this.defaultVariableNameFor(role);
      this.rejectUnusableVariableName(
        name,
        declared.present() ? declared : ports.at('base').at(role),
        declared.present()
          ? 'Environment variables start with a letter or underscore and hold letters, digits and underscores.'
          : `The default variable name is derived from the role, and \`${role}\` yields \`${name}\`, which no process can read. Rename the role, or publish it explicitly with \`ports.env\`.`,
      );
      names[role] = name;
    }
    return names;
  }

  /**
   * Two roles collide whenever the distance between their base ports is an
   * exact multiple of the stride: role A at slot N then lands on the port
   * role B holds at slot N-k. Slot 0 is this checkout, so the cheapest
   * version of the bug — a sandbox stealing a port the developer's own
   * checkout is bound to — is included.
   */
  private rejectCollidingPorts(basePorts: BasePorts, stride: number, maxSlots: number): void {
    const roles = Object.entries(basePorts);
    for (const [index, left] of roles.entries()) {
      for (const right of roles.slice(index + 1)) this.rejectCollidingPair(left, right, stride, maxSlots);
    }
  }

  private rejectCollidingPair(
    [leftRole, leftPort]: [string, number],
    [rightRole, rightPort]: [string, number],
    stride: number,
    maxSlots: number,
  ): void {
    if (leftPort === rightPort) {
      throw new SbxError(
        `${MANIFEST_FILENAME}: \`ports.base.${leftRole}\` and \`ports.base.${rightRole}\` are both ${leftPort}.`,
        'Two roles on one port collide inside every sandbox, including this checkout. Give each role the port it actually binds today.',
      );
    }
    const distance = Math.abs(leftPort - rightPort);
    if (distance % stride !== 0) return;
    const slots = distance / stride;
    if (slots > maxSlots) return;
    const [lowRole, highRole] = leftPort < rightPort ? [leftRole, rightRole] : [rightRole, leftRole];
    throw new SbxError(
      `${MANIFEST_FILENAME}: \`ports.base.${leftRole}\` (${leftPort}) and \`ports.base.${rightRole}\` (${rightPort}) are ${distance} apart, an exact multiple of \`ports.stride\` (${stride}).`,
      `Every port shifts by slot × stride, so slot ${slots} would bind ${Math.max(leftPort, rightPort)} for \`${lowRole}\` — the port slot 0, this checkout, already uses for \`${highRole}\`. Move one base port, or pick a stride that does not divide ${distance}.`,
    );
  }

  private requireHooks(hooks: ManifestField): readonly Hook[] {
    const seen = new Set<string>();
    const validated: Hook[] = [];
    const shape = 'Each entry is `{ "name": "...", "phase": "prepare" | "populate", "run": "..." }`.';
    for (const entry of hooks.optionalElements(shape)) {
      const name = entry.at('name').string('A non-empty string, used in logs and error messages.');
      if (seen.has(name)) {
        throw entry.at('name').reject(`is "${name}", which is already used`, 'Every hook name must be unique.');
      }
      seen.add(name);
      const phase = entry.at('phase').string(shape);
      if (!HOOK_PHASES.has(phase)) {
        throw entry.at('phase').reject(
          `is "${phase}", which is not a phase`,
          '`prepare` runs on every `sbx rebuild`; `populate` also runs with --data and --hard.',
        );
      }
      validated.push({
        name,
        phase: phase as HookPhase,
        run: entry.at('run').string('A non-empty shell command line, run from the sandbox root.'),
      });
    }
    return validated;
  }

  private requireEnvironmentFiles(env: ManifestField): readonly EnvFileEntry[] {
    const shape = 'Each entry is `{ "from": "<template in the repo>", "to": "<path inside the sandbox>" }`.';
    const destinations = new Map<string, string>();
    return env.optionalElements(shape).map((entry) => {
      const from = this.requireRelativePath(
        entry.at('from'),
        'It is the template to render, as a path relative to the repository root. A sandbox reads it from its own clone, so it must be committed.',
      );
      const to = this.requireRelativePath(
        entry.at('to'),
        'It is where the rendered file lands, as a path relative to the sandbox root.',
      );
      const conflicting = destinations.get(to);
      if (conflicting !== undefined) {
        throw entry.at('to').reject(
          `is "${to}", which \`${conflicting}\` already renders into`,
          'Two templates writing one file means only the last one survives. Render them to different paths.',
        );
      }
      destinations.set(to, from);
      return { from, to };
    });
  }

  private requireGeneratedSecrets(generate: ManifestField): GenerateSpec {
    const spec: GenerateSpec = {};
    for (const [name, bytes] of generate.optionalEntries('Each key is a variable name and each value is how many random bytes it carries.')) {
      this.rejectUnusableVariableName(
        name,
        bytes,
        'The key becomes an environment variable, so it starts with a letter or underscore and holds letters, digits and underscores.',
      );
      spec[name] = bytes.integer(
        `Fewer than ${MINIMUM_SECRET_BYTES} bytes is not enough entropy for a signing key or a salt. 32 is a good default.`,
        { min: MINIMUM_SECRET_BYTES, max: MAXIMUM_SECRET_BYTES },
      );
    }
    return spec;
  }

  private requireStaticVariables(variables: ManifestField): StaticVariables {
    const declared: StaticVariables = {};
    for (const [name, value] of variables.optionalEntries('Each key is a variable name and each value is the fixed string every sandbox gets.')) {
      this.rejectUnusableVariableName(
        name,
        value,
        'The key becomes an environment variable, so it starts with a letter or underscore and holds letters, digits and underscores.',
      );
      declared[name] = value.string('Values are strings. Quote numbers and booleans — an environment variable is text.');
    }
    return declared;
  }

  private rejectUnusableVariableName(name: string, field: ManifestField, hint: string): void {
    if (!VARIABLE_NAME.test(name)) {
      throw field.reject(`would be published as \`${name}\`, which is not a usable variable name`, hint);
    }
    if (name.startsWith(RESERVED_VARIABLE_PREFIX)) {
      throw field.reject(
        `would be published as \`${name}\`, and the \`${RESERVED_VARIABLE_PREFIX}\` prefix is reserved`,
        'sbx sets SBX_PROJECT, SBX_NAME, SBX_SLOT, SBX_DIRECTORY and SBX_BRANCH itself, and they would overwrite this. Pick another name.',
      );
    }
  }

  /**
   * Names declared in one file that would land on top of each other are
   * always a typo: the map is built in a fixed order, so one of the two
   * simply never reaches a template.
   */
  private rejectVariableCollisions(
    portVariableNames: PortEnvNames,
    generatedSecrets: GenerateSpec,
    staticVariables: StaticVariables,
  ): void {
    const sources = new Map<string, string>();
    const claim = (name: string, source: string): void => {
      const owner = sources.get(name);
      if (owner !== undefined) {
        throw new SbxError(
          `${MANIFEST_FILENAME}: \`${name}\` is declared by both ${owner} and ${source}.`,
          'One value would silently overwrite the other. Declare it once.',
        );
      }
      sources.set(name, source);
    };
    for (const [role, name] of Object.entries(portVariableNames)) claim(name, `the \`${role}\` port`);
    for (const name of Object.keys(generatedSecrets)) claim(name, '`generate`');
    for (const name of Object.keys(staticVariables)) claim(name, '`variables`');
  }

  /**
   * A path that stays inside the directory it is resolved against. `to`
   * targets escaping the sandbox would write into the shared sandbox root,
   * where nothing ever cleans them up, and would not be visible as part of
   * the sandbox at all.
   */
  private optionalRelativePath(field: ManifestField, hint: string): string | null {
    return field.present() ? this.requireRelativePath(field, hint) : null;
  }

  private requireRelativePath(field: ManifestField, hint: string): string {
    const value = field.string(hint);
    const segments = value.split(/[/\\]/);
    const head = segments[0] ?? '';
    if (head === '' || /^[A-Za-z]:$/.test(head)) {
      throw field.reject(`is "${value}", an absolute path`, hint);
    }
    if (segments.includes('..')) {
      throw field.reject(
        `is "${value}", which climbs out of the directory it is resolved against`,
        `${hint} A \`..\` segment would put it somewhere no sandbox owns.`,
      );
    }
    return value;
  }
}
