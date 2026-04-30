#!/usr/bin/env node
/**
 * Rewrites relative TS/TSX imports under mobile-app/ to @/… (see mobile-app/tsconfig.json paths).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "..", "mobile-app");

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".expo") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))
      acc.push(p);
  }
  return acc;
}

function resolveSpecifier(fromFile, spec) {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, spec);
  const stems = [base];
  for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
    stems.push(base + ext);
  }
  const candidates = [...stems, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
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
  if (!resolved || !resolved.startsWith(appRoot)) return null;
  const rel = path.relative(appRoot, resolved).replace(/\\/g, "/");
  const withoutExt = rel.replace(/\.(tsx?|jsx?)$/, "");
  return `@/${withoutExt}`;
}

function transformSource(fromFile, text) {
  const re = /\bfrom\s+(['"])(\.\.?\/[^'"]+)\1/g;
  return text.replace(re, (full, q, s) => {
    const alias = toAlias(fromFile, s);
    if (!alias) return full;
    return `from ${q}${alias}${q}`;
  });
}

const files = walkFiles(appRoot);
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
