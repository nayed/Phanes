import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, Minus, PanelLeft, Square, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { runCommand, type CommandId } from "../commands/registry";
import { useSettings, type ViewMode } from "../state/settings";
import { useWindowButtons, type WindowButton } from "../state/windowButtons";
import { COLORSCHEMES, SCHEMES_BY_NAME } from "../app/theme";
import { tildify } from "../lib/path";
import { RECENT_SHOWN, useWorkspace } from "../state/workspace";
import { PopoverMenu, type MenuEntry } from "./PopoverMenu";

interface Props {
  title: string;
  subtitle: string;
}

/** Recent Folders: the folders opened before, except the open one, then Clear. Hidden when there are none. */
function recentFolders(recent: string[], root: string | null): MenuEntry[] {
  const others = recent.filter((p) => p !== root).slice(0, RECENT_SHOWN);
  if (!others.length) return [];
  return [
    {
      kind: "submenu",
      label: "Recent Folders",
      entries: [
        ...others.map(
          (path): MenuEntry => ({ kind: "command", id: "workspace.openRecent", ctx: { path }, label: tildify(path) }),
        ),
        { kind: "separator" },
        { kind: "command", id: "workspace.clearRecent" },
      ],
    },
  ];
}

const mainMenu = (recent: MenuEntry[]): MenuEntry[] => [
  { kind: "command", id: "workspace.open" },
  ...recent,
  { kind: "command", id: "file.new" },
  { kind: "separator" },
  { kind: "command", id: "file.save" },
  { kind: "command", id: "file.saveAs" },
  { kind: "separator" },
  {
    kind: "submenu",
    label: "Color Scheme",
    entries: [
      ...SCHEMES_BY_NAME.map((id): MenuEntry => ({ kind: "command", id: COLORSCHEMES[id].command })),
      { kind: "separator" },
      { kind: "command", id: "theme.system" },
      { kind: "command", id: "theme.light" },
      { kind: "command", id: "theme.dark" },
    ],
  },
  { kind: "command", id: "view.toggleSidebar" },
  { kind: "separator" },
  { kind: "command", id: "editor.toggleVim" },
  { kind: "submenu", label: "Vim Options", entries: [{ kind: "command", id: "editor.toggleVimClipboard" }] },
  { kind: "command", id: "editor.toggleRelativeNumbers" },
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
  const recent = useSettings((s) => s.recentWorkspaces);
  const root = useWorkspace((s) => s.root);

  return (
    <header className="header-bar" data-tauri-drag-region>
      <WindowControls side="left" />
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
          entries={mainMenu(recentFolders(recent, root))}
          label="Main menu"
          anchor={{ kind: "below", rect: menu.rect }}
          focusFirst={menu.keyboard}
          toggle={menuButton.current}
          onClose={closeMenu}
        />
      )}

      <WindowControls side="right" />
    </header>
  );
}

const windowButtons: Record<WindowButton, { label: string; icon: React.ReactNode; run: () => void }> = {
  minimize: {
    label: "Minimize",
    icon: <Minus size={12} strokeWidth={2.5} aria-hidden />,
    run: () => void getCurrentWindow().minimize(),
  },
  maximize: {
    label: "Maximize",
    icon: <Square size={11} strokeWidth={2.5} aria-hidden />,
    run: () => void getCurrentWindow().toggleMaximize(),
  },
  close: {
    label: "Close window",
    icon: <X size={12} strokeWidth={2.5} aria-hidden />,
    run: () => void runCommand("app.quit"),
  },
};

/** The window buttons the desktop's button layout puts on this side, if any. */
function WindowControls({ side }: { side: "left" | "right" }) {
  const buttons = useWindowButtons((s) => s[side]);
  if (!buttons.length) return null;
  return (
    <div className="window-controls" data-side={side}>
      {buttons.map((id) => (
        <button key={id} type="button" aria-label={windowButtons[id].label} onClick={windowButtons[id].run}>
          {windowButtons[id].icon}
        </button>
      ))}
    </div>
  );
}
