---
machine_ids: [adapters.index, adapters.core.crossref, adapters.core.doaj, adapters.core.openalex, adapters.core.curatedJournals, adapters.extensions.internetArchive, adapters.extensions.europeana, adapters.extensions.dpla, adapters.extensions.smithsonian, adapters.extensions.met, adapters.extensions.rijksmuseum, adapters.extensions.gallica, adapters.extensions.thaqalayn, adapters.extensions.ncbi, adapters.extensions.openContext, adapters.extensions.northwestern, adapters.extensions.princetonDpul, adapters.extensions.pangaea, adapters.extensions.openNeuro, adapters.extensions.ena, adapters.extensions.scielo, adapters.extensions.laReferencia, adapters.extensions.oapen, adapters.extensions.openEdition, adapters.extensions.openLibrary, adapters.extensions.coreAc, adapters.extensions.ndli, adapters.extensions.base, adapters.extensions.chroniclingAmerica, adapters.extensions.onb, adapters.extensions.bdh, adapters.extensions.bnfApi, adapters.extensions.britishLibrary, adapters.extensions.lcDatasets, adapters.extensions.mexicana, adapters.extensions.wikidata, adapters.extensions.semanticScholar]
findings: [F-104, F-105, F-106, F-107, F-108, F-109, F-110, F-111, F-112, F-113, F-114, F-115, F-116]
runtime: both
status: mixed
tags: [adapter, health, matrix]
---
<!-- AUTO-GENERATED from docs/wiki/02-Adapters/Adapter-Health-Matrix.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# Adapter Health Matrix

> At-a-glance status for all 34 registered adapters + 1 deregistered. Source of truth: source code, not README.
>
> **For capability/metadata-richness TIER ranking** (what each upstream API *can* do, scored S–D from
> live probing) see [Adapter-Capability-Tiers](Adapter-Capability-Tiers.md) and the per-API dossiers in
> `capability-dossiers/`. This page = current health; that page = true capability envelope.

**Legend:** 🟢 healthy · 🟡 degraded/thin · 🔴 dead · 🔑 keyed (drops when key absent) · 🚫 deregistered

---

## Master table

