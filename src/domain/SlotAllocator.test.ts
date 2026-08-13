import { describe, expect, it } from 'vitest';
import { SbxError } from '@/domain/SbxError.js';
import { SlotAllocator } from '@/domain/SlotAllocator.js';

describe('SlotAllocator', () => {
  it('starts from slot 1 (slot 0 is the host)', () => {
    expect(new SlotAllocator(9).allocate([])).toBe(1);
  });

  it('picks the lowest free slot', () => {
    expect(new SlotAllocator(9).allocate([1, 2, 3])).toBe(4);
  });

  it('fills gaps rather than always incrementing', () => {
    expect(new SlotAllocator(9).allocate([1, 3, 4])).toBe(2);
    expect(new SlotAllocator(9).allocate([2, 3, 4])).toBe(1);
  });

  it('accepts any iterable', () => {
    expect(new SlotAllocator(9).allocate(new Set([1, 2]))).toBe(3);
  });

  it('throws when every slot is taken', () => {
    expect(() => new SlotAllocator(3).allocate([1, 2, 3])).toThrow(SbxError);
  });
});
