import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

// Decode the numeric/basic named XML entities PubMed abstracts carry (e.g. Greek µ as
// &#x3bc;). stripHtml only blanks named entities, so abstract text needs a real decode.
const decodeEntities = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// PubMed efetch XML → { [pmid]: abstractText }. Each <PubmedArticle> carries a <PMID> and
// one or more <AbstractText> segments (sometimes Label-tagged BACKGROUND/METHODS/…); we
// concatenate the segments per article. Kept local — PubMed XML is NCBI-specific (the shared
// xmlUtils helpers are DC/SRU/UNIMARC-only by design and must not grow into a general parser).
const parsePubmedAbstracts = (xml) => {
  const map = {};
  const articles = xml.match(/<PubmedArticle[\s>][\s\S]*?<\/PubmedArticle>/g) || [];
  for (const art of articles) {
    const pmid = art.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    if (!pmid || map[pmid]) continue;
    const segs = [...art.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
      .map(m => decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()))
      .filter(Boolean);
    if (segs.length) map[pmid] = segs.join(" ");
  }
  return map;
};

export const NCBI_ADAPTER = {
  id: "NCBI", name: "NCBI Entrez",
  tagline: "Biomedical & life sciences · PubMed via E-utilities",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-cyan-900", text: "text-cyan-50" }, needsKey: false,
  capability: {
    // Three-step: esearch → esummary (metadata) + efetch (abstract XML, fetched in parallel).
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    // Phase D — field-scoped retrieval. PubMed's bare term spans all fields incl. [Author].
    // Tagging each word with [Title/Abstract] keeps author-name matches out of the candidate set;
    // the authorSearch toggle flips the tag to [Author].
    const tag = settings.authorSearch ? "Author" : "Title/Abstract";
    const term = query.trim().split(/\s+/).map(w => `${w}[${tag}]`).join(" AND ");
    const r1 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmode=json&retstart=${offset}&retmax=${pageSize}`);
    if (!r1.ok) throw new Error(`NCBI esearch ${r1.status}`);
    const searchData = await r1.json();
    const ids = searchData.esearchresult?.idlist || [];
    const total = parseInt(searchData.esearchresult?.count || "0", 10);
    if (ids.length === 0) return { results: [], hasMore: false };
    // esummary (metadata) and efetch (abstract XML) run in parallel. esummary is required;
    // efetch is enrichment — if it fails, degrade to empty abstracts rather than erroring.
    const summaryReq = fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`);
    const abstractReq = fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml`)
      .then(r => (r.ok ? r.text() : "")).then(parsePubmedAbstracts).catch(() => ({}));
    const [r2, abstractMap] = await Promise.all([summaryReq, abstractReq]);
    if (!r2.ok) throw new Error(`NCBI esummary ${r2.status}`);
    const summaryData = await r2.json();
    const summaries = summaryData.result || {};
    const results = ids.map(id => {
      const it = summaries[id];
      if (!it) return null;
      const doi = (it.elocationid || "").replace(/^doi:\s*/i, "") || (it.articleids || []).find(a => a.idtype === "doi")?.value || "";
      return {
        id: `ncbi-${id}`, source: "NCBI",
        title: it.title || "Untitled",
        authors: (it.authors || []).map(a => a.name).filter(Boolean),
        year: String(it.pubdate || "").match(/\d{4}/)?.[0] || "",
        journal: it.fulljournalname || it.source || "", publisher: "",
        volume: it.volume || "", issue: it.issue || "", pages: it.pages || "",
        doi, url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        abstract: abstractMap[id] || "", isOA: false, type: "article",
        keywords: (it.meshheadinglist || []).map(m => m.name).filter(Boolean)
      };
    }).filter(Boolean);
    return { results, hasMore: offset + results.length < total };
  }
};
