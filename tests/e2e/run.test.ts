import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

/**
 * `sbx run` is the primitive agents drive sandboxes with, so what it does
 * with a child's exit status is part of its contract rather than an
 * implementation detail.
 */
describe('sbx run', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: { name: 'demo', ports: { base: { app: 4600 } }, maxSlots: 3 },
    });
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('relays the exit status of the command it ran', () => {
    const result = fixture.sbx('run', 'sb-1', '--', 'node', '-e', 'process.exit(42)');
    expect(result.status).toBe(42);
  });

  it('adds nothing of its own when the command merely fails', () => {
    const result = fixture.sbx('run', 'sb-1', '--', 'node', '-e', 'process.exit(1)');
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('error:');
  });

  it('leaves the child in charge of its own output', () => {
    const result = fixture.sbx('run', 'sb-1', '--', 'node', '-e', 'console.log("from the sandbox")');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('from the sandbox');
  });

  it('still reports a command that could not be started at all', () => {
    const result = fixture.sbx('run', 'sb-1', '--', 'definitely-not-a-program');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not installed');
  });

  it('refuses when no command follows `--`', () => {
    const result = fixture.sbx('run', 'sb-1');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing the command');
  });

  it('names the missing directory rather than blaming the program', () => {
    fs.rmSync(fixture.sandboxPath('sb-1'), { recursive: true, force: true });
    const result = fixture.sbx('run', 'sb-1', '--', 'node', '--version');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not exist');
    expect(result.stderr).not.toContain('not installed');
  });
});
