import { useState } from "react";
import { history } from "../lib/history.js";

export function useHistory() {
  const [entries, setEntries] = useState([]);

  const load = () => setEntries(history.load());
  const add = (query) => setEntries(history.add(query));
  const remove = (query) => setEntries(history.remove(query));
  const clear = () => setEntries(history.clear());

  return { entries, load, add, remove, clear };
}
