/**
 * Vim mode's global parts (docs/VIM.md), registered once at startup: ex
 * commands, `gt` / `gT`, `:set` options and the clipboard. Ex commands call
 * the command registry or the same store functions the app uses, never
 * logic of their own, so menus, shortcuts and ex commands always agree.
 */
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getCM, Vim } from "@replit/codemirror-vim";
import { COLORSCHEMES, SCHEMES_BY_NAME } from "../app/theme";
import { quit } from "../app/lifecycle";
import { runCommand } from "../commands/registry";
import { pathInfo } from "../lib/fs";
import { dirname, expandHome, resolve } from "../lib/path";
import { useSettings, type SchemeId } from "../state/settings";
import {
  activeTab,
  closeAllTabs,
  discardAllTabs,
  discardTab,
  newUntitledTab,
  openFile,
  reloadTab,
  saveAllTabs,
  saveTabTo,
} from "../state/tabs";
import { useWorkspace } from "../state/workspace";
import { getEditorOptions, setEditorOptions } from "./documents";
import { installVimCompletion } from "./vimCompletion";

type CM = NonNullable<ReturnType<typeof getCM>>;
interface ExParams {
  args?: string[];
  argString?: string;
}

/** Show a message (or an error) in the command line bar. */
function message(cm: CM, text: string, error = false): void {
  const el = document.createElement("div");
  el.className = error ? "cm-vim-message cm-vim-error" : "cm-vim-message cm-vim-info";
  el.textContent = text;
  cm.openNotification(el, { bottom: true });
}

const bang = (params: ExParams) => (params.argString ?? "").trim().startsWith("!");
const argument = (params: ExParams) => (params.argString ?? "").trim().replace(/^!\s*/, "");

/** A path typed after `:e` or `:w`, relative to the current file's folder. */
function resolvePath(typed: string): string {
  const tab = activeTab();
  const base = tab?.path ? dirname(tab.path) : (useWorkspace.getState().root ?? "/");
  return resolve(base, expandHome(typed));
}

/** Open a path in a tab: the file if it exists, otherwise a new document that saves there. */
async function openPath(typed: string): Promise<void> {
  const path = resolvePath(typed);
  const info = await pathInfo(path);
  if (info.exists && !info.isDir) await openFile(path);
  else if (!info.exists) newUntitledTab(path);
}

/** Close the current tab, discarding its changes with `!`. */
function quitTab(params: ExParams): void {
  if (bang(params)) discardTab();
  else void runCommand("tab.close");
}

/* ---------- Ex commands ---------- */

type ExHandler = (cm: CM, params: ExParams) => unknown;

/**
 * Register an ex command that runs once the key that ran it is fully
 * handled. Many of them switch tabs, which swaps the editor's state: done in
 * the middle of the key event, the next tab's editor would receive the rest
 * of it (`gt` typed a "t" into the new tab).
 */
function defineEx(name: string, prefix: string, handler: ExHandler): void {
  Vim.defineEx(name, prefix, (cm: CM, params: ExParams) => {
    setTimeout(() => void handler(cm, params), 0);
  });
}

function defineExCommands(): void {
  defineEx("write", "w", (_cm: CM, params: ExParams) => {
    const target = argument(params);
    const tab = activeTab();
    if (target && tab) void saveTabTo(tab.id, resolvePath(target));
    else void runCommand("file.save");
  });
  defineEx("wall", "wa", () => void saveAllTabs());
  defineEx("quit", "q", (_cm: CM, params: ExParams) => quitTab(params));
  defineEx("wq", "wq", async () => {
    await runCommand("file.save");
    if (activeTab() && !activeTab()!.dirty) void runCommand("tab.close");
  });
  defineEx("xit", "x", async () => {
    if (activeTab()?.dirty) await runCommand("file.save");
    if (activeTab() && !activeTab()!.dirty) void runCommand("tab.close");
  });
  defineEx("qall", "qa", (_cm: CM, params: ExParams) => {
    if (bang(params)) {
      discardAllTabs();
      void quit();
    } else {
      void closeAllTabs();
    }
  });
  defineEx("edit", "e", (_cm: CM, params: ExParams) => {
    const target = argument(params);
    if (target) void openPath(target);
    else void reloadTab();
  });
  const tabNew = (_cm: CM, params: ExParams) => {
    const target = argument(params);
    if (target) void openPath(target);
    else void runCommand("tab.new");
  };
  defineEx("tabnew", "tabnew", tabNew);
  defineEx("tabedit", "tabe", tabNew);
  defineEx("tabnext", "tabn", () => void runCommand("tab.next"));
  defineEx("tabprevious", "tabp", () => void runCommand("tab.previous"));
  defineEx("Explore", "Ex", () => {
    if (!useSettings.getState().sidebarVisible) void runCommand("view.toggleSidebar");
    // The tree renders right after when the sidebar was hidden.
    setTimeout(() => {
      const row = document.querySelector<HTMLElement>("[data-tree] [tabindex='0']")
        ?? document.querySelector<HTMLElement>("[data-tree] [tabindex]");
      row?.focus();
    }, 50);
  });
  defineEx("theme", "theme", (cm: CM, params: ExParams) => {
    const [name, mode] = (params.args ?? []).map((a) => a.toLowerCase());
    if (!name) {
      message(cm, `${COLORSCHEMES[useSettings.getState().scheme].name}, ${useSettings.getState().colorScheme}`);
      return;
    }
    const scheme = findScheme(name);
    if (!scheme) {
      message(cm, `E185: Cannot find color scheme '${name}'`, true);
      return;
    }
    void runCommand(COLORSCHEMES[scheme].command);
    if (mode === "light" || mode === "dark" || mode === "system") void runCommand(`theme.${mode}`);
  });

  // gt / gT, like Vim's tab keys, through the same commands.
  Vim.map("gt", ":tabnext<CR>", "normal");
  Vim.map("gT", ":tabprevious<CR>", "normal");
}

