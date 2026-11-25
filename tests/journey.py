#!/usr/bin/env python3
"""One reader's whole visit to a paper, in a real browser, with real input.

Reads, hovers, clicks, walks the Lean, moves the map, follows references, searches,
opens the PDF, goes Back through every step and Forward again, reloads, follows deep
links and tries a bad one, and asserts the state at each step.

    cd web && VITE_BASE_PATH=/proof-reader/ npm run build && cd ..
    python tests/journey.py                     # serves web/dist under /proof-reader/
    python tests/journey.py --url http://localhost:5173/   # or any running site
    python tests/journey.py --shots /tmp/shots  # keep a screenshot of each stage

Needs Playwright for Python and its Chromium. It is not part of the unit tests.
"""
from __future__ import annotations

import argparse
import os
import http.server
import re
import socket
import socketserver
import subprocess
import sys
import time
from functools import partial
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from graph_pane_checks import check_graph_pane, check_groups  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SLUG = "contextual-embeddings"
EDITION = __import__("json").loads((ROOT / "web" / "public" / "papers" / SLUG / "edition.json").read_text())
PAIRS = [(1440, 790), (1920, 953), (2560, 1313)]
PHONE = (390, 664)


class Stop(Exception):
    pass


checks = 0


def check(condition, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise Stop(message)
    print(f"  ok  {message}")


def wait_until(page: Page, test, message: str, timeout: float = 4.0):
    """Poll a Python test against the page: the page animates, so state arrives."""
    end = time.time() + timeout
    value = None
    while time.time() < end:
        value = test()
        if value:
            check(True, message)
            return value
        page.wait_for_timeout(40)
    check(False, f"{message} (last saw {value!r})")


def top(page: Page) -> float:
    return page.evaluate("document.querySelector('[data-paper-pane]').scrollTop")


def caption(page: Page) -> str:
    return page.locator(".proof__says p").inner_text()


def progress(page: Page) -> str:
    """The stepper's words, present in the bar or, on a phone, in the site menu."""
    return page.locator(".stepper span").first.text_content() or ""


def address(page: Page) -> str:
    return page.evaluate("location.hash")


def entries(page: Page) -> int:
    return page.evaluate("history.length")


def camera(page: Page) -> str:
    """Where the graph stands in its canvas: the main result's card and the scale.

    Not the world transform: a layout rebuilt from scratch can sit a pixel or so from one
    grown step by step, and the map restores what is on screen by an anchored card.
    """
    return page.evaluate("""() => {
      const world = document.querySelector('.tree__world');
      const card = document.querySelector('.card--root');
      if (!world || !card) return '';
      const scale = /scale\\(([^)]+)\\)/.exec(world.style.transform)?.[1] ?? '';
      const box = card.getBoundingClientRect();
      const canvas = document.querySelector('.graph__canvas').getBoundingClientRect();
      return `${(box.left - canvas.left).toFixed(1)} ${(box.top - canvas.top).toFixed(1)} ${scale}`;
    }""")


def lean_head(page: Page) -> str:
    """The raw name of the declaration on show, when the Lean is open."""
    block = page.locator(".proof__lean:not([hidden]) .decl")
    return block.first.get_attribute("data-decl") if block.count() else ""


def lean_open(page: Page) -> bool:
    return page.locator(".proof__lean").is_visible()


def reading_strip(page: Page) -> str:
    """The line under the graph; in Graph mode it is there only while something is pointed at."""
    strip = page.locator(".proof__reading")
    return strip.inner_text() if strip.count() else ""


def lean_mode(page: Page) -> bool:
    """The pane is in Lean mode. Graph mode also shows the drawing below the Lean dock."""
    return page.locator(".proof[data-lean]").count() > 0


GRAPH_FIRST = """
try {
  if (!localStorage.getItem('proof-reader-pane-5'))
    localStorage.setItem('proof-reader-pane-5', JSON.stringify({graph: true, lean: false, share: 0, sideShare: 0}));
} catch { /* a frame with no storage, such as the PDF's: nothing to set there */ }
"""


def graph_first(context):
    """The visits below were written from Graph mode, so each starts as a reader who chose it."""
    context.add_init_script(GRAPH_FIRST)
    return context


def open_site_menu(page: Page):
    page.get_by_role("button", name="Site menu").click()
    menu = page.get_by_role("navigation", name="Site menu")
    menu.wait_for()
    return menu


def keep_proof_reader(page: Page) -> None:
    """The following checks exercise the original reader and its local navigation."""
    page.route("**/library-redirects.js", lambda route: route.fulfill(body="", content_type="application/javascript"))


def opening(page: Page, url: str) -> None:
    """A first visit with nothing saved: the Graph view and its dock follow the reading, and a typed address is obeyed."""
    print("A first visit")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(700)
    check(not lean_mode(page) and page.locator(".fg").count() == 1, "with nothing saved the right page opens on the Graph view, with the Lean docked under it")
    tops = page.evaluate(
        """() => { const el = document.querySelector('[data-paper-pane]');
        const origin = el.getBoundingClientRect().top - el.scrollTop;
        return [...el.querySelectorAll('.tie[data-passage]')].map((t) => Math.round(t.getBoundingClientRect().top - origin)); }"""
    )
    check(len(tops) >= 3, f"the paper has statements to read past: {len(tops)}")
    seen: list[str] = []
    hashes: list[str] = []
    for top in (tops[0], tops[len(tops) // 2], tops[-1]):
        page.evaluate("(y) => { const el = document.querySelector('[data-paper-pane]'); el.scrollTop = Math.max(0, y - el.clientHeight * 0.3); }", top)
        page.wait_for_timeout(900)
        seen.append(page.locator(".proof__lean .decl__name").first.inner_text() if page.locator(".proof__lean .decl__name").count() else "")
        hashes.append(page.evaluate("location.hash"))
    check(len({name for name in seen if name}) >= 2, f"scrolling the paper changes the declaration shown: {seen}")
    check(len(set(hashes)) == 3, "and the address follows the reading")
    before = page.evaluate("document.querySelector('[data-paper-pane]').scrollTop")
    page.evaluate("(hash) => { location.hash = hash; }", hashes[0])
    wait_until(page, lambda: page.evaluate("document.querySelector('[data-paper-pane]').scrollTop") < before - 200, "an address this tab already passed, typed again, takes the reader back to it")
    check(page.evaluate("location.hash") == hashes[0], "and stays in the address bar")


def reopen_proof(page: Page, url: str) -> None:
    """A previously closed proof pane must not hide the split on later visits."""
    print("Reopening the proof pane")
    keep_proof_reader(page)
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.locator(".proof").wait_for()
    page.evaluate("""localStorage.setItem('proof-reader-pane-5', JSON.stringify({
        graph: false, lean: false, dock: 0.6
    }))""")
    for slug in ("pcp-exposition", "pcp-specialist", "pcp-full-argument", "pcp-reading-guide", SLUG):
        page.goto(f"{url}#/{slug}", wait_until="load")
        page.locator(".proof").wait_for()
        paper = page.locator(".left").bounding_box()
        proof = page.locator(".proof").bounding_box()
        check(paper is not None and proof is not None
              and proof["x"] >= paper["x"] + paper["width"] - 1
              and abs(proof["y"] - paper["y"]) <= 1,
              f"{slug} opens beside its proof despite a saved closed pane")
        check(not lean_mode(page), "the saved Graph mode is preserved")
    page.locator(".proof").get_by_role("button", name="Close", exact=True).click()
    page.locator(".proof").wait_for(state="hidden")
    check(True, "Close still hides the proof for the current visit")
    page.reload(wait_until="load")
    page.locator(".proof").wait_for()
    check(True, "reloading opens the proof pane again")
    check(page.evaluate("""() => {
        const layout = JSON.parse(localStorage.getItem('proof-reader-pane-5'));
        return layout.dock === 0.6 && layout.lean === false && !Object.hasOwn(layout, 'graph');
    }"""), "the view and the dock's height persist without a saved closed pane")


def graph_follows(page: Page, url: str, shots: Path | None) -> None:
    """A paper with many results: the graph shows the statement being read, and the
    divider between paper and proof moves, is remembered and can be put back."""
    print("The graph follows the reading")
    keep_proof_reader(page)
    page.goto(f"{url}#/pcp-exposition", wait_until="load")
    page.locator(".fg__card.is-subject").first.wait_for()
    head = lambda: page.eval_on_selector_all(".fg__card.is-subject .fg__title", "els => els.map(e => e.textContent)")
    check(page.locator(".proof__graph").bounding_box()["height"] > 150 and not lean_mode(page),
          "a fresh visit opens with the Lean dock and graph")
    seen = set()
    for _ in range(8):
        page.mouse.move(400, 500)
        page.mouse.wheel(0, 2200)
        page.wait_for_timeout(700)
        heads = head()
        seen.add(tuple(heads))
        if "Following" in caption(page) and heads:
            check(any(title in caption(page) for title in heads), f"the graph shows the statement being read: {heads[0]}")
    check(len(seen) >= 4, f"the graph changed {len(seen)} times as the paper scrolled")
    # A statement opened by its address is held; reading on lets it go without a click.
    page.goto(f"{url}#/pcp-exposition/@pcp-expository-opening", wait_until="load")
    page.locator(".fg__card.is-subject").first.wait_for()
    wait_until(page, lambda: "Pinned" in caption(page), "a statement opened by its address is held open")
    wait_until(page, lambda: top(page) < 1200, "the paper has arrived at that statement")
    page.wait_for_timeout(600)
    held = head()
    let_go = False
    for _ in range(8):
        page.mouse.move(400, 500)
        page.mouse.wheel(0, 1100)
        page.wait_for_timeout(700)
        if "Following" in caption(page) and head() != held:
            let_go = True
            break
    check(let_go, "reading on lets go of it: the Lean and the graph follow the scroll")
    # Whole file and back: the step opens at its annotation or Lean statement.
    page.locator(".proof").get_by_role("button", name="Whole file", exact=True).click()
    page.wait_for_timeout(700)
    page.locator(".proof").get_by_role("button", name="This step", exact=True).click()
    page.wait_for_timeout(600)
    check(page.evaluate("""() => {
        const body = document.querySelector('.leaf__body');
        const start = body.querySelector('.decl__note') ?? body.querySelector('.decl .source__line');
        if (!start) return false;
        const r = start.getBoundingClientRect(), b = body.getBoundingClientRect();
        return r.top >= b.top - 2 && r.top + Math.min(r.height, 18) <= b.bottom + 2;
    }"""), "back from the whole file, the step starts at its annotation or Lean statement")
    page.goto(f"{url}#/pcp-exposition", wait_until="load")
    page.locator(".papersplit").wait_for()
    shot(page, shots, "05-graph-follows")
    width = lambda: page.locator(".left").bounding_box()["width"]
    start = width()
    grip = page.locator(".papersplit").bounding_box()
    page.mouse.move(grip["x"] + 13, 400)
    page.mouse.down()
    page.mouse.move(grip["x"] - 107, 400, steps=6)
    page.mouse.up()
    page.wait_for_timeout(300)
    moved = width()
    check(abs((start - moved) - 120) < 4, f"dragging the divider narrows the paper by the drag ({start:.0f} to {moved:.0f})")
    page.reload(wait_until="load")
    page.locator(".papersplit").wait_for()
    page.wait_for_timeout(600)
    check(abs(width() - moved) < 2, "the divider's place survives a reload")
    page.locator(".papersplit").dblclick()
    page.wait_for_timeout(300)
    check(abs(width() - start) < 2, "a double click puts the divider back")
    page.locator(".papersplit").focus()
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(200)
    check(width() > start + 20, "the arrow keys move the divider")
    page.keyboard.press("Home")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "no sideways scroll after resizing")


def active(page: Page) -> str:
    return page.evaluate("document.querySelector('[data-paper-pane] .q.is-active')?.dataset.p ?? ''")


def lean_quote(page: Page) -> str:
    quote = page.locator(".stepline blockquote")
    return quote.inner_text() if quote.count() else ""


def snapshot(page: Page) -> dict:
    return {
        "top": top(page),
        "hash": address(page),
        "caption": caption(page),
        "camera": camera(page),
        "copy": page.get_attribute(".page", "data-copy"),
        "lean": lean_head(page),
        "tab": page.evaluate("document.querySelector('.proof__lean:not([hidden]) .leaf__tabs button[aria-pressed=true]')?.textContent ?? ''"),
    }


def same(page: Page, want: dict, label: str) -> None:
    def matches():
        have = snapshot(page)
        return have["copy"] == want["copy"] and abs(have["top"] - want["top"]) <= 1 and have["hash"] == want["hash"] and have["lean"] == want["lean"] and have["tab"] == want["tab"]
    end = time.time() + 3
    while time.time() < end and not matches():
        page.wait_for_timeout(40)
    have = snapshot(page)
    check(matches(), f"{label}: back at {want['hash'] or 'the start'}, paper at {want['top']:.0f} (have {have['top']:.0f}, {have['hash']}, {have['lean']}, {have['tab']})")
    check(have["caption"] == want["caption"], f"{label}: says the same thing on the right ({have['caption']!r})")
    end = time.time() + 3
    while time.time() < end and camera(page) != want["camera"]:
        page.wait_for_timeout(40)
    check(camera(page) == want["camera"], f"{label}: the graph's camera is where it was (want {want['camera']}, have {camera(page)})")


def wheel_to(page: Page, wanted: float) -> None:
    """Scroll with the wheel, as a reader does, until the paper is near a position."""
    box = page.locator("[data-paper-pane]").bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.08, box["y"] + box["height"] * 0.6)
    for _ in range(80):
        gap = wanted - top(page)
        if abs(gap) < 30:
            break
        page.mouse.wheel(0, max(-1800, min(1800, gap)))
        page.wait_for_timeout(50)
    # Some browsers animate the wheel: wait for the page to come to rest.
    last = None
    for _ in range(25):
        if last == top(page):
            break
        last = top(page)
        page.wait_for_timeout(180)
    page.wait_for_timeout(320)


def visible_mark(page: Page, offset: int = 0) -> str | None:
    """The id of a tied statement on screen, some way from the reading line."""
    return page.evaluate(
        """(offset) => {
          const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect();
          const found = [...document.querySelectorAll('.sheet__text .q')].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.top > pane.top + 20 && b.bottom < pane.bottom - 20 && !el.classList.contains('is-active') && !el.closest('pre') && !el.closest('a') && !el.querySelector('a') && b.width > 60;
          });
          document.querySelectorAll('[data-journey="mark"]').forEach((el) => el.removeAttribute('data-journey'));
          found[offset]?.setAttribute('data-journey', 'mark');
          return found[offset]?.dataset.p.split(' ')[0] ?? null;
        }""",
        offset,
    )


def bring_mark(page: Page) -> None:
    """Read on a little until a plain statement is on screen, as a reader would."""
    for _ in range(10):
        if visible_mark(page):
            return
        wheel_to(page, top(page) + 90)


def mark(page: Page, passage: str):
    return page.locator(f'.sheet__text .q[data-p~="{passage}"]').first


def reload(page: Page) -> None:
    """The reader's own reload, which is what the page has to answer."""
    with page.expect_navigation(wait_until="load"):
        page.evaluate("location.reload()")


def shot(page: Page, folder: Path | None, name: str) -> None:
    if folder:
        page.screenshot(path=str(folder / f"{name}.png"))


def tablet(page: Page, url: str, shots: Path | None) -> None:
    print("Under 1280px")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@isoL-statement", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(800)
    check(page.locator(".proof").count() == 0, "the right page waits to be asked for")
    page.locator(".bar__open").click()
    wait_until(page, lambda: page.locator(".proof").count() == 1, "the strip opens it")
    page.wait_for_timeout(1200)
    check(address(page).endswith("@isoL-statement") or "@" in address(page), "the address stays on the paper")
    shot(page, shots, "22-tablet")
    page.go_back()
    wait_until(page, lambda: page.locator(".proof").count() == 0, "Back closes it")


def journey(page: Page, url: str, shots: Path | None) -> None:
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    stack: list[tuple[str, dict]] = []
    served = url.split("/")[2]
    foreign: list[str] = []
    page.on("request", lambda r: foreign.append(r.url) if r.url.startswith("http") and r.url.split("/")[2] != served else None)

    def stop_here(name: str) -> None:
        stack.append((name, snapshot(page)))

    print("Arrive")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(700)
    check("Contextual Embeddings" in page.title(), f"the tab names the paper: {page.title()}")
    check(page.locator(".firstline--status").is_visible() and page.locator(".firstline--status").bounding_box()["y"] < page.locator(".sheet__text h1").bounding_box()["y"], "the status line stands above the title")
    check("not been reviewed by the authors" in page.locator(".firstline--status").inner_text(), "and says who made the links")
    check("Before the first statement" in caption(page), f"the caption says where the ties are: {caption(page)}")
    check(page.locator(".proof__graph").is_visible() and not lean_mode(page), "at rest the right page is the graph, and the Lean waits")
    check(page.locator(".skip").count() == 1, "there is a skip link")
    shot(page, shots, "01-arrive")

    print("The family")
    home = page.locator(".fam-lockup__home")
    check(home.get_attribute("href") == "https://wcook04.github.io/", "the plait links home")
    check(home.locator(".fam-lockup__owner").inner_text() == "Will Cook" and home.locator("img").get_attribute("alt") == "", "it names Will Cook beside the plait")
    check(home.locator("img").evaluate("(img) => img.complete && img.naturalWidth > 0"), "and its picture loads from this site")
    check(page.locator(".bar").bounding_box()["height"] <= 47, "the header keeps its height")
    menu = open_site_menu(page)
    check(menu.get_by_role("link", name="All editions").is_visible(), "the site menu opens the editions")
    check(menu.get_by_role("button", name="Search the paper").is_visible(), "the site menu exposes paper search")
    check(menu.locator(".bar__film").count() == 2 and menu.locator(".bar__film").first.get_attribute("href") == "https://www.youtube.com/watch?v=LZxaDZ-gQm8",
          "the site menu opens both videos")
    page.keyboard.press("Escape")
    check(not menu.is_visible(), "Escape dismisses the site menu")
    check(page.locator(".sheet__text .q").first.evaluate("(el) => getComputedStyle(el).textDecorationLine") in ("underline", "none"), "linked statements carry a resting line outside code")
    foot = page.locator(".foot .fam-sites").first
    check(foot.count() == 1 and "All projects and videos" in foot.text_content() and "Plectis Atlas" in foot.text_content(), "the end of the paper lists the sister sites")
    check(foreign == [], f"nothing is asked of another host: {foreign[:2]}")
    page.goto(url, wait_until="load")
    page.wait_for_selector(".shelf li a[href*='contextual-embeddings']")
    check(page.locator(".fam-lockup__home").get_attribute("href") == "https://wcook04.github.io/", "the front page has the lockup too")
    check(page.locator(".shelf__foot .fam-sites__list li").count() == 7, "and the sister sites")
    # The front page: one real linked sentence beside its Lean lines, and the two videos.
    quote = page.locator(".specimen__quote")
    check(quote.count() == 1 and quote.get_attribute("href").endswith("#/contextual-embeddings/@isoR-clam"), "the front page's sentence opens its own address in the reader")
    check(page.locator(".specimen__line.is-exact").count() == 5, "beside the five Lean lines it is linked to")
    check(page.locator(".specimen__thread path").count() == 1, "and a thread joins the two")
    picks = page.locator(".specimen-picks button")
    check(picks.count() == 3 and picks.first.get_attribute("aria-pressed") == "true", "three linked sentences can be chosen, the first shown")
    frame = page.locator(".specimen").bounding_box()
    picks.nth(1).click()
    wait_until(page, lambda: page.locator(".specimen__quote").get_attribute("href").endswith("@closed-world"), "choosing another sentence changes the paper and its Lean")
    check(page.locator(".specimen__decl code").inner_text() == "closedWorld", "to that sentence's own declaration")
    after = page.locator(".specimen").bounding_box()
    check(abs(after["height"] - frame["height"]) < 1 and abs(after["y"] - frame["y"]) < 1, "and the frame does not move")
    picks.first.click()
    wait_until(page, lambda: page.locator(".specimen__quote").get_attribute("href").endswith("@isoR-clam"), "the first sentence comes back")
    films = page.locator(".hero__films .film-slot__title a")
    check([films.nth(i).get_attribute("href") for i in range(films.count())] == ["https://www.youtube.com/watch?v=LZxaDZ-gQm8", "https://www.youtube.com/watch?v=ZE9thkr5jew"], "the short video and the long one are on the first screen")
    check(page.locator(".hero__films img").evaluate_all("(imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0)"), "with stills served by this site")
    check(page.locator(".hero__actions .button--ink").bounding_box()["y"] < page.viewport_size["height"], "the way into the paper is on the first screen")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "the front page does not scroll sideways")
    page.locator(".reader-picture").scroll_into_view_if_needed()
    wait_until(page, lambda: page.locator(".reader-picture img").evaluate("(img) => img.complete && img.naturalWidth > 0"), "the picture of the reader loads")
    shot(page, shots, "00-front-page")
    page.locator(".shelf li a[href*='contextual-embeddings']").first.click()
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(700)

    print("Read")
    base_entries = entries(page)
    wheel_to(page, 5200)
    wait_until(page, lambda: "Following the paper" in caption(page), "scrolling follows without a click")
    check(page.locator(".sheet__text .q.is-active").count() > 0, "the statement under the line takes the highlighter")
    check(page.locator('.fg__card.is-subject').count() > 0, "its card is the subject of the graph")
    check(not lean_mode(page), "the Lean stays closed while reading")
    wait_until(page, lambda: address(page).endswith(page.evaluate("document.querySelector('.q.is-active').dataset.p.split(' ')[0]")), "the address keeps up with the sentence")
    check(entries(page) == base_entries, "following adds no history")
    shot(page, shots, "02-following")
    before = top(page)
    held = address(page)
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: abs(top(page) - before) <= 1, f"a reload lands on the same pixel, {before:.0f}")
    check(address(page) == held, "and the same address")
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(500)
    wait_until(page, lambda: "Following the paper" in caption(page), "and follows from there")

    print("Hover")
    bring_mark(page)
    other = visible_mark(page)
    check(other is not None, f"a second statement is on screen: {other}")
    was_top = top(page)
    was_entries = entries(page)
    target = page.locator('[data-journey="mark"]')
    box = target.evaluate("(el) => { const b = el.getClientRects()[0]; return { x: b.left, y: b.top, width: b.width, height: b.height }; }")
    page.mouse.move(box["x"] + 8, box["y"] + 6)
    check("pointer" == target.evaluate("(el) => getComputedStyle(el).cursor"), "the pointer says it can be clicked")
    page.wait_for_timeout(400)
    check(abs(top(page) - was_top) <= 1 and entries(page) == was_entries and not lean_mode(page), "pointing moves nothing and adds no history")
    shot(page, shots, "03-point")
    page.mouse.move(box["x"] + 6, 20)
    wait_until(page, lambda: page.locator(".fg__card.is-lit").count() == 0, "leaving lights no card")

    print("Lean mode, chosen on the toggle")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_mode(page) and lean_head(page), "one click opens the Lean")
    first_lean = lean_quote(page)
    page.mouse.move(box["x"] + 8, box["y"] + 6)
    wait_until(page, lambda: "Previewing" in caption(page), "with the Lean open, a dwell previews there")
    shot(page, shots, "03-preview")
    page.mouse.move(box["x"] + 6, 20)
    wait_until(page, lambda: "Previewing" not in caption(page), "and leaving restores it")
    check(lean_quote(page) == first_lean, "the same Lean as before")
    wheel_to(page, top(page) + 500)
    wait_until(page, lambda: lean_quote(page) != first_lean, "the Lean follows the text")
    wait_until(page, lambda: page.evaluate("""() => { const row = document.querySelector('.proof__lean .source__line.is-exact') ?? document.querySelector('.proof__lean .source__line'); const body = document.querySelector('.leaf__body').getBoundingClientRect(); const b = row.getBoundingClientRect(); return b.top >= body.top && b.bottom <= body.bottom; }"""), "and comes into view")
    shot(page, shots, "03-following-lean")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_mode(page), "the Graph side of the toggle goes back to the graph")
    wait_until(page, lambda: visible_mark(page), "back at a statement")
    other = visible_mark(page)
    target = page.locator('[data-journey="mark"]')
    box = target.evaluate("(el) => { const b = el.getClientRects()[0]; return { x: b.left, y: b.top, width: b.width, height: b.height }; }")
    was_top = top(page)
    was_entries = entries(page)

    print("Click a sentence")
    stop_here("following")
    page.mouse.click(box["x"] + 8, box["y"] + 6)
    wait_until(page, lambda: address(page).endswith(f"@{other}"), f"the sentence has an address: {other}")
    check("Pinned" in caption(page), "the caption says it is pinned")
    wait_until(page, lambda: lean_open(page) and lean_head(page), "the click shows its Lean in the dock")
    check(not lean_mode(page) and page.locator('.mode-toggle button[aria-pressed="true"]').inner_text() == "Graph",
          "the tab stays on Graph")
    panes = page.locator(".proof__panes").bounding_box()
    check(0.6 <= page.locator(".proof__graph").bounding_box()["height"] / panes["height"] <= 0.8, "the drawing keeps room below the dock")
    check(page.locator(".crumbs a").count() > 0, "breadcrumbs say where the paper has it")
    check(abs(top(page) - was_top) <= 2, "the paper does not move")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_mode(page) and not page.locator(".proof__graph").is_visible() and "Pinned" in caption(page),
               "the Lean view gives the pinned sentence's Lean the whole pane")
    check(page.locator(".bar .back").is_visible(), "a named Back appears")
    print("    back says:", page.locator(".bar .back").inner_text())
    page.wait_for_timeout(250)
    stop_here("pinned sentence")

    print("Walk the Lean")
    link = page.locator(".leaf__body a.source__ref, .leaf__body a.declname").first
    was_top = top(page)
    link.hover()
    raw = link.evaluate("(a) => (a.querySelector('code')?.textContent ?? a.textContent).trim()")
    wait_until(page, lambda: raw in reading_strip(page), f"pointing at {raw} says its signature on the right page")
    check(page.locator(".proof__reading code").count() == 1, "in the strip, covering nothing")
    link.click()
    name = raw
    wait_until(page, lambda: lean_head(page) == name, f"the Lean walks to {name}")
    check(address(page).endswith(f"/{name}"), "the declaration has its own address")
    check(abs(top(page) - was_top) <= 2, "the paper does not move by itself")
    check(page.locator(".decl__links").count() > 0 and "Used by" in page.locator(".decl__links").first.inner_text(), "it lists what it uses and what uses it")
    check(page.locator(".decl__source a").count() > 0, "it links to the authors' artifact")
    print("    back says:", page.locator(".bar .back").inner_text())
    page.wait_for_timeout(250)
    stop_here(f"walked to {name}")

    print("The proof fold")
    fold = page.locator(".decl__fold").first
    if fold.count():
        open_before = fold.get_attribute("aria-expanded")
        fold.click()
        check(fold.get_attribute("aria-expanded") != open_before, "Proof folds and opens")
        fold.click()

    print("Back to the Graph view, keeping the subject")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_mode(page) and page.locator(f'.fg__card.is-subject[data-card="{name}"]').count() == 1, f"the Graph view draws {name} in the middle")
    check(address(page).endswith(f"/{name}"), "the view changed in place: the address still names it")
    page.wait_for_timeout(350)

    print("Click a card")
    stack[-1] = (stack[-1][0], snapshot(page))
    stated = {d["id"] for d in EDITION["declarations"] if d["passages"]}
    ids = page.eval_on_selector_all(".fg__card:not(.is-subject)", "els => els.map((e) => e.dataset.card)")
    pick = "isoR" if "isoR" in ids else next((i for i in ids if i in stated), None)
    check(pick is not None, f"the graph draws a neighbour the paper states: {pick}")
    card = page.locator(f'.fg__card[data-card="{pick}"]').first
    card.scroll_into_view_if_needed()
    was_top = top(page)
    card.click()
    wait_until(page, lambda: lean_head(page) == pick, f"the dock opens at the card {pick}")
    check(address(page).endswith(f"/{pick}"), "the address names it")
    page.wait_for_timeout(600)
    check(abs(top(page) - was_top) <= 2, "the paper stays where it was")
    check(page.locator(".bar .back", has_text="Go to passage").count() == 1, "the bar offers the card's passage")
    check(page.evaluate("""(id) => { const view = document.querySelector('.fg__scroll').getBoundingClientRect(); const b = document.querySelector(`.fg__card.is-subject[data-card="${id}"]`)?.getBoundingClientRect(); return !!b && b.top >= view.top && b.bottom <= view.bottom; }""", pick), "its card is the subject, wholly in view")
    check("Pinned" in caption(page) and not lean_mode(page), "it is pinned, and the view stays on Graph")
    stop_here(f"card {pick}")
    shot(page, shots, "04-card")

    print("Move the graph")
    scroller = page.locator(".fg__scroll")
    box = scroller.bounding_box()
    before = scroller.evaluate("(el) => [el.scrollLeft, el.scrollTop]")
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.wheel(0, 200)
    page.wait_for_timeout(300)
    after = scroller.evaluate("(el) => [el.scrollLeft, el.scrollTop]")
    check(after != before or scroller.evaluate("(el) => el.scrollHeight <= el.clientHeight"), "the wheel scrolls the drawing")
    check("Pinned" in caption(page) and entries(page) >= 1, "and moving it changes no subject")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_mode(page), "the Lean view takes the pane again")
    stack[-1] = (f"card {pick}", snapshot(page))

    print("References")
    wheel_to(page, 3000)
    page.wait_for_timeout(300)
    figure_link = page.evaluate(
        """() => {
          const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect();
          const links = [...document.querySelectorAll('.sheet__text a[href*="/@cite-"]')];
          const on = links.find((a) => { const b = a.getBoundingClientRect(); return b.top > pane.top + 30 && b.bottom < pane.bottom - 120; });
          if (!on) return null;
          on.setAttribute('data-journey', 'cite');
          return on.textContent;
        }"""
    )
    check(figure_link, f"a citation is on screen: {figure_link}")
    citation = page.locator('a[data-journey="cite"]')
    stack[-1] = (f"card {pick}, read on", snapshot(page))
    page.wait_for_timeout(250)
    spot = citation.evaluate("(a) => { const b = a.getClientRects()[0]; return [b.left + b.width / 2, b.top + b.height / 2]; }")
    for nudge in (6, 3, 0):
        page.mouse.move(spot[0] - nudge, spot[1])
        page.wait_for_timeout(100)
    wait_until(page, lambda: figure_link[:4] in reading_strip(page), "pointing at a citation previews it on the right page")
    was_top = top(page)
    page.mouse.click(spot[0], spot[1])
    wait_until(page, lambda: page.locator(".inset").count() == 1, "a click opens it under the paragraph")
    check(abs(top(page) - was_top) <= 200, "and the paper barely moves")
    check(page.locator(".inset__go").is_visible(), "the inset offers to go there")
    shot(page, shots, "05-inset")
    page.go_back()
    wait_until(page, lambda: page.locator(".inset").count() == 0, "Back closes it and stays on the paper")
    check(SLUG in address(page) and abs(top(page) - was_top) <= 1, "exactly where it was")
    page.go_forward()
    wait_until(page, lambda: page.locator(".inset").count() == 1, "Forward opens it again")
    page.wait_for_timeout(1100)
    page.locator(".inset__close").click()
    wait_until(page, lambda: page.locator(".inset").count() == 0, "and it closes")
    page.wait_for_timeout(300)
    stop_here("after the citation")

    print("Reference on screen flashes")
    done = page.evaluate(
        """() => {
          const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect();
          const inside = (el) => { const b = el.getBoundingClientRect(); return b.top >= pane.top && b.bottom <= pane.bottom; };
          for (const a of document.querySelectorAll('.sheet__text a[href*="/@"]:not(.nm):not(.pg)')) {
            const goal = /@(.+)$/.exec(a.getAttribute('href'))[1];
            const target = document.querySelector(`[id="${CSS.escape(goal)}"]`);
            if (target && inside(a) && inside(target)) { a.setAttribute('data-journey', 'flash'); return goal; }
          }
          return null;
        }"""
    )
    if done is None:
        place = page.evaluate(
            """() => {
              for (const a of document.querySelectorAll('.sheet__text a[href*="/@"]:not(.nm):not(.pg)')) {
                const goal = /@(.+)$/.exec(a.getAttribute('href'))[1];
                const target = document.querySelector(`[id="${CSS.escape(goal)}"]`);
                if (!target) continue;
                const gap = Math.abs(target.getBoundingClientRect().top - a.getBoundingClientRect().top);
                if (gap < 300) { a.setAttribute('data-journey', 'flash'); return [a.getBoundingClientRect().top - document.querySelector('[data-paper-pane]').getBoundingClientRect().top + document.querySelector('[data-paper-pane]').scrollTop, goal]; }
              }
              return null;
            }"""
        )
        check(place, f"a reference sits near its target: {place}")
        wheel_to(page, place[0] - 200)
        done = place[1]
    was_entries = entries(page)
    was_top = top(page)
    page.locator('a[data-journey="flash"]').click()
    wait_until(page, lambda: page.locator(".is-flash").count() > 0, f"a target already on screen flashes: {done}")
    check(entries(page) == was_entries and abs(top(page) - was_top) <= 1, "and nothing jumps")

    print("A section reference jumps, with a named Back")
    page.wait_for_timeout(300)
    # Reading on rewrites the entry it is in.
    stack[-1] = ("after the citation, read on", snapshot(page))
    label_before = page.evaluate("document.querySelector('.bar__where')?.textContent ?? ''")
    page.locator(".rail__item", has_text="Performance of Contextual").click()
    wait_until(page, lambda: "s-3.6" in address(page) or "@" in address(page), "the contents jump")
    wait_until(page, lambda: page.locator('.rail__item[aria-current="location"]').inner_text().startswith("3.6"), "and the contents follow")
    page.wait_for_timeout(1000)
    check(page.locator(".bar .back").is_visible(), f"Back is named: {page.locator('.bar .back').inner_text()} ({label_before})")
    stop_here("jumped to 3.6")

    print("Past the last tie")
    check("linked to this Lean" in caption(page), f"the caption says the Lean stops: {caption(page)}")
    check("After the last statement" in page.locator(".stepper").inner_text(), "the counter says so too")
    wait_until(page, lambda: page.locator(".proof__lean .untied").count() > 0 and "section 6.3" in page.locator(".proof__lean .untied").inner_text(),
               "the dock says what is and is not covered, in the paper's own scope")
    check("No Lean is linked to this paragraph" in page.locator(".proof__lean .untied h3").inner_text(), "in one plain line first")
    check("No Lean is linked to this paragraph" in page.locator(".fg__label").inner_text(), "and the graph keeps the statement before it, saying so")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: page.locator(".untied").count() > 0, "the open Lean says plainly that nothing here is in it")
    check("66 statements" in page.locator(".untied").inner_text(), "and where the statements are")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_mode(page), "and the graph comes back")
    page.wait_for_timeout(300)
    stack[-1] = ("jumped to 3.6", snapshot(page))
    shot(page, shots, "06-past-the-ties")

    print("Search")
    page.keyboard.press("Escape")
    page.locator(".reading").click(position={"x": 6, "y": 200})
    page.keyboard.press("/")
    check(page.evaluate("document.activeElement?.type") == "search", "slash starts a search")
    page.keyboard.type("evidently type-safe")
    page.wait_for_timeout(250)
    was_top = top(page)
    jumped_from = address(page)
    page.keyboard.press("Enter")
    wait_until(page, lambda: abs(top(page) - was_top) > 200, "Enter jumps to the match")
    wait_until(page, lambda: address(page) != jumped_from and "@b-" in address(page), f"the address follows the search, from {jumped_from}", timeout=3)
    moved_to = address(page)
    page.wait_for_timeout(300)
    page.locator(".rail__search input").fill("")
    page.locator(".rail__search input").press("Escape")
    page.wait_for_timeout(250)
    stop_here("search")

    print("The PDF")
    wheel_to(page, 120)
    page.wait_for_timeout(400)
    reading_top = top(page)
    stack[-1] = ("search, then scrolled", snapshot(page))
    page.locator(".switch button", has_text="PDF").click()
    wait_until(page, lambda: page.get_attribute(".page", "data-copy") == "pdf", "the left page turns to the PDF")
    page.wait_for_selector(".pdf__page canvas", state="attached")
    page.wait_for_timeout(1000)
    check(page.evaluate("getComputedStyle(document.querySelector('.pdf__page')).backgroundColor") != "", "the PDF is drawn")
    check("page-" in address(page), f"the PDF has an address: {address(page)}")
    stop_here("pdf")
    shot(page, shots, "07-pdf")
    page.locator(".switch button", has_text="Reading copy").click()
    wait_until(page, lambda: page.get_attribute(".page", "data-copy") == "reading", "and back to the reading copy")
    wait_until(page, lambda: abs(top(page) - reading_top) <= 1, f"at the same pixel, {reading_top:.0f}")
    page.wait_for_timeout(300)
    page.go_back()
    page.wait_for_timeout(300)

    print("Back through every step")
    for name, want in reversed(stack[:-1]):
        print(f" {name}")
        page.go_back()
        same(page, want, f"Back to {name}")

    print("Forward through every step")
    for name, want in stack[1:]:
        print(f" {name}")
        page.go_forward()
        same(page, want, f"Forward to {name}")

    print("Back by keys, and a reload in the middle")
    page.locator(".bar__title").click()
    page.keyboard.press("[")
    same(page, stack[-2][1], "[ goes back")
    page.keyboard.press("Alt+ArrowLeft")
    same(page, stack[-3][1], "Alt-Left goes back")
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(600)
    same(page, stack[-3][1], "a reload keeps it all")
    page.go_forward()
    same(page, stack[-2][1], "Forward still works after a reload")

    print("Keyboard")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@s-2", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(500)
    page.locator(".reading").focus()
    page.keyboard.press("j")
    page.wait_for_timeout(900)
    first = page.evaluate("document.activeElement?.dataset?.p ?? ''")
    check(first, f"j steps to a tied statement and focus goes with it: {first}")
    outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
    check(outline != "none", f"focus is visible: {outline}")
    page.keyboard.press("j")
    page.wait_for_timeout(900)
    second = page.evaluate("document.activeElement?.dataset?.p ?? ''")
    check(second and second != first, f"j again steps on: {second}")
    page.keyboard.press("k")
    page.wait_for_timeout(900)
    check(page.evaluate("document.activeElement?.dataset?.p ?? ''") == first, "k steps back")
    page.keyboard.press("Enter")
    wait_until(page, lambda: "Pinned" in caption(page), "Enter pins")
    page.keyboard.press("Escape")
    wait_until(page, lambda: "Pinned" not in caption(page), "Escape unpins")
    tied = page.evaluate("document.querySelectorAll('.sheet__text .q[tabindex=\"0\"]').length")
    check(tied >= 60, f"{tied} tied statements take keyboard focus")

    print("Exact lines")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@isoR-clam", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: page.locator(".source__line.is-exact").count() == 5, "a sentence about isoR's CLam case lights its five lines")
    wait_until(page, lambda: page.evaluate("""() => { const pane = document.querySelector('.leaf__body').getBoundingClientRect(); const row = document.querySelector('.source__line.is-exact').getBoundingClientRect(); return row.top >= pane.top && row.bottom <= pane.bottom; }"""), "and the Lean page scrolls to them")
    shot(page, shots, "08-exact")

    print("A pin holds until the reader lets it go")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@closed-world", wait_until="load")
    mark = page.locator('.sheet__text .q.is-active[data-p~="closed-world"]').first
    mark.wait_for(state="attached")
    mark.focus()
    page.keyboard.press("Enter")
    wait_until(page, lambda: "Pinned" in caption(page), "Enter pins the statement opened by the shared address")
    held = top(page)
    wheel_to(page, held + 1600)
    page.wait_for_timeout(400)
    check("Pinned" in caption(page) and address(page).endswith("@closed-world"), "scrolling away does not let go")
    page.locator(".proof__unpin").click()
    wait_until(page, lambda: "Pinned" not in caption(page), "Unpin does")
    page.wait_for_timeout(350)
    check(not lean_mode(page), "and the graph comes back")

    print("The address names the statement in hand")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@s-2", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(600)
    for _ in range(9):
        if "Statement 5 of 66" in page.locator(".stepper").inner_text():
            break
        page.keyboard.press("j")
        page.wait_for_timeout(450)
    wait_until(page, lambda: "Statement 5 of 66" in page.locator(".stepper").inner_text(), "five steps reach the second line of the code")
    wait_until(page, lambda: address(page).endswith("@code-ctx"), f"side-by-side code keeps the active line in the address: {address(page)}")
    held = address(page)
    page.goto("about:blank")
    page.goto(f"{url}{held}", wait_until="load")
    page.wait_for_selector(".sheet__text .q.is-active", state="attached")
    wait_until(page, lambda: "Statement 5 of 66" in page.locator(".stepper").inner_text() and lean_head(page) == "Ctx", "and that address opens that statement")

    print("The bar reads the statement in hand")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@proxytop-only-top", wait_until="load")
    page.wait_for_selector(".sheet__text .q.is-active", state="attached")
    wait_until(page, lambda: "Statement 15 of 66" in page.locator(".stepper").inner_text(), "a shared statement sets the counter")

    print("A figure link is an open")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@b-30", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(700)
    goal = page.evaluate("""() => {
      const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect();
      const links = [...document.querySelectorAll('.sheet__text a[href*="/@fig-"]')];
      const on = links.find((a) => { const b = a.getBoundingClientRect(); const t = document.getElementById(/@(.+)$/.exec(a.getAttribute('href'))[1]).getBoundingClientRect(); return b.top > pane.top + 20 && b.bottom < pane.bottom - 20 && (t.top < pane.top || t.bottom > pane.bottom); });
      if (!on) return links.length;
      on.setAttribute('data-journey', 'fig');
      return null;
    }""")
    if goal is not None:
        wheel_to(page, page.evaluate("""() => { const a = document.querySelector('.sheet__text a[href*="/@fig-"]'); const pane = document.querySelector('[data-paper-pane]'); a.setAttribute('data-journey', 'fig'); return a.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 500; }"""))
    was = entries(page)
    was_top = top(page)
    page.locator('a[data-journey="fig"]').click()
    wait_until(page, lambda: page.locator(".inset").count() == 1, "a figure link opens the figure in place")
    check(entries(page) == was + 1, f"with one history entry: {was} to {entries(page)}")
    wait_until(page, lambda: page.evaluate("""() => { const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect(); const b = document.querySelector('.inset').getBoundingClientRect(); return b.bottom <= pane.bottom && b.top >= pane.top; }"""), "figure and caption stand fully in view")
    shot(page, shots, "05-figure")
    page.wait_for_timeout(1100)
    page.go_back()
    wait_until(page, lambda: page.locator(".inset").count() == 0 and SLUG in page.url, "Back closes it and stays on the site")
    wait_until(page, lambda: abs(top(page) - was_top) <= 1, "at the same pixel")

    print("Messages come from the page")
    for block in ("@b-70", "@b-80"):
        page.goto("about:blank")
        page.goto(f"{url}#/{SLUG}/{block}", wait_until="load")
        page.wait_for_selector(".sheet__text .q", state="attached")
        page.wait_for_timeout(700)
        check("Before the first" not in caption(page), f"{block} is not before the first statement: {caption(page)}")
        reached = page.locator(".stepper span").inner_text()
        check(int(re.findall(r"\d+", reached)[0]) >= 4, f"and the counter knows how far: {reached}")

    print("No stray thread")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".fg__card", state="attached")
    page.locator(".rail__item", has_text="Modal Example").click()
    page.wait_for_timeout(1300)
    page.locator(".switch button", has_text="PDF").click()
    page.wait_for_selector(".pdf__page canvas", state="attached")
    page.wait_for_timeout(600)
    page.keyboard.press("j")
    page.wait_for_timeout(1500)
    start = page.evaluate("""() => { const p = document.querySelector('.threads path'); const d = p.getAttribute('d'); return p.style.opacity === '1' && d ? Number(d.slice(1).split(' ')[0]) : null; }""")
    left = page.locator("[data-paper-pane]").bounding_box()
    check(start is None or start > left["x"], f"a thread starts at the page's edge or not at all: {start}")
    check(page.evaluate("getComputedStyle(document.querySelector('.pdf')).outlineStyle") == "none" or page.evaluate("document.activeElement?.className !== 'pdf'"), "and the PDF has no box round it")

    print("Addresses")
    fresh = page.context.new_page()
    fresh.goto(f"{url}#/{SLUG}/closedWorld", wait_until="load")
    fresh.wait_for_selector(".decl")
    wait_until(fresh, lambda: lean_head(fresh) == "closedWorld", "a declaration's address opens it in a new tab")
    check(fresh.locator(".decl__axiom").is_visible(), "an axiom says it is assumed")
    wait_until(fresh, lambda: fresh.locator('.sheet__text .q.is-active[data-p~="closed-world"]').count() > 0, "and the paper goes to its statement")
    fresh.evaluate(f"location.hash = '#/{SLUG}/@isoL-statement'")
    wait_until(fresh, lambda: fresh.locator(".sheet__text .q.is-active").count() > 0 and address(fresh).endswith("@isoL-statement"), "changing only the hash in the same tab moves the page")
    fresh.go_back()
    wait_until(fresh, lambda: lean_head(fresh) == "closedWorld", "and Back undoes it")
    fresh.goto("about:blank")
    fresh.goto(f"{url}#/{SLUG}/@b-200", wait_until="load")
    fresh.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(fresh, lambda: top(fresh) > 500, "an address can name any block of the paper")
    fresh.goto("about:blank")
    fresh.goto(f"{url}#/{SLUG}/noSuchThing", wait_until="load")
    fresh.wait_for_selector(".badline")
    check("noSuchThing" in fresh.locator(".badline").inner_text(), "a bad address says so plainly")
    fresh.goto("about:blank")
    fresh.goto(f"{url}#/{SLUG}/@nowhere", wait_until="load")
    fresh.wait_for_selector(".badline")
    check("@nowhere" in fresh.locator(".badline").inner_text() or "nowhere" in fresh.locator(".badline").inner_text(), "so does a bad place")
    fresh.goto("about:blank")
    fresh.goto(f"{url}#/no-such-paper", wait_until="load")
    fresh.wait_for_selector(".lost")
    check("no paper" in fresh.locator(".lost").inner_text(), "and a bad paper")
    fresh.close()

    print("Every declaration")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@declarations", wait_until="load")
    page.wait_for_selector(".index table")
    rows = page.locator(".index tbody tr").count()
    check(rows == 22, f"the index lists {rows} declarations")
    check("closedWorld" in page.locator(".index").inner_text() and "sorry" in page.locator(".index").inner_text(), "and sums up the axioms")
    shot(page, shots, "09-index")

    print("Every way back lands in the same place")
    def at_rest(place: str) -> dict:
        page.goto("about:blank")
        page.goto(f"{url}#/{SLUG}/{place}", wait_until="load")
        page.wait_for_selector(".fg__card", state="attached")
        page.wait_for_timeout(600)
        page.keyboard.press("Escape")
        wait_until(page, lambda: not lean_mode(page), "at rest in Graph mode")
        page.wait_for_timeout(500)
        bring_mark(page)
        page.wait_for_timeout(300)
        return {"top": top(page), "camera": camera(page), "active": active(page)}

    def plain_statement() -> str:
        passage = visible_mark(page)
        check(passage, f"a statement to click: {passage}")
        spot = page.locator('[data-journey="mark"]').evaluate("(el) => { const b = el.getClientRects()[0]; return [b.left + Math.min(10, b.width / 2), b.top + b.height / 2]; }")
        page.mouse.click(spot[0], spot[1])
        wait_until(page, lambda: "Pinned" in caption(page) and lean_open(page), "clicking a statement shows its Lean above the graph")
        check(not lean_mode(page), "and the tab stays on Graph")
        return passage

    def rested(want: dict, how: str) -> None:
        wait_until(page, lambda: not lean_mode(page), f"{how} returns to Graph mode")
        wait_until(page, lambda: abs(top(page) - want["top"]) <= 1, f"{how}: the same paper position")
        wait_until(page, lambda: camera(page) == want["camera"], f"{how}: the same camera")
        check(active(page) == want["active"], f"{how}: the same highlight")
        check(page.locator('.mode-toggle button[aria-pressed="true"]').inner_text() == "Graph", f"{how}: the toggle says Graph")

    ways = {
        "browser Back": lambda: page.go_back(),
        "the bar's Back": lambda: page.locator(".bar .back").click(),
        "[": lambda: page.keyboard.press("["),
        "Esc": lambda: page.keyboard.press("Escape"),
        "Unpin": lambda: page.locator(".proof__unpin").click(),
    }
    for how, go in ways.items():
        want = at_rest("@s-3.3")
        before_entries = entries(page)
        plain_statement()
        check(entries(page) == before_entries + 1, "as one history entry")
        page.wait_for_timeout(300)
        go()
        rested(want, how)

    print("A wrong turn does the obvious thing")
    want = at_rest("@s-3.3")
    before_entries = entries(page)
    page.locator(".mode-toggle button", has_text="Graph").click()
    page.wait_for_timeout(250)
    check(entries(page) == before_entries and not lean_mode(page), "clicking Graph in Graph mode does nothing")
    plain_statement()
    wait_entries = entries(page)
    page.locator(".mode-toggle button", has_text="Lean").click()
    page.wait_for_timeout(250)
    check(entries(page) == wait_entries and "Pinned" in caption(page) and lean_mode(page), "Lean keeps the statement in hand and adds no entry")
    first = address(page)
    second = page.evaluate("""() => { const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect(); const here = document.querySelector('.q.is-pinned'); const q = [...document.querySelectorAll('.sheet__text .q')].find((el) => { const b = el.getClientRects()[0]; return b && b.top > pane.top + 20 && b.bottom < pane.bottom - 20 && !el.closest('pre') && !el.querySelector('a') && !el.closest('a') && el.dataset.p !== here?.dataset.p; }); if (!q) return null; q.setAttribute('data-journey', 'second'); const b = q.getClientRects()[0]; return [b.left + Math.min(10, b.width / 2), b.top + b.height / 2]; }""")
    check(second, "a second statement on screen")
    page.mouse.click(second[0], second[1])
    wait_until(page, lambda: address(page) != first, "opening a statement in Lean mode moves to it")
    check(entries(page) == wait_entries + 1 and lean_mode(page), "as one more entry")
    page.go_back()
    wait_until(page, lambda: address(page) == first and lean_mode(page), "Back returns to the first statement")
    page.go_back()
    rested(want, "Back twice")
    page.go_forward()
    wait_until(page, lambda: lean_mode(page), "Forward goes to the statement again")
    page.go_forward()
    wait_until(page, lambda: "Pinned" in caption(page) and address(page) != first, "and to the second")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_mode(page) and "Pinned" in caption(page), "Graph after two opens keeps the statement in hand")
    page.locator(".rail__item", has_text="Background").click()
    page.wait_for_timeout(1500)
    wheel_to(page, 5200)
    bring_mark(page)
    page.wait_for_timeout(300)
    jumped = top(page)
    check(abs(jumped - want["top"]) > 100, "a jump to another section")
    plain_statement()
    page.keyboard.press("Escape")
    wait_until(page, lambda: not lean_mode(page) and "Pinned" not in caption(page) and abs(top(page) - jumped) <= 1, "Escape with a pin goes back to where the click was")
    page.go_back()
    wait_until(page, lambda: SLUG in page.url and abs(top(page) - jumped) > 100, "and Back goes on to the place before, not out of the site")

    print("Lean mode with nothing opened")
    want = at_rest("@s-3.3")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_mode(page) and "Following" in caption(page), "Lean with nothing opened follows the text")
    box = page.locator(".proof__lean").bounding_box()
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: lean_mode(page), "the mode survives a reload")
    held = lean_quote(page)
    wheel_to(page, top(page) + 700)
    wait_until(page, lambda: lean_quote(page) != held, "and keeps following")
    page.locator(".rail__item", has_text="Performance of Contextual").click()
    wait_until(page, lambda: page.locator(".untied").count() > 0, "a stretch with no Lean says so in the pane")
    now = page.locator(".proof__lean").bounding_box()
    check(lean_mode(page) and abs(now["height"] - box["height"]) <= 1, "with no collapse")
    page.keyboard.press("g")
    wait_until(page, lambda: not lean_mode(page), "g switches to the graph")

    print("The handle and the choices")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(500)
    check(not lean_mode(page), "the page starts in the Graph view")
    handle = page.locator(".proof__handle")
    handle.click()
    page.wait_for_timeout(250)
    check(not lean_mode(page) and lean_open(page), "in the Graph view the handle is the divider below the dock: a click changes nothing")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_mode(page), "the Lean side of the toggle gives the Lean the pane")
    check(handle.count() == 0 and not page.locator(".proof__graph").is_visible(), "the Lean view fills the pane: no graph and no handle")
    reload(page)
    page.wait_for_selector(".fg__card", state="attached")
    page.wait_for_timeout(400)
    check(lean_mode(page), "the choice is remembered")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_mode(page), "and Graph goes back")
    page.locator(".proof__close").click()
    wait_until(page, lambda: page.locator(".proof").count() == 0, "the graph can be closed, and the paper has the desk")
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(400)
    check(page.locator(".proof__graph").is_visible(), "a reload restores the side-by-side view")
    page.locator(".proof__close").click()
    page.locator(".proof").wait_for(state="hidden")
    page.locator(".bar__open").click()
    wait_until(page, lambda: page.locator(".proof__graph").is_visible(), "and opens again")

    print("Night")
    open_site_menu(page).locator(".bar__theme").click()
    check(page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark" or page.evaluate("matchMedia('(prefers-color-scheme: dark)').matches"), "night is chosen")
    background = page.evaluate("getComputedStyle(document.querySelector('.reading')).backgroundColor")
    check(background != "rgb(255, 253, 248)", f"the reading copy is dark: {background}")
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    check(page.evaluate("getComputedStyle(document.querySelector('.reading')).backgroundColor") == background, "and remembered")
    page.wait_for_timeout(500)
    shot(page, shots, "10-night")
    page.locator(".switch button", has_text="PDF").click()
    page.wait_for_selector(".pdf__page", state="attached")
    check(page.evaluate("getComputedStyle(document.querySelector('.pdf__page')).backgroundColor") == "rgb(255, 253, 248)", "the PDF stays paper-coloured")
    open_site_menu(page).locator(".bar__theme").click()
    check(not errors, f"nothing went wrong in the console: {errors[:3]}")


def in_pane(page: Page, selector: str) -> bool:
    """The element is on screen inside the Lean page, below its sticky head."""
    return page.evaluate("""(sel) => {
      const el = document.querySelector(sel);
      const pane = document.querySelector('.proof__lean:not([hidden]) .leaf__body');
      if (!el || !pane) return false;
      const b = el.getBoundingClientRect(), p = pane.getBoundingClientRect();
      return b.height > 0 && b.top >= p.top && b.top < p.bottom - 20;
    }""", selector)


def fidelity(page: Page, url: str, shots: Path | None) -> None:
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    print(f"The paper and the Lean, at {page.viewport_size['width']}x{page.viewport_size['height']}")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@proven", wait_until="load")
    page.wait_for_selector(".stepline__caveat")
    page.wait_for_timeout(900)
    data = page.evaluate(f"fetch('{url}papers/{SLUG}/edition.json').then(r => r.json())")
    compared = [d for d in data["declarations"] if d.get("fidelity")]
    if not compared:
        held_paper(page, url, shots, errors)
        return
    claimed = [name for claim in data["claims"] for name in claim["lean"] if any(d["id"] == name for d in compared)]
    check(page.locator(".stepline__fid li").count() == len(claimed), "the claim shows one comparison line per compared declaration")
    no_overlaps(page)
    caveat = page.locator(".stepline__caveat").inner_text()
    check("How this page was made" in caveat and "compared what the two say" in caveat, "the step's caveat says the comparisons were made with AI and links to how the page was made")
    shot(page, shots, "40-claim-comparisons")

    words = {"same": "Says the same as the paper.", "stronger": "Says more than the paper.",
             "weaker": "Says less than the paper.", "different": "Says something different from the paper."}
    for d in compared:
        page.goto(f"{url}#/{SLUG}/{d['id']}", wait_until="load")
        block = f'.decl[data-decl="{d["id"]}"] .fid'
        page.wait_for_selector(block)
        page.wait_for_timeout(600)
        fid = page.locator(block)
        check(in_pane(page, block), f"{d['id']}'s comparison is on screen")
        check(fid.locator(".fid__verdict").inner_text() == words[d["fidelity"]["verdict"]], f"{d['id']}: {words[d['fidelity']['verdict']]}")
        check("Compared by AI" in fid.inner_text(), "labelled as compared by AI")
        for name in d["fidelity"]["checks"]:
            line = fid.locator(f'.fid__check[data-check="{name}"]')
            check(line.count() == 1 and "Lean accepted this proof" in line.inner_text(), f"it cites {name}, which Lean accepted")
            before = (entries(page), address(page))
            line.locator(".fid__fold").click()
            wait_until(page, lambda: line.locator(".fid__code").is_visible(), "a click opens the proof's code")
            check(name in line.locator(".fid__code").inner_text() and (entries(page), address(page)) == before, "in place, adding no history")
            line.locator(".fid__back").click()
            wait_until(page, lambda: line.locator(".fid__code").count() == 0, "Hide the proof closes it")
        shot(page, shots, f"41-{d['id']}")

    print("How this page was made")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".firstline--status")
    page.wait_for_timeout(600)
    link = page.locator(".firstline--status .made__link")
    check(link.is_visible() and link.inner_text() == "How this page was made", "the status line links to how the page was made")
    before = entries(page)
    link.click()
    page.wait_for_selector(".made")
    wait_until(page, lambda: address(page).endswith("@declarations"), "it opens the index, at its own address")
    check(entries(page) == before + 1, "as one history entry")
    made = page.locator(".made").inner_text()
    for phrase in ("text extracted from the authors’ PDF", "Lean’s own output", "made with AI", "have not reviewed", "the proof is shown with it"):
        check(phrase in made, f"it says: {phrase}")
    check(in_pane(page, ".made"), "and is on screen")
    if data.get("checks"):
        index = page.locator(".index").inner_text()
        check("Lean proofs written for this page" in index and "written for this page with AI" in index, "the index lists the Lean proofs written for this page")
        check(page.locator(".index__check").count() == len(data["checks"]), "each of them")
    shot(page, shots, "43-how-made")
    page.go_back()
    wait_until(page, lambda: not address(page).endswith("@declarations"), "Back leaves the index")
    check(not errors, f"nothing went wrong in the console: {errors[:3]}")


