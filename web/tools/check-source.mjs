// Keep retired UI implementations out of the maintained source tree. TypeScript
// checks imports, but does not report whole files that nothing imports.
// Follow literal module imports and local CSS references. Extend this check and
// its fixtures before introducing computed imports or import.meta.glob.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES = [
  "src/main.tsx",
  // Developer diagnostics for the copied map engine, not part of the reader bundle.
  "src/map/engine/audit.ts",
];

/** Inspect Git candidates, or staged contents when checking the proposed commit. */
export function checkSource(web = WEB, { index = false } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd: web, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const prefix = git("rev-parse", "--show-prefix").trim();
  const args = ["ls-files", "-z", "--cached"];
  if (!index) args.push("--others", "--exclude-standard");
  const candidates = new Set(git(...args, "--", "src/").split("\0").filter((file) => file.startsWith("src/")));
  const source = new Map();
  for (const file of candidates) {
    // A tracked deletion is absent from the working tree but may still be in the index.
    if (!index && !existsSync(resolve(web, file))) continue;
    source.set(file, index ? git("show", `:${prefix}${file}`) : readFileSync(resolve(web, file), "utf8"));
  }
  const errors = [];
  const edges = new Map();
  for (const [file, text] of source) {
    const css = file.endsWith(".css");
    const imports = /\.[cm]?[jt]sx?$/.test(file)
      ? ts.preProcessFile(text, true, true).importedFiles.map((item) => item.fileName)
      : css ? [...text.matchAll(/@import\s+['"](\.[^'"]+)['"]|url\(\s*['"]?([^'"()]+?)['"]?\s*\)/g)].map((match) => match[1] ?? match[2]) : [];
    const targets = [];
    for (const name of imports.filter((name) => css ? !/^(?:[a-z]+:|\/|#)/i.test(name) : name.startsWith("."))) {
      const base = posix.normalize(posix.join(posix.dirname(file), name.split(/[?#]/)[0]));
      const target = ["", ".ts", ".tsx", ".js", ".jsx", ".css", ".json", "/index.ts", "/index.tsx"].map((suffix) => base + suffix).find((candidate) => source.has(candidate));
      if (target) targets.push(target);
      else errors.push(`${file}: local import ${name} has no source file`);
    }
    edges.set(file, targets);
  }
  const reached = new Set();
  function visit(file) {
    if (reached.has(file)) return;
    reached.add(file);
    for (const target of edges.get(file) ?? []) visit(target);
  }
  for (const entry of ENTRIES) {
    if (!source.has(entry)) errors.push(`Missing source entry: ${entry}`);
    else visit(entry);
  }
  for (const file of source.keys()) {
    if (!reached.has(file)) errors.push(`Unused source file: ${file}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--index")) {
    console.error("Usage: node tools/check-source.mjs [--index]");
    process.exitCode = 2;
  } else {
    try {
      const errors = checkSource(WEB, { index: args.includes("--index") });
      if (errors.length) {
        console.error(errors.join("\n"));
        process.exitCode = 1;
      } else console.log("Source tree: all reader files and map diagnostics have an entry point.");
    } catch (error) {
      console.error(`Cannot check source tree: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
