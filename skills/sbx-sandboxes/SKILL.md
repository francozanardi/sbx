---
name: sbx-sandboxes
description: Working with sbx sandboxes. Creating one, running commands inside one, switching branches, moving work between the sandbox and the host, and the rules for an agent working inside one. Use when the project has a sandbox.config.json, when a directory looks like a sandbox, or when asked to run several agents in parallel on one repository. For setting sbx up on a project that has no manifest yet, use sbx-setup instead.
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
expected.

Two git remotes are set up automatically:

- Inside a sandbox, `origin` is the project's real remote and `host`
  points at the host checkout the sandbox was cloned from.
- In the host checkout, `sbx-<name>` points at each sandbox. `sbx create
  lane-a` writes `sbx-lane-a` into the host's `.git/config`; `sbx delete
  lane-a` removes it.

The intended use is **lanes**: a few long-lived sandboxes reused across
tasks. `sbx create` is shaped for that. It positions the sandbox on the
remote's default branch (usually `main`), fetched fresh, and does not
invent a branch on the sandbox's behalf. Switching to a task branch
happens inside the sandbox the same way it happens in the host.

## Commands

Run them from anywhere inside the project. The manifest is found by
walking up from the working directory.

```bash
sbx create <name>          # allocate slot, clone, register host remote,
                           # render env, start services,
                           # run every prepare hook, run every populate hook
sbx rebuild <name>         # render env, start services,
                           # run every prepare hook
sbx rebuild <name> --data  # render env, start services,
                           # run every prepare hook, run every populate hook
sbx rebuild <name> --hard  # render env, destroy services and volumes, start services,
                           # run every prepare hook, run every populate hook
sbx run <name> -- <cmd>    # run <cmd> in the sandbox's directory with its env;
                           # stdout, stderr and exit code all forward
sbx open <name>            # interactive $SHELL in the sandbox
                           # (for humans at a terminal; not for agents)
sbx code <name>            # launch $SBX_EDITOR (default: code) at the sandbox
                           # (for humans; no env is injected into the editor)
