---
name: visual-verify
description: Visually verify UI changes in an isolated Agent Workspace browser and inspect screenshots; use project-specific browser test tooling when required. Use after changing templates, components, styles, or client-side JS, and when reproducing visual bugs. Playwright is not a global prerequisite.
---

# Visual verification — see the UI before calling it done

Passing tests prove behavior, not appearance. For any UI change, render it in
a real browser, screenshot the states that matter, **view the images yourself
with the Read tool**, and iterate until what you see matches the request.
Require UI subagents to do the same; the orchestrator should re-view final PNGs.

## Choose the workflow

Check project instructions and project-level skills first. Follow any required
project test commands; otherwise use **Agent Workspace by default** for ad hoc
browser interaction and visual verification. Do not install Playwright globally
or add it to a project merely to capture screenshots.

### Default: isolated Agent Workspace

1. Read the app's README or task runner configuration and start its dev server.
2. Discover the `agent-workspace-linux` MCP tools and read the schemas needed
   for this task. Run `workspace_doctor` before starting a workspace.
3. Use a unique workspace ID. Starting requires explicit acknowledgement of the
   separate agent-controlled environment; obtain it if the user has not already
   authorized this workflow. Set `open_viewer:false` unless a visible viewer is
   wanted. Do not reuse or stop an unrelated workspace.
4. Use `workspace_open_browser` to launch a workspace-owned browser with a
   disposable profile. Navigate to the dev URL using `workspace_browser_navigate`.
   Do not attach to the user's live browser or copy their authenticated profile
   without permission. Use test credentials when authentication is required.
5. Observe using `workspace_browser_snapshot` and `workspace_observe` with
   `screenshot:true`. Use workspace-scoped click, typing, scrolling, and keyboard
   tools. Verify the active window and actual page before input, then re-observe
   after changes. A successful input dispatch is not proof of the result.
6. Save final screenshots outside the temporary workspace, read them with the
   Read tool, and report their paths plus the page URL and tested state.
7. Stop the workspace and any dev server you started when finished, unless the
   user asks to keep them running. Preserve screenshot evidence.

The workspace isolates GUI input, not necessarily files or network access.
Inspect its policy before treating it as a security sandbox. A `local_only`
network namespace does not reach the host's localhost dev server; use an
appropriate approved network configuration or run the server inside it.
Serve static HTML from a local HTTP server when browser navigation does not
support file URLs. If workspace dependencies are missing, report the blocker;
do not silently fall back to controlling the user's real desktop.

### Optional: project-specific automation

Playwright, Cypress, or pytest-playwright may be project dependencies for
repeatable regression tests and CI. Use the project's installed harness and
fixtures when required or useful for that task. Keep dependencies and browser
installation project-scoped, following the project's documented workflow.

The bundled `screenshot.py` is a legacy optional helper for projects that already
provide Python Playwright. It is not the default or a prerequisite. Invoke its
`--help` with that project's Python if needed; do not install global dependencies
for it.

## What to capture

- **Affected viewports:** phone (390x844) and desktop (1440x900) at minimum for
  responsive work. Verify the actual browser content viewport; workspace screen
  dimensions include browser chrome and are not equivalent. Check a resize
  round-trip when JavaScript reacts to media queries.
- **Both themes** when supported: use the app's theme control or the project's
  documented emulation. Capture each explicitly.
- **Each relevant state:** empty, populated, loading/error when reachable,
  expanded/collapsed, and keyboard focus where appropriate.
- **Realistic data:** populated screens, long text, and relevant edge cases.
  Use project fixtures and freeze time when date-dependent tests require it.

## The verification loop

1. Render and exercise the changed UI.
2. Capture and read every relevant PNG; compare against the user's request.
3. Fix issues and repeat, including spacing, overflow, themes, and state changes.
4. Remove throwaway scripts and test data you created. Add permanent
   assertion-based tests through the project's own test stack when warranted.
5. Show or link final screenshots and summarize what was actually verified.
   Report untested states and blockers rather than declaring them passed.

## Gotchas

- A matching label can belong to a hidden duplicate; scope actions to the right
  visible container or window.
- Template comments can render as literal text if the syntax is wrong; screenshots
  catch this even when tests pass.
- Wait for observable content or state instead of arbitrary long sleeps.
- Use the dev server directly when auth proxies prevent local verification.
