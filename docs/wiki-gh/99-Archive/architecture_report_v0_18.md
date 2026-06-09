<!-- AUTO-GENERATED from docs/wiki/99-Archive/architecture_report_v0_18.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->
# OpenCITE — Architecture Report
> **Canonical reference for the next Claude instance picking up this project.**
> Read this before touching any code. Contains full sprint history, schema, file map, roadmap, and execution checklists.
> Last updated: v0.18 — SOW heritage adapters + SSOT refactor + metadata enrichment

---

## What changed in v0.18

### Sprint overview

Three sequential fixes executed against the adapter layer:

**Fix 1 — Shared XML utility (SSOT)**
**Fix 2 — Per-adapter file split**
**Fix 3 — Metadata gap fills across all adapters**

---

### Fix 1 — `src/adapters/_shared/xmlUtils.js` (new file)

Duplicate XML parsing helpers existed verbatim in three places (ONB adapter, BnF adapter, `api/search/mexicana.js`). Extracted into a single shared module.

Exports:

| Function | Purpose |
|---|---|
| `dcOne(xml, tag)` | First value of a Dublin Core element (handles namespace prefixes) |
| `dcAll(xml, tag)` | All values of a Dublin Core element |
| `sruTotal(xml)` | `<numberOfRecords>` from SRU envelope |
| `sruRecords(xml)` | All `<recordData>` blocks from SRU response |
| `oaiRecords(xml)` | All `<record>` blocks from OAI-PMH ListRecords |
| `oaiResumptionToken(xml)` | OAI-PMH resumption token (null if absent) |
| `unimarcOne(xml, tag, code)` | First subfield value for a UNIMARC datafield |
| `unimarcAll(xml, tag, code)` | All subfield values for a UNIMARC datafield |

`api/search/mexicana.js` is a Vercel Edge route and cannot import from `src/`. Its inline helpers remain in sync manually — noted in the file header.

---

### Fix 2 — `src/adapters/extensions/` split into per-adapter files

The monolithic `extensions/index.js` was 1,037 lines containing all 25 adapter objects. Past the documented ~20-adapter split threshold.

Each adapter is now its own file. `extensions/index.js` is a 40-line pure re-export barrel with no logic.

