#!/usr/bin/env python3
"""Draft a paper's reading text from its PDF.

  transcribe.py SLUG [--force]

The PDF records far more than its words: every run of text has a font, a size,
a colour and a position, and every citation and cross-reference has a target.
That is enough to tell a heading from a paragraph, code from prose, a footnote
from the page it sits on, and a line-end hyphen from a real one. This writes
papers/SLUG/paper.md from that structure.

It is a first draft. Read it and repair what the layout hid, then let
`paper.py check` compare the reading copy with extracted PDF text.

Needs Poppler's pdftohtml, and pypdf for the link targets.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tomllib
import xml.etree.ElementTree as ElementTree
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "papers"
DICTIONARY = Path("/usr/share/dict/words")

MONO = re.compile(r"Inconsolata|Mono|Courier|Typewriter|Consol|Menlo|Fira Code|Source Code", re.I)
MATH = re.compile(r"Math|txmi|txsym|cmmi|cmsy|msam|msbm|rsfs", re.I)
PLOT = re.compile(r"Helvetica|Arial|DejaVu|Nimbus", re.I)
ITALIC = re.compile(r"(Italic|Oblique|TI$|-It$|BoldIt)", re.I)
BOLD = re.compile(r"(Bold|TB$|TZB$|-Bd$)", re.I)
BULLETS = "•∙◦‣"
LIGATURES = str.maketrans({"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st"})
TEX = {"λ": r"\lambda ", "Δ": r"\Delta ", "Γ": r"\Gamma ", "Σ": r"\Sigma ", "⊢": r"\vdash ", "⊸": r"\multimap ",
       "→": r"\to ", "×": r"\times ", "⊗": r"\otimes ", "□": r"\Box ", "∀": r"\forall ", "∃": r"\exists "}


@dataclass
class Font:
    size: float
    family: str
    colour: str
    mono: bool
    math: bool
    italic: bool
    bold: bool
    plot: bool


@dataclass
class Run:
    page: int
    top: float
    left: float
    width: float
    height: float
    font: Font
    text: str
    link: str | None = None

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def middle(self) -> float:
        return self.top + self.height / 2


@dataclass
class Piece:
    """A stretch of one line in one style."""
    text: str
    kind: str = "text"  # text, code, math or note
    italic: bool = False
    bold: bool = False
    link: str | None = None
    space: bool = False  # a space goes before this piece


@dataclass
class Line:
    page: int
    top: float
    left: float
    right: float
    height: float
    pieces: list[Piece]
    runs: list[Run]

    @property
    def text(self) -> str:
        return "".join((" " if p.space else "") + p.text for p in self.pieces).strip()


@dataclass
class Block:
    kind: str  # heading, para, item, code, figure, plot, note, ref, title
    page: int
    top: float
    lines: list[Line] = field(default_factory=list)
    level: int = 0
    number: str = ""
    code: list[list[str]] = field(default_factory=list)
    caption: Line | None = None
    anchor: str = ""
    closed: bool = False
    part: int = 0


def read_runs(pdf: Path) -> tuple[list[Run], float, float]:
    done = subprocess.run(["pdftohtml", "-xml", "-i", "-hidden", "-nodrm", "-stdout", str(pdf)],
                          check=True, capture_output=True, text=True)
    tree = ElementTree.fromstring(done.stdout)
    fonts: dict[str, Font] = {}
    runs: list[Run] = []
    width = height = 0.0
    for page in tree.iter("page"):
        number = int(page.get("number"))
        width, height = float(page.get("width")), float(page.get("height"))
        for node in page:
            if node.tag == "fontspec":
                family = node.get("family").split("+")[-1]
                fonts[node.get("id")] = Font(float(node.get("size")), family, node.get("color"),
                                             bool(MONO.search(family)), bool(MATH.search(family)),
                                             bool(ITALIC.search(family)), bool(BOLD.search(family)),
                                             bool(PLOT.search(family)))
            elif node.tag == "text":
                text = "".join(node.itertext()).translate(LIGATURES)
                if text.strip():
                    runs.append(Run(number, float(node.get("top")), float(node.get("left")), float(node.get("width")),
                                    float(node.get("height")), fonts[node.get("font")], text))
    return runs, width, height


def read_links(pdf: Path) -> tuple[dict[int, list[dict]], list[dict], float]:
    """The PDF's link annotations by page, its named targets in points, and its page height."""
    try:
        from pypdf import PdfReader
    except ImportError:
        print("pypdf is not installed, so citations will not be linked", file=sys.stderr)
        return {}, [], 0.0
    reader = PdfReader(str(pdf))
    links: dict[int, list[dict]] = {}
    for number, page in enumerate(reader.pages, 1):
        height = float(page.mediabox.height)
        for annotation in page.get("/Annots", []) or []:
            item = annotation.get_object()
            if item.get("/Subtype") != "/Link":
                continue
            action = item.get("/A")
            target = None
            if action is not None:
                action = action.get_object()
                target = action.get("/URI") or action.get("/D")
            target = target if target is not None else item.get("/Dest")
            x0, y0, x1, y1 = (float(v) for v in item["/Rect"])
            links.setdefault(number, []).append({"box": (x0, height - y1, x1, height - y0), "target": str(target)})
    targets = []
    for name, target in reader.named_destinations.items():
        page = reader.get_destination_page_number(target)
        targets.append({"name": name, "page": page + 1, "left": float(target.left or 0),
                        "top": float(reader.pages[page].mediabox.height) - float(target.top or 0)})
    return links, targets, float(reader.pages[0].mediabox.height)


