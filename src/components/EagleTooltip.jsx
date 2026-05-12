// OpenCITE — EagleTooltip
// Modular, reusable eagle help tooltip component.
// Renders inline (no portal, no fixed positioning) — always in viewport.
// Reuse anywhere: pass message, visible, onDismiss.
//
// Usage:
//   const eagle = useEagleTooltip("eagle_library_prompted");
//   <EagleTooltip {...eagle.props} message="Your help text here" />

import React, { useEffect, useRef } from "react";

export function EagleTooltip({ visible, onDismiss, message }) {
  const timerRef = useRef(null);

  // Auto-dismiss after 4s, click-anywhere dismisses early
  useEffect(() => {
    if (!visible) return;

    timerRef.current = setTimeout(() => onDismiss(), 4000);

    const handler = () => onDismiss();
    document.addEventListener("click", handler, { once: true });

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener("click", handler);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      className="eagle-tooltip-enter flex items-start gap-3 my-3 p-3 border border-amber-300 bg-amber-50"
      style={{ animation: "eagleEnter 0.35s ease-out" }}
      onClick={(e) => { e.stopPropagation(); onDismiss(); }}
    >
      {/* Eagle image */}
      <img
        src="/android-chrome-512x512.png"
        alt="OpenCITE eagle"
        className="shrink-0 h-12 w-auto"
        style={{
          mixBlendMode: "multiply",
          animation: "eagleBounce 0.6s ease-in-out 2",
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
        }}
        draggable={false}
      />

      {/* Speech bubble */}
      <div className="flex-1 relative">
        {/* Bubble pointer */}
        <div
          className="absolute -left-2 top-3 w-0 h-0"
          style={{
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderRight: "8px solid #d97706",
          }}
        />
        <div className="border border-amber-500 bg-white px-3 py-2">
          <p className="display-font text-sm text-stone-800 leading-snug">{message}</p>
          <p className="mono-font text-[9px] uppercase tracking-widest text-stone-400 mt-1">
            tap anywhere to dismiss
          </p>
        </div>
      </div>
    </div>
  );
}