sbx list                   # every sandbox, its slot, its service state
sbx info <name>            # one sandbox and the port each role got
sbx up <name>              # start its services
sbx down <name>            # stop them, keeping the data
sbx delete <name>          # services, volumes, clone, host remote, registry entry
sbx doctor                 # check what would break a create
```

`create` accepts `--from=<ref>` to pick a starting point other than the
remote's default branch, and `--branch=<name>` to create a local branch
at that point. Both are for per-task sandboxes and are not needed for
lanes. `create` and `rebuild` both accept `--no-hooks`.

The manifest declares hooks as an ordered array of `{ name, phase,
run }` objects. `name` is user-defined and only appears in logs and
error messages; do not assume a hook exists just because a familiar
name (`install`, `migrate`, `seed`, `reset`) would fit. Read the
project's `sandbox.config.json` when it matters. Hooks fall into two
phases:

- **`prepare`**: the sandbox's dependencies, forward migrations and
  generated artifacts. Every hook here is idempotent and does not
  destroy accumulated state.
- **`populate`**: the sandbox's runtime data. Every hook here is
  destructive of what a user or a previous run may have accumulated.

`rebuild` has three modes, each a strict superset of the previous:

- Default (`sbx rebuild <name>`): runs every `prepare` hook in
  declaration order. Nothing else changes. Use after a `git switch`
  or a merge that adds a dependency or a forward migration.
- `--data` (`sbx rebuild <name> --data`): runs every `prepare` hook,
  then every `populate` hook. Rewrites the sandbox's data.
- `--hard` (`sbx rebuild <name> --hard`): destroys the sandbox's
  Compose services and their volumes first, then runs every
  `prepare` hook, then every `populate` hook. Use when a branch
  removes a migration so the schema has to be rebuilt, or when
  file-based state cannot be fixed by the reset hook alone.

`delete` refuses to run while the sandbox holds commits no remote has, or
files that are not committed, and prints how to recover them. Push the
branch, or fetch it into the host with `git fetch sbx-<name> <branch>`.
`--force` overrides.

## Working inside a sandbox

An agent runs commands from the shell it was started in, one at a time.
The right primitive is `sbx run`:

```bash
sbx run lane-a -- pnpm test
sbx run lane-a -- git status
sbx run lane-a -- pnpm dev
```

`run` executes the command in the sandbox's directory with its ports,
credentials and generated secrets in the environment. Every command that
needs those values, and every command that has to read the sandbox's
files at all, goes through `run`. One command per call, exit code
propagated, no shell state to carry across.

Two other commands exist for humans and can be mentioned when relevant
but should not be used from an agent:

- `sbx open <name>` opens an interactive subshell. Useful for a person
  driving the sandbox from a terminal; not useful for an agent, which
  cannot cleanly own or exit a subshell.
- `sbx code <name>` opens the sandbox in `$SBX_EDITOR`. Only useful when
  a human is going to work in it.

## Rules when working inside a sandbox

1. **Every command that touches the sandbox runs through `sbx run`.**
   Never `cd` into the sandbox and run a dev command from there. Without
   the sandbox's ports in the environment, the process binds the host's
   ports and collides with the host or with another sandbox.
2. **Never commit a rendered config file.** Anything listed under `env`
   in the manifest is generated per sandbox and belongs in `.gitignore`.
3. **Never edit a port in a config file** to work around a collision.
   Fix the manifest, or the code that should be reading the port from
   the environment.
4. **Commit changes to the manifest and its templates** like any other
   code. A sandbox only sees committed files, so the next one reads them
   from its own clone.
5. **The branch is the deliverable, and it only exists here.** A sandbox
   owns its refs, so a commit made inside one is nowhere else until it
   is pushed or fetched. Do not push or merge unless asked. Say so when
   the work is finished; the human integrates it with `git fetch
   sbx-<name> <branch>` from the host checkout, and deleting the sandbox
   before that loses it.

## Working in a lane

The default pattern. Create the lane once, reuse it across tasks.

```bash
sbx create lane-a           # lands on origin's default branch
```

When switching to a new task:

```bash
sbx run lane-a -- git fetch origin
sbx run lane-a -- git switch -c <task-branch> origin/main
```

Pick the right rebuild mode for what the new branch needs:

```bash
sbx rebuild lane-a          # new dependencies or forward migrations
sbx rebuild lane-a --data   # also reseed the data
sbx rebuild lane-a --hard   # also rebuild services and schema
```

Ports stay stable across every task in the lane, which matters when one
has to be registered somewhere external, like an OAuth redirect URI
allowlist.

Do not run `sbx rebuild` while an agent is working in the lane. It
rewrites files the agent did not touch, and the agent will try to "fix"
what it finds. Rebuild between tasks, never during.

## Per-task sandboxes

Reserve for tasks that will leave the sandbox in a state worth throwing
away: a destructive migration, a dependency upgrade, a bisect. Combine
`--branch` and `--from` on `create` to open on the task branch directly:

```bash
sbx create migrate-users --branch feat/migrate-users --from origin/main
```

Delete the sandbox when the task is merged. Costs one dependency install
per task, which is near-free with pnpm, bun or uv and expensive with npm
or pip.

## Moving work between the sandbox and the host

**Fetch a branch from a sandbox into the host.** From the host checkout:

```bash
git fetch sbx-lane-a feat/x
git switch feat/x
```

**Pull work from the host into a sandbox.** Inside the sandbox, the
`host` remote points at the host checkout:

```bash
sbx run lane-a -- git fetch host
sbx run lane-a -- git merge host/main
```

## When something fails

Every failure prints what went wrong and, on a second line, what to do
about it. A message starting with `unexpected failure:` is a defect in
sbx rather than a problem with the project. Re-run with `SBX_DEBUG=1`
for the stack.

`references/failures.md` lists the messages that have a specific cause.

## What is never isolated

Anything outside the machine: OAuth redirect URIs registered per port,
webhooks pointing at one public URL, paid third-party APIs. A sandbox
can point at a local substitute or go without, but it cannot isolate
them. Before running agents unattended, check whether the project's
manifest routes paid providers somewhere harmless.
