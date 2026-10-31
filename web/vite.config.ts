import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const SITE_URL = "https://wcook04.github.io/proof-reader/";

interface ShelfItem {
  slug: string;
  title: string;
  authors: string[];
  venue: string;
  declarations: number;
}

function shelf(): ShelfItem[] {
  const path = resolve("public/papers/index.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as { papers: ShelfItem[] }).papers : [];
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** For readers that fetch text rather than run the page. No page loads it. */
function llmsText(papers: ShelfItem[]): string {
  return `# Proof Reader

> A website for reading a research paper beside its proof in Lean, a programming language whose compiler rejects a proof with a wrong step. The paper is on the left page. The right page holds a graph of the Lean declarations and the authors' Lean lines, linked to the paper statement by statement.

The papers and their Lean are their authors'. A program compares the reading copy of each paper with its PDF, word for word. The links between statements and Lean, and any notes and plain titles, were made with AI and have not been reviewed by the authors unless a paper says otherwise. Facts about Lean (kinds, lines, uses, axioms) come from Lean itself, run on the authors' project.

## Papers

${papers.map((p) => `- [${p.title}](${SITE_URL}${p.slug}/): ${p.authors.join(", ")}. ${p.venue}. ${p.declarations} declarations.`).join("\n")}

## Data

All data is static under ${SITE_URL}papers/.

- [papers/index.json](${SITE_URL}papers/index.json): every paper, with its title, authors and venue
- papers/<slug>/edition.json: one paper's data. \`paper\` holds its metadata and licence; \`lean\` holds the toolchain and the authors' source files; \`claims\` the results the paper says the Lean establishes; \`passages\` each linked statement, with its verbatim \`quote\`, its \`role\`, the Lean names it is linked to and, where given, the exact \`lines\`; \`declarations\` each Lean declaration with its kind, lines, \`uses_statement\`, \`uses_proof\`, \`used_by_statement\`, \`used_by_proof\` and axioms; \`coverage\` the sections with linked statements; \`analytics\` the axiom summary
- papers/<slug>/source.json: the authors' Lean files, and where each Lean name is printed in the PDF
- papers/<slug>/reading.html: the paper's reading copy as HTML, with its statements, Lean names and page marks marked up
- papers/<slug>/paper.pdf: the authors' PDF, unchanged

## Addresses

- ${SITE_URL}#/<slug>: a paper
- ${SITE_URL}#/<slug>/<name>: a Lean declaration
- ${SITE_URL}#/<slug>/@<passage>: one linked statement, using a passage id from edition.json
- ${SITE_URL}#/<slug>/@declarations: every declaration, with the axiom summary
- ${SITE_URL}#/<slug>/@page-<n>: a page of the PDF

## Source

- [Repository](https://github.com/wcook04/proof-reader): the tool, and how to add a paper
`;
}

function sitemap(papers: ShelfItem[]): string {
  const urls = [SITE_URL, ...papers.map((p) => `${SITE_URL}${p.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

/** A plain page for a wrong address: it needs no script and works from any depth. */
function notFound(base: string, papers: ShelfItem[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Page not found · Proof Reader</title>
<meta name="robots" content="noindex" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml" />
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8f0e2; color: #191520; font: 18px/1.5 "STIX Two Text", "Iowan Old Style", Georgia, serif; }
  main { max-width: 32rem; padding: 24px; }
  .lockup { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; font-size: 1rem; }
  .lockup i { width: 1px; height: 1.35rem; background: currentColor; opacity: 0.3; }
  .lockup img { display: block; }
  h1 { margin: 0 0 12px; font-size: 1.75rem; font-weight: 400; }
  a { color: #a25200; }
  ul { padding-left: 1.2em; }
  @media (prefers-color-scheme: dark) { body { background: #1c1526; color: #f2e6d4; } a { color: #fab250; } }
</style>
</head>
<body>
<main>
<p class="lockup"><a href="https://wcook04.github.io/" rel="author"><img src="${base}plectis.svg" alt="Will Cook: all websites and films" width="26" height="26" /></a><i></i><a href="${base}">Proof Reader</a></p>
<h1>There is nothing at this address.</h1>
<p>Proof Reader shows a paper beside its Lean proof. These are the papers on the site:</p>
<ul>
${papers.map((p) => `<li><a href="${base}#/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a></li>`).join("\n")}
</ul>
<p><a href="${base}">Go to the front page</a></p>
</main>
</body>
</html>
`;
}

/** A page for each paper, so a shared link has that paper's own title and picture. */
function paperPage(html: string, paper: ShelfItem, base: string): string {
  const title = escapeHtml(`${paper.title}, read beside its Lean proof`);
  const description = escapeHtml(`${paper.authors.join(", ")}. Read the paper beside a graph of its Lean proof and the authors' Lean lines.`);
  const url = `${SITE_URL}${paper.slug}/`;
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title} · Proof Reader</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}" />`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`)
    .replace("<head>", `<head>\n    <script>if (!location.hash) location.replace(${JSON.stringify(`${base}#/${paper.slug}`)});</script>`);
}

/** What a static host needs beside the app, written after the bundle. */
function publicFiles(base: string): Plugin {
  let out = resolve("dist");
  return {
    name: "public-files",
    configResolved(config) {
      out = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        // Keep the fonts of the first screen from swapping in late.
        const fonts = Object.keys(context.bundle ?? {}).filter((name) => /stix-two-text-latin-400-normal.*\.woff2$|source-sans-3-latin-wght-normal.*\.woff2$/.test(name));
        return html.replace("</head>", `${fonts.map((name) => `<link rel="preload" href="${base}${name}" as="font" type="font/woff2" crossorigin />`).join("")}</head>`);
      },
    },
    closeBundle() {
      if (!existsSync(out)) return;
      const papers = shelf();
      const html = readFileSync(resolve(out, "index.html"), "utf8");
      writeFileSync(resolve(out, "llms.txt"), llmsText(papers));
      writeFileSync(resolve(out, "sitemap.xml"), sitemap(papers));
      writeFileSync(resolve(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
      writeFileSync(resolve(out, "404.html"), notFound(base, papers));
      for (const paper of papers) {
        mkdirSync(resolve(out, paper.slug), { recursive: true });
        writeFileSync(resolve(out, paper.slug, "index.html"), paperPage(html, paper, base));
      }
      if (existsSync(resolve("public/.nojekyll"))) copyFileSync(resolve("public/.nojekyll"), resolve(out, ".nojekyll"));
    },
  };
}

// VITE_BASE_PATH is the folder the site is served from, such as /proof-reader/.
export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, process.cwd(), "VITE_").VITE_BASE_PATH ?? process.env.VITE_BASE_PATH ?? "/";
  // Nothing inlined: small font subsets in the stylesheet would load whether used or not.
  return { base, build: { assetsInlineLimit: 0 }, plugins: [react(), publicFiles(base)] };
});
