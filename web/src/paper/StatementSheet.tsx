// The statement sheet: one linear page per claim, built from the edition alone. The
// theorem, then every declaration its statement needs, leaves first, each with its exact
// Lean and the authors' own reading where a sentence of theirs is linked to it. Where the
// closure leaves the authors' project it names the library declarations and stops.
// Each entry links back into the two-pane reader; the page prints as it reads.

import { useEffect, useMemo, useState } from "react";
import { fromLean, leanOrigin, loadSource, noun, passageLocation, type Edition, type SheetEntry } from "../app/edition";
import { Lockup, PaperSourceCredit } from "../app/Family";
import { routeHref } from "../app/router";
import { LeanCode, useFileLines, type LeanActions } from "../lean/code";
import { sectionLabel } from "../model/fromEdition";
import { reviewers, verdictWords } from "../proof/Fidelity";
import "./sheet.css";
import { Quote } from "./Quote";
import { DeclNote } from "../proof/Note";

export function StatementSheet({ edition }: { edition: Edition }) {
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    loadSource(edition.slug).then((s) => live && setFiles(s.files), () => live && setFiles({}));
    document.title = `${edition.paper.short_title}: statement sheet · Proof Reader`;
    return () => {
      live = false;
    };
  }, [edition]);
  const names = useMemo(() => new Set(edition.declarations.map((d) => d.id)), [edition]);
  const plain = (id: string) => edition.declarations.find((d) => d.id === id)?.plain ?? id;
  const act: LeanActions = useMemo(() => ({
    walk: (id) => { window.location.hash = `#/${encodeURIComponent(edition.slug)}/${encodeURIComponent(id)}`; },
    name: () => undefined,
    plain,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [edition]);
  const sheets = edition.sheets ?? [];
  const word = noun(edition);
  return (
    <div className="sheetpage">
      <header className="bar sheetpage__bar">
        <div className="bar__left"><Lockup /></div>
        <div className="bar__right">
          <a className="bar__link" href={routeHref({ paper: edition.slug })}>Back to the {word} and its Lean</a>
          <button type="button" className="bar__link sheetpage__print" onClick={() => window.print()}>Print</button>
        </div>
      </header>
      <PaperSourceCredit edition={edition} />
      <main className="sheetpage__main">
        <p className="sheetpage__kicker">Statement sheet</p>
        <h1>{edition.paper.title}</h1>
        <p className="sheetpage__about">
          {fromLean(edition) ? <>The main theorem, then every definition its statement depends on, simplest first, each with its exact Lean.
          Beside each is the {word}’s own explanation where it has one; otherwise a note added for this page, marked as such.
          Where the definitions reach Lean’s own library the sheet names those declarations and stops.</> : <>Selected source declarations and their linked passages. Dependencies have not been extracted, so this sheet does not list every definition a statement needs.</>}
        </p>
        <p className="sheetpage__prov">{leanOrigin(edition)} Links and notes were made with AI and have not been reviewed by {reviewers(edition).toLowerCase()}.</p>
        {sheets.map((sheet) => (
          <section key={sheet.claim} className="sheet" aria-labelledby={`sheet-${sheet.claim}`}>
            <h2 id={`sheet-${sheet.claim}`}>{sheet.title}</h2>
            <p className="sheet__coverage">
              {sheet.explained} of {sheet.total} definitions are explained in the {word}’s own words
              {sheet.total - sheet.explained > 0 && <>; {sheet.entries.filter((e) => e.reading === "note").length} have a note added for this page</>}
              {sheet.entries.some((e) => e.reading === "none") && <>; {sheet.entries.filter((e) => e.reading === "none").length} have no explanation yet</>}.
            </p>
            <h3 className="sheet__part">The theorem</h3>
            {sheet.heads.map((e) => <Entry key={e.id} edition={edition} entry={e} files={files} names={names} act={act} head />)}
            <h3 className="sheet__part">The definitions it depends on</h3>
            <ol className="sheet__list">
              {sheet.entries.map((e) => <li key={e.id}><Entry edition={edition} entry={e} files={files} names={names} act={act} /></li>)}
            </ol>
            {sheet.boundary.length > 0 && (
              <>
                <h3 className="sheet__part">Where it reaches Lean’s library</h3>
                <p>These come from Lean or Mathlib. The sheet names them and does not expand them.</p>
                <p className="sheet__boundary">{sheet.boundary.map((b, i) => <span key={b.name}>{i > 0 && ", "}<code title={`Used by ${b.used_by.map(plain).join(", ")}`}>{b.name}</code></span>)}</p>
              </>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}

function Entry({ edition, entry, files, names, act, head = false }: { edition: Edition; entry: SheetEntry; files: Record<string, string> | null; names: ReadonlySet<string>; act: LeanActions; head?: boolean }) {
  const d = edition.declarations.find((x) => x.id === entry.id)!;
  const lines = useFileLines(files?.[d.file] ?? "");
  const to = head ? d.statement_end : d.end_line;
  const passages = entry.prose.map((id) => edition.passages.find((p) => p.id === id)).filter((p) => !!p);
  const word = noun(edition);
  return (
    <article className="sheet__entry" id={`sheet-${d.id}`}>
      <header className="sheet__head">
        <h4><a href={routeHref({ paper: edition.slug, record: d.id })}>{d.plain}</a></h4>
        <code className="decl__raw">{d.id}</code>
        <span className="decl__kind">{d.keyword}, {d.file.replace(/^lean\//, "")} line{to > d.line ? `s ${d.line} to ${to}` : ` ${d.line}`}</span>
      </header>
      <div className="sheet__body">
        <div className="sheet__lean decl__code">
          {files ? <LeanCode paper={edition.slug} lines={lines} from={d.line} to={to} names={names} self={d.id} act={act} /> : <p className="status">Opening the Lean…</p>}
        </div>
        <div className="sheet__reading">
          {passages.length > 0 && (
            <>
              <p className="decl__label">In the {word}</p>
              {passages.map((p) => (
                <blockquote key={p.id}>
                  <p><Quote passage={p} /></p>
                  <a href={routeHref({ paper: edition.slug, record: `@${p.id}` })}>{sectionLabel(p.section)}, {passageLocation(p)}</a>
                </blockquote>
              ))}
            </>
          )}
          {d.note && <DeclNote note={d.note} />}
          {!passages.length && !d.note && <p className="sheet__none">No explanation yet.</p>}
          {head && d.fidelity && (
            <p className="sheet__fid"><span className="decl__label">The {word} and the Lean</span> <span className="fid__by">Compared by AI</span> {verdictWords(d.fidelity.verdict, word)}. {d.fidelity.html ? <span dangerouslySetInnerHTML={{ __html: d.fidelity.html }} /> : d.fidelity.text}</p>
          )}
        </div>
      </div>
    </article>
  );
}
