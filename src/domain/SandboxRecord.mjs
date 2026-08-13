/**
 * One sandbox as it is persisted between invocations. Holds only what
 * cannot be recomputed: the slot it owns, where its clone lives, and the
 * secrets minted for it.
 *
 * The branch is deliberately absent. A sandbox is a lane rather than a
 * feature: branches come and go inside it, and a copy written down at
 * creation would be a lie by the second day. It is read from the clone
 * whenever it is needed.
 *
 * The generated secrets are stored rather than re-derived because rotating
 * them between runs would invalidate every session and every encrypted
 * value the sandbox produced before.
 */
export class SandboxRecord {
  constructor({ name, slot, directory, createdAt, generatedSecrets }) {
    this.name = name;
    this.slot = slot;
    this.directory = directory;
    this.createdAt = createdAt;
    this.generatedSecrets = generatedSecrets ?? {};
  }

  static fromJson(name, json) {
    return new SandboxRecord({ name, ...json });
  }

  toJson() {
    return {
      slot: this.slot,
      directory: this.directory,
      createdAt: this.createdAt,
      generatedSecrets: this.generatedSecrets,
    };
  }
}