def attach_links(runs: list[Run], links: dict[int, list[dict]], scale: float) -> None:
    for run in runs:
        x, y = run.left + run.width / 2, run.middle
        for link in links.get(run.page, []):
            x0, y0, x1, y1 = (v * scale for v in link["box"])
            if x0 - 2 <= x <= x1 + 2 and y0 - 3 <= y <= y1 + 3:
                run.link = link["target"]
                break


def drop_furniture(runs: list[Run], height: float, pages: int) -> list[Run]:
    """Remove running heads and feet: text repeated near the edge of many pages."""
    shape = lambda run: (re.sub(r"\d+", "#", run.text.strip()), round(run.top / 3))
    near_edge = [run for run in runs if run.top < height * 0.12 or run.top > height * 0.9]
    seen: dict[tuple, set[int]] = {}
    for run in near_edge:
        seen.setdefault(shape(run), set()).add(run.page)
    repeated = {key for key, where in seen.items() if len(where) >= max(3, pages * 0.3)}
    return [run for run in runs if shape(run) not in repeated]


def common_font(runs: list[Run]) -> Font:
    weight: Counter = Counter()
    fonts = {}
    for run in runs:
        key = (run.font.family, run.font.size)
        weight[key] += len(run.text)
        fonts[key] = run.font
    return fonts[weight.most_common(1)[0][0]]


def to_pieces(row: list[Run], body: Font) -> list[Piece]:
    pieces: list[Piece] = []
    previous = None
    for run in sorted(row, key=lambda r: r.left):
        space = previous is not None and (run.left - previous.right > 1.8 or previous.text.endswith(" ") or run.text.startswith(" "))
        text = re.sub(r"\s+", " ", run.text).strip()
        font = run.font
        if not text:
            continue
        if run.link and run.link.startswith("Hfootnote") and text.isdigit():
            piece = Piece(text, "note", space=False)
        elif font.mono:
            piece = Piece(text, "code", link=run.link, space=space)
        elif font.math or re.search(r"[\U0001D400-\U0001D7FF]", text):
            piece = Piece(text, "math", space=space)
        else:
            piece = Piece(text, italic=font.italic, bold=font.bold, link=run.link, space=space)
        pieces.append(piece)
        previous = run
    return pieces


