#!/usr/bin/env python3
"""Photograph the reader for the social card and the README: web/public/og.png and reader.webp.

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
        browser.close()
    image.resize((1200, 630), Image.LANCZOS).save(PUBLIC / "og.png", optimize=True)
    image.resize((1600, 840), Image.LANCZOS).save(PUBLIC / "reader.webp", quality=88, method=6)
    print(f"wrote {PUBLIC / 'og.png'} and {PUBLIC / 'reader.webp'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
