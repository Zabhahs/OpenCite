export const THEMES = {
  tan: {
    label: "Tan",
    bg: "radial-gradient(ellipse at top, #f5ecd9 0%, #ede0c4 60%, #e4d3b0 100%)",
    swatch: "#e4d3b0",
    fg: "#1c1917", fgMuted: "#44403c", fgSubtle: "#78716c",
    border: "#1c1917", borderSubtle: "#d6d3d1",
    surface: "rgba(250, 250, 249, 0.4)",
    accent: "#7f1d1d", onAccent: "#fef3c7",
    buttonBg: "#1c1917", settingsBg: "#fef3c7", inputBg: "#ffffff",
    grainOpacity: 0.04
  },
  blueGrey: {
    label: "Blue-grey",
    bg: "radial-gradient(ellipse at top, #e2e8f0 0%, #cbd5e1 60%, #94a3b8 100%)",
    swatch: "#94a3b8",
    fg: "#0f172a", fgMuted: "#334155", fgSubtle: "#64748b",
    border: "#0f172a", borderSubtle: "#cbd5e1",
    surface: "rgba(241, 245, 249, 0.5)",
    accent: "#1e3a8a", onAccent: "#dbeafe",
    buttonBg: "#0f172a", settingsBg: "#dbeafe", inputBg: "#ffffff",
    grainOpacity: 0.03
  },
  dark: {
    label: "Dark",
    bg: "radial-gradient(ellipse at top, #1f2937 0%, #111827 60%, #030712 100%)",
    swatch: "#1f2937",
    fg: "#fafaf9", fgMuted: "#a8a29e", fgSubtle: "#78716c",
    border: "#fafaf9", borderSubtle: "#3f3f46",
    surface: "rgba(63, 63, 70, 0.3)",
    accent: "#fbbf24", onAccent: "#1c1917",
    buttonBg: "#fafaf9", settingsBg: "rgba(120, 113, 108, 0.18)", inputBg: "rgba(0, 0, 0, 0.3)",
    grainOpacity: 0.06
  },
  porphyry: {
    label: "Porphyry & Gold",
    bg: "radial-gradient(ellipse at top, #581c1c 0%, #3b0d0d 60%, #1a0606 100%)",
    swatch: "#581c1c",
    fg: "#fde68a", fgMuted: "#d4a574", fgSubtle: "#a08560",
    border: "#fbbf24", borderSubtle: "#7c2d12",
    surface: "rgba(127, 29, 29, 0.35)",
    accent: "#fef3c7", onAccent: "#3b0d0d",
    buttonBg: "#d4af37", settingsBg: "rgba(127, 29, 29, 0.4)", inputBg: "rgba(0, 0, 0, 0.25)",
    grainOpacity: 0.05
  }
};

export const DEFAULT_THEME = "tan";
