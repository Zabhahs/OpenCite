---
machine_ids: [lib.citations, lib.langNormalize]
findings: []
runtime: shared
status: healthy
tags: [citations, formatting, mla, apa, bibtex, csl, ris]
---

# Citations & Language Normalisation

> **Export and display formatting.** `citations.js` generates MLA 9, APA 7, CSL-JSON, BibTeX, and RIS strings from NCR records; `langNormalize.js` maps heterogeneous language codes to a canonical `{code, display}` pair.

## What it is

Both files are pure formatting helpers — no scoring, no network calls. Called at render time (citation display in `ResultCard`) and on user action (copy/download button).

`src/lib/citations.js` — five export formats, shared name-formatting helpers.
`src/lib/langNormalize.js` — ISO 639-1/639-2/full-name normalisation to a display-safe pair.

## Key exports / surface (citations.js)

| Symbol | Kind | Purpose |
|---|---|---|
| `buildMLA(r)` | fn | Returns `[{text, italic?}]` segment array for MLA 9 |
| `buildAPA(r)` | fn | Returns `[{text, italic?}]` segment array for APA 7 |
| `buildCSL(r)` | fn | Returns CSL-JSON object (caller JSON.stringify's it) |
| `buildBibTeX(r)` | fn | Returns BibTeX string |
| `buildRIS(r)` | fn | Returns RIS string |
| `segmentsToPlain(segs)` | fn | Collapses segment array to plain text string |
| `exportAs(r, format)` | fn | Dispatcher: `'mla'\|'apa'\|'csl-json'\|'bibtex'\|'ris'` → string |
| `isBookChapter(r)` | fn | Type predicate for book-chapter layout branching |

## Key exports (langNormalize.js)

| Symbol | Kind | Purpose |
|---|---|---|
| `normalizeLanguage(raw)` | fn | `raw` → `{code, display}` or `null` |

## Behaviour

### MLA 9 / APA 7 segment arrays

Both `buildMLA` and `buildAPA` return an array of `{text, italic?}` objects rather than a raw HTML string. This lets `ResultCard` render `<em>` inline without an HTML parser. `segmentsToPlain` collapses them for the export path.

Three type branches per formatter: `primary-source`, `book-chapter` (detected by `isBookChapter`), and everything else (journal articles, reports, etc.).

**Author limits**: MLA uses et-al after 3 authors. APA handles up to 20 authors explicitly, then `... lastAuthor` (per APA 7 spec). Editors use the same logic with `(Ed.)` / `(Eds.)` suffix.

**BibTeX key** (`_bibtexKey`): `{familyName}{year}{firstSignificantWord}` — strips whitespace and non-word chars, lowercased, capped at 40 chars. Significant word = first word > 3 chars that's not a stop article.

**CSL type map** (`CSL_TYPE_MAP`): maps NCR types to CSL types. `primary-source` → `document`, `misc` → `document`.

**RIS**: splits `pages` on `-` or en-dash (`–`) into `SP`/`EP` fields. Book chapters use `T2` for container title; articles use `JO`.

### `normalizeLanguage` (`langNormalize.js`, line 68)

Four-path lookup:
1. 2-letter ISO 639-1 (`en`, `fr`) → direct `DISPLAY` lookup.
2. 3-letter ISO 639-2 (`fre`, `ger`, `lat`) → `ISO2_DISPLAY` (special display) or `ISO2` (maps to 639-1) → `DISPLAY`.
3. Full English name (`english`, `german`) → `NAMES` → `DISPLAY`.
4. Unrecognised → pass-through with title-cased display.

`SKIP` set: `mul`, `und`, `zxx`, `mis`, `qaa`, `qab` → returns `null`. These mean "undetermined" or "no linguistic content."

## Correctness notes

**`_authorsParsed` vs `authors`:** `buildCSL`, `buildBibTeX`, `buildRIS` consume `_authorsParsed` (parsed `{family, given}` objects from the NCR parser), while `buildMLA`/`buildAPA` consume `authors` (raw display strings). This is intentional — MLA/APA build display strings from raw names; CSL/BibTeX/RIS need structured data.

**`_defined` utility (CSL):** strips `undefined`/`null`/`""` values from the CSL object — prevents null fields in the JSON output.

**BibTeX escaping:** `_bibtexEscape` handles `&%$#_{}~^\\`. Does NOT escape `<>` — not required by BibTeX spec.

**`exportAs` fallback:** unknown format returns `""` — safe, no throw.

## Overengineering / dead code assessment

`exportAs` is a lazy dispatcher called only on user action (copy/download) — never at search time. This is correct: no citation is built during ranking. `isBookChapter` is exported (used by `groupResults.js` too for the book-chapter grouping logic). No dead code detected.

## 🩺 Health audit

- **Verdict:** healthy.
- **Findings:** none.
- **Reuse:** shared (pure JS), used by `ResultCard` (render-time segment display) and the export dispatcher. `langNormalize` is imported by adapters that normalize language codes from API responses.
- **Smells:** `_bibtexKey` regex `.replace(/[^\w]/g, "")` — `\w` in JS matches Unicode word chars (`\p{L}`, `\p{N}`, `_`) depending on engine flags (no `u` flag here). In practice the key chars are ASCII, so this is fine but could be made explicit with `[^a-zA-Z0-9_]`.

## See also

[[02-Adapters/Adapter-Architecture]] · [[Ranking-Scoring]]
