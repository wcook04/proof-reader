// How the paper's statement stands to the Lean: a comparison made with AI, and the checks
// written for this page that Lean ran against the authors' file. Also the one passage that
// says how the page was made.

import { useState, type ReactNode } from "react";
import { hasComparisons, leanOrigin, noun, passageLocation, type Check, type Declaration, type Edition, type Evaluation, type Passage, type Verdict } from "../app/edition";
import { routeHref } from "../app/router";
import { DeclLink, LeanCode, useFileLines, type LeanActions } from "../lean/code";
import { sectionLabel } from "../model/fromEdition";

export const verdictWords = (verdict: Verdict, text = "paper") => ({
  same: `Says the same as the ${text}`,
  stronger: `Says more than the ${text}`,
  weaker: `Says less than the ${text}`,
  different: `Says something different from the ${text}`,
})[verdict];

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

function checkSource(edition: Edition, check: Check) {
  return edition.check_source_lines?.replace("{path}", check.file)
    .replace("{line}", String(check.line)).replace("{end}", String(check.end_line));
}

/** Proofs for the passage itself, with the checked code already in view. */
export function SupplementaryProofs({ edition, checks, act }: { edition: Edition; checks: Check[]; act: LeanActions }) {
  return (
    <section className="step-proofs" aria-label="Supplementary Lean proofs">
      <p className="step-proofs__credit"><strong>Supplementary proofs</strong> <span>Written for this page and checked by Lean</span></p>
      {checks.map((check) => {
        const source = checkSource(edition, check);
        const file = check.file.split("/").pop();
        const lines = span(check);
        return (
          <details key={check.name} className="step-proof" data-check={check.name} open>
            <summary className="step-proof__summary">
              <span className="step-proof__title"><Doc text={check.title ?? check.doc} /></span>
              <span className="step-proof__length">{lines} {lines === 1 ? "line" : "lines"}</span>
            </summary>
            <CheckCode edition={edition} check={check} act={act} />
            <div className="step-proof__meta">
              {source
                ? <a href={source} target="_blank" rel="noreferrer" title={check.file}>{file}, lines {check.line}–{check.end_line}</a>
                : <span>{file}, lines {check.line}–{check.end_line}</span>}
              <details className="step-proof__axioms">
                <summary>Axiom report</summary>
                <p><CheckAxioms edition={edition} check={check} act={act} /></p>
              </details>
            </div>
          </details>
        );
      })}
    </section>
  );
}

