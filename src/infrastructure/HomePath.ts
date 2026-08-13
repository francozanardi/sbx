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

  /** Directory holding the registry and shared secrets of a single project. */
  stateDirectoryFor(projectName: string): string {
    return path.join(this.homeDirectory, '.sbx', projectName);
  }

  /** Directory holding the sandbox clones of a single project. */
  defaultSandboxRootFor(projectName: string): string {
    return path.join(this.homeDirectory, 'sandboxes', projectName);
  }
}
