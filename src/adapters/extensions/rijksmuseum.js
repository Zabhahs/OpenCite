import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

// ── Rijksmuseum Linked-Art API (keyless) ──────────────────────────────────────
//
// Docs: https://data.rijksmuseum.nl/docs/search        (Search API)
//       https://data.rijksmuseum.nl/docs/http          (Linked-Data Resolver)
//
// Two-step pattern (mirrors MET):
//   Step 1 — Search: GET https://data.rijksmuseum.nl/search/collection
//             Returns OrderedCollectionPage { orderedItems: [{ id, type }], partOf.totalItems, next }
//             Page size is FIXED at 100 by the API; pageToken drives pagination.
//             No free-text "q" param — uses field-specific partial-match params:
//             title=, description=, creator=, type=, material=, imageAvailable=.
//             Strategy: fan the query across BOTH title= and creator= in parallel so that
//             artist-name queries (e.g. "Rembrandt") return results from either field.
//             The title= stream is PRIMARY: its next.id drives pagination on load-more.
//             The creator= stream contributes page-1 candidates only (no token forwarding).
//             OpenCITE deduplicates by id and caps to pageSize before the resolve fan-out.
//
//   Step 2 — Resolve: GET https://data.rijksmuseum.nl/<integer>
//             id.rijksmuseum.nl/<N> 303-redirects to data.rijksmuseum.nl/<N>.
//             We dereference data.rijksmuseum.nl directly to avoid the redirect round-trip.
//             Returns Linked-Art JSON-LD (HumanMadeObject).
//
// Field-mapping (Linked-Art → UnifiedResult):
//   id            → identified_by[type=Identifier, classified_as≈AAT300312355].content  (object number)
//   title         → identified_by[type=Name, language≈AAT300388277=English or first].content
//   authors       → produced_by.carried_out_by[0].notation[@language=en].@value
//                   OR produced_by.part[0].carried_out_by[0].notation[@language=en].@value
//   year          → produced_by.timespan.identified_by[language≈AAT300388277].content  (prefer English)
//   url           → subject_of[].digitally_carried_by[0].access_point[0].id (text/html entry)
//   subjects      → classified_as[] labels (best-effort; Linked-Art uses opaque Getty/vocab URIs
//                   for top-level classes — plain-text labels not reliably present at top level)
//   previewImage  → "" — see INVESTIGATED below.
//
// ── previewImage: WIRED — 2-hop concurrent resolve, fail-soft (2026-05-31) ────
//   The image chain requires 2 extra sequential hops after the object resolve:
//     Hop 1: HumanMadeObject.shows[0].id  → VisualItem   (stub: only id/type)
//     Hop 2: VisualItem.digitally_shown_by[0].id → DigitalObject (stub: only id/type)
//     Hop 3 (inline): DigitalObject.access_point[0].id → IIIF image URL (read, no fetch)
//   Confirmed example chain:
//     HumanMadeObject 200107928 → VisualItem 202107928
//     → DigitalObject 500711199912110510799100
//     → https://iiif.micr.io/PJEZO/full/max/0/default.jpg
//   Concurrency: all items' image resolves run inside the SAME Promise.all as the object
//   resolves. Worst-case depth = 3 sequential fetch waves (object-resolve + 2 image hops)
//   regardless of pageSize, because items run concurrently, not serially.
//   Fail-soft: any missing field or fetch error returns "" for that item only; never throws.
//
// Deviation from sprint-log assumption:
//   • The sprint log assumed a free-text q= param. The live API has NO q= param.
//     We use title= (primary) and creator= (parallel) as described above.
//   • Page size is fixed at 100 by the API (not configurable). We slice the returned
//     orderedItems to INITIAL/LOAD_MORE_PAGE_SIZE before resolving to bound the fan-out.
//   • Pagination uses an opaque pageToken, not offset/page numbers. We store the
//     nextPageToken for page 2+ in opts.pageToken; offset 0 always fetches page 1.
//     The generic nextPageToken field is consumed by useSearch.js's pageToken state.

