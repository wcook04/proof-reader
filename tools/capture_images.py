#!/usr/bin/env python3
"""Photograph the reader for the social card and the README (web/public/og.png and reader.webp)
and, for the front page, the reader with its graph by day and by night (reader-graph-*.webp).

    python tools/capture_images.py http://localhost:5173/ contextual-embeddings

Needs Playwright for Python and Pillow, and a running site. Run it after the page changes,
then build again, so the pictures show the page as it is.
"""
from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

PUBLIC = Path(__file__).resolve().parent.parent / "web" / "public"
PLACE = "isoR-clam"
# How many statements to step through before photographing the graph.
GRAPH_STEPS = 24


def main() -> int:
    url, slug = sys.argv[1], sys.argv[2]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1600, "height": 840}, device_scale_factor=2, color_scheme="light")
        page = context.new_page()
        page.goto(f"{url}#/{slug}/@{PLACE}", wait_until="load")
        page.reload(wait_until="load")
        page.wait_for_selector(".card")
        page.wait_for_timeout(1800)
        image = Image.open(BytesIO(page.screenshot())).convert("RGB")
        # The front page's picture: the paper beside the graph, a statement lit, in each theme.
        for scheme, name in (("light", "day"), ("dark", "night")):
            context = browser.new_context(viewport={"width": 1440, "height": 810}, device_scale_factor=2, color_scheme=scheme)
            page = context.new_page()
            page.goto(f"{url}#/{slug}", wait_until="load")
            page.wait_for_selector(".card")
            page.wait_for_timeout(1200)
            for _ in range(GRAPH_STEPS):
                page.keyboard.press("j")
                page.wait_for_timeout(120)
            page.wait_for_timeout(1500)
            graph = Image.open(BytesIO(page.screenshot())).convert("RGB")
            graph.resize((1600, 900), Image.LANCZOS).save(PUBLIC / f"reader-graph-{name}.webp", quality=84, method=6)
        browser.close()
    image.resize((1200, 630), Image.LANCZOS).save(PUBLIC / "og.png", optimize=True)
    image.resize((1600, 840), Image.LANCZOS).save(PUBLIC / "reader.webp", quality=88, method=6)
    print(f"wrote {PUBLIC / 'og.png'}, {PUBLIC / 'reader.webp'} and the two reader-graph pictures")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
