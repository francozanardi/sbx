---
name: sbx-setup
description: Setting up sbx on a repository. Writing sandbox.config.json, declaring ports, services, env templates and lifecycle hooks so several agents can run the full stack in parallel. Use when a project has no sandbox.config.json yet, when asked to add sandbox support to a repo, or when a manifest needs a new port role, service, credential or hook. For using sandboxes that already exist, use sbx-sandboxes instead.
---

# Setting up sbx on a repository

sbx gives a repository N independent instances on one machine. Everything
project-specific lives in a `sandbox.config.json` at the repository root.
The tool itself knows nothing about any ecosystem.

Setup is six steps. Verify with `sbx doctor` after each of the last three.
It reports what would break without spending a create on finding out.

## 1. Make the project read its ports from the environment

The only change sbx requires in the project's code, and the one most often
skipped. A port written down in a config file is what makes two sandboxes
collide.

```diff
- port: 5173,
+ port: Number(process.env.WEB_PORT ?? 5173),
```

Keep the old value as the fallback so a plain checkout keeps working. Do
this everywhere a port appears: server bind, dev server, proxy targets,
CORS origin lists, callback URLs.

## 2. Draft the manifest

```bash
sbx init
```

It fills in the project name and the install command for the toolchain it
detects. It does not guess ports, services or seeds.

## 3. Declare the ports

```json
"ports": {
  "base": { "api": 3000, "web": 5173, "postgres": 5432 },
  "stride": 10,
  "maxSlots": 9
}
```

`stride` defaults to 10 and `maxSlots` to 9. Omit them unless the project
needs other values.

Each role is published as `ROLE_PORT`. `api` becomes `API_PORT`,
`blobConsole` becomes `BLOB_CONSOLE_PORT`. Add `"env": { "api": "HTTP_PORT" }`
only for roles whose variable the project already names differently.

`stride` must exceed the widest gap between two base ports.

## 4. Declare the services, if any

A `compose.yml` with **no** `container_name`, **no** project name, and host
ports from the block. sbx runs it as a Compose project per sandbox, which
namespaces containers, networks and volumes for free.

```yaml
services:
  postgres:
    image: postgres:16
    ports: ["${POSTGRES_PORT}:5432"]
    volumes: [data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 3s
      retries: 20
volumes: { data: }
```

**The healthcheck is load-bearing.** Services start with `--wait`. One
without a healthcheck counts as ready the moment it is running, and the
first migration hits a database that is still initializing.

A project whose state lives in files inside the sandbox declares no
`compose` at all, and sbx skips Docker entirely.

## 5. Declare the config files

```json
"env": [{ "from": "sandbox/templates/api.env", "to": "apps/api/.env" }],
"generate": { "SESSION_SECRET": 32 },
"variables": { "LOG_LEVEL": "debug" }
```

Templates use `${NAME}` against one variable map, assembled in this order,
each layer overriding the one above it:

```
manifest `variables`  →  ~/.sbx/<project>/secrets.env  →  generated secrets
                      →  the port block  →  SBX_NAME, SBX_SLOT, SBX_DIRECTORY, …
```

An unresolvable name **fails the render**. It never becomes an empty
string, because a silently blank credential fails much later and much
further from its cause.

Machine-wide credentials go in `~/.sbx/<project>/secrets.env` once, by
hand. Ship a `secrets.env.example` in the repository so the list is
discoverable.

## 6. Declare the hooks, verify, commit

```json
"hooks": {
  "install": "pnpm install",
  "migrate": "pnpm db:migrate",
  "seed": "node sandbox/seed.mjs",
  "reset": "node sandbox/reset.mjs"
}
```

Shell command lines, run from the sandbox root with the variables in the
environment. `create` runs install → migrate → seed. `sbx seed --reset`
runs reset → seed.

```bash
sbx doctor
git commit      # a sandbox only sees committed files
sbx create sb-1
```

## Seeds

Seed two or three accounts covering distinct states: one at a limit, one
paid, one with no ceiling. Gated paths can then be exercised by signing in
as someone else instead of editing the database by hand. Make the seed
idempotent: delete those accounts and rewrite them, so `--reset` always
lands on the same known state.

When the write path is non-trivial, such as password hashing, import the
application's own function rather than reimplementing it. Reimplementing
breaks silently the day the library changes its scheme.

## Further reading

- `references/examples.md`: complete manifests for a Node webapp with
  Postgres, a Python API with MySQL, and a Rust service with SQLite and no
  Docker.
- `references/caches.md`: why creating a sandbox is nearly free with some
  package managers and expensive with others, and the filesystem trap that
  triples both time and disk.
