import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ProjectManifest } from '../domain/ProjectManifest.mjs';
import { SbxError } from '../domain/SbxError.mjs';

const MANIFEST_FILENAME = 'sandbox.config.mjs';

/**
 * Finds the manifest that governs the directory the tool was invoked from
 * and loads it. The search walks up to the filesystem root, so any
 * subdirectory of a project is a valid place to run a command from.
 */
export class ManifestLoader {
  async loadFrom(startDirectory) {
    const manifestPath = this.findUpwards(startDirectory);
    if (!manifestPath) {
      throw new SbxError(
        `No ${MANIFEST_FILENAME} found in ${startDirectory} or any parent directory.`,
        'Run `sbx init` here to write one, or move to a project that has one.',
      );
    }
    const module = await this.importManifest(manifestPath);
    if (!module.default) {
      throw new SbxError(
        `${manifestPath} does not export its configuration.`,
        'The file must end with `export default { … }`.',
      );
    }
    return new ProjectManifest(module.default, path.dirname(manifestPath));
  }

  /**
   * A manifest is executed, not parsed, so it can fail either by being
   * invalid JavaScript or by throwing while it runs. Both arrive here as
   * messages that name neither the file nor the fact that it is a manifest.
   */
  async importManifest(manifestPath) {
    try {
      return await import(pathToFileURL(manifestPath).href);
    } catch (error) {
      throw new SbxError(
        `${manifestPath} could not be loaded: ${error.message}`,
        'It is a JavaScript module — check it runs on its own with `node <path>`.',
      );
    }
  }

  findUpwards(startDirectory) {
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
