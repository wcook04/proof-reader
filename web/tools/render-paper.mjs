#!/usr/bin/env node
// Set a paper's reading text: Markdown and TeX in, HTML out, as JSON on stdout.
//
//   node web/tools/render-paper.mjs papers/SLUG/paper.md SLUG
//
// Each formula is set aside with its plain reading, so tools/reading.py can
// compare the page's words with the PDF before it puts the formulas back. Math
// is protected from Markdown the way Lean Exposition's reader does it.

import { readFileSync, writeSync } from "node:fs";
import katex from "katex";
import MarkdownIt from "markdown-it";

const [source, slug, language = "haskell", mode] = process.argv.slice(2);
const guide = mode === "--markdown-source";
const guideLinks = guide ? JSON.parse(readFileSync(0, "utf8") || "{}") : {};
const apiMap = mode === "--api-map" ? JSON.parse(readFileSync(0, "utf8")) : null;
const OPEN = "";
const CLOSE = "";
const DISPLAY_OPEN = "";
const DISPLAY_CLOSE = "";

// Declaration notes and summaries for a paper page: {name: text} on stdin, typeset the way
// the API map's reading notes are, $…$ as KaTeX and `…` as code.
if (source === "--notes") {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const notes = JSON.parse(readFileSync(0, "utf8"));
  const out = Object.fromEntries(Object.entries(notes).map(([name, text]) => {
    if ((text.match(/(?<!\\)\$/g) ?? []).length % 2) throw new Error(`Unpaired $ in the note for ${name}`);
    return [name, text.split(/((?<!\\)\$[^$]+\$|`[^`]+`)/).map((part) => {
      if (part.startsWith("$")) return katex.renderToString(part.slice(1, -1), { output: "htmlAndMathml", strict: "ignore", throwOnError: true, trust: false });
      if (part.startsWith("`")) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part.replace(/\\\$/g, "$"));
    }).join("")];
  }));
  // Written synchronously: process.exit would cut an asynchronous pipe write short.
  writeSync(1, JSON.stringify(out));
  process.exit(0);
}

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

const md = new MarkdownIt({ html: !apiMap, linkify: !!apiMap, typographer: false });
const apiParagraphs = {};
const apiSourceLines = {};
// Each Lean citation gets the colour of its physics topic (concepts.json). Its phrases,
// number and cards all carry that colour.
const apiTones = {};
const PHRASE_OPEN = "\uE020";
const PHRASE_MID = "\uE021";
const PHRASE_CLOSE = "\uE022";

