# Niri screenshots → ScreenshotTool

| Shortcut | Action |
| --- | --- |
| Print, Super+Shift+S, Super+Shift+A | Niri region selection; no editor |
| Ctrl+Print | Capture focused screen; no editor |
| Alt+Print | Capture focused window; no editor |
| Super+Shift+D | Open the newest complete PNG in `~/Pictures/Screenshots` |

Niri handles capture and clipboard delivery without opening ScreenshotTool.
Only Super+Shift+D opens ScreenshotTool to edit the latest saved image.
Original captures stay in `~/Pictures/Screenshots`. Edits are stored in the app's
history; use its Save/Save as/Copy actions to export them. These bindings replace
Satty. They don't use grim, slurp, or synthetic keyboard input.

## Setup

The helper is `config/.local/bin/niri-screenshot-tool`. Stow the `config` package
as usual so `~/.local/bin/niri-screenshot-tool` exists, and ensure `~/.local/bin`
is in Niri's session PATH. Niri reloads its symlinked configuration automatically.

The local ScreenshotTool checkout at `~/Documents/GitHub/ScreenshotTool` has
additional CLI support required by this integration: `--open IMAGE`, `--paste`,
and `--editor`, including forwarding requests to a running instance. Stock
upstream builds without these local changes are not sufficient.

Build that checkout:

```sh
cd ~/Documents/GitHub/ScreenshotTool/src-tauri
cargo build --release --locked
```

Restart any older running copy after rebuilding. The helper defaults to the
release binary in that checkout. Set `SCREENSHOT_TOOL_BIN` in the compositor's
environment to override the executable path.

Use WebKitGTK 2.54.2 or a version containing the fix for
[WebKit bug 324466](https://bugs.webkit.org/show_bug.cgi?id=324466). The installed
2.54.1 has a native clipboard crash that can also be triggered by right-clicking.
On Arch, use a full `sudo pacman -Syu` upgrade rather than a partial library update,
then restart ScreenshotTool.

## Other commands

```sh
niri-screenshot-tool editor
niri-screenshot-tool clipboard
niri-screenshot-tool last
```

Each capture uses a unique output filename. The helper waits for a complete PNG
before opening the editor. Cancelling the region selector opens nothing; the
waiting helper exits silently after 120 seconds. Set
`SCREENSHOT_TOOL_CAPTURE_TIMEOUT` to change that deadline in seconds. Missing
binaries and capture errors produce a desktop notification when `notify-send`
is available. App output is appended to
`${XDG_STATE_HOME:-~/.local/state}/screenshot-tool/launcher.log`.

## Checks

```sh
python -B tests/niri-screenshot-tool.py
niri validate -c config/.config/niri/config.kdl
```
