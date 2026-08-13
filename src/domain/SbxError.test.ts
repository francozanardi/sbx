import { describe, expect, it } from 'vitest';
import { SbxError } from '@/domain/SbxError.js';

describe('SbxError', () => {
  it('carries a message and a hint', () => {
    const error = new SbxError('boom', 'try again');
    expect(error.message).toBe('boom');
    expect(error.hint).toBe('try again');
    expect(error.name).toBe('SbxError');
    expect(error).toBeInstanceOf(Error);
  });

  it('defaults hint to null when not provided', () => {
    const error = new SbxError('boom');
    expect(error.hint).toBeNull();
  });
});