def rows_of(runs: list[Run], tolerance: float = 5.0) -> list[list[Run]]:
    rows: list[list[Run]] = []
    for run in sorted(runs, key=lambda r: r.middle):
        if rows and abs(sum(r.middle for r in rows[-1]) / len(rows[-1]) - run.middle) <= tolerance:
            rows[-1].append(run)
        else:
            rows.append([run])
    return rows


def code_text(rows: list[list[Run]]) -> list[str]:
    """Rebuild code lines, holding each piece at the column it was printed in."""
    runs = [run for row in rows for run in row]
    char = sum(r.width for r in runs) / max(1, sum(len(r.text) for r in runs))
    left = min(r.left for r in runs)
    out = []
    for row in rows:
        line = ""
        for run in sorted(row, key=lambda r: r.left):
            column = round((run.left - left) / char)
            if column > len(line):
                line += " " * (column - len(line))
            elif line and not line.endswith(" ") and run.left - previous.right > char * 0.5:
                line += " "
            line += run.text
            previous = run
        out.append(line.rstrip())
    return out


def split_columns(runs: list[Run]) -> list[list[Run]]:
    """Code set side by side: look for an empty upright strip with code on both sides."""
    if not runs:
        return []
    char = sum(r.width for r in runs) / max(1, sum(len(r.text) for r in runs))
    spans = sorted((r.left, r.right) for r in runs)
    gaps = []
    reach = spans[0][1]
    for left, right in spans[1:]:
        if left - reach >= char * 0.4:
            gaps.append((reach, left))
        reach = max(reach, right)
    # Rows of two independent columns fall out of step, and that marks the true
    # gap better than its width: aligned code can leave a wider strip inside a column.
    best = None
    for start, stop in gaps:
        lefts = [r for r in runs if r.right <= start]
        rights = [r for r in runs if r.left >= stop]
        left_rows = {round(r.middle) for r in lefts}
        right_rows = {round(r.middle) for r in rights}
        if len(left_rows) < 2 or len(right_rows) < 2:
            continue
        apart = sum(all(abs(row - other) > 3 for other in left_rows) for row in right_rows) / len(right_rows)
        if stop - start >= char * 2.5 or apart > 0.3:
            score = (apart, stop - start)
            if best is None or score > best[0]:
                best = (score, lefts, rights)
    if best:
        return split_columns(best[1]) + split_columns(best[2])
    return [runs]


def columns_of(runs: list[Run], width: float) -> list[list[Run]]:
    """A page in reading order: full-width stretches, and two columns between them.

    A page is in two columns when a good share of its rows have prose on both sides
    of an empty gutter. Code set side by side has a gutter too, so code does not count.
    """
    middle = width / 2

    def gutter(row: list[Run]) -> bool:
        lefts = [r for r in row if r.right <= middle + 4]
        rights = [r for r in row if r.left >= middle - 4]
        return len(lefts) + len(rights) == len(row) and bool(lefts) and bool(rights) and min(r.left for r in rights) - max(r.right for r in lefts) >= 9

    def across(row: list[Run]) -> bool:
        return not gutter(row) and any(r.right > middle + 4 for r in row) and any(r.left < middle - 4 for r in row)

    def prose_both_sides(row: list[Run]) -> bool:
        return gutter(row) and any(not r.font.mono and r.right <= middle + 4 for r in row) and any(not r.font.mono and r.left >= middle - 4 for r in row)

    rows = rows_of(runs)
    if sum(prose_both_sides(row) for row in rows) < len(rows) * 0.35:
        return [runs]
    parts: list[list[Run]] = []
    stretch: list[list[Run]] = []

    def flush() -> None:
        flat = [r for row in stretch for r in row]
        parts.extend(part for part in ([r for r in flat if r.left < middle], [r for r in flat if r.left >= middle]) if part)
        stretch.clear()

    for row in rows:
        if across(row):
            flush()
            if parts and getattr(parts[-1], "wide", False):
                parts[-1].extend(row)
            else:
                parts.append(WideRows(row))
        else:
            stretch.append(row)
    flush()
    return parts


