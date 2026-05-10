export type SidebarThemeId = "navy" | "violet" | "teal" | "charcoal" | "forest";

export type SidebarTheme = {
  id: SidebarThemeId;
  label: string;
  gradient: string;
  glow: string;
  bottomHint: string;
  accent: string;
};

export const SIDEBAR_THEMES: SidebarTheme[] = [
  {
    id: "navy",
    label: "Navy Blue",
    gradient: "linear-gradient(160deg, #1e3a8a 0%, #1e2462 100%)",
    glow: "radial-gradient(ellipse at 50% 0%, rgba(99,179,237,0.18) 0%, transparent 70%)",
    bottomHint: "radial-gradient(ellipse at 30% 100%, rgba(124,58,237,0.10) 0%, transparent 70%)",
    accent: "#93c5fd",
  },
  {
    id: "violet",
    label: "Deep Violet",
    gradient: "linear-gradient(160deg, #4c1d95 0%, #2d1b69 100%)",
    glow: "radial-gradient(ellipse at 50% 0%, rgba(196,181,253,0.18) 0%, transparent 70%)",
    bottomHint: "radial-gradient(ellipse at 30% 100%, rgba(99,102,241,0.12) 0%, transparent 70%)",
    accent: "#c4b5fd",
  },
  {
    id: "teal",
    label: "Dark Teal",
    gradient: "linear-gradient(160deg, #134e4a 0%, #0c3a38 100%)",
    glow: "radial-gradient(ellipse at 50% 0%, rgba(94,234,212,0.18) 0%, transparent 70%)",
    bottomHint: "radial-gradient(ellipse at 30% 100%, rgba(20,184,166,0.12) 0%, transparent 70%)",
    accent: "#5eead4",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    gradient: "linear-gradient(160deg, #1f2937 0%, #111827 100%)",
    glow: "radial-gradient(ellipse at 50% 0%, rgba(156,163,175,0.14) 0%, transparent 70%)",
    bottomHint: "radial-gradient(ellipse at 30% 100%, rgba(75,85,99,0.15) 0%, transparent 70%)",
    accent: "#9ca3af",
  },
  {
    id: "forest",
    label: "Forest Green",
    gradient: "linear-gradient(160deg, #14532d 0%, #052e16 100%)",
    glow: "radial-gradient(ellipse at 50% 0%, rgba(134,239,172,0.18) 0%, transparent 70%)",
    bottomHint: "radial-gradient(ellipse at 30% 100%, rgba(34,197,94,0.12) 0%, transparent 70%)",
    accent: "#86efac",
  },
];

export const SIDEBAR_THEME_MAP: Record<string, SidebarTheme> = Object.fromEntries(
  SIDEBAR_THEMES.map((t) => [t.id, t]),
);

export const DEFAULT_THEME = SIDEBAR_THEMES[0];
