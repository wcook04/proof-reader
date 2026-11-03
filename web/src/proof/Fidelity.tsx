// How the paper's statement stands to the Lean: a comparison made with AI, and the checks
// written for this page that Lean ran against the authors' file. Also the one passage that
// says how the page was made.

import { useState, type ReactNode } from "react";
import { hasComparisons, type Check, type Declaration, type Edition, type Verdict } from "../app/edition";
import { routeHref } from "../app/router";
import { DeclLink, LeanCode, useFileLines, type LeanActions } from "../lean/code";
import { sectionLabel } from "../model/fromEdition";

export const VERDICT_WORDS: Record<Verdict, string> = {
  same: "Says the same as the paper",
  stronger: "Says more than the paper",
  weaker: "Says less than the paper",
  different: "Says something different from the paper",
};

/** A check's doc comment, with `names` set as code. */
export function Doc({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : part))}</>;
}

export const checksOf = (edition: Edition, names: string[]) =>
  names.map((name) => edition.checks?.find((c) => c.name === name)).filter((c): c is Check => !!c);

/** What Lean reports a check depends on. */
function CheckAxioms({ edition, check, act }: { edition: Edition; check: Check; act: LeanActions }) {
  const ids = new Set(edition.declarations.map((d) => d.id));
  const authors = check.axioms.filter((a) => ids.has(a));
  const standard = check.axioms.filter((a) => !ids.has(a));
  const join = (items: ReactNode[]) => items.flatMap((item, i) => (i === 0 ? [item] : [i === items.length - 1 ? " and " : ", ", item]));
  return (
    <>
      {authors.length > 0 ? (
        <>It depends on the authors’ axiom {join(authors.map((a) => <DeclLink key={a} paper={edition.slug} name={a} act={act} className="declname declname--axiom" />))}
          {standard.length > 0 && <>, and on Lean’s standard {join(standard)}</>}.</>
      ) : standard.length > 0 ? (
        <>It depends only on Lean’s standard {join(standard)}.</>
      ) : (
        <>It depends on no axioms.</>
      )}
    </>
  );
}

function CheckCode({ edition, check, act }: { edition: Edition; check: Check; act: LeanActions }) {
  // Padded so the line numbers are the check file's own.
  const lines = useFileLines("\n".repeat(check.line - 1) + check.code);
  const names = new Set(edition.declarations.map((d) => d.id));
  return (
    <div className="decl__code fid__code" tabIndex={0} aria-label={`The Lean proof ${check.name}`}>
      <LeanCode paper={edition.slug} lines={lines} from={check.line} to={check.line + check.code.split("\n").length - 1} names={names} self={check.name} act={act} />
    </div>
  );
}

const span = (check: Check) => check.end_line - check.line + 1;

/** One check: what it shows, that Lean checked it, and its code a click away. */
export function CheckLine({ edition, check, act }: { edition: Edition; check: Check; act: LeanActions }) {
  const [open, setOpen] = useState(false);
  const n = span(check);
  return (
    <div className="fid__check" data-check={check.name}>
      <p className="fid__doc"><Doc text={check.doc} /></p>
      <p className="fid__checked"><b>Lean accepted this proof.</b> <CheckAxioms edition={edition} check={check} act={act} /></p>
      <button type="button" className="decl__fold fid__fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? "▼" : "▶"}</span> {open ? "Hide the proof" : "The proof in Lean"}, {n} line{n > 1 ? "s" : ""}
      </button>
      {open && (
        <>
          <CheckCode edition={edition} check={check} act={act} />
          <p className="fid__file">{check.file}, lines {check.line} to {check.end_line}, written for this page.{" "}
            <button type="button" className="fid__back" onClick={() => setOpen(false)}>Hide the proof</button>
          </p>
        </>
      )}
    </div>
  );
}

