#!/usr/bin/env node
/**
 * to-github.mjs — generate a GitHub-readable MIRROR of the Obsidian wiki.
 *
 *   node scripts/wiki/to-github.mjs
 *
 * Reads  docs/wiki/      (Obsidian source — `[[wikilinks]]`, the canonical SSOT)
 * Writes docs/wiki-gh/   (mirror — standard relative `[text](path.md#anchor)` links that
 *                          render AND navigate when browsing the repo on github.com)
 *
 * The mirror is GENERATED — never edit it by hand. Edit docs/wiki/ and re-run this.
 * What it does per file:
 *   1. `[[Target|Alias]]` / `[[Target#anchor]]` / `[[Target]]` → relative `.md` links.
 *   2. `{#id}` and `### f-208 …` / `### d3` heading-ids → explicit `<a id="…"></a>` anchors
 *      (so the `#f-208`/`#r-300`/`#d3` jump targets work on GitHub, which otherwise slugs
 *      the whole heading text). Prose-heading anchors rely on GitHub's auto-slug (best-effort).
 *   3. Keeps YAML frontmatter (GitHub renders it as a table) + existing relative `.md` links
 *      (mirror dir depth == source dir depth, so they still resolve) + existing <a id> anchors.
 *   4. Adds a "generated — do not edit" banner under the frontmatter.
 * Also writes docs/wiki-gh/README.md so the folder landing page on GitHub is the entry point.
 *
 * Zero dependencies (Node >= 18, ESM).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SRC = join(ROOT, 'docs', 'wiki');
const OUT = join(ROOT, 'docs', 'wiki-gh');
const EXCLUDE_FILES = new Set(['NOTE_TEMPLATE.md']); // template placeholders, not a real note
const EXCLUDE_DIRS = new Set(['_fragments']);        // machine intermediates (JSON, not docs)

const relSrc = (p) => relative(SRC, p).split('\\').join('/');

function walk(dir, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) walk(join(dir, e.name), acc); }
    else if (e.name.endsWith('.md') && !EXCLUDE_FILES.has(e.name)) acc.push(join(dir, e.name));
  }
}

const files = [];
walk(SRC, files);

// Resolvable index: by repo-relative path (no ext) and by basename.
const byRel = new Set();
const byBase = new Map();
for (const f of files) {
  const r = relSrc(f).replace(/\.md$/, '');
  byRel.add(r);
  const base = r.split('/').pop();
  if (!byBase.has(base)) byBase.set(base, r);
}

function resolveTarget(target) {
  if (target.includes('/')) return byRel.has(target) ? target : null;
  return byBase.has(target) ? byBase.get(target) : null;
}

let warnings = 0;
const WIKILINK = /\[\[([^\]]+)\]\]/g;

function convertLinks(content, curRel) {
  const curDir = posix.dirname(curRel.replace(/\.md$/, '')); // '' for root-level notes
  const base = curDir === '.' ? '' : curDir;
  return content.replace(WIKILINK, (m, inner) => {
    const parts = inner.split(/\\?\|/);            // handle `\|` table-escaped + `|` aliases
    let target = parts[0].trim();
    const display = parts.length > 1 ? parts.slice(1).join('|').trim() : null;
    let anchor = null;
    const hi = target.indexOf('#');
    if (hi >= 0) { anchor = target.slice(hi + 1).trim().toLowerCase(); target = target.slice(0, hi).trim(); }
    if (!target) return `[${display || anchor}](#${anchor})`; // same-page anchor link
    const resolved = resolveTarget(target);
    if (!resolved) { warnings++; console.warn(`  ! unresolved [[${inner}]] in ${curRel}`); return m; }
    let rp = posix.relative(base, resolved + '.md');
    if (rp === '') rp = posix.basename(resolved) + '.md';
    const text = display || target.split('/').pop();
    return `[${text}](${rp}${anchor ? '#' + anchor : ''})`;
  });
}

function injectAnchors(content) {
  // 1) inline {#id} (headings or list items) → <a id>
  content = content.replace(/\{#([\w-]+)\}/g, (_, id) => `<a id="${id.toLowerCase()}"></a>`);
  // 2) headings that START with an f-NNN / r-NNN / dN id token → explicit anchor
  return content.split('\n').map((line) => {
    const mm = line.match(/^#{2,6}\s+((?:[fr]-\d+|d\d+)[a-z]?)\b/i);
    return mm ? `<a id="${mm[1].toLowerCase()}"></a>\n${line}` : line;
  }).join('\n');
}

function addBanner(content, srcRel) {
  const banner = `<!-- AUTO-GENERATED from docs/wiki/${srcRel} by scripts/wiki/to-github.mjs — do not edit here. ` +
    `Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->`;
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---', 4);
    if (end >= 0) { const fmEnd = end + 4; return content.slice(0, fmEnd) + '\n' + banner + '\n' + content.slice(fmEnd); }
  }
  return banner + '\n' + content;
}

// ---- build mirror ----
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let written = 0;
for (const f of files) {
  const srcRel = relSrc(f);
  let c = readFileSync(f, 'utf8');
  c = injectAnchors(c);
  c = convertLinks(c, srcRel);
  c = addBanner(c, srcRel);
  const dest = join(OUT, srcRel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, c);
  written++;
}

// Folder landing page (GitHub renders a folder's README.md).
const homeRel = byBase.get('home') || byBase.get('Home');
const homeLink = homeRel ? `${homeRel.split('/').pop()}.md` : 'home.md';
writeFileSync(join(OUT, 'README.md'),
`<!-- AUTO-GENERATED by scripts/wiki/to-github.mjs — do not edit. -->
# OpenCITE Engineering Wiki — GitHub mirror

This folder is the **auto-generated, GitHub-readable mirror** of the OpenCITE engineering wiki.
Links and anchors are clickable when browsing here on github.com.

- **Start here → [${homeLink}](${homeLink})** (Map of Content).
- **Canonical source:** [\`../wiki/\`](../wiki/${homeLink}) — the Obsidian vault (with \`[[wikilinks]]\`,
  graph view, backlinks, and the machine-native \`_machine/\` twin). Edit there, not here.
- **Regenerate this mirror:** \`node scripts/wiki/to-github.mjs\` (run after editing \`docs/wiki/\`).
`);
written++;

console.log(`✓ wrote ${written} files to docs/wiki-gh/ (${files.length} notes mirrored + README).` +
  (warnings ? `\n⚠ ${warnings} unresolved wikilink(s) — left as raw text.` : ' 0 unresolved links.'));
