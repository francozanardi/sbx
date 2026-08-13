import fs from 'node:fs';
import path from 'node:path';
import { SandboxRecord, type SandboxRecordJson } from '@/domain/SandboxRecord.js';
import { SbxError } from '@/domain/SbxError.js';

const CURRENT_VERSION = 1;

interface RegistryState {
  version: number;
  sandboxes: Record<string, SandboxRecordJson>;
}

/**
 * Stores the sandboxes of one project in a JSON file outside any sandbox,
 * so the record survives deleting the checkout it describes.
 *
 * Writes go through a temporary file and a rename, because a half-written
 * registry would strand every sandbox it lists.
 */
export class JsonSandboxRegistry {
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  list(): SandboxRecord[] {
    const state = this.read();
    return Object.entries(state.sandboxes).map(([name, json]) => SandboxRecord.fromJson(name, json));
  }

  /** The named sandbox, or null when the project has none under that name. */
  find(name: string): SandboxRecord | null {
    return this.list().find((record) => record.name === name) ?? null;
  }

  /** The named sandbox. @throws when it does not exist. */
  get(name: string): SandboxRecord {
    const record = this.find(name);
    if (!record) {
      const known = this.list().map((entry) => entry.name);
      throw new SbxError(
        `No sandbox named "${name}".`,
        known.length > 0
          ? `This project has: ${known.join(', ')}.`
          : 'This project has none yet. Create one with `sbx create <name>`.',
      );
    }
    return record;
  }

  save(record: SandboxRecord): void {
    const state = this.read();
    state.sandboxes[record.name] = record.toJson();
    this.write(state);
  }

  remove(name: string): void {
    const state = this.read();
    const { [name]: _removed, ...rest } = state.sandboxes;
    state.sandboxes = rest;
    this.write(state);
  }

  /**
   * A registry that cannot be read would otherwise surface as a parser
   * message about a character position, with nothing tying it to the file
   * or to the sandboxes it strands.
   */
  private read(): RegistryState {
    if (!fs.existsSync(this.filePath)) return { version: CURRENT_VERSION, sandboxes: {} };
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (error) {
      throw new SbxError(
        `The sandbox registry at ${this.filePath} is not valid JSON: ${errorMessage(error)}`,
        'Fix the file, or delete it to start over — the sandboxes and containers it lists survive, but sbx will no longer know their names.',
      );
    }
    if (parsed === null || typeof parsed !== 'object') {
      throw new SbxError(
        `The sandbox registry at ${this.filePath} does not hold an object.`,
        'Delete it to start over.',
      );
    }
    const object = parsed as { version?: number; sandboxes?: Record<string, SandboxRecordJson> };
    return {
      version: object.version ?? CURRENT_VERSION,
      sandboxes: object.sandboxes ?? {},
    };
  }

  private write(state: RegistryState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temporaryPath, this.filePath);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
