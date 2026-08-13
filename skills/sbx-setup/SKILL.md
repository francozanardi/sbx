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
  "base": { "api": 3000, "web": 5173, "postgres": 5432 }
}
```

`stride` defaults to 10 and `maxSlots` to 9. Omit them unless the project
needs other values — a default spelled out reads as one that was chosen.

Each role is published as `ROLE_PORT`. `api` becomes `API_PORT`,
`blobConsole` becomes `BLOB_CONSOLE_PORT`. Add `"env": { "api": "HTTP_PORT" }`
only for roles whose variable the project already names differently. Two
roles cannot share a variable name, and role names have to survive the
translation: `db-main` would yield `DB-MAIN_PORT`, which no process can
read, so name it `dbMain` or publish it explicitly.

**No two base ports may be an exact multiple of `stride` apart.** Every
port shifts by slot × stride, so with `{ "api": 4940, "db": 4950 }` and a
stride of 10, slot 1's `api` lands on 4950 — the port this checkout is
already using for `db`. Round numbers 10 or 100 apart are the usual way
into this. sbx refuses the manifest and names both roles, so there is
nothing to work out by hand; move one base port or pick another stride.

Changing `ports.base` or `stride` later moves the ports of sandboxes that
already exist, since a block is derived rather than stored. `sbx doctor`
fails on it and `sbx rebuild` warns before it happens, but their running
services and any externally registered URL still have to be dealt with.

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

Four rules the manifest is checked against:

- **Every `to` belongs in `.gitignore`.** It is regenerated per sandbox
  with that sandbox's ports and secrets. Committed, it reads as modified
  in every sandbox forever, `sbx delete` refuses for good, and the
  credentials are one `git add -A` from the remote. `sbx doctor` fails on
  a committed one and flags an unignored one.
- **`from` and `to` stay inside the repository and the sandbox.** A `..`
  segment is refused; it would write somewhere no sandbox owns and
  nothing cleans up.
- **`generate` values are byte counts, at least 16.** 32 is a good
  default. They are minted once per sandbox and never rotated, because
  rotating would invalidate every session and encrypted value the sandbox
  produced before.
- **Names must not start with `SBX_` and must not collide.** sbx sets
  `SBX_PROJECT`, `SBX_NAME`, `SBX_SLOT`, `SBX_DIRECTORY` and `SBX_BRANCH`
  itself, and one name declared twice across `variables`, `generate` and
  `ports.env` means one of the two never reaches a template.

Machine-wide credentials go in `~/.sbx/<project>/secrets.env` once, by
hand. Ship a `secrets.env.example` in the repository so the list is
discoverable.

## 6. Declare the hooks, verify, commit

Hooks are the shell commands sbx runs to bring a sandbox from a fresh
clone (or from an existing state) to a runnable, populated project. The
value is an **ordered array** of objects; each object has three
required fields:

- `name`: a unique string. Only used for logs and error messages, so
  a failure prints `` The `<name>` hook failed: … ``. Not a keyword.
- `phase`: either `"prepare"` or `"populate"`. Nothing else is accepted.
- `run`: the shell command line, executed with `sh -c`.

```json
"hooks": [
  { "name": "install",       "phase": "prepare",  "run": "pnpm install" },
  { "name": "migrate",       "phase": "prepare",  "run": "pnpm db:migrate" },
  { "name": "build-workers", "phase": "prepare",  "run": "pnpm --filter workers build" },
  { "name": "reset",         "phase": "populate", "run": "node sandbox/reset.mjs" },
  { "name": "seed",          "phase": "populate", "run": "node sandbox/seed.mjs" }
]
```

**Phases and their contract.**

- **`prepare`** brings the sandbox to the branch's declared state:
  install dependencies, apply forward migrations, build generated
  artifacts. Every hook here must be idempotent, safe to re-run when
  nothing has changed. It must not destroy data a user may have
  accumulated in the sandbox.
- **`populate`** rewrites the sandbox's runtime data: reset seeded
  rows, insert known data, warm caches, register mocks. Every hook
  here is expected to be destructive of accumulated state. It runs
  after everything in `prepare` has finished.

**When each phase runs.**

- `sbx create <name>` runs `prepare`, then `populate`.
- `sbx rebuild <name>` runs `prepare` only.
- `sbx rebuild <name> --data` runs `prepare`, then `populate`.
- `sbx rebuild <name> --hard` destroys the sandbox's services and
  their volumes first, then runs `prepare`, then `populate`.
- `--no-hooks` on `create` or `rebuild` skips every hook regardless of
  phase.

**What matters about ordering.** The array position is the run order
inside a phase. In the example above, `install` runs before `migrate`
which runs before `build-workers`; in the populate phase, `reset` runs
before `seed`. sbx does not reorder or parallelize.

**What is optional.** Every field of a hook object is required, but
the `hooks` array itself is optional and can be empty. A project with
no dependencies to install, no database to migrate, and no data to
seed can declare `"hooks": []` (or omit the field). A project with
nothing to reset or seed can declare `prepare` hooks only; `sbx
rebuild --data` and `--hard` on such a project still run cleanly,
they just have no `populate` work to do.

**What a hook failure means.** A hook that exits non-zero is fatal to
the invoking command (`create` or `rebuild`). The sandbox is left in
whatever state the failing hook produced. For `create`, that means a
half-provisioned sandbox that must be deleted with `sbx delete <name>
--force` before retrying. sbx prints a warning to that effect when it
happens.

```bash
sbx doctor
git commit      # a sandbox only sees committed files
sbx create sb-1
```

## Seeds

Seed two or three accounts covering distinct states: one at a limit, one
paid, one with no ceiling. Gated paths can then be exercised by signing
in as someone else instead of editing the database by hand. Make the
seed idempotent: delete those accounts and rewrite them, so `sbx rebuild
--data` always lands on the same known state.

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
