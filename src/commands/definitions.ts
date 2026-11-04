import { quit } from "../app/lifecycle";
import { showPanel } from "../state/dialogs";
import { useSettings, type ColorSchemePreference, type ViewMode } from "../state/settings";
import { registerCommands, type Command } from "./registry";

const settings = () => useSettings.getState();

function viewCommand(id: Command["id"], label: string, shortcut: string, mode: ViewMode): Command {
  return {
    id,
    label,
    shortcut,
    run: () => settings().set({ viewMode: mode }),
    isChecked: () => settings().viewMode === mode,
  };
}

function themeCommand(id: Command["id"], label: string, pref: ColorSchemePreference): Command {
  return {
    id,
    label,
    run: () => settings().set({ colorScheme: pref }),
    isChecked: () => settings().colorScheme === pref,
  };
}

/** Register every command of the app. Called once at startup. */
export function registerAllCommands(): void {
  registerCommands([
    viewCommand("view.editor", "Editor", "Ctrl+1", "editor"),
    viewCommand("view.split", "Split", "Ctrl+2", "split"),
    viewCommand("view.preview", "Preview", "Ctrl+3", "preview"),
    {
      id: "view.toggleSidebar",
      label: "Show Sidebar",
      shortcut: "F9",
      run: () => settings().set({ sidebarVisible: !settings().sidebarVisible }),
      isChecked: () => settings().sidebarVisible,
    },
    {
      id: "view.toggleSyncScroll",
      label: "Synced Scroll",
      run: () => settings().set({ syncScroll: !settings().syncScroll }),
      isChecked: () => settings().syncScroll,
    },
    themeCommand("theme.system", "Follow System", "system"),
    themeCommand("theme.light", "Light", "light"),
    themeCommand("theme.dark", "Dark", "dark"),
    {
      id: "app.shortcuts",
      label: "Keyboard Shortcuts",
      shortcut: "Ctrl+?",
      run: () => showPanel("shortcuts"),
    },
    { id: "app.about", label: "About Phanes", run: () => showPanel("about") },
    { id: "app.quit", label: "Quit", shortcut: "Ctrl+Q", run: quit },
  ]);
}
