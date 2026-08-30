import type { Accent } from "./types";

/** The pickable accents, in the order the account menu shows them.
 *
 *  `swatch` is the dot's own color in that picker, and has to be a literal:
 *  `var(--accent)` only ever resolves to whichever accent is *currently*
 *  applied, so six swatches reading it would all render the same color. It's
 *  the 500 step — between the 600 used in light and the 400 used for the
 *  soft token — so one dot reads as the same hue in either theme.
 *
 *  Keep in step with index.css's `[data-accent]` blocks and the `Accent`
 *  union in types.ts: an entry here with no CSS block would render a dot
 *  that silently does nothing when picked. */
export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "violet", label: "Violet", swatch: "#8b5cf6" },
  { value: "teal", label: "Teal", swatch: "#14b8a6" },
  { value: "emerald", label: "Emerald", swatch: "#10b981" },
  { value: "amber", label: "Amber", swatch: "#f59e0b" },
  { value: "rose", label: "Rose", swatch: "#f43f5e" },
];

export const DEFAULT_ACCENT: Accent = "blue";

/** Narrows whatever came out of `localStorage` — an unknown or absent value
 *  falls back rather than writing a bogus `data-accent` nothing styles. */
export function isAccent(value: unknown): value is Accent {
  return ACCENTS.some((accent) => accent.value === value);
}
