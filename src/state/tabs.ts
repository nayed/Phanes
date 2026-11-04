import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import {
  createDoc,
  deleteDoc,
  getDocText,
  isDocDirty,
  markDocSaved,
  setDocUpdateHandler,
  showDoc,
} from "../editor/documents";
import { allowAssetDir, pathInfo, readTextFile, writeTextFile } from "../lib/fs";
import { basename, dirname, extname, isInside, join, rebase } from "../lib/path";
import { ask } from "./dialogs";
import { useEditorStatus } from "./editorStatus";
import { emptyMemory, useSettings } from "./settings";
import { refreshTree, useWorkspace } from "./workspace";

export interface Tab {
  id: string;
  /** Absolute path, or null for an untitled document. */
  path: string | null;
  /** File name, or "Untitled", "Untitled 2"… */
  title: string;
  dirty: boolean;
  /** The file's line ending, kept when saving. */
  lineEnding: "\n" | "\r\n";
}

interface TabsStore {
  tabs: Tab[];
  activeId: string | null;
}

export const useTabs = create<TabsStore>(() => ({ tabs: [], activeId: null }));

export const activeTab = (s: TabsStore = useTabs.getState()): Tab | null =>
  s.tabs.find((t) => t.id === s.activeId) ?? null;

let nextId = 1;
const newId = () => `tab-${nextId++}`;

function patchTab(id: string, patch: Partial<Tab>): void {
  useTabs.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

/* ---------- Editor updates ---------- */

setDocUpdateHandler((id, update) => {
  if (update.docChanged) {
    const dirty = isDocDirty(id);
    const tab = useTabs.getState().tabs.find((t) => t.id === id);
    if (tab && tab.dirty !== dirty) patchTab(id, { dirty });
  }
  if (id === useTabs.getState().activeId) useEditorStatus.getState().fromUpdate(update);
});

/* ---------- Opening and activating ---------- */

export function activateTab(id: string | null): void {
  useTabs.setState({ activeId: id });
  showDoc(id);
  useEditorStatus.getState().reset(id);
  rememberSession();
}

function untitledTitle(): string {
  const used = new Set(useTabs.getState().tabs.map((t) => t.title));
  if (!used.has("Untitled")) return "Untitled";
  let n = 2;
  while (used.has(`Untitled ${n}`)) n++;
  return `Untitled ${n}`;
}

/** Insert a tab after the active one and activate it. */
function addTab(tab: Tab, text: string, activate = true): void {
  createDoc(tab.id, text);
  useTabs.setState((s) => {
    const i = s.tabs.findIndex((t) => t.id === s.activeId);
    const tabs = [...s.tabs];
    tabs.splice(i < 0 ? tabs.length : i + 1, 0, tab);
    return { tabs };
  });
  if (activate) activateTab(tab.id);
}

/** A new untitled document. `path` gives it a target file (e.g. `phanes new.md`). */
export function newUntitledTab(path: string | null = null): void {
  addTab(
    { id: newId(), path, title: path ? basename(path) : untitledTitle(), dirty: false, lineEnding: "\n" },
    "",
  );
}

/** An untitled tab nobody typed in, which opening a file can replace. */
function isPristineUntitled(tab: Tab | null): boolean {
  return !!tab && tab.path === null && !tab.dirty && getDocText(tab.id) === "";
}

/** Open a file in a tab, or focus its tab if it is already open. */
export async function openFile(path: string, opts: { activate?: boolean } = {}): Promise<void> {
  const activate = opts.activate ?? true;
  const existing = useTabs.getState().tabs.find((t) => t.path === path);
  if (existing) {
    if (activate) activateTab(existing.id);
    return;
  }
  const text = await readTextFile(path);
  const root = useWorkspace.getState().root;
  if (!root || !isInside(path, root)) await allowAssetDir(dirname(path));
  const replace = activate ? activeTab() : null;
  addTab(
    {
      id: newId(),
      path,
      title: basename(path),
      dirty: false,
      lineEnding: text.includes("\r\n") ? "\r\n" : "\n",
    },
    text,
    activate,
  );
  if (replace && isPristineUntitled(replace)) removeTab(replace.id);
  rememberSession();
}

/* ---------- Saving ---------- */

/** Save a tab; untitled tabs ask for a name. Returns false if cancelled or failed. */
export async function saveTab(id: string | null = useTabs.getState().activeId): Promise<boolean> {
  const tab = useTabs.getState().tabs.find((t) => t.id === id);
  if (!tab) return false;
  if (!tab.path) return saveTabAs(tab.id);
  await write(tab, tab.path);
  return true;
}

/** Save a tab under a new name chosen in the GTK save dialog. */
export async function saveTabAs(id: string | null = useTabs.getState().activeId): Promise<boolean> {
  const tab = useTabs.getState().tabs.find((t) => t.id === id);
  if (!tab) return false;
  const root = useWorkspace.getState().root;
  const folder = tab.path ? dirname(tab.path) : (root ?? undefined);
  const name = tab.path ? basename(tab.path) : `${tab.title}.md`;
  const picked = await saveDialog({
    title: "Save As",
    defaultPath: folder ? join(folder, name) : name,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (!picked) return false;
  const path = extname(picked) ? picked : `${picked}.md`;
  // Another tab showing the file being overwritten no longer matches it.
  const other = useTabs.getState().tabs.find((t) => t.path === path && t.id !== tab.id);
  if (other) removeTab(other.id);
  await write(tab, path);
  patchTab(tab.id, { path, title: basename(path) });
  if (!root || !isInside(path, root)) await allowAssetDir(dirname(path));
  rememberSession();
  return true;
}

async function write(tab: Tab, path: string): Promise<void> {
  let text = getDocText(tab.id);
  if (tab.lineEnding === "\r\n") text = text.replace(/\n/g, "\r\n");
  const isNew = !(await pathInfo(path)).exists;
  await writeTextFile(path, text);
  markDocSaved(tab.id);
  patchTab(tab.id, { dirty: false });
  const root = useWorkspace.getState().root;
  if (isNew && root && isInside(path, root)) await refreshTree();
}

/* ---------- Closing ---------- */

function removeTab(id: string): void {
  const { tabs, activeId } = useTabs.getState();
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const rest = tabs.filter((t) => t.id !== id);
  useTabs.setState({ tabs: rest });
  deleteDoc(id);
  if (activeId === id) {
    const next = rest[Math.min(i, rest.length - 1)] ?? null;
    activateTab(next?.id ?? null);
  } else {
    rememberSession();
  }
}

/**
 * Ask what to do with unsaved changes. Returns false when the user cancels
 * (or cancels the save dialog).
 */
async function settleUnsaved(tab: Tab): Promise<boolean> {
  if (!tab.dirty) return true;
  activateTab(tab.id);
  const choice = await ask({
    heading: "Save Changes?",
    body: `“${tab.title}” has unsaved changes. Changes which are not saved will be permanently lost.`,
    buttons: [
      { id: "cancel", label: "Cancel" },
      { id: "discard", label: "Discard", appearance: "destructive" },
      { id: "save", label: "Save", appearance: "suggested" },
    ],
    cancelId: "cancel",
    defaultId: "save",
  });
  if (choice === "cancel") return false;
  if (choice === "save") return saveTab(tab.id);
  return true;
}

export async function closeTab(id: string | null = useTabs.getState().activeId): Promise<boolean> {
  const tab = useTabs.getState().tabs.find((t) => t.id === id);
  if (!tab) return false;
  if (!(await settleUnsaved(tab))) return false;
  removeTab(tab.id);
  return true;
}

/** Close every tab, asking about unsaved ones. False if the user cancelled. */
export async function closeAllTabs(): Promise<boolean> {
  for (const tab of [...useTabs.getState().tabs]) {
    const current = useTabs.getState().tabs.find((t) => t.id === tab.id);
    if (current && !(await settleUnsaved(current))) return false;
  }
  for (const tab of useTabs.getState().tabs) deleteDoc(tab.id);
  useTabs.setState({ tabs: [] });
  activateTab(null);
  return true;
}

/** Ask about unsaved changes in every tab (for quitting). False if cancelled. */
export async function settleAllUnsaved(): Promise<boolean> {
  for (const tab of useTabs.getState().tabs) {
    if (tab.dirty && !(await settleUnsaved(tab))) return false;
  }
  return true;
}

export function cycleTab(step: 1 | -1): void {
  const { tabs, activeId } = useTabs.getState();
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activateTab(tabs[(i + step + tabs.length) % tabs.length].id);
}

/* ---------- Following file changes made from the tree ---------- */

/** A file or folder was renamed: retarget the tabs inside it. */
export function onPathRenamed(from: string, to: string): void {
  useTabs.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.path && isInside(t.path, from)
        ? { ...t, path: rebase(t.path, from, to), title: basename(rebase(t.path, from, to)) }
        : t,
    ),
  }));
  rememberSession();
}

