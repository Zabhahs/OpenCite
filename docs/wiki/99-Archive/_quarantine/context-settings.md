---
machine_ids: ["contexts.SettingsContext"]
findings: [F-301, F-308]
runtime: client
status: quarantined
tags: [archive, quarantine, deadcode, frontend, context]
---

# 🔒 Quarantine — contexts.SettingsContext (SettingsProvider / useSettingsContext)

> **Removed from build in v0.41.** Original path: `src/contexts/SettingsContext.jsx`. Full source below.

## Why removed

Thin React context wrapper around `useSettings()` that was **never mounted and never consumed anywhere**
in the app — all settings consumers call `useSettings()` directly via prop-drilling from `App.jsx`.
Dead since creation. See [[09-Audit/Tech-Debt-Overengineering#f-301]], [[09-Audit/Tech-Debt-Overengineering#f-308]].

## Verbatim source

```jsx
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
```

## Revival checklist

1. Copy the verbatim source back to `src/contexts/SettingsContext.jsx`.
2. Mount `<SettingsProvider>` in `src/App.jsx` (inside `<AuthProvider>`), replacing the direct `useSettings()` call in `OpenCITE()`.
3. Migrate every `useSettings()` call site to `useSettingsContext()`.
4. Remove the `settings` / `save` / `load` prop-drilling chain now that context provides them.
5. Re-verify settings sync (sign in/out → DB sync) still works, then flip the machine record back to `healthy`.

## Findings

- **F-301** — `SettingsContext` / `SettingsProvider` never mounted or consumed anywhere in the app.
- **F-308** — Duplicate of F-301 filed against `hooks.useSettings` to capture the dependency on the dead context.

## See also

[[_index]] · [[01-Frontend/Contexts]]
