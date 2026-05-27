// ISO 639-2 (3-letter) → ISO 639-1 (2-letter)
const ISO2 = {
  eng:"en", fre:"fr", fra:"fr", ger:"de", deu:"de", spa:"es", por:"pt",
  ita:"it", lat:"la", ara:"ar", rus:"ru", zho:"zh", chi:"zh", jpn:"ja",
  kor:"ko", nld:"nl", pol:"pl", swe:"sv", dan:"da", nor:"no", fin:"fi",
  hun:"hu", ces:"cs", cze:"cs", slk:"sk", hrv:"hr", srp:"sr", bul:"bg",
  ron:"ro", rum:"ro", tur:"tr", ell:"el", gre:"el", heb:"he", fas:"fa",
  per:"fa", hin:"hi", ben:"bn", vie:"vi", ind:"id", may:"ms", msa:"ms",
  cat:"ca", ukr:"uk", glg:"gl", eus:"eu",
};

// Codes that mean "no specific language" — skip entirely
const SKIP = new Set(["mul", "und", "zxx", "mis", "qaa", "qab"]);

// ISO 639-2 codes with no ISO 639-1 equivalent — give them a display name directly
const ISO2_DISPLAY = {
  grc: "Ancient Greek",
  ang: "Old English",
  non: "Old Norse",
  enm: "Middle English",
  frm: "Middle French",
  gmh: "Middle High German",
  pro: "Old Occitan",
  cop: "Coptic",
  chu: "Church Slavonic",
  syc: "Syriac",
  arc: "Aramaic",
  phn: "Phoenician",
  got: "Gothic",
  san: "Sanskrit",
  pli: "Pali",
  baq: "Basque",
};

// Full English name → ISO 639-1
const NAMES = {
  english:"en", french:"fr", german:"de", spanish:"es", portuguese:"pt",
  italian:"it", latin:"la", arabic:"ar", russian:"ru", chinese:"zh",
  japanese:"ja", korean:"ko", dutch:"nl", polish:"pl", swedish:"sv",
  danish:"da", norwegian:"no", finnish:"fi", hungarian:"hu", czech:"cs",
  slovak:"sk", croatian:"hr", serbian:"sr", bulgarian:"bg", romanian:"ro",
  turkish:"tr", greek:"el", hebrew:"he", persian:"fa", hindi:"hi",
  bengali:"bn", vietnamese:"vi", indonesian:"id", malay:"ms",
  catalan:"ca", ukrainian:"uk", galician:"gl", basque:"eu",
};

// ISO 639-1 → display name
const DISPLAY = {
  en:"English", fr:"French", de:"German", es:"Spanish", pt:"Portuguese",
  it:"Italian", la:"Latin",  ar:"Arabic",  ru:"Russian", zh:"Chinese",
  ja:"Japanese", ko:"Korean", nl:"Dutch", pl:"Polish", sv:"Swedish",
  da:"Danish",  no:"Norwegian", fi:"Finnish", hu:"Hungarian", cs:"Czech",
  sk:"Slovak",  hr:"Croatian",  sr:"Serbian", bg:"Bulgarian", ro:"Romanian",
  tr:"Turkish", el:"Greek",  he:"Hebrew", fa:"Persian", hi:"Hindi",
  bn:"Bengali", vi:"Vietnamese", id:"Indonesian", ms:"Malay",
  ca:"Catalan", uk:"Ukrainian", gl:"Galician", eu:"Basque",
};

/**
 * Normalizes any language code or name into { code, display }.
 * Returns null for empty, undetermined, or unrecognised values.
 *
 * Handles:
 *   ISO 639-1  "en" "fr"
 *   ISO 639-2  "fre" "ger" "lat" "grc"
 *   Full names "english" "german"
 */
export function normalizeLanguage(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lo = s.toLowerCase();

  if (SKIP.has(lo)) return null;

  // 2-letter: ISO 639-1
  if (lo.length === 2) {
    return { code: lo, display: DISPLAY[lo] || s.toUpperCase() };
  }

  // 3-letter: ISO 639-2
  if (lo.length === 3) {
    if (ISO2_DISPLAY[lo]) return { code: lo, display: ISO2_DISPLAY[lo] };
    const code = ISO2[lo];
    if (code) return { code, display: DISPLAY[code] || s };
    return null;
  }

  // Full English name
  const code = NAMES[lo];
  if (code) return { code, display: DISPLAY[code] || s };

  // Unrecognised — title-case and pass through with original string as code
  return { code: lo, display: s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() };
}
