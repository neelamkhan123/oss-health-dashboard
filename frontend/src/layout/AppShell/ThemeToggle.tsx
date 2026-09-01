import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  buttonVariants,
} from "neelam-ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "../../lib/themeContext";
import type { Theme } from "../../lib/types";

const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun size={14} /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} /> },
  { value: "system", label: "System", icon: <Monitor size={14} /> },
];

/** The trigger always shows the *resolved* icon (sun/moon), not a
 *  three-way glyph for "system" — someone glancing at the topbar wants to
 *  know what they're looking at right now, not which of three settings
 *  produced it. Which setting is active is what the open menu's
 *  checkmark is for. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Toggle color theme"
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        {resolvedTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
          >
            {option.icon}
            {option.label}
            {theme === option.value ? (
              <Check size={14} className="ml-auto" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