def no_overlaps(page: Page) -> None:
    overlaps = page.evaluate("""() => [...document.querySelectorAll('.sheet__text pre')].filter(pre => {
        const tops = [...pre.querySelectorAll('.cl')].map(l => l.getBoundingClientRect());
        return tops.some((r, i) => i > 0 && r.top < tops[i - 1].bottom - 1);
    }).map(pre => pre.textContent.slice(0, 40))""")
    check(not overlaps, f"no listing in the paper draws one line over another: {overlaps[:2]}")


def held_paper(page: Page, url: str, shots: Path | None, errors: list[str]) -> None:
    """A paper whose comparisons are held shows none, and says nothing of them."""
    check(page.locator(".stepline__fid").count() == 0 and page.locator(".fid").count() == 0, "a paper with comparisons held shows none")
    caveat = page.locator(".stepline__caveat").inner_text()
    check("How this page was made" in caveat and "comparison" not in caveat, "its caveat links to how the page was made, and mentions no comparisons")
    no_overlaps(page)
    shot(page, shots, "40-claim")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".firstline--status")
    page.wait_for_timeout(600)
    status = page.locator(".firstline--status").inner_text()
    check("comparison" not in status and status.startswith("The links from this paper to its proof in Lean, and the notes, were made with AI"), f"the status line mentions no comparisons: {status[:80]}")
    page.locator(".firstline--status .made__link").click()
    page.wait_for_selector(".made")
    made = page.locator(".made").inner_text()
    for words in ("text extracted from the authors’ PDF", "Lean’s own output", "made with AI", "have not reviewed"):
        check(words in made, f"how the page was made says: {words}")
    check("between the paper and the Lean" not in made and "Lean proof" not in made and page.locator(".index__check").count() == 0, "and nothing of comparisons with the Lean or proofs written for the page")
    shot(page, shots, "43-how-made")
    page.go_back()
    wait_until(page, lambda: not address(page).endswith("@declarations"), "Back leaves the index")
    check(not errors, f"nothing went wrong in the console: {errors[:3]}")


