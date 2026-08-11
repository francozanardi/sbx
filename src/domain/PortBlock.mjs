/**
 * The ports one sandbox occupies, derived from the project's base ports
 * shifted by the sandbox slot. Slot 0 resolves to the base ports
 * themselves, which is what a plain checkout of the project uses.
 */
export class PortBlock {
  /**
   * @param basePorts Map of role name to the port the project uses by default.
   * @param stride How far apart two consecutive slots sit. Must exceed the
   *   widest gap between two base ports for the blocks to stay interleaved
   *   without overlapping.
   * @param slot Zero-based index of this sandbox.
   */
  constructor(basePorts, stride, slot) {
    this.basePorts = basePorts;
    this.stride = stride;
    this.slot = slot;
  }

  /** Map of role name to the port this sandbox binds for it. */
  resolve() {
    const resolved = {};
    for (const [role, base] of Object.entries(this.basePorts)) {
      resolved[role] = base + this.stride * this.slot;
    }
    return resolved;
  }

  /** Every port this sandbox binds, in ascending order. */
  ports() {
    return Object.values(this.resolve()).sort((left, right) => left - right);
  }

  /** Ports this block shares with another one. Empty when the two can run side by side. */
  overlapWith(other) {
    const taken = new Set(other.ports());
    return this.ports().filter((port) => taken.has(port));
  }
}
