import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const OPENNEURO_ADAPTER = {
  id: "OPENNEURO", name: "OpenNeuro",
  tagline: "BIDS neuroimaging datasets · client-side filtered text match",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["research-repository"],
  contentType: ["structured-data", "primary-source"],
  color: { bg: "bg-violet-900", text: "text-violet-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const gqlQuery = `query PublicDatasets { datasets(first: 100, orderBy: { created: descending }) { edges { node { id created latestSnapshot { tag description { Name Authors DatasetDOI Acknowledgements } summary { modalities tasks species } } } } } }`;
    const onUrl = "https://openneuro.org/crn/graphql";
    let r;
    try {
      r = await fetch(onUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: gqlQuery }) });
    } catch {
      r = await proxiedFetch(onUrl, { method: "POST", body: JSON.stringify({ query: gqlQuery }) }, { adapterId: "OPENNEURO" });
    }
    if (!r.ok) throw new Error(`OpenNeuro ${r.status}`);
    const data = await r.json();
    if (data.errors) throw new Error(`OpenNeuro GraphQL: ${data.errors[0]?.message || "unknown error"}`);
    const allDatasets = (data.data?.datasets?.edges || []).map(e => e.node);
    const q = query.toLowerCase();
    const matched = allDatasets.filter(ds => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      return [desc.Name || "", (desc.Authors || []).join(" "), desc.Acknowledgements || "", (summary.tasks || []).join(" "), (summary.modalities || []).join(" ")].join(" ").toLowerCase().includes(q);
    });
    const slice = matched.slice(offset, offset + pageSize);
    const results = slice.map((ds, i) => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      return {
        id: `on-${ds.id}-${i}`, source: "OPENNEURO",
        title: desc.Name || ds.id, authors: desc.Authors || [],
        year: String(ds.created || "").match(/\d{4}/)?.[0] || "",
        journal: (summary.modalities || []).join(", "), publisher: "OpenNeuro",
        keywords: (summary.species || []),
        volume: "", issue: "", pages: "", doi: desc.DatasetDOI || "",
        url: `https://openneuro.org/datasets/${ds.id}`,
        abstract: desc.Acknowledgements || `Tasks: ${(summary.tasks || []).join(", ")}`,
        isOA: true, type: "structured-data"
      };
    });
    return { results, hasMore: offset + slice.length < matched.length };
  }
};
