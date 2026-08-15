import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Expands `~` in configured paths and resolves the tool's own state directory. */
export class HomePath {
  readonly homeDirectory: string;

  constructor(homeDirectory: string = os.homedir()) {
    this.homeDirectory = homeDirectory;
  }

  expand(value: string): string {
    if (value === '~') return this.homeDirectory;
    if (value.startsWith('~/')) return path.join(this.homeDirectory, value.slice(2));
    return value;
  }

  /** Root of every project's state directory: `~/.sbx`. */
  stateRoot(): string {
    return path.join(this.homeDirectory, '.sbx');
  }

  /** Directory holding the registry and shared secrets of a single project. */
  stateDirectoryFor(projectName: string): string {
    return path.join(this.stateRoot(), projectName);
  }

  /** Directory holding the sandbox clones of a single project. */
  defaultSandboxRootFor(projectName: string): string {
    return path.join(this.homeDirectory, 'sandboxes', projectName);
  }

  /**
   * Names of every project that has ever registered a sandbox on this
   * machine, taken from the subdirectories of `~/.sbx`. A project shows up
   * whether or not it still has live sandboxes — a leftover empty registry
   * is itself worth reporting.
   */
  knownProjectNames(): string[] {
    const root = this.stateRoot();
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }
}
