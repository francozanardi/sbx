import { describe, expect, it } from 'vitest';
import { PortBlock } from '@/domain/PortBlock.js';

describe('PortBlock', () => {
  it('slot 0 uses the base ports unchanged', () => {
    const block = new PortBlock({ api: 3000, db: 5432 }, 10, 0);
    expect(block.resolve()).toEqual({ api: 3000, db: 5432 });
  });

  it('shifts every port by slot * stride', () => {
    const block = new PortBlock({ api: 3000, db: 5432 }, 10, 3);
    expect(block.resolve()).toEqual({ api: 3030, db: 5462 });
  });

  it('ports() returns values in ascending order', () => {
    const block = new PortBlock({ high: 5000, low: 3000, mid: 4000 }, 10, 2);
    expect(block.ports()).toEqual([3020, 4020, 5020]);
  });

  it('overlapWith is empty when slots do not collide', () => {
    const a = new PortBlock({ api: 3000 }, 10, 1);
    const b = new PortBlock({ api: 3000 }, 10, 2);
    expect(a.overlapWith(b)).toEqual([]);
  });

  it('overlapWith surfaces every shared port', () => {
    const a = new PortBlock({ api: 3000, db: 5000 }, 100, 1);
    const b = new PortBlock({ api: 3100 }, 100, 0);
    expect(a.overlapWith(b)).toEqual([3100]);
  });

  it('detects overlap when stride is smaller than the gap between base ports', () => {
    // ports {api:3000, db:3020}; stride 10 puts slot 2's db (3040) inside slot 4's api range? No,
    // slot 2 = {3020, 3040}, slot 4 = {3040, 3060} → 3040 collides.
    const a = new PortBlock({ api: 3000, db: 3020 }, 10, 2);
    const b = new PortBlock({ api: 3000, db: 3020 }, 10, 4);
    expect(a.overlapWith(b)).toEqual([3040]);
  });
});
