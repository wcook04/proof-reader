"""Render a paper's reading text and compare it with extracted PDF text.

The comparison uses PDF text after margin and figure filtering. It normalizes
some characters and allows moved text, which can also hide changes in word or
character order. It helps detect transcription errors but does not certify an
exact copy. The comparison also assigns page marks to the reading text.

Passages and Lean names are found in the rendered text, then marked in place.
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import unicodedata
from bisect import bisect_left
from collections import Counter
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RENDER = ROOT / "web" / "tools" / "render-paper.mjs"

# Formulas first, so each one is a single piece of the page.
PART = re.compile(r'<span class="m" data-m="(\d+)">(.*?)</span>|<[^>]+>|[^<]+', re.S)
BLOCK = re.compile(r"</?(?:p|div|li|ul|ol|pre|figure|figcaption|h[1-4]|aside|header|section|blockquote)\b|<span class=\"cl\"")
TAG_NAME = re.compile(r"</?([a-zA-Z0-9]+)")
BULLETS = {"•", "∙", "◦"}
ALLOWED_TAGS = {
    "a", "aside", "blockquote", "br", "code", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "header", "hr",
    "img", "li", "ol", "p", "pre", "section", "span", "strong", "sub", "sup", "ul",
}


class ReadingError(Exception):
    pass


@dataclass
class Part:
    kind: str  # tag, text or math
    raw: str = ""
    text: str = ""
    start: int = 0
    code: bool = False
    link: bool = False
    # A space added here so that a block ends a word. It is not the paper's.
    added: bool = False


@dataclass
class Page:
    parts: list[Part] = field(default_factory=list)
    visible: str = ""


def render(markdown: Path, slug: str) -> dict:
    done = subprocess.run(["node", str(RENDER), str(markdown), slug], capture_output=True, text=True, cwd=ROOT / "web")
    if done.returncode != 0:
        raise ReadingError(f"could not set {markdown.name}:\n{done.stderr[-1500:]}")
    return json.loads(done.stdout)


def check_tags(source: str) -> None:
    """paper.md may hold a little HTML, and nothing that runs."""
    for tag in re.findall(r"<[^>]+>", source):
        name = TAG_NAME.match(tag)
        if name and name[1].lower() not in ALLOWED_TAGS:
            raise ReadingError(f"paper.md may not use <{name[1]}>")
        if re.search(r"\son\w+\s*=|javascript:", tag, re.I):
            raise ReadingError(f"paper.md may not use this tag: {tag[:80]}")


def parse(source: str) -> Page:
    page = Page()
    code = link = 0
    length = 0
    for match in PART.finditer(source):
        raw = match[0]
        if match[1] is not None:
            part = Part("math", raw=match[1], text=html.unescape(match[2]), start=length, code=code > 0, link=link > 0)
            length += len(part.text)
            page.parts.append(part)
        elif raw.startswith("<"):
            if re.match(r"<code\b", raw):
                code += 1
            elif raw.startswith("</code"):
                code -= 1
            elif re.match(r"<a\b", raw):
                link += 1
            elif raw.startswith("</a"):
                link -= 1
            page.parts.append(Part("tag", raw=raw))
            if BLOCK.match(raw):
                # Blocks end words. A space here is the reader's, not the paper's.
                page.parts.append(Part("text", text=" ", start=length, added=True))
                length += 1
        else:
            text = html.unescape(raw)
            page.parts.append(Part("text", text=text, start=length, code=code > 0, link=link > 0))
            length += len(text)
    page.visible = "".join(part.text for part in page.parts if part.kind != "tag")
    return page


def normal(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("−", "-").replace("⁡", "").replace("⁢", "").replace("​", "")


def squash(text: str) -> str:
    """A word without what a line end can add: spaces and hyphens."""
    return re.sub(r"[\s\-‐‑]", "", text)


def compare(theirs: list[str], ours: list[str]) -> tuple[dict[int, int], list[dict]]:
    """Line our words up with the PDF's. Returns our word -> PDF word, and every difference.

    Blocks may move: a footnote leaves the foot of its page and a figure leaves
    the top. So what fails to line up in place is compared again as a whole, and
    only what still fails is a difference.
    """
    found: dict[int, int] = {}
    left_theirs, left_ours = list(range(len(theirs))), list(range(len(ours)))
    for _ in range(3):
        a = [theirs[i] for i in left_theirs]
        b = [ours[i] for i in left_ours]
        opcodes = SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
        next_theirs: list[int] = []
        next_ours: list[int] = []
        for tag, a0, a1, b0, b1 in opcodes:
            if tag == "equal":
                for k in range(b1 - b0):
                    found[left_ours[b0 + k]] = left_theirs[a0 + k]
            elif tag == "replace" and squash("".join(a[a0:a1])) == squash("".join(b[b0:b1])):
                for k in range(b0, b1):
                    found[left_ours[k]] = left_theirs[a0]
            else:
                next_theirs.extend(left_theirs[a0:a1])
                next_ours.extend(left_ours[b0:b1])
        left_theirs, left_ours = next_theirs, next_ours
        if not left_theirs and not left_ours:
            break
    if not left_theirs and not left_ours:
        return found, []
    # What remains is compared letter by letter, so that one split formula or a
    # moved block does not read as a run of different words.
    a = "".join(squash(theirs[i]) for i in left_theirs)
    b = "".join(squash(ours[i]) for i in left_ours)
    differences = []
    for tag, a0, a1, b0, b1 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag != "equal":
            differences.append({"pdf": a[max(0, a0 - 12):a1 + 12], "ours": b[max(0, b0 - 12):b1 + 12], "gone": a[a0:a1], "new": b[b0:b1]})
    # The same letters in another order is a move across a page turn, not a change.
    if Counter("".join(d["gone"] for d in differences)) == Counter("".join(d["new"] for d in differences)):
        return found, []
    return found, differences


def spot(squeezed: str, quote: str) -> list[int]:
    hits = []
    at = squeezed.find(quote)
    while at >= 0:
        hits.append(at)
        at = squeezed.find(quote, at + 1)
    return hits


def squeeze(visible: str) -> tuple[str, list[int]]:
    """The visible text without spaces, each letter remembering where it came from."""
    letters: list[str] = []
    back: list[int] = []
    for index, char in enumerate(visible):
        for letter in normal(char):
            if not letter.isspace():
                letters.append(letter)
                back.append(index)
    return "".join(letters), back


def locate(page: Page, passages: list[dict]) -> tuple[dict[str, tuple[int, int]], list[str]]:
    squeezed, back = squeeze(page.visible)
    where: dict[str, tuple[int, int]] = {}
    errors = []
    for passage in passages:
        target = re.sub(r"\s+", "", normal(passage["quote"]))
        hits = spot(squeezed, target)
        if passage.get("nth"):
            hits = hits[passage["nth"] - 1:passage["nth"]]
        if len(hits) != 1:
            errors.append(f"passage {passage['id']}: found {len(hits)} times in paper.md, needs exactly one")
            continue
        where[passage["id"]] = (back[hits[0]], back[hits[0] + len(target) - 1] + 1)
    return where, errors


def section_ranges(page: Page, outline: list[dict]) -> list[tuple[str, int]]:
    """Where each section begins in the visible text."""
    ranges = []
    wanted = {entry["id"] for entry in outline}
    for index, part in enumerate(page.parts):
        if part.kind == "tag":
            match = re.match(r'<h[234] id="([^"]+)"', part.raw)
            if match and match[1] in wanted:
                following = next((p for p in page.parts[index:] if p.kind != "tag"), None)
                ranges.append((match[1], following.start if following else len(page.visible)))
    return ranges


def section_at(ranges: list[tuple[str, int]], offset: int) -> str | None:
    current = None
    for name, start in ranges:
        if start <= offset:
            current = name
    return current


def names_in(page: Page, names: list[str], ranges: list[tuple[str, int]], sections: list[str] | None) -> list[tuple[int, int, str]]:
    """Lean names printed as code. Only code counts: `Index` in a sentence is a word."""
    if not names:
        return []
    pattern = re.compile(r"(?<![A-Za-z0-9_'])(" + "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)) + r")(?![A-Za-z0-9_'])")
    found = []
    allowed = None if sections is None else {f"s-{s}" for s in sections}
    for part in page.parts:
        if part.kind != "text" or not part.code or part.link:
            continue
        for match in pattern.finditer(part.text):
            start = part.start + match.start()
            place = section_at(ranges, start)
            if allowed is None or (place in allowed or (place or "").split(".")[0] in allowed):
                found.append((start, part.start + match.end(), match[1]))
    return found


def weave(page: Page, spans: dict[str, tuple[int, int]], names: list[tuple[int, int, str]], marks: dict[int, str], math: list[str], route: str) -> str:
    """Write the page with passages, names and page marks in place."""
    edges = sorted({*(s for pair in spans.values() for s in pair), *(s for trio in names for s in trio[:2]), *marks})
    placed: set[int] = set()
    out: list[str] = []

    def passages_at(start: int, stop: int) -> str:
        return " ".join(sorted(key for key, (a, b) in spans.items() if a < stop and b > start))

    def name_at(start: int) -> str | None:
        return next((name for a, b, name in names if a <= start < b), None)

    def wrap(chunk: str, start: int, stop: int) -> str:
        name = name_at(start)
        if name:
            chunk = f'<a class="nm" data-name="{html.escape(name)}" href="{route}/{html.escape(name)}">{chunk}</a>'
        ids = passages_at(start, stop)
        if ids:
            chunk = f'<span class="q" data-p="{html.escape(ids)}">{chunk}</span>'
        return chunk

    def mark(offset: int) -> None:
        if offset in marks and offset not in placed:
            placed.add(offset)
            out.append(marks[offset])

    for part in page.parts:
        if part.kind == "tag":
            out.append(part.raw)
        elif part.kind == "math":
            mark(part.start)
            out.append(wrap(math[int(part.raw)], part.start, part.start + len(part.text)))
        else:
            stop = part.start + len(part.text)
            if part.added and not part.code and out and out[-1].startswith("<"):
                continue
            cuts = [part.start] + [e for e in edges if part.start < e < stop] + [stop]
            for a, b in zip(cuts, cuts[1:]):
                mark(a)
                chunk = part.text[a - part.start:b - part.start]
                out.append(wrap(html.escape(chunk, quote=False), a, b))
    return "".join(out)


def page_marks(words: list[tuple[int, int]], found: dict[int, int], theirs_pages: list[int], label: str, route: str) -> dict[int, str]:
    """A mark where each PDF page begins, in the order a reader meets them."""
    marks: dict[int, str] = {}
    reached = 0
    for index, (start, _stop) in enumerate(words):
        if index not in found:
            continue
        page = theirs_pages[found[index]]
        if page == reached + 1:
            reached = page
            text = label.format(page=page)
            marks[start] = f'<a class="pg" data-page="{page}" href="{route}/@page-{page}" title="Open page {page} of the PDF" aria-label="Open page {page} of the PDF">{text}</a>'
    return marks


def build(folder: Path, slug: str, passages: list[dict], names: list[str], pdf_words: list[dict], reading_config: dict, link_config: dict) -> dict:
    """The reading copy, or an exception listing each word that differs from the PDF."""
    markdown = folder / "paper.md"
    done = render(markdown, slug)
    check_tags(markdown.read_text(encoding="utf-8").split("```")[0])
    route = f"./#/{slug}"
    source = re.sub(r'href="#([^"]+)"', lambda m: f'href="{route}/@{m[1]}"', done["html"])
    source = re.sub(r'<a href="(https?://[^"]+)"', r'<a class="ext" href="\1" target="_blank" rel="noopener noreferrer"', source)
    # A plot takes its width from the paper and reserves its height before it loads.
    for figure in reading_config.get("figure", []):
        x0, y0, x1, y1 = figure["box"]
        source = source.replace(f'class="zoom" data-figure="{figure["name"]}"', f'class="zoom" style="--natural:{round(x1 - x0)}" data-figure="{figure["name"]}"')
        source = source.replace(f'{figure["name"]}" alt=', f'{figure["name"]}" width="{round(x1 - x0)}" height="{round(y1 - y0)}" loading="lazy" decoding="async" alt=')
    page = parse(source)

    # A list's bullets are drawn by the page, so they are not words on either side.
    words = [(m.start(), m.end()) for m in re.finditer(r"\S+", page.visible) if m[0] not in BULLETS]
    ours = [normal(page.visible[a:b]) for a, b in words]
    boxes = reading_config.get("figure", [])
    kept = [w for w in pdf_words if w["text"] not in BULLETS and not any(f["page"] == w["page"] and inside(w["box"], f["box"]) for f in boxes)]
    theirs = [w["text"] for w in kept]
    found, differences = compare(theirs, ours)
    if differences:
        lines = [f"  PDF has {d['gone']!r}, paper.md has {d['new']!r}  (near {d['pdf']!r})" for d in differences[:80]]
        raise ReadingError(f"paper.md differs from the PDF in {len(differences)} places:\n" + "\n".join(lines))

    spans, errors = locate(page, passages)
    if errors:
        raise ReadingError("\n".join(errors))
    ranges = section_ranges(page, done["outline"])
    mentions = names_in(page, names, ranges, link_config.get("name_sections"))
    marks = page_marks(words, found, [w["page"] for w in kept], reading_config.get("page_label", "{page}"), route)
    body = weave(page, spans, mentions, marks, done["math"], route)

    counts: dict[str, int] = {}
    for start, _stop in spans.values():
        place = section_at(ranges, start)
        if place:
            counts[place] = counts.get(place, 0) + 1
    offsets = dict(ranges)
    starts = [start for start, _stop in words]

    def page_of(entry: dict) -> int:
        """The PDF page a section starts on: its first word that lines up with the PDF."""
        for index in range(bisect_left(starts, offsets.get(entry["id"], 0)), len(words)):
            if index in found:
                return kept[found[index]]["page"]
        return 1

    outline = [{**entry, "ties": counts.get(entry["id"], 0), "page": page_of(entry)} for entry in done["outline"]]
    order = sorted(spans, key=lambda pid: spans[pid][0])
    code = {pid for pid, (start, _stop) in spans.items() if any(p.code and p.kind != "tag" and p.start <= start < p.start + len(p.text) for p in page.parts)}
    return {"html": body, "outline": outline, "words": len(ours), "formulas": len(done["math"]), "pages": len(marks), "order": order, "code": code}


def inside(box: list[float], outer: list[float]) -> bool:
    x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return outer[0] <= x <= outer[2] and outer[1] <= y <= outer[3]
