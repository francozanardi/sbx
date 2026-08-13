# sbx

Run several copies of your project on one machine at the same time. Each copy
gets its own database, its own services, its own config and its own data.

Made for running coding agents in parallel. Two agents, two copies, nothing
shared.

## ⚠️ About this code

**This code was written almost entirely by a generative AI model, and it has
had very little human review.** Its behaviour has been exercised by hand and it
works on the author's machine, but nobody has read it line by line and there is
no automated test suite beyond one end-to-end smoke test in CI.

Worth knowing what it touches: it creates and removes git worktrees, starts and
destroys Docker containers and volumes, and writes files under your home
directory. All of that is scoped to the sandboxes it manages.

## Install

```bash
npm install -g @francozanardi/sbx
```

Needs Node 22 or later, `git`, and `docker` if your project uses services.
Tested on Linux. macOS should work but is unverified. No Windows.

## Set it up

sbx needs one file at your repository root, `sandbox.config.mjs`, declaring
what your project needs: which services to start, which config files to write,
and the commands to install, migrate and seed it.

The fastest way is to let an agent write it:

```bash
npx skills add francozanardi/sbx
```

Then tell your agent: **"set up sbx on this project"**. The skill covers the
format, the defaults and the mistakes that are easy to make.

To do it by hand, `sbx init` writes a starting file and `sbx doctor` tells you
what is still missing.

**One requirement on your code**: the ports it uses must be configurable
through environment variables, not hardcoded.

## Use it

```bash
sbx create sb-1            # about 20 seconds
sbx run sb-1 -- pnpm dev   # or whatever your dev command is
```

| Command | |
|---|---|
| `sbx create <name>` | New copy: worktree, services, config, dependencies, seeded data |
| `sbx sync <name>` | Bring an existing copy up to date: config, services, dependencies, migrations |
| `sbx run <name> -- <cmd>` | Run a command inside it |
| `sbx list` | Every copy and whether its services are up |
| `sbx info <name>` | Where it lives and which ports it got |
| `sbx up` / `sbx down <name>` | Start or stop its services |
| `sbx seed <name> --reset` | Wipe its data and seed it again |
| `sbx open <name>` | Open it in your editor |
| `sbx delete <name>` | Remove it. Keeps the branch |
| `sbx doctor` | Check what would break a create |

Point one agent at each copy and let them work.

## What it is not

- **Not a security sandbox.**
- **Not an agent manager.** It does not launch or supervise agents.
- **Not a container platform.** See below.
- **Not able to isolate the outside world.** OAuth callbacks, webhooks and paid
  APIs are shared no matter what.

---

# How it works

## Your code stays on your machine

This is the main design decision. Your source, your dependencies, your dev
server and your agent all run natively. Only stateful services, such as
databases, run in containers.

Putting the whole project in a container would mean rebuilding an image on
every change, slower file watching, no direct access to your browser or GPU,
and an agent that has to live inside the container to be useful. That buys
isolation you were not asking for. What you actually need is for two copies of
the project not to collide with each other, and that is a much smaller problem.

The result is that a copy is cheap. Creating one takes seconds, not minutes.

## What a copy is

Each one has a **slot**, which is just a number: the lowest free one. Your
normal checkout is slot 0.

From that number everything else follows:

- A **git worktree** on its own branch, sitting next to your checkout.
- **Services** from your Compose file, run as a separate Compose project, so
  containers and volumes never overlap.
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

That same map renders your config files and is injected into every command you
run with `sbx run`, so the two can never disagree. A template referring to
something that does not exist stops the render instead of writing an empty
value.

## What a copy costs

Each copy has its own dependency tree, and the price depends entirely on your
package manager.

With pnpm, bun or uv it is nearly free. They keep one content-addressed store
and link files into place rather than copying. On a mid-size monorepo that
measured 12 seconds and no meaningful disk use for 1.9 GB of `node_modules`.

With npm, pip or poetry it is a full copy every time, because their caches hold
archives rather than linkable files. If that is your case, prefer a few
long-lived copies over one per task.

One trap either way: keep your copies on the same filesystem as your package
manager's cache. Across filesystems, linking is impossible and the same install
took three times longer and cost real disk. `sbx doctor` warns about this.

## What it cannot isolate

Anything that lives outside your machine. OAuth callbacks are registered for
specific ports, webhooks point at one public URL, and paid APIs charge you per
call no matter which copy made it.

Decide what to do about those before letting agents run unattended. Usually
that means a local substitute, or a fake provider selected by an environment
variable.

## Agent Skills

Two [Agent Skills](https://agentskills.io) ship with this repository, and work
in Claude Code, Codex, Cursor, Copilot, Gemini CLI and others:

- **`sbx-setup`** — writing the manifest. Includes complete examples for Node,
  Python and Rust projects.
- **`sbx-sandboxes`** — using copies day to day, and the rules an agent working
  inside one should follow.

They are separate so that creating a copy does not pull the whole setup guide
into an agent's context.

```bash
npx skills add francozanardi/sbx   # both
npx skills update                  # refresh them later
```

## License

MIT.
