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

// ---------- Editor formatting helpers ----------

const mlaEditors = (editors) => {
  const names = (editors || []).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return `edited by ${names[0]}`;
  if (names.length === 2) return `edited by ${names[0]} and ${names[1]}`;
  return `edited by ${names[0]} et al.`;
};

const apaEditors = (editors) => {
  const names = (editors || []).filter(Boolean).map(initializeName);
  if (!names.length) return "";
  const joined = names.length <= 20
    ? (names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + ", & " + names[names.length - 1])
    : names.slice(0, 19).join(", ") + ", ... " + names[names.length - 1];
  return `In ${joined} (Ed${names.length > 1 ? "s" : ""}.)`;
};

// ---------- Type detection helper ----------

const isBookChapter = (r) => {
  const t = (r._type || r.type || "").toLowerCase();
  return t === "book-chapter" || t === "book-section" || t === "book-part"
    || t === "inbook" || t === "reference-entry";
};

// ---------- MLA 9 + APA 7 ----------
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

  // v.17 — Book chapter: "Chapter Title." Container Title, ed. by Editors, Publisher, Year, pp. Pages.
  if (isBookChapter(r)) {
    const segs = [];
    const auth = mlaAuthors(r.authors);
    if (auth) segs.push({ text: auth + " " });
    if (r.title) segs.push({ text: `"${r.title}." ` });
    if (r.journal) {
      segs.push({ text: r.journal, italic: true });
      segs.push({ text: ", " });
    }
    const edStr = mlaEditors(r.editors);
    if (edStr) segs.push({ text: edStr + ", " });
    if (r.publisher) segs.push({ text: r.publisher + ", " });
    if (r.year) segs.push({ text: r.year });
    if (r.pages) segs.push({ text: `, pp. ${r.pages}` });
    segs.push({ text: ". " });
    if (r.doi) segs.push({ text: `https://doi.org/${r.doi}` });
    else if (r.url) segs.push({ text: r.url });
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
  if (r.doi) tail.push(`https://doi.org/${r.doi}`);
  else if (r.url) tail.push(r.url);
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
    if (r.doi) segs.push({ text: `https://doi.org/${r.doi}` });
    else if (r.url) segs.push({ text: r.url });
    return segs;
  }

  // v.17 — Book chapter: Author (Year). Chapter title. In Editor (Ed.), Book Title (pp. Pages). Publisher. DOI
  if (isBookChapter(r)) {
    const segs = [];
    const auth = apaAuthors(r.authors);
    if (auth) segs.push({ text: auth + " " });
    segs.push({ text: `(${r.year || "n.d."}). ` });
    if (r.title) segs.push({ text: r.title + ". " });
    const edStr = apaEditors(r.editors);
    if (edStr) segs.push({ text: edStr + ", " });
    else if (r.journal) segs.push({ text: "In " });
    if (r.journal) {
      segs.push({ text: r.journal, italic: true });
    }
    if (r.pages) segs.push({ text: ` (pp. ${r.pages})` });
    segs.push({ text: ". " });
    if (r.publisher) segs.push({ text: r.publisher + ". " });
    if (r.doi) segs.push({ text: `https://doi.org/${r.doi}` });
    else if (r.url) segs.push({ text: r.url });
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
  if (r.doi) segs.push({ text: `https://doi.org/${r.doi}` });
  else if (r.url) segs.push({ text: r.url });
  return segs;
};

export const segmentsToPlain = (segs) =>
  segs.map(s => s.text).join("").replace(/\s+/g, " ").trim();

// ---------- Export format helpers ----------

/**
 * _cslAuthor(parsed) — converts NCR _authorsParsed entry to CSL author object.
 * Handles literal (single-token / institutional) authors correctly.
 */
const _cslAuthor = (a) =>
  a.literal
    ? { literal: a.literal }
    : { family: a.family, given: a.given };

/**
 * _defined(obj) — strips undefined values from a shallow object.
 * Keeps CSL output clean — no null/undefined keys.
 */
