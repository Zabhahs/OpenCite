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
export { BDPI_ADAPTER }             from "./bdpi.js";
export { GALLICA_ADAPTER }          from "./gallica.js";
export { THAQALAYN_ADAPTER }        from "./thaqalayn.js";
export { NCBI_ADAPTER }             from "./ncbi.js";
export { OPENCONTEXT_ADAPTER }      from "./openContext.js";
export { NORTHWESTERN_ADAPTER }     from "./northwestern.js";
export { PRINCETON_DPUL_ADAPTER }   from "./princetonDpul.js";
export { PANGAEA_ADAPTER }          from "./pangaea.js";
export { OPENNEURO_ADAPTER }        from "./openNeuro.js";
export { ENA_ADAPTER }              from "./ena.js";

// v.18 SOW heritage adapters
export { CHRONICLING_AMERICA_ADAPTER } from "./chroniclingAmerica.js";
export { ONB_ADAPTER }              from "./onb.js";
export { BDH_ADAPTER }              from "./bdh.js";
export { BNF_API_ADAPTER }          from "./bnfApi.js";
export { BRITISH_LIBRARY_ADAPTER }  from "./britishLibrary.js";
export { DELPHER_ADAPTER }          from "./delpher.js";
export { LC_DATASETS_ADAPTER }      from "./lcDatasets.js";
export { MEXICANA_ADAPTER }         from "./mexicana.js";
export { NLS_ADAPTER }              from "./nls.js";
