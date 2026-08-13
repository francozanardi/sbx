import { SbxError } from '@/domain/SbxError.js';

export const MANIFEST_FILENAME = 'sandbox.config.json';

export interface IntegerRange {
  readonly min: number;
  readonly max: number;
}

/**
 * One field of `sandbox.config.json`, addressed by the path a reader would
 * use to find it, and checked before anything else is allowed to see it.
 *
 * Every rejection names that path and says what was there instead, so a
 * malformed manifest is reported as a statement about the file rather than
 * surfacing later as a type error from somewhere in the tool.
 *
 * Type checks live here; what the values *mean* lives in ProjectManifest.
 */
export class ManifestField {
  readonly path: string;
  private readonly raw: unknown;

  constructor(path: string, raw: unknown) {
    this.path = path;
    this.raw = raw;
  }

  /** False when the field is absent or explicitly null. */
  present(): boolean {
    return this.raw !== undefined && this.raw !== null;
  }

  /** @throws unless the field is a non-empty string. */
  string(hint: string): string {
    if (typeof this.raw !== 'string' || this.raw.length === 0) {
      throw this.failure(`must be a non-empty string, but is ${this.describe()}`, hint);
    }
    return this.raw;
  }

  /** The field as a non-empty string, or null when it is absent. */
  optionalString(hint: string): string | null {
    return this.present() ? this.string(hint) : null;
  }

  /** @throws unless the field is an integer inside the given range. */
  integer(hint: string, { min, max }: IntegerRange): number {
    if (typeof this.raw !== 'number' || !Number.isInteger(this.raw) || this.raw < min || this.raw > max) {
      throw this.failure(`must be an integer between ${min} and ${max}, but is ${this.describe()}`, hint);
    }
    return this.raw;
  }

  /** The field as an integer inside the given range, or `fallback` when absent. */
  optionalInteger(hint: string, range: IntegerRange, fallback: number): number {
    return this.present() ? this.integer(hint, range) : fallback;
  }

  /** The field's own entries, in declaration order, each addressable in turn. */
  entries(hint: string): [string, ManifestField][] {
    if (!this.isPlainObject(this.raw)) {
      throw this.failure(`must be an object, but is ${this.describe()}`, hint);
    }
    return Object.entries(this.raw).map(([key, value]) => [key, new ManifestField(this.childPath(key), value)]);
  }

  /** The field's entries, or none at all when it is absent. */
  optionalEntries(hint: string): [string, ManifestField][] {
    return this.present() ? this.entries(hint) : [];
  }

  /** The field's elements, in order, each addressable as `path[index]`. */
  elements(hint: string): ManifestField[] {
    if (!Array.isArray(this.raw)) {
      throw this.failure(`must be an array, but is ${this.describe()}`, hint);
    }
    return this.raw.map((element, index) => new ManifestField(`${this.path}[${index}]`, element));
  }

  /** The field's elements, or none at all when it is absent. */
  optionalElements(hint: string): ManifestField[] {
    return this.present() ? this.elements(hint) : [];
  }

  /** A field nested inside this one, addressed as `path.key`. */
  at(key: string): ManifestField {
    const container = this.isPlainObject(this.raw) ? this.raw : {};
    return new ManifestField(this.childPath(key), container[key]);
  }

  /** True when the field is an object with no keys of its own. */
  isEmptyObject(): boolean {
    return this.isPlainObject(this.raw) && Object.keys(this.raw).length === 0;
  }

  private childPath(key: string): string {
    return this.path.length > 0 ? `${this.path}.${key}` : key;
  }

  /** Rejects the field for a reason no type check covers. */
  reject(problem: string, hint: string): SbxError {
    return this.failure(problem, hint);
  }

  private failure(problem: string, hint: string): SbxError {
    return new SbxError(`${MANIFEST_FILENAME}: \`${this.path}\` ${problem}.`, hint);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /** What is actually there, phrased to sit inside "…but is ___". */
  private describe(): string {
    if (this.raw === undefined) return 'absent';
    if (this.raw === null) return 'null';
    if (typeof this.raw === 'string') return `the string ${JSON.stringify(this.raw)}`;
    if (Array.isArray(this.raw)) return 'an array';
    if (typeof this.raw === 'object') return 'an object';
    if (typeof this.raw === 'number' || typeof this.raw === 'boolean') return `\`${this.raw}\``;
    return `a ${typeof this.raw}`;
  }
}
