/**
 * One sandbox as it is persisted between invocations. Holds only what
 * cannot be recomputed: the slot it owns, where its worktree lives, the
 * branch it is on, and the secrets minted for it.
 *
 * The generated secrets are stored rather than re-derived because rotating
 * them between runs would invalidate every session and every encrypted
 * value the sandbox produced before.
 */
export class SandboxRecord {
  constructor({ name, slot, worktree, branch, createdAt, generatedSecrets }) {
    this.name = name;
    this.slot = slot;
    this.worktree = worktree;
    this.branch = branch;
    this.createdAt = createdAt;
    this.generatedSecrets = generatedSecrets ?? {};
  }

  static fromJson(name, json) {
    return new SandboxRecord({ name, ...json });
  }

  toJson() {
    return {
      slot: this.slot,
      worktree: this.worktree,
      branch: this.branch,
      createdAt: this.createdAt,
      generatedSecrets: this.generatedSecrets,
    };
  }
}
