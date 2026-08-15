import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

/**
 * Standing in a sandbox is as good as naming it. Every per-sandbox
 * command took a mandatory name, so `sbx code` from inside the very
 * sandbox it would open refused for want of an argument sbx could see
 * from the cwd.
 */
describe('a sandbox inferred from the working directory', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4700 } },
        env: [{ from: 'templates/app.env', to: '.env' }],
      },
      templates: { 'templates/app.env': 'PORT=${APP_PORT}\n' },
      extras: { '.gitignore': '.env\n', 'apps/server/keep.txt': 'nested\n' },
    });
    expect(fixture.sbx('create', 'lane-a').status).toBe(0);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('info needs no name from the sandbox root', () => {
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'info');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('lane-a');
  });

  it('info needs no name from a subdirectory of the sandbox', () => {
    const nested = path.join(fixture.sandboxPath('lane-a'), 'apps', 'server');
    const result = fixture.sbxIn(nested, 'info');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('lane-a');
  });

  it('run needs no name, so the passthrough command is the only argument', () => {
    const inside = fixture.sandboxPath('lane-a');
    const result = fixture.sbxIn(inside, 'run', '--', 'node', '-e', 'console.log(process.env.SBX_NAME)');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('lane-a');
  });

  it('an explicit name still wins over the enclosing one', () => {
    expect(fixture.sbx('create', 'lane-b').status).toBe(0);
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'info', 'lane-b');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('lane-b');
  });

  it('outside any sandbox, the name is still required', () => {
    const result = fixture.sbx('info');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not inside a sandbox');
  });

  it('delete refuses to infer, naming the sandbox you are standing in', () => {
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'delete');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('would remove this directory');
    expect(result.stderr).toContain('lane-a');
    // And it really did not delete it.
    expect(fixture.sbx('list').stdout).toContain('lane-a');
  });
});
