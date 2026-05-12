// OpenCITE — useEagleTooltip
// Manages eagle tooltip visibility with optional one-time localStorage flag.
// Pass a flagKey to show only once ever; omit for always-available toggle.
//
// Usage:
//   const eagle = useEagleTooltip("eagle_library_prompted");
//   eagle.show();          // trigger the tooltip
//   eagle.dismiss();       // hide it
//   <EagleTooltip {...eagle.props} message="..." />

import { useState, useCallback } from "react";

export function useEagleTooltip(flagKey = null) {
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => {
    // If flagKey given, only show if not already seen
    if (flagKey) {
      try {
        if (localStorage.getItem(flagKey)) return;
      } catch {}
    }
    setVisible(true);
  }, [flagKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Mark as seen so it never shows again
    if (flagKey) {
      try { localStorage.setItem(flagKey, "1"); } catch {}
    }
  }, [flagKey]);

  return {
    show,
    dismiss,
    props: { visible, onDismiss: dismiss },
  };
}
