// ---------- Name helpers ----------

const swapNameLastFirst = (name) => {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length < 2) return name || "";
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return `${last}, ${rest}`;
};

const initializeName = (name) => {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length < 2) return name || "";
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map(p => p[0] ? p[0].toUpperCase() + "." : "").join(" ");
  return `${last}, ${initials}`;
};

const mlaAuthors = (authors) => {
  const names = (authors || []).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return `${swapNameLastFirst(names[0])}.`;
  if (names.length === 2) return `${swapNameLastFirst(names[0])}, and ${names[1]}.`;
  if (names.length === 3) return `${swapNameLastFirst(names[0])}, ${names[1]}, and ${names[2]}.`;
  return `${swapNameLastFirst(names[0])}, et al.`;
};

const apaAuthors = (authors) => {
  const names = (authors || []).filter(Boolean).map(initializeName);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20) return names.slice(0, -1).join(", ") + ", & " + names[names.length - 1];
  return names.slice(0, 19).join(", ") + ", ... " + names[names.length - 1];
};

// ---------- Citation builders ----------
// Returns array of segments: [{ text, italic? }]
// This shape lets the ResultCard render <em> inline without a full HTML parser.

export const buildMLA = (r) => {
  if (r.type === "primary-source") {
    const segs = [];
    if (r.title) segs.push({ text: `"${r.title}." ` });
    if (r.year) segs.push({ text: `${r.year}. ` });
    if (r.publisher) segs.push({ text: r.publisher + ". " });
    if (r.url) segs.push({ text: r.url });
    return segs;
  }
  const segs = [];
  const auth = mlaAuthors(r.authors);
  if (auth) segs.push({ text: auth + " " });
  if (r.title) segs.push({ text: `"${r.title}." ` });
  if (r.journal) segs.push({ text: r.journal, italic: true });
  const tail = [];
  if (r.volume) tail.push(`vol. ${r.volume}`);
  if (r.issue) tail.push(`no. ${r.issue}`);
  if (r.year) tail.push(r.year);
  if (r.pages) tail.push(`pp. ${r.pages}`);
  if (r.url) tail.push(r.url);
  if (tail.length) segs.push({ text: ", " + tail.join(", ") + "." });
  else if (r.journal) segs.push({ text: "." });
  return segs;
};

export const buildAPA = (r) => {
  if (r.type === "primary-source") {
    const segs = [];
    if (r.authors?.length) segs.push({ text: apaAuthors(r.authors) + " " });
    segs.push({ text: `(${r.year || "n.d."}). ` });
    if (r.title) segs.push({ text: r.title, italic: true });
    segs.push({ text: ". " });
    if (r.publisher) segs.push({ text: r.publisher + ". " });
    if (r.url) segs.push({ text: r.url });
    return segs;
  }
  const segs = [];
  const auth = apaAuthors(r.authors);
  if (auth) segs.push({ text: auth + " " });
  segs.push({ text: `(${r.year || "n.d."}). ` });
  if (r.title) segs.push({ text: r.title + ". " });
  if (r.journal) segs.push({ text: r.journal, italic: true });
  if (r.volume) {
    segs.push({ text: ", " });
    segs.push({ text: r.volume, italic: true });
    if (r.issue) segs.push({ text: `(${r.issue})` });
  }
  if (r.pages) segs.push({ text: `, ${r.pages}` });
  segs.push({ text: ". " });
  if (r.url) segs.push({ text: r.url });
  return segs;
};

export const segmentsToPlain = (segs) =>
  segs.map(s => s.text).join("").replace(/\s+/g, " ").trim();
