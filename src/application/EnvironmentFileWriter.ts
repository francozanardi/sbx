import fs from 'node:fs';
import path from 'node:path';
import { type EnvFileEntry, type ProjectManifest } from '@/domain/ProjectManifest.js';
import { SbxError } from '@/domain/SbxError.js';
import { type EnvMap } from '@/infrastructure/ProcessRunner.js';
import { type TemplateRenderer } from '@/infrastructure/TemplateRenderer.js';

/**
 * Renders the env files a sandbox's processes read, from the templates the
 * project ships, into the sandbox's own clone.
 *
 * Rendering is repeatable: running it again overwrites the files with the
 * current values, which is how a manifest or secrets change reaches an
 * existing sandbox.
 */
export class EnvironmentFileWriter {
  private readonly templateRenderer: TemplateRenderer;

  constructor(templateRenderer: TemplateRenderer) {
    this.templateRenderer = templateRenderer;
  }

  /** @returns the sandbox-relative paths that were written. */
  write(manifest: ProjectManifest, sandboxDirectory: string, variables: EnvMap): string[] {
    const written: string[] = [];
    for (const file of manifest.environmentFiles()) {
      this.writeOne(sandboxDirectory, variables, file);
      written.push(file.to);
    }
    return written;
  }

  private writeOne(sandboxDirectory: string, variables: EnvMap, file: EnvFileEntry): void {
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

  private renderTemplate(templatePath: string, variables: EnvMap): string {
    try {
      return this.templateRenderer.render(fs.readFileSync(templatePath, 'utf8'), variables);
    } catch (error) {
      const hint = error instanceof SbxError ? error.hint : null;
      const message = error instanceof Error ? error.message : String(error);
      throw new SbxError(`${templatePath}: ${message}`, hint);
    }
  }
}