class WideRows(list):
    """Rows that cross the gutter, kept together."""
    wide = True


def edges(runs: list[Run], body: Font, margin: float, right: float) -> tuple[float, float]:
    """Where this stretch's text begins and ends, falling back on the page's."""
    text = [r for r in runs if r.font is body]
    if len(text) < 8:
        return margin, right
    return Counter(round(r.left) for r in text).most_common(1)[0][0], Counter(round(r.right) for r in text).most_common(1)[0][0]


def page_blocks(runs: list[Run], body: Font, margin: float, right: float) -> list[Block]:
    blocks: list[Block] = []
    plot = [r for r in runs if r.font.plot]
    runs = [r for r in runs if not r.font.plot]
    rows = rows_of(runs)
    code = [r for row in rows if all(r.font.mono for r in row) for r in row]
    text = [row for row in rows if not all(r.font.mono for r in row)]
    items: list[tuple[float, str, object]] = []
    for row in text:
        pieces = to_pieces(row, body)
        if pieces:
            items.append((min(r.top for r in row),
                          "line",
                          Line(row[0].page, min(r.top for r in row), min(r.left for r in row), max(r.right for r in row),
                               max(r.height for r in row), pieces, row)))
    # Code between two lines of text belongs to one block.
    tops = sorted(item[0] for item in items)
    regions: dict[int, list[Run]] = {}
    for run in sorted(code, key=lambda r: r.top):
        regions.setdefault(sum(top < run.middle for top in tops), []).append(run)
    for region in regions.values():
        columns = split_columns(region)
        items.append((min(r.top for r in region), "code", [rows_of(c, 4.0) for c in columns]))
    pictures: dict[int, list[Run]] = {}
    for run in sorted(plot, key=lambda r: r.top):
        pictures.setdefault(sum(top < run.middle for top in tops), []).append(run)
    for picture in pictures.values():
        items.append((min(r.top for r in picture), "plot", picture))
    items.sort(key=lambda item: item[0])

    for top, kind, value in items:
        previous = blocks[-1] if blocks else None
        if kind == "plot":
            blocks.append(Block("plot", value[0].page, top))
        elif kind == "code":
            first = value[0][0][0]
            blocks.append(Block("code", first.page, top, code=[code_text(rows) for rows in value]))
        else:
            add_line(blocks, value, previous, body, margin, right)
    return attach_captions(blocks)


def attach_captions(blocks: list[Block]) -> list[Block]:
    out: list[Block] = []
    for block in blocks:
        if block.kind == "para" and block.lines and re.match(r"(Fig\.|Figure|Table)\s*\d+\.", block.lines[0].text):
            holder = next((b for b in reversed(out) if b.kind in ("code", "plot") and b.caption is None), None)
            if holder is not None and holder is out[-1]:
                holder.caption = block.lines[0]
                holder.kind = "figure" if holder.kind == "code" else "plot"
                holder.closed = True
                continue
        out.append(block)
    return out


