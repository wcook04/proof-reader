// A deliberately small Lean tokenizer for colouring one recorded statement.
// It recognises keywords, binder brackets, binder names (the names before a
// colon inside a binder), arrows and logical symbols, identifiers, numbers
// and everything else as plain text. Concatenating the token texts always
// returns the input unchanged.

export type LeanTokenKind = "keyword" | "bracket" | "binder" | "arrow" | "ident" | "number" | "punct" | "space";

export interface LeanToken {
  kind: LeanTokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "theorem",
  "lemma",
  "def",
  "abbrev",
  "structure",
  "class",
  "instance",
  "example",
  "axiom",
  "fun",
  "λ",
  "let",
  "have",
  "show",
  "from",
  "by",
  "in",
  "if",
  "then",
  "else",
  "match",
  "with",
  "where",
  "do",
  "Type",
  "Prop",
  "Sort",
  "∀",
  "∃",
  "∃!",
]);

const ARROWS = ["↔", "→", "←", "⟹", "=>", "->", "<->", "↦", "∧", "∨", "¬", ":=", "≤", "≥", "≠", "∈", "∉", "⊆", "×", "∘"];
const OPEN = new Set(["(", "{", "[", "⦃", "⟨"]);
const CLOSE = new Set([")", "}", "]", "⦄", "⟩"]);
const QUANTIFIERS = new Set(["∀", "∃", "∃!", "fun", "λ"]);
const BINDER_OPEN = new Set(["(", "{", "[", "⦃"]);
// Identifier characters: letters (including Greek and subscripts), digits, ', _, ., !, ?
const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_'.!?₀-₉ᵢ-ᵪ]/u;

export function tokenizeLean(source: string): LeanToken[] {
  const tokens: LeanToken[] = [];
  const chars = Array.from(source);
  let i = 0;
  const push = (kind: LeanTokenKind, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && (kind === "space" || kind === "punct")) last.text += text;
    else tokens.push({ kind, text });
  };
  while (i < chars.length) {
    const c = chars[i];
    if (/\s/.test(c)) {
      push("space", c);
      i++;
      continue;
    }
    const rest = chars.slice(i, i + 3).join("");
    const arrow = ARROWS.find((a) => rest.startsWith(a));
    if (arrow) {
      tokens.push({ kind: "arrow", text: arrow });
      i += Array.from(arrow).length;
      continue;
    }
    if (c === "∀" || c === "∃" || c === "λ") {
      const bang = chars[i + 1] === "!" ? "!" : "";
      tokens.push({ kind: "keyword", text: c + bang });
      i += 1 + bang.length;
      continue;
    }
    if (OPEN.has(c) || CLOSE.has(c)) {
      tokens.push({ kind: "bracket", text: c });
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < chars.length && /[0-9.]/.test(chars[j])) j++;
      tokens.push({ kind: "number", text: chars.slice(i, j).join("") });
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < chars.length && IDENT_PART.test(chars[j])) j++;
      // A trailing dot belongs to punctuation, not the name.
      while (j > i + 1 && chars[j - 1] === ".") j--;
      const text = chars.slice(i, j).join("");
      tokens.push({ kind: KEYWORDS.has(text) ? "keyword" : "ident", text });
      i = j;
      continue;
    }
    push("punct", c);
    i++;
  }
  markBinders(tokens);
  return tokens;
}

/** Inside a binder bracket, the identifiers before a ":" are the names it binds. */
function markBinders(tokens: LeanToken[]): void {
  tokens.forEach((t, k) => {
    if (t.kind === "keyword" && QUANTIFIERS.has(t.text)) {
      for (let j = k + 1; j < tokens.length && (tokens[j].kind === "ident" || tokens[j].kind === "space"); j++)
        if (tokens[j].kind === "ident") tokens[j].kind = "binder";
      return;
    }
    if (t.kind !== "bracket" || !BINDER_OPEN.has(t.text)) return;
    const names: LeanToken[] = [];
    let j = k + 1;
    for (; j < tokens.length; j++) {
      const u = tokens[j];
      if (u.kind === "ident") names.push(u);
      else if (u.kind !== "space") break;
    }
    const next = tokens[j];
    if (names.length && next && next.kind === "punct" && next.text.startsWith(":")) names.forEach((n) => (n.kind = "binder"));
  });
}

const SIG_OPEN = "([{⦃⟨";
const SIG_CLOSE = ")]}⦄⟩";
const DECLARATION = /^(theorem|lemma|def|abbrev|instance|example|axiom)\s/;

/**
 * Lay out a one-line declaration signature the way Lean code is usually
 * written: the head on the first line, then each top-level binder on its own
 * line and the type after the final colon, all indented by two spaces.
 * Only whitespace changes; anything that is not a single-line declaration is
 * returned unchanged.
 */
export function formatLeanSignature(source: string): string {
  const text = source.trim();
  if (!DECLARATION.test(text) || text.includes("\n")) return source;
  const lines: string[] = [];
  let current = "";
  let depth = 0;
  let seenBinder = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (depth === 0 && SIG_OPEN.includes(ch)) {
      if (current.trim()) lines.push(current.trimEnd());
      current = "  ";
      seenBinder = true;
    }
    if (SIG_OPEN.includes(ch)) depth += 1;
    if (SIG_CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    // The colon that introduces the statement's type, after the binders.
    if (depth === 0 && seenBinder && ch === ":" && text[i - 1] === " " && text[i + 1] === " " && text[i + 2] !== "=") {
      lines.push(`${current.trimEnd()} :`);
      current = "  ";
      i += 1; // skip the space after the colon
      continue;
    }
    if (depth === 0 && ch === " " && current.trim() === "") continue;
    current += ch;
  }
  if (current.trim()) lines.push(current.trimEnd());
  return seenBinder ? lines.join("\n") : source;
}