**File map — extensions/**

| File | Adapter |
|---|---|
| `europeana.js` | Europeana |
| `met.js` | The Met |
| `smithsonian.js` | Smithsonian |
| `dpla.js` | DPLA |
| `rijksmuseum.js` | Rijksmuseum |
| `internetArchive.js` | Internet Archive |
| `bdpi.js` | BDPI |
| `gallica.js` | BnF Gallica |
| `thaqalayn.js` | Thaqalayn |
| `ncbi.js` | NCBI Entrez |
| `openContext.js` | Open Context |
| `northwestern.js` | Northwestern Digital |
| `princetonDpul.js` | Princeton DPUL |
| `pangaea.js` | PANGAEA |
| `openNeuro.js` | OpenNeuro |
| `ena.js` | ENA |
| `chroniclingAmerica.js` | Chronicling America *(v.18)* |
| `onb.js` | ONB / ANNO *(v.18)* |
| `bdh.js` | BDH / BNE *(v.18)* |
| `bnfApi.js` | BnF Catalogue *(v.18)* |
| `britishLibrary.js` | British Library *(v.18)* |
| `delpher.js` | KB / Delpher *(v.18)* |
| `lcDatasets.js` | Library of Congress *(v.18)* |
| `mexicana.js` | Mexicana *(v.18)* |
| `nls.js` | NLS Data Foundry *(v.18)* |

To add a new adapter: create the file, export the constant, add one line to `extensions/index.js`, register in `src/adapters/index.js` ADAPTERS array.

---

### Fix 3 — Metadata gap fills

Full audit of all 25 extension adapters + 4 core adapters against available upstream fields. Fields mapped where the API provides them but the adapter was discarding them.

**`src/adapters/_shared/normalize.js` — TYPE_MAP expanded**

Added 20 heritage/newspaper type strings emitted by the v.18 sources so they canonicalize correctly instead of falling through to `"misc"`:

`"newspaper"`, `"Newspaper"`, `"newspaper page"`, `"magazine"`, `"periodical"`, `"serial"`, `"map"`, `"maps"`, `"photograph"`, `"photographs"`, `"still image"`, `"moving image"`, `"sound"`, `"audio"`, `"ephemera"`, `"pamphlet"`, `"letter"`, `"correspondence"`, `"text"`, `"Text"`

**Per-adapter changes**

| Adapter | Fields added |
|---|---|
| Europeana | `dcSubject[]` → `subjects`; `edmType[0]` → `type`; `dcLanguage[0]` → `language` |
| The Met | `classification`, `objectName`, `culture`, `period`, `dynasty`, `tags[].term` → `subjects`; `objectName` → `type` |
| Smithsonian | `idx.topic[]`, `idx.culture[]`, `idx.place[]`, `idx.taxonomicName[]` → `subjects`; `idx.objectType[0]` → `type`; `freetext.language[0]` → `language` |
| DPLA | `src.subject[].name` → `subjects`; `src.type[0]` → `type`; `src.language[].name` → `language` |
| Rijksmuseum | `objectTypes[0]` → `type`; `objectCollection[]`, `objectTypes[]` → `subjects` |
| Internet Archive | `d.subject` (string or array) → `subjects`; `d.mediatype` → `type`; `d.language` → `language`; `subject` + `language` added to fetched fields list |
| Chronicling America | `it.type[0]` → `type` passthrough (was hardcoded `"primary-source"`) |
| Delpher | `it.subject` / `it['dcterms:subject']` → `subjects`; `it.type` / `it['dc:type']` → `type`; `journal` now reads `paper_title` / `publication` |
| NLS | `it.subject`, `it.topic`, `it.tags` → `subjects`; `it.type` / `it.format` / `it.mediaType` → `type`; `journal` also reads `it.series` |
| BnF Catalogue | UNIMARC 600$a, 606$a, 607$a → `subjects` (personal, topical, geographic headings); UNIMARC 700$b → given name; 710$a → corporate author |
| ONB | `dcAll(rec, 'subject')` → `subjects` via `xmlUtils.dcAll` (was inline regex) |

**No changes made to:** Thaqalayn (domain-specific, no standard subject vocabulary), BDPI/Gallica/OpenContext (server-side routes — metadata depends on `api/search/` implementations audited separately), NCBI (MeSH enrichment is Sprint E1 backlog — requires separate `efetch` call), PANGAEA (keyword/parameter fields require `_source` expansion — Sprint E backlog), OpenNeuro (modalities already in abstract; species available but marginal), ENA (study_type and scientific_name available — Sprint E backlog).

---

### New files (v.18)

| Path | Description |
|---|---|
| `src/adapters/_shared/xmlUtils.js` | Shared XML parsing utilities (DC, SRU, OAI-PMH, UNIMARC) |
| `src/adapters/extensions/chroniclingAmerica.js` | Chronicling America adapter |
| `src/adapters/extensions/onb.js` | ONB / ANNO adapter |
| `src/adapters/extensions/bdh.js` | BDH / BNE adapter |
| `src/adapters/extensions/bnfApi.js` | BnF Catalogue SRU adapter |
| `src/adapters/extensions/britishLibrary.js` | British Library SPARQL adapter |
| `src/adapters/extensions/delpher.js` | KB / Delpher adapter |
| `src/adapters/extensions/lcDatasets.js` | Library of Congress adapter |
| `src/adapters/extensions/mexicana.js` | Mexicana adapter |
| `src/adapters/extensions/nls.js` | NLS Data Foundry adapter |
| `api/search/mexicana.js` | Vercel Edge route — OAI-PMH XML parse + keyword filter |
| `api/search/bl.js` | Vercel Edge route — British Library SPARQL proxy |

### Modified files (v.18)

| Path | Change |
|---|---|
| `src/adapters/extensions/index.js` | Replaced monolithic 1,037-line file with 40-line re-export barrel |
| `src/adapters/_shared/normalize.js` | TYPE_MAP expanded with 20 heritage/newspaper types |
| `src/adapters/extensions/europeana.js` | subjects, type, language |
| `src/adapters/extensions/met.js` | subjects, type |
| `src/adapters/extensions/smithsonian.js` | subjects, type, language |
| `src/adapters/extensions/dpla.js` | subjects, type, language |
| `src/adapters/extensions/rijksmuseum.js` | type, subjects |
| `src/adapters/extensions/internetArchive.js` | subjects, type, language + field list |
| `src/adapters/extensions/chroniclingAmerica.js` | type passthrough |
| `src/adapters/extensions/delpher.js` | subjects, type, journal field |
| `src/adapters/extensions/nls.js` | subjects, type, journal/series field |
| `api/proxy.js` | ALLOWED_DOMAINS expanded with 8 new heritage library domains |
| `src/constants/app.js` | APP_VERSION = "v.18" |

---

### Sprint E backlog (carried forward)

| Item | Adapter | What's needed |
|---|---|---|
| E1 — NCBI MeSH | `ncbi.js` | Separate `efetch` call after `esummary` to fetch MeSH headings for returned PMIDs |
| E2 — PANGAEA keywords | `pangaea.js` | Add `"keyword"`, `"parameter"` to `_source` array in Elasticsearch body; map to `keywords`/`subjects` |
| E3 — ENA study type + taxonomy | `ena.js` | Add `tax_id`, `scientific_name`, `study_type` to fields param; map to `subjects` and `type` |
| E4 — OpenNeuro species | `openNeuro.js` | Add `species` to GraphQL query; map to `subjects` |
| E5 — Gallica server-side | `api/search/gallica.js` | `dc:type` → `type`, `dc:subject` → `subjects`, `dc:language` → `language` |


---

## File structure (v0.18)

```
opencite/
├── api/
│   ├── _shared/
│   │   ├── prisma.js
│   │   └── auth.js
│   ├── proxy.js                              ← [MODIFIED v0.18] +8 heritage library domains
│   ├── history.js
│   ├── library.js
│   ├── settings.js
│   ├── search/
│   │   ├── bdpi.js
│   │   ├── gallica.js
│   │   ├── opencontext.js
│   │   ├── mexicana.js                       ← [NEW v0.18] OAI-PMH edge route
│   │   └── bl.js                             ← [NEW v0.18] British Library SPARQL edge route
│   └── auth/
│       └── handler.js
│
├── prisma/
│   └── schema.prisma
│
├── vercel.json
│
├── src/
│   ├── App.jsx
│   ├── adapters/
│   │   ├── _shared/
│   │   │   ├── base.js
│   │   │   ├── normalize.js                  ← [MODIFIED v0.18] TYPE_MAP +20 heritage types
│   │   │   ├── parseOpenAlex.js
│   │   │   ├── proxy.js
│   │   │   └── xmlUtils.js                   ← [NEW v0.18] shared DC/SRU/OAI-PMH/UNIMARC helpers
│   │   ├── core/
│   │   │   ├── doaj.js
│   │   │   ├── openalex.js
│   │   │   ├── crossref.js
│   │   │   └── curatedJournals.js
│   │   ├── extensions/
│   │   │   ├── index.js                      ← [MODIFIED v0.18] pure re-export barrel (was 1,037 lines)
│   │   │   ├── semanticScholar.js
│   │   │   ├── europeana.js                  ← [MODIFIED v0.18] +subjects, +type, +language
│   │   │   ├── met.js                        ← [MODIFIED v0.18] +subjects, +type
│   │   │   ├── smithsonian.js                ← [MODIFIED v0.18] +subjects, +type, +language
│   │   │   ├── dpla.js                       ← [MODIFIED v0.18] +subjects, +type, +language
│   │   │   ├── rijksmuseum.js                ← [MODIFIED v0.18] +type, +subjects
│   │   │   ├── internetArchive.js            ← [MODIFIED v0.18] +subjects, +type, +language
│   │   │   ├── bdpi.js
│   │   │   ├── gallica.js
│   │   │   ├── thaqalayn.js
│   │   │   ├── ncbi.js
│   │   │   ├── openContext.js
│   │   │   ├── northwestern.js
│   │   │   ├── princetonDpul.js
│   │   │   ├── pangaea.js
│   │   │   ├── openNeuro.js
│   │   │   ├── ena.js
│   │   │   ├── chroniclingAmerica.js         ← [NEW v0.18] +type passthrough
│   │   │   ├── onb.js                        ← [NEW v0.18]
│   │   │   ├── bdh.js                        ← [NEW v0.18]
│   │   │   ├── bnfApi.js                     ← [NEW v0.18] UNIMARC subject headings
│   │   │   ├── britishLibrary.js             ← [NEW v0.18]
│   │   │   ├── delpher.js                    ← [NEW v0.18] +subjects, +type
│   │   │   ├── lcDatasets.js                 ← [NEW v0.18]
│   │   │   ├── mexicana.js                   ← [NEW v0.18]
│   │   │   └── nls.js                        ← [NEW v0.18] +subjects, +type
│   │   └── index.js                          ← [MODIFIED v0.18] +9 SOW adapters registered
│   ├── components/
│   │   ├── EagleTooltip.jsx
│   │   ├── Layout.jsx
│   │   ├── LauncherBlock.jsx
│   │   ├── Panels.jsx
│   │   ├── ResultCard.jsx
│   │   ├── SearchInput.jsx
│   │   └── SourceSection.jsx
│   ├── constants/
│   │   ├── app.js                            ← [MODIFIED v0.18] APP_VERSION = "v.18"
│   │   ├── defaults.js
│   │   ├── themes.js
│   │   └── vocabulary.js
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── BillingContext.jsx
│   │   └── SettingsContext.jsx
│   ├── hooks/
│   │   ├── useEagleTooltip.js
│   │   ├── useHistory.js
│   │   ├── useLibrary.js
│   │   ├── useSearch.js
│   │   ├── useSettings.js
│   │   └── useTheme.js
│   ├── launchers/
│   │   ├── _factory.js
│   │   └── index.js
│   ├── lib/
│   │   ├── auth-client.js
│   │   ├── citations.js
│   │   ├── helpers.js
│   │   ├── history.js
│   │   ├── library.js
│   │   └── storage.js
│   ├── input.css
│   └── main.jsx
```

---

## UnifiedResult schema (v0.18 — unchanged from v0.17)

```js
// Required
title:      string
id:         string
source:     string

// Standard metadata
authors:    string[]
year:       string
journal:    string
publisher:  string
volume:     string
issue:      string
pages:      string
doi:        string
url:        string
abstract:   string
isOA:       boolean
type:       string

// Optional enrichment
editors:    string[]
keywords:   string[]
subjects:   string[]
language:   string
citedBy:    number|null
previewImage: string
```

---

## Adding a new adapter — checklist (v0.18)

1. Create `src/adapters/extensions/<name>.js`
2. Map upstream `type` — do NOT hardcode. Add new type strings to `normalize.js` TYPE_MAP if needed.
3. Map enrichment: `subjects`, `language`, `keywords`, `citedBy`, `editors` where available
4. If XML source: import `dcOne`, `dcAll`, `sruRecords` etc. from `../_shared/xmlUtils.js`
5. Add one export line to `src/adapters/extensions/index.js`
6. Register in `src/adapters/index.js` ADAPTERS array
7. If CORS-blocked: add domain to `api/proxy.js` ALLOWED_DOMAINS + use `proxiedFetch()`
8. If server-side needed: create `api/search/<name>.js` edge route

