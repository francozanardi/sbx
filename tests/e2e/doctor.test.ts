import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

const TEMPLATE = 'APP_PORT=${APP_PORT}\n';

function commit(projectDir: string): void {
  spawnSync('git', ['add', '-A'], { cwd: projectDir });
  spawnSync('git', ['commit', '--quiet', '-m', 'more'], { cwd: projectDir });
}

describe('sbx doctor', () => {
  let fixture: Fixture;

  afterEach(() => {
    fixture.cleanup();
  });

  it('fails a template that exists but was never committed', () => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4300 } },
        env: [{ from: 'templates/app.env', to: '.env' }],
      },
      extras: { '.gitignore': '.env\n' },
    });
    // Written after the fixture's commit, so the repository does not carry it.
    fs.mkdirSync(path.join(fixture.projectDir, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(fixture.projectDir, 'templates', 'app.env'), TEMPLATE);

    const result = fixture.sbx('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('not committed');
  });

  it('passes once the template is committed and its output is ignored', () => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4310 } },
        env: [{ from: 'templates/app.env', to: '.env' }],
      },
      templates: { 'templates/app.env': TEMPLATE },
      extras: { '.gitignore': '.env\n' },
    });

    const result = fixture.sbx('doctor');
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout).toContain('Ready');
  });

  it('notes a rendered file that .gitignore does not cover', () => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4320 } },
        env: [{ from: 'templates/app.env', to: 'config/local.env' }],
      },
      templates: { 'templates/app.env': TEMPLATE },
    });

    const result = fixture.sbx('doctor');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('not covered by .gitignore');
  });

  it('fails a rendered file that is committed to the repository', () => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4330 } },
        env: [{ from: 'templates/app.env', to: 'app.env' }],
      },
      templates: { 'templates/app.env': TEMPLATE },
      extras: { 'app.env': 'APP_PORT=4330\n' },
    });

    const result = fixture.sbx('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('is committed');
  });

  it('reports every check even when one of them cannot run', () => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4340 }, maxSlots: 1 },
        env: [{ from: 'templates/app.env', to: '.env' }],
        hooks: [{ name: 'install', phase: 'prepare', run: 'true' }],
      },
      templates: { 'templates/app.env': TEMPLATE },
      extras: { '.gitignore': '.env\n' },
    });
    commit(fixture.projectDir);
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);

    // Every slot is now taken, so the port check and the variable map both
    // fail. The checks that do not depend on them must still be reported.
    const result = fixture.sbx('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('No free slot left');
    expect(result.stdout).toContain('git repository');
    expect(result.stdout).toContain('install (prepare)');
  });
});
