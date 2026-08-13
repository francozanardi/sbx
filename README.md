# sbx

Run several copies of your project on one machine at the same time. Each copy
gets its own database, its own services, its own config and its own data.

Made for running coding agents in parallel. Two agents, two copies, nothing
shared.

## ⚠️ About this code

**This code was written almost entirely by a generative AI model, and it has
had very little human review.** It works on the author's machine and its
behaviour has been exercised by hand, but nobody has read it line by line
and there is no automated test suite beyond one end-to-end smoke test in CI.

Worth knowing what it touches: it creates and removes git clones, starts
and destroys Docker containers and volumes, and writes files under your
home directory. All of that is scoped to the sandboxes it manages.

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
sbx run lane-a -- pnpm dev   # or whatever your dev command is
```

## Concepts

A few terms used across the docs and the commands.

- **Host.** Your normal checkout of the repository, the one you work in
  every day. sbx does not touch it.
- **Copy.** An independent clone of your repository, placed next to the
  host, with its own ports, services, config and data. The CLI and skills
  call these `sandboxes`; the words mean the same thing.
- **Lane.** A copy used as a long-lived workspace, reused across tasks
  instead of created and thrown away. This is the intended way to use sbx.
- **Slot.** A number that identifies a copy. The host is slot 0. Every
  port a copy uses is shifted by its slot, so nothing collides.
- **Manifest.** The `sandbox.config.json` file at your repository root.
  Every copy reads from it.

Inside a copy there are two git remotes: `origin` is the project's real
remote, and `host` points at your host checkout. Commits made in a copy
stay there until you push them or fetch them from the host.

| Command | |
|---|---|
| `sbx create <name>` | New copy. Fetches `origin` and lands on its default branch |
| `sbx sync <name>` | Update an existing copy: config, services, dependencies, migrations |
| `sbx run <name> -- <cmd>` | Run a command inside it |
| `sbx list` | Every copy and whether its services are up |
| `sbx info <name>` | Where it lives and which ports it got |
| `sbx up <name>` / `sbx down <name>` | Start or stop its services |
| `sbx seed <name> --reset` | Wipe its data and seed it again |
| `sbx open <name>` | Open it in your editor |
| `sbx env <name>` | Its variables as shell exports |
| `sbx delete <name>` | Remove it. Refuses while it holds unpushed or uncommitted work |
| `sbx doctor` | Check what would break a create |

`create` accepts `--from <ref>` to pick a different start point, and
`--branch <name>` to create a local branch at that point.

## Common workflows

Every copy is a normal git clone. sbx does not wrap `git`.

### Create a lane and work in it

```bash
sbx create lane-a
sbx open lane-a
```

`sbx create` fetches `origin` and lands on the remote's default branch, so
the lane starts from current `main`. When a task begins, switch to a task
branch the same way you would in the host:

```bash
sbx run lane-a -- git switch -c feat/x origin/main
sbx run lane-a -- pnpm dev
```

`sbx run` runs its argument in the lane's directory with the lane's
environment. Any command that reads ports or credentials has to go through
it. Everything else (plain `git`, an editor, a shell) can run against the
lane's directory directly.

### Start a new task in the same lane

Rebuild the workspace so nothing from the previous task carries over:

```bash
sbx run lane-a -- git fetch origin
sbx run lane-a -- git switch -c feat/y origin/main
sbx sync lane-a              # installs new dependencies, runs new migrations
sbx seed lane-a --reset      # if the task needs clean data
```

Ports and secrets stay stable across every task in the lane. That matters
when a port has to be registered somewhere external, like an OAuth
redirect URI allowlist.

Do not run `sbx sync` while an agent is working in the lane. It rewrites
files the agent did not touch, and the agent will try to "fix" what it
finds.

### Fetch a branch from a lane into the host

A lane is a git repository on disk. From the host checkout, fetch by path:

```bash
# The path of the lane is the "directory" field of `sbx info lane-a`.
git fetch <lane-directory> feat/x
git switch feat/x
```

Once the branch is in the host, push it, merge it or cherry-pick from it
like any other branch.

### Delete a lane

```bash
sbx delete lane-a
```

`delete` refuses while the lane holds commits no remote has, or files that
are not committed, and prints how to recover them. Push the branch, or
fetch it into the host, before removing the lane.

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
you run with `sbx run`, so the two can never disagree. A template that
references a name the map does not contain stops the render instead of
writing an empty value.

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
