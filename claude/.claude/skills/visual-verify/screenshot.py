#!/usr/bin/env python3
"""Quick page screenshots for visual verification, without a test harness.

Needs `playwright` importable and Chromium installed (`playwright install
chromium`). Works as a CLI or as an importable module:

    python screenshot.py http://localhost:8000/calendar/ --out /tmp/shots
    python screenshot.py http://localhost:8000/ --viewports mobile,desktop \
        --themes both --wait ".fc-daygrid-day" --eval "localStorage.x=1" --reload

    from screenshot import shoot
    shoot("http://localhost:8000/", "/tmp/shots", viewports=["mobile"])

Prefer a project's own e2e harness when it has one (fixtures can seed data);
this script is for dev servers, static files, and anything reachable by URL.
"""

import argparse
import re
import sys
from pathlib import Path

VIEWPORTS = {
    "mobile": (390, 844),      # iPhone-ish
    "tablet": (820, 1180),     # iPad-ish
    "desktop": (1440, 900),
    "desktop-xl": (1920, 1080),
}


def parse_viewport(name):
    """'mobile' | 'desktop' | '1280x720' -> (label, (w, h))."""
    if name in VIEWPORTS:
        return name, VIEWPORTS[name]
    m = re.fullmatch(r"(\d+)x(\d+)", name)
    if not m:
        raise ValueError(f"unknown viewport {name!r} (presets: {', '.join(VIEWPORTS)})")
    return name, (int(m.group(1)), int(m.group(2)))


def slug(url):
    """URL -> filename-safe label ('/calendar/' -> 'calendar')."""
    tail = re.sub(r"^\w+://[^/]*", "", url).strip("/") or "index"
    return re.sub(r"[^\w.-]+", "-", tail)[:60]


def shoot(
    url,
    out_dir,
    *,
    viewports=("mobile", "desktop"),
    themes=("light",),
    wait_selector=None,
    settle_ms=500,
    full_page=False,
    eval_js=None,
    reload_after_eval=False,
    fixed_time=None,
):
    """Screenshot `url` for every (viewport, theme) combination.

    themes: subset of {"light", "dark"} — emulated via prefers-color-scheme.
    eval_js: JS run after load (e.g. seed localStorage for an app whose theme
        toggle ignores the media query); reload_after_eval reloads so
        pre-paint scripts see what it wrote.
    fixed_time: datetime freezing Date/now for date-dependent UIs.
    Returns the list of files written.
    """
    from playwright.sync_api import sync_playwright

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for vp_name in viewports:
            label, (w, h) = parse_viewport(vp_name)
            for theme in themes:
                page = browser.new_page(
                    viewport={"width": w, "height": h}, color_scheme=theme
                )
                if fixed_time is not None:
                    page.clock.set_fixed_time(fixed_time)
                page.goto(url)
                if eval_js:
                    page.evaluate(eval_js)
                    if reload_after_eval:
                        page.reload()
                if wait_selector:
                    page.wait_for_selector(wait_selector)
                page.wait_for_timeout(settle_ms)
                path = out / f"{slug(url)}-{label}-{theme}.png"
                page.screenshot(path=str(path), full_page=full_page)
                written.append(str(path))
                print(path)
                page.close()
        browser.close()
    return written


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("urls", nargs="+", help="URLs (http(s):// or file://)")
    ap.add_argument("--out", default="./shots", help="output directory")
    ap.add_argument(
        "--viewports",
        default="mobile,desktop",
        help=f"comma list: presets ({', '.join(VIEWPORTS)}) or WIDTHxHEIGHT",
    )
    ap.add_argument(
        "--themes", default="light", choices=["light", "dark", "both"],
        help="color scheme(s) to emulate",
    )
    ap.add_argument("--wait", help="CSS selector to wait for before shooting")
    ap.add_argument("--settle", type=int, default=500, help="extra settle ms")
    ap.add_argument("--full-page", action="store_true", help="capture full page")
    ap.add_argument("--eval", dest="eval_js", help="JS to run after load")
    ap.add_argument(
        "--reload", action="store_true",
        help="reload after --eval (for localStorage read at boot)",
    )
    args = ap.parse_args(argv)

    themes = ("light", "dark") if args.themes == "both" else (args.themes,)
    for url in args.urls:
        shoot(
            url,
            args.out,
            viewports=args.viewports.split(","),
            themes=themes,
            wait_selector=args.wait,
            settle_ms=args.settle,
            full_page=args.full_page,
            eval_js=args.eval_js,
            reload_after_eval=args.reload,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
