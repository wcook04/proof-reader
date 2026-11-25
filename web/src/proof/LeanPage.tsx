// The Lean page: the step in hand with each declaration it touches, or the list of
// every declaration, or the authors' whole file. The tab is part of the address.

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { declEvidence, hasComparisons, noun, passageLocation, type Edition, type Passage } from "../app/edition";
import type { Tab } from "../app/history";
import { routeHref } from "../app/router";
import { DeclLink, LeanCode, SourcePreview, useFileLines, type LeanActions } from "../lean/code";
import { sectionLabel, shapeOf } from "../model/fromEdition";
import { READING_LINE } from "../paper/reading-line";
import { DeclBlock, KIND_WORDS, list } from "./DeclBlock";
import { AllChecks, checksOf, EvaluationResults, FidelityLines, HowMade, MatchSummary, reviewers, StandardStart, SupplementaryProofs } from "./Fidelity";
import { ComparatorIndex } from "./Comparator";
import { MadeLink } from "./MadeLink";
import { Quote } from "../paper/Quote";

export interface Step {
  /** Names the view, so its scroll can be kept while something else is previewed. */
  key: string;
  title: string | null;
  passage: Passage | null;
  /** Declarations to show, first the one the exact lines belong to. */
  decls: string[];
  exact: [number, number] | null;
  /** Set when nothing here is tied: which section, and the last tie before it. */
  untied: { section: string | null; last: Passage | null } | null;
}

const LINK_CAVEAT = (who: string) => `An AI agent read each statement and its Lean, linked them and compared what the two say. ${who} have not reviewed the links or the comparisons. Where a comparison cites a Lean proof, the proof is shown with it.`;
const LINK_CAVEAT_PLAIN = (who: string) => `An AI agent read each statement and its Lean and linked them. ${who} have not reviewed these links.`;

export interface LeanPageHandle {
  top(): number;
  setTop(top: number): void;
}

interface Props {
  ref?: Ref<LeanPageHandle>;
  edition: Edition;
  step: Step;
  /** Open on the right page; a closed page keeps its folds. */
  open: boolean;
  /** Where a reload found this page. It loads on demand, so it is told on arrival. */
  startTop: number;
  tab: Tab;
  onTab(tab: Tab): void;
  onPassage(id: string): void;
  act: LeanActions;
  /** In the combined pane, a button opens the same thing in the Lean view. */
  onOpenLean?(): void;
}

const SHORT_PROOF = 8;

