import fs from 'node:fs';
import { SandboxRecord } from '../domain/SandboxRecord.mjs';
import { SlotAllocator } from '../domain/SlotAllocator.mjs';
import { SbxError } from '../domain/SbxError.mjs';

/**
 * Brings a sandbox into existence: a worktree of its own, a port block
 * nothing else is using, rendered env files, its stateful services, and
 * whatever the project's install, migrate and seed hooks do to it.
 *
 * The registry entry is written as soon as the worktree exists, so a run
 * that fails halfway still leaves something the delete command can clean up.
 */
export class SandboxCreator {
  constructor({ workspace, worktrees, environmentFileWriter, hookRunner, secretGenerator, portProbe, terminal }) {
    this.workspace = workspace;
    this.worktrees = worktrees;
    this.environmentFileWriter = environmentFileWriter;
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

    const record = this.provisionWorktree(name, slot, branch, startPoint);
    const variables = this.workspace.environmentFor(record);

    this.writeEnvironmentFiles(record, variables);
    this.startServices(record, variables);
    if (runHooks) this.runLifecycleHooks(record, variables);

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

  provisionWorktree(name, slot, branch, startPoint) {
    const worktree = this.workspace.worktreePathFor(name);
    if (this.worktrees.branchExists(branch)) {
      throw new SbxError(`Branch "${branch}" already exists.`, `Pass --branch=<other>, or remove it with \`git branch -D ${branch}\`.`);
    }
    fs.mkdirSync(this.workspace.worktreeRoot(), { recursive: true });
    this.terminal.step(`worktree ${worktree} on ${branch} from ${startPoint}`);
    this.worktrees.add(worktree, branch, startPoint);

    const record = new SandboxRecord({
      name,
      slot,
      worktree,
      branch,
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

  writeEnvironmentFiles(record, variables) {
    this.workspace.secrets.ensureExists();
    const written = this.environmentFileWriter.write(this.workspace.manifest, record.worktree, variables);
    for (const file of written) this.terminal.step(`rendered ${file}`);
  }

  startServices(record, variables) {
    if (!this.workspace.manifest.composeFile()) return;
    this.terminal.step('starting services');
    this.workspace.composeStackFor(record).start(variables);
  }

  runLifecycleHooks(record, variables) {
    for (const hookName of ['install', 'migrate', 'seed']) {
      this.hookRunner.run(this.workspace.manifest, hookName, record.worktree, variables);
    }
  }
}
