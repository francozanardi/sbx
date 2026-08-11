---
name: sbx-sandboxes
description: Working with sbx sandboxes — creating, running commands inside one, reseeding, tearing down, and the rules for an agent working in a sandbox worktree. Use when the project has a sandbox.config.mjs, when a directory looks like a sandbox worktree, or when asked to run several agents in parallel on one repository. For setting sbx up on a project that has no manifest yet, use sbx-setup instead.
---

# Working with sbx sandboxes

A sandbox is an independent instance of a repository on this machine: its own
git worktree and branch, its own block of ports, its own stateful services,
its own rendered config, and its own seeded data. Slot 0 is the normal
checkout; sandbox N shifts every port by N × stride.

## Commands

Run them from anywhere inside the project — the manifest is found by walking
up from the working directory.

```bash
sbx create <name>          # worktree, ports, services, install/migrate/seed
sbx list                   # every sandbox, its slot, its service state
sbx info <name>            # one sandbox and the port each role got
sbx up <name>              # start its services
sbx down <name>            # stop them, keeping the data
sbx seed <name> --reset    # wipe its data and seed again
sbx run <name> -- <cmd>    # run a command in its worktree and environment
sbx env <name>             # its variables as shell exports
sbx open <name>            # open its worktree in $SBX_EDITOR (default: code)
sbx delete <name>          # services, volumes, worktree, registry entry
sbx doctor                 # check what would break a create
```

`create` takes `--branch=<name>` (default: the sandbox name), `--from=<ref>`
(default: the checkout's current branch) and `--no-hooks`.

`delete` **keeps the branch** unless given `--delete-branch`. Teardown never
destroys work.

## Rules when working inside a sandbox

1. **Start commands with `sbx run <name> -- …`**, or `eval "$(sbx env <name>)"`
   for a shell session. Running the project's dev command directly binds the
   main checkout's ports and collides with it.
2. **Never commit a rendered config file.** Anything listed under `env` in the
   manifest is generated per sandbox and belongs in `.gitignore`.
3. **Never edit a port in a config file** to dodge a collision. Fix the
   manifest, or the code that should be reading the port from the environment.
4. **Commit changes to the manifest and its templates** like any other code.
   A worktree only sees committed files, so the next sandbox reads them from
   its own checkout.
5. **The branch is the deliverable.** Do not push or merge from inside a
   sandbox unless asked; the human integrates from the main checkout.

## Ways of working

**Lanes** — a few long-lived sandboxes (`lane-a`, `lane-b`) reused across
tasks. Between tasks, `git reset --hard <ref>` in the worktree followed by
`sbx seed <name> --reset` brings one back to a known state. Ports stay stable,
which matters when one has to be registered somewhere external, like an OAuth
redirect URI allowlist.

Do not resync a lane while an agent is working in it. Rebasing under a running
agent changes files it did not touch, and it will try to "fix" what it finds.
Sync between tasks, never during.

**Ephemeral** — one sandbox per task, deleted when merged. Always clean, no
reset ritual, and the branch name matches the task. Costs one dependency
install per task, which is near-free with pnpm, bun or uv and expensive with
npm or pip.

**Hybrid** is the usual answer: lanes for most work, an ephemeral sandbox when
the task will make a mess worth throwing away — a destructive migration, a
dependency upgrade, a bisect.

## When something fails

Every failure prints what went wrong and, on a second line, what to do about
it. A message starting with `unexpected failure:` is a defect in sbx rather
than a problem with the project; re-run with `SBX_DEBUG=1` for the stack.

`references/failures.md` lists the messages that have a specific cause.

## What is never isolated

Anything outside the machine: OAuth redirect URIs registered per port,
webhooks pointing at one public URL, paid third-party APIs. A sandbox can
point at a local substitute or go without, but it cannot isolate them. Before
running agents unattended, check whether the project's manifest routes paid
providers somewhere harmless.
