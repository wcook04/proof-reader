// The authors' Lean, drawn line by line with every name a link. A name walks to its
// declaration in place; under the pointer it says its signature on the right page.

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { routeHref } from "../app/router";
import { tokenizeLean } from "./leanTokens";

interface Piece {
  text: string;
  kind: string;
}

/** Split a file into lines of tokens, setting the authors' comments apart from code. */
function lineTokens(text: string): Piece[][] {
  let inBlock = false;
  return text.split("\n").map((line) => {
    const pieces: Piece[] = [];
    let rest = line;
    while (rest) {
      if (inBlock) {
        const close = rest.indexOf("-/");
        const end = close < 0 ? rest.length : close + 2;
        pieces.push({ text: rest.slice(0, end), kind: "prose" });
        rest = rest.slice(end);
        if (close >= 0) inBlock = false;
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
      inBlock = true;
      pieces.push({ text: rest.slice(0, 2), kind: "prose" });
      rest = rest.slice(2);
    }
    return pieces;
  });
}

const cache = new Map<string, Piece[][]>();

export function useFileLines(text: string): Piece[][] {
  return useMemo(() => {
    let lines = cache.get(text);
    if (!lines) {
      lines = lineTokens(text);
      cache.set(text, lines);
    }
    return lines;
  }, [text]);
}

export interface LeanActions {
  /** Walk the Lean page to a declaration. */
  walk(name: string): void;
  /** The pointer or focus reached a name, or left it. */
  name(name: string | null): void;
}

export function DeclLink({ paper, name, className, act, children }: { paper: string; name: string; className?: string; act: LeanActions; children?: ReactNode }) {
  return (
    <a
      className={className}
      href={routeHref({ paper, record: name })}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        act.name(null);
        act.walk(name);
      }}
      onMouseEnter={() => act.name(name)}
      onMouseLeave={() => act.name(null)}
      onFocus={() => act.name(name)}
      onBlur={() => act.name(null)}
    >
      {children ?? <code>{name}</code>}
    </a>
  );
}

interface CodeProps {
  paper: string;
  lines: Piece[][];
  from: number;
  to: number;
  names: ReadonlySet<string>;
  /** The name of the declaration on show. */
  self?: string;
  on?: (line: number) => boolean;
  exact?: [number, number] | null;
  act: LeanActions;
}

export function LeanCode({ paper, lines, from, to, names, self, on, exact, act }: CodeProps) {
  const rows = [];
  for (let line = from; line <= to; line++) {
    const pieces = lines[line - 1] ?? [];
    const isExact = !!exact && line >= exact[0] && line <= exact[1];
    // A long line wraps under its own code, so nesting stays readable.
    const indent = /^ */.exec(pieces.map((piece) => piece.text).join(""))?.[0].length ?? 0;
    rows.push(
      <span key={line} className={`source__line${on?.(line) ? " is-on" : ""}${isExact ? " is-exact" : ""}`} data-line={line}>
        <span className="source__no" aria-hidden="true">{line}</span>
        <span className="source__text" style={{ "--indent": indent } as CSSProperties}>
          {pieces.map((piece, i) => {
            // Types take one colour on both pages, so the same name reads the same.
            const typed = piece.kind === "ident" && /^[A-Z]/.test(piece.text);
            if (names.has(piece.text)) {
              if (piece.text === self) return <span key={i} className="source__self">{piece.text}</span>;
              return <DeclLink key={i} paper={paper} name={piece.text} act={act} className={`source__ref${typed ? " lk--type" : ""}`}>{piece.text}</DeclLink>;
            }
            if (piece.kind === "space" || piece.kind === "punct") return piece.text;
            return <span key={i} className={`lk lk--${typed ? "type" : piece.kind}`}>{piece.text}</span>;
          })}
          {"\n"}
        </span>
      </span>,
    );
  }
  return <code className="lean-code">{rows}</code>;
}
