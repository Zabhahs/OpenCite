// groupByParentWork — clusters book-chapter results under their container title.
// Non-chapter results pass through as single-item groups ({ parentTitle: null }).
// Returns: [{ parentTitle, publisher, editors, year, items: [result, ...] }, ...]
// Stable: preserves original order; chapters of the same book are consecutive.

export function groupByParentWork(results) {
  if (!results?.length) return [];

  const groups = [];
  const bookMap = new Map(); // container-title → group index

  for (const r of results) {
    const isChapter = r._type === "book-chapter" || r.type === "book-chapter"
      || r.type === "book-section" || r.type === "book-part"
      || r.type === "reference-entry";

    if (isChapter && r.journal) {
      const key = r.journal.toLowerCase().trim();
      if (bookMap.has(key)) {
        groups[bookMap.get(key)].items.push(r);
      } else {
        bookMap.set(key, groups.length);
        groups.push({
          parentTitle: r.journal,
          publisher: r.publisher || "",
          editors: r.editors || [],
          year: r.year || "",
          items: [r],
        });
      }
    } else {
      groups.push({ parentTitle: null, items: [r] });
    }
  }

  return groups;
}
