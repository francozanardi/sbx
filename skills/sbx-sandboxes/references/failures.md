# Failure messages and what they mean

Every sbx failure prints two lines: what went wrong, and what to do about it.
A message starting with `unexpected failure:` is a defect in the tool rather
than a problem with the project — re-run with `SBX_DEBUG=1` for the stack.

| Message | Cause and fix |
|---|---|
| `Template refers to values that are not defined: X` | `X` appears in a template but in no source. Add it to `~/.sbx/<project>/secrets.env`, to `variables`, or to `generate` in the manifest. An empty value is fine when the feature that reads it is off |
| `Env template … does not exist at …` | The template was not committed when the sandbox was created, so its worktree does not have it. Commit it and create the sandbox again |
| `This sandbox has no compose file at …` | Same cause, for the services file |
| `Cannot give "x" slot N: ports … are already in use` | Something on the machine holds them. Usually a dev server left running, or another sandbox whose services are up. `sbx down` the sandbox holding them, or free the port |
| `Slot N would share ports … with sandbox "y"` | `ports.stride` is smaller than the widest gap between two base ports. Raise it |
| `Branch "x" already exists` | `sbx delete` keeps branches on purpose. Pass `--branch=<other>`, or `git branch -D x` |
| `no branch to start from` | The repository has no commits yet. A worktree branches off a commit |
| `A sandbox named "x" already exists` | Reuse it, or `sbx delete x` first |
| `"x" was left half-created` | A step after the worktree failed. `sbx delete x` and retry. The warning only appears for entries that run created, never for a healthy sandbox |
| `The \`install\` hook failed: …` | The hook's command exited non-zero. Its own output is printed above the message |
| `\`X\` is not installed, or not on PATH` | An external program is missing — `git`, `docker`, or whatever a hook invoked |
| `Docker is not installed, or not on PATH` | The manifest declares `compose`. Install Docker, or drop the declaration |
| `Docker is installed but its daemon is not answering` | Start it. `sbx doctor` reports this before a create spends time on it |
| `The services did not start` | Compose printed the detail above. Usually a wrong healthcheck, or none where the service is slower than `--wait` assumes |
| `No free slot left: all N are in use` | Delete a sandbox, or raise `ports.maxSlots` |
| `The sandbox registry … is not valid JSON` | `~/.sbx/<project>/state.json` was hand-edited. Fix or delete it. The worktrees and containers survive; their names do not |
| `sandbox.config.mjs: … could not be loaded` | The manifest is a JavaScript module that either fails to parse or throws while running. Check it with `node <path>` |
| `No sandbox.config.mjs found in … or any parent` | Not inside a project that declares sandboxes. `sbx init` writes a starting manifest |

## Diagnosing before it breaks

`sbx doctor` runs every check that does not need a sandbox to exist: the
repository has a commit to branch from, the next slot's ports are free, the
templates render, the compose file resolves its variables, Docker answers, the
secrets file parses, and the worktree root shares a filesystem with the home
directory. It exits non-zero when any of them fails, so it works in a script.
