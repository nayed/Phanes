/**
 * The command registry. Every user action is defined once here with an id,
 * a label, an optional shortcut and a handler. The main menu, the tree's
 * right-click menu, keyboard shortcuts and (later) the command palette all
 * read from it.
 */

export type CommandId =
  | "workspace.open"
  | "file.new"
  | "folder.new"
  | "file.save"
  | "file.saveAs"
  | "item.rename"
  | "item.duplicate"
  | "item.copyPath"
  | "item.reveal"
  | "item.trash"
  | "tab.new"
  | "tab.close"
  | "tab.next"
  | "tab.previous"
  | "view.editor"
  | "view.split"
  | "view.preview"
  | "view.toggleSidebar"
  | "view.toggleSyncScroll"
  | "editor.toggleVim"
  | "editor.toggleVimClipboard"
  | "editor.toggleRelativeNumbers"
  | "scheme.githubDefault"
  | "scheme.gruvbox"
  | "scheme.catppuccin"
  | "scheme.everforest"
  | "theme.system"
  | "theme.light"
  | "theme.dark"
  | "theme.cycle"
  | "app.shortcuts"
  | "app.about"
  | "app.quit";

/** An item of the workspace tree a command acts on. */
export interface TreeTarget {
  path: string;
  isDir: boolean;
}

export interface CommandContext {
  /** The tree item the command was invoked on (right-click or focused row). */
  target?: TreeTarget;
  /** Explicitly the workspace root (right-click on empty tree space). */
  atRoot?: boolean;
}

/** Where a shortcut is active. */
export type ShortcutScope = "global" | "tree";

export interface Command {
  id: CommandId;
  label: string;
  /** Shortcut in GNOME notation, e.g. "Shift+Ctrl+N". */
  shortcut?: string;
  /** Extra shortcuts that trigger the command but are not displayed. */
  altShortcuts?: string[];
  scope?: ShortcutScope;
  /** Shown in the danger color in menus. */
  danger?: boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
  isEnabled?: (ctx: CommandContext) => boolean;
  /** For toggles and radio items in menus. */
  isChecked?: () => boolean;
}

const commands = new Map<CommandId, Command>();

export function registerCommands(list: Command[]): void {
  for (const c of list) commands.set(c.id, c);
}

export function getCommand(id: CommandId): Command {
  const c = commands.get(id);
  if (!c) throw new Error(`Unknown command: ${id}`);
  return c;
}

export function hasCommand(id: CommandId): boolean {
  return commands.has(id);
}

export function listCommands(): Command[] {
  return [...commands.values()];
}

export function isCommandEnabled(id: CommandId, ctx: CommandContext = {}): boolean {
  const c = commands.get(id);
  return !!c && (c.isEnabled ? c.isEnabled(ctx) : true);
}

export async function runCommand(id: CommandId, ctx: CommandContext = {}): Promise<void> {
  const c = getCommand(id);
  if (c.isEnabled && !c.isEnabled(ctx)) return;
  try {
    await c.run(ctx);
  } catch (err) {
    console.error(`Command ${id} failed`, err);
    reportError?.(err);
  }
}

let reportError: ((err: unknown) => void) | undefined;

/** Let the UI show failures of commands (e.g. as a toast). */
export function setCommandErrorReporter(fn: (err: unknown) => void): void {
  reportError = fn;
}
