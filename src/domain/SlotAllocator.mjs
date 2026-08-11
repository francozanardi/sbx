import { SbxError } from './SbxError.mjs';

/**
 * Picks the slot a new sandbox occupies. Slot 0 is reserved for the
 * project's own checkout, which runs on the unshifted base ports.
 *
 * The lowest free slot is reused rather than always incrementing, so
 * deleting and recreating sandboxes keeps port numbers low and stable —
 * which matters when a port has to be registered somewhere external, such
 * as an OAuth redirect URI allowlist.
 */
export class SlotAllocator {
  constructor(maxSlots) {
    this.maxSlots = maxSlots;
  }

  /** @throws when every slot up to the configured maximum is taken. */
  allocate(takenSlots) {
    const taken = new Set(takenSlots);
    for (let slot = 1; slot <= this.maxSlots; slot += 1) {
      if (!taken.has(slot)) return slot;
    }
    throw new SbxError(
      `No free slot left: all ${this.maxSlots} are in use.`,
      'Delete a sandbox, or raise `ports.maxSlots` in sandbox.config.mjs.',
    );
  }
}
