#!/usr/bin/env node
// Set a paper's reading text: Markdown and TeX in, HTML out, as JSON on stdout.
//
//   node web/tools/render-paper.mjs papers/SLUG/paper.md SLUG
//
// Each formula is set aside with its plain reading, so tools/reading.py can
// compare the page's words with the PDF before it puts the formulas back. Math
// is protected from Markdown the way Lean Exposition's reader does it.

import { readFileSync } from "node:fs";
import katex from "katex";
import MarkdownIt from "markdown-it";

const [source, slug, language = "haskell"] = process.argv.slice(2);
const OPEN = "";
const CLOSE = "";
const DISPLAY_OPEN = "";
const DISPLAY_CLOSE = "";

const isSpace = (c) => c === undefined || /\s/.test(c);
const isDigit = (c) => c !== undefined && c >= "0" && c <= "9";
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function findClose(src, from, display) {
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (!display && c === "\n" && /^[ \t]*\n/.test(src.slice(j + 1, j + 80))) return -1;
    if (c !== "$") continue;
    if (display) {
      if (src[j + 1] === "$") return j;
      continue;
    }
    if (!isSpace(src[j - 1]) && !isDigit(src[j + 1])) return j;
    return -1;
  }
  return -1;
}

/** Replace each `$…$` and `$$…$$` with a placeholder, leaving code alone. */
function protectMath(src, spans) {
  let out = "";
  let i = 0;
  const n = src.length;
  let lineStart = true;
  let fence = null;
  while (i < n) {
    if (lineStart) {
      const lineEnd = src.indexOf("\n", i);
      const line = src.slice(i, lineEnd < 0 ? n : lineEnd);
      const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence !== null || m) {
        if (fence === null && m) fence = m[1];
        else if (fence !== null && m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
        const stop = lineEnd < 0 ? n : lineEnd + 1;
        out += src.slice(i, stop);
        i = stop;
        continue;
      }
    }
    const c = src[i];
    lineStart = false;
    if (c === "\n") {
      out += c;
      i++;
      lineStart = true;
      continue;
    }
    if (c === "\\" && i + 1 < n) {
      out += src.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === "`") {
      let run = 1;
      while (src[i + run] === "`") run++;
      const ticks = "`".repeat(run);
      let j = src.indexOf(ticks, i + run);
      while (j >= 0 && src[j + run] === "`") j = src.indexOf(ticks, j + run + 1);
      if (j < 0) {
        out += ticks;
        i += run;
        continue;
      }
      out += src.slice(i, j + run);
      i = j + run;
      continue;
    }
    if (c === "$") {
      const display = src[i + 1] === "$";
      const from = display ? i + 2 : i + 1;
      if (display || !isSpace(src[i + 1])) {
        const close = findClose(src, from, display);
        if (close > from) {
          spans.push({ tex: src.slice(from, close).trim(), display });
          out += display ? `${DISPLAY_OPEN}${spans.length - 1}${DISPLAY_CLOSE}` : `${OPEN}${spans.length - 1}${CLOSE}`;
          i = close + (display ? 2 : 1);
          continue;
        }
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** What a formula says, read off KaTeX's MathML. */
function plainMath(tex, display) {
  const mathml = katex.renderToString(tex, { displayMode: display, output: "mathml", strict: "ignore", throwOnError: true, trust: false });
  return mathml
    .replace(/<annotation[\s\S]*?<\/annotation>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const KEYWORDS = {
  haskell: new Set(["data", "where", "class", "instance", "type", "family", "forall", "case", "of", "let", "in", "if", "then", "else", "deriving", "newtype", "import", "module", "do"]),
  lean: new Set(["theorem", "lemma", "def", "inductive", "structure", "class", "instance", "axiom", "fun", "by", "where", "match", "with", "open", "namespace", "end", "variable"]),
};
const ARROWS = new Set(["::", "->", "=>", "=", "|", ":", "\\", "~", "$", ".", "@", "<-", "→", "←", "⇒"]);
const TOKEN = /(--.*$)|(\{-.*?-\})|("(?:[^"\\]|\\.)*")|([A-Za-z_][\w']*)|([:!#$%&*+./<=>?@\\^|~-]+|[→←⇒])|([()[\]{},;`])|(\s+)|(.)/g;

/** One line of code as coloured pieces, in the same classes as the Lean page. */
function highlight(line, language) {
  const keywords = KEYWORDS[language] ?? new Set();
  let out = "";
  const wrap = (kind, text) => `<span class="lk lk--${kind}">${escapeHtml(text)}</span>`;
  for (const m of line.matchAll(TOKEN)) {
    const [text, lineComment, blockComment, string, word, operator, bracket, space] = m;
    if (lineComment || blockComment) out += wrap("comment", text);
    else if (string) out += wrap("string", text);
    else if (word) {
      if (keywords.has(word)) out += wrap("keyword", word);
      else if (/^[A-Z]/.test(word)) out += wrap("type", word);
      else out += escapeHtml(word);
    } else if (operator) {
      if (ARROWS.has(operator)) out += wrap("arrow", operator);
      else if (operator.startsWith(":") || operator.startsWith("'")) out += wrap("type", operator);
      else out += escapeHtml(operator);
    } else if (bracket) out += wrap("bracket", bracket);
    else out += escapeHtml(space ?? text);
  }
  return out;
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

md.inline.ruler.before("link", "note_mark", (state, silent) => {
  const m = /^\[\^(\d+)\]/.exec(state.src.slice(state.pos));
  if (!m) return false;
  if (!silent) {
    const token = state.push("note_mark", "", 0);
    token.meta = { number: m[1] };
  }
  state.pos += m[0].length;
  return true;
});
md.renderer.rules.note_mark = (tokens, index) => {
  const { number } = tokens[index].meta;
  return `<sup class="mark-note"><a href="#note-${number}" id="noteref-${number}">${number}</a></sup>`;
};

md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim() || "text";
  const lines = token.content.replace(/\n$/, "").split("\n");
  const columns = Math.max(...lines.map((line) => line.length));
  const body = lines.map((line) => `<span class="cl">${highlight(line, language) || " "}</span>`).join("");
  return `<pre class="code" data-lang="${language}" style="--cols:${columns}"><code>${body}</code></pre>\n`;
};

md.renderer.rules.code_inline = (tokens, index) => `<code>${highlight(tokens[index].content, language)}</code>`;

md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const name = token.attrGet("src");
  const src = `papers/${slug}/${name}`;
  return `<a class="zoom" data-figure="${escapeHtml(name)}" href="${src}"><img src="${src}" alt="${escapeHtml(token.content)}"></a>`;
};

const outline = [];
md.core.ruler.push("section_ids", (state) => {
  state.tokens.forEach((token, index) => {
    if (token.type !== "heading_open" || token.tag === "h1") return;
    const inline = state.tokens[index + 1];
    const number = /^([A-Z]|\d+(?:\.\d+)*)\s+/.exec(inline.content);
    const title = number ? inline.content.slice(number[0].length) : inline.content;
    const id = `s-${number ? number[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`;
    token.attrSet("id", id);
    outline.push({ id, number: number ? number[1] : "", title, level: Number(token.tag[1]) });
  });
});

let text = readFileSync(source, "utf8");
const spans = [];
text = protectMath(text, spans);

// Footnotes: each definition follows the block that marks it.
const notes = new Map();
text = text.replace(/^\[\^(\d+)\]: (.*)$\n?/gm, (_all, number, body) => {
  notes.set(number, body);
  return "";
});

text = text.replace(/<figcaption>(.*?)<\/figcaption>/g, (_all, body) => `<figcaption>${md.renderInline(body)}</figcaption>`);

let html = md.render(text);

html = html.replace(/<(h[234]) id="([^"]+)">([A-Z]|\d+(?:\.\d+)*) /g, '<$1 id="$2"><span class="sec-no">$3</span> ');
html = html.replace(/<p><a id="(cite-[^"]+)"><\/a>/g, '<p class="ref" id="$1">');

html = html.replace(/<div class="code-columns">([\s\S]*?)<\/div>/g, (all, body) => {
  const widths = [...body.matchAll(/--cols:(\d+)/g)].map((m) => Number(m[1]));
  return `<div class="code-columns" style="--total:${widths.reduce((sum, width) => sum + width, 0)}">${body}</div>`;
});

const blockEnd = /<\/(?:p|li)>/g;
for (const [number, body] of notes) {
  const at = html.indexOf(`id="noteref-${number}"`);
  if (at < 0) throw new Error(`footnote ${number} is never marked`);
  blockEnd.lastIndex = at;
  const end = blockEnd.exec(html);
  const stop = end.index + end[0].length;
  const note = `<aside class="note" id="note-${number}"><a class="note__n" href="#noteref-${number}">${number}</a> ${md.renderInline(body)}</aside>`;
  html = html.slice(0, stop) + note + html.slice(stop);
}
for (const [number] of notes) {
  // A note marked mid-list stays inside its item's block.
  if (!html.includes(`id="note-${number}"`)) throw new Error(`footnote ${number} has no text`);
}

const math = spans.map(({ tex, display }) =>
  katex.renderToString(tex, { displayMode: display, output: "htmlAndMathml", strict: "ignore", throwOnError: true, trust: false }),
);
const place = (n, display) => {
  const index = Number(n);
  const span = `<span class="m" data-m="${index}">${escapeHtml(plainMath(spans[index].tex, spans[index].display))}</span>`;
  return display ? `<div class="math-display">${span}</div>` : span;
};
html = html.replace(new RegExp(`<p>${DISPLAY_OPEN}(\\d+)${DISPLAY_CLOSE}</p>`, "g"), (_m, n) => place(n, true));
html = html.replace(new RegExp(`${DISPLAY_OPEN}(\\d+)${DISPLAY_CLOSE}`, "g"), (_m, n) => place(n, true));
html = html.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_m, n) => place(n, false));

for (const entry of outline) {
  entry.title = entry.title.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_m, n) => plainMath(spans[Number(n)].tex, false));
}

process.stdout.write(JSON.stringify({ html, math, outline }));