const SEARCH_BASE = "https://data.rijksmuseum.nl/search/collection";
const RESOLVE_BASE = "https://data.rijksmuseum.nl/";

// Derive the integer path segment from an id.rijksmuseum.nl URI, so we can call
// data.rijksmuseum.nl/<N> directly without needing a redirect.
function resolvePathFromId(uri) {
  // uri = "https://id.rijksmuseum.nl/200107928"
  const m = uri.match(/\/(\d+)$/);
  return m ? m[1] : null;
}

// Extract a plain-text value from identified_by[type=Name], preferring English.
function extractTitle(identified_by) {
  if (!Array.isArray(identified_by)) return "";
  const names = identified_by.filter(x => x.type === "Name");
  if (!names.length) return "";
  // Prefer an English-language name if there are multiple
  const en = names.find(n =>
    Array.isArray(n.language) && n.language.some(l => l.id && l.id.includes("aat/300388277"))
    // AAT 300388277 = English language; fall through to first if absent
  );
  return (en || names[0]).content || "";
}

// Extract object number from identified_by[type=Identifier].
// The object-number identifier is classified_as Getty AAT 300312355.
function extractObjectNumber(identified_by) {
  if (!Array.isArray(identified_by)) return "";
  const ident = identified_by.find(x =>
    x.type === "Identifier" &&
    Array.isArray(x.classified_as) &&
    x.classified_as.some(c => c.id && c.id.includes("300312355"))
  );
  return ident?.content || "";
}

// Extract creator name from produced_by.carried_out_by[] or produced_by.part[].carried_out_by[].
// notation is an array of { @language, @value } objects.
function extractCreator(produced_by) {
  if (!produced_by) return [];
  // Helper: extract name from an actor's notation array
  function nameFromActor(actor) {
    const notations = actor.notation || [];
    const en = notations.find(n => n["@language"] === "en");
    return (en || notations[0])?.["@value"] || null;
  }
  // Some objects have carried_out_by directly on produced_by (no part nesting)
  for (const actor of produced_by.carried_out_by || []) {
    const name = nameFromActor(actor);
    if (name) return [name];
  }
  // Most objects nest it under produced_by.part[].carried_out_by[]
  for (const part of produced_by.part || []) {
    for (const actor of part.carried_out_by || []) {
      const name = nameFromActor(actor);
      if (name) return [name];
    }
  }
  return [];
}

// Extract human-readable date string from produced_by.timespan.
function extractYear(produced_by) {
  if (!produced_by?.timespan) return "";
  const ts = produced_by.timespan;
  // Prefer the English-language human-readable name; fall back to first name, then machine date.
  const names = Array.isArray(ts.identified_by) ? ts.identified_by : [];
  const en = names.find(n =>
    Array.isArray(n.language) && n.language.some(l => l.id && l.id.includes("aat/300388277"))
  );
  const named = (en || names[0])?.content;
  if (named) return named;
  const begin = ts.begin_of_the_begin;
  if (begin) return begin.slice(0, 4); // "1642-01-01T..." → "1642"
  return "";
}

// Walk shows → VisualItem → DigitalObject → access_point[0].id to get an image URL.
// Each stub URI requires its own dereference (Accept: application/ld+json).
// Returns the image URL string, or "" on any failure or missing link.
async function resolveImage(obj) {
  try {
    // Hop 1: HumanMadeObject.shows[0].id → VisualItem
    const showsId = obj.shows?.[0]?.id;
    if (!showsId) return "";

    const viRes = await proxiedFetch(
      showsId,
      { headers: { Accept: "application/ld+json" } },
      { adapterId: "RIJKS" }
    );
    if (!viRes.ok) return "";
    const viData = await viRes.json();

    // Hop 2: VisualItem.digitally_shown_by[0].id → DigitalObject
    const doId = viData.digitally_shown_by?.[0]?.id;
    if (!doId) return "";

    const doRes = await proxiedFetch(
      doId,
      { headers: { Accept: "application/ld+json" } },
      { adapterId: "RIJKS" }
    );
    if (!doRes.ok) return "";
    const doData = await doRes.json();

    // Hop 3 (inline read): DigitalObject.access_point[0].id → final image URL
    return doData.access_point?.[0]?.id || "";
  } catch {
    return "";
  }
}

