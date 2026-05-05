/* === UPDATED DPLA_ADAPTER === */
export const DPLA_ADAPTER = {
  // ... (meta data remains same)
  search: async (query, settings, opts = {}) => {
    if (!settings.dplaKey) throw new Error("DPLA needs a free API key.");
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    // Updated to proxiedFetch
    const url = `https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&api_key=${encodeURIComponent(settings.dplaKey)}`;
    const r = await proxiedFetch(url); 
    if (!r.ok) throw new Error(`DPLA ${r.status}`);
    const data = await r.json();
    // ... (rest of mapping remains same)
  }
};

/* === UPDATED BDPI_ADAPTER === */
export const BDPI_ADAPTER = {
  // ... (meta data remains same)
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://www.iberoamericadigital.net/BDPI/OpenSearch.do?Field=todos&text=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}&format=json`;
    // Updated to proxiedFetch
    const r = await proxiedFetch(url);
    if (!r.ok) throw new Error(`BDPI ${r.status}`);
    // ... (rest of processing remains same)
  }
};

/* === UPDATED GALLICA_ADAPTER === */
export const GALLICA_ADAPTER = {
  // ... (meta data remains same)
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent('dc.any all "' + query + '"')}&startRecord=${offset + 1}&maximumRecords=${pageSize}&recordSchema=dc&mode=json`;
    // Updated to proxiedFetch
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Gallica ${r.status}`);
    // ... (rest of mapping remains same)
  }
};