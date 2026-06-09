import { useState, useEffect } from "react";
import { THEMES, DEFAULT_THEME } from "../constants/themes.js";

// Light default is the SSOT theme key from themes.js (F-309 — was re-hardcoded "tan").
const LIGHT_DEFAULT = DEFAULT_THEME;
const DARK_DEFAULT  = "oled";

function getInitialTheme() {
  // Manual preference always wins
  try {
    const saved = localStorage.getItem("themeKey");
    if (saved && THEMES[saved]) return saved;
  } catch {}
  // No saved preference — match OS
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return DARK_DEFAULT;
  } catch {}
  return LIGHT_DEFAULT;
}

export function useTheme() {
  const [themeKey, setThemeKey] = useState(getInitialTheme);

  // Follow OS changes in real time — only when user has no manual preference stored
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      try {
        if (localStorage.getItem("themeKey")) return; // manual pick — don't override
      } catch {}
      setThemeKey(e.matches ? DARK_DEFAULT : LIGHT_DEFAULT);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const changeTheme = (newKey) => {
    if (!THEMES[newKey]) return;
    setThemeKey(newKey);
    try { localStorage.setItem("themeKey", newKey); } catch {}
  };

  return { themeKey, theme: THEMES[themeKey] || THEMES[DEFAULT_THEME], changeTheme };
}
