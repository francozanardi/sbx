import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, '..', '..', 'dist', 'main.js');

describe('sbx help (no manifest present)', () => {
  let workdir: string;

  beforeAll(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-e2e-help-'));
  });

  afterAll(() => {
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('prints the top-level help and exits 0', () => {
    const result = spawnSync('node', [BIN, 'help'], {
      cwd: workdir,
      env: { HOME: workdir, PATH: process.env.PATH ?? '', NO_COLOR: '1' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sbx create');
    expect(result.stdout).toContain('sbx init');
    // The missing-manifest warning is expected — it is how someone finds `sbx init`.
    expect(result.stderr).toContain('No sandbox.config.json');
  });

  it('fails without a manifest for a non-help command', () => {
    const result = spawnSync('node', [BIN, 'nope'], {
      cwd: workdir,
      env: { HOME: workdir, PATH: process.env.PATH ?? '', NO_COLOR: '1' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    // Without a manifest, we cannot even reach the command router — the
    // failure names the missing manifest, which is the actionable thing.
    expect(result.stderr).toContain('No sandbox.config.json');
  });
});
