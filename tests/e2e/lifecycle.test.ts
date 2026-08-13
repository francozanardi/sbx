import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

/**
 * Golden-path lifecycle: create → info → run → rebuild → delete.
 *
 * The manifest is deliberately service-less (no compose file). That
 * exercises everything except Docker: slot allocation, port probing,
 * template rendering, git clone, hooks, registry, remotes, teardown.
 */
describe('sbx lifecycle on a service-less project', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4700, db: 5700 }, maxSlots: 3 },
        generate: { APP_SECRET: 32 },
        variables: { LOG_LEVEL: 'debug' },
        env: [{ from: 'templates/app.env', to: '.env' }],
        hooks: [
          { name: 'install', phase: 'prepare', run: 'echo installed > install.log' },
          { name: 'migrate', phase: 'prepare', run: 'echo migrated on $DB_PORT > migrate.log' },
          { name: 'seed', phase: 'populate', run: 'echo seeded $SBX_NAME > seed.log' },
        ],
      },
      templates: {
        'templates/app.env':
          'APP_PORT=${APP_PORT}\nDB_PORT=${DB_PORT}\nSECRET=${APP_SECRET}\nLOG=${LOG_LEVEL}\nSHARED=${SHARED_TOKEN}\n',
      },
    });
    // Shared secret referenced by the template. Placed under the fake HOME.
    fs.mkdirSync(path.join(fixture.home, '.sbx', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(fixture.home, '.sbx', 'demo', 'secrets.env'), 'SHARED_TOKEN=e2e\n');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('doctor reports ready', () => {
    const result = fixture.sbx('doctor');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Ready');
  });

  it('creates a sandbox, renders its env, runs a command in it, then deletes it', () => {
    // create
    const create = fixture.sbx('create', 'sb-1');
    expect(create.status, `${create.stdout}\n${create.stderr}`).toBe(0);
    expect(create.stdout).toContain('sb-1');

    const sandboxDir = fixture.sandboxPath('sb-1');
    expect(fs.existsSync(sandboxDir)).toBe(true);

    // rendered env file has the shifted ports and the secrets
    const rendered = fs.readFileSync(path.join(sandboxDir, '.env'), 'utf8');
    expect(rendered).toContain('APP_PORT=4710');
    expect(rendered).toContain('DB_PORT=5710');
    expect(rendered).toContain('LOG=debug');
    expect(rendered).toContain('SHARED=e2e');
    expect(rendered).toMatch(/SECRET=.+/);

    // hooks ran in the sandbox directory
    expect(fs.readFileSync(path.join(sandboxDir, 'install.log'), 'utf8').trim()).toBe('installed');
    expect(fs.readFileSync(path.join(sandboxDir, 'migrate.log'), 'utf8').trim()).toBe('migrated on 5710');
    expect(fs.readFileSync(path.join(sandboxDir, 'seed.log'), 'utf8').trim()).toBe('seeded sb-1');

    // list surfaces the sandbox
    const list = fixture.sbx('list');
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('sb-1');

    // info surfaces the slot
    const info = fixture.sbx('info', 'sb-1');
    expect(info.status).toBe(0);
    expect(info.stdout).toContain('slot');
    expect(info.stdout).toContain('4710');

    // run: env vars are actually propagated to the child
    const run = fixture.sbx(
      'run',
      'sb-1',
      '--',
      'node',
      '-e',
      "if (process.env.APP_PORT !== '4710') { throw new Error('wrong port: ' + process.env.APP_PORT) }",
    );
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);

    // delete — the hooks created uncommitted files, so we force through them.
    const del = fixture.sbx('delete', 'sb-1', '--force');
    expect(del.status, `${del.stdout}\n${del.stderr}`).toBe(0);
    expect(fs.existsSync(sandboxDir)).toBe(false);
    const afterList = fixture.sbx('list');
    expect(afterList.stdout).not.toContain('sb-1');
  });

  it('allocates a new slot for a second sandbox', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    const two = fixture.sbx('create', 'sb-2');
    expect(two.status, `${two.stdout}\n${two.stderr}`).toBe(0);

    const envOne = fs.readFileSync(path.join(fixture.sandboxPath('sb-1'), '.env'), 'utf8');
    const envTwo = fs.readFileSync(path.join(fixture.sandboxPath('sb-2'), '.env'), 'utf8');
    expect(envOne).toContain('APP_PORT=4710');
    expect(envTwo).toContain('APP_PORT=4720');
  });

  it('rejects a duplicate sandbox name', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    const dup = fixture.sbx('create', 'sb-1');
    expect(dup.status).toBe(1);
    expect(dup.stderr).toContain('already exists');
  });

  it('rejects an invalid sandbox name', () => {
    const result = fixture.sbx('create', 'BAD_NAME');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid sandbox name');
  });

  it('rejects an unknown command with the known command list', () => {
    const result = fixture.sbx('nope');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });

  it('names the sandbox when its clone was removed outside sbx', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    fs.rmSync(fixture.sandboxPath('sb-1'), { recursive: true, force: true });

    const rebuild = fixture.sbx('rebuild', 'sb-1');
    expect(rebuild.status).toBe(1);
    expect(rebuild.stderr).toContain('its clone is gone');

    // Listing still shows it, because deleting it is the way out.
    const list = fixture.sbx('list');
    expect(list.stdout).toContain('(clone missing)');

    const del = fixture.sbx('delete', 'sb-1', '--force');
    expect(del.status).toBe(0);
    expect(fixture.sbx('list').stdout).not.toContain('sb-1');
  });

  it('tells you to force the delete of a sandbox a failed hook left behind', () => {
    const broken = createFixture({
      manifest: {
        name: 'broken',
        ports: { base: { app: 4900 } },
        hooks: [
          { name: 'install', phase: 'prepare', run: 'echo x > leftover.txt' },
          { name: 'migrate', phase: 'prepare', run: 'exit 3' },
        ],
      },
    });
    try {
      const create = broken.sbx('create', 'sb-1');
      expect(create.status).toBe(1);
      expect(create.stderr).toContain('sbx delete sb-1 --force');
      // The advice has to actually work.
      expect(broken.sbx('delete', 'sb-1', '--force').status).toBe(0);
    } finally {
      broken.cleanup();
    }
  });

  it('delete refuses to drop a sandbox with unsaved work without --force', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    const result = fixture.sbx('delete', 'sb-1');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('uncommitted');
    expect(result.stderr).toContain('--force');
  });
});

describe('sbx run without a passthrough command', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: { name: 'demo', ports: { base: { app: 4800 }, maxSlots: 3 } },
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('refuses when no command follows `--`', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    const result = fixture.sbx('run', 'sb-1');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing the command');
  });
});
