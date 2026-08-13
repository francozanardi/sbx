export interface EcosystemEntry {
  readonly marker: string;
  readonly ecosystem: string;
  readonly install: string;
}

/**
 * Maps the file that identifies a toolchain to the command that installs
 * its dependencies. Lockfiles come before the manifests they lock, so a
 * project with both is read as the more specific one.
 *
 * This is the only detection the tool does. Ports, services and seeds are
 * never guessed — a wrong guess there costs more than a blank field.
 */
export class EcosystemCatalog {
  entries(): readonly EcosystemEntry[] {
    return [
      { marker: 'pnpm-lock.yaml', ecosystem: 'node + pnpm', install: 'pnpm install' },
      { marker: 'bun.lockb', ecosystem: 'node + bun', install: 'bun install' },
      { marker: 'yarn.lock', ecosystem: 'node + yarn', install: 'yarn install --immutable' },
      { marker: 'package-lock.json', ecosystem: 'node + npm', install: 'npm ci' },
      { marker: 'package.json', ecosystem: 'node', install: 'npm install' },
      { marker: 'uv.lock', ecosystem: 'python + uv', install: 'uv sync' },
      { marker: 'poetry.lock', ecosystem: 'python + poetry', install: 'poetry install' },
      { marker: 'requirements.txt', ecosystem: 'python + pip', install: 'python -m venv .venv && .venv/bin/pip install -r requirements.txt' },
      { marker: 'Cargo.toml', ecosystem: 'rust', install: 'cargo fetch' },
      { marker: 'go.mod', ecosystem: 'go', install: 'go mod download' },
      { marker: 'gradlew', ecosystem: 'java + gradle', install: './gradlew --quiet classes' },
      { marker: 'pom.xml', ecosystem: 'java + maven', install: 'mvn -q -DskipTests install' },
      { marker: 'Gemfile', ecosystem: 'ruby', install: 'bundle install' },
      { marker: 'composer.json', ecosystem: 'php', install: 'composer install' },
    ];
  }
}