def phone(page: Page, url: str, shots: Path | None) -> None:
    print("Phone")
    above_sheet = """() => { const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect(); const b = document.querySelector('.q.is-active[data-p~="isoR-clam"]').getBoundingClientRect(); const sheet = document.querySelector('.proof').getBoundingClientRect(); return b.top >= pane.top && b.bottom <= pane.bottom && b.bottom <= sheet.top; }"""
    paper_top = "document.querySelector('[data-paper-pane]').scrollTop"

    # An emailed statement address, opened afresh: the sentence and its Lean at once.
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@isoR-clam", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: page.locator(".proof").count() == 1, "a fresh statement address opens the sheet")
    wait_until(page, lambda: lean_head(page) == "isoR", "on that statement's Lean", timeout=8)
    wait_until(page, lambda: page.locator(".proof .source__line.is-exact").count() == 5, "with its five Lean lines lit")
    page.wait_for_timeout(1200)
    check(page.evaluate(above_sheet), "and the followed sentence is in view above the sheet")
    check(page.locator(".proof__unpin").count() == 0, "the shared sentence opens without a pin")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "with no sideways scroll")
    check(address(page) == f"#/{SLUG}/@isoR-clam", "the address still names the statement")
    shot(page, shots, "20-phone-fresh-statement")
    before = page.evaluate(paper_top)
    page.locator(".proof__close").tap()
    wait_until(page, lambda: page.locator(".proof").count() == 0, "the sheet's Close closes it")
    page.wait_for_timeout(800)
    check(abs(page.evaluate(paper_top) - before) <= 2, "and leaves the paper where it was")
    check(page.locator(".q.is-pinned").count() == 0, "with nothing left pinned")

    # A declaration's address opens the sheet the same way.
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/isoR", wait_until="load")
    wait_until(page, lambda: page.locator(".proof").count() == 1, "a fresh declaration address opens the sheet")
    wait_until(page, lambda: lean_head(page) == "isoR", "on its Lean", timeout=8)

    # The bare paper address stays the paper alone.
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(1000)
    check(page.locator(".proof").count() == 0, "the bare paper address fills the screen with the paper")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "with no sideways scroll")
    shot(page, shots, "20-phone")
    page.locator('.sheet__text .q[data-p~="isoR-clam"]:not(:has(a))').last.tap()
    wait_until(page, lambda: page.locator(".proof").count() == 1, "tapping a tie opens the sheet")
    wait_until(page, lambda: lean_head(page) == "isoR", "with the same contents")
    page.wait_for_timeout(1200)
    check(page.evaluate("""() => { const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect(); const b = document.querySelector('.q.is-pinned').getBoundingClientRect(); return b.top >= pane.top && b.bottom <= pane.bottom; }"""), "and the statement stays in view above it")
    check(page.locator(".decl__code").first.bounding_box()["height"] > 20, "the Lean fills the sheet")
    shot(page, shots, "21-phone-sheet")
    page.go_back()
    wait_until(page, lambda: page.locator(".proof").count() == 0, "Back closes it")


    # Open a section from the paper, so Back joins the reading/PDF controls.
    # A direct statement link alone does not exercise this wider header state.
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.locator(".firstline button").first.tap()
    page.locator(".bar .back").wait_for(state="visible")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Back and the reading controls cause no sideways scroll")
    check(page.locator(".bar__column button").evaluate_all("""buttons => buttons.every(button => {
      const box = button.getBoundingClientRect();
      const bar = button.closest('.bar').getBoundingClientRect();
      return box.left >= 0 && box.right <= document.documentElement.clientWidth && box.bottom <= bar.bottom;
    })"""), "every phone header control fits inside the header")
    shot(page, shots, "22-phone-back-controls")
    page.go_back()
    wait_until(page, lambda: address(page) == f"#/{SLUG}", "Back still returns from the selected phone section")


