/**
 * xmlUtils.js — shared XML parsing helpers for SRU/OAI-PMH adapters.
 *
 * DOMParser is not reliably available in all Edge runtime contexts, so these
 * helpers use targeted regex extraction instead. They are intentionally
 * narrow — they handle well-formed Dublin Core and basic SRU envelope fields
 * only. Do not extend them into a general XML parser.
 *
 * Consumers (v.18):
 *   - adapters/extensions/onb.js       (SRU/oai_dc)
 *   - adapters/extensions/bnfApi.js    (SRU/unimarcxchange)
 *   - api/search/mexicana.js           (OAI-PMH/oai_dc) — server-side copy
 *
 * NOTE: mexicana.js is a Vercel Edge route and cannot import from src/.
 * Keep api/search/mexicana.js's inline helpers in sync manually, or move
 * the route to a shared package if the monorepo grows to warrant it.
 */

// ---------------------------------------------------------------------------
// DC / OAI-DC field extraction
// Handles namespace prefixes: <dc:title>, <oai_dc:title>, <title>
// ---------------------------------------------------------------------------

/**
 * Extract the first occurrence of a Dublin Core field from an XML block.
 * @param {string} xml  - Raw XML string (full doc or record fragment)
 * @param {string} tag  - DC element name without prefix, e.g. "title"
 * @returns {string}
 */
export const dcOne = (xml, tag) => {
  const re = new RegExp(`<(?:[^:>\\s]+:)?${tag}[^>]*>([^<]*)<`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
};

/**
 * Extract all occurrences of a Dublin Core field from an XML block.
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]}
 */
export const dcAll = (xml, tag) => {
  const re = new RegExp(`<(?:[^:>\\s]+:)?${tag}[^>]*>([^<]*)<`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = m[1].trim();
    if (v) out.push(v);
  }
  return out;
};

// ---------------------------------------------------------------------------
// SRU envelope helpers
// ---------------------------------------------------------------------------

/**
 * Extract the total record count from an SRU searchRetrieve response.
 * @param {string} xml
 * @returns {number}
 */
export const sruTotal = (xml) => {
  const m = xml.match(/<numberOfRecords>(\d+)<\/numberOfRecords>/);
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * Extract all <recordData> blocks from an SRU response.
 * Each block contains one record's metadata (oai_dc, unimarcxchange, etc.).
 * @param {string} xml
 * @returns {string[]}
 */
export const sruRecords = (xml) => {
  const re = /<recordData>([\s\S]*?)<\/recordData>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
};

// ---------------------------------------------------------------------------
// OAI-PMH helpers
// ---------------------------------------------------------------------------

/**
 * Extract all <record> blocks from an OAI-PMH ListRecords response.
 * @param {string} xml
 * @returns {string[]}
 */
export const oaiRecords = (xml) => {
  const re = /<record>([\s\S]*?)<\/record>/gi;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
};

/**
 * Extract the OAI-PMH resumptionToken (null if absent or empty).
 * @param {string} xml
 * @returns {string|null}
 */
export const oaiResumptionToken = (xml) => {
  const m = xml.match(/<resumptionToken[^>]*>([\s\S]*?)<\/resumptionToken>/i);
  const tok = m ? m[1].trim() : null;
  return tok || null;
};

// ---------------------------------------------------------------------------
// UNIMARC field extraction (BnF)
// UNIMARC fields are numeric tags: <datafield tag="200">, <subfield code="a">
// ---------------------------------------------------------------------------

/**
 * Extract all subfield values for a given UNIMARC tag + subfield code.
 * @param {string} xml
 * @param {string} tag      - e.g. "200", "700", "600"
 * @param {string} [code]   - subfield code, e.g. "a". If omitted, returns
 *                            all subfield text concatenated per datafield.
 * @returns {string[]}      - one entry per matching datafield
 */
export const unimarcAll = (xml, tag, code) => {
  // Match each datafield block for this tag
  const fieldRe = new RegExp(
    `<datafield[^>]+tag=["']${tag}["'][^>]*>([\\s\\S]*?)<\\/datafield>`,
    'gi'
  );
  const out = [];
  let fm;
  while ((fm = fieldRe.exec(xml)) !== null) {
    const block = fm[1];
    if (code) {
      // Extract specific subfield
      const subRe = new RegExp(`<subfield[^>]+code=["']${code}["'][^>]*>([^<]*)<`, 'i');
      const sm = block.match(subRe);
      if (sm && sm[1].trim()) out.push(sm[1].trim());
    } else {
      // Concatenate all subfields in this datafield
      const subRe = /<subfield[^>]*>([^<]*)</gi;
      const parts = [];
      let sm;
      while ((sm = subRe.exec(block)) !== null) {
        if (sm[1].trim()) parts.push(sm[1].trim());
      }
      if (parts.length) out.push(parts.join(' '));
    }
  }
  return out;
};

/**
 * Extract the first subfield value for a given UNIMARC tag + subfield code.
 * @param {string} xml
 * @param {string} tag
 * @param {string} [code]
 * @returns {string}
 */
export const unimarcOne = (xml, tag, code) => unimarcAll(xml, tag, code)[0] || '';
