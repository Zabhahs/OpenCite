// OpenCITE — Client Logger SSOT (v.19)
// Format: [opencite:ADAPTER_ID:event] key=value key=value
const BUFFER_SIZE = 500;
let buffer = [];
let bufferActive = false;

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

const emit = (level, adapter, event, data) => {
  const line = buildLine(adapter, event, data);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  if (bufferActive) {
    buffer.push(`${new Date().toISOString()} ${level.toUpperCase()} ${line}`);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  }
};

export function log(adapter, event, data) { emit("log", adapter, event, data); }
log.warn = (adapter, event, data) => emit("warn", adapter, event, data);
log.err  = (adapter, event, data) => emit("error", adapter, event, data);

export function installDebugLog() {
  bufferActive = true;
  if (typeof window !== "undefined" && !window.__opencite_log_installed__) {
    window.__opencite_log_installed__ = true;
    window.addEventListener("error", (e) => {
      emit("error", "window", "uncaught", { msg: e.message, src: e.filename });
    });
    window.addEventListener("unhandledrejection", (e) => {
      emit("error", "window", "unhandled-rejection", { msg: e.reason?.message || String(e.reason) });
    });
  }
}

export function getDebugLog() { return buffer.join("\n"); }
export function clearDebugLog() { buffer = []; }
export function downloadDebugLog() {
  const blob = new Blob([buffer.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opencite-debug-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.log`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
