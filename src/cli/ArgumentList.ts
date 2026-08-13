import { SbxError } from '@/domain/SbxError.js';

const FLAGS_TAKING_A_VALUE = new Set(['branch', 'from']);

type FlagValue = string | boolean;

/**
 * The command line split into the parts a command cares about: the
 * positional arguments, the flags, and everything after a bare `--`, which
 * is forwarded to a child process untouched.
 *
 * Flags are `--name=value` or `--name value` for the few that take one, and
 * `--name` for the rest. Anything else is positional.
 */
export class ArgumentList {
  readonly positionals: string[] = [];
  readonly flags: Record<string, FlagValue> = {};
  passthrough: string[] = [];

  constructor(tokens: readonly string[]) {
    this.parse(tokens);
  }

  private parse(tokens: readonly string[]): void {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === undefined) continue;
      if (token === '--') {
        this.passthrough = tokens.slice(index + 1);
        return;
      }
      if (token.startsWith('--')) {
        index = this.parseFlag(token, tokens, index);
        continue;
      }
      this.positionals.push(token);
    }
  }

  /** @returns the index of the last token this flag consumed. */
  private parseFlag(rawToken: string, tokens: readonly string[], index: number): number {
    const token = rawToken.slice(2);
    const separator = token.indexOf('=');
    if (separator > 0) {
      this.flags[token.slice(0, separator)] = token.slice(separator + 1);
      return index;
    }
    const next = tokens[index + 1];
    if (FLAGS_TAKING_A_VALUE.has(token) && next !== undefined && !next.startsWith('-')) {
      this.flags[token] = next;
      return index + 1;
    }
    this.flags[token] = true;
    return index;
  }

  /** Positional at the given position. @throws with the given description when absent. */
  require(position: number, description: string): string {
    const value = this.positionals[position];
    if (value === undefined) {
      throw new SbxError(`Missing ${description}.`, 'Run `sbx help` for the shape of each command.');
    }
    return value;
  }

  at(position: number): string | null {
    return this.positionals[position] ?? null;
  }

  flag(name: string, fallback: string | null = null): string | null {
    const value = this.flags[name];
    if (typeof value === 'string') return value;
    return fallback;
  }

  hasFlag(name: string): boolean {
    return this.flags[name] === true;
  }
}
