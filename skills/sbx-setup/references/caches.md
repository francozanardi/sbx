# Dependencies, caches, and the cost of a sandbox

Every sandbox gets its own dependency tree. Whether that is expensive depends
on the package manager and on the filesystem, not on sbx, which only runs the
`install` hook.

The repository itself is not the expensive part. A sandbox is a `git clone`
from a local path, which lets git hardlink the object database instead of
copying it: on a repository with a 230 MB `.git`, the clone added about 1 MB.
Git objects are immutable, so the sharing is safe. Repacking writes new files
and leaves the other clone's names pointing at the old ones.

## A measurement

One machine (Linux, btrfs, warm caches), one mid-size pnpm monorepo. The
seconds are illustrative; the **mechanism** is what transfers.

| Step | Time | Disk |
|---|---|---|
| `git clone` from the local path | 0.2 s | 58 MB, the source tree; objects hardlinked |
| `pnpm install` | 11.8 s | ~0 |
| `docker compose up --wait` | 4.0 s | empty volumes |
| **Total** | **~20 s** | **~58 MB** |

Zero disk for 1.9 GB of `node_modules`, because pnpm stores each file once and
**reflinks** it into the sandbox as a copy-on-write clone. Every extent in the
installed files comes back flagged `shared` from the filesystem.

## Three tiers, and which one you land in matters

| Filesystem | Mechanism | Consequence |
|---|---|---|
| btrfs, XFS, APFS | reflink (copy-on-write) | ~0 disk, and editing a file inside `node_modules` splits the extent instead of corrupting the shared store |
| ext4 | hardlink | ~0 disk, but editing a file in place **does** reach the store and every other project using it |
| sandboxes on a different filesystem than the cache | full copy | In the same measurement: 37 s and 1.3 GB, three times slower, and real disk per sandbox |

The third row is the trap. Keep sandboxes on the same filesystem as the
repository and as the package manager's cache. `sbx doctor` warns when the
sandbox root sits on a different device than either.

## By package manager

| Manager | Per-sandbox cost |
|---|---|
| pnpm, bun, uv | Near zero. Content-addressed store, linked into place |
| Yarn Berry (PnP) | Near zero. No `node_modules` at all |
| npm, pip, poetry | **Full copy.** Their caches hold archives, not linkable files |
| Go, Gradle, Maven, Cargo registry | Near zero. The module cache is global |
| Cargo `target/` | Large and per-directory. Use `sccache` rather than sharing one target dir, which serializes builds on a lock |

If the project's manager is in the full-copy row, prefer a few long-lived
sandboxes over one per task. Measure it in the repository before deciding.
The difference between 12 seconds and two minutes changes which way of
working makes sense.

## Concurrency

Two `pnpm install` runs against the same store, started together, finished in
14.5 s each versus 11.8 s alone. Mild contention, no corruption. Creating two
sandboxes at the same time is safe.
