#!/usr/bin/env node
/**
 * build-machine-map.mjs — (re)builds the machine-native twin of the OpenCITE wiki.
 *
 *   node scripts/wiki/build-machine-map.mjs          # assemble + write machine layer
 *   node scripts/wiki/build-machine-map.mjs --check  # lint only, non-zero exit on problems
 *
 * What it does:
 *   1. Statically scans the source tree (src/, api/, mcp/, prisma/, scripts/, root config)
 *      for modules, computes each module id (per _machine/schema.md), LOC, and import edges.
 *   2. Merges the CURATED overlay from docs/wiki/_machine/_fragments/*.modules.json
 *      (purpose/runtime/status/findings/tags/wiki/notes) onto the structural scan, matched by path.
 *      Structural fields (id, path, loc, deps) are authoritative from the scan; curated fields win
 *      for everything else. graph.json is ALWAYS derived — never hand-edited.
 *   3. Concatenates findings/reuse fragments into findings.json / reuse.json (sorted by id).
 *   4. Writes modules.json, graph.json, findings.json, reuse.json, manifest.json.
 *   5. --check: reports dangling wiki/finding cross-refs, orphan modules, duplicate finding ids,
 *      and modules whose `wiki:` note file is missing.
 *
 * Zero dependencies (Node >= 18, ESM).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const WIKI = join(ROOT, 'docs', 'wiki');
const MACHINE = join(WIKI, '_machine');
const FRAGMENTS = join(MACHINE, '_fragments');
const CHECK = process.argv.includes('--check');

const SRC_EXT = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const ALSO = new Set(['.prisma', '.sql', '.css', '.html', '.json']); // documented but not import-scanned
// Roots to walk for modules. Config files added explicitly below.
const WALK_DIRS = ['src', 'api', 'mcp/src', 'mcp/bin', 'prisma', 'scripts'];
const ROOT_CONFIG = ['vite.config.js', 'tailwind.config.js', 'vercel.json', 'index.html', 'package.json'];
const IGNORE = new Set(['node_modules', '.git', '.claude', 'dist', 'docs', 'public']);

const rel = (p) => relative(ROOT, p).split('\\').join('/');

/** path (repo-relative, posix) -> module id, per _machine/schema.md */
function toId(relPath) {
  let p = relPath.replace(/\.(jsx?|mjs|tsx?|prisma|sql|css|html|json)$/i, '');
  const segs = p.split('/');
  // api/search/<name> -> api.route.<name>
  if (segs[0] === 'api' && segs[1] === 'search' && segs.length >= 3) {
    return ['api', 'route', ...segs.slice(2)].join('.');
  }
  const out = [];
  for (const s of segs) {
    if (s === 'src') continue;        // drop src wrapper
    out.push(s === '_shared' ? 'shared' : s);
  }
  return out.join('.');
}

function walk(dir, acc) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
}

function discover() {
  const files = [];
  for (const d of WALK_DIRS) walk(join(ROOT, d), files);
  for (const f of ROOT_CONFIG) { const p = join(ROOT, f); if (existsSync(p)) files.push(p); }
  const mods = new Map(); // id -> record
  const byPath = new Map(); // relPath -> id
  for (const full of files) {
    const ext = extname(full).toLowerCase();
    if (!SRC_EXT.has(ext) && !ALSO.has(ext)) continue;
    const relPath = rel(full);
    const id = toId(relPath);
    const src = readFileSync(full, 'utf8');
    const loc = src.split('\n').length;
    mods.set(id, { id, path: relPath, loc, deps: [], _ext: ext, _src: SRC_EXT.has(ext) ? src : '' });
    byPath.set(relPath, id);
  }
  return { mods, byPath };
}

const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*|export\s[^'"]*?from\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function resolveSpecifier(spec, fromRelPath, byPath) {
  if (!spec.startsWith('.')) return null; // bare/external
  const fromDir = posix.dirname(fromRelPath);
  let base = posix.normalize(posix.join(fromDir, spec));
  const candidates = [base];
  const exts = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];
  if (!extname(base)) for (const e of exts) candidates.push(base + e);
  for (const e of exts) candidates.push(posix.join(base, 'index' + e));
  for (const c of candidates) if (byPath.has(c)) return byPath.get(c);
  return null;
}

function computeDeps(mods, byPath) {
  for (const m of mods.values()) {
    if (!m._src) continue;
    const set = new Set();
    let mm;
    IMPORT_RE.lastIndex = 0;
    while ((mm = IMPORT_RE.exec(m._src))) {
      const id = resolveSpecifier(mm[1], m.path, byPath);
      if (id && id !== m.id) set.add(id);
    }
    m.deps = [...set].sort();
  }
}

function readJsonArrays(suffix) {
  const out = [];
  if (!existsSync(FRAGMENTS)) return out;
  for (const f of readdirSync(FRAGMENTS)) {
    if (!f.endsWith(suffix)) continue;
    try {
      const arr = JSON.parse(readFileSync(join(FRAGMENTS, f), 'utf8'));
      if (Array.isArray(arr)) out.push(...arr.map((x) => ({ ...x, _src: f })));
      else warn(`fragment ${f} is not a JSON array`);
    } catch (e) { warn(`fragment ${f} failed to parse: ${e.message}`); }
  }
  return out;
}