| Adapter | id | Runtime | Key? | Proxy? | Status | Findings | Note |
|---|---|---|---|---|---|---|---|
| **CORE ADAPTERS** | | | | | | | |
| Crossref | `CROSSREF` | both | polite-pool only | no | 🟢 | — | nativeScore (Solr `score`) + nativeRank; hasContentMatch post-filter |
| DOAJ | `DOAJ` | both | no | no | 🟢 | — | nativeRank only; isOA hardcoded true |
| OpenAlex | `OPENALEX` | both | optional | no | 🟢 | — | nativeScore + nativeRank; is_oa:true filter |
| Curated Journals | `CURATED` | both | optional | no | 🟢 | [F-103] | per_page hardcoded 5; wraps OpenAlex |
| **EXTENSION — CULTURAL/HERITAGE** | | | | | | | |
| Internet Archive | `IA` | both | no | no | 🟢 | [F-104] | citedBy = downloads (display only, not ranked); v.35 popularity-sort bug fixed |
| Europeana | `EUROPEANA` | both | backend-injected | no | 🔑 | — | browser→backend route; server→direct; v.34 migration |
| DPLA | `DPLA` | both | backend-injected | proxiedFetch (server) | 🔑 | — | browser→backend route |
| Smithsonian | `SMITHSONIAN` | both | backend-injected | no (direct) | 🔑 | — | browser→backend route; type hardcoded primary-source |
| The Met | `MET` | both | no | no | 🟢 | [F-113] | two-step; up to 3× pageSize fan-out; no nativeRank |
| Rijksmuseum | `RIJKS` | both | no | proxiedFetch | 🟢 | [F-115] | three-step; 2-hop image resolve; slowest adapter |
| BnF Gallica | `GALLICA` | client→backend | no | backend route | 🟡 | — | thin shim; missing serverSafe + corpusSize |
| ONB / ANNO | `ONB` | both | no | try-direct-then-proxy | 🟢 | — | SRU/DC; xmlUtils; isOA hardcoded false |
| BDH / BNE | `BDH` | client→backend | no | backend route | 🟡 | — | thin shim; missing serverSafe + corpusSize |
| BnF Catalogue | `BNF_API` | both | no | try-direct-then-proxy | 🟢 | [F-114] | SRU/UNIMARC; isOA hardcoded TRUE (wrong) |
| British Library | `BL` | client→backend | no | backend route | 🟡 | — | thin shim; SPARQL; no totalCount |
| Chronicling America | `CHRONICLING_AMERICA` | both | no | proxiedFetch | 🟢 | — | v.22A loc.gov update; full-text OCR |
| Library of Congress | `LC_DATASETS` | both | no | no (direct) | 🟢 | — | fo=json; previewImage |
| Mexicana | `MEXICANA` | client→backend | no | backend route | 🟡 | [F-106] | OAI-PMH; thin shim; nextToken non-standard |
| **EXTENSION — SCIENCE/DATA** | | | | | | | |
| NCBI Entrez | `NCBI` | both | no | no | 🟢 | — | 3-step esearch+esummary+efetch; MeSH keywords |
| SciELO | `SCIELO` | both | no | proxiedFetch | 🔴 | [F-110] | DEAD — private ES endpoint; 403/CORS always |
| ENA | `ENA` | both | no | no | 🔴 | [F-109] | DEAD — wildcard syntax triggers 400 |
| OpenNeuro | `OPENNEURO` | both | no | try-direct-then-proxy | 🔴 | [F-107] | DEAD — fetches 100 datasets, client-filter |
| PANGAEA | `PANGAEA` | both | no | proxiedFetch | 🟢 | [F-116] | 2-step ES + per-hit RIS; pageSize fan-out |
| Open Context | `OPENCONTEXT` | client→backend | no | backend route | 🟡 | — | thin shim; missing serverSafe + corpusSize |
| **EXTENSION — HUMANITIES/LATIN AMERICA** | | | | | | | |
| LA Referencia | `LA_REFERENCIA` | both | no | proxiedFetch | 🟢 | — | VuFind; no abstract |
| OAPEN | `OAPEN` | both | no | proxiedFetch | 🟢 | — | DSpace; no totalCount (page-full heuristic) |
| OpenEdition | `OPENEDITION` | client→backend | no | backend route | 🟡 | — | thin shim; JSON POST; missing serverSafe |
| Open Library | `OPEN_LIBRARY` | both | no | proxiedFetch | 🟢 | [F-111] | no abstract; subject-driven only |
| **EXTENSION — SOUTH ASIA** | | | | | | | |
| CORE | `CORE` | client-only | user key (free) | proxiedFetch | 🔑 | — | TOS D7: excluded from /api/search; client-only |
| NDLI | `NDLI` | client-only | user key (free) | proxiedFetch | 🔑 | — | TOS D8: individual credentials; client-only |
| BASE | `BASE` | both | no | proxiedFetch | 🟢 | [F-112] | missing serverSafe + corpusSize in capability |
| **EXTENSION — ISLAMICATE/HERITAGE** | | | | | | | |
| Thaqalayn | `THAQALAYN` | both | no | no | 🟢 | [F-108] | full-result-set download; url always homepage |
| Northwestern | `NORTHWESTERN` | both | no | try-direct-then-proxy | 🟢 | [F-102] | Hausa/Ajami MSS; CORS noise (try-direct pattern) |
| Princeton DPUL | `PRINCETON_DPUL` | both | no | proxiedFetch | 🟢 | — | Blacklight; no subjects mapped |
| Wikidata | `WIKIDATA` | both | no | no | 🟢 | — | 3-step CirrusSearch+entities+labels |
| **DEREGISTERED** | | | | | | | |
| Semantic Scholar | `S2` | — | user key (approval-gated) | no | 🚫 | [F-105] | v.27; file kept; protocol field wrong (REST not GraphQL) |

