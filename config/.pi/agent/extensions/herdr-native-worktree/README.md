# Native Herdr worktree extension

Global Pi tools for moving a live session through Herdr's native worktree workspaces.

## Tools

- `herdr_start_worktree`: creates a worktree with `herdr worktree create` (or opens an existing branch checkout), forks the current Pi session into its root pane, and records the originating parent tab and pane. After handoff it closes the vacated pane or tab when siblings remain; a workspace's sole pane and tab stay open.
- `herdr_finish_worktree`: requires clean feature and parent checkouts, merges the committed feature branch into the parent's current branch, returns Pi to the recorded pane (or a new tab when that pane was closed), then removes the linked checkout and optionally its branch.

The extension deliberately has no Worktrunk dependency. Herdr owns checkout placement and workspace grouping.

## Safety

- Existing open worktree workspaces are not overwritten.
- Finish refuses dirty or detached checkouts.
- Finish refuses to switch the parent checkout implicitly.
- Merge conflicts leave both workspaces in place for recovery.
- Parent-tab cleanup runs only after the superseded Pi process exits.
- Finish starts linked-checkout removal while its Herdr workspace ID is still valid, with direct `git worktree remove` as a fallback.

## Install

This directory is managed by the dotfiles repo. GNU Stow links it under `~/.pi/agent/extensions/` when `install.sh` runs.

Remove `npm:@yassimba/pi-herdr-worktree` from Pi's package settings so only this extension registers `herdr_start_worktree`.

## Test

```bash
node --experimental-strip-types --test helpers.test.ts
```
