import { useState } from "react";
import { library, libraryKey } from "../lib/library.js";
import { buildMLA, buildAPA, segmentsToPlain } from "../lib/citations.js";

export function useLibrary() {
  const [items, setItems] = useState([]);

  const load = () => setItems(library.load());

  const isInLibrary = (result) =>
    items.some(item => libraryKey(item) === libraryKey(result));

  const toggle = (result) => {
    if (isInLibrary(result)) {
      setItems(library.remove(result));
    } else {
      setItems(library.add(result));
    }
  };

  const exportBibliography = () => {
    if (items.length === 0) return;
    const lines = [
      "OPENCITE LIBRARY EXPORT",
      `Generated ${new Date().toLocaleString()}`,
      `${items.length} item${items.length !== 1 ? "s" : ""}`,
      "",
      "=== MLA 9 ===", "",
      ...items.flatMap(item => [segmentsToPlain(buildMLA(item)), ""]),
      "",
      "=== APA 7 ===", "",
      ...items.flatMap(item => [segmentsToPlain(buildAPA(item)), ""])
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opencite-library-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clear = () => setItems(library.clear());

  return { items, load, isInLibrary, toggle, exportBibliography, clear };
}
