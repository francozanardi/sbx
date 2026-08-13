import fs from 'node:fs';
import { SandboxRecord } from '../domain/SandboxRecord.mjs';
import { SlotAllocator } from '../domain/SlotAllocator.mjs';
import { SbxError } from '../domain/SbxError.mjs';

/**
 * Brings a sandbox into existence: a clone of its own, a port block
 * nothing else is using, rendered env files, its stateful services, and
 * whatever the project's install, migrate and seed hooks do to it.
 *
 * What is unique to a first run lives here — allocating the slot, cloning
 * the repository, minting the secrets, seeding the data. Everything that a
 * later run could repeat is delegated, so the two paths cannot drift.
 *
 * The registry entry is written as soon as the clone exists, so a run
 * that fails halfway still leaves something the delete command can clean up.
 */
export class SandboxCreator {
  constructor({ workspace, clones, synchronizer, hookRunner, secretGenerator, portProbe, terminal }) {
    this.workspace = workspace;
    this.clones = clones;
    this.synchronizer = synchronizer;
    this.hookRunner = hookRunner;
    this.secretGenerator = secretGenerator;
    this.portProbe = portProbe;
    this.terminal = terminal;
  }

  async create(sandboxName, { branch, startPoint, runHooks }) {
    const name = sandboxName.toString();
    this.rejectExisting(name);

    const slot = this.allocateSlot();
    await this.rejectBusyPorts(slot, name);

    const record = this.provisionClone(name, slot, branch, startPoint);
    const variables = this.synchronizer.sync(record, { runHooks });
    if (runHooks) this.seed(record, variables);

    return record;
  }

  rejectExisting(name) {
    if (this.workspace.registry.find(name)) {
      throw new SbxError(`A sandbox named "${name}" already exists.`, `Reuse it, delete it with \`sbx delete ${name}\`, or pick another name.`);
    }
  }

  allocateSlot() {
    const allocator = new SlotAllocator(this.workspace.manifest.maxSlots());
    const takenSlots = this.workspace.registry.list().map((record) => record.slot);
    return allocator.allocate(takenSlots);
  }

  /**
   * A slot is only usable when nothing on the machine holds any of its
   * ports. Both checks matter: the registry catches a stopped sandbox that
   * would collide once started, the probe catches everything else.
   */
  async rejectBusyPorts(slot, name) {
    const block = this.workspace.portBlockFor(slot);
    for (const other of this.workspace.registry.list()) {
      const shared = block.overlapWith(this.workspace.portBlockFor(other.slot));
      if (shared.length > 0) {
        throw new SbxError(
          `Slot ${slot} would share ports ${shared.join(', ')} with sandbox "${other.name}".`,
          'Raise `ports.stride` in sandbox.config.mjs — it must exceed the widest gap between two base ports.',
        );
      }
    }
    const taken = await this.portProbe.findTaken(block.ports());
    if (taken.length > 0) {
      throw new SbxError(
        `Cannot give "${name}" slot ${slot}: ports ${taken.join(', ')} are already in use on this machine.`,
        'Something else is listening — often a dev server left running, or a sandbox whose services are up. Free them, or `sbx down` the sandbox holding them.',
      );
    }
  }

  /**
   * The branch name is not checked against the project's branches: a
   * sandbox owns its refs, so a name already taken elsewhere is free here.
   */
  provisionClone(name, slot, branch, startPoint) {
    const directory = this.workspace.sandboxPathFor(name);
    if (fs.existsSync(directory)) {
      throw new SbxError(`${directory} already exists.`, 'Remove it, or pick another sandbox name.');
    }
    fs.mkdirSync(this.workspace.sandboxRoot(), { recursive: true });
    this.terminal.step(`clone ${directory} on ${branch} from ${startPoint}`);
    this.clones.create(directory, branch, startPoint);

    const record = new SandboxRecord({
      name,
      slot,
      directory,
      createdAt: new Date().toISOString(),
      generatedSecrets: this.mintSecrets(),
    });
    this.workspace.registry.save(record);
    return record;
  }

  mintSecrets() {
    const minted = {};
    for (const [variableName, byteLength] of Object.entries(this.workspace.manifest.generatedSecrets())) {
      minted[variableName] = this.secretGenerator.generate(byteLength);
    }
    return minted;
  }

  seed(record, variables) {
    this.hookRunner.run(this.workspace.manifest, 'seed', record.directory, variables);
  }
}
