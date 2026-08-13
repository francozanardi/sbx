import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

/**
 * A misspelled flag used to be accepted and ignored, which changed what
 * the command did without saying so: `--hardd` ran a plain rebuild,
 * `--nohooks` ran the hooks.
 */
describe('sbx flag handling', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: {
        name: 'demo',
        ports: { base: { app: 4400 } },
        hooks: [{ name: 'install', phase: 'prepare', run: 'echo ran >> hook.log' }],
      },
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('refuses a misspelled flag and lists the real ones', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    const result = fixture.sbx('rebuild', 'sb-1', '--hardd');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not take a `--hardd` flag');
    expect(result.stderr).toContain('--data, --hard, --no-hooks');
  });

  it('refuses a flag on a command that takes none', () => {
    const result = fixture.sbx('list', '--verbose');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('It takes no flags');
  });

  it('accepts the flags a command does declare', () => {
    expect(fixture.sbx('create', 'sb-1', '--no-hooks').status).toBe(0);
    expect(fixture.sbx('rebuild', 'sb-1', '--hard').status).toBe(0);
  });

  it('refuses a value-taking flag used without a value', () => {
    const result = fixture.sbx('create', 'sb-1', '--branch');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('needs a value');
  });

  it('leaves everything after `--` to the child', () => {
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    const script = 'console.log(process.argv.slice(1).join("|"))';
    const result = fixture.sbx('run', 'sb-1', '--', 'node', '-e', script, '--', '--hardd');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--hardd');
  });
});
