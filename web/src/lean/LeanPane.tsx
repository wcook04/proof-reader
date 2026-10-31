// The selected Lean declaration: what the paper says about it, what Lean
// reports about it, and the authors' file itself with its lines picked out.

import { useEffect, useMemo, useRef } from "react";
import type { Claim, Declaration, Edition, Passage } from "../app/edition";
import { tokenizeLean } from "./leanTokens";

const ROLE_WORDS: Record<Passage["role"], string> = {
  states: "states it",
  defines: "introduces it",
  proves: "proves it",
  explains: "explains it",
  uses: "uses it",
};

interface Props {
  edition: Edition;
  selected: string | null;
  onSelect(id: string): void;
  onPassage(id: string): void;
}

export function LeanPane({ edition, selected, onSelect, onPassage }: Props) {
  const declaration = edition.declarations.find((d) => d.id === selected) ?? null;
  const claim = edition.claims.find((c) => c.id === selected) ?? null;
  const file = declaration?.file ?? Object.keys(edition.lean.files)[0];
  return (
    <aside className="lean" aria-label="Lean">
      <div className="lean__card">
        {declaration ? (
          <Card edition={edition} d={declaration} onSelect={onSelect} onPassage={onPassage} />
        ) : claim ? (
          <ClaimCard edition={edition} claim={claim} onSelect={onSelect} onPassage={onPassage} />
        ) : (
          <p className="lean__hint">Scroll the paper, or choose a card on the map.</p>
        )}
      </div>
      <Source
        name={file}
        text={edition.lean.files[file]}
        declaration={declaration}
        known={edition.declarations}
        onSelect={onSelect}
      />
    </aside>
  );
}

function Quotes({ edition, ids, onPassage }: { edition: Edition; ids: string[]; onPassage(id: string): void }) {
  const passages = ids.map((id) => edition.passages.find((p) => p.id === id)).filter((p): p is Passage => !!p);
  return (
    <ul className="quotes">
      {passages.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPassage(p.id)}>
            <span className="quotes__where">
              §{p.section}, p.{p.page} · {ROLE_WORDS[p.role]}
            </span>
            <q>{p.quote}</q>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Names({ title, names, onSelect }: { title: string; names: string[]; onSelect(id: string): void }) {
  if (!names.length) return null;
  return (
    <p className="names">
      <span className="caps">{title}</span>{" "}
      {names.map((name) => (
        <button key={name} type="button" className="name" onClick={() => onSelect(name)}>
          {name}
        </button>
      ))}
    </p>
  );
}

function Card({ edition, d, onSelect, onPassage }: { edition: Edition; d: Declaration; onSelect(id: string): void; onPassage(id: string): void }) {
  const isProof = d.keyword === "theorem" || d.keyword === "lemma";
  return (
    <>
      <p className="lean__kind caps">
        Lean {d.keyword} · lines {d.line}–{d.end_line}
      </p>
      <h2 className="lean__name">{d.id}</h2>
      {d.passages.length ? (
        <Quotes edition={edition} ids={d.passages} onPassage={onPassage} />
      ) : (
        <p className="lean__none">Not tied to a passage of the paper.</p>
      )}
      {d.note && <p className="lean__note"><span className="caps">Note</span> {d.note.text}</p>}
      {isProof && (
        <p className="lean__rests">
          <span className="caps">Lean reports</span>{" "}
          {d.axioms.length ? (
            <>
              it rests on{" "}
              {d.axioms.map((a) => (
                <button key={a} type="button" className="name name--axiom" onClick={() => onSelect(a)}>
                  {a}
                </button>
              ))}
            </>
          ) : (
            <>it uses none of the authors' axioms</>
          )}
          {d.standard_axioms.length ? <>{d.axioms.length ? " and on" : ", and rests on"} Lean's standard {d.standard_axioms.join(", ")}.</> : "."}
        </p>
      )}
      <Names title="Uses" names={d.uses} onSelect={onSelect} />
      <Names title="Used by" names={d.used_by} onSelect={onSelect} />
    </>
  );
}

function ClaimCard({ edition, claim, onSelect, onPassage }: { edition: Edition; claim: Claim; onSelect(id: string): void; onPassage(id: string): void }) {
  return (
    <>
      <p className="lean__kind caps">The paper's claim · §{claim.section}</p>
      <h2 className="lean__title">{claim.title}</h2>
      <Quotes edition={edition} ids={[claim.passage]} onPassage={onPassage} />
      <Names title="Stated in Lean as" names={claim.lean} onSelect={onSelect} />
    </>
  );
}

interface Piece {
  text: string;
  kind: string;
}

/** Split a file into lines of tokens, setting comments apart from code. */
function lineTokens(text: string): Piece[][] {
  let inBlock = 0;
  return text.split("\n").map((line) => {
    const pieces: Piece[] = [];
    let rest = line;
    while (rest) {
      if (inBlock) {
        const close = rest.indexOf("-/");
        const end = close < 0 ? rest.length : close + 2;
        pieces.push({ text: rest.slice(0, end), kind: "comment" });
        rest = rest.slice(end);
        if (close >= 0) inBlock = 0;
        continue;
      }
      const block = rest.indexOf("/-");
      const dash = rest.indexOf("--");
      const start = block >= 0 && (dash < 0 || block < dash) ? block : dash;
      const code = start < 0 ? rest : rest.slice(0, start);
      if (code) for (const token of tokenizeLean(code)) pieces.push({ text: token.text, kind: token.kind });
      if (start < 0) break;
      rest = rest.slice(start);
      if (start === dash && (block < 0 || dash < block)) {
        pieces.push({ text: rest, kind: "comment" });
        break;
      }
      inBlock = 1;
      pieces.push({ text: rest.slice(0, 2), kind: "comment" });
      rest = rest.slice(2);
    }
    return pieces;
  });
}

function Source({ name, text, declaration, known, onSelect }: { name: string; text: string; declaration: Declaration | null; known: Declaration[]; onSelect(id: string): void }) {
  const lines = useMemo(() => lineTokens(text), [text]);
  const names = useMemo(() => new Set(known.map((d) => d.id)), [known]);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!declaration) return;
    const el = body.current;
    const row = el?.querySelector<HTMLElement>(`[data-line="${declaration.line}"]`);
    if (!el || !row) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: row.offsetTop - 28, behavior: reduced ? "auto" : "smooth" });
  }, [declaration]);

  return (
    <div className="source">
      <p className="source__name">{name}</p>
      <div className="source__body" ref={body} tabIndex={0} aria-label={`Lean source, ${name}`}>
        <code className="lean-code">
          {lines.map((pieces, index) => {
            const line = index + 1;
            const on = !!declaration && line >= declaration.line && line <= declaration.end_line;
            return (
              <span key={line} className={`source__line${on ? " is-on" : ""}`} data-line={line}>
                <span className="source__no" aria-hidden="true">{line}</span>
                <span className="source__text">
                  {pieces.map((piece, i) =>
                    names.has(piece.text) ? (
                      <button key={i} type="button" className={`source__ref${piece.text === declaration?.id ? " is-self" : ""}`} onClick={() => onSelect(piece.text)}>
                        {piece.text}
                      </button>
                    ) : piece.kind === "space" || piece.kind === "punct" ? (
                      piece.text
                    ) : (
                      <span key={i} className={`lk lk--${piece.kind}`}>{piece.text}</span>
                    ),
                  )}
                  {"\n"}
                </span>
              </span>
            );
          })}
        </code>
      </div>
    </div>
  );
}