if (apiMap) {
  md.inline.ruler.before("link", "api_map_reference", (state, silent) => {
    const remaining = state.src.slice(state.pos);
    const mark = /^(?:\[(\d+|TODO)\]|\{(\d+)\})(?!\()/.exec(remaining);
    if (!mark) return false;
    if (!silent) {
      const token = state.push("api_map_reference", "", 0);
      token.meta = mark;
    }
    state.pos += mark[0].length;
    return true;
  });
  md.renderer.rules.api_map_reference = (tokens, index) => {
    const mark = tokens[index].meta;
    if (mark[1] === "TODO") return '<span class="api-map__todo" title="Not yet formalized"><span class="api-map__paren">[</span>TODO<span class="api-map__paren">]</span></span>';
    const lean = !!mark[1];
    const number = mark[1] ?? mark[2];
    const name = lean ? "Lean citation" : "Reference";
    const id = `${lean ? "lean" : "ref"}-${number}`;
    const tone = lean ? ` data-tone="${apiTones[id]}"` : "";
    return `<a class="api-map__cite" data-api-citation="${id}"${tone} aria-label="${name} ${number}" aria-controls="api-map-references" href="#/${slug}/@${id}">${mark[0]}</a>`;
  };
  md.core.ruler.push("api_map_index_ids", ({ tokens }) => {
    let list = "";
    let number = 0;
    for (const [i, token] of tokens.entries()) {
      if (token.type === "heading_open") {
        const title = tokens[i + 1].content;
        list = title === "Lean References" ? "lean" : title === "References" ? "ref" : "";
        number = 0;
      }
      if (list && token.type === "list_item_open" && token.level === 1) token.attrSet("id", `index-${list}-${++number}`);
      if (list || token.type !== "paragraph_open" || !token.map) continue;
      const marks = tokens[i + 1].children.filter((child) => child.type === "api_map_reference")
        .map((child) => child.meta)
        .filter((mark) => mark[1] !== "TODO")
        .map((mark) => mark[1] ? `lean-${mark[1]}` : `ref-${mark[2]}`);
      if (!marks.length) continue;
      const id = `p-${token.map[0] + 1}`;
      const references = [...new Set(marks)];
      token.attrSet("id", id);
      token.attrSet("data-api-paragraph", id);
      apiParagraphs[id] = references;
      apiSourceLines[id] = token.map[1];
    }
  });
  md.renderer.rules.paragraph_open = (tokens, index, options, _env, renderer) => {
    const paragraph = renderer.renderToken(tokens, index, options);
    const id = tokens[index].attrGet("data-api-paragraph");
    if (!id) return paragraph;
    return paragraph.trimEnd() + `<a class="api-map__passage" href="#/${slug}/@${id}" aria-controls="api-map-references" aria-label="Open references for this paragraph"></a>`;
  };
}

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
const headingAliases = {};
md.core.ruler.push("section_ids", (state) => {
  state.tokens.forEach((token, index) => {
    if (token.type !== "heading_open" || token.tag === "h1") return;
    const inline = state.tokens[index + 1];
    const prefix = (guide ? /^(?:([A-Z])\.\s+|(\d+(?:\.\d+)*)(?:\.\s+|\s+))/ : /^([A-Z]|\d+(?:\.\d+)*)\s+/).exec(inline.content);
    const number = prefix?.[1] ?? prefix?.[2] ?? "";
    const title = prefix ? inline.content.slice(prefix[0].length) : inline.content;
    const id = `s-${number || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`;
    token.attrSet("id", id);
    if (guide) headingAliases[inline.content.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/g, "-")] = id;
    outline.push({ id, number, title, level: Number(token.tag[1]) });
  });
});

