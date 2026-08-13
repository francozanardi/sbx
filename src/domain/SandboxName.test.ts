import { describe, expect, it } from 'vitest';
import { SandboxName } from '@/domain/SandboxName.js';
import { SbxError } from '@/domain/SbxError.js';

describe('SandboxName', () => {
  it.each([
    ['a'],
    ['lane-a'],
    ['sb-1'],
    ['0'],
    ['abc123'],
    ['a'.repeat(31)],
  ])('accepts %s', (value) => {
    expect(new SandboxName(value).toString()).toBe(value);
  });

  it.each([
    ['', 'empty'],
    ['A', 'uppercase'],
    ['-a', 'leading dash'],
    ['a_b', 'underscore'],
    ['a b', 'space'],
    ['a.b', 'dot'],
    ['a'.repeat(32), 'too long'],
    [123, 'non-string'],
    [null, 'null'],
    [undefined, 'undefined'],
  ])('rejects %s (%s)', (value, _label) => {
    expect(() => new SandboxName(value)).toThrow(SbxError);
  });
});
