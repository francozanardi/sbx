# Failure messages and what they mean

Every sbx failure prints two lines: what went wrong, and what to do
about it. A message starting with `unexpected failure:` is a defect in
the tool rather than a problem with the project. Re-run with
`SBX_DEBUG=1` for the stack.

`sbx run` is the exception in the other direction: it is a transparent
wrapper, so a non-zero exit with nothing on stderr is the wrapped
command failing, not sbx.

## Manifest errors

The whole manifest is validated before any command runs, so these come
out of every command equally, including `sbx doctor`. Each names the
field by the path a reader would use to find it.

| Message | Cause and fix |
|---|---|
| `sandbox.config.json is not valid JSON` | JSON allows no comments and no trailing commas |
| `sandbox.config.json does not hold a JSON object` | The file parses but is a list, a string or `null` |
| `` `name` must be a non-empty string `` | It names the state directory and each sandbox's Compose project |
| `` `ports.base` is missing `` | Map at least one role to the port it uses today, as in `"base": { "api": 3000 }` |
| `` `ports.base.<role>` must be an integer between 1 and 65535 `` | Use the port the project actually binds today |
| `` `ports.base.a` and `ports.base.b` are both N `` | Two roles on one port collide inside every sandbox, this checkout included |
| `` `ports.base.a` (N) and `ports.base.b` (M) are D apart, an exact multiple of `ports.stride` `` | Every port shifts by slot × stride, so some slot lands on a port another role already holds — often slot 0, the host checkout. Move one base port, or pick a stride that does not divide D |
| `` `ports.stride` / `ports.maxSlots` must be an integer `` | Omit them to take the defaults, 10 and 9 |
| `` `ports.env.<role>` names a role `ports.base` does not declare `` | Only roles with a base port can be published |
| `` would be published as `X`, which is not a usable variable name `` | Environment variables start with a letter or underscore. A role named `db-main` yields `DB-MAIN_PORT`; rename it or publish it explicitly |
| `` would be published as `X`, and the `SBX_` prefix is reserved `` | sbx sets `SBX_PROJECT`, `SBX_NAME`, `SBX_SLOT`, `SBX_DIRECTORY` and `SBX_BRANCH` itself |
| `` `X` is declared by both … and … `` | One name across `variables`, `generate` and the port variables. One of the two would never reach a template |
| `` `env` must be an array `` | It is a list of `{ from, to }` pairs |
| `` `env[N].from` / `env[N].to` must be a non-empty string `` | Both are required on every entry |
| `` `env[N].to` … climbs out of the directory it is resolved against `` | A `..` segment would write outside the sandbox, where nothing cleans it up |
| `` `env[N].to` … already renders into `` | Two templates writing one file means only the last survives |
| `` `generate.X` must be an integer between 16 and 1024 `` | It is a byte count. Fewer than 16 is not enough entropy; 32 is a good default |
| `` `variables.X` must be a non-empty string `` | Environment variables are text. Quote numbers and booleans |
| `` `hooks` must be an array `` | The old object form (`"hooks": { "install": "..." }`) is gone. Use `{ name, phase, run }` entries |
| `` `hooks[N].name` … is already used `` | Every hook name must be unique |
| `` `hooks[N].phase` … is not a phase `` | Only `prepare` and `populate` exist |
| `No sandbox.config.json found in … or any parent` | Not inside a project that declares sandboxes. `sbx init` writes a starting manifest |

## Templates

| Message | Cause and fix |
|---|---|
| `Template refers to values that are not defined: X` | `X` appears in a template but in no source. Add it to `~/.sbx/<project>/secrets.env`, to `variables`, or to `generate`. An empty value is fine when the feature that reads it is off |
| `Env template … does not exist at …` | The template was not committed when the sandbox was created, so its clone does not have it. Commit it, then rebuild or recreate. `sbx doctor` catches this before a create does |
| `This sandbox has no compose file at …` | Same cause, for the services file |

## Command line

