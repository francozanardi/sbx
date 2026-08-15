import { describe, expect, it } from 'vitest';
import { ProjectManifest } from '@/domain/ProjectManifest.js';
import { SbxError } from '@/domain/SbxError.js';

const validRaw = {
  name: 'demo',
  ports: { base: { app: 3000 } },
};

function build(raw: unknown): ProjectManifest {
  const manifest = new ProjectManifest(raw, '/tmp/demo');
  manifest.checkAll();
  return manifest;
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
    ['a string', 'string root'],
    [[], 'array root'],
  ])('rejects a manifest that is not an object (%s)', (raw, _label) => {
    expect(() => build(raw)).toThrow(/does not hold a JSON object/);
  });

  it.each([
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

describe('ProjectManifest — stride and slots', () => {
  it.each([['ten'], [0], [1.5], [true]])('rejects a stride that is not a positive integer (%s)', (bad) => {
    expect(() => build({ name: 'demo', ports: { base: { app: 3000 }, stride: bad } })).toThrow(/ports.stride/);
  });

  it.each([['lots'], [0], [2.5]])('rejects maxSlots that is not a positive integer (%s)', (bad) => {
    expect(() => build({ name: 'demo', ports: { base: { app: 3000 }, maxSlots: bad } })).toThrow(/ports.maxSlots/);
  });
});

describe('ProjectManifest — colliding port blocks', () => {
  it('rejects two roles sharing one base port', () => {
    expect(() => build({ name: 'demo', ports: { base: { api: 3000, web: 3000 } } })).toThrow(/are both 3000/);
  });

  it('rejects base ports an exact stride apart, which collides with slot 0', () => {
    // slot 1's `api` (4950) is the port this checkout binds for `db`.
    expect(() => build({ name: 'demo', ports: { base: { api: 4940, db: 4950 } } })).toThrow(
      /exact multiple of `ports.stride`/,
    );
  });

  it('rejects base ports a whole number of strides apart', () => {
    expect(() => build({ name: 'demo', ports: { base: { api: 3000, db: 3020 } } })).toThrow(
      /exact multiple of `ports.stride`/,
    );
  });

  it('accepts a distance no slot can reach', () => {
    // 1000 is a multiple of 10, but slot 100 does not exist with maxSlots 9.
    expect(() => build({ name: 'demo', ports: { base: { api: 4700, db: 5700 } } })).not.toThrow();
  });

  it('accepts base ports that no stride multiple lands on', () => {
    expect(() => build({ name: 'demo', ports: { base: { api: 3000, db: 5432 } } })).not.toThrow();
  });
});

describe('ProjectManifest — port variable names', () => {
  it('rejects an entry in ports.env for a role with no base port', () => {
    expect(() => build({ name: 'demo', ports: { base: { api: 1 }, env: { web: 'WEB_PORT' } } })).toThrow(
      /ports.env.web/,
    );
  });

  it('rejects two roles published under one variable name', () => {
    const raw = { name: 'demo', ports: { base: { api: 1, web: 2 }, env: { api: 'PORT', web: 'PORT' } } };
    expect(() => build(raw)).toThrow(/declared by both/);
  });

  it('rejects a role whose default variable name would be unusable', () => {
    expect(() => build({ name: 'demo', ports: { base: { 'db-main': 1 } } })).toThrow(/not a usable variable name/);
  });

  it('rejects a reserved SBX_ variable name', () => {
    expect(() => build({ name: 'demo', ports: { base: { api: 1 }, env: { api: 'SBX_NAME' } } })).toThrow(/reserved/);
  });
});

describe('ProjectManifest — generate', () => {
  const withGenerate = (generate: unknown) => ({ ...validRaw, generate });

  it('rejects a non-object', () => {
    expect(() => build(withGenerate([1, 2]))).toThrow(/generate/);
  });

  it.each([[8], ['32'], [32.5]])('rejects a byte length that is not a usable integer (%s)', (bad) => {
    expect(() => build(withGenerate({ SESSION: bad }))).toThrow(/generate.SESSION/);
  });

  it('rejects an unusable variable name', () => {
    expect(() => build(withGenerate({ 'session-secret': 32 }))).toThrow(/not a usable variable name/);
  });
});

describe('ProjectManifest — variables', () => {
  it('rejects non-string values', () => {
    expect(() => build({ ...validRaw, variables: { LOG_LEVEL: 5 } })).toThrow(/variables.LOG_LEVEL/);
  });

  it('rejects a name also minted by generate', () => {
    const raw = { ...validRaw, generate: { TOKEN: 32 }, variables: { TOKEN: 'x' } };
    expect(() => build(raw)).toThrow(/declared by both/);
  });
});

describe('ProjectManifest — env files', () => {
  const withEnv = (env: unknown) => ({ ...validRaw, env });

  it('rejects a non-array', () => {
    expect(() => build(withEnv('templates/app.env'))).toThrow(/`env` must be an array/);
  });

  it('rejects an entry missing `to`', () => {
    expect(() => build(withEnv([{ from: 'a.env' }]))).toThrow(/env\[0\].to/);
  });

  it('rejects an entry missing `from`', () => {
    expect(() => build(withEnv([{ to: '.env' }]))).toThrow(/env\[0\].from/);
  });

  it('rejects a destination that climbs out of the sandbox', () => {
    expect(() => build(withEnv([{ from: 'a.env', to: '../../escaped.env' }]))).toThrow(/climbs out/);
  });

  it('rejects an absolute destination', () => {
    expect(() => build(withEnv([{ from: 'a.env', to: '/etc/app.env' }]))).toThrow(/absolute path/);
  });

  it('rejects two templates rendering into one file', () => {
    const env = [
      { from: 'a.env', to: '.env' },
      { from: 'b.env', to: '.env' },
    ];
    expect(() => build(withEnv(env))).toThrow(/already renders into/);
  });
});

describe('ProjectManifest — compose', () => {
  it('rejects a compose path that climbs out of the repository', () => {
    expect(() => build({ ...validRaw, compose: '../compose.yml' })).toThrow(/climbs out/);
  });

  it('rejects a non-string compose', () => {
    expect(() => build({ ...validRaw, compose: true })).toThrow(/compose/);
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

describe('ProjectManifest — lazy validation', () => {
  it('does not validate untouched sections at construction', () => {
    const raw = {
      name: 'demo',
      ports: { base: { api: 3000 }, env: { api: 'SBX_API_PORT' } },
      hooks: [{ name: 'bad', phase: 'not-a-phase', run: 'x' }],
    };
    const manifest = new ProjectManifest(raw, '/tmp/demo');
    expect(manifest.name()).toBe('demo');
    expect(manifest.composeFile()).toBeNull();
    expect(manifest.sandboxRoot()).toBeNull();
    expect(manifest.secretsFile()).toBeNull();
    expect(manifest.environmentFiles()).toEqual([]);
  });

  it('reports a section error only when that section is asked for', () => {
    const raw = {
      name: 'demo',
      ports: { base: { api: 3000 }, env: { api: 'SBX_API_PORT' } },
    };
    const manifest = new ProjectManifest(raw, '/tmp/demo');
    expect(() => manifest.portVariableNames()).toThrow(/reserved/);
  });

  it('checkAll surfaces every field error', () => {
    const raw = {
      name: 'demo',
      ports: { base: { api: 3000 }, env: { api: 'SBX_API_PORT' } },
    };
    const manifest = new ProjectManifest(raw, '/tmp/demo');
    expect(() => { manifest.checkAll(); }).toThrow(/reserved/);
  });
});
