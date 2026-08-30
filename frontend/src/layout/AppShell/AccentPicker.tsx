import { useTheme } from "../../lib/themeContext";
import { ACCENTS } from "../../lib/accents";

/**
 * The accent swatches in the account menu, below the theme tabs.
 *
 * Plain buttons in a plain row rather than `DropdownMenuItem`s, for the
 * same two reasons the theme control next to it is a `Tabs`: these are
 * mutually exclusive states of one setting rather than separate actions,
 * and picking one shouldn't close the menu the way "Sign out" does —
 * trying accents is something you do a few times in a row to see which you
 * like. Not `Tabs` itself only because a color is its own label: six dots
 * read faster than six words, and there's no text that would say more.
 */
export function AccentPicker() {
  const { accent, setAccent } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Accent color"
      className="flex items-center gap-1.5 px-2 pb-1.5"
    >
      {ACCENTS.map(({ value, label, swatch }) => {
        const isSelected = value === accent;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            onClick={() => setAccent(value)}
            // Selection is an offset outline rather than a border: a border
            // would eat into the dot and make the selected swatch read
            // smaller than its neighbours. Focus keeps the same shadow the
            // library's own controls use, so it doesn't collide with the
            // outline the way a second outline would.
            className={`size-5 rounded-full focus-visible:outline-none focus-visible:shadow-[rgba(15,23,42,0.08)_0px_0px_0px_3px,rgba(15,23,42,0.16)_0px_0px_12px_2px] dark:focus-visible:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_3px,rgba(255,255,255,0.2)_0px_0px_12px_2px] ${
              isSelected
                ? "outline-2 outline-offset-2 outline-slate-950 dark:outline-white"
                : "hover:opacity-80"
            }`}
            style={{ background: swatch }}
          />
        );
      })}
    </div>
  );
}