export const LeanPage = memo(function LeanPage({ ref, edition, step, open, startTop, tab, onTab, onPassage, act, onOpenLean }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Set(edition.declarations.map((d) => d.id)), [edition]);
  const typeOf = useMemo(() => {
    const types = new Map(edition.declarations.map((d) => [d.id, d.type]));
    return (name: string) => types.get(name);
  }, [edition]);
  // The reader's own folds outlast the step that showed them.
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(new Map());
  const tops = useRef(new Map<string, number>());
  const shownKey = useRef(step.key);

  useImperativeHandle(ref, (): LeanPageHandle => ({
    top: () => body.current?.scrollTop ?? 0,
    setTop: (top) => {
      if (body.current) body.current.scrollTop = top;
    },
  }), []);

  /** Bring a declaration of this step to the top of the page. */
  const goTo = useCallback((id: string) => {
    const block = body.current?.querySelector<HTMLElement>(`.decl[data-decl="${CSS.escape(id)}"]`);
    const pane = body.current;
    if (block && pane) pane.scrollTop += block.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  }, []);

  const toggle = useCallback((id: string) => {
    setChosen((was) => {
      const d = edition.declarations.find((x) => x.id === id);
      if (!d) return was;
      const next = new Map(was);
      next.set(id, !(next.get(id) ?? foldOpen(d, step.exact, step.passage)));
      return next;
    });
  }, [edition, step.exact, step.passage]);

  // A step's Lean comes level with the paper's reading line where that falls inside this
  // pane; a step come back to keeps its place.
  const shownOpen = useRef(false);
  const arriving = useRef(true);
  const supplementary = checksOf(edition, step.passage?.checks ?? []);
  const hasWholeFile = step.decls.length > 0 || !supplementary.length;
  const visibleTab = tab === "file" && !hasWholeFile ? "step" : tab;
  const standard = !!edition.paper.standard;
  const tabWas = useRef(visibleTab);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !open) {
      shownOpen.current = false;
      return;
    }
    // The whole file and the index scroll this same page. Coming back to the step, place
    // it afresh: their scroll position means nothing here.
    const back = visibleTab === "step" && tabWas.current !== "step";
    tabWas.current = visibleTab;
    if (visibleTab !== "step") return;
    const was = shownKey.current;
    if (was === step.key && shownOpen.current && !back) return;
    if (was !== step.key && shownOpen.current) tops.current.set(was, el.scrollTop);
    shownKey.current = step.key;
    shownOpen.current = true;
    if (arriving.current) {
      arriving.current = false;
      if (startTop > 0) {
        el.scrollTop = startTop;
        return;
      }
    }
    const kept = back ? undefined : tops.current.get(step.key);
    if (kept !== undefined) {
      el.scrollTop = kept;
      return;
    }
    el.scrollTop = 0;
    // In the combined view start at the annotation, even if the selected Lean lines
    // are farther down than the dock can show at once.
    const annotated = onOpenLean ? el.querySelector(".decl:has(.decl__note)") : null;
    if (annotated) {
      el.scrollTop = Math.max(0, annotated.getBoundingClientRect().top - el.getBoundingClientRect().top);
      return;
    }
    // Comparator's challenge numbers its own file's lines, so its rows are never the authors'.
    const row = el.querySelector<HTMLElement>(step.exact ? `.decl .source__line[data-line="${step.exact[0]}"]:not(.cmp__code *)` : ".decl .source__line:not(.cmp__code *)");
    const paper = document.querySelector<HTMLElement>("[data-paper-pane]");
    if (!row || !paper) return;
    const box = el.getBoundingClientRect();
    const line = paper.getBoundingClientRect().top + paper.clientHeight * READING_LINE - box.top;
    // The declaration's heading sticks to the top, so the lines in hand rest below it even
    // when the reading line is above this page.
    const head = row.closest(".decl")?.querySelector<HTMLElement>(".decl__head")?.offsetHeight ?? 0;
    // With the reading line above this page, they rest just under the heading: a fixed margin
    // there showed a line and a half of what comes before, the half cut by the heading.
    const room = line < head + 6 ? Math.min(head + 6, el.clientHeight * 0.6) : Math.max(64, Math.min(line, el.clientHeight * 0.6));
    const at = row.getBoundingClientRect().top - box.top;
    let target = at - room;
    // A comparison Lean has checked against the statement is read first, while the lines
    // in hand still fit below it.
    const fits = (from: number) => at - from + row.offsetHeight <= el.clientHeight;
    const first = el.querySelector<HTMLElement>(".decl");
    const top = first ? first.getBoundingClientRect().top - box.top : 0;
    if (el.querySelector(".stepline__fid li[data-flagged]") && fits(0)) target = 0;
    // So is any note or comparison on the card, so that its label stays in view with it.
    else if (first?.querySelector('.fid, .decl__note') && fits(top)) target = Math.min(target, top);
    // The quoted sentence above the card is shown whole or not at all, never cut by the page's top edge.
    if (target > 0 && target < top) target = fits(0) ? 0 : top;
    el.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, visibleTab]);

  return (
    <section className="leaf" aria-label="Lean">
      <div className="leaf__tabs" role="group" aria-label="What the Lean page shows">
        <button type="button" aria-pressed={visibleTab === "step"} onClick={() => onTab("step")}>This step</button>
        <button type="button" aria-pressed={visibleTab === "file"} disabled={!hasWholeFile} onClick={() => onTab("file")}>Whole file</button>
        <button type="button" aria-pressed={visibleTab === "index"} onClick={() => onTab("index")}>Index</button>
        {onOpenLean && <button type="button" className="leaf__open" onClick={onOpenLean}>Open its Lean</button>}
      </div>
      <div className={`leaf__body${visibleTab === "step" && supplementary.length > 0 ? " leaf__body--supplementary" : ""}`} ref={body} tabIndex={-1}>
        {visibleTab === "index" ? (
          <AllDeclarations edition={edition} act={act} />
        ) : visibleTab === "file" ? (
          <WholeFile edition={edition} step={step} act={act} names={names} scroller={body} />
        ) : (
          <>
            {step.untied && (standard ? (
              <StandardStart edition={edition} onPassage={onPassage} onResults={() => onTab("index")} />
            ) : (
              <>
                <Untied edition={edition} untied={step.untied} onPassage={onPassage} />
                <AllDeclarations edition={edition} act={act} />
              </>
            ))}
            {step.passage && (
              <header className="stepline">
                {step.title && (!supplementary.length || step.decls.length > 0) && <p className="stepline__title">{step.title}</p>}
                <blockquote><Quote passage={step.passage} /></blockquote>
                <FidelityLines edition={edition} ids={step.decls} act={act} onGo={goTo} />
                <MatchSummary edition={edition} passage={step.passage} />
              </header>
            )}
            {!step.untied && !standard && <Crumbs edition={edition} id={step.decls[0]} onPassage={onPassage} />}
            {!step.untied && (standard ? step.decls.slice(0, 1) : step.decls).map((id) => {
              const d = edition.declarations.find((x) => x.id === id);
              if (!d) return null;
              return (
                <DeclBlock
                  key={d.id}
                  edition={edition}
                  d={d}
                  passage={step.passage ?? undefined}
                  exact={step.decls[0] === id ? step.exact : null}
                  open={chosen.get(d.id) ?? foldOpen(d, step.decls[0] === id ? step.exact : null, step.passage)}
                  onToggle={toggle}
                  onPassage={onPassage}
                  act={act}
                  names={names}
                  compact={standard}
                  linkedDeclarations={id === step.decls[0] && step.decls.length > 1 && (
                    <nav className="crumbs" aria-label="The declarations of this statement">
                      <span>{step.decls.length} linked declarations</span>
                      {standard ? step.decls.slice(1).map((name) => (
                        <a key={name} href={routeHref({ paper: edition.slug, record: name })}>{act.plain(name)}</a>
                      )) : step.decls.map((name) => (
                        <button key={name} type="button" onClick={(event) => {
                          goTo(name);
                          event.currentTarget.blur();
                        }}>{act.plain(name)}</button>
                      ))}
                    </nav>
                  )}
                />
              );
            })}
            {supplementary.length > 0 && <SupplementaryProofs edition={edition} checks={supplementary} act={act} />}
            {step.decls.length > 0 && step.passage && (
              <p className="stepline__caveat stepline__caveat--foot">{(hasComparisons(edition) ? LINK_CAVEAT : LINK_CAVEAT_PLAIN)(reviewers(edition))} <MadeLink onOpen={() => onTab("index")} /></p>
            )}
          </>
        )}
      </div>
      <SourcePreview host={body} act={act} type={typeOf} />
    </section>
  );
});

