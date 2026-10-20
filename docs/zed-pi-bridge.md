# Zed → existing Pi session

## Setup

The dotfiles contain:

- `config/.local/bin/pi-zed`: Python 3 terminal helper.
- `config/.pi/agent/extensions/zed.ts`: Pi extension, no additional runtime dependencies.
- `config/.config/zed/tasks.json`: ask, review, and send tasks.
- `config/.config/zed/keymap.json`: mappings in editor Vim normal/visual mode.

Link the helper to `~/.local/bin/pi-zed` and make it executable. Link the extension to `~/.pi/agent/extensions/zed.ts`. These links are installed on this machine.

Reload Pi with `/reload`, then run `/zed` and select a live Zed window. No prior bridge task is needed. The picker shows Niri window IDs and current titles, not saved project paths. Switching projects in that window keeps the connection; Pi's working directory is unchanged. `/zed /project/path` is no longer supported. A second Pi session cannot silently take over a window. `/zed disconnect` detaches it; Pi shutdown/reload also disconnects it.

Window discovery currently requires Linux and Niri. Identity includes the compositor socket, Zed PID/process start time, and Niri window ID, so titles and project paths can change without changing the connection. Closing/reopening a window requires selecting the new window. The sending task checks its process ancestors against live Zed windows and selects the focused matching window (or the sole matching window). If multiple windows match and none is focused, sending fails rather than guessing. Invoke send from the intended focused Zed window; background automation is not supported.

## Workflow

1. Select code in Zed and press `Space aa`.
2. Type a question in the center terminal and press Enter; blank input cancels.
3. Repeat for additional questions.
4. `Space al` opens the queue. Enter a number to remove a question or Enter to finish.
5. `Space as` sends the current project's batch through the window connection. Responses appear in the connected Pi session. After switching projects, the same connection sends that project's queue; older queues remain with their projects.

Tasks hide after successful completion. Errors leave the terminal visible. Existing Alt+H/L/W shortcuts navigate or close its tab.

Selections capture text, including unsaved edits, when the task launches. Without a selection, the helper reads the saved file at the cursor row; save first or select text when asking about unsaved changes. The cursor row is only a location hint, not a claimed start/end range. Snapshots do not track later edits or renames. Use a real file buffer rather than a virtual diff buffer for initial testing.

## Storage and delivery

Queues are per canonical project path, in `~/.local/state/pi-zed/<project-hash>/queue.json`. They contain selected code and questions; they persist locally until sent or removed. Private directories and files restrict access to the current user. Queue operations use a file lock and atomic replacement.

The extension listens on a private Unix socket at `/tmp/pi-zed-<uid>/window-<instance-hash>.sock`. It validates the window identity, absolute project path, and message shape, limits batches to 4 MiB, and acknowledges accepted messages. The project path travels with each batch instead of determining its destination. Failed sends retain the queue. Retries of an identical project/batch are deduplicated while the connection remains assigned. After Pi reload/restart, check the conversation before retrying an uncertain delivery; deduplication is not durable across sessions. Existing project queues are preserved without migration.

If Pi crashes rather than shuts down, a stale socket may remain. An address-in-use error does not automatically delete it, to avoid stealing a live connection. Confirm the old Pi session has exited before removing that window's stale socket.

Selected code is supplied to the model as context. The message requests answers in Pi, not automatic file edits.

## Verification

Run `node tests/zed-pi-bridge.mjs`. Set `PI_JITI` to a jiti installation if Pi is installed elsewhere. The test mocks the Pi API and Niri window listing but exercises the real Unix socket and Python helper: live-window selection, project switching without reconnecting, separate-window isolation, ambiguous-window rejection, selection capture, saved-line fallback, queue removal, delivery, repeated-batch suppression, window/payload validation, shutdown, and failed-send retention.

End-to-end Zed task invocation and delivery into the user's Pi conversation require `/reload`, `/zed`, and a user trial. `pi-zed instances` lists the live discovery result for diagnostics.
