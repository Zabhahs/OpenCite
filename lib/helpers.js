export const reconstructAbstract = (invertedIndex) => {
  if (!invertedIndex || typeof invertedIndex !== "object") return "";
  const positions = [];
  for (const [word, posList] of Object.entries(invertedIndex)) {
    if (Array.isArray(posList)) {
      for (const pos of posList) positions.push([pos, word]);
    }
  }
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(p => p[1]).join(" ");
};

export const truncate = (s, n) =>
  s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s || "";

export const stripHtml = (s) =>
  (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
