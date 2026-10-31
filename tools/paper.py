#!/usr/bin/env python3
"""Turn a folder under papers/ into the data the website reads.

  extract SLUG   build the Lean project and list its declarations
  check SLUG     check links.json against the PDF and the Lean; print coverage
  build [SLUG]   write web/public/papers/ for the website (all papers by default)
  new SLUG       create an empty paper folder

Standard library only. Needs Poppler's pdftotext, and elan for `extract`.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unicodedata
from pathlib import Path

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
ROLES = ("states", "defines", "proves", "explains", "uses")


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


def module_file(project: Path, module: str) -> Path:
    return project / (module.replace(".", "/") + ".lean")


def shards(folder: Path, config: dict) -> tuple[dict, dict]:
    """The declarations people wrote, each with the rest folded into it."""
    report = json.loads((folder / "generated" / "lean.json").read_text(encoding="utf-8"))
    project = lean_project(folder, config)
    texts = {m: module_file(project, m).read_text(encoding="utf-8") for m in report["modules"]}
    rows = {d["name"]: d for d in report["declarations"]}
    written: dict[str, dict] = {}
    for name, row in rows.items():
        if row["line"] is None or row["kind"] == "constructor":
            continue
        line = texts[row["module"]].splitlines()[row["line"] - 1]
        match = WRITTEN.match(line)
        if not match:
            continue
        # Lean gives Ty.rec and Ty.casesOn the lines of `inductive Ty`, so the
        # declared name has to agree. An instance may have no written name.
        keyword, declared = match.group(1).split()[0], match.group(2)
        if name == declared or name.endswith(f".{declared}") or (keyword == "instance" and not declared):
            written[name] = {**row, "keyword": keyword}

    def owner(name: str) -> str | None:
        probe = name
        while probe:
            if probe in written:
                return probe
            probe = probe.rpartition(".")[0]
        return None

    uses: dict[str, dict[str, str]] = {name: {} for name in written}
    for name, row in rows.items():
        home = owner(name)
        if home is None:
            continue
        for kind, field in (("value", "value_dependencies"), ("structural", "structural_dependencies"),
                            ("type", "type_dependencies")):
            for dep in row[field]:
                target = owner(dep)
                if target and target != home:
                    uses[home][target] = kind
    return {"written": written, "uses": uses, "texts": texts, "lean_version": report["lean_version"]}, rows


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
    return words, sizes


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


def resolve(slug: str) -> dict:
    """Check every link. Any quote or name that cannot be found stops the build."""
    folder, config = load_paper(slug)
    shard_info, _ = shards(folder, config)
    written = shard_info["written"]
    links = load_links(folder)
    words, sizes = pdf_words(folder / config["paper"]["pdf"])
    errors: list[str] = []
    passages = []
    ids = set()
    for item in links["passages"]:
        pid = item["id"]
        if pid in ids:
            errors.append(f"passage {pid}: repeated id")
        ids.add(pid)
        hits = find_quote(item["quote"], words)
        if item.get("page"):
            hits = [h for h in hits if words[h]["page"] == item["page"]]
        if len(hits) != 1:
            errors.append(f"passage {pid}: quote found {len(hits)} times, needs exactly one: {item['quote'][:70]!r}")
            continue
        page, rects, last = span_rects(item["quote"], hits[0], words)
        for name in item.get("lean", []):
            if name not in written:
                errors.append(f"passage {pid}: no Lean declaration called {name}")
        if item.get("role") not in ROLES:
            errors.append(f"passage {pid}: role must be one of {ROLES}")
        passages.append({**item, "page": page, "rects": rects, "order": hits[0], "last_page": last})
    passages.sort(key=lambda p: p["order"])
    claims = links.get("claims", [])
    for claim in claims:
        for name in claim.get("lean", []):
            if name not in written:
                errors.append(f"claim {claim['id']}: no Lean declaration called {name}")
        if claim.get("passage") not in ids:
            errors.append(f"claim {claim['id']}: no passage called {claim.get('passage')}")
    for name, note in links.get("notes", {}).items():
        if name not in written:
            errors.append(f"note: no Lean declaration called {name}")
        if not note.get("because") or any(b not in ids for b in note["because"]):
            errors.append(f"note on {name}: `because` must name passages that exist")
    if errors:
        raise PaperError("\n".join(errors))
    return {"folder": folder, "config": config, "shards": shard_info, "links": links, "passages": passages,
            "sizes": sizes, "words": words}


def reachable(goals: list[str], uses: dict) -> set[str]:
    seen: set[str] = set()
    todo = list(goals)
    while todo:
        name = todo.pop()
        if name not in seen:
            seen.add(name)
            todo.extend(uses.get(name, {}))
    return seen


def edition(slug: str) -> dict:
    data = resolve(slug)
    config, shard_info, links = data["config"], data["shards"], data["links"]
    written, uses, texts = shard_info["written"], shard_info["uses"], shard_info["texts"]
    goals = [name for claim in links.get("claims", []) for name in claim.get("lean", [])] or config["lean"].get("goals", [])
    keep = reachable(goals, uses) if goals else set(written)
    used_by: dict[str, list[str]] = {name: [] for name in keep}
    for name in keep:
        for target in uses[name]:
            if target in keep:
                used_by[target].append(name)
    linked: dict[str, list[str]] = {name: [] for name in keep}
    for passage in data["passages"]:
        for name in passage.get("lean", []):
            linked.setdefault(name, []).append(passage["id"])
    project_root = config["lean"].get("project", "lean")
    declarations = []
    for name in sorted(keep, key=lambda n: (written[n]["module"], written[n]["line"])):
        row = written[name]
        axioms = row["axioms"]
        declarations.append({
            "id": name, "keyword": row["keyword"], "kind": row["kind"], "type": row["type"],
            "file": f"{project_root}/{row['module'].replace('.', '/')}.lean", "line": row["line"], "end_line": row["end_line"],
            "lines": row["end_line"] - row["line"] + 1,
            "uses": sorted(t for t in uses[name] if t in keep),
            "used_by": sorted(used_by[name]),
            "axioms": sorted(a for a in axioms if a not in STANDARD_AXIOMS and a != name),
            "standard_axioms": sorted(a for a in axioms if a in STANDARD_AXIOMS),
            "passages": linked.get(name, []),
            "note": links.get("notes", {}).get(name),
        })
    named_in_paper = [d["id"] for d in declarations if d["passages"]]
    custom = sorted(d["id"] for d in declarations if d["keyword"] == "axiom")
    paper = config["paper"]
    return {
        "schema": 1, "slug": slug,
        "paper": {**paper, "pages": len(data["sizes"]), "sizes": data["sizes"]},
        "lean": {**{k: v for k, v in config["lean"].items() if k != "project"},
                 "toolchain": (lean_project(data["folder"], config) / "lean-toolchain").read_text().strip(),
                 "version": shard_info["lean_version"],
                 "files": {f"{project_root}/{m.replace('.', '/')}.lean": text for m, text in texts.items()}},
        "credit": config.get("credit", {}),
        "claims": links.get("claims", []),
        "passages": [{k: v for k, v in p.items() if k != "order"} for p in data["passages"]],
        "declarations": declarations,
        "analytics": {
            "declarations": len(declarations),
            "linked_to_paper": len(named_in_paper),
            "not_linked": sorted(set(keep) - set(named_in_paper)),
            "axioms": custom,
            "resting_on_axioms": {a: sorted(d["id"] for d in declarations if a in d["axioms"]) for a in custom},
            "free_of_axioms": sorted(d["id"] for d in declarations if d["keyword"] in ("theorem", "lemma") and not d["axioms"]),
            "proof_lines": sum(d["lines"] for d in declarations if d["keyword"] in ("theorem", "lemma")),
            "pages_with_links": sorted({p["page"] for p in data["passages"]}),
        },
    }


def check(slug: str) -> None:
    built = edition(slug)
    stats = built["analytics"]
    print(f"{slug}: every quote found once and every Lean name exists")
    print(f"  {stats['linked_to_paper']} of {stats['declarations']} declarations tied to the paper, "
          f"on pages {stats['pages_with_links']}")
    if stats["not_linked"]:
        print(f"  not tied yet: {', '.join(stats['not_linked'])}")
    for axiom, names in stats["resting_on_axioms"].items():
        print(f"  axiom {axiom} carries: {', '.join(names)}")


def build(slugs: list[str]) -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    shelf = []
    for slug in slugs:
        built = edition(slug)
        folder = PAPERS / slug
        out = PUBLIC / slug
        out.mkdir(exist_ok=True)
        (out / "edition.json").write_text(json.dumps(built, ensure_ascii=False), encoding="utf-8")
        shutil.copyfile(folder / built["paper"]["pdf"], out / "paper.pdf")
        paper = built["paper"]
        shelf.append({"slug": slug, "title": paper["title"], "authors": paper["authors"], "venue": paper.get("venue", ""),
                      "declarations": built["analytics"]["declarations"]})
        print(f"built {slug}")
    (PUBLIC / "index.json").write_text(json.dumps({"papers": shelf}, ensure_ascii=False), encoding="utf-8")


def new(slug: str) -> None:
    folder = PAPERS / slug
    if folder.exists():
        raise PaperError(f"{folder} already exists")
    (folder / "lean").mkdir(parents=True)
    (folder / "paper.toml").write_text((ROOT / "docs" / "paper.toml.example").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"created {folder.relative_to(ROOT)}: add paper.pdf and the Lean project, then fill in paper.toml")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("extract", "check", "build", "new"))
    parser.add_argument("slug", nargs="?")
    args = parser.parse_args()
    try:
        if args.command == "build":
            build([args.slug] if args.slug else sorted(p.parent.name for p in PAPERS.glob("*/paper.toml")))
        elif not args.slug:
            parser.error("this command needs a paper name")
        else:
            {"extract": extract, "check": check, "new": new}[args.command](args.slug)
    except PaperError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