def add_line(blocks: list[Block], line: Line, previous: Block | None, body: Font, margin: float, right: float) -> None:
    first = line.runs[0] if len(line.runs) == 1 else min(line.runs, key=lambda r: r.left)
    size = first.font.size
    text = line.text
    # A superscript number at the start of small type opens a footnote.
    if line.pieces and line.pieces[0].kind == "note" or (size < body.size * 0.9 and min(line.runs, key=lambda r: r.left).font.size < body.size * 0.66):
        number = line.pieces[0].text
        line.pieces = line.pieces[1:]
        blocks.append(Block("note", line.page, line.top, [line], number=number))
        return
    if previous is not None and previous.kind == "note" and size < body.size * 0.9:
        previous.lines.append(line)
        return
    heading = first.font.bold and not first.font.mono and all(r.font.bold or r.font.mono or r.font.math for r in line.runs) and size >= body.size * 0.95
    if heading and size >= body.size * 1.15:
        if previous is not None and previous.kind == "title":
            previous.lines.append(line)
        else:
            blocks.append(Block("title", line.page, line.top, [line]))
        return
    if heading:
        match = re.match(r"([A-Z]|\d+(?:\.\d+)*)\s+(?=\S)", text)
        number = match[1] if match else ""
        blocks.append(Block("heading", line.page, line.top, [line], level=number.count(".") + 2, number=number))
        return
    leading = line.pieces[0].text[:1] in BULLETS
    if leading:
        line.pieces[0].text = line.pieces[0].text[1:].strip()
        if not line.pieces[0].text:
            line.pieces = line.pieces[1:]
        if line.pieces:
            line.pieces[0].space = False
        blocks.append(Block("item", line.page, line.top, [line]))
        return
    if previous is not None and previous.kind == "item" and line.left > margin + 8 and line.top - previous.lines[-1].top < 26:
        previous.lines.append(line)
        return
    gap = line.top - previous.lines[-1].top if previous is not None and previous.lines else 99
    indented = margin + 8 < line.left < margin + 40
    centred = line.left > margin + 40
    ended = previous is not None and previous.lines and previous.lines[-1].right < right - 30 and re.search(r"[.:?!”]$", previous.lines[-1].text)
    if previous is not None and previous.kind == "para" and not indented and not centred and gap < 27 and not ended:
        previous.lines.append(line)
        return
    blocks.append(Block("para", line.page, line.top, [line], number="indent" if indented else ""))


def join_lines(lines: list[Line], known: set[str], dictionary: set[str], choices: list[str]) -> list[Piece]:
    """One paragraph's pieces, with line-end hyphens resolved."""
    out: list[Piece] = []
    for index, line in enumerate(lines):
        pieces = [Piece(**vars(p)) for p in line.pieces]
        if not pieces:
            continue
        if out:
            last, head = out[-1], pieces[0]
            if last.link and last.link == head.link and re.search(r"[/.]\S*$", last.text) and "/" in last.text + head.text:
                head.space = False  # A long address broken across two lines.
            elif last.kind == "text" and last.text.endswith("-") and head.kind == "text":
                stem = re.search(r"([\w-]+)-$", last.text)
                tail = re.match(r"[\w-]+", head.text)
                joined = (stem[1] if stem else "") + (tail[0] if tail else "")
                whole = (stem[1] if stem else "") + "-" + (tail[0] if tail else "")
                keep = whole.lower() in known or (head.text[:1].isupper()) or (joined.lower() not in known and joined.lower() not in dictionary and "-" in whole and bool(dictionary))
                if not keep:
                    last.text = last.text[:-1]
                choices.append(f"{'keep' if keep else 'join'} {whole}")
                head.space = False
            else:
                head.space = True
        out.extend(pieces)
    return out


def escape(text: str) -> str:
    return re.sub(r"([\\`*_\[\]<$~])", r"\\\1", text)


def anchor_for(target: str, text: str) -> str | None:
    if target.startswith("http"):
        return target
    if target.startswith("cite."):
        return "#cite-" + re.sub(r"[^a-z0-9]+", "-", target.split("@")[-1].lower()).strip("-")
    if target.startswith(("section.", "subsection.", "appendix.", "subsubsection.")):
        return "#s-" + target.split(".", 1)[1]
    if target.startswith("figure"):
        digits = re.search(r"\d+", text)
        return f"#fig-{digits[0]}" if digits else None
    return None


def tex(text: str) -> str:
    import unicodedata
    text = unicodedata.normalize("NFKC", text)
    return "".join(TEX.get(c, c) for c in text).strip()