/** Tabs showing files inside `path` (a file or folder). */
export function tabsInside(path: string): Tab[] {
  return useTabs.getState().tabs.filter((t) => t.path && isInside(t.path, path));
}

/** Close tabs for files inside `path` without asking (they were trashed). */
export function dropTabsInside(path: string): void {
  for (const tab of tabsInside(path)) removeTab(tab.id);
}

/* ---------- Session ---------- */

/** Remember the open files of the workspace, to reopen them next launch. */
function rememberSession(): void {
  const root = useWorkspace.getState().root;
  if (!root) return;
  const s = useTabs.getState();
  const active = activeTab(s);
  useSettings.getState().rememberWorkspace(root, {
    tabs: s.tabs.flatMap((t) => (t.path ? [t.path] : [])),
    active: active?.path ?? null,
  });
}

/** Reopen the tabs the workspace had last time. Missing files are skipped. */
export async function restoreSession(root: string): Promise<void> {
  const memory = useSettings.getState().workspaces[root] ?? emptyMemory();
  for (const path of memory.tabs) {
    try {
      if ((await pathInfo(path)).exists) await openFile(path, { activate: false });
    } catch {
      // Unreadable files are simply not reopened.
    }
  }
  const tabs = useTabs.getState().tabs;
  const active = tabs.find((t) => t.path === memory.active) ?? tabs[0];
  if (active) activateTab(active.id);
}
