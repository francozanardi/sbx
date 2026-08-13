import { type PortMap } from '@/domain/PortBlock.js';

export type GeneratedSecrets = Record<string, string>;

export interface SandboxRecordJson {
  slot: number;
  directory: string;
  createdAt: string;
  ports: PortMap;
  generatedSecrets: GeneratedSecrets;
}

export interface SandboxRecordInit {
  name: string;
  slot: number;
  directory: string;
  createdAt: string;
  ports?: PortMap;
  generatedSecrets?: GeneratedSecrets;
}

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
 *
 * The ports are the one derived value kept here, and only so that the
 * derivation can be checked against it: they follow from the slot and the
 * manifest, so editing the manifest moves them under a sandbox that is
 * already running on the old ones.
 */
export class SandboxRecord {
  readonly name: string;
  readonly slot: number;
  readonly directory: string;
  readonly createdAt: string;
  readonly ports: PortMap;
  readonly generatedSecrets: GeneratedSecrets;

  constructor({ name, slot, directory, createdAt, ports, generatedSecrets }: SandboxRecordInit) {
    this.name = name;
    this.slot = slot;
    this.directory = directory;
    this.createdAt = createdAt;
    this.ports = ports ?? {};
    this.generatedSecrets = generatedSecrets ?? {};
  }

  static fromJson(name: string, json: SandboxRecordJson): SandboxRecord {
    return new SandboxRecord({ name, ...json });
  }

  /** The same sandbox, recorded as being on the given ports from now on. */
  withPorts(ports: PortMap): SandboxRecord {
    return new SandboxRecord({
      name: this.name,
      slot: this.slot,
      directory: this.directory,
      createdAt: this.createdAt,
      ports,
      generatedSecrets: this.generatedSecrets,
    });
  }

  toJson(): SandboxRecordJson {
    return {
      slot: this.slot,
      directory: this.directory,
      createdAt: this.createdAt,
      ports: this.ports,
      generatedSecrets: this.generatedSecrets,
    };
  }
}
