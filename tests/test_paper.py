"""The parts of the pipeline that decide whether a link is real."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import paper


def words(*texts):
    return [{"page": 1, "box": [i * 10.0, 100.0, i * 10.0 + 8, 110.0], "text": t} for i, t in enumerate(texts)]


class FindQuote(unittest.TestCase):
    def test_finds_a_plain_quote(self):
        self.assertEqual(paper.find_quote("the quick fox", words("see", "the", "quick", "fox", "run")), [1])

    def test_joins_a_word_split_at_a_line_break(self):
        self.assertEqual(paper.find_quote("type-safe unembedding", words("type-safe", "unem-", "bedding")), [0])

    def test_curly_and_straight_quotes_match(self):
        self.assertEqual(paper.find_quote("a ‘closed world’ axiom", words("a", "'closed", "world'", "axiom")), [0])

    def test_reports_each_occurrence(self):
        self.assertEqual(paper.find_quote("the fox", words("the", "fox", "and", "the", "fox")), [0, 3])

    def test_misses_words_that_are_not_there(self):
        self.assertEqual(paper.find_quote("the wolf", words("the", "fox")), [])

    def test_a_partial_last_word_still_needs_its_letters(self):
        self.assertEqual(paper.find_quote("the foxes", words("the", "fox")), [])


class Mentions(unittest.TestCase):
    def test_finds_names_inside_punctuation(self):
        found = paper.find_mentions(words("the", "(unembed),", "unembedded"), ["unembed"])
        self.assertEqual([m["name"] for m in found], ["unembed"])

    def test_prefers_the_longer_name(self):
        found = paper.find_mentions(words("STLCCtx"), ["STLC", "STLCCtx"])
        self.assertEqual([m["name"] for m in found], ["STLCCtx"])


class Rects(unittest.TestCase):
    def test_one_rectangle_per_printed_line(self):
        row = words("one", "two")
        row[1]["box"] = [0.0, 120.0, 8.0, 130.0]
        page, rects, last = paper.span_rects("one two", 0, row)
        self.assertEqual((page, last, len(rects)), (1, 1, 2))


class Written(unittest.TestCase):
    def test_keeps_what_people_write(self):
        for line in ("theorem isoL", "private def x", "@[simp] theorem y", "instance foo : Bar", "axiom closedWorld", "noncomputable def z"):
            self.assertTrue(paper.WRITTEN.match(line), line)

    def test_reads_the_declared_name(self):
        self.assertEqual(paper.WRITTEN.match("inductive Ty : Type").group(2), "Ty")
        self.assertEqual(paper.WRITTEN.match("theorem isoL {ts : Ctx}").group(2), "isoL")
        self.assertEqual(paper.WRITTEN.match("class ReifyIndex (ts : Ctx)").group(2), "ReifyIndex")
        self.assertEqual(paper.WRITTEN.match("instance : Foo").group(2), "")

    def test_skips_constructors_and_fields(self):
        for line in ("  | Var : Index ts t -> STLC ts t", "  reify : ProxyTop ts t -> Index ts' t", "deriving Repr"):
            self.assertFalse(paper.WRITTEN.match(line), line)


class Reachable(unittest.TestCase):
    def test_follows_uses_from_the_goals_and_stops(self):
        uses = {"a": {"b": "value"}, "b": {"c": "value"}, "c": {}, "d": {"a": "value"}}
        self.assertEqual(paper.reachable(["a"], uses), {"a", "b", "c"})


if __name__ == "__main__":
    unittest.main()
