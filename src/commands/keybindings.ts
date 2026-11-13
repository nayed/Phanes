import { getView } from "../editor/documents";
import { leaveInsertMode } from "../editor/vim";
import { useSettings } from "../state/settings";
import {
  listCommands,
  runCommand,
  type Command,
  type CommandContext,
} from "./registry";

/**
 * Keyboard shortcuts, derived from the command registry.
 *
 * Shortcuts are written in GNOME notation ("Shift+Ctrl+N", "Ctrl+?", "F2").
 * Letters match the character typed (so Ctrl+W follows the keyboard layout);
 * digits match the physical key, so Ctrl+1 also works on AZERTY.
 */

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const named: Record<string, string> = {
  pageup: "PageUp",
  pagedown: "PageDown",
  delete: "Delete",
  tab: "Tab",
  enter: "Enter",
  escape: "Escape",
};

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+");
  // "Ctrl++" style is not used; the key is the last part.
  const key = parts.pop() ?? "";
  const mods = parts.map((p) => p.toLowerCase());
  return {
    ctrl: mods.includes("ctrl"),
    shift: mods.includes("shift"),
    alt: mods.includes("alt"),
    key: named[key.toLowerCase()] ?? key,
  };
}

function matches(e: KeyboardEvent, s: ParsedShortcut): boolean {
  if (e.ctrlKey !== s.ctrl || e.altKey !== s.alt || e.metaKey) return false;
  const k = s.key;
  // Digits: compare the physical key.
  if (/^[0-9]$/.test(k)) {
    return e.shiftKey === s.shift && e.code === `Digit${k}`;
  }
  // Single letters: compare the typed letter, case-insensitively.
  if (/^[a-z]$/i.test(k)) {
    return e.shiftKey === s.shift && e.key.toLowerCase() === k.toLowerCase();
  }
  // Symbols such as "?" need Shift on most layouts; ignore Shift for them.
  if (k.length === 1) {
    return e.key === k;
  }
  // Named keys: Tab, PageUp, Delete, F2…
  return e.shiftKey === s.shift && e.key === k;
}

/** Whether keyboard focus is inside the workspace tree. */
export function treeHasFocus(): boolean {
  return !!document.activeElement?.closest("[data-tree]");
}

/** Whether keyboard focus is in a text field where plain keys must not be stolen. */
function inTextField(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

type ContextProvider = () => CommandContext;
let treeContext: ContextProvider = () => ({});

/** The tree tells the keybindings which item is focused, for tree-scoped commands. */
export function setTreeContextProvider(fn: ContextProvider): void {
  treeContext = fn;
}

/** Modal UI (dialogs, menus) can suspend global shortcuts while open. */
let suspended = 0;
export function suspendShortcuts(): () => void {
  suspended++;
  return () => {
    suspended--;
  };
}

/**
 * Keys Vim uses that would otherwise run an app command (docs/VIM.md): with
 * Vim mode on and the editor focused, they go to Vim. Ctrl+S, Ctrl+Tab,
 * Ctrl+1/2/3, F9, Ctrl+Q… stay app shortcuts.
 */
const VIM_CTRL_KEYS = new Set(["w", "v", "r", "o", "n", "d", "u", "f", "b", "a", "x"]);

function editorHasFocus(): boolean {
  return !!document.activeElement?.closest(".cm-editor");
}

function vimClaims(e: KeyboardEvent): boolean {
  if (!useSettings.getState().vimMode) return false;
  if (!editorHasFocus()) return false;
  if (e.key === "Escape") return true;
  return e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && VIM_CTRL_KEYS.has(e.key.toLowerCase());
}

function onKeyDown(e: KeyboardEvent): void {
  if (suspended > 0 || e.defaultPrevented || e.isComposing) return;
  if (vimClaims(e)) return;
  const inTree = treeHasFocus();
  for (const command of listCommands()) {
    const shortcuts = [command.shortcut, ...(command.altShortcuts ?? [])].filter(
      (s): s is string => !!s,
    );
    for (const shortcut of shortcuts) {
      const parsed = parseShortcut(shortcut);
      if (!matches(e, parsed)) continue;
      if (!isActive(command, parsed, inTree)) continue;
      e.preventDefault();
      e.stopPropagation();
      // Saving from Insert mode also leaves it, like `<Esc>:w` (docs/VIM.md).
      if (command.id === "file.save" && useSettings.getState().vimMode && editorHasFocus()) {
        leaveInsertMode(getView());
      }
      void runCommand(command.id, inTree ? treeContext() : {});
      return;
    }
  }
}

function isActive(command: Command, s: ParsedShortcut, inTree: boolean): boolean {
  if (command.scope === "tree" && !inTree) return false;
  // Unmodified keys (F2, Delete) never fire while typing in a field.
  if (!s.ctrl && !s.alt && inTextField()) return false;
  return true;
}

export function installKeybindings(): () => void {
  // Capture phase, so app shortcuts win over the editor's own keymap.
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