/** Open where the sentence is about the proof, or where the proof is short enough to read at once. */
function foldOpen(d: Edition["declarations"][number], exact: [number, number] | null, passage: Passage | null): boolean {
  if (exact && exact[1] > d.statement_end) return true;
  if (passage?.role === "proves") return true;
  return d.end_line - d.statement_end <= SHORT_PROOF;
}

/** Where this exists in the paper, each a link. */
function Crumbs({ edition, id, onPassage }: { edition: Edition; id: string | undefined; onPassage(id: string): void }) {
  const d = edition.declarations.find((x) => x.id === id);
  if (!d?.passages.length) return null;
  const seen = new Set<string>();
  const stops = d.passages.flatMap((pid) => {
    const p = edition.passages.find((x) => x.id === pid);
    const key = p ? `${p.section}/${passageLocation(p)}` : "";
    if (!p || seen.has(key)) return [];
    seen.add(key);
    return [p];
  });
  return (
    <nav className="crumbs" aria-label={`Where the ${noun(edition)} discusses ${d.plain}`}>
      <span>In the {noun(edition)}</span>
      {stops.map((p) => (
        <a key={p.id} href={routeHref({ paper: edition.slug, record: `@${p.id}` })} onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onPassage(p.id);
        }}>{sectionLabel(p.section)}, {passageLocation(p)}</a>
      ))}
    </nav>
  );
}

function Untied({ edition, untied, onPassage }: { edition: Edition; untied: NonNullable<Step["untied"]>; onPassage(id: string): void }) {
  const tied = edition.coverage.sections.map(sectionLabel);
  const last = untied.last;
  return (
    <div className="untied">
      <h3>No Lean is linked to this paragraph.</h3>
      <p>{untied.section ? `No statement in ${untied.section} is linked to this Lean.` : "No statement here is linked to this Lean."} The {edition.coverage.ties} statements linked to it are in {list(tied)}. {edition.lean.scope}</p>
      <p className="untied__go">
        {last && <button type="button" onClick={() => onPassage(last.id)}>Go to the last statement, in {sectionLabel(last.section)}</button>}
      </p>
    </div>
  );
}

const sameUsers = (standard: [string, string[]][]) =>
  standard.length > 1 && standard.every(([, users]) => users.length > 0 && [...users].sort().join() === [...standard[0][1]].sort().join());