def pdf_zoom(page: Page, url: str, shots: Path | None) -> None:
    width = page.viewport_size["width"]
    print(f"PDF zoom at {width}px")
    page.goto(f"{url}#/{SLUG}/@page-4", wait_until="load")
    controls = page.get_by_role("group", name="Zoom the PDF")
    controls.wait_for()
    paper = page.locator(".pdf[data-paper-pane]")
    pdf_page = paper.locator(".pdf__page").first
    pdf_page.wait_for(state="attached")
    level = controls.locator("output")
    before = pdf_page.evaluate("(el) => el.offsetWidth")
    check(level.inner_text() == "100%", "the PDF starts fitted to the text")
    check(
        controls.evaluate("""zoom => {
          const toolbar = zoom.closest('.bar__pdf-controls');
          const paper = document.querySelector('.pdf[data-paper-pane]');
          return toolbar?.querySelector('.stepper') && toolbar.querySelector('.switch')
            && zoom.getBoundingClientRect().bottom <= paper.getBoundingClientRect().top
            && zoom.getBoundingClientRect().right <= innerWidth;
        }"""),
        "zoom shares the toolbar with the linked passages and copy switch, above the paper",
    )
    controls.get_by_role("button", name="Zoom in").click()
    wait_until(page, lambda: level.inner_text() == "125%" and pdf_page.evaluate("(el) => el.offsetWidth") > before, "Zoom in increases both the percentage and the printed text")
    controls.get_by_role("button", name="Zoom out").click()
    wait_until(page, lambda: level.inner_text() == "100%", "Zoom out steps back")
    controls.get_by_role("button", name="Zoom in").click()
    controls.get_by_role("button", name="Fit text").click()
    wait_until(page, lambda: level.inner_text() == "100%" and pdf_page.evaluate("(el) => el.offsetWidth") == before, "Fit text restores the cropped width")
    check(address(page) == f"#/{SLUG}/@page-4", "zoom keeps the shared PDF address")
    shot(page, shots, f"classic-pdf-zoom-{width}")
    page.get_by_role("button", name="Reading copy").click()
    controls.wait_for(state="hidden")


