# Three worked manifests

The same shape in three ecosystems, with the two axes that matter most for
setup: whether stateful services are needed (Docker or not) and how many
hooks the project's build has.

Every manifest declares the same fields in the same order:

- `name`: identifies the project on this machine. Used for the state
  directory (`~/.sbx/<name>/`) and the Compose project of each sandbox.
- `ports.base`: role → default port. Each role is exported as
  `<ROLE>_PORT` in the sandbox's environment, shifted by the slot.
- `compose` (optional): path to the Compose file. Omit for projects
  whose state lives in files inside the sandbox.
- `env`: list of `{ from, to }` template renders. `from` is the template
  path in the project; `to` is where it lands inside the sandbox.
- `generate` (optional): variable name → byte length, for secrets that
  are minted once per sandbox and reused.
- `variables` (optional): fixed values every sandbox of the project
  gets in its environment.
- `hooks`: ordered array of `{ name, phase, run }`. `prepare` runs on
  every `sbx create` and `sbx rebuild`; `populate` also runs with
  `sbx create` and `sbx rebuild --data`.

## A. Node webapp, Postgres, pnpm, one custom hook

Two dev servers, a Postgres, and a background worker bundle that has to
be compiled before the API can talk to it.

```json
{
  "name": "acme",
  "ports": {
    "base": { "api": 3000, "web": 5173, "postgres": 5432 },
    "env": { "web": "VITE_PORT" }
  },
  "compose": "sandbox/compose.yml",
  "env": [{ "from": "sandbox/templates/api.env", "to": "apps/api/.env" }],
  "generate": { "SESSION_SECRET": 32 },
  "hooks": [
    { "name": "install",       "phase": "prepare",  "run": "pnpm install" },
    { "name": "migrate",       "phase": "prepare",  "run": "pnpm --filter api db:migrate" },
    { "name": "build-workers", "phase": "prepare",  "run": "pnpm --filter workers build" },
    { "name": "reset",         "phase": "populate", "run": "node sandbox/reset.mjs" },
    { "name": "seed",          "phase": "populate", "run": "node sandbox/seed.mjs" }
  ]
}
```

`build-workers` is not a name sbx knows about. Nothing is: the four
familiar names (`install`, `migrate`, `seed`, `reset`) are convention,
not keywords. sbx runs whatever is in the `hooks` array in declaration
order, filtered by phase.

`web` is the only role whose environment variable is named explicitly.
`api` defaults to `API_PORT`, `postgres` to `POSTGRES_PORT`.

```
# sandbox/templates/api.env
PORT=${API_PORT}
DATABASE_URL=postgresql://acme:acme@127.0.0.1:${POSTGRES_PORT}/acme
SESSION_SECRET=${SESSION_SECRET}
CORS_ORIGIN=http://localhost:${VITE_PORT}
STRIPE_SECRET_KEY=${STRIPE_TEST_KEY}
```

`STRIPE_TEST_KEY` comes from `~/.sbx/acme/secrets.env`, filled once by
hand and shared by every sandbox of the project.

```bash
sbx create sb-1
sbx run sb-1 -- pnpm dev
```

## B. Python API, MySQL, uv

Same shape, different toolchain. The virtualenv lives inside the
sandbox; uv's package cache is global and linked, so the second sandbox
installs almost instantly.

```json
{
  "name": "billing",
  "ports": { "base": { "api": 8000, "mysql": 3306 } },
  "compose": "sandbox/compose.yml",
  "env": [{ "from": "sandbox/templates/api.env", "to": ".env" }],
  "hooks": [
    { "name": "install", "phase": "prepare",  "run": "uv sync" },
    { "name": "migrate", "phase": "prepare",  "run": "uv run alembic upgrade head" },
    { "name": "reset",   "phase": "populate", "run": "uv run python -m sandbox.reset" },
    { "name": "seed",    "phase": "populate", "run": "uv run python -m sandbox.seed" }
  ]
}
```

```yaml
# sandbox/compose.yml
services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD: billing
      MYSQL_DATABASE: billing
    ports: ["${MYSQL_PORT}:3306"]
    volumes: [data:/var/lib/mysql]
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -pbilling"]
      interval: 3s
      retries: 30      # mysql's first boot is slow; give it room
volumes: { data: }
```

```bash
sbx run sb-1 -- uv run uvicorn app.main:app --port "$API_PORT"
```

## C. Rust service, SQLite, no Docker

No services to declare, so `compose` is absent and `sbx` skips Docker
entirely. The database is a file inside the sandbox, which means
isolation is free (every sandbox has its own file) and teardown is
automatic (deleting the sandbox deletes the file).

```json
{
  "name": "ingest",
  "ports": { "base": { "http": 8080 } },
  "env": [{ "from": "sandbox/templates/app.env", "to": ".env" }],
  "variables": { "RUSTC_WRAPPER": "sccache" },
  "hooks": [
    { "name": "build",   "phase": "prepare",  "run": "cargo build" },
    { "name": "migrate", "phase": "prepare",  "run": "cargo run --bin migrate" },
    { "name": "reset",   "phase": "populate", "run": "rm -f data/ingest.db && cargo run --bin migrate" },
    { "name": "seed",    "phase": "populate", "run": "cargo run --bin seed" }
  ]
}
```

Cargo's registry cache is global, but `target/` is per-directory and
large. `RUSTC_WRAPPER=sccache` points every sandbox at a shared
compilation cache so a new one does not recompile the world; sccache
avoids the lock contention a shared `target/` would cause.

The `reset` hook drops the SQLite file and re-applies migrations, so
`sbx rebuild --data` returns the sandbox to a fresh schema before
seeding. Migrate appears twice in the create flow (once in `prepare`,
once inside `reset`) but is idempotent, so the extra call costs
milliseconds.

```
# sandbox/templates/app.env
HTTP_PORT=${HTTP_PORT}
DATABASE_URL=sqlite://data/ingest.db
```

## Minimal shape

A project with nothing to migrate, nothing to seed, and no stateful
services still declares a manifest, because sbx needs the port block
and the env templates to isolate copies. The hooks array can be almost
empty:

```json
{
  "name": "static-site",
  "ports": { "base": { "web": 4321 } },
  "env": [{ "from": "sandbox/templates/site.env", "to": ".env" }],
  "hooks": [
    { "name": "install", "phase": "prepare", "run": "pnpm install" }
  ]
}
```

No `populate` hooks at all. `sbx rebuild --data` and `sbx rebuild
--hard` still work; they run install and nothing else in the
`populate` slot.

## Substituting a hosted service

A hosted dependency can often be swapped for a local container without
a code change, as long as the client is configured by environment
rather than hardcoded. An S3-compatible store is the common case:
point the endpoint variable at a MinIO container in the sandbox's
Compose file and keep the same client. Check that the client uses
path-style addressing, which MinIO needs and most S3 clients have a
flag for.

What cannot be substituted this way: OAuth redirect URIs registered
per port, webhooks targeting one public URL, and paid APIs. Route
those to a fake provider selected by environment, or leave their
credentials empty so the feature is off.
