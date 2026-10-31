// The Lean page: the step in hand with each declaration it touches, or the list of
// every declaration, or the authors' whole file. The tab is part of the address.

import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import type { Edition, Passage } from "../app/edition";
import type { Tab } from "../app/history";
import { routeHref } from "../app/router";
import { DeclLink, LeanCode, useFileLines, type LeanActions } from "../lean/code";
import { sectionLabel, shapeOf } from "../model/fromEdition";
import { READING_LINE } from "../paper/reading-line";
import { DeclBlock, KIND_WORDS, foldWord, list } from "./DeclBlock";

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
  tab: Tab;
  onTab(tab: Tab): void;
  onPassage(id: string): void;
  act: LeanActions;
}

const SHORT_PROOF = 8;

export const LeanPage = memo(function LeanPage({ ref, edition, step, open, tab, onTab, onPassage, act }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Set(edition.declarations.map((d) => d.id)), [edition]);
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
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !open) {
      shownOpen.current = false;
      return;
    }
    const was = shownKey.current;
    if (was === step.key && shownOpen.current) return;
    if (was !== step.key && shownOpen.current) tops.current.set(was, el.scrollTop);
    shownKey.current = step.key;
    shownOpen.current = true;
    const kept = tops.current.get(step.key);
    if (kept !== undefined) {
      el.scrollTop = kept;
      return;
    }
    el.scrollTop = 0;
    const row = el.querySelector<HTMLElement>(step.exact ? `.decl .source__line[data-line="${step.exact[0]}"]` : ".decl .source__line");
    const paper = document.querySelector<HTMLElement>("[data-paper-pane]");
    if (!row || !paper) return;
    const box = el.getBoundingClientRect();
    const line = paper.getBoundingClientRect().top + paper.clientHeight * READING_LINE - box.top;
    const room = Math.max(64, Math.min(line, el.clientHeight * 0.6));
    el.scrollTop = Math.max(0, row.getBoundingClientRect().top - box.top - room);
  }, [open, step]);

  return (
    <section className="leaf" aria-label="Lean">
      <div className="leaf__tabs" role="group" aria-label="What the Lean page shows">
        <button type="button" aria-pressed={tab === "step"} onClick={() => onTab("step")}>This step</button>
        <button type="button" aria-pressed={tab === "file"} onClick={() => onTab("file")}>Whole file</button>
        <button type="button" aria-pressed={tab === "index"} onClick={() => onTab("index")}>Index</button>
      </div>
      <div className="leaf__body" ref={body} tabIndex={-1}>
        {tab === "index" ? (
          <AllDeclarations edition={edition} act={act} />
        ) : tab === "file" ? (
          <WholeFile edition={edition} step={step} act={act} names={names} scroller={body} />
        ) : (
          <>
            {step.untied && (
              <>
                <Untied edition={edition} untied={step.untied} onPassage={onPassage} />
                <AllDeclarations edition={edition} act={act} />
              </>
            )}
            {step.passage && (
              <header className="stepline">
                {step.title && <p className="stepline__title">{step.title}</p>}
                <blockquote>{step.passage.quote}</blockquote>
              </header>
            )}
            {!step.untied && <Crumbs edition={edition} id={step.decls[0]} onPassage={onPassage} />}
            {!step.untied && step.decls.map((id) => {
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
                />
              );
            })}
          </>
        )}
      </div>
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
    const key = p ? `${p.section}/${p.page}` : "";
    if (!p || seen.has(key)) return [];
    seen.add(key);
    return [p];
  });
  return (
    <nav className="crumbs" aria-label={`Where the paper discusses ${d.plain}`}>
      <span>In the paper</span>
      {stops.map((p) => (
        <a key={p.id} href={routeHref({ paper: edition.slug, record: `@${p.id}` })} onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          onPassage(p.id);
        }}>{sectionLabel(p.section)}, page {p.page}</a>
      ))}
    </nav>
  );
}

function Untied({ edition, untied, onPassage }: { edition: Edition; untied: NonNullable<Step["untied"]>; onPassage(id: string): void }) {
  const tied = edition.coverage.sections.map(sectionLabel);
  const last = untied.last;
  return (
    <div className="untied">
      <h3>{untied.section ? `Nothing in ${untied.section} is tied to the Lean.` : "Nothing here is tied to the Lean."}</h3>
      <p>The {edition.coverage.ties} ties on this page are in {list(tied)}. {edition.lean.scope}</p>
      <p className="untied__go">
        {last && <button type="button" onClick={() => onPassage(last.id)}>Go to the last tie, in {sectionLabel(last.section)}</button>}
      </p>
    </div>
  );
}

function AllDeclarations({ edition, act }: { edition: Edition; act: LeanActions }) {
  const { analytics, declarations, slug } = edition;
  const standard = Object.entries(analytics.standard_axioms);
  return (
    <div className="index">
      <h3>Axioms, as Lean reports them</h3>
      {analytics.axioms.length === 0 && <p>The authors state no axioms.</p>}
      {analytics.axioms.map((name) => (
        <p key={name}>
          <DeclLink paper={slug} name={name} act={act} className="declname declname--axiom" /> is the authors’ axiom, assumed and not proved.{" "}
          {(analytics.resting_on_axioms[name] ?? []).length > 0 ? <>{list(analytics.resting_on_axioms[name])} rest on it.</> : <>Nothing here rests on it.</>}
          {analytics.free_of_axioms.length > 0 && <> {list(analytics.free_of_axioms)} do not.</>}
        </p>
      ))}
      <p>
        Lean’s own standard axioms: {list(standard.map(([name, users]) => `${name} (${users.length ? list(users) : "not used"})`))}.
        {" "}{analytics.sorry.length ? <strong>sorry appears in {list(analytics.sorry)}.</strong> : <>No declaration here uses sorry.</>}
      </p>
      <h3>All {declarations.length} declarations</h3>
      <table>
        <thead>
          <tr><th scope="col">Declaration</th><th scope="col">Kind</th><th scope="col">Lines</th><th scope="col">In the paper</th></tr>
        </thead>
        <tbody>
          {declarations.map((d) => {
            const sections = [...new Set(d.passages.map((id) => edition.passages.find((p) => p.id === id)?.section).filter((s): s is string => !!s))];
            return (
              <tr key={d.id} data-shape={shapeOf(d)}>
                <th scope="row"><DeclLink paper={slug} name={d.id} act={act} className="declname" /></th>
                <td><i className={`key-shape key-shape--${shapeOf(d)}`} aria-hidden="true" />{KIND_WORDS[d.keyword] ?? d.keyword}</td>
                <td>{d.line}{d.lines > 1 ? ` to ${d.end_line}` : ""}</td>
                <td>{sections.length ? sections.map(sectionLabel).join(", ") : "Not tied"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="index__source">Names, kinds, lines, uses and axioms come from Lean {edition.lean.version} itself, run on the authors’ file. {foldNote(edition)}</p>
    </div>
  );
}

const foldNote = (edition: Edition) => {
  const proofs = edition.declarations.filter((d) => foldWord(d) === "Proof").length;
  return `${proofs} of them are theorems.`;
};

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
