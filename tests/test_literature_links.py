"""Each passage becomes one Literature Links annotation."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import literature_links

SHA = "0" * 64
COMMIT = "a" * 40


def edition(kind, passages, source=f"https://github.com/owner/repo/tree/{COMMIT}"):
    return {
        "source": {"kind": kind, "sha256": SHA},
        "lean": {"source": source},
        "declarations": [{"id": "Foo.bar", "file": "lean/Foo/Basic.lean"},
                         {"id": "Foo.baz", "file": "lean/Foo/Other.lean"}],
        "claims": [{"id": "main", "title": "The main theorem", "passage": "p1"}],
        "passages": passages,
    }


def pdf_passage(**fields):
    return {"id": "p1", "role": "states", "quote": "every  bar\nis baz", "lean": ["Foo.bar"],
            "page": 3, "last_page": 3, **fields}


class Annotations(unittest.TestCase):
    def test_a_pdf_passage_is_a_quote_on_its_page(self):
        [found] = literature_links.annotations(edition("pdf", [pdf_passage()]))
        self.assertEqual(found, {
            "subject": [{"type": "pdf", "uri": "paper.pdf",
                         "location": {"page": 3, "quote": {"exact": "every bar is baz"}},
                         "sha256": SHA, "role": "states", "title": "The main theorem"}],
            "object": [{"type": "lean", "uri": "https://github.com/owner/repo", "version": COMMIT,
                        "location": {"declaration": "Foo.bar", "module": "Foo.Basic"}}],
            "id": "p1"})

    def test_a_markdown_passage_keeps_its_heading_block_and_quote(self):
        passage = {"id": "m1", "role": "explains", "quote": "shown", "source_quote": "raw `quote`",
                   "anchor": {"heading": "Intro", "block": 2}, "lean": ["Foo.bar"], "title": "A title"}
        [found] = literature_links.annotations(edition("markdown", [passage]))
        self.assertEqual(found["subject"], [{
            "type": "generic", "uri": "source.md",
            "location": {"profile": literature_links.MARKDOWN_PROFILE, "heading": "Intro", "block": 2,
                         "quote": "raw `quote`"},
            "sha256": SHA, "role": "explains", "title": "A title"}])

    def test_a_project_in_a_folder_keeps_the_folder(self):
        folder = f"https://github.com/owner/repo/tree/{COMMIT}/lean"
        [found] = literature_links.annotations(edition("pdf", [pdf_passage()], source=folder))
        self.assertEqual((found["object"][0]["uri"], found["object"][0]["version"]), (folder, COMMIT))

    def test_lines_narrow_only_the_first_declaration(self):
        [found] = literature_links.annotations(edition("pdf", [pdf_passage(lean=["Foo.bar", "Foo.baz"], lines=[4, 6])]))
        self.assertEqual([end["location"] for end in found["object"]], [
            {"declaration": "Foo.bar", "module": "Foo.Basic", "lines": [4, 6]},
            {"declaration": "Foo.baz", "module": "Foo.Other"}])

    def test_an_unlinked_passage_has_an_empty_object(self):
        [found] = literature_links.annotations(edition("pdf", [pdf_passage(lean=[])]))
        self.assertEqual(found["object"], [])

    def test_a_quote_over_a_page_break_is_refused(self):
        with self.assertRaises(ValueError):
            literature_links.annotations(edition("pdf", [pdf_passage(last_page=4)]))

    def test_a_paper_whose_project_has_no_address_gets_no_file(self):
        with tempfile.TemporaryDirectory() as scratch:
            stale = Path(scratch) / literature_links.FILE
            stale.write_text("{}\n", encoding="utf-8")
            literature_links.write(edition("pdf", [pdf_passage()], source=""), Path(scratch))
            self.assertFalse(stale.exists())
            literature_links.write(edition("pdf", [pdf_passage()]), Path(scratch))
            self.assertEqual(len(stale.read_text(encoding="utf-8").splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
