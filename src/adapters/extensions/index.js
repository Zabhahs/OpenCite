/**
 * extensions/index.js — re-export barrel.
 *
 * No adapter logic lives here. Each adapter is in its own file.
 * To add a new adapter: create the file, export the constant, add it here.
 * To remove one: delete the file, remove the export line below, remove from
 * src/adapters/index.js ADAPTERS array.
 *
 * File count threshold: split into subdirectory groups (e.g. heritage/, science/)
 * if this barrel grows past ~30 lines of imports.
 */

// Pre-v.18 extensions
export { EUROPEANA_ADAPTER }        from "./europeana.js";
export { MET_ADAPTER }              from "./met.js";
export { SMITHSONIAN_ADAPTER }      from "./smithsonian.js";
export { DPLA_ADAPTER }             from "./dpla.js";
export { RIJKSMUSEUM_ADAPTER }      from "./rijksmuseum.js";
export { INTERNET_ARCHIVE_ADAPTER } from "./internetArchive.js";
// BDPI_ADAPTER — /gdl/ExternalSearch.do JSONP endpoint removed; new /BDPI/Search.do is JS-only, no JSON API
export { GALLICA_ADAPTER }          from "./gallica.js";
export { THAQALAYN_ADAPTER }        from "./thaqalayn.js";
export { NCBI_ADAPTER }             from "./ncbi.js";
export { OPENCONTEXT_ADAPTER }      from "./openContext.js";
export { NORTHWESTERN_ADAPTER }     from "./northwestern.js";
export { PRINCETON_DPUL_ADAPTER }   from "./princetonDpul.js";
export { PANGAEA_ADAPTER }          from "./pangaea.js";
// OPENNEURO_ADAPTER (openNeuro.js), ENA_ADAPTER (ena.js), SCIELO_ADAPTER (scielo.js) —
// QUARANTINED v0.38: always-dead (0 results every query → false `partial` coverage → billing
// discount). Full source preserved at docs/wiki/99-Archive/_quarantine/. Findings F-107/F-109/F-110/F-208.

// v.29 — humanities worldwide-coverage adapters (verified contracts)
export { LA_REFERENCIA_ADAPTER }       from "./laReferencia.js";
export { OAPEN_ADAPTER }               from "./oapen.js";
export { OPENEDITION_ADAPTER }         from "./openEdition.js";
export { OPEN_LIBRARY_ADAPTER }        from "./openLibrary.js";

// v.29 — South Asia & subcontinent humanities adapters
export { CORE_ADAPTER }  from "./coreAc.js";
export { NDLI_ADAPTER }  from "./ndli.js";
export { BASE_ADAPTER }  from "./base.js";

// PHILPAPERS_ADAPTER — excluded (Wave A premise disproved on live verification):
// no public keyword-search JSON endpoint (only a key-gated taxonomy feed at
// /philpapers/raw/categories.json?apiId=&apiKey=); the bibliographic search API is
// contact-gated + ToS-restricted ("severely restrict redistribution"); the only open
// self-serve interface is OAI-PMH (oai.pl) — harvest-only, the Mexicana anti-pattern.
// Philosophy-coverage gap remains open; revisit via an OA-licensed alternative.

// v.18 SOW heritage adapters
export { CHRONICLING_AMERICA_ADAPTER } from "./chroniclingAmerica.js";
export { ONB_ADAPTER }              from "./onb.js";
export { BDH_ADAPTER }              from "./bdh.js";
export { BNF_API_ADAPTER }          from "./bnfApi.js";
export { BRITISH_LIBRARY_ADAPTER }  from "./britishLibrary.js";
// DELPHER_ADAPTER — KB API requires legal access credentials; endpoint https://www.delpher.nl/nl/platform/api/search returns 404
// NLS_ADAPTER — NLS Data Foundry has no public search API; https://data.nls.uk/api/search/ returns 404
export { LC_DATASETS_ADAPTER }      from "./lcDatasets.js";
export { MEXICANA_ADAPTER }         from "./mexicana.js";
export { WIKIDATA_ADAPTER }         from "./wikidata.js";