// Extract the rijksmuseum.nl collection web URL from subject_of.
// Look for a LinguisticObject whose digitally_carried_by has format text/html.
function extractWebUrl(subject_of, objectNumber) {
  if (Array.isArray(subject_of)) {
    for (const s of subject_of) {
      const carriers = s.digitally_carried_by || [];
      for (const c of carriers) {
        if (c.format === "text/html") {
          const ap = c.access_point?.[0]?.id;
          if (ap) return ap;
        }
      }
    }
  }
  // Fallback: construct a clean English collection URL from the object number
  if (objectNumber) return `https://www.rijksmuseum.nl/en/collection/${objectNumber.toLowerCase()}`;
  return "";
}

export const RIJKSMUSEUM_ADAPTER = {
  id: "RIJKS", name: "Rijksmuseum",
  tagline: "Dutch Golden Age · 700,000+ objects",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"], archiveType: ["museum"], contentType: ["visual", "primary-source"],
  color: { bg: "bg-orange-900", text: "text-orange-50" },
  needsKey: false,
  capability: {
    // Keyless Linked-Art Search API; two-step: search → per-object resolve.
    // Fixed 100-result pages, opaque token pagination, no free-text q param.
    protocol: "linked-art", fulltext: false, pagination: "token", totalCount: true,
    maxWindow: null, auth: "none",
    // abstract/subjects are sparse in Linked-Art top-level objects (Getty AAT URIs without
    // inline labels); the title field is the primary rank signal.
    rankFields: { abstract: "sparse", subjects: "sparse", citedBy: false },
    serverSafe: true,
    corpusSize: 700000, // ~700K objects, data.rijksmuseum.nl
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;

    // ── Step 1: Search — title= (primary) + creator= (parallel) ──────────────
    // We fire both streams concurrently to catch artist-name queries that the title=
    // field would miss (e.g. "Rembrandt" appears in creator=, not title=).
    //
    // Pagination strategy (by design, documented here):
    //   • The title= stream is PRIMARY: its next.id becomes nextPageToken.
    //   • The creator= stream contributes page-1 candidates ONLY. On load-more
    //     (when opts.pageToken is set) we skip the creator= call because:
    //     (a) the pageToken is opaque and title=-stream-specific, and
    //     (b) mixing two independent token chains would produce unpredictable ordering.
    //     This is a deliberate simplification — creator= enriches discovery queries
    //     on the first page, then defers to the title= stream for subsequent pages.
    //
    // imageAvailable=true keeps results to objects with digital reproductions.

    // Build the title-stream URL (primary; drives pagination).
    const titleParams = new URLSearchParams({ title: query, imageAvailable: "true" });
    if (opts.pageToken) titleParams.set("pageToken", opts.pageToken);
    const titleUrl = `${SEARCH_BASE}?${titleParams.toString()}`;

    // Build creator-stream URL (page-1 supplementary; no pageToken forwarding).
    const creatorParams = new URLSearchParams({ creator: query, imageAvailable: "true" });
    const creatorUrl = `${SEARCH_BASE}?${creatorParams.toString()}`;

    // Fire title stream (always). Fire creator stream on page-1 only (no opts.pageToken).
    const [titleRes, creatorRes] = await Promise.all([
      proxiedFetch(titleUrl, {}, { adapterId: "RIJKS" }),
      // Skip creator stream on load-more pages to avoid token-chain confusion.
      opts.pageToken ? Promise.resolve(null) : proxiedFetch(creatorUrl, {}, { adapterId: "RIJKS" }),
    ]);

    if (!titleRes.ok) throw new Error(`Rijksmuseum search ${titleRes.status}`);
    const titleData = await titleRes.json();

    // Parse creator stream (best-effort: errors are suppressed, fall back to title-only).
    let creatorItems = [];
    try {
      if (creatorRes && creatorRes.ok) {
        const creatorData = await creatorRes.json();
        creatorItems = creatorData.orderedItems || [];
      }
    } catch {
      // Creator stream failure is non-fatal; title stream results are sufficient.
    }

    // Merge and deduplicate by item.id; title-stream items win (appear first in Set order).
    const titleItems = titleData.orderedItems || [];
    const seenIds = new Set();
    const mergedItems = [];
    for (const item of [...titleItems, ...creatorItems]) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        mergedItems.push(item);
      }
    }

    const totalItems = titleData.partOf?.totalItems ?? titleItems.length;
    // nextPageToken comes from the title stream's next.id (primary pagination driver).
    const nextPageToken = titleData.next?.id || null;

    // Cap the resolve fan-out to pageSize (offset within the merged list resets to 0
    // on each API page because we always start from page N's beginning via pageToken).
    const slice = mergedItems.slice(0, pageSize);

    // ── Step 2: Resolve each identifier → object metadata + image ────────────
    // id.rijksmuseum.nl/<N> redirects 303 to data.rijksmuseum.nl/<N>.
    // We call data.rijksmuseum.nl directly to skip the redirect.
    // Image resolution (resolveImage) runs INSIDE the same Promise.all so all items'
    // 2-hop image chains execute concurrently with each other (not serially).
    // Worst-case sequential depth per page = 3 waves: object-resolve, then image hop-1,
    // then image hop-2 — constant regardless of pageSize.
    // Individual object failures are filtered out (resilience, not throw).
    const resolved = await Promise.all(slice.map(async item => {
      const pathId = resolvePathFromId(item.id);
      if (!pathId) return null;
      try {
        const rr = await proxiedFetch(
          `${RESOLVE_BASE}${pathId}`,
          { headers: { Accept: "application/ld+json" } },
          { adapterId: "RIJKS" }
        );
        if (!rr.ok) return null;
        const obj = await rr.json();
        // Resolve image concurrently across items; skip if no shows link.
        const previewImage = obj.shows?.length ? await resolveImage(obj) : "";
        return { obj, previewImage };
      } catch {
        return null;
      }
    }));

    // ── Step 3: Normalize → UnifiedResult ─────────────────────────────────────
    const results = resolved
      .filter(Boolean)
      .map(({ obj, previewImage }) => {
        const objectNumber = extractObjectNumber(obj.identified_by);
        const title       = extractTitle(obj.identified_by) || "Untitled";
        const authors     = extractCreator(obj.produced_by);
        const year        = extractYear(obj.produced_by);
        const url         = extractWebUrl(obj.subject_of, objectNumber);
        const stableId    = objectNumber
          ? `rijks-${objectNumber.toLowerCase().replace(/[^a-z0-9]/g, "-")}`
          : `rijks-${(obj.id || "").replace(/.*\//, "")}`;

        // subjects: Linked-Art top-level classified_as entries have opaque Getty/vocab URIs;
        // the human-readable label (if present) lives in classified_as[]._label or
        // classified_as[].identified_by[0].content. Extract what's available, skip URIs.
        const subjects = (Array.isArray(obj.classified_as) ? obj.classified_as : [])
          .flatMap(c => {
            const label = c._label || c.identified_by?.[0]?.content;
            return label ? [label] : [];
          });

        return {
          id: stableId, source: "RIJKS",
          title, authors, year,
          journal: "", publisher: "Rijksmuseum",
          volume: "", issue: "", pages: "", doi: "",
          url,
          abstract: "",    // Linked-Art object records have no free-text abstract field
          isOA: true,
          type: "image",
          subjects,
          previewImage, // 2-hop concurrent resolve via resolveImage(); "" on any failure
        };
      });

    // hasMore: true if the title stream returned a next page token, or if total
    // items in the title stream exceeds what we've resolved so far.
    const hasMore = !!nextPageToken || (offset + slice.length < totalItems);

    // Return the generic nextPageToken field (not adapter-specific _rijksNextToken).
    // useSearch.js stores this in pageState[id].pageToken and threads it back via opts.pageToken.
    return { results, hasMore, nextPageToken };
  }
};