const problems = [];
const warn = (m) => problems.push(m);

function main() {
  const { mods, byPath } = discover();
  computeDeps(mods, byPath);

  // curated overlay (matched by path)
  const curated = readJsonArrays('.modules.json');
  const curatedByPath = new Map();
  for (const c of curated) {
    if (!c.path) { warn(`curated module missing path (id=${c.id ?? '?'}) in ${c._src}`); continue; }
    if (curatedByPath.has(c.path)) warn(`duplicate curated module for ${c.path}`);
    curatedByPath.set(c.path, c);
  }

  const CURATED_FIELDS = ['kind', 'runtime', 'purpose', 'exports', 'status', 'findings', 'wiki', 'tags', 'notes'];
  const merged = [];
  for (const m of [...mods.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const c = curatedByPath.get(m.path) || {};
    const rec = { id: m.id, path: m.path, loc: m.loc, deps: m.deps };
    for (const f of CURATED_FIELDS) if (c[f] !== undefined) rec[f] = c[f];
    const needsCuration = SRC_EXT.has(extname(m.path).toLowerCase())
      && !/\.test\.(jsx?|mjs|tsx?)$/.test(m.path)
      && !m.path.startsWith('scripts/wiki/');
    if (!c.path && needsCuration) warn(`UNCURATED module: ${m.path} (id=${m.id}) — no fragment record`);
    merged.push(rec);
  }
  // curated records with no matching disk file: `status: quarantined` = source moved to the wiki
  // quarantine (preserved out of the build) → keep as a VIRTUAL module so findings/links resolve;
  // anything else is a stale reference and is flagged.
  for (const c of curated) {
    if (!c.path || byPath.has(c.path)) continue;
    if (c.status === 'quarantined') {
      const rec = { id: c.id, path: c.path, loc: 0, deps: [], quarantined: true };
      for (const f of CURATED_FIELDS) if (c[f] !== undefined) rec[f] = c[f];
      merged.push(rec);
    } else {
      warn(`curated module path not found on disk: ${c.path} (${c._src})`);
    }
  }
  merged.sort((a, b) => a.id.localeCompare(b.id));

  // graph
  const edges = [];
  for (const m of merged) for (const d of m.deps) edges.push([m.id, d]);
  const reverse = {};
  for (const [a, b] of edges) (reverse[b] ||= []).push(a);
  for (const k of Object.keys(reverse)) reverse[k].sort();

  // findings + reuse
  const findings = readJsonArrays('.findings.json').map(({ _src, ...x }) => x)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const reuse = readJsonArrays('.reuse.json').map(({ _src, ...x }) => x)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  // ---- checks ----
  const idSet = new Set(merged.map((m) => m.id));
  const findingIds = new Set(findings.map((f) => f.id));
  const seenF = new Set();
  for (const f of findings) {
    if (seenF.has(f.id)) warn(`duplicate finding id ${f.id}`); seenF.add(f.id);
    for (const mid of f.modules || []) if (!idSet.has(mid)) warn(`finding ${f.id} references unknown module ${mid}`);
    if (f.wiki && !existsSync(join(WIKI, f.wiki.split('#')[0]))) warn(`finding ${f.id} wiki note missing: ${f.wiki}`);
  }
  for (const m of merged) {
    for (const fid of m.findings || []) if (!findingIds.has(fid)) warn(`module ${m.id} references unknown finding ${fid}`);
    if (m.wiki && !existsSync(join(WIKI, m.wiki.split('#')[0]))) warn(`module ${m.id} wiki note missing: ${m.wiki}`);
    for (const d of m.deps) if (!idSet.has(d)) warn(`module ${m.id} dep not in module set: ${d}`);
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    counts: {
      modules: merged.length,
      curated: merged.filter((m) => m.purpose !== undefined).length,
      edges: edges.length,
      findings: findings.length,
      reuse: reuse.length,
    },
    byRuntime: tally(merged, 'runtime'),
    byStatus: tally(merged, 'status'),
    findingsBySeverity: tally(findings, 'severity'),
    findingsByType: tally(findings, 'type'),
    problems: problems.length,
  };

  if (CHECK) {
    if (problems.length) { console.error(`✗ ${problems.length} problem(s):`); for (const p of problems) console.error('  - ' + p); process.exit(1); }
    console.log('✓ machine layer consistent'); return;
  }

  write('modules.json', merged);
  write('graph.json', { edges, reverse });
  write('findings.json', findings);
  write('reuse.json', reuse);
  write('manifest.json', manifest);
  console.log(`✓ wrote machine layer — ${merged.length} modules, ${edges.length} edges, ${findings.length} findings, ${reuse.length} reuse.`);
  if (problems.length) { console.log(`⚠ ${problems.length} problem(s) (run --check for the list):`); for (const p of problems.slice(0, 12)) console.log('  - ' + p); }
}

function tally(arr, key) {
  const t = {};
  for (const x of arr) { const k = x[key] ?? 'unspecified'; t[k] = (t[k] || 0) + 1; }
  return t;
}
function write(name, data) { writeFileSync(join(MACHINE, name), JSON.stringify(data, null, 2) + '\n'); }

main();
