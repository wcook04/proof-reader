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

ROOT = Path(__file__).resolve().parent.parent
SLUG = "contextual-embeddings"
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


def address(page: Page) -> str:
    return page.evaluate("location.hash")


def entries(page: Page) -> int:
    return page.evaluate("history.length")


def camera(page: Page) -> str:
    return page.evaluate("document.querySelector('.tree__world')?.style.transform ?? ''")


def lean_head(page: Page) -> str:
    """The raw name of the declaration on show, when the Lean is open."""
    block = page.locator(".proof__lean:not([hidden]) .decl")
    return block.first.get_attribute("data-decl") if block.count() else ""


def lean_open(page: Page) -> bool:
    return page.locator(".proof__lean").is_visible()


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
        "tab": page.evaluate("document.querySelector('.leaf__tabs button[aria-pressed=true]')?.textContent ?? ''"),
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
    check(have["camera"] == want["camera"], f"{label}: the graph's camera is where it was")


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
    page.wait_for_selector(".card")
    page.wait_for_timeout(700)
    check("Contextual Embeddings" in page.title(), f"the tab names the paper: {page.title()}")
    check(page.locator(".firstline--status").is_visible() and page.locator(".firstline--status").bounding_box()["y"] < page.locator(".sheet__text h1").bounding_box()["y"], "the status line stands above the title")
    check("not been reviewed by the authors" in page.locator(".firstline--status").inner_text(), "and says who made the links")
    check(page.locator(".firstline").last.is_visible(), "the first screen says what to do")
    check("Statements with a mark" in page.locator(".firstline").last.inner_text(), "in plain words")
    check("Before the first statement" in caption(page), f"the caption says where the ties are: {caption(page)}")
    check(page.locator(".proof__graph").is_visible() and not lean_open(page), "at rest the right page is the graph, and the Lean waits")
    check(page.locator(".skip").count() == 1, "there is a skip link")
    shot(page, shots, "01-arrive")

    print("The family")
    home = page.locator(".fam-lockup__home")
    check(home.get_attribute("href") == "https://wcook04.github.io/", "the plait links home")
    check(home.locator("img").get_attribute("alt") == "Will Cook: all websites and films", "with the family's accessible name")
    check(home.locator("img").evaluate("(img) => img.complete && img.naturalWidth > 0"), "and its picture loads from this site")
    check(page.locator(".bar").bounding_box()["height"] <= 47, "the header keeps its height")
    foot = page.locator(".foot .fam-sites").first
    check(foot.count() == 1 and "All websites and films" in foot.text_content() and "Plectis Atlas" in foot.text_content(), "the end of the paper lists the sister sites")
    check(foreign == [], f"nothing is asked of another host: {foreign[:2]}")
    page.goto(url, wait_until="load")
    page.wait_for_selector(".shelf li a")
    check(page.locator(".fam-lockup__home").get_attribute("href") == "https://wcook04.github.io/", "the front page has the lockup too")
    check(page.locator(".shelf__foot .fam-sites__list li").count() == 7, "and the sister sites")
    page.locator(".shelf li a").first.click()
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".card")
    page.wait_for_timeout(700)

    print("Read")
    base_entries = entries(page)
    wheel_to(page, 5200)
    wait_until(page, lambda: "Following the paper" in caption(page), "scrolling follows without a click")
    check(page.locator(".sheet__text .q.is-active").count() > 0, "the statement under the line takes the highlighter")
    check(page.locator('.card[data-trail="here"], .vocab .is-lit').count() > 0, "its card lights on the graph")
    check(not lean_open(page), "the Lean stays closed while reading")
    wait_until(page, lambda: address(page).endswith(page.evaluate("document.querySelector('.q.is-active').dataset.p.split(' ')[0]")), "the address keeps up with the sentence")
    check(entries(page) == base_entries, "following adds no history")
    shot(page, shots, "02-following")
    before = top(page)
    held = address(page)
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: abs(top(page) - before) <= 1, f"a reload lands on the same pixel, {before:.0f}")
    check(address(page) == held, "and the same address")
    page.wait_for_selector(".card")
    page.wait_for_timeout(500)
    wait_until(page, lambda: "Following the paper" in caption(page), "and follows from there")

    print("Hover")
    other = visible_mark(page)
    check(other is not None, f"a second statement is on screen: {other}")
    was_top = top(page)
    was_entries = entries(page)
    target = page.locator('[data-journey="mark"]')
    box = target.evaluate("(el) => { const b = el.getClientRects()[0]; return { x: b.left, y: b.top, width: b.width, height: b.height }; }")
    page.mouse.move(box["x"] + 8, box["y"] + 6)
    check("pointer" == target.evaluate("(el) => getComputedStyle(el).cursor"), "the pointer says it can be clicked")
    wait_until(page, lambda: "It has Lean" in page.locator(".proof__reading").inner_text(), "a dwell names it in plain words under the graph")
    check(abs(top(page) - was_top) <= 1 and entries(page) == was_entries and not lean_open(page), "pointing moves nothing and adds no history")
    shot(page, shots, "03-point")
    page.mouse.move(box["x"] + 6, 20)
    wait_until(page, lambda: "It has Lean" not in page.locator(".proof__reading").inner_text(), "leaving restores")

    print("Lean mode, chosen on the toggle")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_open(page) and lean_head(page), "one click opens the Lean")
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
    wait_until(page, lambda: not lean_open(page), "the Graph side of the toggle goes back to the graph")
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
    check(lean_open(page) and lean_head(page), "the click expands it into the raw Lean")
    check(page.locator(".proof__graph").bounding_box()["height"] < 2, "the Lean has the whole pane")
    check(page.locator('.mode-toggle button[aria-pressed="true"]').inner_text() == "Lean", "and the toggle says Lean")
    check(page.locator(".crumbs a").count() > 0, "breadcrumbs say where the paper has it")
    check(abs(top(page) - was_top) <= 2, "the paper does not move")
    check(page.locator(".bar .back").is_visible(), "a named Back appears")
    print("    back says:", page.locator(".bar .back").inner_text())
    page.wait_for_timeout(250)
    stop_here("pinned sentence")

    print("Walk the Lean")
    link = page.locator(".leaf__body a.source__ref, .leaf__body a.declname").first
    was_top = top(page)
    link.hover()
    raw = link.evaluate("(a) => (a.querySelector('code')?.textContent ?? a.textContent).trim()")
    wait_until(page, lambda: raw in page.locator(".proof__reading").inner_text(), f"pointing at {raw} says its signature on the right page")
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

    print("Pull the graph down")
    handle = page.locator(".proof__handle").bounding_box()
    page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + 5)
    page.mouse.down()
    page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + 240, steps=6)
    page.mouse.up()
    wait_until(page, lambda: page.locator(".proof__graph").bounding_box()["height"] > 150, "the handle draws the graph down above the Lean")
    page.wait_for_timeout(350)

    print("Click a card")
    stack[-1] = (stack[-1][0], snapshot(page))
    cards = page.locator('.card[data-record="isoR"]')
    check(cards.count() > 0, "the graph holds isoR")
    if not cards.first.is_visible():
        raise Stop("isoR's card is not visible")
    was_top = top(page)
    cards.first.click()
    wait_until(page, lambda: lean_head(page) == "isoR", "the Lean opens at the card")
    check(address(page).endswith("/isoR"), "the address names it")
    wait_until(page, lambda: abs(top(page) - was_top) > 100, "the paper goes to the statement")
    page.wait_for_timeout(1100)
    check(page.evaluate("""() => { const canvas = document.querySelector('.graph__canvas').getBoundingClientRect(); const b = document.querySelector('.card[data-record="isoR"]').getBoundingClientRect(); return b.top >= canvas.top && b.bottom <= canvas.bottom; }"""), "its card stands in the band above the Lean")
    check("Pinned" in caption(page), "it is pinned")
    stop_here("card isoR")
    shot(page, shots, "04-card")

    print("Move the graph")
    canvas = page.locator(".graph__canvas").bounding_box()
    page.mouse.move(canvas["x"] + 30, canvas["y"] + canvas["height"] - 20)
    page.mouse.down()
    page.mouse.move(canvas["x"] + 90, canvas["y"] + canvas["height"] - 50, steps=6)
    page.mouse.up()
    wait_until(page, lambda: page.locator(".graph__paused").count() > 0, "moving the graph pauses following, and says so")
    page.locator(".graph__paused button").click()
    wait_until(page, lambda: page.locator(".graph__paused").count() == 0, "one click resumes it")

    page.locator(".proof__handle").click()
    wait_until(page, lambda: page.locator(".proof__graph").bounding_box()["height"] < 2, "a click on the handle gives the Lean the pane again")
    stack[-1] = ("card isoR", snapshot(page))

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
    stack[-1] = ("card isoR, read on", snapshot(page))
    page.wait_for_timeout(250)
    spot = citation.evaluate("(a) => { const b = a.getClientRects()[0]; return [b.left + b.width / 2, b.top + b.height / 2]; }")
    for nudge in (6, 3, 0):
        page.mouse.move(spot[0] - nudge, spot[1])
        page.wait_for_timeout(100)
    wait_until(page, lambda: figure_link[:4] in page.locator(".proof__reading").inner_text(), "pointing at a citation previews it on the right page")
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
    check("is in this Lean" in caption(page), f"the caption says the Lean stops: {caption(page)}")
    check("After the last statement" in page.locator(".stepper").inner_text(), "the counter says so too")
    check("section 6.3" in page.locator(".proof__reading").inner_text(), "and what is and is not covered, in the paper's own scope")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: page.locator(".untied").count() > 0, "the open Lean says plainly that nothing here is in it")
    check("66 statements" in page.locator(".untied").inner_text(), "and where the statements are")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_open(page), "and the graph comes back")
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
    page.wait_for_selector(".card")
    page.wait_for_timeout(600)
    same(page, stack[-3][1], "a reload keeps it all")
    page.go_forward()
    same(page, stack[-2][1], "Forward still works after a reload")

    print("Keyboard")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@s-2", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".card")
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
    page.wait_for_selector(".sheet__text .q.is-pinned", state="attached")
    wait_until(page, lambda: "Pinned" in caption(page), "it pins")
    held = top(page)
    wheel_to(page, held + 1600)
    page.wait_for_timeout(400)
    check("Pinned" in caption(page) and address(page).endswith("@closed-world"), "scrolling away does not let go")
    page.locator(".proof__unpin").click()
    wait_until(page, lambda: "Pinned" not in caption(page), "Unpin does")
    page.wait_for_timeout(350)
    check(not lean_open(page), "and the graph comes back")

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
    page.wait_for_selector(".sheet__text .q.is-pinned", state="attached")
    wait_until(page, lambda: "Statement 5 of 66" in page.locator(".stepper").inner_text() and lean_head(page) == "Ctx", "and that address opens that statement")

    print("The bar reads the statement in hand")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@proxytop-only-top", wait_until="load")
    page.wait_for_selector(".sheet__text .q.is-pinned", state="attached")
    wait_until(page, lambda: "Statement 15 of 66" in page.locator(".stepper").inner_text(), "a pinned statement sets the counter")

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
        reached = page.locator(".vocab__reached").inner_text()
        check(int(reached.split()[0]) >= 4, f"and the graph knows how far: {reached}")

    print("No stray thread")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".card")
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
    wait_until(fresh, lambda: fresh.locator(".sheet__text .q.is-pinned").count() > 0, "and the paper goes to its statement")
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
        page.wait_for_selector(".card")
        page.wait_for_timeout(600)
        page.keyboard.press("Escape")
        wait_until(page, lambda: not lean_open(page), "at rest in Graph mode")
        page.wait_for_timeout(500)
        return {"top": top(page), "camera": camera(page), "active": active(page)}

    def plain_statement() -> str:
        passage = visible_mark(page)
        check(passage, f"a statement to click: {passage}")
        spot = page.locator('[data-journey="mark"]').evaluate("(el) => { const b = el.getClientRects()[0]; return [b.left + Math.min(10, b.width / 2), b.top + b.height / 2]; }")
        page.mouse.click(spot[0], spot[1])
        wait_until(page, lambda: lean_open(page), "clicking a statement goes to Lean mode")
        return passage

    def rested(want: dict, how: str) -> None:
        wait_until(page, lambda: not lean_open(page), f"{how} returns to Graph mode")
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
        "the Graph side of the toggle": lambda: page.locator(".mode-toggle button", has_text="Graph").click(),
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
    check(entries(page) == before_entries and not lean_open(page), "clicking Graph in Graph mode does nothing")
    plain_statement()
    wait_entries = entries(page)
    page.locator(".mode-toggle button", has_text="Lean").click()
    page.wait_for_timeout(250)
    check(entries(page) == wait_entries and "Pinned" in caption(page), "clicking Lean in Lean mode does nothing")
    first = address(page)
    second = page.evaluate("""() => { const pane = document.querySelector('[data-paper-pane]').getBoundingClientRect(); const here = document.querySelector('.q.is-pinned'); const q = [...document.querySelectorAll('.sheet__text .q')].find((el) => { const b = el.getClientRects()[0]; return b && b.top > pane.top + 20 && b.bottom < pane.bottom - 20 && !el.closest('pre') && !el.querySelector('a') && !el.closest('a') && el.dataset.p !== here?.dataset.p; }); if (!q) return null; q.setAttribute('data-journey', 'second'); const b = q.getClientRects()[0]; return [b.left + Math.min(10, b.width / 2), b.top + b.height / 2]; }""")
    check(second, "a second statement on screen")
    page.mouse.click(second[0], second[1])
    wait_until(page, lambda: address(page) != first, "opening a statement in Lean mode moves to it")
    check(entries(page) == wait_entries + 1 and lean_open(page), "as one more entry")
    page.go_back()
    wait_until(page, lambda: address(page) == first and lean_open(page), "Back returns to the first statement")
    page.go_back()
    rested(want, "Back twice")
    page.go_forward()
    wait_until(page, lambda: lean_open(page), "Forward goes to the statement again")
    page.go_forward()
    wait_until(page, lambda: "Pinned" in caption(page) and address(page) != first, "and to the second")
    page.locator(".mode-toggle button", has_text="Graph").click()
    rested(want, "Graph after two opens")
    page.locator(".rail__item", has_text="Background").click()
    page.wait_for_timeout(1500)
    wheel_to(page, 5200)
    jumped = top(page)
    check(abs(jumped - want["top"]) > 100, "a jump to another section")
    plain_statement()
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_open(page) and abs(top(page) - jumped) <= 1, "Graph with a pin goes back to where the click was")
    page.go_back()
    wait_until(page, lambda: SLUG in page.url and abs(top(page) - jumped) > 100, "and Back goes on to the place before, not out of the site")

    print("Lean mode with nothing opened")
    want = at_rest("@s-3.3")
    page.locator(".mode-toggle button", has_text="Lean").click()
    wait_until(page, lambda: lean_open(page) and "Following" in caption(page), "Lean with nothing opened follows the text")
    box = page.locator(".proof__lean").bounding_box()
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: lean_open(page), "the mode survives a reload")
    held = lean_quote(page)
    wheel_to(page, top(page) + 700)
    wait_until(page, lambda: lean_quote(page) != held, "and keeps following")
    page.locator(".rail__item", has_text="Performance of Contextual").click()
    wait_until(page, lambda: page.locator(".untied").count() > 0, "a stretch with no Lean says so in the pane")
    now = page.locator(".proof__lean").bounding_box()
    check(lean_open(page) and abs(now["height"] - box["height"]) <= 1, "with no collapse")
    page.keyboard.press("g")
    wait_until(page, lambda: not lean_open(page), "g switches to the graph")

    print("The handle and the choices")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".card")
    page.wait_for_timeout(500)
    check(not lean_open(page), "the page starts in Graph mode")
    handle = page.locator(".proof__handle")
    handle.click()
    wait_until(page, lambda: lean_open(page), "a click on the handle brings up the Lean")
    if not page.locator(".proof[data-side]").count():
        box = handle.bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 5)
        page.mouse.down()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 240, steps=5)
        page.mouse.up()
        page.wait_for_timeout(200)
        now = page.locator(".proof__graph").bounding_box()["height"]
        check(now > 150, f"dragging the handle gives the graph room: {now:.0f}")
    reload(page)
    page.wait_for_selector(".card", state="attached")
    page.wait_for_timeout(400)
    check(lean_open(page), "the choice is remembered")
    page.locator(".mode-toggle button", has_text="Graph").click()
    wait_until(page, lambda: not lean_open(page), "and Graph goes back")
    page.locator(".proof__close").click()
    wait_until(page, lambda: page.locator(".proof").count() == 0, "the graph can be closed, and the paper has the desk")
    reload(page)
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(400)
    check(page.locator(".proof").count() == 0, "and stays closed")
    page.locator(".bar__open").click()
    wait_until(page, lambda: page.locator(".proof__graph").is_visible(), "and opens again")

    print("Night")
    page.locator(".bar__theme").click()
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
    page.locator(".bar__theme").click()
    check(not errors, f"nothing went wrong in the console: {errors[:3]}")


