import { ArrowDownUp, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { COLORSCHEMES } from "../app/theme";
import { runCommand } from "../commands/registry";
import { useEditorStatus } from "../state/editorStatus";
import { useSettings, type ColorSchemePreference } from "../state/settings";
import { useTabs } from "../state/tabs";
import { PopoverMenu, type MenuEntry } from "./PopoverMenu";

/** What the color mode button shows for each setting. */
const COLOR_MODES: Record<ColorSchemePreference, { icon: LucideIcon; label: string }> = {
  system: { icon: SunMoon, label: "Follow System" },
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
};

/** The colorscheme list opened from the status bar. */
const schemeMenu: MenuEntry[] = [
  { kind: "command", id: "scheme.githubDefault" },
  { kind: "command", id: "scheme.gruvbox" },
  { kind: "command", id: "scheme.catppuccin" },
  { kind: "command", id: "scheme.everforest" },
];

/** GFM · UTF-8 · Ln, Col · words … synced-scroll toggle · colorscheme · color mode. */
export function StatusBar() {
  const hasTab = useTabs((s) => s.activeId !== null);
  const line = useEditorStatus((s) => s.line);
  const col = useEditorStatus((s) => s.col);
  const words = useEditorStatus((s) => s.words);
  const syncScroll = useSettings((s) => s.syncScroll);
  const colorMode = COLOR_MODES[useSettings((s) => s.colorScheme)];
  const ColorModeIcon = colorMode.icon;
  const scheme = useSettings((s) => s.scheme);
  const schemeButton = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ rect: DOMRect; keyboard: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <footer className="status-bar">
      <span className="status-strong">GFM</span>
      <span>UTF-8</span>
      {hasTab && (
        <>
          <span>
            Ln {line}, Col {col}
          </span>
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
        </>
      )}
      <span className="status-spacer" />
      <button
        type="button"
        className="status-toggle"
        aria-pressed={syncScroll}
        title={syncScroll ? "Synced scroll is on" : "Synced scroll is off"}
        onClick={() => void runCommand("view.toggleSyncScroll")}
      >
        <ArrowDownUp size={12} strokeWidth={2.5} aria-hidden />
        Synced scroll
      </button>
      <button
        ref={schemeButton}
        type="button"
        className="status-toggle"
        title="Change colorscheme"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(e) => {
          if (menu) return setMenu(null);
          // detail === 0 means the button was activated from the keyboard.
          setMenu({ rect: e.currentTarget.getBoundingClientRect(), keyboard: e.detail === 0 });
        }}
      >
        {COLORSCHEMES[scheme].name}
      </button>
      {menu && (
        <PopoverMenu
          entries={schemeMenu}
          label="Colorscheme"
          anchor={{ kind: "above", rect: menu.rect }}
          focusFirst={menu.keyboard}
          toggle={schemeButton.current}
          onClose={closeMenu}
        />
      )}
      <button
        type="button"
        className="status-toggle"
        aria-label={`Color mode: ${colorMode.label}`}
        title={`Color mode: ${colorMode.label}`}
        onClick={() => void runCommand("theme.cycle")}
      >
        <ColorModeIcon size={12} strokeWidth={2.5} aria-hidden />
      </button>
    </footer>
  );
}