def shared_links(page: Page, url: str) -> None:
    print("Shared links")
    start = f"{url}#/{SLUG}"
    for record, passage, declaration in (
        ("@isoR-clam", "isoR-clam", "isoR"),
        ("isomorphism", "proven", "isoL"),
        ("closedWorld", "closed-world", "closedWorld"),
    ):
        page.goto("about:blank")
        page.goto(f"{start}/{record}", wait_until="load")
        page.locator(f'.sheet__text .q.is-active[data-p~="{passage}"]').first.wait_for()
        wait_until(page, lambda: lean_head(page) == declaration, f"{record} shows its exact Lean")
        check("Following" in caption(page) and page.locator(".q.is-pinned").count() == 0, f"{record} opens in Auto")
        check(address(page) == f"#/{SLUG}/{record}", f"{record} keeps its address after landing")
        if record == "@isoR-clam":
            exact = page.locator(f'.sheet__text .q.is-active[data-p~="{passage}"]').first
            exact.focus()
            page.keyboard.press("Enter")
            wait_until(page, lambda: "Pinned" in caption(page), "selecting the same passage in the reader still pins it")
            page.go_back()
            wait_until(page, lambda: "Following" in caption(page), "Back restores the shared passage in Auto")

    before = top(page)
    length = entries(page)
    wheel_to(page, before + 1600)
    wait_until(page, lambda: address(page) != f"#/{SLUG}/closedWorld", "scrolling updates the shared declaration address")
    check("Pinned" not in caption(page), "scrolling from a shared declaration keeps Auto")
    page.get_by_role("button", name="Next", exact=True).click()
    wait_until(page, lambda: lean_head(page) and lean_head(page) != "closedWorld", "the next statement brings its own Lean")
    check(entries(page) == length, "following keeps the same history entry")

    page.goto("about:blank")
    page.goto(f"{start}/@s-2", wait_until="load")
    page.locator(".sheet__text").wait_for()
    wait_until(page, lambda: page.locator('.sheet__text [id="s-2"]').evaluate("(el) => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < innerHeight"), "the section is visible")
    page.wait_for_timeout(450)
    check(address(page) == f"#/{SLUG}/@s-2", "the initial scroll keeps the section address")

    page.goto("about:blank")
    page.goto(f"{start}/@page-4", wait_until="load")
    page.locator('.page[data-copy="pdf"] [data-paper-pane]').wait_for()
    wait_until(page, lambda: top(page) > 500, "the linked PDF page is visible")
    check(address(page) == f"#/{SLUG}/@page-4" and page.locator(".proof__unpin").count() == 0, "the PDF starts in Auto at the requested page")
    wheel_to(page, top(page) + 1600)
    wait_until(page, lambda: address(page) != f"#/{SLUG}/@page-4", "the PDF address follows as reading resumes")

    unlinked = "PCP.Algebraic.BinaryLocalCorrection.soundnessConstant"
    page.goto("about:blank")
    page.goto(f"{url}#/pcp-specialist/{unlinked}", wait_until="load")
    wait_until(page, lambda: lean_head(page) == unlinked, "an unlinked declaration shows its exact Lean")
    check(page.locator(".proof__unpin").count() == 0, "an unlinked declaration opens without a pin")
    page.get_by_role("button", name="Back to this paragraph’s steps").click()
    wait_until(page, lambda: lean_head(page) != unlinked, "the return control resumes following the paper")


def thread_follows_note(page: Page, url: str) -> None:
    """The note's disclosure can move a Lean row inside a pane of fixed height."""
    page.goto(f"{url}#/{SLUG}/@isoL-statement", wait_until="load")
    note = page.locator(".decl__note .note-credit summary").first
    endpoint = page.locator(".threads circle:last-child")
    geometry = """() => {
      const row = document.querySelector('.proof__lean .source__line.is-exact');
      const pane = row?.closest('.leaf__body');
      if (!pane || !row) return null;
      const r = row.getBoundingClientRect();
      const p = pane.getBoundingClientRect();
      const y = Math.max(p.top + 8, Math.min(p.bottom - 8, r.top + Math.min(11, r.height / 2)));
      return y - document.querySelector('.spread').getBoundingClientRect().top;
    }"""

    def attached() -> float | None:
        y = page.evaluate(geometry)
        cy = endpoint.get_attribute("cy")
        return y if y is not None and cy is not None and abs(y - float(cy)) < 0.5 else None

    wait_until(page, attached, "the thread reaches the highlighted Lean line")
    # Let the initial camera and pane geometry settle before testing the disclosure.
    page.wait_for_timeout(750)
    before = wait_until(page, attached, "the thread remains attached when idle")
    note.click()
    wait_until(page, lambda: (y := attached()) is not None and abs(y - before) > 8,
               "opening note credit moves the thread with its Lean line")
    note.click()
    wait_until(page, lambda: (y := attached()) is not None and abs(y - before) < 0.5,
               "closing note credit moves the thread back")


def monitors(page: Page, url: str, shots: Path | None, size: tuple[int, int]) -> None:
    w, h = size
    print(f"At {w}x{h}")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/isoR", wait_until="load")
    page.wait_for_selector(".decl")
    page.wait_for_timeout(1400)
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "no sideways scroll")
    graph, dock = page.locator(".proof__graph").bounding_box(), page.locator(".proof__lean").bounding_box()
    check(graph and dock and graph["y"] >= dock["y"] + dock["height"] - 2, "the drawing stays below the Lean at every width")
    box = page.locator(".proof").bounding_box()
    check(box["width"] >= 500, f"the right page is {box['width']:.0f}px wide")
    shot(page, shots, f"30-{w}")


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        pass  # the browser drops connections it no longer needs


