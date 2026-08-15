# sbx

Run several copies of your project on one machine at the same time. Each copy
gets its own database, its own services, its own config and its own data.

Made for running coding agents in parallel. Two agents, two copies, nothing
shared.

## ⚠️ About this code

**This code was written almost entirely by a generative AI model, and it has
had very little human review.** It works on the author's machine and its
behaviour has been exercised by hand, but nobody has read it line by line.

Worth knowing what it touches: it creates and removes git clones, adds and
removes remotes in the host repository's `.git/config`, starts and destroys
Docker containers and volumes, and writes files under your home directory.
All of that is scoped to the sandboxes it manages.

## Install

```bash
npm install -g @francozanardi/sbx
```

Needs Node 22 or later, `git`, and `docker` if your project uses services.
Tested on Linux. macOS should work but is unverified. No Windows.

## Set it up

sbx needs one file at your repository root, `sandbox.config.json`. It
declares what your project needs: which services to start, which config
files to write, and the commands to install, migrate and seed it.

The fastest way is to let an agent write it:

```bash
npx skills add francozanardi/sbx
```

Then tell your agent: **"set up sbx on this project"**. The skill covers
the format, the defaults and the mistakes that are easy to make.

To do it by hand, `sbx init` writes a starting file and `sbx doctor`
reports what is still missing.

**One requirement on your code**: the ports it uses must be read from
environment variables, not hardcoded.

## Use it

```bash
sbx create lane-a
sbx open lane-a
```

`sbx open` drops you into a shell in the sandbox's directory, with its
ports and credentials loaded as environment variables. Run the project as
you normally would. Type `exit` to return.

## Concepts

A few terms used across the docs and the commands.

- **Host.** Your normal checkout of the repository, the one you work in
  every day.
- **Copy.** An independent clone of the repository, placed next to the
  host, with its own ports, services, config and data. The CLI and skills
  call these `sandboxes`; the words mean the same thing.
- **Lane.** A copy used as a long-lived workspace, kept around and reused
  across tasks. This is the intended way to use sbx.
- **Slot.** A number that identifies a copy. The host is slot 0. Every
  port a copy uses is shifted by its slot, so nothing collides.
- **Manifest.** The `sandbox.config.json` file at your repository root.
  Every copy reads from it.
- **Hook.** A shell command the manifest declares. sbx runs hooks at
  fixed moments (creating a copy, rebuilding it). Each hook belongs to
  a phase (see the rebuild section below).
- **Service.** A stateful process the copy runs, typically a database
  in a container. Declared in a Compose file the manifest points at.

Two git remotes are set up automatically:

- Inside a copy, `host` points at your host checkout, and `origin` points
  at the project's real remote.
- In your host, `sbx-<name>` points at each copy. `sbx create lane-a` adds
  `sbx-lane-a` to your host's `.git/config`; `sbx delete lane-a` removes
  it. These remotes are local to your `.git` and are never pushed anywhere.

Commits made in a copy stay there until you push them or fetch them from
the host through these remotes.

Because both remotes are written into the host's `.git`, `sbx create` and
`sbx delete` only run from the host checkout. A copy carries the manifest
like any other clone, so running them from inside one would quietly clone
a copy of a copy; they refuse instead and print where the host is. Every
other command works from anywhere, including from inside a copy.

| Command | |
|---|---|
| `sbx create <name>` | New copy. Fetches `origin` and lands on its default branch |
| `sbx rebuild <name>` | Run every `prepare` hook |
| `sbx rebuild <name> --data` | Run every `prepare` hook, then every `populate` hook |
| `sbx rebuild <name> --hard` | Destroy services and volumes, then run every `prepare` and `populate` hook |
| `sbx open <name>` | Interactive subshell inside the copy: its directory as cwd, its env loaded |
| `sbx code <name>` | Open the copy in `$SBX_EDITOR` (default `code`). No env is injected |
| `sbx run <name> -- <cmd>` | Run a single command inside the copy. Its output and its exit code are yours |
| `sbx list` | Every copy of this project and whether its services are up |
| `sbx list --all` | Every copy of every project on this machine. Runs from any directory |
| `sbx info <name>` | Where it lives and which ports it got |
| `sbx up <name>` / `sbx down <name>` | Start or stop its services |
| `sbx delete <name>` | Remove it. Refuses while it holds unpushed or uncommitted work |
| `sbx doctor` | Check what would break a create |

`create` also accepts `--from <ref>` to pick a different starting point,
and `--branch <name>` to create a local branch at that point.

## Common workflows

Every copy is a normal git clone. sbx does not wrap `git`.

### Work in a lane from the terminal

```bash
sbx open lane-a
```

You are now in a shell whose working directory is the lane, with the
lane's ports, credentials and secrets in the environment. Everything runs
the way it does in the host: `pnpm dev`, `pnpm test`, `git status`, `git
switch -c feat/x`, all of it. `exit` closes the shell and returns you to
where you were.

### Work in a lane from an editor

```bash
sbx code lane-a
```

This opens the lane's directory in your editor. It does not inject any
environment. In each integrated terminal that needs the lane's ports or
credentials, run `sbx open lane-a` and work from there.

### Git in a lane

A lane is a normal git clone with a normal working tree. Git commands
work as they always do, against the project's usual remote:

```bash
sbx open lane-a
git fetch origin
git switch -c feat/x origin/main
# edit, commit
git push -u origin feat/x
```

### Rebuild a lane

`sbx rebuild` runs the hooks the manifest declares. Each hook belongs
to one of two phases:

- **`prepare`** brings the sandbox to the branch's declared state:
  install dependencies, apply migrations, build generated artifacts.
