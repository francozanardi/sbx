import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './harness.js';

function rewriteManifest(fixture: Fixture, manifest: Record<string, unknown>): void {
  fs.writeFileSync(path.join(fixture.projectDir, 'sandbox.config.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * A port block is derived from the manifest on every read, so editing
 * `ports.base` or `ports.stride` renumbers sandboxes that already exist
 * and are already running on the old numbers.
 */
describe('ports moving under an existing sandbox', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture({
      manifest: { name: 'demo', ports: { base: { app: 4200 } } },
    });
    expect(fixture.sbx('create', 'sb-1').status).toBe(0);
    expect(fixture.sbx('info', 'sb-1').stdout).toContain('4210');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('doctor fails, naming the sandbox and the move', () => {
    rewriteManifest(fixture, { name: 'demo', ports: { base: { app: 4200 }, stride: 100 } });

    const result = fixture.sbx('doctor');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('port drift');
    expect(result.stdout).toContain('app 4210 → 4300');
  });

  it('rebuild warns rather than moving them quietly, and stops warning once it has', () => {
    rewriteManifest(fixture, { name: 'demo', ports: { base: { app: 4200 }, stride: 100 } });

    const moved = fixture.sbx('rebuild', 'sb-1');
    expect(moved.status).toBe(0);
    expect(moved.stderr).toContain('app 4210 → 4300');
    expect(moved.stdout).toContain('4300');

    // The sandbox is on the new ports now, so there is nothing left to say.
    const again = fixture.sbx('rebuild', 'sb-1');
    expect(again.stderr).not.toContain('→');
    expect(fixture.sbx('doctor').stdout).not.toContain('port drift');
  });

  it('says nothing while the manifest still yields the same ports', () => {
    const rebuild = fixture.sbx('rebuild', 'sb-1');
    expect(rebuild.status).toBe(0);
    expect(rebuild.stderr).toBe('');
  });
});
