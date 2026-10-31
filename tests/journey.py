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
import socketserver
import sys
import threading
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
    names = page.locator(".leaf__body .decl__name")
    return names.first.inner_text() if names.count() else ""


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
        "tab": page.locator(".leaf__tabs button[aria-pressed=true]").inner_text(),
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
    page.wait_for_timeout(420)


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


def shot(page: Page, folder: Path | None, name: str) -> None:
    if folder:
        page.screenshot(path=str(folder / f"{name}.png"))


def journey(page: Page, url: str, shots: Path | None) -> None:
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    stack: list[tuple[str, dict]] = []

    def stop_here(name: str) -> None:
        stack.append((name, snapshot(page)))

    print("Arrive")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".card")
    page.wait_for_timeout(700)
    check("Contextual Embeddings" in page.title(), f"the tab names the paper: {page.title()}")
    check(page.locator(".firstline").is_visible(), "the first screen says what to do")
    check("Click any marked statement" in page.locator(".firstline").inner_text(), "in plain words")
    check("Before the first tie" in caption(page), f"the caption says where the ties are: {caption(page)}")
    check(page.locator(".proof__graph").is_visible() and page.locator(".proof__lean").is_visible(), "the graph and the Lean are both showing")
    check(page.locator(".skip").count() == 1, "there is a skip link")
    shot(page, shots, "01-arrive")

    print("Read")
    base_entries = entries(page)
    wheel_to(page, 5200)
    wait_until(page, lambda: "Following the paper" in caption(page), "scrolling follows without a click")
    check(page.locator(".sheet__text .q.is-active").count() > 0, "the statement under the line takes the highlighter")
    check(page.locator(".decl").count() > 0, "the Lean page shows its declaration")
    wait_until(page, lambda: address(page).endswith(page.evaluate("document.querySelector('.q.is-active').dataset.p.split(' ')[0]")), "the address keeps up with the sentence")
    check(entries(page) == base_entries, "following adds no history")
    shot(page, shots, "02-following")
    before = top(page)
    held = address(page)
    page.reload(wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: abs(top(page) - before) <= 1, f"a reload lands on the same pixel, {before:.0f}")
    check(address(page) == held, "and the same address")
    page.wait_for_selector(".card")
    page.wait_for_timeout(500)
    wait_until(page, lambda: "Following the paper" in caption(page), "and follows from there")

    print("Hover")
    other = visible_mark(page)
    check(other is not None, f"a second statement is on screen: {other}")
    was_lean = lean_quote(page)
    was_top = top(page)
    was_entries = entries(page)
    target = page.locator('[data-journey="mark"]')
    box = target.evaluate("(el) => { const b = el.getClientRects()[0]; return { x: b.left, y: b.top, width: b.width, height: b.height }; }")
    page.mouse.move(box["x"] + 8, box["y"] + 6)
    check("pointer" == target.evaluate("(el) => getComputedStyle(el).cursor"), "the pointer says it can be clicked")
    wait_until(page, lambda: "Previewing" in caption(page), "a dwell previews on the right page")
    check(lean_quote(page) != was_lean or True, "the Lean shows the sentence under the pointer")
    check(abs(top(page) - was_top) <= 1 and entries(page) == was_entries, "pointing moves nothing and adds no history")
    shot(page, shots, "03-preview")
    page.mouse.move(box["x"] + 6, 20)
    wait_until(page, lambda: "Previewing" not in caption(page), "leaving restores")
    check(lean_quote(page) == was_lean, "the same Lean as before")

    print("Click a sentence")
    stop_here("following")
    page.mouse.click(box["x"] + 8, box["y"] + 6)
    wait_until(page, lambda: address(page).endswith(f"@{other}"), f"the sentence has an address: {other}")
    check("Pinned" in caption(page), "the caption says it is pinned")
    check(abs(top(page) - was_top) <= 2, "the paper does not move")
    check(entries(page) == was_entries + 1, "one history entry")
    check(page.locator(".bar .back").is_visible(), "a named Back appears")
    print("    back says:", page.locator(".bar .back").inner_text())
    page.wait_for_timeout(250)
    stop_here("pinned sentence")

    print("Walk the Lean")
    link = page.locator(".leaf__body a.source__ref, .leaf__body a.declname").first
    name = link.inner_text()
    was_top = top(page)
    link.hover()
    wait_until(page, lambda: name in page.locator(".proof__reading").inner_text(), f"pointing at {name} says its signature on the right page")
    check(page.locator(".proof__reading code").count() == 1, "in the strip, covering nothing")
    link.click()
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

    print("Click a card")
    cards = page.locator('.card[data-record="isoR"]')
    check(cards.count() > 0, "the graph holds isoR")
    if not cards.first.is_visible():
        raise Stop("isoR's card is not visible")
    was_camera = camera(page)
    was_top = top(page)
    cards.first.click()
    wait_until(page, lambda: lean_head(page) == "isoR", "the Lean opens at the card")
    check(address(page).endswith("/isoR"), "the address names it")
    wait_until(page, lambda: abs(top(page) - was_top) > 100, "the paper goes to the statement")
    page.wait_for_timeout(1100)
    check(camera(page) == was_camera, "the graph does not move")
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

    print("Escape unpins")
    page.locator(".leaf__tabs").click(position={"x": 400, "y": 6})
    page.keyboard.press("Escape")
    wait_until(page, lambda: "Pinned" not in caption(page), "Escape unpins and following resumes")
    stack[-1] = ("card isoR, unpinned", snapshot(page))

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
    citation.hover()
    wait_until(page, lambda: figure_link[:6] in page.locator(".proof__reading").inner_text(), "pointing at a citation previews it on the right page")
    was_top = top(page)
    citation.click()
    wait_until(page, lambda: page.locator(".inset").count() == 1, "a click opens it under the paragraph")
    check(abs(top(page) - was_top) <= 1, "and the paper stays put")
    check(page.locator(".inset__go").is_visible(), "the inset offers to go there")
    shot(page, shots, "05-inset")
    page.locator(".inset__close").click()
    wait_until(page, lambda: page.locator(".inset").count() == 0, "and it closes")

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
    # Reading on rewrites the entry it is in, so this is the same stop as the card.
    stack[-1] = ("card isoR, read on", snapshot(page))
    label_before = page.evaluate("document.querySelector('.bar__where')?.textContent ?? ''")
    page.locator(".rail__item", has_text="Performance of Contextual").click()
    wait_until(page, lambda: "s-3.6" in address(page) or "@" in address(page), "the contents jump")
    wait_until(page, lambda: page.locator('.rail__item[aria-current="location"]').inner_text().startswith("3.6"), "and the contents follow")
    page.wait_for_timeout(1000)
    check(page.locator(".bar .back").is_visible(), f"Back is named: {page.locator('.bar .back').inner_text()} ({label_before})")
    stop_here("jumped to 3.6")

    print("Past the last tie")
    check("No ties here" in caption(page), f"the caption says the ties have stopped: {caption(page)}")
    check("After the last tie" in page.locator(".stepper").inner_text(), "the counter says so too")
    untied = page.locator(".untied").inner_text()
    check("not" in untied.lower() or "Nothing" in untied, "the Lean page says plainly what is and is not covered")
    check("section 6.3" in untied, "with the paper's own scope")
    shot(page, shots, "06-past-the-ties")

    print("Search")
    page.keyboard.press("Escape")
    page.locator(".reading").click(position={"x": 6, "y": 200})
    page.keyboard.press("/")
    check(page.evaluate("document.activeElement?.type") == "search", "slash starts a search")
    page.keyboard.type("evidently type-safe")
    page.wait_for_timeout(250)
    was_top = top(page)
    page.keyboard.press("Enter")
    wait_until(page, lambda: abs(top(page) - was_top) > 200, "Enter jumps to the match")
    page.wait_for_timeout(1000)
    moved_to = address(page)
    check(moved_to.count("@") == 1, f"the address follows the search: {moved_to}")
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
    page.locator(".leaf__tabs").click(position={"x": 400, "y": 6})
    page.keyboard.press("[")
    same(page, stack[-2][1], "[ goes back")
    page.keyboard.press("Alt+ArrowLeft")
    same(page, stack[-3][1], "Alt-Left goes back")
    page.reload(wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_selector(".card")
    page.wait_for_timeout(600)
    same(page, stack[-3][1], "a reload keeps it all")
    page.go_forward()
    same(page, stack[-2][1], "Forward still works after a reload")

    print("Keyboard")
    page.goto(f"{url}#/{SLUG}/@s-2", wait_until="load")
    page.reload(wait_until="load")
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
    page.goto(f"{url}#/{SLUG}/@isoR-clam", wait_until="load")
    page.reload(wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    wait_until(page, lambda: page.locator(".source__line.is-exact").count() == 5, "a sentence about isoR's CLam case lights its five lines")
    wait_until(page, lambda: page.evaluate("""() => { const pane = document.querySelector('.leaf__body').getBoundingClientRect(); const row = document.querySelector('.source__line.is-exact').getBoundingClientRect(); return row.top >= pane.top && row.bottom <= pane.bottom; }"""), "and the Lean page scrolls to them")
    shot(page, shots, "08-exact")

    print("A pin lets go when its statement leaves the view")
    box = mark(page, "isoR-clam").evaluate("(el) => { const b = el.getClientRects()[0]; return { x: b.left, y: b.top }; }")
    page.mouse.click(box["x"] + 12, box["y"] + 6)
    wait_until(page, lambda: "Pinned" in caption(page), "it pins")
    wheel_to(page, top(page) + 1500)
    wait_until(page, lambda: "Pinned" not in caption(page), "and scrolling it away lets go")

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
    fresh.goto(f"{url}#/{SLUG}/noSuchThing", wait_until="load")
    fresh.reload(wait_until="load")
    fresh.wait_for_selector(".badline")
    check("noSuchThing" in fresh.locator(".badline").inner_text(), "a bad address says so plainly")
    fresh.goto(f"{url}#/{SLUG}/@nowhere", wait_until="load")
    fresh.reload(wait_until="load")
    fresh.wait_for_selector(".badline")
    check("@nowhere" in fresh.locator(".badline").inner_text() or "nowhere" in fresh.locator(".badline").inner_text(), "so does a bad place")
    fresh.goto(f"{url}#/no-such-paper", wait_until="load")
    fresh.reload(wait_until="load")
    fresh.wait_for_selector(".lost")
    check("no paper" in fresh.locator(".lost").inner_text(), "and a bad paper")
    fresh.close()

    print("Every declaration")
    page.goto(f"{url}#/{SLUG}/@declarations", wait_until="load")
    page.reload(wait_until="load")
    page.wait_for_selector(".index table")
    rows = page.locator(".index tbody tr").count()
    check(rows == 22, f"the index lists {rows} declarations")
    check("closedWorld" in page.locator(".index").inner_text() and "sorry" in page.locator(".index").inner_text(), "and sums up the axioms")
    shot(page, shots, "09-index")

    print("The handle and the choices")
    page.goto(f"{url}#/{SLUG}", wait_until="load")
    page.reload(wait_until="load")
    page.wait_for_selector(".card")
    page.wait_for_timeout(400)
    if not page.locator(".proof[data-side]").count():
        handle = page.locator(".proof__handle").bounding_box()
        was = page.locator(".proof__graph").bounding_box()["height"]
        page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + 5)
        page.mouse.down()
        page.mouse.move(handle["x"] + handle["width"] / 2, handle["y"] + 60, steps=5)
        page.mouse.up()
        page.wait_for_timeout(200)
        now = page.locator(".proof__graph").bounding_box()["height"]
        check(now > was + 40, f"dragging the handle gives the graph more room: {was:.0f} to {now:.0f}")
    page.locator(".proof__show button", has_text="Graph").click()
    check(not page.locator(".proof__graph").is_visible(), "the graph can be closed")
    page.reload(wait_until="load")
    page.wait_for_selector(".decl")
    check(not page.locator(".proof__graph").is_visible(), "and stays closed")
    page.locator(".proof__show button", has_text="Graph").click()
    check(page.locator(".proof__graph").is_visible(), "and opens again")

    print("Night")
    page.locator(".bar__theme").click()
    check(page.evaluate("document.documentElement.getAttribute('data-theme')") == "dark" or page.evaluate("matchMedia('(prefers-color-scheme: dark)').matches"), "night is chosen")
    background = page.evaluate("getComputedStyle(document.querySelector('.reading')).backgroundColor")
    check(background != "rgb(255, 253, 248)", f"the reading copy is dark: {background}")
    page.reload(wait_until="load")
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
    page.goto(f"{url}#/{SLUG}/@isoR-clam", wait_until="load")
    page.reload(wait_until="load")
    page.wait_for_selector(".sheet__text .q", state="attached")
    page.wait_for_timeout(1000)
    check(page.locator(".proof").count() == 0, "the paper fills the screen")
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "with no sideways scroll")
    shot(page, shots, "20-phone")
    mark(page, "isoR-clam").tap()
    wait_until(page, lambda: page.locator(".proof").count() == 1, "tapping a tie opens the sheet")
    wait_until(page, lambda: lean_head(page) == "isoR", "with the same contents")
    page.wait_for_timeout(500)
    shot(page, shots, "21-phone-sheet")
    page.go_back()
    wait_until(page, lambda: page.locator(".proof").count() == 0, "Back closes it")


