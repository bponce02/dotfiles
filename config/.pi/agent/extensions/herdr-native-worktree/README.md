# Native Herdr worktree extension

Global Pi tools for moving a live session through Herdr's native worktree workspaces.

## Tools

- `herdr_start_worktree`: resolves the main checkout, ensures its native parent workspace exists, and creates or opens a separate worktree workspace under that parent. The current Pi session continues in the worktree. Before leaving the parent's sole pane, the extension creates a shell tab so the top-level group survives the old process exiting. Vacated source panes/tabs are closed only when siblings remain.
- `herdr_finish_worktree`: requires clean feature and parent checkouts, merges the committed feature branch into the main checkout's current branch, and resumes Pi in a fresh tab in its top-level workspace. If that workspace was closed, it is reopened first. The linked checkout and optionally its branch are then removed.

The extension deliberately has no Worktrunk dependency. Herdr owns checkout placement and workspace grouping. Parent identity comes from Git's first worktree record, never a workspace label or the launch directory. Running from a worktree container is supported only when its immediate Git checkout children identify exactly one repository; ambiguous containers fail rather than guessing. Linked-checkout starts use the main workspace for grouping but retain the source HEAD as the default base.

A same-named workspace pointing at a non-Git container is not a native repository parent. Herdr cannot rebind it through the workspace API; the extension opens/reuses the actual repository parent and leaves unrelated or incorrectly rooted workspaces alone.

## Safety

- Existing open worktree workspaces are not overwritten.
- Finish refuses dirty or detached checkouts.
- Finish refuses to switch the parent checkout implicitly.
- Merge conflicts leave both workspaces in place for recovery.
- Parent membership is verified before handoff or merge; the parent workspace is never scheduled for closure.
- Return targets are resolved from the main checkout, not stale inherited tab/pane IDs. Existing parent panes are never overwritten.
- Parent-tab cleanup runs only after the superseded Pi process exits.
- Finish starts linked-checkout removal while its Herdr workspace ID is still valid, with direct `git worktree remove` as a fallback.

## Install

This directory is managed by the dotfiles repo. GNU Stow links it under `~/.pi/agent/extensions/` when `install.sh` runs.

Remove `npm:@yassimba/pi-herdr-worktree` from Pi's package settings so only this extension registers `herdr_start_worktree`.

## Test

```bash
node --experimental-strip-types --test helpers.test.ts workspaces.test.ts
```