/** A colorscheme by id or name, or the first whose name starts with what was typed. */
function findScheme(typed: string): SchemeId | undefined {
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = plain(typed);
  return (
    SCHEMES_BY_NAME.find((id) => plain(id) === t || plain(COLORSCHEMES[id].name) === t) ??
    SCHEMES_BY_NAME.find((id) => plain(COLORSCHEMES[id].name).startsWith(t))
  );
}

/* ---------- :set options ---------- */

/**
 * Options call back with the new value, or with `undefined` to read the
 * current one (`:set wrap?`). No default value: defining one would apply it
 * at startup over the saved settings.
 */
function defineOptions(): void {
  const boolOption = (name: string, aliases: string[], get: () => boolean, set: (on: boolean) => void) =>
    Vim.defineOption(name, undefined, "boolean", aliases, (value?: boolean) => {
      if (value === undefined) return get();
      if (value !== get()) set(value);
    });
  boolOption("wrap", [], () => getEditorOptions().wrap, (on) => setEditorOptions({ wrap: on }));
  boolOption("number", ["nu"], () => getEditorOptions().lineNumbers, (on) => setEditorOptions({ lineNumbers: on }));
  boolOption(
    "relativenumber",
    ["rnu"],
    () => useSettings.getState().relativeLineNumbers,
    () => void runCommand("editor.toggleRelativeNumbers"),
  );
  Vim.defineOption("clipboard", undefined, "string", [], (value?: string) => {
    if (value === undefined) return useSettings.getState().vimSystemClipboard ? "unnamedplus" : "";
    useSettings.getState().set({ vimSystemClipboard: value === "unnamedplus" || value === "unnamed" });
  });
}

/* ---------- Clipboard ---------- */

/** The last text exchanged with the system clipboard, to tell when another app changed it. */
let lastSynced: string | null = null;

/**
 * The extension uses `navigator.clipboard` for the `+` register, which is
 * unreliable in WebKitGTK: route it through Tauri's clipboard plugin. With
 * `clipboard=unnamedplus` (the default), yanks and deletes also go to the
 * system clipboard, and text copied in another app becomes the unnamed
 * register when Phanes gets focus back, so `p` pastes it.
 */
function setupClipboard(): void {
  const clipboard = navigator.clipboard ?? ({} as Clipboard);
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  clipboard.readText = () => readText();
  clipboard.writeText = (text: string) => {
    lastSynced = text;
    return writeText(text);
  };

  const registers = Vim.getRegisterController() as unknown as {
    pushText: (name: string | null | undefined, operator: string, text: string, linewise?: boolean, blockwise?: boolean) => void;
    unnamedRegister: { setText: (text: string, linewise?: boolean) => void };
  };
  const pushText = registers.pushText.bind(registers);
  registers.pushText = (name, operator, text, linewise, blockwise) => {
    pushText(name, operator, text, linewise, blockwise);
    const s = useSettings.getState();
    if (s.vimMode && s.vimSystemClipboard && !name && operator !== "_") {
      const copied = linewise && !text.endsWith("\n") ? `${text}\n` : text;
      lastSynced = copied;
      void writeText(copied).catch(() => {});
    }
  };

  const pull = async () => {
    const s = useSettings.getState();
    if (!s.vimMode || !s.vimSystemClipboard) return;
    let text: string;
    try {
      text = await readText();
    } catch {
      return; // empty or non-text clipboard
    }
    if (!text || text === lastSynced) return;
    lastSynced = text;
    registers.unnamedRegister.setText(text, false);
  };
  window.addEventListener("focus", () => void pull());
  document.addEventListener("focusin", (e) => {
    if ((e.target as HTMLElement | null)?.closest?.(".cm-editor")) void pull();
  });
}

let installed = false;

/** Register the Vim ex commands, mappings, options and clipboard. Once, at startup. */
export function installVim(): void {
  if (installed) return;
  installed = true;
  defineExCommands();
  defineOptions();
  setupClipboard();
  installVimCompletion();
  // Keep the editor in step with the settings.
  const apply = () => {
    const s = useSettings.getState();
    setEditorOptions({ vim: s.vimMode, relativeLineNumbers: s.relativeLineNumbers });
  };
  apply();
  useSettings.subscribe((s, prev) => {
    if (s.vimMode !== prev.vimMode || s.relativeLineNumbers !== prev.relativeLineNumbers) apply();
  });
}
