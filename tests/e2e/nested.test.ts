import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

function remotes(directory: string): string {
  return spawnSync('git', ['remote'], { cwd: directory, encoding: 'utf8' }).stdout;
}

/**
 * A sandbox carries the manifest like any other clone, so sbx run from
 * inside one loads it and silently treats that clone as the host. Agents
 * are told they can run sbx from anywhere in the project, and a sandbox
 * is somewhere in the project.
 */
describe('sbx run from inside a sandbox', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: { name: 'demo', ports: { base: { app: 4500 } } },
    });
    expect(fixture.sbx('create', 'lane-a').status).toBe(0);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('refuses to create a sandbox, naming the host to run it from', () => {
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'create', 'lane-b');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sandbox "lane-a"');
    expect(result.stderr).toContain(fixture.projectDir);

    // The host is still the only repository holding sbx- remotes.
    expect(remotes(fixture.projectDir)).toContain('sbx-lane-a');
    expect(remotes(fixture.sandboxPath('lane-a'))).not.toContain('sbx-lane-b');
  });

  it('refuses to delete a sandbox', () => {
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'delete', 'lane-a', '--force');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not the project's host checkout");
  });

  it('fails doctor, which would otherwise report on the wrong checkout', () => {
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('not the host checkout');
  });

  it('still runs the commands that only act on a named sandbox', () => {
    const inside = fixture.sandboxPath('lane-a');
    expect(fixture.sbxIn(inside, 'list').status).toBe(0);
    expect(fixture.sbxIn(inside, 'info', 'lane-a').status).toBe(0);
    expect(fixture.sbxIn(inside, 'run', 'lane-a', '--', 'node', '--version').status).toBe(0);
  });
});
