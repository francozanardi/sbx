import fs from 'node:fs';
import path from 'node:path';
import { ProjectManifest } from '@/domain/ProjectManifest.js';
import { SbxError } from '@/domain/SbxError.js';

const MANIFEST_FILENAME = 'sandbox.config.json';

/**
 * Finds the manifest that governs the directory the tool was invoked from
 * and reads it. The search walks up to the filesystem root, so any
 * subdirectory of a project is a valid place to run a command from.
 *
 * The manifest is data, so it is parsed rather than executed: nothing in a
 * project's repository runs to answer what its sandboxes look like, and a
 * project in any language can carry one without hosting a file from
 * somebody else's toolchain.
 */
export class ManifestLoader {
  loadFrom(startDirectory: string): ProjectManifest {
    const manifestPath = this.findUpwards(startDirectory);
    if (!manifestPath) {
      throw new SbxError(
        `No ${MANIFEST_FILENAME} found in ${startDirectory} or any parent directory.`,
        'Run `sbx init` here to write one, or move to a project that has one.',
      );
    }
    return new ProjectManifest(this.parse(manifestPath), path.dirname(manifestPath));
  }

  private parse(manifestPath: string): unknown {
    let contents: string;
    try {
      contents = fs.readFileSync(manifestPath, 'utf8');
    } catch (error) {
      throw new SbxError(`${manifestPath} could not be read: ${errorMessage(error)}`);
    }
    try {
      return JSON.parse(contents);
    } catch (error) {
      throw new SbxError(
        `${manifestPath} is not valid JSON: ${errorMessage(error)}`,
        'JSON allows no comments and no trailing commas.',
      );
    }
  }

  private findUpwards(startDirectory: string): string | null {
    let directory = path.resolve(startDirectory);
    for (;;) {
      const candidate = path.join(directory, MANIFEST_FILENAME);
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