/** One check: what it shows, that Lean checked it, and its code a click away. */
export function CheckLine({ edition, check, act }: { edition: Edition; check: Check; act: LeanActions }) {
  const [open, setOpen] = useState(false);
  const n = span(check);
  const source = checkSource(edition, check);
  const location = `${check.file}, lines ${check.line} to ${check.end_line}`;
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
          <p className="fid__file">{source ? <a href={source} target="_blank" rel="noreferrer">{location}</a> : location}.{" "}
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
    const key = `${p.section}/${passageLocation(p)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <section className="fid" data-verdict={f.verdict} aria-label={`The ${noun(edition)} and the Lean`}>
      <p className="fid__head"><span className="decl__label">The {noun(edition)} and the Lean</span> <span className="fid__by">Compared by AI</span></p>
      <p className="fid__verdict">{verdictWords(f.verdict, noun(edition))}.</p>
      <p className="fid__text">{f.html ? <span dangerouslySetInnerHTML={{ __html: f.html }} /> : f.text}</p>
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
              }}>{sectionLabel(p.section)}, {passageLocation(p)}</a>
            </span>
          ))}.
        </p>
      )}
      {checks.map((c) => <CheckLine key={c.name} edition={edition} check={c} act={act} />)}
    </section>
  );
}

// "Lean accepted a proof that at every point …": lower the first word of a sentence
// such as "At" or "The", and leave a name such as "Lean" or "U" alone.
const lower = (text: string) => text.replace(/^([A-Z])(?=[a-z]+ )(?!ean )/, (c) => c.toLowerCase());

/** One short line per declaration of a statement, for the top of the step. */
export function FidelityLines({ edition, ids, act, onGo }: { edition: Edition; ids: string[]; act: LeanActions; onGo(id: string): void }) {
  const decls = ids.map((id) => edition.declarations.find((d) => d.id === id)).filter((d): d is Declaration => !!d?.fidelity);
  if (!decls.length) return null;
  const byName = (id: string) => edition.declarations.find((d) => d.id === id);
  return (
    <ul className="stepline__fid" aria-label={`The ${noun(edition)} and the Lean, compared by AI`}>
      {decls.map((d) => {
        const own = checksOf(edition, d.fidelity!.checks);
        const leaning = d.axioms.map(byName).filter((a): a is Declaration => !!a?.fidelity?.checks.length);
        const flagged = d.fidelity!.verdict !== "same" || own.length > 0 || leaning.length > 0;
        return (
          <li key={d.id} data-fid={d.id} data-flagged={flagged || undefined}>
            <button type="button" onClick={() => onGo(d.id)}>{d.plain}</button>: {verdictWords(d.fidelity!.verdict, noun(edition)).toLowerCase()}.
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
      <p>Lean accepted these AI-written proofs against the original Lean files.</p>
      {checks.map((c) => {
        const users = usedIn(c.name);
        return (
          <details key={c.name} className="index__check" data-check={c.name}>
            <summary><Doc text={c.doc} /> <code className="index__checkname">{c.name}</code></summary>
            <p className="index__checkkind">{c.file}, lines {c.line} to {c.end_line}. <CheckAxioms edition={edition} check={c} act={act} />
              {users.length > 0 && <> Cited in the comparison for {users.map((d, i) => (
                <span key={d.id}>{i > 0 && (i === users.length - 1 ? " and " : ", ")}<DeclLink paper={edition.slug} name={d.id} act={act} className="declname" /></span>
              ))}.</>}
            </p>
            <CheckCode edition={edition} check={c} act={act} />
          </details>
        );
      })}
    </>
  );
}

/** Who has not reviewed the AI-made links: for a Markdown page written for this site, the
 * people who could are the authors of the Lean. */
export const reviewers = (edition: Edition) => (edition.source?.kind === "markdown" ? "The authors of the Lean" : "The authors");

/** The full account of how the page was made, said once. */
const count = (n: number, of: number) => (n === of ? (of === 1 ? "the one" : `all ${of}`) : n === 0 ? (of === 1 ? "not the one" : `none of the ${of}`) : `${n} of the ${of}`);

/** One or two sentences for the entry: how the matcher's links here stand to the authors' citations. */
export function MatchSummary({ edition, passage }: { edition: Edition; passage: Passage }) {
  const match = passage.match;
  if (!match) return null;
  const matcher = edition.evaluation?.matcher ?? "The matcher";
  const plain = (id: string) => edition.declarations.find((d) => d.id === id)?.plain ?? id;
  const entries = Object.entries(match);
  const cited = entries.filter(([, m]) => m.authors === "cites");
  const foundCited = cited.filter(([, m]) => m.found_by.length).length;
  const release = entries.filter(([, m]) => m.authors === "other_release");
  const elsewhere = entries.filter(([, m]) => m.found_by.length && m.authors === "elsewhere").length;
  const uncited = entries.filter(([, m]) => m.found_by.length && m.authors === "uncited").length;
  const lines: string[] = [];
  if (cited.length) {
    const head = `${matcher} found ${count(foundCited, cited.length)} declaration${cited.length === 1 ? "" : "s"} the authors cite here`;
    const more = [elsewhere && `${elsewhere} they cite at another passage`, uncited && `${uncited} they do not cite`].filter(Boolean);
    lines.push(more.length ? `${head}, and ${more.join(" and ")}.` : `${head}.`);
  } else if (elsewhere || uncited) {
    lines.push(`${matcher} found ${[elsewhere && `${elsewhere} declaration${elsewhere === 1 ? "" : "s"} the authors cite at another passage`, uncited && `${uncited} they do not cite`].filter(Boolean).join(" and ")}.`);
  }
  for (const [id, m] of release) {
    lines.push(`${m.found_by.length ? `${matcher} linked ${plain(id)} here.` : ""} The authors cite this rule as release ${(m.releases ?? []).join(" and ")} prints it.`.trim());
  }
  return <p className="matchsummary">{lines.join(" ")}</p>;
}

const share = (pair: [number, number] | null) => (pair ? `${pair[0]} of ${pair[1]}` : "");

/** A matcher's results against the authors' own citations, beside its controls. */
/** The few figures a reader sees first. */
export function Headline({ evaluation }: { evaluation: Evaluation }) {
  if (!evaluation.headline?.length) return null;
  return (
    <dl className="headline">
      {evaluation.headline.map((h) => (
        <div key={h.label} className="headline__tile">
          <dt>{h.label.charAt(0).toUpperCase() + h.label.slice(1)}</dt>
          <dd><strong>{h.value[0]}</strong> of {h.value[1]}<span className="headline__compare">{h.compare}</span></dd>
        </div>
      ))}
    </dl>
  );
}

const RULER_KEY = [
  { kind: "agree", words: "found by the matcher and cited by the authors" },
  { kind: "found", words: "found by the matcher, cited elsewhere or not at all" },
  { kind: "missed", words: "cited by the authors, missed by the matcher" },
] as const;

/** A standard's first screen on the right: how to read it, where the links are, and the results. */
export function StandardStart({ edition, onPassage, onResults }: { edition: Edition; onPassage(id: string): void; onResults(): void }) {
  const first = edition.passages[0];
  const counts = { agree: 0, found: 0, missed: 0 } as Record<string, number>;
  for (const p of edition.passages) {
    const all = Object.values(p.match ?? {});
    const kind = all.some((m) => m.found_by.length && m.authors === "cites") ? "agree" : all.some((m) => m.found_by.length) ? "found" : "missed";
    counts[kind] += 1;
  }
  return (
    <div className="standardstart">
      <p className="standardstart__lead">Click a highlighted passage of the standard to open the Lean definition that states it, with the authors' comment beside it.</p>
      <p>The strip beside the pages marks all {edition.passages.length} linked passages in the whole document:</p>
      <ul className="standardstart__key">
        {RULER_KEY.filter((k) => counts[k.kind] > 0).map((k) => <li key={k.kind}><span className={`ruler__swatch ruler__mark--${k.kind}`} aria-hidden="true" />{counts[k.kind]} {k.words}</li>)}
      </ul>
      {first && <p><button type="button" className="standardstart__go" onClick={() => onPassage(first.id)}>Go to the first linked passage, {sectionLabel(first.section)}, page {first.page}</button></p>}
      {edition.evaluation && (
        <>
          <h3>{edition.evaluation.matcher} against the authors' own citations</h3>
          <Headline evaluation={edition.evaluation} />
          <p><button type="button" className="standardstart__go" onClick={onResults}>All results and how they were measured</button></p>
        </>
      )}
    </div>
  );
}

export function EvaluationResults({ evaluation }: { evaluation: Evaluation }) {
  return (
    <section className="evaluation" id="how-well-the-matching-worked" aria-labelledby="evaluation-title">
      <h3 id="evaluation-title">How well the matching worked</h3>
      <Headline evaluation={evaluation} />
      {evaluation.method.map((line, i) => <p key={i}>{line}</p>)}
      <table>
        <thead>
          <tr><th scope="col">Measure</th>{evaluation.columns.map((c) => <th key={c.id} scope="col" title={c.about}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {evaluation.rows.map((row) => (
            <tr key={row.measure}>
              <th scope="row">{row.measure}{row.about && <span className="evaluation__about">{row.about}</span>}</th>
              {evaluation.columns.map((c) => {
                const pair = row.counts[c.id] ?? null;
                return (
                  <td key={c.id} title={pair ? `${Math.round((100 * pair[0]) / Math.max(1, pair[1]))}%` : undefined}>
                    {share(pair)}
                    {pair && <span className="evaluation__bar" aria-hidden="true"><span style={{ width: `${(100 * pair[0]) / Math.max(1, pair[1])}%` }} /></span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="evaluation__columns">{evaluation.columns.map((c) => <li key={c.id}><strong>{c.label}</strong>: {c.about}</li>)}</ul>
      <h4>What the runs showed</h4>
      <ul>{evaluation.findings.map((line, i) => <li key={i}>{line}</li>)}</ul>
      {evaluation.misses.length > 0 && (
        <details>
          <summary>The {evaluation.misses.length} citations by the authors that no run found</summary>
          <ul>{evaluation.misses.map((m, i) => <li key={i}><code>{m.declaration}</code>: {m.citation}</li>)}</ul>
        </details>
      )}
      <p><a href={evaluation.records}>Every run, its inputs, its answers and the scorer</a>.</p>
    </section>
  );
}

export function HowMade({ edition }: { edition: Edition }) {
  return (
    <section className="made" id="how-this-page-was-made" aria-labelledby="made-title">
      <h3 id="made-title">How this page was made</h3>
      <p>
        {edition.source?.kind === "markdown"
          ? <>We rendered this {noun(edition)}’s Markdown source directly. We checked every raw quotation once in that source and checked its heading and block. <a href={edition.paper.url}>Read the source Markdown</a>.</>
          : edition.reading
          ? <>A program compares the reading copy with text extracted from the authors’ PDF. The comparison leaves out margins and figures, and the original PDF is one click away.</>
          : <>Each linked quotation was found in text extracted from the authors’ PDF.</>}
      </p>
      <p>{leanOrigin(edition)}</p>
      {hasComparisons(edition)
        ? <>
            <p>The links from sentences to Lean, the plain titles, the notes and the comparisons between the {noun(edition)} and the Lean were made with AI. {reviewers(edition)} have not reviewed them.</p>
            <p>Where a comparison cites a Lean proof written for this page, the proof is shown with it, and Lean accepted the proof against {edition.source?.kind === "markdown" ? "the Lean authors’" : "the authors’"} file.</p>
          </>
        : <p>The links from sentences to Lean, the plain titles and the notes were made with AI. {reviewers(edition)} have not reviewed them.</p>}
    </section>
  );
}