def render(pieces: list[Piece]) -> str:
    """Pieces to Markdown, merging neighbours of one style."""
    groups: list[list[Piece]] = []
    for piece in pieces:
        if piece.kind == "note":
            groups.append([piece])
            continue
        tail = groups[-1][-1] if groups else None
        same = tail is not None and tail.kind == piece.kind and tail.italic == piece.italic and tail.bold == piece.bold and tail.link == piece.link and tail.kind != "note"
        if same:
            groups[-1].append(piece)
        else:
            groups.append([piece])
    out = ""
    for group in groups:
        first = group[0]
        body = "".join((" " if p.space and i else "") + p.text for i, p in enumerate(group))
        if first.kind == "note":
            chunk = f"[^{first.text}]"
        elif first.kind == "code":
            chunk = f"`{body}`"
        elif first.kind == "math":
            chunk = f"${tex(body)}$"
        else:
            chunk = escape(body)
            if first.bold:
                chunk = f"**{chunk}**"
            elif first.italic:
                edge = chunk[:len(chunk) - len(chunk.lstrip())], chunk[len(chunk.rstrip()):]
                chunk = f"{edge[0]}*{chunk.strip()}*{edge[1]}"
        if first.link:
            href = anchor_for(first.link, body)
            if href:
                chunk = f"[{chunk}]({href})"
        out += (" " if first.space and out else "") + chunk
    return out


def tidy_links(text: str) -> str:
    text = re.sub(r"\[([^\[\]]*?)\\\[([^\[\]]*?)\]\((#cite-[^)]+)\)\\\]", r"[\1\\[\2\\]](\3)", text)
    text = re.sub(r"\[([^\[\]]+?);\]\((#cite-[^)]+)\)", r"[\1](\2);", text)
    text = re.sub(r"§\[([^\]]+)\]\(", r"[§\1](", text)
    text = re.sub(r"Appendix \[([^\]]+)\]\(", r"[Appendix \1](", text)
    return re.sub(r"\[([^\[\]]*)\.\]\((https?://\S+?)\)(?=\s|$)", r"[\1](\2).", text)


def merge_pages(pages: list[list[Block]]) -> list[Block]:
    """Join paragraphs split by a page turn; figures that interrupted them follow."""
    out: list[Block] = []
    for blocks in pages:
        for block in blocks:
            if block.kind == "para" and block.number != "indent":
                open_para = next((b for b in reversed(out) if b.kind == "para"), None)
                seen_text = any(b.kind in ("para", "heading", "item") and b.part == block.part and b is not block for b in out)
                if open_para is not None and open_para.part < block.part and not seen_text:
                    last = open_para.lines[-1].text
                    if not re.search(r"[.:?!]$", last) or last.endswith(("e.g.", "i.e.")):
                        open_para.lines.extend(block.lines)
                        continue
            out.append(block)
    return out


def write_markdown(blocks: list[Block], known: set[str], dictionary: set[str], choices: list[str], language: str) -> str:
    out: list[str] = []
    notes: list[str] = []
    figures = 0
    for index, block in enumerate(blocks):
        if block.kind == "note":
            notes.append(f"[^{block.number}]: " + render(join_lines(block.lines, known, dictionary, choices)))
            continue
        if block.kind == "title":
            out.append("# " + " ".join(line.text for line in block.lines))
        elif block.kind == "heading":
            for piece in block.lines[0].pieces:
                piece.bold = False
            out.append("#" * block.level + " " + render(block.lines[0].pieces))
        elif block.kind == "item":
            text = render(join_lines(block.lines, known, dictionary, choices))
            out.append("- " + text)
        elif block.kind == "para":
            text = render(join_lines(block.lines, known, dictionary, choices))
            out.append((f'<a id="{block.anchor}"></a>' if block.anchor else "") + text)
        elif block.kind in ("code", "figure"):
            fences = ["\n".join([f"```{language_of(column, language)}", *column, "```"]) for column in block.code]
            body = "\n\n".join(fences)
            if len(fences) > 1:
                body = f'<div class="code-columns">\n\n{body}\n\n</div>'
            if block.kind == "figure":
                number = re.search(r"\d+", block.caption.text)[0]
                caption = render(block.caption.pieces)
                body = f'<figure id="fig-{number}">\n\n{body}\n\n<figcaption>{caption}</figcaption>\n</figure>'
            out.append(body)
        elif block.kind == "plot":
            caption = block.caption
            number = re.search(r"\d+", caption.text)[0] if caption else "?"
            text = render(caption.pieces) if caption else ""
            out.append(f'<figure id="fig-{number}">\n\n![TODO: describe this figure](fig-{number}.svg)\n\n<figcaption>{text}</figcaption>\n</figure>')
    return tidy_links("\n\n".join(out + notes)) + "\n"