def phone(page: Page, url: str, shots: Path | None) -> None:
    print("Phone")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/@isoR-clam", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(1000)
    check(page.locator(".proof").count() == 0, "the paper fills the screen")
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


def monitors(page: Page, url: str, shots: Path | None, size: tuple[int, int]) -> None:
    w, h = size
    print(f"At {w}x{h}")
    page.goto("about:blank")
    page.goto(f"{url}#/{SLUG}/isoR", wait_until="load")
    page.wait_for_selector(".decl")
    page.wait_for_timeout(1400)
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "no sideways scroll")
    check(page.locator(".proof[data-side]").count() == (1 if w >= 1920 else 0), "stacked or side by side by the room on the right page")
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", help="a running site, ending in /")
    parser.add_argument("--dist", type=Path, default=ROOT / "web" / "dist")
    parser.add_argument("--shots", type=Path)
    parser.add_argument("--only", choices=("journey", "sizes"))
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
            if args.only != "sizes":
                context = browser.new_context(viewport={"width": 1440, "height": 790})
                journey(context.new_page(), url, args.shots)
                context.close()
            if args.only != "journey":
                for size in PAIRS:
                    context = browser.new_context(viewport={"width": size[0], "height": size[1]})
                    monitors(context.new_page(), url, args.shots, size)
                    context.close()
                context = browser.new_context(viewport={"width": 1024, "height": 768})
                tablet(context.new_page(), url, args.shots)
                context.close()
                context = browser.new_context(viewport={"width": PHONE[0], "height": PHONE[1]}, has_touch=True, is_mobile=args.browser != "firefox")
                phone(context.new_page(), url, args.shots)
                context.close()
                if server:
                    context = browser.new_context()
                    static_files(context.new_page(), url)
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
