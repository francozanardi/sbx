---
name: sbx-sandboxes
description: Working with sbx sandboxes. Creating one, running commands inside one, moving between tasks, and the rules for an agent working inside one. Use when the project has a sandbox.config.json, when a directory looks like a sandbox, or when asked to run several agents in parallel on one repository. For setting sbx up on a project that has no manifest yet, use sbx-setup instead.
---

# Working with sbx sandboxes

A sandbox is an independent instance of a repository on this machine: its
own git clone, its own block of ports, its own stateful services, its own
rendered config, and its own seeded data. Slot 0 is the host checkout;
sandbox N shifts every port by N × stride.

Because it is a clone rather than a worktree, it owns its refs. It can be
on any branch, including `main` and including one another sandbox is on,
and ordinary git commands behave normally. Its identity is its name and
its slot, never its branch. The branch is read live, and changing it is
expected. Inside a sandbox, `origin` is the project's real remote and
`host` is the local checkout it was cloned from.

The intended use is **lanes**: a few long-lived sandboxes reused across
tasks. `sbx create` is shaped for that use. It positions the sandbox on
the remote's default branch (usually `main`), fetched fresh, and does not
invent a branch on the sandbox's behalf. A dev or an agent then switches
to a task branch inside the sandbox the same way they would in the host.

## Commands

Run them from anywhere inside the project. The manifest is found by
walking up from the working directory.

```bash
sbx create <name>          # clone, ports, services, install/migrate/seed
sbx sync <name>            # re-render env, start services, re-run install/migrate
sbx list                   # every sandbox, its slot, its service state
sbx info <name>            # one sandbox and the port each role got
sbx up <name>              # start its services
sbx down <name>            # stop them, keeping the data
sbx seed <name> --reset    # wipe its data and seed again
sbx run <name> -- <cmd>    # run a command in its directory and environment
sbx env <name>             # its variables as shell exports
sbx open <name>            # open its directory in $SBX_EDITOR (default: code)
sbx delete <name>          # services, volumes, clone, registry entry
sbx doctor                 # check what would break a create
```

`create` accepts `--from=<ref>` to pick a starting point other than the
remote's default branch, and `--branch=<name>` to create a local branch at
that point. Both are for the per-task use of a sandbox and are not needed
for lanes. `create` and `sync` both accept `--no-hooks`.

Run `sync` after anything that changes what the project declares: a merge
that adds a dependency or a migration, an edited env template, a
credential filled in. It repeats only what is safe to repeat, so a
sandbox keeps its data. Seeding stays behind `sbx seed`.

`delete` destroys the clone, so it **refuses to run** while the sandbox
holds commits no remote has, or files that are not committed, and prints
how to recover them. `--force` overrides. Push, or run
`git -C <project> fetch <sandbox-dir> <branch>`, before deleting anything
worth keeping.

## Rules when working inside a sandbox

1. **Start commands with `sbx run <name> -- …`**, or `eval "$(sbx env <name>)"`
   for a shell session. Running the project's dev command directly binds
   the host checkout's ports and collides with it.
2. **Never commit a rendered config file.** Anything listed under `env`
   in the manifest is generated per sandbox and belongs in `.gitignore`.
3. **Never edit a port in a config file** to work around a collision. Fix
   the manifest, or the code that should be reading the port from the
   environment.
4. **Commit changes to the manifest and its templates** like any other
   code. A sandbox only sees committed files, so the next one reads them
   from its own clone.
5. **The branch is the deliverable, and it only exists here.** A sandbox
   owns its refs, so a commit made inside one is nowhere else until it is
   pushed or fetched. Do not push or merge unless asked. Say so when the
   work is finished, because the human integrates it with `git fetch`
   from the host checkout, and deleting the sandbox before that loses it.

## Working in a lane

The default pattern. Create the lane once, keep it, switch branches
inside it as tasks come and go.

```bash
sbx create lane-a                       # lands on origin's default branch
sbx open lane-a
```

When a task begins:

```bash
sbx run lane-a -- git fetch origin
sbx run lane-a -- git switch -c <task-branch> origin/main
sbx sync lane-a                         # new dependencies, new migrations
sbx seed lane-a --reset                 # if the task wants clean data
```

Ports stay stable across every task in the lane, which matters when one
has to be registered somewhere external, like an OAuth redirect URI
allowlist.

Do not run `sbx sync` while an agent is working in the lane. Rebasing
under a running agent changes files it did not touch, and it will try to
"fix" what it finds. Sync between tasks, never during.

## Per-task sandboxes

Reserve for tasks that will leave the copy in a state worth throwing away:
a destructive migration, a dependency upgrade, a bisect. Combine
`--branch` and `--from` on `create` to open on the branch directly:

```bash
sbx create migrate-users --branch feat/migrate-users --from origin/main
```

Delete it when the task is merged. Costs one dependency install per task,
which is near-free with pnpm, bun or uv and expensive with npm or pip.

## When something fails

Every failure prints what went wrong and, on a second line, what to do
about it. A message starting with `unexpected failure:` is a defect in
sbx rather than a problem with the project. Re-run with `SBX_DEBUG=1`
for the stack.

`references/failures.md` lists the messages that have a specific cause.

## What is never isolated

Anything outside the machine: OAuth redirect URIs registered per port,
webhooks pointing at one public URL, paid third-party APIs. A sandbox can
point at a local substitute or go without, but it cannot isolate them.
Before running agents unattended, check whether the project's manifest
routes paid providers somewhere harmless.
