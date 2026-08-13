export type PortMap = Record<string, number>;

/**
 * The ports one sandbox occupies, derived from the project's base ports
 * shifted by the sandbox slot. Slot 0 resolves to the base ports
 * themselves, which is what a plain checkout of the project uses.
 */
export class PortBlock {
  readonly basePorts: PortMap;
  readonly stride: number;
  readonly slot: number;

  /**
   * @param basePorts Map of role name to the port the project uses by default.
   * @param stride How far apart two consecutive slots sit. Must exceed the
   *   widest gap between two base ports for the blocks to stay interleaved
   *   without overlapping.
   * @param slot Zero-based index of this sandbox.
   */
  constructor(basePorts: PortMap, stride: number, slot: number) {
    this.basePorts = basePorts;
    this.stride = stride;
    this.slot = slot;
  }

  /** Map of role name to the port this sandbox binds for it. */
  resolve(): PortMap {
    const resolved: PortMap = {};
    for (const [role, base] of Object.entries(this.basePorts)) {
      resolved[role] = base + this.stride * this.slot;
    }
    return resolved;
  }

  /** Every port this sandbox binds, in ascending order. */
  ports(): number[] {
    return Object.values(this.resolve()).sort((left, right) => left - right);
  }

  /**
   * Roles whose port has moved since the given map was recorded, phrased
   * as `role was → is`.
   *
   * A block is derived from the manifest on every read, so editing
   * `ports.base` or `ports.stride` silently renumbers every sandbox that
   * already exists. Comparing against what a sandbox was built with is the
   * only way to notice.
   */
  movedFrom(recorded: PortMap): string[] {
    return Object.entries(this.resolve())
      .filter(([role, port]) => role in recorded && recorded[role] !== port)
      .map(([role, port]) => `${role} ${String(recorded[role])} → ${port}`);
  }

  /** Ports this block shares with another one. Empty when the two can run side by side. */
  overlapWith(other: PortBlock): number[] {
    const taken = new Set(other.ports());
    return this.ports().filter((port) => taken.has(port));
  }
}
