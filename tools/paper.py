#!/usr/bin/env python3
"""Turn a folder under papers/ into the data the website reads.

  extract SLUG   build the Lean project and list its declarations; compile
                 the paper's checks/ against it and record their axioms
  check SLUG     check links.json against its PDF or Markdown source and the Lean;
                 compare a PDF's reading copy and print coverage
  build [SLUG]   write web/public/papers/ for the website (all papers by default)
  new SLUG       create an empty paper folder

Standard library only. Needs Poppler for PDF sources, elan for `extract`, and
Node with the packages in web/ for a reading copy or a Markdown source.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reading as reading_copy  # noqa: E402
import physlib_map  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "papers"
PUBLIC = ROOT / "web" / "public" / "papers"
TEMPLATE = ROOT / "tools" / "extract.lean.template"
MARKER = "PROOF_READER_JSON:"

# A declaration somebody wrote starts with one of these words. Everything else
# Lean holds (constructors, recursors, equation lemmas, match helpers) belongs
# to the declaration whose name it extends.
WRITTEN = re.compile(
    r"^\s*(?:@\[[^\]]*\]\s*)*"
    r"(?:(?:private|protected|noncomputable|partial|unsafe|nonrec|scoped|local)\s+)*"
    r"(theorem|lemma|def|abbrev|instance|inductive|structure|class(?:\s+inductive)?|axiom|opaque)\b"
    r"\s*([^\s:({\[]*)"
)
STANDARD_AXIOMS = {"propext", "Quot.sound", "Classical.choice"}
# Reading the ink off a rendered page: how sharply, how dark counts as ink, and
# how much blank margin to leave round it, in points.
INK_DPI = 40
INK = 200
MARGIN = 14
ROLES = ("states", "defines", "proves", "explains", "uses", "mentions", "mirrors")
# A type is read whole: its constructors or fields are its statement.
READ_WHOLE = ("inductive", "structure", "class", "axiom")
PLAIN_LIMIT = 40
VERDICTS = ("same", "stronger", "weaker", "different")
# A check is a theorem or a def it uses, written by us in papers/<slug>/checks/.
CHECK_KEYWORDS = ("theorem", "lemma", "def")
AXIOMS_PRINTED = re.compile(
    r"^'(.+?)' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)", re.M)
# Where this repository's files can be read at one commit, for links to Comparator's files.
REPOSITORY = "https://github.com/wcook04/proof-reader"


class PaperError(Exception):
    pass


def load_paper(slug: str) -> tuple[Path, dict]:
    folder = PAPERS / slug
    config = folder / "paper.toml"
    if not config.is_file():
        raise PaperError(f"no paper called {slug}: {config} is missing")
    return folder, tomllib.loads(config.read_text(encoding="utf-8"))


def lean_project(folder: Path, config: dict) -> Path:
    return folder / config["lean"].get("project", "lean")


def extract(slug: str) -> None:
    folder, config = load_paper(slug)
    project = lean_project(folder, config)
    modules = config["lean"]["modules"]
    print(f"building {project.relative_to(ROOT)} on {(project / 'lean-toolchain').read_text().strip()}")
    subprocess.run(["lake", "build", *modules], cwd=project, check=True, capture_output=True)
    source = TEMPLATE.read_text(encoding="utf-8")
    source = source.replace("__IMPORTS__", "\n".join(f"import {m}" for m in modules))
    source = source.replace("__MODULES__", ", ".join(f"`{m}" for m in modules))
    with tempfile.TemporaryDirectory(prefix="proof-reader-") as scratch:
        driver = Path(scratch) / "ProofReaderDriver.lean"
        driver.write_text(source, encoding="utf-8")
        run = subprocess.run(["lake", "env", "lean", str(driver)], cwd=project, capture_output=True, text=True)
    lines = [line for line in run.stdout.splitlines() if line.startswith(MARKER)]
    if run.returncode != 0 or not lines:
        raise PaperError(f"extraction failed:\n{run.stdout[-1500:]}\n{run.stderr[-1500:]}")
    report = json.loads(lines[-1][len(MARKER):])
    out = folder / "generated" / "lean.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}: {len(report['declarations'])} Lean constants on {report['lean_version']}")
    if (folder / "checks").is_dir():
        extract_checks(folder, project)


def extract_checks(folder: Path, project: Path) -> None:
    """Compile our checks against the authors' Lean and record the axioms each one rests on."""
    files = sorted((folder / "checks").glob("*.lean"))
    report: dict = {"files": {}, "checks": []}
    for path in files:
        text = path.read_text(encoding="utf-8")
        found = check_declarations(text)
        kept = [line for line in text.splitlines() if not line.lstrip().startswith("#print axioms")]
        kept += [f"#print axioms {item['name']}" for item in found]
        with tempfile.TemporaryDirectory(prefix="proof-reader-") as scratch:
            copy = Path(scratch) / path.name
            copy.write_text("\n".join(kept) + "\n", encoding="utf-8")
            run = subprocess.run(["lake", "env", "lean", str(copy.resolve())], cwd=project, capture_output=True, text=True)
        output = run.stdout + run.stderr
        relative = path.relative_to(folder).as_posix()
        if run.returncode != 0 or re.search(r"(^|:)\s*error:", output, re.M):
            raise PaperError(f"{relative} does not compile:\n{output[-3000:]}")
        axioms = parse_axioms(output)
        for item in found:
            if item["name"] not in axioms:
                raise PaperError(f"{relative}: Lean printed no axioms for {item['name']}:\n{output[-3000:]}")
            if "sorryAx" in axioms[item["name"]]:
                raise PaperError(f"{relative}: {item['name']} uses sorry, so it checks nothing:\n{output[-3000:]}")
            report["checks"].append({**item, "file": relative, "axioms": axioms[item["name"]], "status": "checked"})
        report["files"][relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    out = folder / "generated" / "checks.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for item in report["checks"]:
        print(f"  check {item['name']}: axioms [{', '.join(item['axioms'])}]")
    print(f"wrote {out.relative_to(ROOT)}: {len(report['checks'])} checks in {len(files)} files")


def parse_axioms(output: str) -> dict[str, list[str]]:
    """What `#print axioms` reported for each name. Lean may wrap a long list over lines."""
    found = {}
    for match in AXIOMS_PRINTED.finditer(output):
        found[match[1]] = [a.strip() for a in match[2].split(",") if a.strip()] if match[2] is not None else []
    return found


def check_declarations(text: str) -> list[dict]:
    """The theorems and defs of a check file, in file order, each with its docstring."""
    lines = text.splitlines()
    starts = []
    for number, line in enumerate(lines, 1):
        match = WRITTEN.match(line)
        if match and not line[:1].isspace():
            first = number
            if number > 1 and lines[number - 2].rstrip().endswith("-/"):
                first = number - 1
                while first > 1 and "/--" not in lines[first - 1]:
                    first -= 1
            starts.append((first, number, match.group(1).split()[0], match.group(2)))
    found = []
    for index, (first, at, keyword, name) in enumerate(starts):
        stop = starts[index + 1][0] - 1 if index + 1 < len(starts) else len(lines)
        last = stop
        while last > at and (not lines[last - 1].strip() or lines[last - 1].lstrip().startswith("#")):
            last -= 1
        if keyword not in CHECK_KEYWORDS:
            continue
        doc_lines = "\n".join(lines[first - 1:at - 1])
        doc = " ".join(doc_lines.replace("/--", " ").replace("-/", " ").split())
        found.append({"name": name, "keyword": "def" if keyword == "def" else "theorem", "line": first,
                      "end_line": last, "code": "\n".join(lines[first - 1:last]), "doc": doc})
    return found


def load_checks(folder: Path) -> dict:
    path = folder / "generated" / "checks.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"files": {}, "checks": []}


def stale_checks(folder: Path, recorded: dict) -> list[str]:
    """Check files changed, added or removed since `extract` last compiled them."""
    current = {path.relative_to(folder).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
               for path in sorted((folder / "checks").glob("*.lean"))} if (folder / "checks").is_dir() else {}
    return sorted(name for name in set(current) | set(recorded) if current.get(name) != recorded.get(name))


def comparison_problems(links: dict, written: dict, ids: set, check_names: set, required: list[str]) -> list[str]:
    """A paper carries its comparisons, or says why they are held and carries none."""
    if str(links.get("fidelity_held", "")).strip():
        return ["fidelity_held: a paper whose comparisons are held carries none in links.json"] if links.get("fidelity") else []
    return fidelity_problems(links.get("fidelity", {}), written, ids, check_names, required)


def fidelity_problems(fidelity: dict, written: dict, ids: set, check_names: set, required: list[str]) -> list[str]:
    """Each comparison names a declaration, a verdict, its reasons and checks that exist."""
    errors = []
    for name, entry in fidelity.items():
        if name not in written:
            errors.append(f"fidelity: no Lean declaration called {name}")
        if entry.get("verdict") not in VERDICTS:
            errors.append(f"fidelity of {name}: verdict must be one of {VERDICTS}")
        if not str(entry.get("text", "")).strip():
            errors.append(f"fidelity of {name}: text is empty")
        if not entry.get("because") or any(b not in ids for b in entry["because"]):
            errors.append(f"fidelity of {name}: `because` must name passages that exist")
        for check_name in entry.get("checks", []):
            if check_name not in check_names:
                errors.append(f"fidelity of {name}: no check called {check_name} in generated/checks.json")
    missing = [name for name in required if name not in fidelity]
    if missing:
        errors.append("fidelity: compare the paper's statement with the Lean for each claim's declaration "
                      f"and each axiom of the authors; missing: {', '.join(missing)}")
    return errors


def module_file(project: Path, module: str) -> Path:
    return project / (module.replace(".", "/") + ".lean")


def declaration_line(lines: list[str], first: int, last: int) -> int:
    """The line of a declaration's keyword. Lean starts the range at a docstring or attribute."""
    line = first
    if lines[line - 1].lstrip().startswith("/--"):
        while line < last and "-/" not in lines[line - 1]:
            line += 1
        line += 1
    while line < last and not WRITTEN.match(lines[line - 1]):
        line += 1
    return line


def written_name(declared: str) -> str:
    """The name Lean gives a written declaration: `_root_.` only places it, and «» only quote."""
    return declared.removeprefix("_root_.").replace("«", "").replace("»", "")


def read_lean_report(folder: Path) -> dict:
    """generated/lean.json, or its gzip copy for a project too large to keep uncompressed."""
    plain, packed = folder / "generated" / "lean.json", folder / "generated" / "lean.json.gz"
    if plain.is_file():
        return json.loads(plain.read_text(encoding="utf-8"))
    if packed.is_file():
        return json.loads(gzip.decompress(packed.read_bytes()).decode("utf-8"))
    raise PaperError(f"{plain} is missing: run python3 tools/paper.py extract {folder.name}")


def shards(folder: Path, config: dict) -> tuple[dict, dict]:
    """The declarations people wrote, each with the rest folded into it."""
    report = read_lean_report(folder)
    project = lean_project(folder, config)
    texts = {m: module_file(project, m).read_text(encoding="utf-8") for m in report["modules"]}
    rows = {d["name"]: d for d in report["declarations"]}
    written: dict[str, dict] = {}
    for name, row in rows.items():
        if row["line"] is None or row["kind"] == "constructor":
            continue
        source = texts[row["module"]].splitlines()
        at = declaration_line(source, row["line"], row["end_line"])
        match = WRITTEN.match(source[at - 1])
        if not match:
            continue
        # Lean gives Ty.rec and Ty.casesOn the lines of `inductive Ty`, so the
        # declared name has to agree. An instance may have no written name.
        keyword, declared = match.group(1).split()[0], written_name(match.group(2))
        if name == declared or name.endswith(f".{declared}") or (keyword == "instance" and not declared):
            written[name] = {**row, "line": at, "keyword": keyword}

    def owner(name: str) -> str | None:
        probe = name
        while probe:
            if probe in written:
                return probe
            probe = probe.rpartition(".")[0]
        return None

    # What a declaration's statement mentions, and what only its proof or body
    # needs. A proof term repeats its binders' types, so a name in the type is a
    # statement use even when the value mentions it as well.
    uses: dict[str, dict[str, str]] = {name: {} for name in written}
    for name, row in rows.items():
        home = owner(name)
        if home is None:
            continue
        whole = written[home]["keyword"] in READ_WHOLE and row["kind"] == "constructor"
        for field in ("type_dependencies", "value_dependencies", "structural_dependencies"):
            in_statement = field == "type_dependencies" and (name == home or whole)
            for dep in row[field]:
                target = owner(dep)
                if target and target != home:
                    if in_statement:
                        uses[home][target] = "statement"
                    else:
                        uses[home].setdefault(target, "proof")
    # An extracted report defaults to lean; a mixed edition can set source-read as
    # its default, then identify retained extraction per declaration.
    provenance = report.get("provenance") or {"kind": "lean"}
    if provenance["kind"] not in ("lean", "source-read"):
        raise PaperError(f"generated/lean.json: unknown provenance {provenance['kind']!r}")
    return {"written": written, "uses": uses, "texts": texts, "lean_version": report["lean_version"],
            "provenance": provenance, "rows": rows, "owner": owner}, rows


# Names Lean makes for itself, never written by the authors (after the Plectis maths
# site's declaration-graph extractor). They are not boundary names a reader needs.
GENERATED = re.compile(
    r"^(?:_.*|eq_\d+|eq_def|eq_unfold|proof_\d+|match_\d+|injEq|inj|sizeOf_spec|ctorIdx|"
    r"noConfusionType|noConfusion|rec|recOn|casesOn|below|brecOn|binductionOn|ibelow|"
    r"induct|mutual_induct|fun_cases|ext_iff|ext|congr_simp|.*_def_\d+|inst.*)$")


def statement_sheets(claims: list[dict], declarations: list[dict], passages: list[dict], shard_info: dict) -> list[dict]:
    """One sheet per claim: its theorems, then every declaration its statement needs, leaves
    first, each with the authors' prose where a passage links it, and the names where the
    closure leaves the authors' project. A theorem's proof is not followed; a definition's
    body is, because the body is what the definition means."""
    by_id = {d["id"]: d for d in declarations}
    prose = {}
    for p in passages:
        # The authors' reading of a declaration: sentences that state, define or explain it,
        # never a line of code or a passing use.
        if p.get("code") or p.get("role") not in ("states", "defines", "explains", "proves"):
            continue
        for name in p.get("lean", []):
            prose.setdefault(name, []).append(p["id"])
    rows, owner = shard_info["rows"], shard_info["owner"]
    sheets = []
    for claim in claims:
        heads = [n for n in claim.get("lean", []) if n in by_id]
        if not heads:
            continue
        order: list[str] = []
        seen: set[str] = set()

        def visit(name: str) -> None:
            if name in seen or name not in by_id:
                return
            seen.add(name)
            d = by_id[name]
            follow = d["uses_statement"] if d["keyword"] in ("theorem", "lemma") else d["uses"]
            for target in follow:
                visit(target)
            order.append(name)

        for head in heads:
            visit(head)
        members = [n for n in order if n not in heads]
        boundary: dict[str, list[str]] = {}
        for name in [*heads, *members]:
            theorem = by_id[name]["keyword"] in ("theorem", "lemma")
            for row_name, row in rows.items():
                if owner(row_name) != name:
                    continue
                fields = ("type_dependencies",) if theorem and row_name == name else ("type_dependencies", "value_dependencies")
                for field in fields:
                    for dep in row.get(field, []):
                        if owner(dep) is None and not GENERATED.match(dep.rpartition(".")[2]):
                            boundary.setdefault(dep, []).append(name)

        def entry(name: str) -> dict:
            d = by_id[name]
            said = prose.get(name, [])
            return {"id": name, "prose": said, "reading": "authors" if said else "note" if d.get("note") else "none"}

        explained = sum(1 for n in members if prose.get(n))
        sheets.append({"claim": claim["id"], "title": claim.get("title", ""), "heads": [entry(n) for n in heads],
                       "entries": [entry(n) for n in members], "explained": explained, "total": len(members),
                       "boundary": [{"name": n, "used_by": sorted(set(u))} for n, u in sorted(boundary.items())]})
    return sheets


def statement_end(lines: list[str], first: int, last: int, keyword: str) -> int:
    """The last line of a declaration's statement: what comes before its proof or body."""
    if keyword in READ_WHOLE:
        return last
    depth = 0
    for number in range(first, last + 1):
        text = lines[number - 1].split("--")[0]
        if number > first and depth == 0 and text.lstrip().startswith("|"):
            return number - 1
        for match in re.finditer(r":=|[(\[{⟨]|[)\]}⟩]", text):
            if match[0] == ":=":
                if depth == 0:
                    return number if text[:match.start()].strip() else number - 1
            elif match[0] in "([{⟨":
                depth += 1
            else:
                depth = max(0, depth - 1)
        if depth == 0 and re.search(r"\bwhere\s*$", text):
            return number
    return last


def comment_above(lines: list[str], first: int) -> list[int] | None:
    """The block comment that sits directly above a declaration, if there is one."""
    line = first - 1
    while line > 0 and (not lines[line - 1].strip() or lines[line - 1].lstrip().startswith("@[")):
        line -= 1
    if line < 1 or not lines[line - 1].rstrip().endswith("-/"):
        return None
    end = line
    while line > 0 and not lines[line - 1].lstrip().startswith("/-"):
        line -= 1
    return [line, end] if line > 0 else None


def normal(word: str) -> str:
    word = unicodedata.normalize("NFKC", word)
    return word.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("−", "-")


def pdf_words(pdf: Path) -> tuple[list[dict], list[tuple[float, float]]]:
    """Every word of the PDF with its page and box, leaving out running heads."""
    with tempfile.TemporaryDirectory(prefix="proof-reader-") as scratch:
        out = Path(scratch) / "bbox.html"
        subprocess.run(["pdftotext", "-bbox", str(pdf), str(out)], check=True)
        raw = out.read_text(encoding="utf-8")
    words: list[dict] = []
    sizes: list[tuple[float, float]] = []
    page_pattern = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">')
    word_pattern = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
    for line in raw.splitlines():
        page = page_pattern.search(line)
        if page:
            sizes.append((float(page[1]), float(page[2])))
            continue
        word = word_pattern.search(line)
        if word and sizes:
            box = [float(word[i]) for i in range(1, 5)]
            height = sizes[-1][1]
            if box[1] < 0.075 * height or box[3] > 0.945 * height:
                continue
            words.append({"page": len(sizes), "box": box, "text": normal(html.unescape(word[5]))})
    return drop_running_heads(words, sizes), sizes


def drop_running_heads(words: list[dict], sizes: list[tuple[float, float]]) -> list[dict]:
    """Leave out lines repeated at one height near the edge of many pages."""
    lines: dict[tuple[int, int], list[dict]] = {}
    for word in words:
        lines.setdefault((word["page"], round(word["box"][1])), []).append(word)
    seen: dict[tuple[str, int], set[int]] = {}
    for (page, top), row in lines.items():
        height = sizes[page - 1][1]
        if top < height * 0.12 or top > height * 0.9:
            shape = re.sub(r"\d+", "#", " ".join(w["text"] for w in sorted(row, key=lambda w: w["box"][0])))
            seen.setdefault((shape, top), set()).add(page)
    repeated = {key for key, pages in seen.items() if len(pages) >= max(3, len(sizes) * 0.3)}
    drop: set[int] = set()
    for (page, top), row in lines.items():
        shape = re.sub(r"\d+", "#", " ".join(w["text"] for w in sorted(row, key=lambda w: w["box"][0])))
        if (shape, top) in repeated:
            drop.update(id(w) for w in row)
    return [word for word in words if id(word) not in drop]


def dark_box(image: bytes) -> tuple[int, int, int, int] | None:
    """The box of pixels with ink in them, in a binary greyscale PGM image."""
    header = re.match(rb"P5\s+(\d+)\s+(\d+)\s+255\s", image)
    if not header:
        raise PaperError("pdftoppm did not write a greyscale image")
    width, height = int(header[1]), int(header[2])
    raster = image[header.end():]
    columns: set[int] = set()
    rows = []
    for row in range(height):
        dark = [x for x, value in enumerate(raster[row * width:(row + 1) * width]) if value < INK]
        if dark:
            rows.append(row)
            columns.update((dark[0], dark[-1]))
    return (min(columns), rows[0], max(columns) + 1, rows[-1] + 1) if rows else None


def ink_box(pdf: Path, sizes: list[tuple[float, float]]) -> list[float]:
    """The box holding everything printed on any page, in PDF points.

    Read from a rendering, so figures that stick out past the text are kept.
    """
    with tempfile.TemporaryDirectory(prefix="proof-reader-") as scratch:
        subprocess.run(["pdftoppm", "-r", str(INK_DPI), "-gray", str(pdf), f"{scratch}/page"], check=True)
        boxes = [dark_box(image.read_bytes()) for image in sorted(Path(scratch).glob("page-*.pgm"))]
    boxes = [box for box in boxes if box]
    if not boxes:
        raise PaperError(f"{pdf} has no ink on any page")
    point = 72 / INK_DPI
    width, height = sizes[0]
    return [round(max(0.0, min(b[0] for b in boxes) * point - MARGIN), 1),
            round(max(0.0, min(b[1] for b in boxes) * point - MARGIN), 1),
            round(min(width, max(b[2] for b in boxes) * point + MARGIN), 1),
            round(min(height, max(b[3] for b in boxes) * point + MARGIN), 1)]


def find_mentions(words: list[dict], names: list[str]) -> list[dict]:
    """Every printed occurrence of a Lean name, so each one can open its Lean."""
    pattern = re.compile(
        r"(?<![A-Za-z0-9_'])(" + "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)) + r")(?![A-Za-z0-9_'])"
    )
    found = []
    for word in words:
        x0, y0, x1, y1 = word["box"]
        step = (x1 - x0) / max(1, len(word["text"]))
        for match in pattern.finditer(word["text"]):
            found.append({"name": match[1], "page": word["page"],
                          "rect": [round(x0 + step * match.start(), 1), round(y0, 1), round(x0 + step * match.end(), 1), round(y1, 1)]})
    return found


def find_quote(quote: str, words: list[dict]) -> list[int]:
    """Start indices of the quote, joining words a line break split with a hyphen."""
    target = re.sub(r"\s+", "", normal(quote))
    if not target:
        return []
    hits = []
    for start, first in enumerate(words):
        if not target.startswith(first["text"][: len(target)].rstrip("-")):
            continue
        built, index = "", start
        while index < len(words) and len(built) < len(target):
            piece = words[index]["text"]
            if not target.startswith(built + piece) and piece.endswith("-"):
                piece = piece[:-1]
            built += piece
            index += 1
            if not target.startswith(built[: len(target)]):
                break
        if built.startswith(target):
            hits.append(start)
    return hits


def span_rects(quote: str, start: int, words: list[dict]) -> tuple[int, list[list[float]], int]:
    """The boxes of a quote: one rectangle per printed line."""
    target = re.sub(r"\s+", "", normal(quote))
    built, index = "", start
    used = []
    while len(built) < len(target):
        word = words[index]
        piece = word["text"]
        if not target.startswith(built + piece) and piece.endswith("-"):
            piece = piece[:-1]
        built += piece
        used.append(word)
        index += 1
    rects: list[list[float]] = []
    page = used[0]["page"]
    for word in used:
        if word["page"] != page:
            continue
        box = word["box"]
        if rects and abs(rects[-1][1] - box[1]) < 4 and box[0] >= rects[-1][0] - 1:
            rects[-1][2] = max(rects[-1][2], box[2])
            rects[-1][3] = max(rects[-1][3], box[3])
            rects[-1][1] = min(rects[-1][1], box[1])
        else:
            rects.append(list(box))
    return page, [[round(v, 1) for v in r] for r in rects], used[-1]["page"]


def load_links(folder: Path) -> dict:
    path = folder / "links.json"
    if not path.is_file():
        return {"schema": 1, "claims": [], "passages": [], "notes": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def paper_source(folder: Path, config: dict) -> dict:
    """A paper has one author source. Markdown is not a PDF transcription."""
    paper = config["paper"]
    kinds = [kind for kind in ("pdf", "markdown") if paper.get(kind)]
    if len(kinds) != 1:
        raise PaperError("[paper] needs exactly one of pdf or markdown")
    kind = kinds[0]
    path = folder / paper[kind]
    if not path.is_file():
        raise PaperError(f"source is missing: {path}")
    if kind == "markdown" and config.get("reading", {}).get("figure"):
        raise PaperError("[reading] figure crops require a PDF source")
    return {"kind": kind, "file": paper[kind], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def markdown_images(folder: Path, rendered: str) -> dict[str, str]:
    """Validate local Markdown images and retain their hashes with the source."""
    images = {}
    for encoded in re.findall(r'data-figure="([^"]+)"', rendered):
        name = html.unescape(encoded)
        parts = name.split("/")
        if (not name or any(part in ("", ".", "..") for part in parts)
                or any(char in name for char in '\\?#:<>%"')
                or Path(name).is_absolute()):
            raise PaperError(f"[reading] image path must stay within the paper folder: {name}")
        path = (folder / name).resolve()
        if not path.is_relative_to(folder.resolve()):
            raise PaperError(f"[reading] image path escapes the paper folder: {name}")
        if not path.is_file():
            raise PaperError(f"[reading] image is missing: {name}")
        images[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(images.items()))


def resolve(slug: str) -> dict:
    """Check every link. Any quote or name that cannot be found stops the build."""
    folder, config = load_paper(slug)
    shard_info, _ = shards(folder, config)
    written = shard_info["written"]
    links = load_links(folder)
    source = paper_source(folder, config)
    markdown_render = None
    markdown_passages = {}
    if source["kind"] == "markdown":
        language = config.get("reading", {}).get("language", "lean")
        markdown_render, resolved = reading_copy.resolve_markdown(folder / source["file"], slug, links["passages"], language)
        images = markdown_images(folder, markdown_render["html"])
        if images:
            source["images"] = images
        markdown_passages = {p["id"]: p for p in resolved}
        words, sizes = [], []
    else:
        words, sizes = pdf_words(folder / source["file"])
    errors: list[str] = []
    passages = []
    ids = set()
    for item in links["passages"]:
        pid = item["id"]
        if pid in ids:
            errors.append(f"passage {pid}: repeated id")
        ids.add(pid)
        if source["kind"] == "markdown":
            resolved = markdown_passages[pid]
        else:
            hits = find_quote(item["quote"], words)
            if item.get("page"):
                hits = [h for h in hits if words[h]["page"] == item["page"]]
            if len(hits) != 1:
                errors.append(f"passage {pid}: quote found {len(hits)} times, needs exactly one: {item['quote'][:70]!r}")
                continue
            page, rects, last = span_rects(item["quote"], hits[0], words)
            resolved = {**item, "page": page, "rects": rects, "order": hits[0], "last_page": last}
        for name in item.get("lean", []):
            if name not in written:
                errors.append(f"passage {pid}: no Lean declaration called {name}")
        if item.get("lines"):
            first, last_line = item["lines"]
            home = written.get(item["lean"][0]) if item.get("lean") else None
            if not home or first < home["line"] or last_line > home["end_line"] or first > last_line:
                errors.append(f"passage {pid}: lines {first} to {last_line} are not inside {item.get('lean', ['?'])[0]}")
        if item.get("role") not in ROLES:
            errors.append(f"passage {pid}: role must be one of {ROLES}")
        passages.append(resolved)
    passages.sort(key=lambda p: p["order"])
    claims = links.get("claims", [])
    # A claim is the top of a map, so a page without a graph (a standard, an index of
    # definitions) may have none.
    if not claims and config["paper"].get("graph", True):
        errors.append("links.json needs at least one claim: each claim is the top of a map")
    for claim in claims:
        for name in claim.get("lean", []):
            if name not in written:
                errors.append(f"claim {claim['id']}: no Lean declaration called {name}")
        if claim.get("passage") not in ids:
            errors.append(f"claim {claim['id']}: no passage called {claim.get('passage')}")
    for name in links.get("show_also", []):
        if name not in written:
            errors.append(f"show_also: no Lean declaration called {name}")
    for name, title in links.get("plain", {}).items():
        if name not in written:
            errors.append(f"plain: no Lean declaration called {name}")
        problem = plain_problem(name, title)
        if problem:
            errors.append(f"plain title for {name}: {problem}")
    for name, note in links.get("notes", {}).items():
        if name not in written:
            errors.append(f"note: no Lean declaration called {name}")
        # A note rests on the passages it names, or, for a reading note on the Lean itself
        # (`"on": "lean"`), on the declaration's own source; either way every named passage exists.
        grounded = note.get("because") or note.get("on") == "lean"
        if not grounded or any(b not in ids for b in note.get("because", [])):
            errors.append(f"note on {name}: `because` must name passages that exist")
    problem = shelf_problem(config, links["passages"])
    if problem:
        errors.append(problem)
    checks = load_checks(folder)
    check_names = {c["name"] for c in checks["checks"]}
    check_titles = config.get("checks", {}).get("titles", {})
    for name, title in check_titles.items():
        if name not in check_names:
            errors.append(f"checks.titles: no supplementary proof called {name}")
        if not isinstance(title, str) or not title.strip():
            errors.append(f"checks.titles: {name} needs a nonempty title")
    by_passage = {p["id"]: p for p in passages}
    for passage in passages:
        for name in passage.get("checks", []):
            if name not in check_names:
                errors.append(f"passage {passage['id']}: no supplementary proof called {name}")
    for claim in claims:
        supporting = by_passage.get(claim["passage"], {}).get("checks", [])
        for name in claim.get("checks", []):
            if name not in supporting:
                errors.append(f"claim {claim['id']}: supplementary proof {name} is not attached to its passage")
    stale = stale_checks(folder, checks["files"])
    if stale:
        errors.append(f"checks changed since extract last compiled them ({', '.join(stale)}): "
                      f"run python3 tools/paper.py extract {slug}")
    claimed = [name for claim in claims for name in claim.get("lean", []) if name in written]
    required = list(dict.fromkeys(claimed + sorted(
        name for name in reachable(claimed, shard_info["uses"]) if written[name]["keyword"] == "axiom")))
    errors += comparison_problems(links, written, ids, check_names, required)
    if errors:
        raise PaperError("\n".join(errors))
    return {"folder": folder, "config": config, "shards": shard_info, "links": links, "passages": passages,
            "sizes": sizes, "words": words, "checks": checks["checks"], "required": required,
            "source": source, "markdown_render": markdown_render}


def plain_problem(name: str, title: str) -> str | None:
    """A plain title is words a newcomer can read, short enough for a card."""
    if not title.strip():
        return "it is empty"
    if len(title) > PLAIN_LIMIT:
        return f"keep it to {PLAIN_LIMIT} characters"
    if title == name or re.fullmatch(r"\S*[a-z][A-Z]\S*", title):
        return "it reads like a Lean name"
    return None


def reachable(goals: list[str], uses: dict) -> set[str]:
    seen: set[str] = set()
    todo = list(goals)
    while todo:
        name = todo.pop()
        if name not in seen:
            seen.add(name)
            todo.extend(uses.get(name, {}))
    return seen


def challenge_statements(text: str) -> dict[str, list[int]]:
    """Each theorem a Comparator challenge states, by its full name: the lines from its
    keyword to the line that opens its proof."""
    lines = text.splitlines()
    spaces: list[str] = []
    found: dict[str, list[int]] = {}
    for number, line in enumerate(lines, 1):
        opened = re.match(r"namespace\s+(\S+)\s*$", line)
        closed = re.match(r"end\s+(\S+)\s*$", line)
        if opened:
            spaces.append(opened[1])
        elif closed and spaces and spaces[-1] == closed[1]:
            spaces.pop()
        match = WRITTEN.match(line)
        if match and not line[:1].isspace() and match.group(1).split()[0] in ("theorem", "lemma"):
            name = ".".join([*spaces, match.group(2)])
            if name in found:
                raise PaperError(f"the challenge states {name} twice")
            end = statement_end(lines, number, len(lines), "theorem")
            # A challenge's proof is `sorry`, so the statement runs to the line before it. This
            # matters when the statement itself holds a `:=`, as a `let` does.
            for later in range(number, len(lines) + 1):
                if lines[later - 1].strip() == "sorry":
                    end = max(end, later - 1)
                    break
                if later > number and WRITTEN.match(lines[later - 1]) and not lines[later - 1][:1].isspace():
                    break
            found[name] = [number, end]
    return found


def built_commit() -> str | None:
    """The commit this build reads, so links to the repository's files stay fixed."""
    for key in ("PROOF_READER_COMMIT", "GITHUB_SHA"):
        if os.environ.get(key, "").strip():
            return os.environ[key].strip()
    if (ROOT / ".git").exists():
        run = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True)
        if run.returncode == 0 and re.fullmatch(r"[0-9a-f]{40}", run.stdout.strip()):
            return run.stdout.strip()
    return None


def comparator_evidence(folder: Path, config: dict) -> dict | None:
    """What Comparator checked for this paper, read from its run's files.

    `[comparator] evidence` in paper.toml names a folder holding the challenge, the
    solution, the configuration, the run's receipt and the rejected control; papers that
    show the same Lean name one shared folder. A file that does not match the receipt's
    hash, or a theorem name the challenge does not state, stops the build."""
    wanted = config.get("comparator", {}).get("evidence")
    if not wanted:
        return None
    where = (folder / wanted).resolve()
    if not where.is_relative_to(PAPERS.resolve()) or not where.is_dir():
        raise PaperError(f"[comparator] evidence must be a folder under papers/: {wanted}")
    try:
        receipt = json.loads((where / "receipt.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise PaperError(f"[comparator] {wanted} has no receipt.json") from None
    accepted, control = receipt.get("accepted", {}), receipt.get("rejected_control", {})
    hashes = receipt.get("sha256", {})
    files = {"challenge": "Challenge.lean", "solution": "Solution.lean", "config": accepted.get("config", "")}
    for name in (*files.values(), control.get("config", "")):
        if not name or not (where / name).is_file():
            raise PaperError(f"[comparator] {wanted}: {name or 'a configuration'} named by receipt.json is missing")
    for name in files.values():
        if name not in hashes:
            raise PaperError(f"[comparator] {wanted}: receipt.json records no sha256 for {name}")
    for name, digest in hashes.items():
        path = where / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise PaperError(f"[comparator] {wanted}: {name} does not match the sha256 in receipt.json")
    setup = json.loads((where / files["config"]).read_text(encoding="utf-8"))
    names = setup.get("theorem_names", [])
    if not names or names != accepted.get("theorem_names"):
        raise PaperError(f"[comparator] {wanted}: receipt.json and {files['config']} name different theorems")
    if setup.get("permitted_axioms") != receipt.get("permitted_axioms"):
        raise PaperError(f"[comparator] {wanted}: receipt.json and {files['config']} permit different axioms")
    output = accepted.get("output", [])
    if accepted.get("exit") != 0 or "Your solution is okay!" not in output:
        raise PaperError(f"[comparator] {wanted}: receipt.json does not record an accepted run")
    kernel = next((line[: -len(" accepts the solution")] for line in output if line.endswith(" accepts the solution")), None)
    if not kernel:
        raise PaperError(f"[comparator] {wanted}: receipt.json does not record which kernel accepted the solution")
    mode = receipt.get("mode", "")
    # Only the one reading the page can state is accepted; a receipt saying anything else
    # about --paranoid needs the page's wording extended first.
    if "--paranoid was not completed" not in mode:
        raise PaperError(f"[comparator] {wanted}: receipt.json mode must record that --paranoid was not completed")
    rejected = next((m for line in control.get("output", [])
                     for m in [re.search(r"statement do not match: '([^']+)'", line)] if m), None)
    if not control.get("exit") or not rejected or not control.get("change"):
        raise PaperError(f"[comparator] {wanted}: receipt.json does not record a rejected control")
    control_challenge = (Path(control["config"]).parent / "Challenge.lean").as_posix()
    challenge = (where / "Challenge.lean").read_text(encoding="utf-8")
    stated = challenge_statements(challenge)
    missing = [n for n in names if n not in stated]
    if missing:
        raise PaperError(f"[comparator] {wanted}: Challenge.lean states no theorem called {', '.join(missing)}")
    commit = built_commit()
    if not commit:
        print("  no commit known (set PROOF_READER_COMMIT): Comparator links point at main", file=sys.stderr)
    base = f"{REPOSITORY}/blob/{commit or 'main'}/{where.relative_to(ROOT.resolve()).as_posix()}"
    lines = challenge.splitlines()
    theorems = {}
    for name in names:
        first, last = stated[name]
        theorems[name] = {"first": first, "last": last, "statement": "\n".join(lines[first - 1:last]),
                          "url": f"{base}/Challenge.lean#L{first}-L{last}"}
    return {
        "folder": where.relative_to(ROOT.resolve()).as_posix(), "commit": commit,
        "run": receipt["run"], "date": receipt["date"], "run_commit": receipt.get("commit"),
        "toolchain": receipt["toolchain"], "sandbox": receipt["sandbox"], "kernel": kernel,
        "paranoid": "not completed",
        "permitted_axioms": receipt["permitted_axioms"],
        "links": {"challenge": f"{base}/Challenge.lean", "solution": f"{base}/{files['solution']}",
                  "config": f"{base}/{files['config']}", "receipt": f"{base}/receipt.json",
                  "control": f"{base}/{control_challenge}"},
        "control": {"change": control["change"], "theorem": rejected[1]},
        "limits": receipt.get("limits", ""),
        "imports": receipt.get("imports", ""),
        "theorems": theorems,
    }


def evaluation_summary(folder: Path, config: dict) -> dict | None:
    """A matcher's results against the authors' own links, when the paper keeps them:
    `[evaluation] summary` names a JSON file in the paper's folder."""
    name = config.get("evaluation", {}).get("summary")
    if not name:
        return None
    path = folder / name
    if not path.is_file():
        raise PaperError(f"[evaluation] summary is missing: {name}")
    summary = json.loads(path.read_text(encoding="utf-8"))
    for key in ("matcher", "method", "columns", "rows", "findings", "misses", "records"):
        if key not in summary:
            raise PaperError(f"{name}: needs {key!r}")
    return summary


def edition(slug: str) -> dict:
    data = resolve(slug)
    config, shard_info, links = data["config"], data["shards"], data["links"]
    written, uses, texts = shard_info["written"], shard_info["uses"], shard_info["texts"]
    # `show_also` names declarations the page lists although no passage names them, such as
    # lemmas used only inside proofs that carry a reading note.
    roots = [name for item in (*links["claims"], *data["passages"]) for name in item.get("lean", [])]
    roots += links.get("show_also", [])
    keep = reachable(roots, uses)
    used_by: dict[str, list[str]] = {name: [] for name in keep}
    for name in keep:
        for target in uses[name]:
            if target in keep:
                used_by[target].append(name)

    def split(names: list[str], statement: bool, kind_of) -> list[str]:
        return sorted(n for n in names if (kind_of(n) == "statement") == statement)

    untitled = sorted(name for name in keep if name not in links.get("plain", {}))
    if untitled:
        raise PaperError(f"links.json needs a plain title for each declaration under \"plain\": {', '.join(untitled)}")
    linked: dict[str, list[str]] = {name: [] for name in keep}
    for passage in data["passages"]:
        for name in passage.get("lean", []):
            linked.setdefault(name, []).append(passage["id"])
    # Published source keys are independent of where a paper keeps its project.
    # In particular, sibling papers can share a project without exposing `..`
    # in source links or asking a browser to resolve a filesystem path.
    project_root = "lean"
    notes = links.get("notes", {})
    comparisons = links.get("fidelity", {})
    annotation_html = render_notes({
        **{n: notes[n]["text"] for n in keep if n in notes},
        **{f"comparison {n}": comparisons[n]["text"] for n in keep if n in comparisons},
    })
    declarations = []
    for name in sorted(keep, key=lambda n: (written[n]["module"], written[n]["line"])):
        row = written[name]
        axioms = row["axioms"]
        lines = texts[row["module"]].splitlines()
        declarations.append({
            "id": name, "plain": links["plain"][name], "keyword": row["keyword"], "kind": row["kind"], "type": row["type"],
            "file": f"{project_root}/{row['module'].replace('.', '/')}.lean", "line": row["line"], "end_line": row["end_line"],
            "lines": row["end_line"] - row["line"] + 1,
            "statement_end": statement_end(lines, row["line"], row["end_line"], row["keyword"]),
            "comment": comment_above(lines, row["line"]),
            "uses": sorted(t for t in uses[name] if t in keep),
            "uses_statement": split([t for t in uses[name] if t in keep], True, lambda t: uses[name][t]),
            "uses_proof": split([t for t in uses[name] if t in keep], False, lambda t: uses[name][t]),
            "used_by": sorted(used_by[name]),
            "used_by_statement": split(used_by[name], True, lambda user: uses[user][name]),
            "used_by_proof": split(used_by[name], False, lambda user: uses[user][name]),
            "axioms": sorted(a for a in axioms if a not in STANDARD_AXIOMS and a not in ("sorryAx", name)),
            "standard_axioms": sorted(a for a in axioms if a in STANDARD_AXIOMS),
            "passages": linked.get(name, []),
            "note": note_entry(notes.get(name), annotation_html.get(name)),
            "fidelity": fidelity_of(comparisons.get(name), annotation_html.get(f"comparison {name}")),
            # Where these facts come from, per declaration: "lean" (read by Lean from the
            # compiled module), "statement-compiled" (only the statement compiled here) or
            # "source-read" (read from the source by hand).
            "provenance": row.get("provenance") or shard_info["provenance"]["kind"],
            "doc": row.get("doc"),
        })
    names = [d["id"] for d in declarations if d["id"] not in links.get("unlinked_names", [])]
    setting = None
    if data["source"]["kind"] == "markdown":
        setting = reading_copy.build_markdown(data["markdown_render"], slug, data["passages"], names, config["paper"].get("url", ""),
                                              links.get("name_sections"), config.get("reading", {}).get("companions"))
        display_quotes = setting.pop("display_quotes")
        quote_html = setting.pop("quote_html")
        for passage in data["passages"]:
            passage["quote"] = display_quotes[passage["id"]]
            # The same words set as the reading copy sets them; `quote` stays the plain text.
            passage["quote_html"] = quote_html[passage["id"]]
    elif (data["folder"] / "paper.md").is_file():
        setting = reading_copy.build(data["folder"], slug, data["passages"], names, data["words"],
                                     config.get("reading", {}), links)
    if setting:
        # Blocks move between the PDF and the reading copy, so tie order follows the reader.
        place = {pid: index for index, pid in enumerate(setting.pop("order"))}
        data["passages"].sort(key=lambda p: place[p["id"]])
        in_code = setting.pop("code")
        for passage in data["passages"]:
            passage["code"] = passage["id"] in in_code
    paragraphs = setting.pop("paragraphs") if setting else {}
    examples = shelf_examples(config, data["passages"], paragraphs, written, texts, links.get("plain", {}))
    named_in_paper = [d["id"] for d in declarations if d["passages"]]
    custom = sorted(d["id"] for d in declarations if d["keyword"] == "axiom")
    # An empty list is an axiom report only for a declaration read from a compiled module.
    reported = [d for d in declarations if d["provenance"] == "lean"]
    fidelity = links.get("fidelity", {})
    paper = config["paper"]
    # In reading order, so a page can say plainly where the ties begin and stop.
    tied_sections = list(dict.fromkeys(p["section"] for p in data["passages"]))
    check_titles = config.get("checks", {}).get("titles", {})
    return {
        "schema": 1, "slug": slug,
        "source": data["source"],
        "paper": {**paper, "pages": len(data["sizes"]), "sizes": data["sizes"],
                  "crop": ink_box(data["folder"] / paper["pdf"], data["sizes"]) if data["source"]["kind"] == "pdf" else None},
        "lean": {**{k: v for k, v in config["lean"].items() if k != "project"},
                 "toolchain": (lean_project(data["folder"], config) / "lean-toolchain").read_text().strip(),
                 "version": shard_info["lean_version"],
                 "provenance": shard_info["provenance"],
                 "files": {f"{project_root}/{m.replace('.', '/')}.lean": text for m, text in texts.items()}},
        "credit": config.get("credit", {}),
        "claims": links.get("claims", []),
        "passages": [{k: v for k, v in p.items() if k != "order"} for p in data["passages"]],
        "mentions": find_mentions(data["words"], names),
        "declarations": declarations,
        "checks": [{**c, "title": check_titles[c["name"]]} if c["name"] in check_titles else c for c in data["checks"]],
        **({"check_source_lines": config["checks"]["source_lines"]} if config.get("checks", {}).get("source_lines") else {}),
        "comparator": comparator_evidence(data["folder"], config),
        "shelf": {"example": examples[0] if examples else None, "examples": examples},
        "sheets": statement_sheets(links.get("claims", []), declarations, data["passages"], shard_info),
        "coverage": {"sections": tied_sections, "ties": len(data["passages"])},
        "evaluation": evaluation_summary(data["folder"], config),
        "reading": {k: v for k, v in setting.items() if k != "html"} if setting else None,
        "reading_html": setting["html"] if setting else None,
        "analytics": {
            "declarations": len(declarations),
            "linked_to_paper": len(named_in_paper),
            "not_linked": sorted(set(keep) - set(named_in_paper)),
            "axioms": custom,
            "resting_on_axioms": {a: sorted(d["id"] for d in reported if a in d["axioms"]) for a in custom},
            "free_of_axioms": sorted(d["id"] for d in reported if d["keyword"] in ("theorem", "lemma") and not written[d["id"]]["axioms"]),
            "standard_axioms": {a: sorted(d["id"] for d in reported if a in d["standard_axioms"]) for a in sorted(STANDARD_AXIOMS)},
            "sorry": sorted(d["id"] for d in reported if "sorryAx" in written[d["id"]]["axioms"]),
            "proof_lines": sum(d["lines"] for d in declarations if d["keyword"] in ("theorem", "lemma")),
            "pages_with_links": sorted({p["page"] for p in data["passages"] if p["page"] is not None}),
            "fidelity": {
                "required": data["required"],
                **{verdict: sorted(n for n, e in fidelity.items() if e["verdict"] == verdict) for verdict in VERDICTS},
                "refuted_by_check": sorted(n for n, e in fidelity.items() if e.get("checks")),
            },
        },
    }


def shelf_ids(config: dict):
    """The passages `[shelf] example` names: one id or a list, in the order given. None without one."""
    wanted = config.get("shelf", {}).get("example")
    if wanted is None:
        return None
    return [wanted] if isinstance(wanted, str) else wanted


def shelf_problem(config: dict, passages: list[dict]) -> str | None:
    """Each of the front page's examples must name a passage tied to Lean, once."""
    wanted = shelf_ids(config)
    if wanted is None:
        return None
    if not isinstance(wanted, list) or not wanted or not all(isinstance(w, str) for w in wanted):
        return "[shelf] example: give one passage id or a list of passage ids"
    seen = set()
    for pid in wanted:
        if pid in seen:
            return f"[shelf] example: passage {pid!r} is named twice"
        seen.add(pid)
        found = next((p for p in passages if p["id"] == pid), None)
        if not found:
            return f"[shelf] example: no passage called {pid!r} in links.json"
        if not found.get("lean"):
            return f"[shelf] example: passage {pid!r} names no Lean declaration"
    return None


def example_code(lines: list[str], first: int, last: int, decl_first: int, decl_last: int) -> list[dict]:
    """The authors' lines from two before a passage's first to its last, kept inside the declaration."""
    return [{"n": n, "text": lines[n - 1]} for n in range(max(decl_first, first - 2), min(decl_last, last) + 1)]


def shelf_examples(config: dict, passages: list[dict], paragraphs: dict, written: dict, texts: dict, plain: dict) -> list[dict]:
    """Linked sentences and their Lean lines, for the front page, in the order named. Empty without a [shelf] table."""
    wanted = shelf_ids(config)
    if wanted is None:
        return []
    problem = shelf_problem(config, passages)
    if problem:
        raise PaperError(problem)
    label = config.get("reading", {}).get("page_label")
    project_root = "lean"
    examples = []
    for pid in wanted:
        passage = next(p for p in passages if p["id"] == pid)
        name = passage["lean"][0]
        row = written[name]
        if name not in plain:
            raise PaperError(f"[shelf] example: links.json needs a plain title for {name}")
        lines = texts[row["module"]].splitlines()
        decl_first, decl_last = row["line"], row["end_line"]
        if passage.get("lines"):
            first, last = passage["lines"]
        else:
            first, last = decl_first, statement_end(lines, decl_first, decl_last, row["keyword"])
        around = paragraphs.get(pid) or {"before": "", "after": ""}
        examples.append({
            "id": pid, "section": passage.get("section", ""),
            "page_label": (label.format(page=passage["page"]) if label else str(passage["page"])) if passage["page"] is not None else "",
            "source_lines": passage.get("source_lines"),
            "before": around["before"], "quote": passage["quote"], "after": around["after"],
            "name": name, "plain": plain[name], "keyword": row["keyword"],
            "file": f"{project_root}/{row['module'].replace('.', '/')}.lean",
            "decl_first": decl_first, "decl_last": decl_last, "first": first, "last": last,
            "code": example_code(lines, first, last, decl_first, decl_last),
            "role": passage.get("role"),
        })
    return examples


def shelf_example(config: dict, passages: list[dict], paragraphs: dict, written: dict, texts: dict, plain: dict) -> dict | None:
    """The first of the front page's examples. None without a [shelf] table."""
    examples = shelf_examples(config, passages, paragraphs, written, texts, plain)
    return examples[0] if examples else None


def render_notes(texts: dict[str, str]) -> dict[str, str]:
    """Notes typeset as the reader shows them: $…$ as KaTeX, `…` as code. Plain notes
    without either need no typesetting, so the renderer runs only when one has them."""
    wanted = {n: t for n, t in texts.items() if "$" in t or "`" in t}
    if not wanted:
        return {}
    done = subprocess.run(["node", str(ROOT / "web" / "tools" / "render-paper.mjs"), "--notes"],
                          input=json.dumps(wanted), capture_output=True, text=True, cwd=ROOT / "web")
    if done.returncode != 0:
        raise PaperError(f"could not typeset the notes:\n{done.stderr[-1500:]}")
    return json.loads(done.stdout)


def note_entry(note: dict | None, html_text: str | None) -> dict | None:
    """What the page shows of a note: its text (and typeset form), the passages it rests on,
    whether it is a reading note on the Lean, and an optional longer summary title."""
    if not note:
        return None
    entry = {"text": note["text"], "because": note.get("because", [])}
    for key in ("on", "summary"):
        if note.get(key):
            entry[key] = note[key]
    if html_text:
        entry["html"] = html_text
    return entry


def fidelity_of(entry: dict | None, html_text: str | None = None) -> dict | None:
    if not entry:
        return None
    return {"verdict": entry["verdict"], "text": entry["text"], "because": entry["because"], "checks": entry.get("checks", [])}


def check(slug: str) -> None:
    built = edition(slug)
    stats = built["analytics"]
    print(f"{slug}: every quote found once and every Lean name exists")
    if built["reading"]:
        origin = "rendered from the Markdown source; exact raw quotes and block anchors checked" if built["source"]["kind"] == "markdown" else "none differing from the PDF"
        print(f"  reading copy: {built['reading']['words']} words and {built['reading']['formulas']} formulas, {origin}")
    where = f", on pages {stats['pages_with_links']}" if built["source"]["kind"] == "pdf" else ""
    print(f"  {stats['linked_to_paper']} of {stats['declarations']} declarations tied to the paper{where}")
    evidence = Counter(d["provenance"] for d in built["declarations"])
    if evidence.keys() - {"lean"}:
        labels = {"lean": "from compiled modules", "statement-compiled": "statement only (proof not built)", "source-read": "read from source"}
        print("  declaration evidence: " + "; ".join(f"{evidence[kind]} {label}" for kind, label in labels.items() if evidence[kind]))
    if stats["not_linked"]:
        print(f"  not tied yet: {', '.join(stats['not_linked'])}")
    for axiom, names in stats["resting_on_axioms"].items():
        print(f"  axiom {axiom} carries: {', '.join(names)}")
    fidelity = stats["fidelity"]
    held = load_links(PAPERS / slug).get("fidelity_held")
    if held:
        print(f"  comparisons held: {held}")
    for verdict in VERDICTS:
        names = fidelity[verdict]
        print(f"  compared as {verdict}: {len(names)}" + (f" ({', '.join(names)})" if names else ""))
    for item in built["checks"]:
        print(f"  check {item['name']} rests on: {', '.join(item['axioms']) or 'no axioms'}")
    evidence = built["comparator"]
    if evidence:
        shown = {d["id"] for d in built["declarations"]}
        on_page = [name for name in evidence["theorems"] if name in shown]
        print(f"  Comparator evidence from {evidence['folder']}: {len(on_page)} of {len(evidence['theorems'])} "
              f"checked theorems on this page" + (f" ({', '.join(on_page)})" if on_page else ""))


def build(slugs: list[str]) -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        built = edition(slug)
        folder = PAPERS / slug
        out = PUBLIC / slug
        out.mkdir(exist_ok=True)
        page = built.pop("reading_html")
        (out / "reading.html").unlink(missing_ok=True)
        if page:
            (out / "reading.html").write_text(page, encoding="utf-8")
            if built["source"]["kind"] == "pdf":
                crop_figures(folder / built["paper"]["pdf"], built, out, load_paper(slug)[1])
        # The first screen needs neither: the Lean's text and the names on the PDF come on demand.
        source = {"files": built["lean"].pop("files"), "mentions": built.pop("mentions")}
        (out / "source.json").write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")
        (out / "edition.json").write_text(json.dumps(built, ensure_ascii=False), encoding="utf-8")
        if built["source"]["kind"] == "pdf":
            (out / "source.md").unlink(missing_ok=True)
            shutil.copyfile(folder / built["paper"]["pdf"], out / "paper.pdf")
            subprocess.run(["pdftocairo", "-png", "-singlefile", "-f", "1", "-l", "1", "-scale-to", "420",
                            str(folder / built["paper"]["pdf"]), str(out / "first-page")], check=True)
        else:
            (out / "paper.pdf").unlink(missing_ok=True)
            (out / "first-page.png").unlink(missing_ok=True)
            # The authors' Markdown, byte for byte, under one name whatever the paper calls it.
            shutil.copyfile(folder / built["source"]["file"], out / "source.md")
            for name in built["source"].get("images", {}):
                target = out / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(folder / name, target)
        print(f"built {slug}")
    write_shelf()


def crop_figures(pdf: Path, built: dict, out: Path, config: dict) -> None:
    """Plots stay the authors' own: each is cut from the PDF as vector artwork."""
    for figure in config.get("reading", {}).get("figure", []):
        x0, y0, x1, y1 = figure["box"]
        target = out / figure["name"]
        subprocess.run(["pdftocairo", "-svg", "-f", str(figure["page"]), "-l", str(figure["page"]), "-x", str(int(x0)), "-y", str(int(y0)),
                        "-W", str(int(x1 - x0)), "-H", str(int(y1 - y0)), "-paperw", str(int(x1 - x0)), "-paperh", str(int(y1 - y0)), str(pdf), str(target)],
                       check=True)


def write_shelf() -> None:
    """List every built paper, and remove any whose folder has gone."""
    known = all_papers()
    for built in PUBLIC.iterdir():
        if built.is_dir() and built.name not in known:
            shutil.rmtree(built)
    shelf = []
    for slug in known:
        path = PUBLIC / slug / "edition.json"
        if not path.is_file():
            continue
        built = json.loads(path.read_text(encoding="utf-8"))
        source = json.loads((PUBLIC / slug / "source.json").read_text(encoding="utf-8"))
        entry = shelf_entry(slug, built, source["files"])
        listing = load_paper(slug)[1].get("shelf", {})
        if listing.get("with"):
            entry["with"] = listing["with"]
            entry["place"] = int(listing.get("place", 0))
        if listing.get("group"):
            entry["group"] = str(listing["group"])
        shelf.append(entry)
    parents = {e["slug"] for e in shelf if "with" not in e}
    for e in shelf:
        if "with" in e and e["with"] not in parents:
            raise SystemExit(f"{e['slug']}: [shelf] with = {e['with']!r} names no paper listed on its own")
    (PUBLIC / "index.json").write_text(json.dumps({"papers": shelf}, ensure_ascii=False), encoding="utf-8")


def shelf_entry(slug: str, built: dict, files: dict[str, str]) -> dict:
    """What the front page shows of one paper, read from its built edition."""
    paper = built["paper"]
    used = sorted({d["file"] for d in built["declarations"]})
    return {
        "slug": slug, "title": paper["title"], "short_title": paper.get("short_title") or paper["title"],
        "authors": paper["authors"], "venue": paper.get("venue", ""),
        "source_kind": built.get("source", {}).get("kind", "pdf"), "noun": paper.get("noun") or "paper",
        "declarations": built["analytics"]["declarations"],
        "lean": {"files": len(used), "lines": sum(len(files[f].splitlines()) for f in used),
                 "version": built["lean"]["version"], "provenance": built["lean"].get("provenance", {"kind": "lean"})["kind"], "axioms": len(built["analytics"]["axioms"]),
                 "sorry": len(built["analytics"]["sorry"])},
        "linked": len(built["passages"]),
        "example": (built.get("shelf", {}).get("examples") or [None])[0],
        "examples": built.get("shelf", {}).get("examples", []),
    }


def all_papers() -> list[str]:
    return sorted(p.parent.name for p in PAPERS.glob("*/paper.toml"))


def new(slug: str) -> None:
    folder = PAPERS / slug
    if folder.exists():
        raise PaperError(f"{folder} already exists")
    (folder / "lean").mkdir(parents=True)
    (folder / "paper.toml").write_text((ROOT / "docs" / "paper.toml.example").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"created {folder.relative_to(ROOT)}: add paper.pdf or the Markdown source and the Lean project, then fill in paper.toml")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("extract", "check", "build", "new"))
    parser.add_argument("slug", nargs="?")
    args = parser.parse_args()
    try:
        if args.command == "build":
            if args.slug != physlib_map.SLUG:
                build([args.slug] if args.slug else all_papers())
            if args.slug in (None, physlib_map.SLUG):
                physlib_map.build()
        elif not args.slug:
            parser.error("this command needs a paper name")
        elif args.command == "check" and args.slug == physlib_map.SLUG:
            # An API map has no paper.toml. Building it verifies its citations, glossary and
            # source lines against the pinned tracker index.
            physlib_map.build()
        else:
            {"extract": extract, "check": check, "new": new}[args.command](args.slug)
    except (PaperError, reading_copy.ReadingError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
