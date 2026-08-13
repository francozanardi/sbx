import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, '..', '..', 'dist', 'main.js');

describe('sbx init', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-e2e-init-'));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('writes a starting sandbox.config.json', () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"demo"}\n');

    const result = spawnSync('node', [BIN, 'init'], {
      cwd: projectDir,
      env: { HOME: projectDir, PATH: process.env.PATH ?? '', NO_COLOR: '1' },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const manifestPath = path.join(projectDir, 'sandbox.config.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      name: string;
      ports: { base: Record<string, number> };
      hooks: { name: string; run: string }[];
    };
    expect(typeof manifest.name).toBe('string');
    expect(manifest.ports.base).toBeDefined();
    // package.json was detected → the install hook uses `npm install`.
    expect(manifest.hooks.some((h) => h.run === 'npm install')).toBe(true);
  });

  it('refuses to overwrite an existing manifest', () => {
    fs.writeFileSync(path.join(projectDir, 'sandbox.config.json'), '{}\n');
    const result = spawnSync('node', [BIN, 'init'], {
      cwd: projectDir,
      env: { HOME: projectDir, PATH: process.env.PATH ?? '', NO_COLOR: '1' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already exists');
  });
});
