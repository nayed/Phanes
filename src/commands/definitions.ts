import { quit } from "../app/lifecycle";
import { showPanel } from "../state/dialogs";
import { useSettings, type ColorSchemePreference, type ViewMode } from "../state/settings";
import { copyPath, createItem, duplicateItem, revealItem, startRename, trashItem } from "../state/fileOps";
import { activeTab, closeTab, cycleTab, newUntitledTab, saveTab, saveTabAs, useTabs } from "../state/tabs";
import { chooseWorkspace, useWorkspace } from "../state/workspace";
import { registerCommands, type Command, type CommandContext } from "./registry";

const settings = () => useSettings.getState();
const hasActiveTab = () => useTabs.getState().activeId !== null;
const hasTarget = (ctx: CommandContext) => !!ctx.target;

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
    { id: "workspace.open", label: "Open Folder…", shortcut: "Ctrl+O", run: chooseWorkspace },
    { id: "file.new", label: "New File", shortcut: "Ctrl+N", run: (ctx) => createItem("file", ctx) },
    {
      id: "folder.new",
      label: "New Folder",
      shortcut: "Shift+Ctrl+N",
      run: (ctx) => createItem("folder", ctx),
      isEnabled: () => useWorkspace.getState().root !== null,
    },
    {
      id: "item.rename",
      label: "Rename",
      shortcut: "F2",
      scope: "tree",
      run: (ctx) => startRename(ctx.target!.path),
      isEnabled: hasTarget,
    },
    {
      id: "item.duplicate",
      label: "Duplicate",
      run: (ctx) => duplicateItem(ctx.target!.path),
      isEnabled: hasTarget,
    },
    {
      id: "item.copyPath",
      label: "Copy Path",
      shortcut: "Shift+Ctrl+C",
      run: copyPath,
      isEnabled: (ctx) => !!ctx.target || !!activeTab()?.path,
    },
    {
      id: "item.reveal",
      label: "Open in Files",
      run: (ctx) => revealItem(ctx.target!.path),
      isEnabled: hasTarget,
    },
    {
      id: "item.trash",
      label: "Move to Trash",
      shortcut: "Delete",
      scope: "tree",
      danger: true,
      run: (ctx) => trashItem(ctx.target!.path),
      isEnabled: hasTarget,
    },
    {
      id: "file.save",
      label: "Save",
      shortcut: "Ctrl+S",
      run: async () => void (await saveTab()),
      isEnabled: hasActiveTab,
    },
    {
      id: "file.saveAs",
      label: "Save As…",
      shortcut: "Shift+Ctrl+S",
      run: async () => void (await saveTabAs()),
      isEnabled: hasActiveTab,
    },
    { id: "tab.new", label: "New Document", shortcut: "Ctrl+T", run: () => newUntitledTab() },
    {
      id: "tab.close",
      label: "Close Tab",
      shortcut: "Ctrl+W",
      run: async () => void (await closeTab()),
      isEnabled: hasActiveTab,
    },
    {
      id: "tab.next",
      label: "Next Tab",
      shortcut: "Ctrl+Tab",
      altShortcuts: ["Ctrl+PageDown"],
      run: () => cycleTab(1),
    },
    {
      id: "tab.previous",
      label: "Previous Tab",
      shortcut: "Shift+Ctrl+Tab",
      altShortcuts: ["Ctrl+PageUp"],
      run: () => cycleTab(-1),
    },
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
