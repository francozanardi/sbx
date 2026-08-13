import fs from 'node:fs';
import path from 'node:path';
import { SbxError } from '../domain/SbxError.mjs';

/**
 * Renders the env files a sandbox's processes read, from the templates the
 * project ships, into the sandbox's own clone.
 *
 * Rendering is repeatable: running it again overwrites the files with the
 * current values, which is how a manifest or secrets change reaches an
 * existing sandbox.
 */
export class EnvironmentFileWriter {
  constructor(templateRenderer) {
    this.templateRenderer = templateRenderer;
  }

  /** @returns the sandbox-relative paths that were written. */
  write(manifest, sandboxDirectory, variables) {
    const written = [];
    for (const file of manifest.environmentFiles()) {
      this.writeOne(manifest, sandboxDirectory, variables, file);
      written.push(file.to);
    }
    return written;
  }

  /**
   * Templates are read from the sandbox rather than from the checkout the
   * command ran in, so a branch that adds a variable renders correctly on
   * the sandbox that carries it.
   */
  writeOne(manifest, sandboxDirectory, variables, file) {
    const templatePath = path.resolve(sandboxDirectory, file.from);
    if (!fs.existsSync(templatePath)) {
      throw new SbxError(
        `Env template ${file.from} does not exist at ${templatePath}.`,
        'A sandbox renders the templates of the branch it has checked out. Switch it to a branch that carries this one, or commit it there.',
      );
    }
    const destinationPath = path.resolve(sandboxDirectory, file.to);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, this.renderTemplate(templatePath, variables), { mode: 0o600 });
  }

  renderTemplate(templatePath, variables) {
    try {
      return this.templateRenderer.render(fs.readFileSync(templatePath, 'utf8'), variables);
    } catch (error) {
      throw new SbxError(`${templatePath}: ${error.message}`, error.hint);
    }
  }
}
