#!/usr/bin/env node
/**
 * One-shot codemod: rewrite relative TS imports under api/src and api/test
 * to @/… (paths must match api/tsconfig.json).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..", "api");
const srcRoot = path.join(apiRoot, "src");

function walkTsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, acc);
    else if (ent.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

function resolveSpecifier(fromFile, spec) {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, spec);
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function toAlias(fromFile, spec) {
  const resolved = resolveSpecifier(fromFile, spec);
  if (!resolved || !resolved.startsWith(srcRoot)) return null;
  const rel = path.relative(srcRoot, resolved).replace(/\\/g, "/");
  const withoutExt = rel.replace(/\.ts$/, "");
  return `@/${withoutExt}`;
}

function transformSource(fromFile, text) {
  const re = /\bfrom\s+(['"])(\.\.?\/[^'"]+)\1/g;
  return text.replace(re, (full, q, spec) => {
    const alias = toAlias(fromFile, spec);
    if (!alias) return full;
    return `from ${q}${alias}${q}`;
  });
}

const files = [
  ...walkTsFiles(srcRoot),
  ...walkTsFiles(path.join(apiRoot, "test")),
];

let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = transformSource(file, before);
  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    changed += 1;
  }
}
console.log(`Updated ${changed} file(s).`);