| Message | Cause and fix |
|---|---|
| `Unknown command "x"` | The known commands are listed with it |
| `` `sbx x` does not take a `--y` flag `` | Flags are not ignored when unrecognised, because a typo would otherwise change what the command does. The accepted ones are listed |
| `` `--branch` needs a value `` | Write it as `--branch=<name>` or `--branch <name>` |
| `Missing a sandbox name` | Most commands take one as their first argument |
| `Missing the command to run` | `sbx run` needs it after `--`, as in `sbx run sb-1 -- npm test` |

## Create, rebuild, delete

| Message | Cause and fix |
|---|---|
| `A sandbox named "x" already exists` | Reuse it, or `sbx delete x` first |
| `"x" was left half-created` | A step after the clone failed. `sbx delete x --force` and retry — force, because a hook that wrote anything leaves files a plain delete refuses. The warning only appears for entries the failing run created, never for a healthy sandbox |
| `This directory is sandbox "x", not the project's host checkout` | `create` and `delete` write remotes into the host's `.git`. Run them from the host, whose path is printed with the message |
| `Sandbox "x" is registered, but its clone is gone from …` | The directory was removed outside sbx. `sbx delete x --force` drops the stale entry; `sbx create x` builds it again |
| `Cannot give "x" slot N: ports … are already in use` | Something on the machine holds them. Usually a dev server left running, or another sandbox whose services are up. `sbx down` the sandbox holding them, or free the port |
| `Slot N would share ports … with sandbox "y"` | Two live sandboxes would collide. The manifest check above normally catches this first |
| `No free slot left: all N are in use` | Delete a sandbox, or raise `ports.maxSlots` |
| `no branch to start from` | The repository has no commits yet. A sandbox is cloned at a commit |
| `"<ref>" does not name a commit in this sandbox` | `--from=<ref>` names a revision that neither the host nor the fetched `origin` has |
| `"x" holds work that exists nowhere else` | `sbx delete` refuses to destroy unpushed commits or uncommitted files. Push them, fetch them into the host with `git fetch sbx-<name> <branch>`, or pass `--force` |
| `Could not check "x" for work that exists nowhere else` | git failed, so the question is unanswered rather than answered "nothing". sbx will not delete on a guess. Repair the repository, or pass `--force` to skip the check |

## Hooks and services

| Message | Cause and fix |
|---|---|
| `` The `<hook-name>` hook failed: … `` | The hook exited non-zero. Its own output is printed above the message. `<hook-name>` is whatever the manifest called it, not a fixed set |
| `` `X` is not installed, or not on PATH `` | An external program is missing: `git`, `docker`, or whatever a hook invoked |
| `The working directory … does not exist` | The command's directory is gone. Distinguished from a missing program on purpose: both arrive as an identical ENOENT |
| `Docker is not installed, or not on PATH` | The manifest declares `compose`. Install Docker, or drop the declaration |
| `Docker is installed but its daemon is not answering` | Start it. `sbx doctor` reports this before a create spends time on it |
| `The services did not start` | Compose printed the detail above. Usually a wrong healthcheck, or none where the service is slower than `--wait` assumes |

## State and registry

| Message | Cause and fix |
|---|---|
| `The sandbox registry … is not valid JSON` | `~/.sbx/<project>/state.json` was hand-edited. Fix or delete it. The sandboxes and containers survive; their names do not |

## Warnings

These do not stop the command.

| Message | Meaning |
|---|---|
| `<name> changes ports: role N → M` | The manifest no longer yields the ports this sandbox was built on, and the rebuild just moved it. Its services are still up on the old ones (`sbx down` then `sbx up`), and any externally registered URL — an OAuth redirect, a webhook — has to be updated by hand |

## Diagnosing before it breaks

`sbx doctor` runs every check that does not need a sandbox to exist, and
no single failure ends the run — it reports all of them in one pass and
exits non-zero if any failed, so it works in a script.

It covers: the manifest parses and validates in full; this is the host
checkout rather than a sandbox; the repository has a commit to clone
from; the next slot's ports are free; no existing sandbox has drifted off
the ports it was built on; the secrets file parses; every template exists
**and is committed**, and renders with the variables a sandbox would see;
every rendered destination is ignored by git rather than committed; the
compose file exists, is committed, and resolves its variables; Docker
answers; and the sandbox root shares a filesystem with the repository and
the home directory.
