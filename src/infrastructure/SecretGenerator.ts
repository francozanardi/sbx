import crypto from 'node:crypto';
import { SbxError } from '@/domain/SbxError.js';

/** Mints the random values a sandbox needs for signing keys, salts and the like. */
export class SecretGenerator {
  /** Base64 text carrying the requested number of random bytes. */
  generate(byteLength: number): string {
    if (!Number.isInteger(byteLength) || byteLength < 16) {
      throw new SbxError(
        `A generated secret needs at least 16 bytes of entropy, got ${String(byteLength)}.`,
        'Raise the value in `generate` in sandbox.config.json.',
      );
    }
    return crypto.randomBytes(byteLength).toString('base64');
  }
}