class Quiet(http.server.SimpleHTTPRequestHandler):
    prefix = "/proof-reader/"

    def log_message(self, *args) -> None:
        pass

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            body = (Path(self.directory) / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def translate_path(self, path):
        if path.startswith(self.prefix):
            path = "/" + path[len(self.prefix):]
        else:
            path = "/__outside_the_base_path__"
        return super().translate_path(path)


def serve_forever(dist: Path, port: int) -> None:
    Server(("127.0.0.1", port), partial(Quiet, directory=str(dist))).serve_forever()


def serve(dist: Path) -> tuple[str, subprocess.Popen]:
    """The site from a process of its own: one inside Playwright's Python can stall."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = subprocess.Popen([sys.executable, __file__, "--serve", str(dist), "--port", str(port)])
    for _ in range(100):
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.05)
    return f"http://127.0.0.1:{port}/proof-reader/", server


def static_files(page: Page, url: str) -> None:
    print("Under the base path")
    for name, needle in (("llms.txt", "edition.json"), ("sitemap.xml", "<urlset"), (f"{SLUG}/index.html", "og:title"), ("og.png", ""), ("favicon.svg", "<svg"), ("plectis.svg", "<svg")):
        response = page.request.get(url + name)
        check(response.ok, f"{name} is served")
        if needle:
            check(needle in response.text(), f"{name} holds {needle}")
    response = page.request.get(url + "no/such/page")
    check(response.status == 404 and "nothing at this address" in response.text(), "a wrong address gets a useful 404")
    check("/proof-reader/" in response.text(), "whose links keep the base path")


def companions(page: Page, url: str, shots: Path | None) -> None:
    keep_proof_reader(page)
    width = page.viewport_size["width"]
    print(f"Companion navigation and reading layout at {width}px")
    exposition = f"{url}#/pcp-exposition"
    specialist = f"{url}#/pcp-specialist"
    full = f"{url}#/pcp-full-argument"
    page.goto(exposition, wait_until="load")
    page.locator(".sheet__text h1").wait_for()
    page.locator(".proof").get_by_role("button", name="Close", exact=True).click()
    page.locator(".proof").wait_for(state="hidden")

    def check_columns() -> None:
        rail = page.locator(".rail").bounding_box()
        paper = page.locator(".left").bounding_box()
        check(rail is not None and paper is not None and abs(paper["y"] - rail["y"]) <= 1
              and abs(paper["x"] - rail["x"] - rail["width"]) <= 1 and rail["width"] < width / 4,
              "with Graph closed, Contents and the article share a row")

    check_columns()
    column = page.locator(".sheet__text > p").first.bounding_box()["x"]
    check(all(abs(page.locator(f".sheet__text > {tag}").first.bounding_box()["x"] - column) < 2 for tag in ("h1", "h2")),
          "the title and first heading line up with the prose")
    shot(page, shots, f"pcp-reading-{width}")
    page.locator('.sheet__text a[href="./#/pcp-specialist"]').first.click()
    page.wait_for_url(f"{specialist}*")
    page.locator(".sheet__text h1").wait_for()
    check_columns()
    section = "42-the-standard-low-degree-test"
    link = page.locator(f'.sheet__text a[href="./#/pcp-full-argument/@{section}"]')
    # Clicking can scroll the link into view. Measure the origin at the click itself.
    link.evaluate("el => el.addEventListener('click', () => { window.companionSourceTop = el.closest('[data-paper-pane]').scrollTop; }, { once: true })")
    link.click()
    origin = page.evaluate("window.companionSourceTop")

    def at_heading() -> bool:
        if not page.url.startswith(full):
            return False
        heading = page.locator('.sheet__text [id="s-4.2"]')
        box = heading.bounding_box(timeout=500) if heading.count() else None
        pane = page.locator("[data-paper-pane]").bounding_box()
        return box is not None and pane is not None and pane["y"] <= box["y"] < pane["y"] + 150

    wait_until(page, at_heading, "the anchored companion opens at the standard low-degree test")
    page.go_back()
    page.wait_for_url(f"{specialist}*")
    page.locator(".sheet__text h1").wait_for()
    wait_until(page, lambda: abs(top(page) - origin) < 5, "Back restores the reading position in the specialist paper")
    page.go_back()
    page.wait_for_url(f"{exposition}*")
    page.locator(".sheet__text h1").wait_for()
    check_columns()
    page.goto(f"{full}#{section}", wait_until="load")
    wait_until(page, at_heading, "a previously shared double-hash link still opens the right section")

    page.goto(f"{full}/@declarations", wait_until="load")
    made = page.get_by_role("heading", name="How this page was made").locator("..").inner_text()
    check("Lean’s own output from modules compiled" in made and "were read from source" not in made,
          "the index says the declaration data is Lean's output from compiled modules")
    check("Proofs whose Lean reports list no axioms" not in page.locator(".index").inner_text(),
          "this mixed edition does not present unextracted proofs as free of axioms")
    table = page.locator(".index table").bounding_box()
    lean_pane = page.locator(".proof__lean .leaf__body").bounding_box()
    check(table["x"] + table["width"] <= lean_pane["x"] + lean_pane["width"],
          "the declaration index fits in the Lean pane with every column visible")

    page.goto(f"{full}/@file", wait_until="load")
    page.locator(".wholefile").wait_for()
    page.locator('.sheet__text a[href="./#/pcp-specialist"]').first.click()
    page.wait_for_url(f"{specialist}*")
    page.locator(".sheet__text h1").wait_for()
    page.go_back()
    page.wait_for_url(f"{full}/@file")
    check(page.locator(".proof").get_by_role("button", name="Whole file").get_attribute("aria-pressed") == "true",
          "the whole-paper link leaves the full argument, and Back restores the open Lean tab")

    page.goto(f"{full}/PCP.np_subset_pcp", wait_until="load")
    section_link = page.locator(".proof__lean a", has_text="The algebraic PCP theorem").first.inner_text()
    check(section_link.startswith("The algebraic PCP theorem"), "an unnumbered heading is displayed by title, without a section mark")

    # These two ordinary clicks failed in a reported live desktop session. Exercise
    # their actual links and the return positions, not only the exposition route.
    page.goto(full, wait_until="load")
    page.locator(".sheet__text h1").wait_for()
    link = page.locator('.sheet__text a[href="./#/pcp-specialist"]').first
    link.evaluate("el => el.addEventListener('click', () => { window.companionSourceTop = el.closest('[data-paper-pane]').scrollTop; }, { once: true })")
    before = entries(page)
    link.click()
    origin = page.evaluate("window.companionSourceTop")
    page.wait_for_url(f"{specialist}*")
    page.locator(".sheet__text h1").wait_for()
    check(entries(page) == before + 1, "the long paper's specialist link opens with one history entry")
    page.go_back()
    page.wait_for_url(f"{full}*")
    page.locator(".sheet__text h1").wait_for()
    wait_until(page, lambda: abs(top(page) - origin) < 5, "Back restores the long paper's source position")

    page.goto(specialist, wait_until="load")
    page.locator(".sheet__text h1").wait_for()
    link = page.locator('.sheet__text a[href="./#/pcp-full-argument/@45-bivariate-agreement"]')
    link.evaluate("el => el.addEventListener('click', () => { window.companionSourceTop = el.closest('[data-paper-pane]').scrollTop; }, { once: true })")
    before = entries(page)
    link.click()
    origin = page.evaluate("window.companionSourceTop")
    wait_until(page, lambda: page.url.startswith(full), "the bivariate link changes to the full-argument route")
    wait_until(page, lambda: (
        (box := page.locator('.sheet__text [id="s-4.5"]').bounding_box()) is not None
        and (pane := page.locator("[data-paper-pane]").bounding_box()) is not None
        and pane["y"] <= box["y"] < pane["y"] + 150
    ), "the specialist's bivariate link opens at the full argument's heading")
    check(entries(page) == before + 1, "the bivariate link opens with one history entry")
    page.go_back()
    page.wait_for_url(f"{specialist}*")
    page.locator(".sheet__text h1").wait_for()
    wait_until(page, lambda: abs(top(page) - origin) < 5, "Back restores the specialist's source position")


def narrow_header(page: Page, url: str, shots: Path | None) -> None:
    """A long history label stays in its column when Graph is closed."""
    print("Narrow reader header at 1363px")
    keep_proof_reader(page)
    page.goto(f"{url}#/pcp-exposition", wait_until="load")
    page.locator(".sheet__text h1").wait_for()
    items = page.locator(".rail__item")
    items.filter(has_text="The standard low-degree test and local correction").click()
    items.filter(has_text="The one-edge vanishing certificate in bits").click()
    page.locator(".proof__close").click()
    page.locator(".proof").wait_for(state="hidden")
    back = page.locator(".bar .back")
    check("The standard low-degree test and local correction" in back.inner_text(), "history keeps the full source-section Back label")
    back_box = back.bounding_box()
    title_box = page.locator(".bar__paper").bounding_box()
    check(back_box is not None and title_box is not None and back_box["x"] + back_box["width"] + 8 <= title_box["x"],
          "the Back label stays clear of the paper title")
    check(title_box["width"] >= 100, "the title keeps readable space")
    shot(page, shots, "pcp-narrow-header-1363")


def coupled_spring(page: Page, url: str) -> None:
    print("Coupled spring evidence follows the reading")
    paper = f"{url}#/coupled-spring"
    page.goto(f"{paper}/@cubic-local-minimum")
    cubic = page.locator(".leaf .step-proof")
    wait_until(page, lambda: cubic.count() == 2, "both cubic proofs are in the step")
    check(cubic.nth(0).locator(".fid__code").is_visible() and cubic.nth(1).locator(".fid__code").is_visible(),
          "both cubic proofs open to the Lean code")
    check(cubic.nth(0).locator(".step-proof__axioms[open]").count() == 0,
          "the axiom report stays collapsed until requested")
    cubic.nth(1).locator(".step-proof__summary").click()
    check(cubic.nth(0).locator(".fid__code").is_visible() and not cubic.nth(1).locator(".fid__code").is_visible(),
          "the reader can fold one proof without hiding the other")

    page.goto(f"{paper}/@strict-positivity")
    proof = page.locator('.leaf [data-check="couplingPotential_pos"]')
    proof.locator(".fid__code").wait_for()
    check("have h1sq" in proof.locator(".fid__code").inner_text(),
          "the equality argument opens the actual positivity proof")
    check(page.locator(".leaf .decl").count() == 0,
          "the supplementary proof is displayed without a Physlib declaration")

    page.goto(paper)
    reading = page.locator("[data-paper-pane]")
    reading.locator("#s-4").wait_for(state="attached")
    reading.hover()
    page.mouse.wheel(0, 20000)
    retained = page.locator('.leaf [data-check="couplingPotential_pos"]')
    wait_until(page, lambda: page.locator(".stepper span").inner_text() == "After the last statement",
               "the reader reaches the sources")
    check(retained.is_visible(), "the last linked proof stays visible while the reader is in the sources")
    check(page.locator(".leaf .untied, .leaf #checks").count() == 0,
          "the end of the page does not switch to the index")


def physlib_map(page: Page, url: str, shots: Path | None, mobile: bool) -> None:
    print(f"Physlib API map on {'phone' if mobile else 'desktop'}")
    address = f"{url}#/physlib-gauge-theory"
    page.goto(address + ("/@lean-9" if mobile else "/@p-82"))
    article = page.locator(".api-map article")
    pane = page.locator(".api-map__aside")
    cite = article.get_by_role("link", name="Lean citation 12", exact=True)
    structure = pane.locator('[data-lean-name="LocalGaugeData"]')
    evidence = pane.locator(".api-map__evidence")
    annotation = pane.locator(".api-map__annotation")
    windows = pane.locator(".api-map__windows")
    pane_graph = pane.locator("#pane-dependency-map")
    viewport = pane_graph.locator(".deps__figure--viewport")
    modes = pane.get_by_role("navigation", name="What the right pane shows")
    fitted = """(el) => {
      const stage = el.querySelector('.deps__stage')?.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      if (!stage || !stage.height || el.querySelectorAll('.deps__card').length !== 13) return false;
      return stage.width <= view.width && stage.height <= view.height
        && Math.abs((stage.left + stage.right - view.left - view.right) / 2) < 2
        && Math.abs((stage.top + stage.bottom - view.top - view.bottom) / 2) < 2;
    }"""
    if not mobile:
        annotation.get_by_role("heading", name="The product group and its central subgroup").wait_for()
        page.evaluate("document.fonts.ready")
        check(windows.evaluate("""(win) => {
          const [lean, graph] = win.children;
          const height = win.getBoundingClientRect().height;
          return lean.scrollHeight <= lean.clientHeight + 1 && graph.getBoundingClientRect().height > height * 0.4 + 8;
        }"""), "the dependency map takes the room left by the short reading note")
        wait_until(page, lambda: viewport.evaluate(fitted), "the whole dependency map fits and centres beneath a short note")
        page.goto(address + "/@lean-9")
    wait_until(page, lambda: annotation.is_visible() and structure.count() == 1,
               "a direct link opens the note for the Physlib structure")
    check(pane_graph.is_visible() and modes.count() == 0 and pane.get_by_role("button", name="Minimise graph").is_visible(),
          "the combined view opens both panes with one layout control")
    check(not structure.is_visible() and evidence.get_attribute("open") is None, "Lean starts folded")
    page.evaluate("document.fonts.ready")
    evidence.locator(":scope > summary").click()
    check(structure.is_visible(), "the fold opens the cited structure")
    wait_until(page, lambda: viewport.evaluate(fitted), "the whole map fits and centres again after the opened proof resizes its window")
    pane_graph.get_by_role("button", name="Inspect map").click()
    check(viewport.evaluate("(el) => el.querySelector('.deps__stage').getBoundingClientRect().height >= 1000"),
          "Inspect map shows the drawing at full size")
    check(windows.evaluate("""(win) => {
      const lean = win.children[0], graph = win.querySelector('.deps__figure--viewport');
      const share = lean.getBoundingClientRect().height / win.getBoundingClientRect().height;
      const leanTop = lean.scrollTop, graphTop = graph.scrollTop;
      lean.scrollTop = leanTop + 100;
      const leanMoved = lean.scrollTop > leanTop && graph.scrollTop === graphTop;
      const leanAfter = lean.scrollTop;
      graph.scrollTop = graphTop + 100;
      const graphMoved = graph.scrollTop > graphTop && lean.scrollTop === leanAfter;
      lean.scrollTop = leanTop;
      graph.scrollTop = graphTop;
      return Math.abs(share - 0.6) < 0.02 && leanMoved && graphMoved;
    }"""), "a long open proof uses up to 60 percent and both windows scroll independently")
    pane_graph.get_by_role("button", name="Fit map").click()
    wait_until(page, lambda: viewport.evaluate(fitted), "Fit map restores the whole centred map after inspection")
    check(article.get_by_role("link", name="Lean citation 9", exact=True).evaluate("""(link) => {
      const mark = link.getBoundingClientRect();
      const pane = link.closest(".reading").getBoundingClientRect();
      return mark.top >= pane.top && mark.bottom <= pane.bottom;
    }"""), "a direct link leaves its citation visible after fonts load")
    check(article.locator("[data-api-citation]").count() == 20,
          "the full page retains the 15 Lean citations and five prose references")
    paper = page.locator(".api-map .reading")
    cite.scroll_into_view_if_needed()
    left_top = paper.evaluate("(el) => el.scrollTop")
    cite.click()
    entries = pane.locator(".api-map__declaration")
    wait_until(page, lambda: entries.count() == 8, "citation 12 opens every indexed declaration")
    check(annotation.get_by_role("heading").inner_text() == "Repeated directions in an iterated derivative"
          and annotation.locator(".api-map__chip").count() >= 3 and annotation.locator(".katex").count() >= 2,
          "the citation has one passage note with backtick chips and KaTeX")
    check(annotation.get_by_role("link").get_attribute("href").endswith("API-map.md#L58-L62"),
          "the note links to the exact upstream passage")
    shot(page, shots, f"physlib-annotation-{'phone' if mobile else 'desktop'}")
    evidence.locator(":scope > summary").click()
    check(entries.first.get_by_role("heading").inner_text() == "Iterated formal derivative on Lie algebra jets"
          and entries.first.locator(".api-map__raw-name").inner_text() == "LocalGaugeData.iteratedDeriv",
          "the declaration leads with its glossary title and retains its exact Lean name")
    check(paper.evaluate("(el) => el.scrollTop") == left_top, "selecting a citation keeps the reading position")
    check(entries.evaluate_all("(cards) => cards.every((c) => c.querySelector('.api-map__note .katex'))"),
          "every declaration in the citation has a reading note with typeset formulas")
    credit = entries.first.locator(".api-map__note .note-credit")
    check(not credit.locator("p").is_visible(), "the reading note keeps its credit folded below the prose")
    credit.locator("summary").click()
    check("AI drafted" in credit.locator("p").inner_text(), "the reading note credit records its draft source")
    credit.locator("summary").click()
    copied_note = entries.first.locator(".api-map__note").evaluate("""(note) => {
      const formula = [...note.querySelectorAll('.katex')].find((k) =>
        k.querySelector('annotation')?.textContent.trim() === '\\\\partial_0 \\\\partial_0 \\\\partial_2');
      const range = document.createRange();
      range.selectNodeContents(formula.querySelector('.katex-html'));
      const selected = getSelection();
      selected.removeAllRanges();
      selected.addRange(range);
      const data = new DataTransfer();
      formula.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
      selected.removeAllRanges();
      return data.getData('text/plain');
    }""")
    check(copied_note == "∂₀ ∂₀ ∂₂", "a formula selected in a reading note copies as Unicode")
    check(cite.get_attribute("aria-expanded") == "true", "the related mark is selected in the article")
    shot(page, shots, f"physlib-gauge-theory-{'phone' if mobile else 'desktop'}")
    check("μs.foldl" in entries.first.get_by_label("Lean declaration", exact=True).inner_text(),
          "the folded source contains the exact Lean definition body")
    entries.first.get_by_role("button", name="View source at line 216").click()
    line = pane.locator('[data-line="216"].is-exact')
    wait_until(page, lambda: line.is_visible(), "the whole file opens at the indexed line")
    check("noncomputable def iteratedDeriv" in line.inner_text(), "the line contains the upstream Lean source")
    page.go_back()
    wait_until(page, lambda: page.url.endswith("/@lean-9") and annotation.is_visible() and structure.count() == 1,
               "Back restores the previous citation")
    check(paper.evaluate("(el) => el.scrollTop") == left_top, "Back restores the reading position")
    pane.get_by_role("button", name="Next citation").click()
    wait_until(page, lambda: page.url.endswith("/@lean-10"), "Next follows the citation order in the article")
    page.keyboard.press("k")
    wait_until(page, lambda: page.url.endswith("/@lean-9"), "the keyboard can step back one citation")
    pane.get_by_role("button", name="Glossary").click()
    check(pane.locator("[data-glossary-name] > button").count() == 42, "the glossary lists all 42 declarations")
    check(pane.locator(".api-map__references h2 button").count() == 15, "the glossary names all 15 citation numbers")
    if not mobile:
        leibniz = article.locator('[data-phrase-citation="lean-12"]').filter(has_text="iterated Leibniz rule")
        pane.locator('[data-glossary-name="LocalGaugeData.iteratedDeriv_bracket"]').hover()
        wait_until(page, lambda: "is-lit" in (leibniz.get_attribute("class") or ""),
                   "pointing at a glossary title lights its phrase in the map")
        check(leibniz.evaluate("(el) => getComputedStyle(el).getPropertyValue('--tone').trim()") ==
              pane.locator('.api-map__references > li[data-tone]').filter(has=page.get_by_role("button", name="Open Lean citation 12", exact=True))
              .evaluate("(el) => getComputedStyle(el).getPropertyValue('--tone').trim()"),
              "a phrase and its citation's glossary group share one colour")
        check(pane.locator(".api-map__topic-name").all_inner_texts() == ["Gauge group", "Potential and field strength", "Gauge transformations",
                                                                        "Local gauge data", "Iterated derivatives", "Morphisms"],
              "the glossary groups its citations under six physics topics")
        check(page.locator(".rail .api-map__topic-bars").count() == 3 and page.locator(".rail .api-map__key .api-map__topic").count() == 6,
              "the contents list marks three sections with topic colours above a six-topic key")
    glossary_credit = pane.locator(".api-map__reference-body > .note-credit")
    glossary_credit.locator("summary").click()
    check("AI to draft the reading titles" in glossary_credit.locator("p").inner_text(), "the glossary identifies the origin of the added titles")
    glossary_credit.locator("summary").click()
    pane.get_by_role("button", name=re.compile("Iterated Leibniz rule for the Lie bracket")).click()
    focused = pane.locator('[data-lean-name="LocalGaugeData.iteratedDeriv_bracket"]')
    wait_until(page, lambda: focused.evaluate("(el) => el === document.activeElement"),
               "a glossary result focuses the exact declaration in its citation group")
    formula = article.locator('[data-copy-math^="F_μν ="]').first
    formula.scroll_into_view_if_needed()
    copied = formula.evaluate("""(node) => {
      const range = document.createRange();
      range.selectNodeContents(node.querySelector(".katex-html"));
      const selected = getSelection();
      selected.removeAllRanges();
      selected.addRange(range);
      const data = new DataTransfer();
      node.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      selected.removeAllRanges();
      return data.getData("text/plain");
    }""")
    check(copied == "F_μν = ∂_μ A_ν − ∂_ν A_μ + ⁅A_μ, A_ν⁆", "selected KaTeX copies as the exact source Unicode")
    if page.context.browser.browser_type.name == "chromium":
        page.context.grant_permissions(["clipboard-read", "clipboard-write"])
        open_site_menu(page).get_by_role("button", name="Copy page").click()
        wait_until(page, lambda: page.get_by_role("status").get_by_text("Markdown copied").is_visible(),
                   "Copy page finishes writing the original Markdown")
        source = (ROOT / "api-maps" / "physlib-gauge-theory" / "API-map.md").read_text(encoding="utf-8")
        check(page.evaluate("navigator.clipboard.readText()") == source, "the clipboard contains the entire original Markdown")
    check(page.evaluate("document.documentElement.scrollWidth === innerWidth"), "the page fits the viewport")
    check(page.evaluate("""() => {
      const key = document.querySelector('.api-map__guide').getBoundingClientRect();
      const text = document.querySelector('#s-abstract').getBoundingClientRect();
      return Math.abs(key.left - text.left) < 1 && Math.abs(key.right - text.right) < 1;
    }"""), "the topic key lines up with the text column")
    abelian =article.get_by_role("heading", name="The abelian theory", exact=True)
    check(abelian.evaluate("(el) => parseFloat(getComputedStyle(el).fontSize) > parseFloat(getComputedStyle(el.nextElementSibling).fontSize) + 2"),
          "the subsection title is visibly larger than its prose")
    paragraph = article.locator("p[data-api-paragraph]").filter(has_text="For a multiset")
    paragraph.scroll_into_view_if_needed()
    paragraph.click(position={"x": 20, "y": 8})
    wait_until(page, lambda: pane.get_by_text("References in this paragraph", exact=True).is_visible(),
               "clicking ordinary prose opens the whole paragraph’s references")
    check(pane.locator("[data-reference]").evaluate_all("(items) => items.map(el => el.dataset.reference)") == ["lean-12", "lean-13"],
          "the paragraph shows both citation groups in their authored order")
    check(pane.locator(".api-map__declaration").count() == 9,
          "the paragraph shows the complete set of nine cited Lean declarations")
    check(paragraph.evaluate("""(node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selected = getSelection();
      selected.removeAllRanges();
      selected.addRange(range);
      const start = location.href;
      node.querySelector('[data-api-citation="lean-13"]').click();
      selected.removeAllRanges();
      return location.href === start;
    }"""), "selecting text in a cited paragraph does not open a reference")
    paragraph.get_by_role("link", name="Lean citation 13", exact=True).click()
    wait_until(page, lambda: page.url.endswith("/@lean-13") and pane.locator(".api-map__declaration").count() == 1,
               "clicking a numbered mark shows just that citation")
    page.go_back()
    wait_until(page, lambda: pane.locator("[data-reference]").count() == 2,
               "Back restores the paragraph view")
    abelian.locator("xpath=following-sibling::p[1]").get_by_role("link", name="Open references for this paragraph").click()
    evidence.locator(":scope > summary").click()
    wait_until(page, lambda: pane.locator('[data-reference="ref-1"] a').is_visible(),
               "the paragraph gutter opens a bibliography reference beside the Lean groups")
    check(pane.locator("[data-reference]").count() == 9,
          "a paragraph can collect prose references and Lean citations together")

    phrases = article.locator("[data-phrase]")
    check(phrases.count() == 33, "33 phrases in the map are matched to Lean declarations")
    named = set(phrases.evaluate_all("(items) => items.map(el => el.dataset.phraseCitation)"))
    check(named == {f"lean-{n}" for n in range(1, 16)}, "every Lean citation has at least one matched phrase")
    trivial = article.locator('[data-phrase]').filter(has_text="the trivial shift is the identity")
    trivial.scroll_into_view_if_needed()
    trivial.click()
    picked = pane.locator('[data-lean-name="Electromagnetism.ElectromagneticPotential.gaugeTransform_zero"]')
    wait_until(page, lambda: page.url.endswith("/@lean-7") and picked.evaluate("(el) => el === document.activeElement"),
               "clicking a phrase opens its citation at the declaration that states it")
    check("is-picked" in (pane.locator('[data-lean-name="Electromagnetism.ElectromagneticPotential.ofGradient_zero"]').get_attribute("class") or ""),
          "every declaration matched to the clicked phrase is marked")
    quote = picked.locator(".api-map__said-quote")
    check(quote.inner_text().strip() == "the trivial shift is the identity", "a declaration quotes the phrase it states")
    paper.evaluate("(el) => { el.scrollTop = 0; }")
    quote.click()
    wait_until(page, lambda: trivial.evaluate("""(el) => {
      const box = el.getBoundingClientRect(), pane = el.closest('.reading').getBoundingClientRect();
      return el.classList.contains('is-flash') && box.top >= pane.top && box.bottom <= pane.bottom;
    }"""), "a quoted phrase scrolls the map back to its place")
    check(page.url.endswith("/@lean-7"), "showing a phrase does not change the open citation")

    unlinked = article.locator("#p-87").get_by_role("link", name="Open references for this paragraph")
    unlinked.click()
    check(pane_graph.is_visible() and modes.count() == 0 and pane.get_by_role("button", name="Minimise graph").count() == 0,
          "the API map fills the pane when the selected passage has no linked Lean")
    cite.click()
    pane.get_by_role("button", name="Minimise graph").click()
    check(annotation.is_visible() and pane_graph.count() == 0 and modes.get_by_role("button", name="Lean", exact=True).get_attribute("aria-pressed") == "true",
          "Minimise graph keeps Lean visible and reveals the pane choices")
    unlinked.click()
    check(pane.get_by_text("This passage has no linked Lean.").is_visible() and pane_graph.count() == 0,
          "explicit Lean stays selected for the same passage")
    check(pane.get_by_role("button", name="Combine views").count() == 0, "an unlinked passage has no combine control")
    cite.click()
    check(annotation.is_visible() and modes.get_by_role("button", name="Lean", exact=True).get_attribute("aria-pressed") == "true",
          "explicit Lean follows a linked selection")
    modes.get_by_role("button", name="Graph", exact=True).click()
    check(pane_graph.is_visible() and annotation.count() == 0, "explicit Graph stays selected on a linked passage")
    unlinked.click()
    check(pane_graph.is_visible() and modes.get_by_role("button", name="Graph", exact=True).get_attribute("aria-pressed") == "true",
          "explicit Graph follows an unlinked selection")
    page.go_back()
    wait_until(page, lambda: page.url.endswith("/@lean-12") and pane_graph.is_visible(),
               "Back restores the selected citation and its explicit tab")
    modes.get_by_role("button", name="Auto", exact=True).click()
    check(annotation.is_visible() and pane_graph.count() == 0, "tabbed Auto follows linked passages with the note")
    pane.get_by_role("button", name="Combine views").click()
    check(annotation.is_visible() and pane_graph.is_visible() and modes.count() == 0,
          "Combine views restores the two windows and hides the pane choices")

    deps = page.locator("#dependency-map")
    menu = open_site_menu(page)
    menu.get_by_role("button", name="Dependency map", exact=True).click()
    check(not menu.is_visible(), "the site menu closes after opening the dependency map")
    full_fit = """(el, count) => {
      const drawing = el.querySelector('.deps__world');
      const view = el.getBoundingClientRect(), world = drawing.getBoundingClientRect();
      const scale = new DOMMatrixReadOnly(drawing.style.transform).a;
      return world.width > 0 && world.height > 0 && scale <= 1.15
        && world.left >= view.left && world.right <= view.right
        && world.top >= view.top && world.bottom <= view.bottom
        && el.querySelectorAll('.deps__card').length === count;
    }"""
    cards = deps.locator(".deps__figure .deps__card")
    wait_until(page, lambda: cards.count() == 13, "the dependency map shows Gauge theory and the 12 maps it reaches")
    article_graph = deps.locator(".deps__figure--viewport").first
    wait_until(page, lambda: article_graph.evaluate(full_fit, 13), "the complete inline dependency map fits its viewport")
    here = deps.locator('.deps__card[aria-current="page"]')
    check(here.count() == 1 and "Gauge theory" in here.inner_text(), "the current map is marked on the dependency map")
    lattice = deps.get_by_role("link", name=re.compile("^Lattice quantum field theory"))
    check(lattice.get_attribute("href") == "https://physlib.io/api-tracker#Physlib/LatticeQFT",
          "another map's card opens that map on physlib.io")
    check(lattice.bounding_box()["y"] < here.bounding_box()["y"], "a map that cites Gauge theory sits above it")
    check(deps.locator(".deps__line.is-mutual").count() >= 1, "two maps that cite each other share one dashed line")
    check(page.evaluate("""() => {
      const cards = [...document.querySelectorAll('#dependency-map .deps__figure .deps__card')].map((el) => el.getBoundingClientRect());
      return cards.every((a, i) => cards.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
    }"""), "no two cards on the dependency map overlap")
    if not mobile:
        lattice.hover()
        check(deps.locator(".deps__line.is-lit").count() >= 1, "pointing at a card lights its citations")
        page.mouse.move(2, 2)
    deps.get_by_role("button", name="See all 39 API maps in Physlib").click()
    dialog = page.get_by_role("dialog", name="All 39 API maps in Physlib")
    wait_until(page, lambda: dialog.locator(".deps__card").count() == 39, "the full view shows all 39 maps")
    check(dialog.evaluate("""(root) => [...root.querySelectorAll('.deps__card')].every((card) => {
      const box = card.getBoundingClientRect();
      return [...card.querySelectorAll('.deps__title, .deps__count')].every((el) =>
        el.getBoundingClientRect().right <= box.right + 0.5 && el.scrollWidth <= el.clientWidth + 1);
    })"""), "every card's title and claim count stay inside the card")
    full_graph = dialog.locator(".deps__figure--viewport")
    wait_until(page, lambda: full_graph.evaluate(full_fit, 39), "the full view fits all 39 maps")
    shot(page, shots, f"physlib-all-maps-{'phone' if mobile else 'desktop'}")
    check(dialog.get_by_role("button", name="Close").evaluate("(el) => el === document.activeElement"), "the full view starts on its Close button")
    size = page.viewport_size
    page.set_viewport_size({"width": size["width"], "height": size["height"] + 90})
    wait_until(page, lambda: full_graph.evaluate(full_fit, 39), "the fitted full view adapts to a taller viewport")
    full_graph.locator("xpath=..").get_by_role("button", name="Inspect map").click()
    full_graph.evaluate("(el) => el.scrollTo(70, 120)")
    manual = "(el) => [el.querySelector('.deps__world').style.transform, el.scrollLeft, el.scrollTop]"
    camera = full_graph.evaluate(manual)
    check(camera[0] == "scale(1)" and camera[2] > 0, "the full view supports manual zoom and pan")
    page.set_viewport_size(size)
    check(full_graph.evaluate(manual) == camera, "resizing keeps the manually positioned full map")
    full_graph.locator("xpath=..").get_by_role("button", name="Fit map").click()
    wait_until(page, lambda: full_graph.evaluate(full_fit, 39), "Fit map restores the full drawing")
    page.keyboard.press("Escape")
    wait_until(page, lambda: not dialog.is_visible(), "Escape closes the full view")
    check(page.evaluate("document.documentElement.scrollWidth === innerWidth"), "the page still fits the viewport")



GRAPH_PAGES = ["contextual-embeddings", "pcp-reading-guide", "pcp-full-argument", "pcp-specialist", "pcp-exposition"]
LINKED_PAGES = GRAPH_PAGES + ["coupled-spring", "smtlib-2-7", "physlib-gauge-theory"]

# Every linked thing a reader can click on a page: the marked passages of a reading copy (in
# prose, the abstract, front matter, lists, tables and captions; one per code block, whose
# lines are tied as a block), the passages drawn over a PDF, and Physlib's matched phrases.
CLICKABLES = """() => {
  const where = (el) => el.closest('pre') ? 'code' : el.closest('figcaption') ? 'caption' : el.closest('table') ? 'table'
    : el.closest('li') ? 'list' : el.closest('.inset') ? 'inset' : el.closest('blockquote') ? 'quote' : 'prose';
  const out = [];
  const blocks = new Set();
  document.querySelectorAll('.sheet__text .q[data-p], [data-phrase], .pdfpane .mark[data-passage], .pdf .mark[data-passage], [data-passage].mark').forEach((el) => {
    const pre = el.closest('pre');
    if (pre) { if (blocks.has(pre)) return; blocks.add(pre); }
    if (out.some((o) => o.el === el)) return;
    out.push({ el, where: where(el) });
  });
  window.__clickables = out.map((o) => o.el);
  return out.map((o) => o.where);
}"""

AIM = """(i) => {
  const el = window.__clickables[i];
  // Scroll only the paper's own pane: scrollIntoView would also shift clipped ancestors sideways.
  const pane = el.closest('[data-paper-pane], .reading');
  if (pane) {
    const r0 = el.getBoundingClientRect(), p0 = pane.getBoundingClientRect();
    pane.scrollTop += r0.top + r0.height / 2 - (p0.top + p0.height / 2);
  } else el.scrollIntoView({ block: 'center', behavior: 'instant' });
  // A point on the phrase itself: the first glyph where no other link inside it (a citation,
  // a figure) would take the click. A Lean name inside it counts: it opens that Lean.
  const own = (hit) => !!hit && (el.contains(hit) || hit.contains(el) || hit.closest('.q, [data-phrase], .mark') === el)
    && !(hit.closest('a:not(.nm)') && el.contains(hit.closest('a:not(.nm)')));
  const rects = [...el.getClientRects()].filter((b) => b.width > 2 && b.height > 2);
  for (const r of rects)
    for (let dx = Math.min(6, r.width / 2); dx < r.width; dx += 8) {
      const x = r.left + dx, y = r.top + r.height / 2;
      if (own(document.elementFromPoint(x, y))) return { x, y, reachable: true, text: el.textContent.trim().slice(0, 50) };
    }
  if (!rects.length) return null;
  const r = rects[0];
  return { x: r.left + Math.min(6, r.width / 2), y: r.top + r.height / 2, reachable: false, text: el.textContent.trim().slice(0, 50) };
}"""


def opened(page: Page, physlib: bool, slug: str = "") -> bool:
    # A phrase that is wholly a link to another page of the site goes there.
    if slug and f"#/{slug}" not in page.url:
        return True
    if physlib:
        return "/@lean-" in page.url and page.locator(".api-map__declaration").count() > 0
    return "Pinned" in page.evaluate("document.querySelector('.proof__says')?.textContent ?? ''")


def every_link_clicks(page: Page, url: str) -> dict[str, dict[str, int]]:
    keep_proof_reader(page)
    """Click every phrase and linked passage on every page with a real pointer; none opens nothing."""
    print("Every linked phrase and passage opens its Lean")
    # A phrase that is wholly a source link also opens that source in a new tab: close it.
    page.context.on("page", lambda popup: popup.close())
    report: dict[str, dict[str, int]] = {}
    only = [p for p in os.environ.get("JOURNEY_PAGES", "").split(",") if p]
    for slug in [p for p in LINKED_PAGES if not only or p in only]:
        physlib = slug.startswith("physlib")
        page.goto(f"{url}#/{slug}", wait_until="load")
        page.wait_for_timeout(1500)
        kinds = page.evaluate(CLICKABLES)
        dead: dict[str, int] = {}
        examples = []
        for i, kind in enumerate(kinds):
            aim = page.evaluate(AIM, i)
            if not aim:
                continue
            page.mouse.click(aim["x"], aim["y"])
            end = time.time() + 1.5
            while time.time() < end and not opened(page, physlib, slug):
                page.wait_for_timeout(30)
            if f"#/{slug}" not in page.url:
                page.goto(f"{url}#/{slug}", wait_until="load")
                page.wait_for_timeout(1200)
                page.evaluate(CLICKABLES)
                continue
            if not opened(page, physlib):
                dead[kind] = dead.get(kind, 0) + 1
                examples.append(f"{kind}: {aim['text']!r}{'' if aim['reachable'] else ' (covered)'}")
            page.keyboard.press("Escape")
            end = time.time() + 1.5
            while time.time() < end and opened(page, physlib):
                page.wait_for_timeout(30)
        counts: dict[str, int] = {}
        for kind in kinds:
            counts[kind] = counts.get(kind, 0) + 1
        report[slug] = {"clicked": len(kinds), "dead": sum(dead.values()), "examples": examples[:5]}
        print(f"    {slug}: {len(kinds)} clicked ({counts}), {sum(dead.values())} opened nothing {dead or ''} {examples[:3]}")
    # Every page is clicked through before any is judged, so one run counts them all.
    for slug, row in report.items():
        check(not row["dead"], f"every one of the {row['clicked']} linked phrases and passages on {slug} opens something"
              + (f"; dead: {row['examples']}" if row["dead"] else ""))
    return report


CARDS = r"""() => {
  const bad = []; let n = 0;
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  for (const card of document.querySelectorAll('.graph .card[data-record], .deps__card')) {
    const box = card.getBoundingClientRect();
    if (!box.width || getComputedStyle(card).visibility === 'hidden') continue;
    n++;
    const id = card.dataset.record ?? card.textContent.trim().slice(0, 30);
    const title = card.querySelector('.card__ctitle, .deps__title');
    const text = (title?.getAttribute('data-short') ?? title?.textContent ?? '').trim();
    if (title?.hasAttribute('data-short') || /…$/.test(text)) bad.push(`${id}: title cut to "${text}"`);
    // Up to a few pixels of glyph overhang is not a cut line.
    if (title && (title.scrollHeight > title.clientHeight + 4 || title.scrollWidth > title.clientWidth + 1)) bad.push(`${id}: title clipped`);
    for (const el of card.querySelectorAll('.card__ctitle, .card__craw, .deps__title, .deps__count')) {
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`${id}: "${el.textContent.trim().slice(0, 30)}" clipped`);
      const range = document.createRange();
      range.selectNodeContents(el);
      if ([...range.getClientRects()].some((r) => r.width && !inside(r, box))) bad.push(`${id}: "${el.textContent.trim().slice(0, 30)}" spills out of its card`);
    }
    if (text.split(/\s+/).length > 14) bad.push(`${id}: a sentence as its title: "${text.slice(0, 60)}"`);
  }
  return { n, bad };
}"""


def cards_fit(page: Page, label: str) -> None:
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(400)
    found = page.evaluate(CARDS)
    check(found["n"] > 0 and not found["bad"],
          f"{label}: all {found['n']} cards show their whole short title and nothing spills out" + (f"; {found['bad'][:4]}" if found["bad"] else ""))


def pane_rules(page: Page, label: str) -> None:
    """The shared rules of docs/graph-pane.md (tests/graph_pane_checks.py) in the pane's present state."""
    page.wait_for_timeout(450)
    failures = check_graph_pane(page, label, dock=".proof__lean") + check_groups(page, label)
    check(not failures, f"{label}: the graph pane keeps the rules of docs/graph-pane.md" + (f"; {failures[:3]}" if failures else ""))


def graph_mode(page: Page, url: str, shots: Path | None, size: tuple[int, int]) -> None:
    keep_proof_reader(page)
    """The Graph view on every graph page: the focus graph of the subject with the dock above it,
    following the paper, after a click on a sentence and after a click on a card. No click
    changes the view, and Escape returns to following the paper."""
    w, h = size
    print(f"The Graph view with its dock, {w}x{h}")
    for slug in GRAPH_PAGES:
        page.goto(f"{url}#/{slug}", wait_until="load")
        page.locator(".sheet__text").wait_for()
        page.wait_for_timeout(1200)
        if w < 600 and not page.locator(".proof").count():
            # On a phone the proof is a sheet the reader opens.
            page.locator(".bar__open").first.click()
        page.locator(".proof").wait_for()
        page.wait_for_timeout(600)
        if lean_mode(page):
            page.locator(".mode-toggle button", has_text="Graph").click()
        wait_until(page, lambda: page.locator(".proof[data-dock]").count() == 1, f"{slug}: the Graph view combines the Lean dock and drawing")
        if w < 600:
            # The small-screen summary belongs to the lazy graph, which can mount after the dock.
            page.locator(".graph[data-folded] .graph__strip").wait_for()
        panes = page.locator(".proof__panes").bounding_box()
        graph = page.locator(".proof__graph").bounding_box()
        dock = page.locator(".proof__lean").bounding_box()
        check(graph["y"] >= dock["y"] + dock["height"] - 2, f"{slug}: the drawing is below the Lean")
        if w < 600:
            check(graph["height"] <= 120,
                  f"{slug}: on a phone the graph folds to one line")
            check("uses" in page.locator(".graph__strip").inner_text(), f"{slug}: and the line counts what the subject uses")
        else:
            graph_limit = max(panes["height"] * 0.7, panes["height"] - 144)
            check(0 < graph["height"] <= graph_limit + 2,
                  f"{slug}: the drawing leaves a scrollable Lean dock")
        lean = page.locator(".proof__lean")
        wait_until(page, lambda: lean.is_visible() and len(lean.inner_text().strip()) > 40, f"{slug}: the dock is never empty while following")
        if w >= 600 and page.locator(".graph[data-whole]").count():
            # A paper that opens before its first linked statement shows the whole map, and keeps
            # it, under the same camera, while the reader scrolls the unlinked front matter.
            check(page.locator(".fg").count() == 0 and progress(page).startswith("Before the first"),
                  f"{slug}: before the first linked statement the graph is the whole map")
            page.locator(".graph .tree .tree__world").wait_for()
            page.wait_for_timeout(400)
            camera_now = lambda: page.locator(".graph .tree .tree__world").evaluate("(el) => el.style.transform")
            opened_at = camera_now()
            room = page.evaluate("""() => {
              const pane = document.querySelector('[data-paper-pane]:not([hidden])');
              const mark = pane.querySelector('.q[data-p]');
              return mark ? mark.getBoundingClientRect().top - pane.getBoundingClientRect().bottom : 0;
            }""")
            if room > 240:
                page.locator("[data-paper-pane]:not([hidden])").evaluate("(el) => { el.scrollTop += 200; }")
                page.wait_for_timeout(700)
                check(page.locator(".graph[data-whole]").count() == 1 and page.locator(".fg").count() == 0 and camera_now() == opened_at,
                      f"{slug}: scrolling the front matter keeps the whole map and its camera")
        if page.locator(".graph[data-whole]").count() or progress(page).startswith("Before the first"):
            # Next lands on the first linked statement; from there the graph follows the reading.
            page.keyboard.press("j")
            wait_until(page, lambda: progress(page).startswith("Statement 1 "), f"{slug}: Next reaches the first linked statement")
            if w >= 600:
                wait_until(page, lambda: page.locator(".fg__card.is-subject").count() > 0, f"{slug}: and the graph is drawn around it")
            wait_until(page, lambda: lean.is_visible() and len(lean.inner_text().strip()) > 40, f"{slug}: the dock still has its Lean")
            # The step scrolls smoothly: let the paper come to rest before aiming at it.
            settled = lambda: page.evaluate("""() => new Promise((done) => {
              const pane = document.querySelector('[data-paper-pane]:not([hidden])');
              const was = pane.scrollTop;
              setTimeout(() => done(Math.abs(pane.scrollTop - was) < 1), 600);
            })""")
            wait_until(page, settled, f"{slug}: the paper comes to rest on it")
        if w >= 600:
            pane_rules(page, f"{slug} at {w}x{h}, following")
        if slug == GRAPH_PAGES[0]:
            shot_to(page, shots, f"proofreader-graph-following-{w}")
        # A sentence click: it becomes the subject, its Lean is in the dock, the view stays on Graph.
        mark = page.locator(".sheet__text p .q[data-p]").filter(has_not=page.locator("a.nm")).nth(3)
        passage = mark.get_attribute("data-p").split(" ")[0]
        # Bring it to the upper part of the paper, clear of a phone's sheet.
        mark.evaluate("""(el) => {
          const pane = el.closest('[data-paper-pane]');
          const r0 = el.getBoundingClientRect(), p0 = pane.getBoundingClientRect();
          pane.scrollTop += r0.top - (p0.top + Math.min(160, p0.height * 0.2));
        }""")
        page.wait_for_timeout(300)
        aim = mark.evaluate("""(el) => {
          // Leading whitespace that wraps can leave an empty rectangle.
          const r = [...el.getClientRects()].find((rect) => rect.width > 0);
          return [r.left + Math.min(8, r.width / 2), r.top + r.height / 2];
        }""")
        page.mouse.click(*aim)
        wait_until(page, lambda: "Pinned" in caption(page) and page.url.endswith(f"@{passage}"), f"{slug}: a click pins the sentence")
        check(not lean_mode(page), f"{slug}: and the view stays on Graph")
        wait_until(page, lambda: lean.is_visible() and page.locator(".proof__lean .decl, .proof__lean .untied").count() > 0,
                   f"{slug}: its Lean is shown in the dock")
        if w >= 600:
            pane_rules(page, f"{slug} at {w}x{h}, after a click on a sentence")
            # A card click: it becomes the subject and the view stays on Graph.
            card = page.locator(".fg__card:not(.is-subject)").first
            if card.count():
                want = card.get_attribute("data-card")
                card.scroll_into_view_if_needed()
                card.click()
                wait_until(page, lambda: page.locator(f".fg__card.is-subject[data-card='{want}']").count() == 1, f"{slug}: a card click makes it the subject")
                check(not lean_mode(page), f"{slug}: and the view stays on Graph")
                pane_rules(page, f"{slug} at {w}x{h}, after a click on a card")
        if slug == GRAPH_PAGES[0] or slug == "pcp-full-argument":
            shot_to(page, shots, f"proofreader-graph-click-{slug}-{w}")
        page.keyboard.press("Escape")
        if w < 600:
            # On a phone the proof is a sheet over the paper, and Escape closes it, as Back does.
            wait_until(page, lambda: page.locator(".proof").count() == 0 or "Pinned" not in caption(page), f"{slug}: Escape lets go of the sentence")
            continue
        wait_until(page, lambda: "Pinned" not in caption(page), f"{slug}: Escape returns to following the paper")
        check(not lean_mode(page) and lean.is_visible(), f"{slug}: in the Graph view, with the dock following the paper")
        # The whole proof map is one button away, and a button brings the drawing back.
        page.locator(".graph__switch button", has_text="Whole proof map").click()
        wait_until(page, lambda: page.locator(".graph .tree .card[data-record]").count() > 0, f"{slug}: the whole proof map opens in the same place")
        tree = page.locator(".graph .tree")
        fit = """(el) => {
          const world = el.querySelector('.tree__world');
          if (!world?.style.transform) return false;
          const view = el.getBoundingClientRect();
          const scale = new DOMMatrixReadOnly(world.style.transform).a;
          const cards = [...world.querySelectorAll('.card[data-record]')];
          return cards.length > 1 && scale <= 1.15 && cards.every((card) => {
            const r = card.getBoundingClientRect();
            return r.left >= view.left && r.right <= view.right && r.top >= view.top && r.bottom <= view.bottom;
          });
        }"""
        wait_until(page, lambda: tree.evaluate(fit), f"{slug}: the whole drawing fits when opened")
        if slug == GRAPH_PAGES[0]:
            shot_to(page, shots, f"proofreader-whole-map-{w}")
            world = tree.locator(".tree__world")
            read_camera = lambda: world.evaluate("(el) => el.style.transform")
            initial = read_camera()
            size = page.viewport_size
            shorter = {"width": size["width"], "height": size["height"] - 90}
            page.set_viewport_size(shorter)
            wait_until(page, lambda: read_camera() != initial and tree.evaluate(fit), "a fitted whole map refits when resized")
            fitted = read_camera()
            page.get_by_role("button", name="Zoom in", exact=True).click()
            wait_until(page, lambda: read_camera() != fitted, "the whole map zoom control moves the camera")
            page.wait_for_timeout(450)
            zoomed = read_camera()
            page.set_viewport_size(size)
            page.wait_for_timeout(300)
            check(read_camera() == zoomed, "resizing preserves the manually zoomed camera")
            page.get_by_role("button", name="Fit", exact=True).click()
            wait_until(page, lambda: read_camera() != zoomed and tree.evaluate(fit), "Fit restores the complete map")
        page.locator(".graph__switch button", has_text="Around this step").click()
        wait_until(page, lambda: page.locator(".fg__card.is-subject").count() > 0, f"{slug}: and Around this step brings the drawing back")
    # The handle between the drawing and the dock moves, and its place is kept.
    if w >= 600:
        handle = page.locator(".proof__handle").bounding_box()
        page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + 5)
        page.mouse.down()
        page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + 120, steps=6)
        page.mouse.up()
        page.wait_for_timeout(300)
        kept = page.evaluate("JSON.parse(localStorage.getItem('proof-reader-pane-5')).dock")
        check(kept < 0.65, f"dragging the handle down gives Lean more room and saves the split ({kept:.2f})")
        page.reload()
        page.locator(".proof[data-dock]").wait_for()
        page.wait_for_timeout(600)
        panes = page.locator(".proof__panes").bounding_box()
        check(abs(page.locator(".proof__graph").bounding_box()["height"] / panes["height"] - kept) < 0.05, "and a reload keeps it")
        divider = page.get_by_role("separator", name="Resize the Lean and dependency graph")
        previous = float(divider.get_attribute("aria-valuenow"))
        divider.press("ArrowUp")
        wait_until(page, lambda: float(divider.get_attribute("aria-valuenow")) > previous,
                   "the up arrow enlarges the graph below the divider")
        divider.press("ArrowDown")
        wait_until(page, lambda: abs(float(divider.get_attribute("aria-valuenow")) - previous) <= 1,
                   "the down arrow restores the previous split")
        page.evaluate("localStorage.removeItem('proof-reader-pane-5')")


