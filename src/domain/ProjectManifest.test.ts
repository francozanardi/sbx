import { describe, expect, it } from 'vitest';
import { ProjectManifest } from '@/domain/ProjectManifest.js';
import { SbxError } from '@/domain/SbxError.js';

const validRaw = {
  name: 'demo',
  ports: { base: { app: 3000 } },
};

function build(raw: unknown): ProjectManifest {
  return new ProjectManifest(raw, '/tmp/demo');
}

describe('ProjectManifest — basics', () => {
  it('exposes the project name and root directory', () => {
    const manifest = build(validRaw);
    expect(manifest.name()).toBe('demo');
    expect(manifest.rootDirectory).toBe('/tmp/demo');
  });

  it('returns base ports untouched', () => {
    const manifest = build({ name: 'demo', ports: { base: { app: 3000, db: 5432 } } });
    expect(manifest.basePorts()).toEqual({ app: 3000, db: 5432 });
  });

  it('defaults stride to 10 and maxSlots to 9', () => {
    const manifest = build(validRaw);
    expect(manifest.portStride()).toBe(10);
    expect(manifest.maxSlots()).toBe(9);
  });

  it('respects configured stride and maxSlots', () => {
    const manifest = build({ name: 'demo', ports: { base: { app: 3000 }, stride: 100, maxSlots: 5 } });
    expect(manifest.portStride()).toBe(100);
    expect(manifest.maxSlots()).toBe(5);
  });
});

describe('ProjectManifest — validation errors', () => {
  it.each([
    [null, 'null root'],
    [undefined, 'undefined root'],
    [{}, 'empty'],
    [{ name: '' }, 'empty name'],
    [{ name: 123 }, 'non-string name'],
  ])('rejects invalid name (%s)', (raw, _label) => {
    expect(() => build(raw)).toThrow(/name/);
  });

  it('rejects missing ports', () => {
    expect(() => build({ name: 'demo' })).toThrow(/ports/);
  });

  it('rejects empty ports.base', () => {
    expect(() => build({ name: 'demo', ports: { base: {} } })).toThrow(/ports.base/);
  });

  it.each([
    [0],
    [-1],
    [65536],
    [3000.5],
    ['3000'],
  ])('rejects non-integer or out-of-range port %s', (bad) => {
    expect(() => build({ name: 'demo', ports: { base: { app: bad } } })).toThrow(SbxError);
  });
});

describe('ProjectManifest — hooks', () => {
  const withHook = (hooks: unknown) => ({ ...validRaw, hooks });

  it('returns an empty array when hooks are not declared', () => {
    expect(build(validRaw).hooks()).toEqual([]);
  });

  it('rejects non-array hooks', () => {
    expect(() => build(withHook({}))).toThrow(SbxError);
  });

  it('rejects a hook missing name/phase/run', () => {
    expect(() => build(withHook([{ phase: 'prepare', run: 'x' }]))).toThrow(/name/);
    expect(() => build(withHook([{ name: 'a', run: 'x' }]))).toThrow(/phase/);
    expect(() => build(withHook([{ name: 'a', phase: 'prepare' }]))).toThrow(/run/);
  });

  it('rejects unknown phases', () => {
    expect(() => build(withHook([{ name: 'a', phase: 'other', run: 'x' }]))).toThrow(/phase/);
  });

  it('rejects duplicate hook names', () => {
    const hooks = [
      { name: 'install', phase: 'prepare', run: 'a' },
      { name: 'install', phase: 'prepare', run: 'b' },
    ];
    expect(() => build(withHook(hooks))).toThrow(/already used/);
  });

  it('preserves declaration order', () => {
    const hooks = [
      { name: 'install', phase: 'prepare', run: 'a' },
      { name: 'migrate', phase: 'prepare', run: 'b' },
      { name: 'seed', phase: 'populate', run: 'c' },
    ];
    const manifest = build(withHook(hooks));
    expect(manifest.hooks().map((h) => h.name)).toEqual(['install', 'migrate', 'seed']);
  });

  it('hooksForPhase filters by phase, keeping order', () => {
    const hooks = [
      { name: 'install', phase: 'prepare', run: 'a' },
      { name: 'reset', phase: 'populate', run: 'b' },
      { name: 'migrate', phase: 'prepare', run: 'c' },
      { name: 'seed', phase: 'populate', run: 'd' },
    ];
    const manifest = build(withHook(hooks));
    expect(manifest.hooksForPhase('prepare').map((h) => h.name)).toEqual(['install', 'migrate']);
    expect(manifest.hooksForPhase('populate').map((h) => h.name)).toEqual(['reset', 'seed']);
  });
});

describe('ProjectManifest — port variable names', () => {
  it('defaults to ROLE_PORT in upper snake case', () => {
    const manifest = build({ name: 'demo', ports: { base: { api: 1, dbMain: 2, HTTP: 3 } } });
    expect(manifest.portVariableNames()).toEqual({
      api: 'API_PORT',
      dbMain: 'DB_MAIN_PORT',
      HTTP: 'HTTP_PORT',
    });
  });

  it('lets the manifest override individual names', () => {
    const manifest = build({
      name: 'demo',
      ports: { base: { api: 1, db: 2 }, env: { api: 'PORT_MAIN' } },
    });
    expect(manifest.portVariableNames()).toEqual({ api: 'PORT_MAIN', db: 'DB_PORT' });
  });
});

describe('ProjectManifest — optional fields', () => {
  it('exposes optional fields, defaulting nullables to null', () => {
    const manifest = build(validRaw);
    expect(manifest.sandboxRoot()).toBeNull();
    expect(manifest.composeFile()).toBeNull();
    expect(manifest.secretsFile()).toBeNull();
    expect(manifest.environmentFiles()).toEqual([]);
    expect(manifest.generatedSecrets()).toEqual({});
    expect(manifest.staticVariables()).toEqual({});
  });

  it('returns configured optional fields verbatim', () => {
    const manifest = build({
      ...validRaw,
      sandboxRoot: '~/lanes',
      compose: 'docker/compose.yml',
      secrets: '~/.creds',
      env: [{ from: 't.env', to: '.env' }],
      generate: { SESSION: 32 },
      variables: { LOG: 'debug' },
    });
    expect(manifest.sandboxRoot()).toBe('~/lanes');
    expect(manifest.composeFile()).toBe('docker/compose.yml');
    expect(manifest.secretsFile()).toBe('~/.creds');
    expect(manifest.environmentFiles()).toEqual([{ from: 't.env', to: '.env' }]);
    expect(manifest.generatedSecrets()).toEqual({ SESSION: 32 });
    expect(manifest.staticVariables()).toEqual({ LOG: 'debug' });
  });
});