const _defined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ""));

// ---------- CSL-JSON ----------

const CSL_TYPE_MAP = {
  "article":       "article-journal",
  "book":          "book",
  "book-chapter":  "chapter",
  "report":        "report",
  "thesis":        "thesis",
  "dataset":       "dataset",
  "image":         "graphic",
  "primary-source":"document",
  "misc":          "document",
};

/**
 * buildCSL(ncr) → CSL-JSON object (not a string — caller can JSON.stringify).
 */
export const buildCSL = (ncr) => {
  const type = CSL_TYPE_MAP[ncr._type] || "document";
  const authors = (ncr._authorsParsed || []).map(_cslAuthor);
  const editors = (ncr._editorsParsed || []).map(_cslAuthor);
  const year = parseInt(ncr.year, 10);

  return _defined({
    id:                ncr.id || ncr.url || ncr.doi,
    type,
    title:             ncr.title || undefined,
    author:            authors.length ? authors : undefined,
    editor:            editors.length ? editors : undefined,
    issued:            !isNaN(year) ? { "date-parts": [[year]] } : undefined,
    "container-title": ncr.journal  || undefined,
    publisher:         ncr.publisher || undefined,
    volume:            ncr.volume   || undefined,
    issue:             ncr.issue    || undefined,
    page:              ncr.pages    || undefined,
    DOI:               ncr.doi      || undefined,
    URL:               ncr.url      || undefined,
    abstract:          ncr.abstract || undefined,
    source:            ncr.source   || undefined,
    language:          ncr.language || undefined,
    keyword:           ncr.keywords?.length ? ncr.keywords.join(", ") : undefined,
  });
};

// ---------- BibTeX ----------

const BIBTEX_TYPE_MAP = {
  "article":       "article",
  "book":          "book",
  "book-chapter":  "incollection",
  "report":        "techreport",
  "thesis":        "phdthesis",
  "dataset":       "misc",
  "image":         "misc",
  "primary-source":"misc",
  "misc":          "misc",
};