function AllDeclarations({ edition, act }: { edition: Edition; act: LeanActions }) {
  const { analytics, declarations, slug } = edition;
  const standard = Object.entries(analytics.standard_axioms);
  const extracted = declarations.some((d) => declEvidence(edition, d) === "lean");
  const unreportedProofs = declarations.filter((d) => shapeOf(d) === "theorem" && declEvidence(edition, d) !== "lean").length;
  // A long list of names says less than its count.
  const plain = (names: string[]) => (names.length > 8 ? `${names.length} declarations` : list(names.map((name) => declarations.find((d) => d.id === name)?.plain ?? name)));
  return (
    <div className="index">
      {edition.evaluation && <EvaluationResults evaluation={edition.evaluation} />}
      <HowMade edition={edition} />
      <h3>Axioms, as Lean reports them</h3>
      {!extracted && <p>This edition has no Lean axiom reports.</p>}
      {unreportedProofs > 0 && <p>This edition has no axiom report for {unreportedProofs === 1 ? "one proof" : `${unreportedProofs} proofs`} in the index.</p>}
      {analytics.axioms.map((name) => (
        <p key={name}>
          <DeclLink paper={slug} name={name} act={act} className="declname declname--axiom" /> is an assumption declared by the authors.{" "}
          {(analytics.resting_on_axioms[name] ?? []).length > 0 && <>Lean reports that {plain(analytics.resting_on_axioms[name])} depend on it.</>}
        </p>
      ))}
      {analytics.free_of_axioms.length > 0 && <p>Proofs whose Lean reports list no axioms: {plain(analytics.free_of_axioms)}.</p>}
      {extracted && <p>
        {sameUsers(standard)
          // When every reported proof uses the same standard axioms, one sentence says so
          // instead of listing each proof once per axiom.
          ? <>In the extracted reports, {standard[0][1].length} declarations depend on Lean’s standard axioms {list(standard.map(([name]) => name))}, each on all {standard.length}.</>
          : <>Lean’s standard axioms in the extracted reports: {list(standard.map(([name, users]) => `${name} (${users.length ? plain(users) : "not reported as used"})`))}.</>}
        {" "}{analytics.sorry.length > 0 ? <strong>Lean reports that {plain(analytics.sorry)} use sorry.</strong> : <>The extracted reports list no use of sorry.</>}
      </p>}
      <AllChecks edition={edition} act={act} />
      <ComparatorIndex edition={edition} act={act} />
      <h3>All {declarations.length} declarations</h3>
      <table>
        <thead>
          <tr><th scope="col">Declaration</th><th scope="col">Kind</th><th scope="col">Lines</th><th scope="col">In the {noun(edition)}</th></tr>
        </thead>
        <tbody>
          {declarations.map((d) => {
            const sections = [...new Set(d.passages.map((id) => edition.passages.find((p) => p.id === id)?.section).filter((s): s is string => !!s))];
            return (
              <tr key={d.id} data-shape={shapeOf(d)}>
                <th scope="row"><DeclLink paper={slug} name={d.id} act={act} className="declname" /></th>
                <td><i className={`key-shape key-shape--${shapeOf(d)}`} aria-hidden="true" />{KIND_WORDS[d.keyword] ?? d.keyword}</td>
                <td>{d.line}{d.lines > 1 ? ` to ${d.end_line}` : ""}</td>
                <td>{sections.length ? sections.map(sectionLabel).join(", ") : "Not linked"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WholeFile({ edition, step, act, names, scroller }: { edition: Edition; step: Step; act: LeanActions; names: ReadonlySet<string>; scroller: React.RefObject<HTMLDivElement | null> }) {
  const focus = edition.declarations.find((d) => d.id === step.decls[0]) ?? null;
  const file = focus?.file ?? Object.keys(edition.lean.files)[0];
  const lines = useFileLines(edition.lean.files[file]);
  const lit = useMemo(() => edition.declarations.filter((d) => step.decls.includes(d.id) && d.file === file), [edition, file, step.decls]);
  useEffect(() => {
    const el = scroller.current;
    const line = step.exact?.[0] ?? focus?.line;
    const row = line ? el?.querySelector<HTMLElement>(`.source__line[data-line="${line}"]`) : null;
    if (el && row) el.scrollTop = Math.max(0, row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 48);
  }, [focus, scroller, step.exact]);
  return (
    <div className="wholefile">
      <p className="wholefile__name">{file}, as the authors published it</p>
      <LeanCode paper={edition.slug} lines={lines} from={1} to={lines.length} names={names} on={(line) => lit.some((d) => line >= d.line && line <= d.end_line)} exact={step.exact} act={act} />
    </div>
  );
}
