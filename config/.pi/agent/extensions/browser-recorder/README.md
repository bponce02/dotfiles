# Pi Browser Recorder

The `record_browser_flow` tool automates Chromium with Playwright and records its real window with FFmpeg. Native dropdowns and the OS pointer are captured, not recreated.

## Window capture

Headed Chromium runs on an isolated Xvfb desktop. The recorder captures only that desktop, never your personal windows, with the native arrow cursor by default.
Requires Linux, Xvfb, Python 3, libX11, and FFmpeg with x11grab. Set `PI_RECORDER_XVFB` for a custom Xvfb binary path.

The browser toolbar is included in the recording. Setup runs before FFmpeg starts. Native dropdowns are opened and selected with keyboard navigation. There are no replacement dropdowns or app DOM modifications in native arrow mode.

## Features

- Unrecorded setup phase for authentication
- Recorded browser actions driven by Playwright selectors
- Native arrow cursor; optional circle or hidden cursor
- Smooth scrolling and curved, eased pointer movement
- Cursor position retained across navigation
- Configurable typing speed and viewport
- MP4 output plus optional WebM retention
- Environment-variable input for credentials

## Requirements

```bash
cd ~/.pi/agent/extensions/browser-recorder
npm install
npx playwright install chromium
```

FFmpeg must be available on `PATH`.

Run `/reload` in Pi after installation or changes.

## Cursor

Set `cursor_style` to `arrow`, `circle`, or `hidden` on each recording.
The recorder defaults to the real OS arrow and synchronizes its position with browser automation.
Circle mode overlays a touch indicator and hides the OS pointer. Hidden mode omits both.
Use `hidden` for animated tutorials that already draw their own tap indicators.
Run `/reload` to expose the updated tool parameters in Pi.

## GIF export

Set `gif: true` on `record_browser_flow` to export a looping GIF next to the MP4.
Optional `gif_width` (default 1200) and `gif_fps` (default 12) control size and frame rate.
The converter never upscales and uses palette generation with dithering.

For existing files, use `convert_video_to_gif` with `input`, `output`, and optional
`width` and `fps`. Output must end in `.gif`. Both tools support cancellation.
Run `/reload` after updating the extension to expose the new tool and parameters.

## Actions

| Action | Required fields | Purpose |
| --- | --- | --- |
| `goto` | `url` | Navigate and wait for DOM content |
| `click` | `selector` | Move the cursor and click |
| `type` | `selector`, `text` or `text_env` | Clear the field and type visibly |
| `fill` | `selector`, `text` or `text_env` | Fill a field immediately |
| `select` | `selector`, `label` or `value` | Select an option |
| `press` | `selector`, `key` | Press a keyboard key |
| `check` / `uncheck` | `selector` | Set a checkbox |
| `wait` | `ms` | Pause |
| `wait_for_url` | `url` | Wait for a Playwright URL glob |
| `screenshot` | `path` | Capture the current viewport |

Every action also accepts `pause_after_ms`.

## Example

Ask Pi:

> Record a browser demo to `~/Downloads/add-user.mp4`. Perform login off-camera, then open the admin dashboard, click Users, add John Doe to AMCE Corp, and save. Use an 800 px/s cursor cap.

Pi can inspect the live UI for selectors and then call `record_browser_flow`. A representative call has this shape:

```json
{
  "output": "~/Downloads/add-user.mp4",
  "cursor_speed": 800,
  "typing_delay_ms": 15,
  "setup": [
    { "action": "goto", "url": "http://127.0.0.1:3050/admin/login/?next=/admin/" },
    { "action": "fill", "selector": "#id_username", "text_env": "DEMO_ADMIN_USER" },
    { "action": "fill", "selector": "#id_password", "text_env": "DEMO_ADMIN_PASSWORD" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "wait_for_url", "url": "**/admin/" }
  ],
  "actions": [
    { "action": "goto", "url": "http://127.0.0.1:3050/admin/", "pause_after_ms": 300 },
    { "action": "click", "selector": "a[href='/admin/tenants/user/']:visible" },
    { "action": "wait_for_url", "url": "**/admin/tenants/user/" },
    { "action": "click", "selector": "a[href='/admin/tenants/user/add/']:visible" },
    { "action": "wait_for_url", "url": "**/admin/tenants/user/add/" },
    { "action": "select", "selector": "#id_tenant", "label": "AMCE Corp" },
    { "action": "type", "selector": "#id_email", "text": "john.doe@example.com" },
    { "action": "type", "selector": "#id_first_name", "text": "John" },
    { "action": "type", "selector": "#id_last_name", "text": "Doe" },
    { "action": "click", "selector": "button[name='_save']" },
    { "action": "wait_for_url", "url": "**/admin/tenants/user/*/change/" },
    { "action": "wait", "ms": 700 }
  ]
}
```
