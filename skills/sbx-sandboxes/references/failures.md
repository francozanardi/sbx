# Failure messages and what they mean

Every sbx failure prints two lines: what went wrong, and what to do
about it. A message starting with `unexpected failure:` is a defect in
the tool rather than a problem with the project. Re-run with
`SBX_DEBUG=1` for the stack.

## Manifest and template errors

| Message | Cause and fix |
|---|---|
| `sandbox.config.json is not valid JSON` | The manifest failed to parse. JSON allows no comments and no trailing commas |
| `sandbox.config.json: \`name\` is missing` | Add a non-empty `name` string |
| `sandbox.config.json: \`ports\` is missing` | Declare at least `ports.base` with one role |
| `sandbox.config.json: \`ports.base\` is empty` | Map at least one role to its port, as in `"base": { "api": 3000 }` |
| `sandbox.config.json: \`ports.base.<role>\` is not a port number` | Must be an integer 1..65535 |
| `sandbox.config.json: \`hooks\` must be an array` | The manifest uses the old object form (`"hooks": { "install": "..." }`). Convert to an array of `{ name, phase, run }` |
| `sandbox.config.json: \`hooks[N]\`.name is missing` | Each hook needs a non-empty string name for logs and error messages |
| `sandbox.config.json: \`hooks[N]\`.name "X" is already used` | Every hook name in the array must be unique |
| `sandbox.config.json: \`hooks[N]\`.phase must be "prepare" or "populate"` | Only those two phases exist. `prepare` runs on every rebuild; `populate` also runs with `--data` and `--hard` |
| `sandbox.config.json: \`hooks[N]\`.run is missing` | Each hook needs a non-empty shell command line |
| `No sandbox.config.json found in … or any parent` | Not inside a project that declares sandboxes. `sbx init` writes a starting manifest |
| `Template refers to values that are not defined: X` | `X` appears in a template but in no source. Add it to `~/.sbx/<project>/secrets.env`, to `variables`, or to `generate` in the manifest. An empty value is fine when the feature that reads it is off |
| `Env template … does not exist at …` | The template was not committed when the sandbox was created, so its clone does not have it. Commit it and create the sandbox again |
| `This sandbox has no compose file at …` | Same cause, for the services file |

## Create, sync, delete

| Message | Cause and fix |
|---|---|
| `A sandbox named "x" already exists` | Reuse it, or `sbx delete x` first |
| `"x" was left half-created` | A step after the clone failed. `sbx delete x --force` and retry. The warning only appears for entries the failing run created, never for a healthy sandbox |
| `Cannot give "x" slot N: ports … are already in use` | Something on the machine holds them. Usually a dev server left running, or another sandbox whose services are up. `sbx down` the sandbox holding them, or free the port |
| `Slot N would share ports … with sandbox "y"` | `ports.stride` is smaller than the widest gap between two base ports. Raise it |
| `No free slot left: all N are in use` | Delete a sandbox, or raise `ports.maxSlots` |
| `no branch to start from` | The repository has no commits yet. A sandbox is cloned at a commit |
| `"<ref>" does not name a commit in this sandbox` | `--from=<ref>` names a revision that neither the host nor the fetched `origin` has |
| `"x" holds work that exists nowhere else` | `sbx delete` refuses to destroy unpushed commits or uncommitted files. Push them, fetch them into the host with `git fetch sbx-<name> <branch>`, or pass `--force` |

## Hooks and services

| Message | Cause and fix |
|---|---|
| `` The `<hook-name>` hook failed: … `` | The hook exited non-zero. Its own output is printed above the message. `<hook-name>` is whatever the manifest called it, not a fixed set |
| `` `X` is not installed, or not on PATH `` | An external program is missing: `git`, `docker`, or whatever a hook invoked |
| `Docker is not installed, or not on PATH` | The manifest declares `compose`. Install Docker, or drop the declaration |
| `Docker is installed but its daemon is not answering` | Start it. `sbx doctor` reports this before a create spends time on it |
| `The services did not start` | Compose printed the detail above. Usually a wrong healthcheck, or none where the service is slower than `--wait` assumes |

## State and registry

| Message | Cause and fix |
|---|---|
| `The sandbox registry … is not valid JSON` | `~/.sbx/<project>/state.json` was hand-edited. Fix or delete it. The sandboxes and containers survive; their names do not |

## Diagnosing before it breaks

`sbx doctor` runs every check that does not need a sandbox to exist:
the manifest parses and validates (including the hooks array), the
repository has a commit to clone from, the next slot's ports are free,
the templates render, the compose file resolves its variables, Docker
answers, the secrets file parses, and the sandbox root shares a
filesystem with the repository and the home directory. It exits
non-zero when any of them fails, so it works in a script.