- **`populate`** wipes and rewrites the sandbox's runtime data: reset
  seeded rows, warm caches.

A common shape:

```json
"hooks": [
  { "name": "install", "phase": "prepare",  "run": "pnpm install" },
  { "name": "migrate", "phase": "prepare",  "run": "pnpm db:migrate" },
  { "name": "reset",   "phase": "populate", "run": "node sandbox/reset.mjs" },
  { "name": "seed",    "phase": "populate", "run": "node sandbox/seed.mjs" }
]
```

Three modes:

- `sbx rebuild lane-a` runs every `prepare` hook. Use it after
  switching to a branch that adds a dependency or a new migration.
- `sbx rebuild lane-a --data` runs every `prepare` hook, then every
  `populate` hook. Rewrites the sandbox's data.
- `sbx rebuild lane-a --hard` destroys the sandbox's services and their
  volumes, then runs every hook. Use it when a branch removes a
  migration and the schema has to go back with it, or when the state
  has drifted in a way `--data` cannot fix.

Do not run `sbx rebuild` while an agent is working in the lane. It
rewrites files the agent did not touch, and the agent will try to "fix"
what it finds.

### Fetch a branch from a lane into the host

Each lane is registered as a remote of your host repository under the name
`sbx-<name>`. From your host checkout:

```bash
git fetch sbx-lane-a feat/x
git switch feat/x
```

Once the branch is in your host, push it, merge it or cherry-pick from it
like any other branch.

### Pull work from the host into a lane

Inside a lane, the `host` remote points at your host checkout. Fetch and
merge like any other remote:

```bash
sbx open lane-a
git fetch host
git merge host/main
```

### Delete a lane

```bash
sbx delete lane-a
```

`delete` refuses while the lane holds commits no remote has, or files
that are not committed, and prints how to recover them. Push the branch,
or fetch it into the host with `git fetch sbx-lane-a <branch>`, before
removing the lane.

## What it is not

- **Not a security sandbox.**
- **Not an agent manager.** It does not launch or supervise agents.
- **Not a container platform.** See below.
- **Not able to isolate the outside world.** OAuth callbacks, webhooks and
  paid APIs are shared no matter what.

---

# How it works

## Your code stays on your machine

This is the main design decision. Your source, your dependencies, your dev
server and your agent all run natively. Only stateful services, such as
databases, run in containers.

Putting the whole project in a container would mean rebuilding an image on
every change, slower file watching, no direct access to your browser or
GPU, and an agent that has to live inside the container to be useful. That
is isolation you did not ask for. What you need is for two copies of the
project not to collide with each other, and that is a much smaller
problem.

The result is that a copy is cheap. Creating one takes seconds, not
minutes.

## What a copy is

Each copy has a **slot**, which is just a number: the lowest free one.
Your host checkout is slot 0.

From that number everything else follows:

- A **git clone** of your repository, placed next to your host checkout,
  with the same `origin` and a `host` remote pointing back at it. Cloning
  from a local path lets git hardlink the object database, so it costs
  almost nothing on disk.
- A **remote in your host** named `sbx-<name>` pointing at the copy, so
  fetching from it needs no path lookup.
- **Services** from your Compose file, run as a separate Compose project,
  so containers and volumes never overlap.
- **Ports** shifted by the slot, so nothing collides.
- **Config files** rendered from templates in your repository, with those
  ports and your credentials filled in.
- **Data**, from whatever your seed command does.

## Where the values come from

Everything a copy needs is one map, built from four sources:

| Source | Example |
|---|---|
| Fixed values in the manifest | `LOG_LEVEL=debug` |
| Your credentials, once, at `~/.sbx/<project>/secrets.env` | `STRIPE_TEST_KEY` |
| Secrets generated per copy and stored with it | `SESSION_SECRET` |
| The slot | `API_PORT`, `SBX_NAME` |

That same map renders your config files and is injected into every command
you run with `sbx run` or `sbx open`, so the two can never disagree. A
template that references a name the map does not contain stops the render
instead of writing an empty value.

## What a copy costs

Each copy has its own dependency tree, and the price depends entirely on
your package manager.

With pnpm, bun or uv it is nearly free. They keep one content-addressed
store and link files into place rather than copying. On a mid-size
monorepo that measured 12 seconds and no meaningful disk use for 1.9 GB
of `node_modules`.

With npm, pip or poetry it is a full copy every time, because their
caches hold archives rather than linkable files. If that is your case,
prefer a few long-lived lanes over one copy per task.

One trap either way: keep your copies on the same filesystem as your
repository and your package manager's cache. Hardlinks cannot cross
filesystems, so across one both the git objects and the dependencies are
copied instead of shared. In the same measurement, the install took three
times longer and cost real disk. `sbx doctor` warns about this.

## What it cannot isolate

Anything that lives outside your machine. OAuth callbacks are registered
for specific ports, webhooks point at one public URL, and paid APIs
charge you per call no matter which copy made it.

Decide what to do about those before letting agents run unattended.
Usually that means a local substitute, or a fake provider selected by an
environment variable.

## Agent Skills

Two [Agent Skills](https://agentskills.io) ship with this repository, and
work in Claude Code, Codex, Cursor, Copilot, Gemini CLI and others:

- **`sbx-setup`**: writing the manifest. Includes complete examples for
  Node, Python and Rust projects.
- **`sbx-sandboxes`**: using copies every day, and the rules an agent
  working inside one should follow.

They are separate so that creating a copy does not pull the whole setup
guide into an agent's context.

```bash
npx skills add francozanardi/sbx   # both
npx skills update                  # refresh them later
```

## License

MIT.