def language_of(lines: list[str], fallback: str) -> str:
    return "lean" if re.match(r"\s*(theorem|lemma)\b", lines[0] if lines else "") else fallback


def tag_references(blocks: list[Block], targets: list[dict], scale: float) -> None:
    """Split the reference list into entries and give each its target's name.

    Entries hang: each first line sits left of the lines that follow it.
    """
    start = next((i for i, b in enumerate(blocks) if b.kind == "heading" and b.lines[0].text == "References"), None)
    if start is None:
        return
    cites = [t for t in targets if t["name"].startswith("cite.")]
    lines = [line for block in blocks[start + 1:] for line in block.lines]
    margin = min(line.left for line in lines)
    entries: list[Block] = []
    for line in lines:
        if line.left <= margin + 3 or not entries:
            near = [t for t in cites if t["page"] == line.page]
            target = min(near, key=lambda t: abs(t["top"] * scale - line.top), default=None)
            key = ""
            if target:
                cites.remove(target)
                key = re.sub(r"[^a-z0-9]+", "-", target["name"].split("@")[-1].lower()).strip("-")
            entries.append(Block("para", line.page, line.top, [line], anchor=f"cite-{key}" if key else ""))
        else:
            entries[-1].lines.append(line)
    del blocks[start + 1:]
    blocks.extend(entries)


def transcribe(slug: str, force: bool) -> None:
    folder = PAPERS / slug
    config = tomllib.loads((folder / "paper.toml").read_text(encoding="utf-8"))
    out = folder / "paper.md"
    if out.exists() and not force:
        raise SystemExit(f"{out.relative_to(ROOT)} exists. It may hold repairs, so it is left alone; use --force to replace it.")
    pdf = folder / config["paper"]["pdf"]
    runs, width, height = read_runs(pdf)
    links, targets, points = read_links(pdf)
    pages = max(run.page for run in runs)
    scale = height / points if points else 1.0
    attach_links(runs, links, scale)
    runs = drop_furniture(runs, height, pages)
    body = common_font(runs)
    margin = Counter(round(r.left) for r in runs if r.font is body).most_common(1)[0][0]
    by_page = [[run for run in runs if run.page == number] for number in range(1, pages + 1)]
    right = Counter(round(r.right) for r in runs if r.font is body).most_common(1)[0][0]
    parts = [part for page in by_page for part in columns_of(page, width)]
    drafted = [page_blocks(part, body, *edges(part, body, margin, right)) for part in parts]
    for index, part_blocks in enumerate(drafted):
        for block in part_blocks:
            block.part = index
    blocks = merge_pages(drafted)
    tag_references(blocks, targets, scale)

    words = re.findall(r"[A-Za-z][\w-]*", " ".join(r.text for r in runs if not r.font.mono))
    known = {w.lower() for w in words}
    dictionary = {w.strip().lower() for w in DICTIONARY.read_text().splitlines()} if DICTIONARY.exists() else set()
    choices: list[str] = []
    language = config.get("reading", {}).get("language", "haskell")
    text = write_markdown(blocks, known, dictionary, choices, language)
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}: {len(blocks)} blocks, {len(text.split())} words")
    print("line-end hyphens to read over:")
    print("  " + ", ".join(choices))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slug")
    parser.add_argument("--force", action="store_true", help="replace an existing paper.md")
    args = parser.parse_args()
    transcribe(args.slug, args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
