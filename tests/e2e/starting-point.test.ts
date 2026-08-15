import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

const MANIFEST = {
  name: 'demo',
  ports: { base: { api: 4600 }, env: { api: 'OLD_API_PORT' } },
  env: [{ from: 'templates/app.env', to: '.env' }],
};

/**
 * A sandbox is a clone that checks out `origin/HEAD`, so it renders the
 * templates of whatever origin has — not the ones in the developer's
 * working tree. Renaming a port variable in both the manifest and the
 * template, then committing without pushing, used to fail deep inside
 * the render with a message that named the removed variables and told
 * the developer to add them back: the exact opposite of the fix.
 */
describe('a checkout ahead of origin', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      withOrigin: true,
      manifest: MANIFEST,
      templates: { 'templates/app.env': 'PORT=${OLD_API_PORT}\n' },
      extras: { '.gitignore': '.env\n' },
    });
    // Rename the variable in both places, commit, do not push.
    fixture.commitLocally('templates/app.env', 'PORT=${NEW_API_PORT}\n', 'rename the port variable');
    fixture.commitLocally(
      'sandbox.config.json',
      `${JSON.stringify({ ...MANIFEST, ports: { base: { api: 4600 }, env: { api: 'NEW_API_PORT' } } }, null, 2)}\n`,
      'rename it in the manifest too',
    );
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('doctor names the file that differs at origin instead of passing', () => {
    const result = fixture.sbx('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('starting point');
    expect(result.stdout).toContain('templates/app.env');
    expect(result.stdout).toContain('origin/HEAD');
    expect(result.stdout).toContain('--from=HEAD');
  });

  it('a failed create explains that the sandbox rendered the older template', () => {
    const result = fixture.sbx('create', 'lane-a');
    expect(result.status).toBe(1);
    // The raw render error still names what was missing...
    expect(result.stderr).toContain('OLD_API_PORT');
    // ...but the hint now points at the real cause rather than at adding it back.
    expect(result.stderr).toContain('differs from the copy in your checkout');
    expect(result.stderr).toContain('--from=HEAD');
  });

  it('--from=HEAD starts from the checkout and renders the current template', () => {
    const result = fixture.sbx('create', 'lane-b', '--from=HEAD');
    expect(result.status).toBe(0);
    expect(fixture.sbx('list').stdout).toContain('lane-b');
  });

  it('doctor passes once the commits are pushed', () => {
    fixture.git('push', '--quiet');
    const result = fixture.sbx('doctor');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('starting point');
  });
});
