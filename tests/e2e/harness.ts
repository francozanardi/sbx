import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const BIN = path.join(projectRoot, 'dist', 'main.js');

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface Fixture {
  /** Directory that plays the role of the user's project. `sbx` runs from here. */
  projectDir: string;
  /** Fake HOME the CLI reads; every `~/.sbx` and `~/sandboxes` write goes under it. */
  home: string;
  /** Runs the compiled CLI from the project directory with a clean env. */
  sbx: (...args: string[]) => RunResult;
  /** The same, from any directory — for what sbx does when run from inside a sandbox. */
  sbxIn: (cwd: string, ...args: string[]) => RunResult;
  /** Path a sandbox of the given name would land at, per HomePath's default layout. */
  sandboxPath: (name: string) => string;
  /** Deletes both the project dir and the fake HOME. */
  cleanup: () => void;
}

interface FixtureOptions {
  manifest: Record<string, unknown>;
  /** Template files to seed the repo with, `path → contents`. */
  templates?: Record<string, string>;
  /** Extra files to seed alongside the manifest, `path → contents`. */
  extras?: Record<string, string>;
}

let counter = 0;

/**
 * Creates a fresh temp project (a git repo committed once) and an isolated
 * fake HOME. Every `sbx` invocation runs against these — no state leaks
 * across tests, no state touches the developer's real HOME.
 */
export function createFixture(options: FixtureOptions): Fixture {
  const label = `sbx-e2e-${String(process.pid)}-${String(++counter)}-${String(Date.now())}`;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  const projectDir = path.join(base, 'project');
  const home = path.join(base, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(home, { recursive: true });

  writeManifest(projectDir, options.manifest);
  for (const [relative, contents] of Object.entries(options.templates ?? {})) {
    writeFile(path.join(projectDir, relative), contents);
  }
  for (const [relative, contents] of Object.entries(options.extras ?? {})) {
    writeFile(path.join(projectDir, relative), contents);
  }
  initGitRepo(projectDir);

  const sbxIn = (cwd: string, ...args: string[]): RunResult => {
    const result = spawnSync('node', [BIN, ...args], {
      cwd,
      env: cleanEnv(home),
      encoding: 'utf8',
    });
    return toRunResult(result);
  };
  const sbx = (...args: string[]): RunResult => sbxIn(projectDir, ...args);

  const sandboxPath = (name: string): string => path.join(home, 'sandboxes', String(options.manifest.name), name);

  const cleanup = (): void => {
    fs.rmSync(base, { recursive: true, force: true });
  };

  return { projectDir, home, sbx, sbxIn, sandboxPath, cleanup };
}

function writeManifest(projectDir: string, manifest: Record<string, unknown>): void {
  writeFile(path.join(projectDir, 'sandbox.config.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeFile(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function initGitRepo(projectDir: string): void {
  const run = (args: string[]): void => {
    const result = spawnSync('git', args, { cwd: projectDir, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
  };
  run(['init', '--quiet', '--initial-branch=main']);
  run(['config', 'user.email', 'e2e@example.com']);
  run(['config', 'user.name', 'e2e']);
  run(['config', 'commit.gpgsign', 'false']);
  run(['add', '-A']);
  run(['commit', '--quiet', '-m', 'fixture']);
}

/**
 * A minimal env that keeps the child from reading the developer's real HOME
 * or ssh-agent, while still letting `git` and `node` find themselves on PATH.
 */
function cleanEnv(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    LANG: 'C',
    // Suppress colour so string assertions do not have to strip ANSI.
    NO_COLOR: '1',
    // Force git to accept the fresh repo without warning about its config.
    GIT_TERMINAL_PROMPT: '0',
  };
}

function toRunResult(result: SpawnSyncReturns<string>): RunResult {
  if (result.error) throw result.error;
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
