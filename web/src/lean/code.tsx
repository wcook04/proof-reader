// The authors' Lean, drawn line by line with every name a link. A name walks to its
// declaration in place; under the pointer it says its signature on the right page.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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
  /** What a person calls this declaration. */
  plain(name: string): string;
}

export function DeclLink({ paper, name, className, act, children, preview = true }: { paper: string; name: string; className?: string; act: LeanActions; children?: ReactNode; preview?: boolean }) {
  return (
    <a
      className={className}
      href={routeHref({ paper, record: name })}
      data-lean-declaration={name}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        act.name(null);
        act.walk(name);
      }}
      onMouseEnter={preview ? () => act.name(name) : undefined}
      onMouseLeave={preview ? () => act.name(null) : undefined}
      onFocus={preview ? () => act.name(name) : undefined}
      onBlur={preview ? () => act.name(null) : undefined}
    >
      {children ?? <><span>{act.plain(name)}</span> <code>{name}</code></>}
    </a>
  );
}

/** Moving from one name to the next passes over nothing, so the preview does not blink. */
const LINGER = 140;

/**
 * A name in the source says its signature beside itself, from the declarations already
 * loaded. It listens on the host, so pointing re-renders this preview and not the code.
 */
export function SourcePreview({ host, act, type }: { host: RefObject<HTMLElement | null>; act: LeanActions; type(name: string): string | undefined }) {
  const [shown, setShown] = useState<{ anchor: HTMLAnchorElement; name: string } | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let timer = 0;
    const refOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLAnchorElement>("a.source__ref[data-lean-declaration]") : null);
    const show = (anchor: HTMLAnchorElement) => {
      window.clearTimeout(timer);
      const name = anchor.dataset.leanDeclaration!;
      setShown((was) => (was?.anchor === anchor ? was : { anchor, name }));
    };
    const hide = (now = false) => {
      window.clearTimeout(timer);
      if (now) setShown(null);
      else timer = window.setTimeout(() => setShown(null), LINGER);
    };
    const over = (event: PointerEvent) => {
      const anchor = refOf(event.target);
      if (anchor && event.pointerType !== "touch") show(anchor);
    };
    const out = (event: PointerEvent) => {
      if (refOf(event.target) && refOf(event.target) !== refOf(event.relatedTarget)) hide();
    };
    const focusIn = (event: FocusEvent) => {
      const anchor = refOf(event.target);
      if (anchor?.matches(":focus-visible")) show(anchor);
    };
    const focusOut = (event: FocusEvent) => {
      if (refOf(event.target)) hide(true);
    };
    const click = (event: MouseEvent) => {
      if (refOf(event.target)) hide(true);
    };
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerout", out);
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    el.addEventListener("click", click, true);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("pointerover", over);
      el.removeEventListener("pointerout", out);
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
      el.removeEventListener("click", click, true);
    };
  }, [host]);

  useLayoutEffect(() => {
    const box = tip.current;
    const anchor = shown?.anchor;
    if (!box || !anchor) return;
    if (!anchor.isConnected) return setShown(null);
    const prior = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [prior, id].filter(Boolean).join(" "));
    const token = anchor.getBoundingClientRect();
    const gap = 6;
    const left = Math.min(window.innerWidth - box.offsetWidth - gap, Math.max(gap, token.left));
    const below = token.bottom + gap;
    const top = below + box.offsetHeight <= window.innerHeight - gap ? below : Math.max(gap, token.top - box.offsetHeight - gap);
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    box.style.visibility = "visible";
    const close = () => setShown(null);
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close, { passive: true });
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", key, true);
      if (prior === null) anchor.removeAttribute("aria-describedby");
      else anchor.setAttribute("aria-describedby", prior);
    };
  }, [shown, id]);

  if (!shown) return null;
  const signature = type(shown.name);
  return createPortal(
    <div ref={tip} className="source-preview" id={id} role="tooltip">
      <b>{act.plain(shown.name)}.</b> <code className="proof__sig">{signature ? `${shown.name} : ${signature}` : shown.name}</code>
    </div>,
    document.body,
  );
}

interface CodeProps {
  paper?: string;
  lines: Piece[][];
  from: number;
  to: number;
  names?: ReadonlySet<string>;
  /** The name of the declaration on show. */
  self?: string;
  on?: (line: number) => boolean;
  exact?: [number, number] | null;
  act?: LeanActions;
  numbers?: boolean;
}

export function LeanCode({ paper, lines, from, to, names, self, on, exact, act, numbers = true }: CodeProps) {
  const rows = [];
  for (let line = from; line <= to; line++) {
    const pieces = lines[line - 1] ?? [];
    const isExact = !!exact && line >= exact[0] && line <= exact[1];
    // A long line wraps under its own code, so nesting stays readable.
    const indent = /^ */.exec(pieces.map((piece) => piece.text).join(""))?.[0].length ?? 0;
    rows.push(
      <span key={line} className={`source__line${on?.(line) ? " is-on" : ""}${isExact ? " is-exact" : ""}`} data-line={line}>
        {numbers && <span className="source__no" aria-hidden="true">{line}</span>}
        <span className="source__text" style={{ "--indent": indent } as CSSProperties}>
          {pieces.map((piece, i) => {
            // Types take one colour on both pages, so the same name reads the same.
            const typed = piece.kind === "ident" && /^[A-Z]/.test(piece.text);
            if (paper && act && names?.has(piece.text)) {
              if (piece.text === self) return <span key={i} className="source__self">{piece.text}</span>;
              return <DeclLink key={i} paper={paper} name={piece.text} act={act} preview={false} className={`source__ref${typed ? " lk--type" : ""}`}>{piece.text}</DeclLink>;
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