let text = readFileSync(source, "utf8");
// Frontmatter is source metadata, not a paragraph in the reading copy. Keep
// every newline in place so source anchors still point to the original file.
if (guide) text = text.replace(/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/, (header, body) => {
  const lines = body.split(/\r?\n/);
  const metadata = lines.some((line) => /^title:\s*\S/.test(line)) &&
    lines.every((line) => /^(?:[A-Za-z_][\w-]*:\s*.*|\s{2,}-\s+\S.*|\s*)$/.test(line));
  return metadata ? header.replace(/[^\r\n]/g, " ") : header;
});
const sourceBlocks = [];
if (guide) {
  // Use the parser's top-level source maps. A table or list is one block;
  // blank lines inside a fence do not split it. Headings reset the index.
  const tokens = new MarkdownIt({ html: true }).parse(text, {});
  let heading = "";
  let block = 0;
  const insertions = new Map();
  const add = (line, marker) => insertions.set(line, (insertions.get(line) ?? "") + marker);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.level !== 0 || !token.map) continue;
    if (token.type === "heading_open") {
      heading = tokens[i + 1].content;
      block = 0;
      continue;
    }
    const id = `md-${token.map[0] + 1}`;
    sourceBlocks.push({ heading, block: ++block, id, kind: token.type, line: token.map[0] + 1, end_line: token.map[1] });
    add(token.map[0], `<div hidden data-source-start="${id}"></div>\n\n`);
    add(token.map[1], `\n<div hidden data-source-end="${id}"></div>\n\n`);
  }
  const lines = text.split("\n");
  text = lines.map((line, i) => (insertions.get(i) ?? "") + line).join("\n") + (insertions.get(lines.length) ?? "");
}
const apiPhrases = [];
if (apiMap) {
  // Mark each matched phrase in the authors' Markdown before it is parsed. A phrase is
  // found, with any line breaks, only in the paragraph that carries its citation, and
  // must occur there exactly once and must not cut through a typeset formula.
  const boundary = text.indexOf("\n## Lean References\n");
  const prose = text.slice(0, boundary);
  // A citation's tone is its topic's colour; citations of one topic alternate
  // between that colour's two shades in reading order.
  const order = [...new Set(Array.from(prose.matchAll(/\[(\d+)\](?!\()/g), (m) => m[1]))];
  const seen = apiMap.concepts.map(() => 0);
  for (const number of order) {
    const topic = apiMap.concepts.findIndex((c) => c.citations.includes(Number(number)));
    apiTones[`lean-${number}`] = topic * 2 + (seen[topic]++ % 2);
  }
  const paragraphs = [];
  for (const m of prose.matchAll(/(?:^|\n\n)([\s\S]*?)(?=\n\n|$)/g)) {
    const start = m.index + m[0].length - m[1].length;
    paragraphs.push({ start, end: start + m[1].length });
  }
  const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const formulas = Object.keys(apiMap.maths).sort((a, b) => b.length - a.length);
  const formulaAt = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${formulas.map(literal).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  const typeset = Array.from(prose.matchAll(formulaAt), (m) => [m.index, m.index + m[0].length]);
  const ranges = [];
  apiMap.phrases.forEach((phrase, id) => {
    const mark = new RegExp(`\\[${phrase.citation}\\](?!\\()`).exec(prose);
    const home = mark && paragraphs.find((p) => p.start <= mark.index && mark.index < p.end);
    if (!home) throw new Error(`Lean citation [${phrase.citation}] is not in the map's text`);
    const pattern = new RegExp(phrase.quote.split(" ").map(literal).join("(?:[ \\t]+|[ \\t]*\\n[ \\t]*)"), "gu");
    const hits = Array.from(prose.slice(home.start, home.end).matchAll(pattern));
    if (hits.length !== 1) throw new Error(`Phrase for [${phrase.citation}] occurs ${hits.length} times in its paragraph: ${phrase.quote}`);
    const start = home.start + hits[0].index;
    const end = start + hits[0][0].length;
    const cut = typeset.find(([a, b]) => a < end && b > start && !(a >= start && b <= end) && !(a <= start && b >= end && a === start && b === end));
    if (cut) throw new Error(`Phrase for [${phrase.citation}] cuts the formula ${prose.slice(cut[0], cut[1])}: ${phrase.quote}`);
    const clash = ranges.find((r) => r.start < end && r.end > start);
    if (clash) throw new Error(`Phrases overlap: ${phrase.quote} / ${apiMap.phrases[clash.id].quote}`);
    ranges.push({ id, start, end });
    apiPhrases.push({ id, citation: `lean-${phrase.citation}`, quote: phrase.quote, names: phrase.names, tone: apiTones[`lean-${phrase.citation}`] });
  });
  let marked = prose;
  for (const { id, start, end } of [...ranges].sort((a, b) => b.start - a.start)) {
    marked = marked.slice(0, start) + PHRASE_OPEN + id + PHRASE_MID + marked.slice(start, end) + PHRASE_CLOSE + marked.slice(end);
  }
  text = marked + text.slice(boundary);
}
const spans = [];
text = protectMath(text, spans);
if (apiMap) {
  // A typesetting overlay can only replace a literal span of the authors' Unicode.
  // Longer formulas win over a symbol inside them, and code spans stay intact
  // unless their entire contents are one of the explicitly mapped expressions.
  const formulas = Object.keys(apiMap.maths).sort((a, b) => b.length - a.length);
  const seen = new Set();
  const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`\x60[^\x60\n]+\x60|(?<![\\p{L}\\p{N}_])(?:${formulas.map(literal).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  const boundary = text.indexOf("\n## Lean References\n");
  text = text.slice(0, boundary).replace(expression, (source) => {
    const plain = source.startsWith("`") ? source.slice(1, -1) : source;
    if (!Object.hasOwn(apiMap.maths, plain)) return source;
    seen.add(plain);
    spans.push({ tex: apiMap.maths[plain], display: false, plain });
    return `${OPEN}${spans.length - 1}${CLOSE}`;
  }) + text.slice(boundary);
  for (const source of formulas) if (!seen.has(source)) throw new Error(`No source formula: ${source}`);
}

// Footnotes: each definition follows the block that marks it.
const notes = new Map();
text = text.replace(/^\[\^(\d+)\]: (.*)$\n?/gm, (_all, number, body) => {
  notes.set(number, body);
  return "";
});

text = text.replace(/<figcaption>(.*?)<\/figcaption>/g, (_all, body) => `<figcaption>${md.renderInline(body)}</figcaption>`);

