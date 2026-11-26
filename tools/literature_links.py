"""A paper's links as Literature Links annotations.

`paper.py build` writes literature-links.jsonl beside each paper's data: one
annotation for each passage in links.json, with the passage as the subject and its
Lean declarations as the object. The format and its checker are at
https://github.com/mathlib-initiative/literature-links.

Standard library only.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

FILE = "literature-links.jsonl"
# The names `paper.py build` gives the source beside this file.
PDF, MARKDOWN = "paper.pdf", "source.md"
# How a passage of a Markdown source is found: an exact quotation that occurs once in
# the source, inside the numbered block under the heading.
MARKDOWN_PROFILE = "https://github.com/wcook04/proof-reader/blob/main/docs/paper-folder.md#markdown-papers"
# A folder of a GitHub repository at a commit, as `[lean] source` names a project.
GITHUB_TREE = re.compile(r"(https://github\.com/[^/]+/[^/]+)/tree/([0-9a-f]{40})(/.+)?")
# The format's white space; a quote writes each run of it as one space.
WHITE_SPACE = re.compile("[\t-\r \x85\xa0  -     　]+")


def lean_end(source: str) -> dict:
    """The Lean project. A project at the root of its repository is the repository at
    that commit; one in a folder keeps the folder's address."""
    if not source:
        raise ValueError("[lean] source must give the Lean project's address for Literature Links")
    tree = GITHUB_TREE.fullmatch(source)
    if not tree:
        return {"type": "lean", "uri": source}
    return {"type": "lean", "uri": source if tree[3] else tree[1], "version": tree[2]}


def subject(built: dict, passage: dict, title: str | None) -> dict:
    if built["source"]["kind"] == "pdf":
        if passage["last_page"] != passage["page"]:
            raise ValueError(f"passage {passage['id']}: runs from page {passage['page']} to page {passage['last_page']}, "
                             "but a Literature Links quote stays on one page")
        end = {"type": "pdf", "uri": PDF, "location": {
            "page": passage["page"], "quote": {"exact": WHITE_SPACE.sub(" ", passage["quote"]).strip()}}}
    else:
        end = {"type": "generic", "uri": MARKDOWN, "location": {
            "profile": MARKDOWN_PROFILE, "heading": passage["anchor"]["heading"],
            "block": passage["anchor"]["block"], "quote": passage["source_quote"]}}
    end["sha256"] = built["source"]["sha256"]
    end["role"] = passage["role"]
    if title:
        end["title"] = title
    return end


def annotations(built: dict) -> list[dict]:
    """One annotation for each passage of a built edition, in reading order."""
    project = lean_end(built["lean"].get("source", ""))
    modules = {d["id"]: d["file"].removeprefix("lean/").removesuffix(".lean").replace("/", ".")
               for d in built["declarations"]}
    titles = {claim["passage"]: claim["title"] for claim in built["claims"]}
    found = []
    for passage in built["passages"]:
        ends = []
        for index, name in enumerate(passage["lean"]):
            location = {"declaration": name, "module": modules[name]}
            # A passage's lines narrow its first declaration.
            if index == 0 and passage.get("lines"):
                location["lines"] = passage["lines"]
            ends.append({**project, "location": location})
        title = passage.get("title") or titles.get(passage["id"])
        found.append({"subject": [subject(built, passage, title)], "object": ends, "id": passage["id"]})
    return found


def write(built: dict, folder: Path) -> None:
    """Write the annotations; a paper whose Lean project has no address gets none."""
    path = folder / FILE
    path.unlink(missing_ok=True)
    if not built["lean"].get("source"):
        return
    lines = (json.dumps(a, ensure_ascii=False, separators=(",", ":")) + "\n" for a in annotations(built))
    path.write_text("".join(lines), encoding="utf-8")
