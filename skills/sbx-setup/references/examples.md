# Three worked manifests

The same six pieces in three ecosystems. The third one uses no Docker at all,
which is the clearest view of what sbx always provides: slots, ports, rendered
config, hooks.

## A. Node webapp, Postgres, pnpm

Two dev servers and a database.

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
  "hooks": {
    "install": "pnpm install",
    "migrate": "pnpm --filter api db:migrate",
    "seed": "node sandbox/seed.mjs",
    "reset": "node sandbox/reset.mjs"
  }
}
```

Only `web` names its variable. `api` and `postgres` default to `API_PORT` and
`POSTGRES_PORT`.

```
# sandbox/templates/api.env
PORT=${API_PORT}
DATABASE_URL=postgresql://acme:acme@127.0.0.1:${POSTGRES_PORT}/acme
SESSION_SECRET=${SESSION_SECRET}
CORS_ORIGIN=http://localhost:${VITE_PORT}
STRIPE_SECRET_KEY=${STRIPE_TEST_KEY}
```

`STRIPE_TEST_KEY` comes from `~/.sbx/acme/secrets.env`, filled once by hand and
shared by every sandbox of the project.

```bash
sbx create sb-1
sbx run sb-1 -- pnpm dev
```

## B. Python API, MySQL, uv

Same shape, different toolchain. The virtualenv lives inside the sandbox; uv's
package cache is global and linked, so the second sandbox installs almost
instantly.

```json
{
  "name": "billing",
  "ports": { "base": { "api": 8000, "mysql": 3306 } },
  "compose": "sandbox/compose.yml",
  "env": [{ "from": "sandbox/templates/api.env", "to": ".env" }],
  "hooks": {
    "install": "uv sync",
    "migrate": "uv run alembic upgrade head",
    "seed": "uv run python -m sandbox.seed",
    "reset": "uv run python -m sandbox.reset"
  }
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

No services to declare, so `compose` is absent and `create` skips that step.
The database is a file inside the sandbox: isolation is free and teardown is
automatic.

```json
{
  "name": "ingest",
  "ports": { "base": { "http": 8080 } },
  "env": [{ "from": "sandbox/templates/app.env", "to": ".env" }],
  "variables": { "RUSTC_WRAPPER": "sccache" },
  "hooks": {
    "install": "cargo fetch",
    "migrate": "cargo run --bin migrate",
    "seed": "cargo run --bin seed",
    "reset": "rm -f data/ingest.db && cargo run --bin migrate"
  }
}
```

Cargo's registry cache is global, but `target/` is per-directory and large. The
`RUSTC_WRAPPER` variable points every sandbox at a shared compilation cache so
a new one does not recompile the world; sccache avoids the lock contention a
shared `target/` would cause.

```
# sandbox/templates/app.env
HTTP_PORT=${HTTP_PORT}
DATABASE_URL=sqlite://data/ingest.db
```

## Substituting a hosted service

A hosted dependency can often be swapped for a local container without a code
change, as long as the client is configured by environment rather than
hardcoded. An S3-compatible store is the common case: point the endpoint
variable at a MinIO container in the sandbox's compose file and keep the same
client. Check that the client uses path-style addressing, which MinIO needs and
most S3 clients have a flag for.

What cannot be substituted this way: OAuth redirect URIs registered per port,
webhooks targeting one public URL, and paid APIs. Route those to a fake
provider selected by environment, or leave their credentials empty so the
feature is off.