const environment = {};
let html = md.render(text, environment);
if (apiMap) {
  for (const ref of apiMap.references.filter((ref) => ref.apiMap)) {
    const path = escapeHtml(ref.apiMap);
    const file = `${path}/API-map.md`;
    html = html.replace(file, `<a href="https://physlib.io/api-tracker#${path}">${file}</a>`);
  }
}
const quoteHtml = {};
if (guide) {
  for (const passage of guideLinks.passages ?? []) {
    const anchor = passage.anchor ?? {};
    const block = sourceBlocks.find((b) => b.heading === anchor.heading && b.block === anchor.block);
    quoteHtml[passage.id] = block?.kind === "fence" || block?.kind === "code_block"
      ? escapeHtml(passage.quote)
      : md.renderInline(protectMath(passage.quote, spans), environment);
  }
}

html = html.replace(/<(h[234]) id="([^"]+)">([A-Z]|\d+(?:\.\d+)*) /g, '<$1 id="$2"><span class="sec-no">$3</span> ');
html = html.replace(/<p><a id="(cite-[^"]+)"><\/a>/g, '<p class="ref" id="$1">');

html = html.replace(/<div class="code-columns">([\s\S]*?)<\/div>/g, (all, body) => {
  const widths = [...body.matchAll(/--cols:(\d+)/g)].map((m) => Number(m[1]));
  return `<div class="code-columns" style="--total:${widths.reduce((sum, width) => sum + width, 0)}">${body}</div>`;
});

const blockEnd = /<\/(?:p|li)>/g;
// Last first, so that two notes on one block keep their order.
for (const [number, body] of [...notes].reverse()) {
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
  if (apiMap) {
    const plain = spans[index].plain;
    return plain === undefined ? math[index] : `<span class="api-map__math" data-copy-math="${escapeHtml(plain)}">${math[index]}</span>`;
  }
  const span = `<span class="m" data-m="${index}">${escapeHtml(plainMath(spans[index].tex, spans[index].display))}</span>`;
  return display ? `<div class="math-display">${span}</div>` : span;
};
html = html.replace(new RegExp(`<p>${DISPLAY_OPEN}(\\d+)${DISPLAY_CLOSE}</p>`, "g"), (_m, n) => place(n, true));
html = html.replace(new RegExp(`${DISPLAY_OPEN}(\\d+)${DISPLAY_CLOSE}`, "g"), (_m, n) => place(n, true));
html = html.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_m, n) => place(n, false));
for (const id of Object.keys(quoteHtml)) {
  quoteHtml[id] = quoteHtml[id].replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_m, n) => place(n, false));
  quoteHtml[id] = quoteHtml[id].replace(new RegExp(`${DISPLAY_OPEN}(\\d+)${DISPLAY_CLOSE}`, "g"), (_m, n) => place(n, true));
}

if (apiMap) {
  // In the Lean References list, set each file path on its own line, breakable only after a slash.
  html = html.replace(/(<li id="index-lean-\d+">\s*(?:<p>)?)([^<\s]+\.lean) — /g, (_m, open, path) =>
    `${open}<span class="api-map__path">${escapeHtml(path).replaceAll("/", "/<wbr>")}</span> `);
}

