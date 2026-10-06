# Neovim questions in Pi

The local `pi_bridge.lua` module and Pi's `extensions/neovim/index.ts` replace the
Herdr plugin. No Herdr process, CLI, or environment variables are required.

## Workflow

1. Restart Neovim and run `/reload` in Pi to load the new integration.
2. Run `/neovim` in the Pi session that should receive questions. Select the editor
   by its working directory and PID. This assigns the current Pi session, not a
   newly created agent. Assigning from another session replaces the old connection.
3. **Space aa** adds a question about the current line or visual selection (whole
   lines). Repeat to queue questions across buffers.
4. **Space al** lists queued questions; select one to keep or remove it.
5. **Space as** sends only questions, annotated lines, file paths, and line numbers,
   including unsaved changes in those lines. No surrounding lines or full buffers
   are included. Without a visual selection, only the current line is annotated.
   Only questions acknowledged by Pi are cleared.
6. Pi displays a Neovim card with the relative file path, line range, highlighted
   selected code, and question. Protocol instructions and JSON remain in model
   context but are hidden from the card. Selections longer than 12 lines are
   collapsed; Pi's expand action shows the rest. Read answers in Pi. Busy sessions
   receive questions as follow-up messages. Existing plain-text messages are not
   reformatted retroactively.

There is no **Space ar**, response reader, edit application, or save operation.
The prompt asks Pi to answer without modifying files. This is not a sandbox:
Pi still has its ordinary tools, and explicit instructions in its conversation
can ask it to edit files independently of this bridge.

Use `/neovim disconnect` to detach. Closing either process, reloading Pi, or
switching Pi sessions detaches the editor; run `/neovim` to reconnect. Questions
are kept in Neovim memory until acknowledged, removed, or Neovim exits. Extmarks
track their line ranges as you edit. Questions whose buffers/ranges were removed
must be removed from the queue before sending.

## Transport and privacy

Local Unix sockets live in `/tmp/pi-neovim-<uid>/`, a private directory owned by
the current user. Discovery ignores stale sockets. Each editor exposes only
assignment and delivery-acknowledgment messages: no arbitrary Lua, commands,
edits, or response content can be executed through this protocol.

Messages are newline-delimited JSON, limited to 4 MiB for selected-line submissions.
Selected lines are sent directly into the Pi conversation; no request/response files
are written. Selected code can include secrets and will become part of Pi's
session/model context. Review what you select.

An acknowledgment means Pi accepted the prompt, not that the model finished.
If acknowledgment is lost, questions remain available; check Pi before retrying
to avoid duplicates. This integration requires both processes on the same host.

## Tests

```sh
npm ci --ignore-scripts --prefix config/.pi/agent/extensions/neovim
node --test tests/neovim-pi.test.ts
```

Pi supplies the renderer's peer dependencies at runtime; the local install also
allows standalone tests to exercise rendering and narrow terminal widths.

Tests launch real headless Neovim processes and exercise the Pi extension with a
mock session API. They do not call a model or modify source files.