/** The comparison under a declaration's note. */
export function FidelityBlock({ edition, d, act, onPassage }: { edition: Edition; d: Declaration; act: LeanActions; onPassage(id: string): void }) {
  const f = d.fidelity;
  if (!f) return null;
  const checks = checksOf(edition, f.checks);
  const because = f.because.map((id) => edition.passages.find((p) => p.id === id)).filter((p) => !!p);
  const seen = new Set<string>();
  const stops = because.filter((p) => {
    const key = `${p.section}/${p.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <section className="fid" data-verdict={f.verdict} aria-label="The paper and the Lean">
      <p className="fid__head"><span className="decl__label">The paper and the Lean</span> <span className="fid__by">Compared by AI</span></p>
      <p className="fid__verdict">{VERDICT_WORDS[f.verdict]}.</p>
      <p className="fid__text">{f.text}</p>
      {stops.length > 0 && (
        <p className="fid__because">
          Compared with{" "}
          {stops.map((p, i) => (
            <span key={p.id}>
              {i > 0 && (i === stops.length - 1 ? " and " : ", ")}
              <a href={routeHref({ paper: edition.slug, record: `@${p.id}` })} onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                onPassage(p.id);
              }}>{sectionLabel(p.section)}, page {p.page}</a>
            </span>
          ))}.
        </p>
      )}
      {checks.map((c) => <CheckLine key={c.name} edition={edition} check={c} act={act} />)}
    </section>
  );
}

const lower = (text: string) => text.replace(/^The /, "the ");

/** One short line per declaration of a statement, for the top of the step. */
export function FidelityLines({ edition, ids, act, onGo }: { edition: Edition; ids: string[]; act: LeanActions; onGo(id: string): void }) {
  const decls = ids.map((id) => edition.declarations.find((d) => d.id === id)).filter((d): d is Declaration => !!d?.fidelity);
  if (!decls.length) return null;
  const byName = (id: string) => edition.declarations.find((d) => d.id === id);
  return (
    <ul className="stepline__fid" aria-label="The paper and the Lean, compared by AI">
      {decls.map((d) => {
        const own = checksOf(edition, d.fidelity!.checks);
        const leaning = d.axioms.map(byName).filter((a): a is Declaration => !!a?.fidelity?.checks.length);
        const flagged = d.fidelity!.verdict !== "same" || own.length > 0 || leaning.length > 0;
        return (
          <li key={d.id} data-fid={d.id} data-flagged={flagged || undefined}>
            <button type="button" onClick={() => onGo(d.id)}>{d.plain}</button>: {VERDICT_WORDS[d.fidelity!.verdict].toLowerCase()}.
            {own.map((c) => <span key={c.name}> Lean accepted a proof that <Doc text={lower(c.doc)} /></span>)}
            {leaning.map((a) => (
              <span key={a.id}> Its proof rests on <DeclLink paper={edition.slug} name={a.id} act={act} className="declname declname--axiom"><span>{a.plain}</span></DeclLink>
                {checksOf(edition, a.fidelity!.checks).map((c) => <span key={c.name}>; Lean accepted a proof that <Doc text={lower(c.doc)} /></span>)}
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/** Every check, for the index at the back. */
export function AllChecks({ edition, act }: { edition: Edition; act: LeanActions }) {
  const checks = edition.checks ?? [];
  if (!checks.length) return null;
  const usedIn = (name: string) => edition.declarations.filter((d) => d.fidelity?.checks.includes(name));
  return (
    <>
      <h3 id="checks">Lean proofs written for this page</h3>
      <p>These Lean proofs were written for this page with AI. Each one imports the authors’ file, and Lean accepted each proof.</p>
      {checks.map((c) => {
        const users = usedIn(c.name);
        return (
          <div key={c.name} className="index__check" data-check={c.name}>
            <p><code className="index__checkname">{c.name}</code> <span className="index__checkkind">{c.keyword === "def" ? "Definition" : "Theorem"}, lines {c.line} to {c.end_line} of {c.file}</span></p>
            <p className="fid__doc"><Doc text={c.doc} /></p>
            <p><b>Lean accepted this proof.</b> <CheckAxioms edition={edition} check={c} act={act} />
              {users.length > 0 && <> Cited in the comparison for {users.map((d, i) => (
                <span key={d.id}>{i > 0 && (i === users.length - 1 ? " and " : ", ")}<DeclLink paper={edition.slug} name={d.id} act={act} className="declname" /></span>
              ))}.</>}
            </p>
            <CheckCode edition={edition} check={c} act={act} />
          </div>
        );
      })}
    </>
  );
}

/** The full account of how the page was made, said once. */
export function HowMade({ edition }: { edition: Edition }) {
  return (
    <section className="made" id="how-this-page-was-made" aria-labelledby="made-title">
      <h3 id="made-title">How this page was made</h3>
      <p>
        {edition.reading
          ? <>A program compares the reading copy with text extracted from the authors’ PDF. The comparison leaves out margins and figures, and the original PDF is one click away.</>
          : <>Each linked quotation was found in text extracted from the authors’ PDF.</>}
      </p>
      <p>The graph’s arrows, and each declaration’s kind, lines and axioms, are Lean’s own output on the authors’ file, from Lean {edition.lean.version}.</p>
      {hasComparisons(edition)
        ? <>
            <p>The links from sentences to Lean, the plain titles, the notes and the comparisons between the paper and the Lean were made with AI. The authors have not reviewed them.</p>
            <p>Where a comparison cites a Lean proof written for this page, the proof is shown with it, and Lean accepted the proof against the authors’ file.</p>
          </>
        : <p>The links from sentences to Lean, the plain titles and the notes were made with AI. The authors have not reviewed them.</p>}
    </section>
  );
}
