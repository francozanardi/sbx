import fs from 'node:fs';
import path from 'node:path';
import { type EcosystemCatalog, type EcosystemEntry } from '@/domain/EcosystemCatalog.js';
import { SbxError } from '@/domain/SbxError.js';

const MANIFEST_FILENAME = 'sandbox.config.json';

export interface Detection {
  marker: string | null;
  ecosystem: string;
  install: string | null;
}

export interface ScaffoldResult extends Detection {
  manifestPath: string;
  projectName: string;
}

interface ScaffoldedManifest {
  name: string;
  ports: { base: Record<string, number>; stride: number; maxSlots: number };
  hooks: { name: string; phase: 'prepare' | 'populate'; run: string }[];
}

/**
 * Writes a starting manifest into a project that has none.
 *
 * What it fills in is what can be read off the repository without guessing:
 * the project name and the install command for the toolchain it found. The
 * optional keys are left out rather than stubbed, because a plausible wrong
 * value is worse than an absent one — it looks reviewed.
 */
export class ManifestScaffolder {
  private readonly catalog: EcosystemCatalog;

  constructor(catalog: EcosystemCatalog) {
    this.catalog = catalog;
  }

  /** @throws when a manifest already exists. @returns what was detected and where it was written. */
  scaffold(projectDirectory: string): ScaffoldResult {
    const manifestPath = path.join(projectDirectory, MANIFEST_FILENAME);
    if (fs.existsSync(manifestPath)) {
      throw new SbxError(`${manifestPath} already exists.`, 'Edit it, or delete it to start over.');
    }
    const detected = this.detect(projectDirectory);
    const projectName = path.basename(path.resolve(projectDirectory));
    fs.writeFileSync(manifestPath, `${JSON.stringify(this.compose(projectName, detected), null, 2)}\n`);
    return { manifestPath, projectName, ...detected };
  }

  private detect(projectDirectory: string): Detection {
    for (const entry of this.catalog.entries()) {
      if (fs.existsSync(path.join(projectDirectory, entry.marker))) {
        return { marker: entry.marker, ecosystem: entry.ecosystem, install: entry.install };
      }
    }
    return { marker: null, ecosystem: 'unrecognized', install: null };
  }

  private compose(projectName: string, detected: Detection | EcosystemEntry): ScaffoldedManifest {
    return {
      name: projectName,
      ports: { base: { app: 3000 }, stride: 10, maxSlots: 9 },
      hooks: detected.install ? [{ name: 'install', phase: 'prepare', run: detected.install }] : [],
    };
  }
}
