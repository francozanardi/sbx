import fs from 'node:fs';
import path from 'node:path';
import { SbxError } from '../domain/SbxError.mjs';

const MANIFEST_FILENAME = 'sandbox.config.json';

/**
 * Writes a starting manifest into a project that has none.
 *
 * What it fills in is what can be read off the repository without guessing:
 * the project name and the install command for the toolchain it found. The
 * optional keys are left out rather than stubbed, because a plausible wrong
 * value is worse than an absent one — it looks reviewed.
 */
export class ManifestScaffolder {
  constructor(catalog) {
    this.catalog = catalog;
  }

  /** @throws when a manifest already exists. @returns what was detected and where it was written. */
  scaffold(projectDirectory) {
    const manifestPath = path.join(projectDirectory, MANIFEST_FILENAME);
    if (fs.existsSync(manifestPath)) {
      throw new SbxError(`${manifestPath} already exists.`, 'Edit it, or delete it to start over.');
    }
    const detected = this.detect(projectDirectory);
    const projectName = path.basename(path.resolve(projectDirectory));
    fs.writeFileSync(manifestPath, `${JSON.stringify(this.compose(projectName, detected), null, 2)}\n`);
    return { manifestPath, projectName, ...detected };
  }

  detect(projectDirectory) {
    for (const entry of this.catalog.entries()) {
      if (fs.existsSync(path.join(projectDirectory, entry.marker))) return entry;
    }
    return { marker: null, ecosystem: 'unrecognized', install: null };
  }

  compose(projectName, detected) {
    return {
      name: projectName,
      ports: { base: { app: 3000 }, stride: 10, maxSlots: 9 },
      hooks: detected.install ? { install: detected.install } : {},
    };
  }
}