if (apiMap) {
  // Turn each phrase marker into a span. The span may hold whole elements, such as a
  // formula or an emphasis, but may not open or close one that started outside it.
  html = html.replace(new RegExp(`${PHRASE_OPEN}(\\d+)${PHRASE_MID}`, "g"), (_m, id) => {
    const phrase = apiPhrases[Number(id)];
    return `<span class="api-map__phrase" data-phrase="${id}" data-phrase-citation="${phrase.citation}" data-tone="${phrase.tone}" role="button" tabindex="0">`;
  }).replaceAll(PHRASE_CLOSE, "</span>");
  for (const phrase of apiPhrases) {
    const open = html.indexOf(`<span class="api-map__phrase" data-phrase="${phrase.id}"`);
    const from = html.indexOf(">", open) + 1;
    const tags = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
    tags.lastIndex = from;
    const stack = [];
    let to = -1;
    for (let tag; (tag = tags.exec(html));) {
      const [, closing, name, selfClosing] = tag;
      if (selfClosing || /^(?:br|wbr|img|hr|input|col|area|base|link|meta|source)$/i.test(name)) continue;
      if (!closing) stack.push(name);
      else if (stack.length) {
        if (stack.pop() !== name) throw new Error(`Phrase crosses an element boundary: ${phrase.quote}`);
      } else if (name === "span") { to = tag.index; break; }
      else throw new Error(`Phrase crosses an element boundary: ${phrase.quote}`);
    }
    if (to < 0) throw new Error(`Phrase is not closed: ${phrase.quote}`);
    phrase.html = html.slice(from, to);
  }
  // The topics cited between each heading and the next, for the contents list.
  var sectionTopics = {};
  let section = null;
  for (const m of html.matchAll(/<h[2-6] id="([^"]+)"|data-api-citation="lean-(\d+)"/g)) {
    if (m[1]) { section = m[1]; continue; }
    const topic = apiMap.concepts.findIndex((c) => c.citations.includes(Number(m[2])));
    if (section && !(sectionTopics[section] ??= []).includes(topic)) sectionTopics[section].push(topic);
  }
  const { done, total } = apiMap.status;
  html = html.replace("</h1>", `</h1>\n<p class="api-map__status"><span class="api-map__badge">Alpha</span> <span>${done} of ${total} claims formalized</span> <span class="api-map__progress" role="img" aria-label="${done} of ${total} claims formalized"><span style="width:${(100 * done / total).toFixed(1)}%"></span></span></p>\n<div class="api-map__guide"><p class="api-map__legend"><span class="api-map__legend-label">Topic colours</span>${apiMap.concepts.map((c, i) => ` <span class="api-map__topic" data-tone="${i * 2}">${escapeHtml(c.name)}</span>`).join("")}</p><p>Click a marked passage, citation number or underlined phrase to inspect it.</p></div>\n`);
  html = html.replace(/ \(Alpha\)<\/h([23])>/g, ' <span class="api-map__badge"><span class="api-map__paren">(</span>Alpha<span class="api-map__paren">)</span></span></h$1>');
}

for (const entry of outline) {
  entry.title = entry.title.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_m, n) => plainMath(spans[Number(n)].tex, false));
}

// Reading notes: plain text with $…$ TeX, typeset like the map, and `…` for Lean names.
function renderApiNote(note, name, chip = false) {
  if ((note.match(/\$/g) ?? []).length % 2) throw new Error(`Unpaired $ in the reading note for ${name}`);
  return note.split(/(\$[^$]+\$|`[^`]+`)/).map((part) => {
    if (part.startsWith("$")) return katex.renderToString(part.slice(1, -1), { output: "htmlAndMathml", strict: "ignore", throwOnError: true, trust: false });
    if (part.startsWith("`")) return `<code${chip ? ' class="api-map__chip"' : ""}>${escapeHtml(part.slice(1, -1))}</code>`;
    return escapeHtml(part);
  }).join("");
}

const noteHtml = Object.fromEntries(Object.entries(apiMap?.notes ?? {}).map(([name, note]) => [name, renderApiNote(note, name)]));
const passageNotes = {};
if (apiMap) {
  const linked = Object.keys(apiParagraphs).filter((id) => apiParagraphs[id].some((mark) => mark.startsWith("lean-")));
  if (Object.keys(apiMap.passageNotes).sort().join() !== linked.sort().join()) {
    throw new Error("Passage notes must cover exactly the paragraphs with Lean citations");
  }
  for (const [id, { title, anchor, body }] of Object.entries(apiMap.passageNotes)) {
    const matches = apiPhrases.filter((phrase) => apiParagraphs[id].includes(phrase.citation) && phrase.quote === anchor);
    if (matches.length !== 1 || !title?.trim() || !body?.trim()) throw new Error(`Invalid passage note for ${id}`);
    passageNotes[id] = { title, anchor: matches[0].id, endLine: apiSourceLines[id],
      html: body.split("\n\n").map((paragraph) => `<p>${renderApiNote(paragraph, id, true)}</p>`).join("") };
  }
}
process.stdout.write(JSON.stringify({ html, math, outline, ...(apiMap ? { paragraphs: apiParagraphs, phrases: apiPhrases, tones: apiTones, concepts: apiMap.concepts, sectionTopics, noteHtml, passageNotes } : {}), ...(guide ? { source_blocks: sourceBlocks, quote_html: quoteHtml, heading_aliases: headingAliases } : {}) }));
