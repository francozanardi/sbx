import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

/**
 * Builds `dist/main.js` once before any test runs. E2E tests exercise the
 * compiled binary directly, which is what npm publishes — the artifact
 * being tested has to match what users install.
 */
export default function globalSetup(): void {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`\`npm run build\` failed with status ${String(result.status)}`);
  }
}
