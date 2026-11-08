import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, Minus, PanelLeft, Square, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { runCommand, type CommandId } from "../commands/registry";
import { useSettings, type ViewMode } from "../state/settings";
import { PopoverMenu, type MenuEntry } from "./PopoverMenu";

interface Props {
  title: string;
  subtitle: string;
}

const mainMenu: MenuEntry[] = [
  { kind: "command", id: "workspace.open" },
  { kind: "command", id: "file.new" },
  { kind: "separator" },
  { kind: "command", id: "file.save" },
  { kind: "command", id: "file.saveAs" },
  { kind: "separator" },
  {
    kind: "submenu",
    label: "Color Scheme",
    entries: [
      { kind: "command", id: "scheme.githubDefault" },
      { kind: "command", id: "scheme.gruvbox" },
      { kind: "separator" },
      { kind: "command", id: "theme.system" },
      { kind: "command", id: "theme.light" },
      { kind: "command", id: "theme.dark" },
    ],
  },
  { kind: "command", id: "view.toggleSidebar" },
  { kind: "separator" },
  { kind: "command", id: "app.shortcuts" },
  { kind: "command", id: "app.about" },
  { kind: "command", id: "app.quit" },
];

const modes: { mode: ViewMode; label: string; command: CommandId }[] = [
  { mode: "editor", label: "Editor", command: "view.editor" },
  { mode: "split", label: "Split", command: "view.split" },
  { mode: "preview", label: "Preview", command: "view.preview" },
];

/**
 * The libadwaita-style header bar. It is the window's title bar: dragging it
 * moves the window and double-clicking toggles maximize (data-tauri-drag-region).
 */
export function HeaderBar({ title, subtitle }: Props) {
  const sidebarVisible = useSettings((s) => s.sidebarVisible);
  const viewMode = useSettings((s) => s.viewMode);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ rect: DOMRect; keyboard: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <header className="header-bar" data-tauri-drag-region>
      <button
        type="button"
        className="icon-button"
        aria-label="Toggle workspace sidebar"
        title="Show Sidebar (F9)"
        aria-pressed={sidebarVisible}
        onClick={() => void runCommand("view.toggleSidebar")}
      >
        <PanelLeft size={16} aria-hidden />
      </button>

      <div className="header-title" data-tauri-drag-region>
        <span className="header-title-main" data-tauri-drag-region>
          {title}
        </span>
        <span className="header-title-sub" data-tauri-drag-region>
          {subtitle}
        </span>
      </div>

      <div className="view-switcher" role="group" aria-label="View mode">
        {modes.map(({ mode, label, command }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={viewMode === mode}
            onClick={() => void runCommand(command)}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        ref={menuButton}
        type="button"
        className="icon-button"
        aria-label="Main menu"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(e) => {
          if (menu) return setMenu(null);
          // detail === 0 means the button was activated from the keyboard.
          setMenu({ rect: e.currentTarget.getBoundingClientRect(), keyboard: e.detail === 0 });
        }}
      >
        <Menu size={16} aria-hidden />
      </button>
      {menu && (
        <PopoverMenu
          entries={mainMenu}
          label="Main menu"
          anchor={{ kind: "below", rect: menu.rect }}
          focusFirst={menu.keyboard}
          toggle={menuButton.current}
          onClose={closeMenu}
        />
      )}

      <WindowControls />
    </header>
  );
}

function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className="window-controls">
      <button type="button" aria-label="Minimize" onClick={() => void win.minimize()}>
        <Minus size={12} strokeWidth={2.5} aria-hidden />
      </button>
      <button type="button" aria-label="Maximize" onClick={() => void win.toggleMaximize()}>
        <Square size={11} strokeWidth={2.5} aria-hidden />
      </button>
      <button type="button" aria-label="Close window" onClick={() => void runCommand("app.quit")}>
        <X size={12} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