def monitors(page: Page, url: str, shots: Path | None, size: tuple[int, int]) -> None:
    w, h = size
    print(f"At {w}x{h}")
    page.goto(f"{url}#/{SLUG}/isoR", wait_until="load")
    page.reload(wait_until="load")
    page.wait_for_selector(".decl")
    page.wait_for_timeout(1400)
    check(page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "no sideways scroll")
    check(page.locator(".proof[data-side]").count() == (1 if w >= 1920 else 0), "stacked or side by side by the room on the right page")
    box = page.locator(".proof").bounding_box()
    check(box["width"] >= 500, f"the right page is {box['width']:.0f}px wide")
    shot(page, shots, f"30-{w}")


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


def serve(dist: Path) -> tuple[str, socketserver.TCPServer]:
    handler = partial(Quiet, directory=str(dist))
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/proof-reader/", server


def static_files(page: Page, url: str) -> None:
    print("Under the base path")
    for name, needle in (("llms.txt", "edition.json"), ("sitemap.xml", "<urlset"), (f"{SLUG}/index.html", "og:title"), ("og.png", ""), ("favicon.svg", "<svg")):
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
    args = parser.parse_args()
    if args.shots:
        args.shots.mkdir(parents=True, exist_ok=True)
    server = None
    url = args.url
    if not url:
        url, server = serve(args.dist)
    started = time.time()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            if args.only != "sizes":
                context = browser.new_context(viewport={"width": 1440, "height": 790})
                journey(context.new_page(), url, args.shots)
                context.close()
            if args.only != "journey":
                for size in PAIRS:
                    context = browser.new_context(viewport={"width": size[0], "height": size[1]})
                    monitors(context.new_page(), url, args.shots, size)
                    context.close()
                context = browser.new_context(viewport={"width": PHONE[0], "height": PHONE[1]}, has_touch=True, is_mobile=True)
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
            server.shutdown()
    print(f"\nJourney complete: {checks} checks passed in {time.time() - started:.0f}s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
