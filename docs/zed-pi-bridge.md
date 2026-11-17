# Zed → project-aware Pi routing

## Setup

The dotfiles contain:

- `config/.local/bin/pi-zed`: Python 3 terminal helper.
- `config/.pi/agent/extensions/zed.ts`: Pi extension, no additional runtime dependencies.
- `config/.config/zed/tasks.json`: ask, review, and send tasks.
- `config/.config/zed/keymap.json`: mappings in editor Vim normal/visual mode.

Link the helper to `~/.local/bin/pi-zed` and make it executable. Link the extension to `~/.pi/agent/extensions/zed.ts`. These links are installed on this machine.

Reload **each already-open Pi session** with `/reload` to register it with the new router. Newly started sessions register automatically. Run `/zed` in the Pi pane that should receive prompts and select a live Zed window. This enables the window and binds all its sends exclusively to this Pi session, with an exact project-directory safety check, replacing any previous destination. Running `/zed` in another pane transfers that project's destination to that pane.

Routing is explicit and exclusive per Zed window. Run `/zed` in the receiving Pi pane and select that window. This replaces its destination across all projects: only that exact live registration may receive. Opening another Pi pane never changes the destination. Both sender and receiver check the binding.

The sender never scans for alternatives, chooses a sole matching session, or prompts for a destination. Missing, closed, reloaded, or mismatched destinations fail with the queue retained. Run `/zed` again in the intended pane. Old per-project automatic-router preferences are ignored.

The bound Pi directory must still match the canonical `ZED_WORKTREE_ROOT` exactly. Symlink aliases resolve to the same directory; subdirectories and other Git worktrees do not. Switching projects requires explicit rebinding. Herdr worktree transitions and Pi reloads create new registrations and also require `/zed` again.

Pi's footer shows `Zed routing: Zed window <id> · <title>` for enabled live windows, refreshing every five seconds as titles or windows change. Multiple enabled windows are listed together. The footer shows shared window authorization, not which pane is selected. Run `/zed` in the intended pane to set or replace the destination for its project. No enabled windows and unavailable window discovery have explicit status labels.

`/zed disconnect` asks which live window to disable globally. Pi shutdown/reload does **not** disable the window. Authorization lasts for that Zed window identity while its marker remains in `/tmp`; closing/reopening Zed or clearing temporary state requires `/zed` again. `/zed /project/path` is not supported.

Window discovery requires Linux and Niri. Identity includes the compositor socket, Zed PID/process start time, and Niri window ID. The sender checks its process ancestors against live Zed windows and selects the focused matching window (or sole matching window). Multiple matching windows with none focused fail rather than guessing. Invoke send from the intended focused Zed window; background automation is not supported.

## Workflow

1. Select code in Zed and press `Space aa`.
2. Type a question in the center terminal and press Enter; blank input cancels.
3. Repeat for additional questions.
4. `Space al` opens the queue. Enter a number to remove a question or Enter to finish.
5. Run `/zed` in the receiving Pi pane and select the Zed window. `Space as` sends the current project's batch to that session. If its registration has expired, run `/zed` again in the intended pane; there is no fallback. Responses appear there.

Switching projects/worktrees switches the queue, not the explicit destination; rebind with `/zed` before sending. Older queues remain with their projects. Tasks hide after successful completion; errors leave the terminal visible. Existing Alt+H/L/W shortcuts navigate or close its tab.

Selections capture text, including unsaved edits, when the task launches. Without a selection, the helper reads the saved file at the cursor row; save first or select text when asking about unsaved changes. The cursor row is only a location hint, not a claimed start/end range. Snapshots do not track later edits or renames. Commit-history and other virtual buffers can be used with text selected. When Zed supplies no file path, the helper captures the selection with an empty path and labels it `historical/virtual selection`; include the file path and commit SHA in your question when needed. With neither a path nor a selection it fails instead of reading a current file. Zed does not expose the historical file path or revision through the normal file task variables. Select within one file at a time. This behavior is covered by helper tests; end-to-end invocation in Zed still requires a user trial.

## Storage and delivery

Queues are per canonical project path, in `~/.local/state/pi-zed/<project-hash>/queue.json`. They contain selected code and questions and persist until sent or removed. Private directories and files restrict access to the current user. Queue operations use a file lock and atomic replacement.

Each live Pi registration listens on a unique private Unix socket at `/tmp/pi-zed-<uid>/session-<random-token>.sock`. The helper probes these sockets for current directory, session name/ID, PID, and registration token. Dead or unresponsive registrations are ignored, never reassigned or unlinked by the sender. Stale sockets after crashes can be removed after confirming the old process has exited.

Window authorization uses `window-<instance-hash>.enabled` markers in the same private directory. Explicit choices use `route-<instance-hash>.json`. They contain registration tokens, not code. Re-enabling a previously disabled window can reuse a still-live choice.

Before delivery the receiver checks the window authorization, registration token, canonical directory, and message shape. This rejects a destination that changes between discovery and delivery. Batches are limited to 4 MiB and acknowledged before clearing the queue. Failed sends retain the queue; ambiguous delivery is never automatically rerouted to another session. Retries of an identical project/batch are deduplicated within a registration. After reload/restart or choosing another destination, check the conversation before retrying uncertain delivery; deduplication is not durable across sessions. Existing project queues are preserved without migration.

Selected code is supplied to the model as context. Each question field is a user request: requests for code or file changes authorize those changes without a separate prompt; explanations and reviews are answered in Pi.

## Verification

Run `node tests/zed-pi-bridge.mjs`. Set `PI_JITI` to a jiti installation if Pi is installed elsewhere. Tests mock the Pi API and Niri listing but exercise real Unix sockets and the Python helper: exact project/worktree routing, no-match retention, exclusive explicit binding, rejection of replaced receivers, no-fallback behavior, session relocation/replacement, canonical paths, window isolation, selection capture, saved-line fallback, queue removal, delivery, repeated-batch suppression, validation, rendering, and shutdown.

End-to-end Zed task invocation and delivery into the user's Pi conversation still require `/reload`, `/zed`, and a user trial. `pi-zed instances` lists live windows for diagnostics.