def graph_split(page: Page, url: str, size: tuple[int, int]) -> None:
    keep_proof_reader(page)
    page.goto(f"{url}#/pcp-specialist/PCP.Algebraic.GeneratorLowDegreeTest.exists_close", wait_until="load")
    graph = page.locator(".fg__scroll")
    graph.wait_for()
    page.evaluate("document.fonts.ready")
    panes = page.locator(".proof__panes")
    wait_until(page, lambda: panes.evaluate("""(p) => {
      const graph = p.querySelector('.proof__graph');
      const lean = p.querySelector('.proof__lean');
      const body = lean?.querySelector('.leaf__body');
      const note = body?.querySelector('.decl__note');
      if (!body || !graph || !note) return false;
      const top = body.getBoundingClientRect().top;
      const bottom = Math.max(top, ...[...body.children].map(child => child.getBoundingClientRect().bottom));
      const content = bottom - top + body.scrollTop + lean.clientHeight - body.clientHeight;
      const divider = p.querySelector('.proof__handle')?.offsetHeight ?? 0;
      const defaultGraph = p.clientHeight * .7;
      return content + divider <= p.clientHeight - defaultGraph + 2
        ? Math.abs(graph.clientHeight - defaultGraph) <= 2
        : graph.clientHeight < defaultGraph;
    }"""), "a sparse graph gives up only the space the Lean dock needs")
    check(panes.evaluate("""p => {
      const lean = p.querySelector('.proof__lean');
      const graph = p.querySelector('.proof__graph');
      const note = lean.querySelector('.decl__note');
      const code = note.closest('.decl').querySelector('.decl__code');
      const noteBox = note.getBoundingClientRect();
      const leanBox = lean.getBoundingClientRect();
      return (note.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING)
        && noteBox.top >= leanBox.top - 1 && noteBox.top < leanBox.bottom
        && noteBox.bottom <= code.getBoundingClientRect().top + 1
        && leanBox.bottom <= graph.getBoundingClientRect().top + 1;
    }"""), "the annotation opens above the code, with the dependency graph below the Lean dock")
    world = graph.locator(".fg__world")
    transform = lambda: world.evaluate("(el) => el.style.transform")
    subject = graph.locator(".fg__card.is-subject")
    chosen = subject.get_attribute("data-card")
    page.get_by_role("button", name="Zoom in", exact=True).click()
    zoomed = transform()
    graph.press("ArrowRight")
    panned = transform()
    check(panned != zoomed, "the graph's arrow key pans")
    page.set_viewport_size({"width": size[0], "height": size[1] + 80})
    page.wait_for_timeout(300)
    check(subject.get_attribute("data-card") == chosen and transform() == panned,
          "keyboard panning keeps the reading position and the camera survives a resize")


