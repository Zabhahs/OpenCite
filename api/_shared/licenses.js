// OpenCITE — metadata licence SSOT (v0.48 E4, G2: provenance includes the terms)
//
// What a customer may do with the METADATA each source returns. Facts only, transcribed from the
// per-source capability dossiers (docs/wiki/02-Adapters/capability-dossiers/*.md, "TOS/license"
// rows) and docs/wiki/99-Archive/TOS-items.md — never inferred. A source without a documented
// licence is "unknown", stated as such. Per-WORK content licences are a different thing and ride
// on each card's evidence.license (OpenAlex primary_location.license).
//
// Consumed by: api/search.js (`licenses` in the envelope for the sources present), the generated
// docs page (scripts/gen-licensing.mjs → public/docs/licensing.html) and llms.txt.

export const LICENSES = {
  OPENALEX:            { license: "CC0-1.0", note: "Metadata released under CC0 (dossier: openalex.md).", url: "https://openalex.org/" },
  CURATED:             { license: "CC0-1.0", note: "An OpenAlex filter — same CC0 metadata (curated.md).", url: "https://openalex.org/" },
  DOAJ:                { license: "CC0-1.0", note: "Article metadata CC0 by DOAJ policy (doaj.md).", url: "https://doaj.org/terms" },
  CROSSREF:            { license: "open", note: "\"Almost none of the metadata is subject to copyright, and you may use it for any purpose\"; abstracts may carry publisher copyright (crossref.md).", url: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/" },
  NCBI:                { license: "public-domain", note: "U.S. government work, largely public domain (ncbi.md).", url: "https://www.ncbi.nlm.nih.gov/home/about/policies/" },
  EUROPEANA:           { license: "CC0-1.0", note: "Metadata CC0; item content carries per-object edm:rights (TOS-items.md).", url: "https://pro.europeana.eu/page/api-terms-of-use" },
  DPLA:                { license: "CC0-1.0", note: "Metadata CC0; the underlying resource is not (TOS-items.md).", url: "https://pro.dp.la/about-the-hubs/dpla-api-terms-of-use" },
  SMITHSONIAN:         { license: "CC0-1.0", note: "Open Access metadata + designated assets CC0 (TOS-items.md).", url: "https://www.si.edu/openaccess" },
  MET:                 { license: "CC0-1.0", note: "CC0 declared; unrestricted commercial and non-commercial use (MET.md).", url: "https://metmuseum.github.io/" },
  RIJKS:               { license: "CC0-1.0 / CC-BY-4.0", note: "CC0 / CC BY 4.0 policy; attribution requested for CC BY objects (RIJKSMUSEUM.md).", url: "https://data.rijksmuseum.nl/policy" },
  IA:                  { license: "no-copyright-asserted", note: "Internet Archive asserts no copyright over metadata (INTERNET_ARCHIVE.md).", url: "https://archive.org/about/terms.php" },
  OPEN_LIBRARY:        { license: "no-copyright-asserted", note: "IA/Open Library asserts no new copyright over bibliographic metadata (OPEN_LIBRARY.md).", url: "https://openlibrary.org/developers/licensing" },
  OAPEN:               { license: "CC0-1.0", note: "Metadata CC0 1.0; PDFs CC-licensed per book (OAPEN.md).", url: "https://oapen.org" },
  CHRONICLING_AMERICA: { license: "public-domain", note: "US government works / public-domain historical newspapers (CHRONICLING_AMERICA.md).", url: "https://www.loc.gov/legal/" },
  LC_DATASETS:         { license: "public-domain", note: "US government works, public domain (LC_DATASETS.md).", url: "https://www.loc.gov/legal/" },
  BNF_API:             { license: "etalab-2.0", note: "Licence Ouverte de l'État (Etalab open licence, CC-BY-equivalent) (BNF_API.md).", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" },
  WIKIDATA:            { license: "CC0-1.0", note: "Wikidata is CC0 (WIKIDATA.md).", url: "https://www.wikidata.org/wiki/Wikidata:Licensing" },
  NORTHWESTERN:        { license: "item-level", note: "No API licence published; each item carries rights_statement / license (NORTHWESTERN.md).", url: null },
  PRINCETON_DPUL:      { license: "item-level", note: "No API licence published; each item carries edm-rights (PRINCETON_DPUL.md).", url: null },
  ONB:                 { license: "unknown", note: "Terms not confirmed (ONB.md).", url: null },
};

export const UNKNOWN_LICENSE = Object.freeze({ license: "unknown", note: "No documented licence for this source.", url: null });

export function licenseFor(sourceId) {
  return LICENSES[sourceId] || UNKNOWN_LICENSE;
}

// `licenses` block for a response: { [sourceId]: "CC0-1.0" | … } for the sources present.
export function licensesFor(sourceIds = []) {
  const out = {};
  for (const id of new Set(sourceIds)) out[id] = licenseFor(id).license;
  return out;
}
