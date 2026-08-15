import fs from 'node:fs';
import { type Terminal } from '@/cli/Terminal.js';
import { type SandboxName } from '@/domain/SandboxName.js';
import { SandboxRecord } from '@/domain/SandboxRecord.js';
import { SlotAllocator } from '@/domain/SlotAllocator.js';
import { SbxError } from '@/domain/SbxError.js';
import { type GitClones } from '@/infrastructure/GitClones.js';
import { type PortProbe } from '@/infrastructure/PortProbe.js';
import { type SecretGenerator } from '@/infrastructure/SecretGenerator.js';
import { type ProjectWorkspace } from '@/application/ProjectWorkspace.js';
import { type SandboxRebuilder } from '@/application/SandboxRebuilder.js';

export interface SandboxCreatorDeps {
  workspace: ProjectWorkspace;
  clones: GitClones;
  rebuilder: SandboxRebuilder;
  secretGenerator: SecretGenerator;
  portProbe: PortProbe;
  terminal: Terminal;
}

export interface CreateOptions {
  branch: string | null;
  startPoint: string | null;
  runHooks: boolean;
}

/**
 * Brings a sandbox into existence: a clone of its own, a port block
 * nothing else is using, rendered env files, its stateful services, and
 * every hook the manifest declares.
 *
 * What is unique to a first run lives here: allocating the slot, cloning
 * the repository, minting the secrets. Everything else is delegated to
 * the rebuilder so the same code that later re-converges a sandbox is
 * the one that converges it the first time.
 *
 * Anything a manifest lookup can throw from — the port block, the
 * generated secrets — is read *before* the clone, so a broken manifest
 * fails without touching disk. Once the clone lands the registry entry
 * is written straight away, so a rebuild that fails halfway still
 * leaves an entry `sbx delete` can clean up.
 */
export class SandboxCreator {
  private readonly workspace: ProjectWorkspace;
  private readonly clones: GitClones;
  private readonly rebuilder: SandboxRebuilder;
  private readonly secretGenerator: SecretGenerator;
  private readonly portProbe: PortProbe;
  private readonly terminal: Terminal;

  constructor({ workspace, clones, rebuilder, secretGenerator, portProbe, terminal }: SandboxCreatorDeps) {
    this.workspace = workspace;
    this.clones = clones;
    this.rebuilder = rebuilder;
    this.secretGenerator = secretGenerator;
    this.portProbe = portProbe;
    this.terminal = terminal;
  }

  async create(sandboxName: SandboxName, { branch, startPoint, runHooks }: CreateOptions): Promise<SandboxRecord> {
    const name = sandboxName.toString();
    this.rejectExisting(name);

    const slot = this.allocateSlot();
    await this.rejectBusyPorts(slot, name);

    // Read everything the manifest can reject on before touching the
    // filesystem. Deferring these to after the clone is what let a
    // broken `ports.env` strand a directory the registry could not
    // then reach.
    const ports = this.workspace.portBlockFor(slot).resolve();
    const generatedSecrets = this.mintSecrets();

    const record = this.provisionClone(name, slot, { branch, startPoint }, ports, generatedSecrets);
    this.rebuilder.rebuild(record, { runHooks, mode: 'populate' });

    return record;
  }

  private rejectExisting(name: string): void {
    if (this.workspace.registry.find(name)) {
      throw new SbxError(
        `A sandbox named "${name}" already exists.`,
        `Reuse it, delete it with \`sbx delete ${name}\`, or pick another name.`,
      );
    }
  }

  private allocateSlot(): number {
    const allocator = new SlotAllocator(this.workspace.manifest.maxSlots());
    const takenSlots = this.workspace.registry.list().map((record) => record.slot);
    return allocator.allocate(takenSlots);
  }

  private async rejectBusyPorts(slot: number, name: string): Promise<void> {
    const block = this.workspace.portBlockFor(slot);
    for (const other of this.workspace.registry.list()) {
      const shared = block.overlapWith(this.workspace.portBlockFor(other.slot));
      if (shared.length > 0) {
        throw new SbxError(
          `Slot ${String(slot)} would share ports ${shared.join(', ')} with sandbox "${other.name}".`,
          'Raise `ports.stride` in sandbox.config.json — it must exceed the widest gap between two base ports.',
        );
      }
    }
    const taken = await this.portProbe.findTaken(block.ports());
    if (taken.length > 0) {
      throw new SbxError(
        `Cannot give "${name}" slot ${String(slot)}: ports ${taken.join(', ')} are already in use on this machine.`,
        'Something else is listening — often a dev server left running, or a sandbox whose services are up. Free them, or `sbx down` the sandbox holding them.',
      );
    }
  }

  private provisionClone(
    name: string,
    slot: number,
    { branch, startPoint }: { branch: string | null; startPoint: string | null },
    ports: Record<string, number>,
    generatedSecrets: Record<string, string>,
  ): SandboxRecord {
    const directory = this.workspace.sandboxPathFor(name);
    if (fs.existsSync(directory)) {
      throw new SbxError(
        `${directory} already exists but no sandbox is registered for "${name}".`,
        `Left over from a create that failed earlier. Remove the directory (\`rm -rf ${directory}\`) and \`git -C ${this.workspace.manifest.rootDirectory} remote remove sbx-${name}\`, then try again.`,
      );
    }
    fs.mkdirSync(this.workspace.sandboxRoot(), { recursive: true });
    this.terminal.step(`clone ${directory}`);
    this.clones.create(directory, { branch, startPoint });
    this.clones.registerHostRemote(`sbx-${name}`, directory);

    const record = new SandboxRecord({
      name,
      slot,
      directory,
      createdAt: new Date().toISOString(),
      ports,
      generatedSecrets,
    });
    this.workspace.registry.save(record);
    return record;
  }

  private mintSecrets(): Record<string, string> {
    const minted: Record<string, string> = {};
    for (const [variableName, byteLength] of Object.entries(this.workspace.manifest.generatedSecrets())) {
      minted[variableName] = this.secretGenerator.generate(byteLength);
    }
    return minted;
  }
}
