#!/usr/bin/env node
/**
 * Reports files that exceed pem-coding-standards.mdc line limits.
 * Usage: node scripts/check-coding-standards.mjs
 * Exit 1 if any violation (CI). Set STANDARDS_WARN_ONLY=1 for exit 0.
 */
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const WARN_ONLY = process.env.STANDARDS_WARN_ONLY === "1";

const LIMITS = [
  {
    name: "RN component / screen (.tsx)",
    globs: ["mobile-app"],
    match: (p) => p.endsWith(".tsx") && !p.includes("node_modules"),
    max: 150,
  },
  {
    name: "NestJS service (.service.ts)",
    globs: ["api/src"],
    match: (p) => p.endsWith(".service.ts"),
    max: 200,
  },
  {
    name: "NestJS controller (.controller.ts)",
    globs: ["api/src"],
    match: (p) => p.endsWith(".controller.ts"),
    max: 80,
  },
  {
    name: "Hook (mobile-app/hooks/use*.ts)",
    globs: ["mobile-app/hooks"],
    match: (p) => /^mobile-app\/hooks\/use[^/]+\.ts$/.test(p),
    max: 80,
  },
  {
    name: "Util (**/utils/*.ts in mobile-app or api)",
    globs: ["mobile-app", "api/src"],
    match: (p) =>
      p.includes("/utils/") &&
      p.endsWith(".ts") &&
      !p.includes("node_modules"),
    max: 60,
  },
];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

async function lineCount(filePath) {
  const { readFile } = await import("node:fs/promises");
  const s = await readFile(filePath, "utf8");
  if (!s) return 0;
  return s.split(/\r?\n/).length;
}

async function main() {
  const violations = [];

  for (const rule of LIMITS) {
    const seen = new Set();
    for (const base of rule.globs) {
      const abs = join(ROOT, base);
      try {
        await stat(abs);
      } catch {
        continue;
      }
      for await (const file of walk(abs)) {
        const rel = relative(ROOT, file).split(join("/")).join("/");
        if (!rule.match(rel)) continue;
        if (seen.has(rel)) continue;
        seen.add(rel);
        const lines = await lineCount(file);
        if (lines > rule.max) {
          violations.push({
            rule: rule.name,
            max: rule.max,
            lines,
            path: rel,
          });
        }
      }
    }
  }

  violations.sort((a, b) => b.lines - a.lines);

  if (violations.length === 0) {
    console.log("Coding standards line-count check: OK (no violations).");
    process.exit(0);
  }

  console.error("Coding standards line-count violations:\n");
  for (const v of violations) {
    console.error(
      `  ${v.lines} lines (max ${v.max})  [${v.rule}]\n    ${v.path}\n`,
    );
  }
  console.error(`Total: ${violations.length} file(s).`);
  process.exit(WARN_ONLY ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
