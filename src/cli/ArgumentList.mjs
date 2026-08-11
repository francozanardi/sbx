import { SbxError } from '../domain/SbxError.mjs';

const FLAGS_TAKING_A_VALUE = new Set(['branch', 'from']);

/**
 * The command line split into the parts a command cares about: the
 * positional arguments, the flags, and everything after a bare `--`, which
 * is forwarded to a child process untouched.
 *
 * Flags are `--name=value` or `--name value` for the few that take one, and
 * `--name` for the rest. Anything else is positional.
 */
export class ArgumentList {
  constructor(tokens) {
    this.positionals = [];
    this.flags = {};
    this.passthrough = [];
    this.parse(tokens);
  }

  parse(tokens) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === '--') {
        this.passthrough = tokens.slice(index + 1);
        return;
      }
      if (token.startsWith('--')) {
        index = this.parseFlag(tokens, index);
        continue;
      }
      this.positionals.push(token);
    }
  }

  /** @returns the index of the last token this flag consumed. */
  parseFlag(tokens, index) {
    const token = tokens[index].slice(2);
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
  require(position, description) {
    const value = this.positionals[position];
    if (value === undefined) throw new SbxError(`Missing ${description}.`, 'Run `sbx help` for the shape of each command.');
    return value;
  }

  at(position) {
    return this.positionals[position] ?? null;
  }

  flag(name, fallback = null) {
    return this.flags[name] ?? fallback;
  }

  hasFlag(name) {
    return this.flags[name] === true;
  }
}
