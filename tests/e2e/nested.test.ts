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

  it('deletes another sandbox from inside a sibling', () => {
    // Per-sandbox commands are addressable from anywhere; running one from
    // inside sibling `lane-a` resolves the target through `~/.sbx` and acts
    // on the host regardless of which clone happens to be the cwd.
    expect(fixture.sbx('create', 'lane-b').status).toBe(0);
    const result = fixture.sbxIn(fixture.sandboxPath('lane-a'), 'delete', 'lane-b', '--force');
    expect(result.status).toBe(0);
    expect(remotes(fixture.projectDir)).not.toContain('sbx-lane-b');
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
