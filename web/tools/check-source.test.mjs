import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { checkSource } from "./check-source.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "proof-reader-source-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (file, text = "export {};") => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  git("init", "-q");
  write("src/main.tsx");
  write("src/map/engine/audit.ts");
  return { root, git, write };
}

test("keeps the reader and explicit map diagnostic entries", (t) => {
  const { root } = fixture(t);
  assert.deepEqual(checkSource(root), []);
});

test("follows static, dynamic, type, CSS and JSON imports", (t) => {
  const { root, write } = fixture(t);
  write("src/main.tsx", 'import "./base.css"; import data from "./data.json"; import image from "./paper.svg?url"; import type { T } from "./types"; export { child } from "./child"; import("./lazy");');
  write("src/base.css", '@import "katex/dist/katex.min.css"; @import "./other.css"; body { background: url(paper.svg#layer); }');
  write("src/other.css", "body {}");
  write("src/paper.svg", "<svg></svg>");
  write("src/data.json", "{}");
  write("src/types.ts", "export type T = string;");
  write("src/child/index.ts", "export const child = 1;");
  write("src/lazy.ts");
  assert.deepEqual(checkSource(root), []);
});

test("rejects an unreferenced UI implementation and a stale import", (t) => {
  const { root, write } = fixture(t);
  write("src/old/LeanPane.tsx");
  write("src/main.tsx", 'import "./missing";');
  assert.deepEqual(checkSource(root), [
    "src/main.tsx: local import ./missing has no source file",
    "Unused source file: src/old/LeanPane.tsx",
  ]);
});

test("does not descend into ignored outputs or unrelated tools", (t) => {
  const { root, write } = fixture(t);
  write(".gitignore", "/src/generated/\n/dist/\n");
  write("src/generated/cache.ts");
  write("dist/chunk.ts");
  write("tools/helper.ts");
  assert.deepEqual(checkSource(root), []);
});

test("uses staged source even when the working tree was repaired", (t) => {
  const { root, git, write } = fixture(t);
  write("src/main.tsx", 'import "./missing";');
  git("add", ".");
  write("src/main.tsx");
  assert.deepEqual(checkSource(root), []);
  assert.deepEqual(checkSource(root, { index: true }), ["src/main.tsx: local import ./missing has no source file"]);
});

test("distinguishes staged additions, working deletions and staged deletions", (t) => {
  const { root, git, write } = fixture(t);
  write("src/retired.ts");
  git("add", ".");
  rmSync(join(root, "src/retired.ts"));
  assert.deepEqual(checkSource(root), []);
  assert.deepEqual(checkSource(root, { index: true }), ["Unused source file: src/retired.ts"]);
  git("rm", "--cached", "src/retired.ts");
  assert.deepEqual(checkSource(root, { index: true }), []);
});

test("reads the right index paths when web is nested below the Git root", (t) => {
  const { root, git, write } = fixture(t);
  write("web/src/main.tsx");
  write("web/src/map/engine/audit.ts");
  git("add", ".");
  assert.deepEqual(checkSource(join(root, "web"), { index: true }), []);
});

test("rejects removal of the reader entry", (t) => {
  const { root } = fixture(t);
  rmSync(join(root, "src/main.tsx"));
  assert.deepEqual(checkSource(root), ["Missing source entry: src/main.tsx"]);
});

test("checks a source archive without Git while keeping --index Git-only", (t) => {
  const { root, write } = fixture(t);
  rmSync(join(root, ".git"), { recursive: true });
  write("src/main.tsx", 'import "./active";');
  write("src/active.ts");
  write("dist/unused.ts");
  write("node_modules/package/unused.ts");
  assert.deepEqual(checkSource(root), []);
  assert.throws(() => checkSource(root, { index: true }), /requires a Git checkout and Git/);
  write("src/retired.ts");
  assert.deepEqual(checkSource(root), ["Unused source file: src/retired.ts"]);
});

test("does not follow directory links out of an archive's maintained source", (t) => {
  const { root, write } = fixture(t);
  rmSync(join(root, ".git"), { recursive: true });
  write("outside/unused.ts");
  symlinkSync(join(root, "outside"), join(root, "src", "external"), "dir");
  assert.deepEqual(checkSource(root), []);
});


test("an archive nested in an unrelated Git checkout does not inherit its ignores or index", (t) => {
  const { root, write } = fixture(t);
  write(".gitignore", "/archive/\n");
  write("archive/web/src/main.tsx");
  write("archive/web/src/map/engine/audit.ts");
  const web = join(root, "archive", "web");
  assert.deepEqual(checkSource(web), []);
  assert.throws(() => checkSource(web, { index: true }), /requires a Git checkout and Git/);
});
