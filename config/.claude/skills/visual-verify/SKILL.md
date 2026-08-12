---
name: visual-verify
description: Visually verify a UI change by driving a real browser and looking at screenshots — don't declare frontend work done from green tests alone. Use after changing templates, components, styles, or client-side JS in any web project; also for reproducing visual bugs the user reports with screenshots.
---

# Visual verification — see the UI before calling it done

Passing tests prove behavior, not appearance. For any UI change: render it in
a real browser, screenshot the states that matter, **view the images yourself
with the Read tool**, and iterate until what you see matches what was asked.
A subagent doing UI work should be required to do this and report what the
screenshots show; the orchestrator should re-view the final PNGs itself.

## Decide how to render

In order of preference:

1. **The project's own e2e harness** (playwright/cypress/pytest-playwright…):
   check for a project-level skill first (a repo may have its own
   `visual-verify` with exact commands), then look in `tests/e2e`, `e2e/`,
   `playwright.config.*`. A harness with a live-server fixture lets you seed
   data in-process — use it.
2. **The bundled `screenshot.py` (next to this file) against a dev server**:
   start the app (`just dev` / `npm run dev` / `manage.py runserver` — check
   the README or justfile/Makefile), then:

```bash
python <skill dir>/screenshot.py http://localhost:8000/path/ \
    --out /tmp/shots --viewports mobile,desktop --themes both \
    --wait ".some-js-rendered-thing"
```

   Presets: mobile/tablet/desktop/desktop-xl or `WIDTHxHEIGHT`. `--themes both`
   emulates prefers-color-scheme; for apps whose theme toggle reads
   localStorage instead, use `--eval "localStorage.setItem('theme','dark')" --reload`.
   `--full-page` captures beyond the fold. Also importable:
   `from screenshot import shoot`. Run it with whichever Python has
   playwright installed (often the project's venv).

3. **Static HTML/artifacts**: `screenshot.py file:///abs/path.html` works too.

If Chromium isn't installed: `playwright install chromium` (or the project's
documented equivalent).

## What to capture

- **Every viewport the change affects**: phone (390x844) and desktop
  (1440x900) at minimum for responsive work; do a resize round-trip in one
  run when JS swaps options on media queries.
- **Both themes** when the app has light/dark: force each (e.g.
  `page.emulate_media(color_scheme="dark")`, or the app's own toggle via
  localStorage + root class) — dark mode regressions hide in green suites.
- **Each state**: empty, populated, loading/error if reachable, open/closed
  for anything collapsible, hover-independent (screenshots don't hover).
- **Seeded realistic data** — a UI verified empty verifies nothing. Freeze the
  clock for date-dependent UIs (playwright: `page.clock.set_fixed_time(...)`).

## The loop

1. Write the throwaway script/test in a scratch location (or the repo's e2e
   dir if fixtures require it, named clearly `test_tmp_*`).
2. Run → Read every PNG → compare against the request, not your intention.
3. Fix, re-run. First attempts are usually close-but-wrong: spacing, dark
   mode, an overlooked state, text overflow.
4. Delete throwaway files when done. If the flow deserves permanent coverage,
   add an assertion-based e2e test (visibility/focus/count), not a screenshot
   comparison.
5. When reporting to the user, send or describe the final screenshots — they
   are the evidence the change works.

## Gotchas

- Locator strict-mode: the same text often exists twice (hidden + visible
  copy) — scope locators to a container.
- Template-language comments (`{# #}` in Django/Jinja) can be single-line
  only; a multi-line one renders as literal page text — a screenshot catches
  this instantly.
- `wait_for_selector` on something JS-rendered + a few hundred ms settle
  beats arbitrary long sleeps.
- Screenshots of pages behind auth proxies need the dev server directly, not
  the public origin.
