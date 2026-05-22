// OpenCITE — Server Logger SSOT (v.19)
// Same format as src/lib/log.js — console only, no buffer (Edge runtime).
// Format: [opencite:ADAPTER_ID:event] key=value key=value

const formatPairs = (data) => {
  if (!data || typeof data !== "object") return "";
  return Object.entries(data).map(([k, v]) => {
    if (v == null) return `${k}=null`;
    if (typeof v === "string") {
      if (/[\s"=]/.test(v)) return `${k}="${v.replace(/"/g, '\\"')}"`;
      return `${k}=${v}`;
    }
    return `${k}=${v}`;
  }).join(" ");
};

const buildLine = (adapter, event, data) => {
  const tag = `[opencite:${adapter}:${event}]`;
  const pairs = formatPairs(data);
  return pairs ? `${tag} ${pairs}` : tag;
};

export function log(adapter, event, data) { console.log(buildLine(adapter, event, data)); }
log.warn = (adapter, event, data) => console.warn(buildLine(adapter, event, data));
log.err  = (adapter, event, data) => console.error(buildLine(adapter, event, data));