def physlib_cards(page: Page, url: str, shots: Path | None, size: tuple[int, int]) -> None:
    print(f"Gauge theory dependency map cards, {size[0]}x{size[1]}")
    page.goto(f"{url}#/physlib-gauge-theory", wait_until="load")
    deps = page.locator("#dependency-map")
    deps.scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    cards_fit(page, f"Gauge theory dependency map at {size[0]}x{size[1]}")
    shot_to(page, shots, f"proofreader-physlib-deps-{size[0]}")
    phrase = page.locator("[data-phrase]").first
    phrase.scroll_into_view_if_needed()
    phrase.click()
    page.wait_for_timeout(600)
    shot_to(page, shots, f"proofreader-physlib-phrase-{size[0]}")


def shot_to(page: Page, folder: Path | None, name: str) -> None:
    if folder:
        page.screenshot(path=str(folder / f"{name}.png"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", help="a running site, ending in /")
    parser.add_argument("--dist", type=Path, default=ROOT / "web" / "dist")
    parser.add_argument("--shots", type=Path)
    parser.add_argument("--only", choices=("journey", "fidelity", "sizes", "companions", "coupled-spring", "physlib", "rules", "shared-links", "pdf-zoom"))
    parser.add_argument("--browser", choices=("chromium", "firefox", "webkit"), default="chromium")
    parser.add_argument("--serve", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--port", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve:
        serve_forever(args.serve, args.port)
        return 0
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    server = None
    url = args.url
    if not url:
        url, server = serve(args.dist)
    started = time.time()
    try:
        with sync_playwright() as playwright:
            browser = getattr(playwright, args.browser).launch()
            if args.only in (None, "rules"):
                context = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
                if not os.environ.get("JOURNEY_SKIP_CLICKS"):
                    every_link_clicks(context.new_page(), url)
                context.close()
                for w, h in ((2560, 1440), (1440, 900), (390, 844)):
                    context = graph_first(browser.new_context(viewport={"width": w, "height": h}, has_touch=w < 600, is_mobile=w < 600 and args.browser != "firefox"))
                    graph_mode(context.new_page(), url, args.shots, (w, h))
                    if w >= 600:
                        graph_split(context.new_page(), url, (w, h))
                        physlib_cards(context.new_page(), url, args.shots, (w, h))
                    context.close()
            if args.only in (None, "coupled-spring"):
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                coupled_spring(context.new_page(), url)
                context.close()
            if args.only in (None, "physlib"):
                for w, h in ((1440, 900), (390, 844)):
                    context = browser.new_context(viewport={"width": w, "height": h})
                    physlib_map(context.new_page(), url, args.shots, mobile=w < 900)
                    context.close()
            if args.only in (None, "pdf-zoom"):
                for w, h in ((1440, 900), (2560, 1440), (390, 844)):
                    context = browser.new_context(viewport={"width": w, "height": h}, has_touch=w < 600)
                    pdf_zoom(context.new_page(), url, args.shots)
                    context.close()
            if args.only in (None, "shared-links"):
                context = graph_first(browser.new_context(viewport={"width": 1440, "height": 900}))
                shared_links(context.new_page(), url)
                context.close()
                context = browser.new_context(viewport={"width": 2560, "height": 1440})
                thread_follows_note(context.new_page(), url)
                context.close()
            if args.only in (None, "journey"):
                context = browser.new_context(viewport={"width": 1440, "height": 790})
                opening(context.new_page(), url)
                context.close()
                context = browser.new_context(viewport={"width": 1440, "height": 790})
                reopen_proof(context.new_page(), url)
                context.close()
                context = browser.new_context(viewport={"width": 1440, "height": 790})
                graph_follows(context.new_page(), url, args.shots)
                context.close()
                context = graph_first(browser.new_context(viewport={"width": 1440, "height": 790}))
                journey(context.new_page(), url, args.shots)
                context.close()
            if args.only in (None, "journey", "fidelity"):
                for w, h in ((1440, 900), (1280, 800)):
                    context = graph_first(browser.new_context(viewport={"width": w, "height": h}))
                    fidelity(context.new_page(), url, args.shots / f"{w}" if args.shots else None)
                    context.close()
            if args.only in (None, "sizes"):
                for size in PAIRS:
                    context = graph_first(browser.new_context(viewport={"width": size[0], "height": size[1]}))
                    monitors(context.new_page(), url, args.shots, size)
                    context.close()
                context = graph_first(browser.new_context(viewport={"width": 1024, "height": 768}))
                tablet(context.new_page(), url, args.shots)
                context.close()
                context = graph_first(browser.new_context(viewport={"width": PHONE[0], "height": PHONE[1]}, has_touch=True, is_mobile=args.browser != "firefox"))
                phone(context.new_page(), url, args.shots)
                context.close()
                if server:
                    context = browser.new_context()
                    static_files(context.new_page(), url)
                    context.close()
            if args.only in (None, "companions"):
                for w, h in ((1440, 790), (1920, 953)):
                    context = graph_first(browser.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce"))
                    companions(context.new_page(), url, args.shots)
                    context.close()
                context = graph_first(browser.new_context(viewport={"width": 1363, "height": 936}, reduced_motion="reduce"))
                narrow_header(context.new_page(), url, args.shots)
                context.close()
            browser.close()
    except Stop as failure:
        print(f"\nFAILED: {failure}")
        print(f"{checks} checks passed before it.")
        return 1
    finally:
        if server:
            server.terminate()
    print(f"\nJourney complete: {checks} checks passed in {time.time() - started:.0f}s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
