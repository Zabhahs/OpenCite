/** createLauncher — SSOT for launcher object shape. */
export const createLauncher = (cfg) => ({
  id: cfg.id,
  name: cfg.name,
  tagline: cfg.tagline || "",
  region: cfg.region,
  archiveType: cfg.archiveType,
  contentType: cfg.contentType,
  buildUrl: cfg.buildUrl
});