const _bibtexEscape = (s) =>
  String(s || "").replace(/[&%$#_{}~^\\]/g, (c) => `\\${c}`);

const _bibtexKey = (ncr) => {
  const family = (ncr._authorsParsed?.[0]?.family || "anon")
    .replace(/\s+/g, "")
    .replace(/[^\w]/g, "");
  const year = ncr.year || "nd";
  const word = (ncr.title || "")
    .split(/\s+/)
    .find(w => w.length > 3 && !/^(the|a|an|and|of|in|on|for|to)$/i.test(w)) || "";
  return `${family}${year}${word.replace(/\W/g, "")}`.toLowerCase().slice(0, 40);
};

const _bibtexField = (tag, value, width = 12) =>
  value ? `  ${tag.padEnd(width)} = {${_bibtexEscape(value)}}` : null;

/**
 * buildBibTeX(ncr) → BibTeX string.
 */
export const buildBibTeX = (ncr) => {
  const entryType = BIBTEX_TYPE_MAP[ncr._type] || "misc";
  const key = _bibtexKey(ncr);

  const authorStr = (ncr._authorsParsed || [])
    .map(a => a.literal || `${a.family}, ${a.given}`)
    .join(" and ");

  const editorStr = (ncr._editorsParsed || [])
    .map(a => a.literal || `${a.family}, ${a.given}`)
    .join(" and ");

  const isNonArticle = ncr._type === "dataset" || ncr._type === "image";
  const isChapter = ncr._type === "book-chapter";

  const fields = [
    _bibtexField("author",    authorStr),
    _bibtexField("title",     ncr.title),
    // book-chapter: booktitle is the container, not journal
    _bibtexField(isChapter ? "booktitle" : "journal", ncr.journal),
    _bibtexField("editor",    editorStr),
    _bibtexField("year",      ncr.year),
    _bibtexField("volume",    ncr.volume),
    _bibtexField("number",    ncr.issue),
    _bibtexField("pages",     ncr.pages),
    _bibtexField("publisher", ncr.publisher),
    _bibtexField("doi",       ncr.doi),
    _bibtexField("language",  ncr.language),
    _bibtexField("keywords",  ncr.keywords?.length ? ncr.keywords.join(", ") : ""),
    _bibtexField("url",       isNonArticle ? undefined : ncr.url),
    isNonArticle && ncr.url
      ? `  howpublished = {\\url{${_bibtexEscape(ncr.url)}}}`
      : null,
  ].filter(Boolean);

  return `@${entryType}{${key},\n${fields.join(",\n")}\n}`;
};

// ---------- RIS ----------

const RIS_TYPE_MAP = {
  "article":       "JOUR",
  "book":          "BOOK",
  "book-chapter":  "CHAP",
  "report":        "RPRT",
  "thesis":        "THES",
  "dataset":       "DATA",
  "image":         "GEN",
  "primary-source":"GEN",
  "misc":          "GEN",
};

/**
 * buildRIS(ncr) → RIS string.
 */
export const buildRIS = (ncr) => {
  const ty = RIS_TYPE_MAP[ncr._type] || "GEN";
  const lines = [`TY  - ${ty}`];

  (ncr._authorsParsed || []).forEach((a) => {
    lines.push(`AU  - ${a.literal || `${a.family}, ${a.given}`}`);
  });

  // v.17 — editors
  (ncr._editorsParsed || []).forEach((a) => {
    lines.push(`A2  - ${a.literal || `${a.family}, ${a.given}`}`);
  });

  if (ncr.title)     lines.push(`TI  - ${ncr.title}`);

  // RIS: T2 = secondary title (book title for chapters, journal for articles)
  if (ncr.journal)   lines.push(ncr._type === "book-chapter" ? `T2  - ${ncr.journal}` : `JO  - ${ncr.journal}`);

  if (ncr.year)      lines.push(`PY  - ${ncr.year}`);
  if (ncr.volume)    lines.push(`VL  - ${ncr.volume}`);
  if (ncr.issue)     lines.push(`IS  - ${ncr.issue}`);

  if (ncr.pages) {
    const [sp, ep] = String(ncr.pages).split(/[-\u2013]/);
    if (sp?.trim()) lines.push(`SP  - ${sp.trim()}`);
    if (ep?.trim()) lines.push(`EP  - ${ep.trim()}`);
  }

  if (ncr.doi)       lines.push(`DO  - ${ncr.doi}`);
  if (ncr.url)       lines.push(`UR  - ${ncr.url}`);
  if (ncr.abstract)  lines.push(`AB  - ${ncr.abstract}`);
  if (ncr.publisher) lines.push(`PB  - ${ncr.publisher}`);
  if (ncr.language)  lines.push(`LA  - ${ncr.language}`);

  // v.17 — keywords
  (ncr.keywords || []).forEach((kw) => {
    lines.push(`KW  - ${kw}`);
  });

  lines.push("ER  - ");
  return lines.join("\n");
};

// ---------- exportAs dispatcher ----------

/**
 * exportAs(ncr, format) → string
 *
 * Lazy dispatcher — only called on user action (copy/download button).
 * Never called at search time. MLA/APA return plain text (segments collapsed).
 *
 * @param {object} ncr    - NCR from normalizeRecord()
 * @param {string} format - 'mla' | 'apa' | 'csl-json' | 'bibtex' | 'ris'
 * @returns {string}
 */
export const exportAs = (ncr, format) => {
  switch (format) {
    case "mla":      return segmentsToPlain(buildMLA(ncr));
    case "apa":      return segmentsToPlain(buildAPA(ncr));
    case "csl-json": return JSON.stringify(buildCSL(ncr), null, 2);
    case "bibtex":   return buildBibTeX(ncr);
    case "ris":      return buildRIS(ncr);
    default:         return "";
  }
};