---

## Dead adapter impact

SCIELO, OPENNEURO, and ENA are registered in the `ADAPTERS` array (`src/adapters/index.js:69,87,88`). They are `serverSafe: true`, so the `/api/search` fan-out includes them. Every search attempt to these adapters fails → they consistently return 0 results → the coverage engine reports them as "not found" → every query degrades to `partial` coverage → billing discount applied inappropriately.

**Blast radius:** Every search on the production system is artificially discounted because 3 of ~34 adapters always fail. Fix: remove SCIELO, OPENNEURO, ENA from the `ADAPTERS` array (keeping the files). See [Bugs](../09-Audit/Bugs.md#f-109) [Bugs](../09-Audit/Bugs.md#f-110) [Bugs](../09-Audit/Bugs.md#f-107).

---

## Key/auth summary

| Key type | Adapters |
|---|---|
| Backend-injected (env var, v.34) | EUROPEANA, DPLA, SMITHSONIAN |
| User-provided in settings (client-only TOS) | CORE, NDLI |
| User-provided in settings (deregistered) | S2 |
| Optional polite-pool email | CROSSREF, OPENALEX, CURATED |
| No key required | all others |

---

## serverSafe gaps

These adapters are missing `capability.serverSafe` (default = false) but appear to be safe for server-side use:

| Adapter | Reason serverSafe absent |
|---|---|
| `BASE` | Oversight; proxiedFetch works server-side |
| `GALLICA` | Thin shim → backend route; safe by routing |
| `OPENCONTEXT` | Thin shim → backend route |
| `BDH` | Thin shim → backend route |
| `OPENEDITION` | Thin shim → backend route |
| `BRITISHLIBRARY` | Thin shim → backend route |
| `MEXICANA` | Thin shim → backend route |
| `CORE` | Intentionally absent (TOS D7) |
| `NDLI` | Intentionally absent (TOS D8) |

---

## Audit findings index (F-104 to F-116)

| ID | Adapter | Type | Severity | Title |
|---|---|---|---|---|
| F-104 | IA | bug | med | citedBy populated from download count |
| F-105 | S2 | debt | low | Deregistered adapter protocol field wrong (REST not GraphQL) |
| F-106 | MEXICANA | bug | low | nextToken non-standard (not generic nextPageToken) |
| F-107 | OPENNEURO | deadcode | high | Dead: fetches only 100 datasets, client-side filter fails most queries |
| F-108 | THAQALAYN | ux | low | url always homepage (thaqalayn.net/), no deep link |
| F-109 | ENA | deadcode | high | Dead: wildcard syntax triggers 400 on most queries |
| F-110 | SCIELO | deadcode | high | Dead: private Elasticsearch endpoint (403/CORS) |
| F-111 | OPEN_LIBRARY | perf | low | No abstract emitted; BM25F title+subjects only |
| F-112 | BASE | debt | low | Missing serverSafe + corpusSize in capability |
| F-113 | MET | perf | med | Fan-out up to 3× pageSize concurrent requests per search |
| F-114 | BNF_API | bug | low | isOA hardcoded true (BnF catalogue has non-OA items) |
| F-115 | RIJKS | perf | low | 2-hop image resolve adds sequential fetch waves |
| F-116 | PANGAEA | perf | med | Per-hit RIS fetch: up to pageSize concurrent extra requests |

See [Bugs](../09-Audit/Bugs.md) for full detail on each.

## See also

[Adapter-Architecture](Adapter-Architecture.md) · [Core-Adapters](Core-Adapters.md) · [Extension-Adapters](Extension-Adapters.md) · [Bugs](../09-Audit/Bugs.md) · [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md)
