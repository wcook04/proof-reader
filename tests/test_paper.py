"""The parts of the pipeline that decide whether a link is real."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import paper
import reading
import transcribe


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


class Statements(unittest.TestCase):
    def test_a_theorem_ends_at_its_assignment(self):
        lines = ["theorem a {x : Nat}", "  : x = x := by", "  rfl"]
        self.assertEqual(paper.statement_end(lines, 1, 3, "theorem"), 2)

    def test_an_assignment_on_its_own_line_is_not_the_statement(self):
        lines = ["def a : Nat -> Nat", "  := fun x => x"]
        self.assertEqual(paper.statement_end(lines, 1, 2, "def"), 1)

    def test_equations_are_the_body(self):
        lines = ["def a : Nat -> Nat", "  | 0 => 0", "  | n => n"]
        self.assertEqual(paper.statement_end(lines, 1, 3, "def"), 1)

    def test_a_named_argument_inside_brackets_does_not_end_it(self):
        lines = ["theorem a (h : f (x := 1) = 2) : True := by", "  trivial"]
        self.assertEqual(paper.statement_end(lines, 1, 2, "theorem"), 1)

    def test_an_instance_ends_at_where(self):
        lines = ["instance a : B where", "  c := 1"]
        self.assertEqual(paper.statement_end(lines, 1, 2, "instance"), 1)

    def test_a_type_is_read_whole(self):
        self.assertEqual(paper.statement_end(["inductive A where", "  | b : A"], 1, 2, "inductive"), 2)

    def test_finds_the_comment_directly_above(self):
        lines = ["/-", "why", "-/", "", "theorem a : True := trivial"]
        self.assertEqual(paper.comment_above(lines, 5), [1, 3])

    def test_code_above_is_no_comment(self):
        self.assertIsNone(paper.comment_above(["def b := 1", "theorem a : True := trivial"], 2))


class PlainTitles(unittest.TestCase):
    def test_words_pass(self):
        self.assertIsNone(paper.plain_problem("isoR", "Contextual round trip"))

    def test_the_raw_name_is_not_a_title(self):
        self.assertIn("Lean name", paper.plain_problem("isoR", "isoR"))

    def test_a_camel_case_name_is_not_a_title(self):
        self.assertIn("Lean name", paper.plain_problem("isoR", "fromIndexOf"))

    def test_a_title_fits_a_card(self):
        self.assertIn("characters", paper.plain_problem("a", "a very long title that will never fit inside a small card"))

    def test_empty_is_refused(self):
        self.assertIn("empty", paper.plain_problem("a", " "))


class Mentions(unittest.TestCase):
    def test_finds_names_inside_punctuation(self):
        found = paper.find_mentions(words("the", "(unembed),", "unembedded"), ["unembed"])
        self.assertEqual([m["name"] for m in found], ["unembed"])

    def test_prefers_the_longer_name(self):
        found = paper.find_mentions(words("STLCCtx"), ["STLC", "STLCCtx"])
        self.assertEqual([m["name"] for m in found], ["STLCCtx"])


class Ink(unittest.TestCase):
    def test_finds_the_box_of_dark_pixels(self):
        white, black = 255, 0
        rows = [[white] * 4, [white, black, white, white], [white, white, black, white]]
        image = b"P5\n4 3\n255\n" + bytes(sum(rows, []))
        self.assertEqual(paper.dark_box(image), (1, 1, 3, 3))

    def test_a_blank_page_has_no_box(self):
        self.assertIsNone(paper.dark_box(b"P5\n2 2\n255\n" + bytes([255] * 4)))


class Rects(unittest.TestCase):
    def test_one_rectangle_per_printed_line(self):
        row = words("one", "two")
        row[1]["box"] = [0.0, 120.0, 8.0, 130.0]
        page, rects, last = paper.span_rects("one two", 0, row)
        self.assertEqual((page, last, len(rects)), (1, 1, 2))


class DeclarationLine(unittest.TestCase):
    def test_a_plain_declaration_stays_where_it_is(self):
        self.assertEqual(paper.declaration_line(["theorem a : True := trivial"], 1, 1), 1)

    def test_skips_a_docstring(self):
        lines = ["/-- Adding zero.", "theorem in prose, not code. -/", "theorem a : True := trivial"]
        self.assertEqual(paper.declaration_line(lines, 1, 3), 3)

    def test_skips_an_attribute_on_its_own_line(self):
        lines = ["/-- Adding zero. -/", "@[simp]", "theorem a : True :=", "  trivial"]
        self.assertEqual(paper.declaration_line(lines, 1, 4), 3)


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


class WordForWord(unittest.TestCase):
    """The reading copy may differ from the PDF only where a line end split a word."""

    def differs(self, theirs, ours):
        return bool(reading.compare(theirs.split(), ours.split())[1])

    def test_the_same_words_pass(self):
        self.assertFalse(self.differs("one two three", "one two three"))

    def test_a_changed_word_is_caught(self):
        self.assertTrue(self.differs("this is a straightforward induction", "this is a simple induction"))

    def test_a_changed_symbol_in_code_is_caught(self):
        self.assertTrue(self.differs("data Ty = Unit | Ty :-> Ty", "data Ty = Unit | Ty :=> Ty"))

    def test_a_dropped_word_is_caught(self):
        self.assertTrue(self.differs("one two three four", "one two four"))

    def test_an_added_word_is_caught(self):
        self.assertTrue(self.differs("one two three", "one two extra three"))

    def test_a_word_split_at_a_line_end_passes(self):
        self.assertFalse(self.differs("type-safe unem- bedding is hard", "type-safe unembedding is hard"))

    def test_a_real_hyphen_broken_at_a_line_end_passes(self):
        self.assertFalse(self.differs("the co-de- Bruijn form", "the co-de-Bruijn form"))

    def test_a_footnote_moved_up_the_page_passes(self):
        theirs = "first words of the page then the end 1 a note at the foot of it"
        ours = "first words of the page 1 a note at the foot of it then the end"
        self.assertFalse(self.differs(theirs, ours))

    def test_a_formula_spaced_differently_passes(self):
        self.assertFalse(self.differs("term λx . ( x , x ) drops", "term λx.(x,x) drops"))

    def test_each_of_our_words_learns_its_pdf_word(self):
        found, _ = reading.compare(["a", "b", "c"], ["a", "b", "c"])
        self.assertEqual(found, {0: 0, 1: 1, 2: 2})


class Setting(unittest.TestCase):
    def test_blocks_end_words(self):
        self.assertEqual(reading.parse("<p>one</p><p>two</p>").visible.split(), ["one", "two"])

    def test_tags_do_not_end_words(self):
        self.assertEqual(reading.parse("<p>un<em>embed</em></p>").visible.split(), ["unembed"])

    def test_entities_read_as_the_reader_sees_them(self):
        self.assertEqual(reading.parse("<p>a -&gt; b</p>").visible.split(), ["a", "->", "b"])

    def test_a_formula_is_one_piece_with_its_reading(self):
        page = reading.parse('<p>so <span class="m" data-m="3">λx.x</span> holds</p>')
        self.assertEqual([p.raw for p in page.parts if p.kind == "math"], ["3"])
        self.assertEqual(page.visible.split(), ["so", "λx.x", "holds"])

    def test_a_script_cannot_get_in(self):
        for source in ("<script>x</script>", '<img src=x onerror="y">', '<a href="javascript:z">', "<iframe>"):
            with self.assertRaises(reading.ReadingError):
                reading.check_tags(source)

    def test_the_tags_a_paper_needs_pass(self):
        reading.check_tags('<figure id="fig-1"><figcaption>x</figcaption></figure><div class="code-columns"></div>')


class Placing(unittest.TestCase):
    def test_a_quote_is_found_across_code_and_prose(self):
        page = reading.parse("<p>We add <code>Star</code>, which introduces it.</p>")
        spots, errors = reading.locate(page, [{"id": "a", "quote": "We add Star, which"}])
        self.assertEqual(errors, [])
        self.assertEqual(page.visible[spots["a"][0]:spots["a"][1]].strip(), "We add Star, which")

    def test_a_quote_that_is_not_there_is_an_error(self):
        _, errors = reading.locate(reading.parse("<p>one two</p>"), [{"id": "a", "quote": "three"}])
        self.assertEqual(len(errors), 1)

    def test_a_repeated_quote_needs_telling_apart(self):
        page = reading.parse("<p>one two</p><p>one two</p>")
        self.assertEqual(len(reading.locate(page, [{"id": "a", "quote": "one two"}])[1]), 1)
        self.assertEqual(reading.locate(page, [{"id": "a", "quote": "one two", "nth": 2}])[1], [])

    def test_only_code_counts_as_a_lean_name(self):
        page = reading.parse("<p>An Index is here, and <code>Index</code> there.</p>")
        found = reading.names_in(page, ["Index"], [], None)
        self.assertEqual(len(found), 1)
        self.assertEqual(page.visible[found[0][0]:found[0][1]], "Index")

    def test_names_keep_to_the_sections_the_lean_covers(self):
        source = '<h2 id="s-3">T</h2><p><code>Ty</code></p><h2 id="s-4">U</h2><p><code>Ty</code></p>'
        page = reading.parse(source)
        ranges = reading.section_ranges(page, [{"id": "s-3"}, {"id": "s-4"}])
        self.assertEqual(len(reading.names_in(page, ["Ty"], ranges, ["3"])), 1)

    def test_a_mark_crossing_code_stays_well_formed(self):
        page = reading.parse("<p>We add <code>Star</code> here</p>")
        spots, _ = reading.locate(page, [{"id": "a", "quote": "add Star here"}])
        out = reading.weave(page, spots, [], {}, [], "./#/x")
        self.assertEqual(out.count('<span class="q" data-p="a">'), 3)
        self.assertEqual(out.count("<code>"), 1)


class Drafting(unittest.TestCase):
    def run_of(self, left, top, text="abcd"):
        font = transcribe.Font(13, "Inconsolata", "#000000", True, False, False, False, False)
        return transcribe.Run(1, top, left, len(text) * 6.7, 17, font, text)

    def test_columns_with_rows_out_of_step_come_apart(self):
        runs = [self.run_of(80, top) for top in (100, 116, 132, 148)] + [self.run_of(114, top, "abcdefghijklmn") for top in (100, 116, 132, 148)]
        runs += [self.run_of(212, top, "wxyz") for top in (108, 124, 140, 156)]
        self.assertEqual(len(transcribe.split_columns(runs)), 2)

    def test_code_in_one_column_stays_whole(self):
        runs = [self.run_of(80, top) for top in (100, 116, 132)] + [self.run_of(120, top) for top in (100, 116, 132)]
        self.assertEqual(len(transcribe.split_columns(runs)), 1)

    def prose(self, left, top, text="some words here"):
        font = transcribe.Font(15, "Libertine", "#000000", False, False, False, False, False)
        return transcribe.Run(1, top, left, 200, 14, font, text)

    def test_a_two_column_page_reads_down_each_column(self):
        runs = [self.prose(50, top) for top in range(100, 400, 18)] + [self.prose(320, top) for top in range(100, 400, 18)]
        parts = transcribe.columns_of(runs, 600)
        self.assertEqual([len(part) for part in parts], [17, 17])
        self.assertTrue(all(run.left == 50 for run in parts[0]))

    def test_a_full_width_title_stays_above_its_columns(self):
        title = self.prose(50, 60, "a title running right across the page")
        title.width = 470
        runs = [title] + [self.prose(50, top) for top in range(100, 300, 18)] + [self.prose(320, top) for top in range(100, 300, 18)]
        parts = transcribe.columns_of(runs, 600)
        self.assertEqual(parts[0], [title])
        self.assertEqual(len(parts), 3)

    def test_code_side_by_side_does_not_make_two_columns(self):
        runs = [self.run_of(50, top) for top in range(100, 300, 18)] + [self.run_of(320, top) for top in range(100, 300, 18)]
        self.assertEqual(len(transcribe.columns_of(runs, 600)), 1)

    def test_a_citation_bracket_stays_outside_its_link(self):
        self.assertEqual(transcribe.tidy_links("[de Bruijn \\[1972](#cite-a)\\]"), "[de Bruijn \\[1972\\]](#cite-a)")

    def test_a_section_sign_joins_its_link(self):
        self.assertEqual(transcribe.tidy_links("(§[3.2](#s-3.2))"), "([§3.2](#s-3.2))")


if __name__ == "__main__":
    unittest.main()
