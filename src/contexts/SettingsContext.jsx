import React, { createContext, useContext } from "react";
import { useSettings } from "../hooks/useSettings.js";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const value = useSettings();
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used inside <SettingsProvider>");
  return ctx;
}
