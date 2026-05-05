import { useState } from "react";
import { THEMES, DEFAULT_THEME } from "../constants/themes.js";

export function useTheme(savedKey) {
  const [themeKey, setThemeKey] = useState(
    savedKey && THEMES[savedKey] ? savedKey : DEFAULT_THEME
  );

  const changeTheme = (newKey) => {
    if (!THEMES[newKey]) return;
    setThemeKey(newKey);
    try { localStorage.setItem("themeKey", newKey); } catch {}
  };

  return { themeKey, theme: THEMES[themeKey] || THEMES[DEFAULT_THEME], changeTheme, THEMES };
}
