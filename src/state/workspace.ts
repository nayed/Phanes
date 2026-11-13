import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { listDir, openWorkspaceDir, pathInfo, type Entry } from "../lib/fs";
import { isInside } from "../lib/path";
import { emptyMemory, useSettings } from "./settings";

/** The workspace folder and its file tree. */
interface WorkspaceStore {
  root: string | null;
  /** Loaded folder listings, by folder path. */
  children: Record<string, Entry[]>;
  /** Expanded folders (absolute paths). */
  expanded: string[];
  /** The tree row with keyboard focus / selection. */
  selected: string | null;
  /** The row whose right-click menu is open. */
  menuTarget: string | null;
  /** The row being renamed inline, if any. */
  renaming: { path: string; isNew: boolean } | null;
}

export const useWorkspace = create<WorkspaceStore>(() => ({
  root: null,
  children: {},
  expanded: [],
  selected: null,
  menuTarget: null,
  renaming: null,
}));

type Listener = (root: string) => void | Promise<void>;
const openListeners: Listener[] = [];

/** Run something each time a workspace is opened (e.g. restoring its tabs). */
export function onWorkspaceOpened(listener: Listener): void {
  openListeners.push(listener);
}

type Guard = () => Promise<boolean>;
const changeGuards: Guard[] = [];

/** Run before switching to another workspace; returning false cancels (e.g. unsaved tabs). */
export function addWorkspaceChangeGuard(guard: Guard): void {
  changeGuards.push(guard);
}

/**
 * Make `path` the workspace: load its tree, remember it, restore its
 * expanded folders and (through listeners) its tabs. Returns false if the
 * switch was canceled.
 */
export async function openWorkspace(path: string): Promise<boolean> {
  const root = await openWorkspaceDir(path);
  const current = useWorkspace.getState().root;
  if (current === root) return true;
  if (current) {
    for (const guard of changeGuards) if (!(await guard())) return false;
  }
  const memory = useSettings.getState().workspaces[root] ?? emptyMemory();
  useWorkspace.setState({
    root,
    children: {},
    expanded: memory.expanded.filter((p) => isInside(p, root)),
    selected: null,
    menuTarget: null,
    renaming: null,
  });
  useSettings.getState().set({ lastWorkspace: root, recentWorkspaces: withRecent(root) });
  await refreshTree();
  for (const listener of openListeners) await listener(root);
  return true;
}

/** How many folders the Recent Folders submenu lists, besides the open one. */
export const RECENT_SHOWN = 5;

/** The recent list with `root` moved to the front. */
function withRecent(root: string): string[] {
  const rest = useSettings.getState().recentWorkspaces.filter((p) => p !== root);
  return [root, ...rest].slice(0, RECENT_SHOWN + 1);
}

/** Open a folder from the recent list; one that can't be opened anymore leaves the list. */
export async function openRecentWorkspace(path: string): Promise<void> {
  try {
    await openWorkspace(path);
  } catch (err) {
    const s = useSettings.getState();
    s.set({ recentWorkspaces: s.recentWorkspaces.filter((p) => p !== path) });
    throw err;
  }
}

/** Forget the recent folders, except the one open now. */
export function clearRecentWorkspaces(): void {
  const root = useWorkspace.getState().root;
  useSettings.getState().set({ recentWorkspaces: root ? [root] : [] });
}

/** Ask for a folder with GNOME's folder chooser (through the desktop portal) and open it. */
export async function chooseWorkspace(): Promise<void> {
  const current = useWorkspace.getState().root;
  const picked = await open({
    directory: true,
    multiple: false,
    title: "Open Folder",
    defaultPath: current ?? undefined,
  });
  if (typeof picked === "string") await openWorkspace(picked);
}

/**
 * Reload the root and every expanded folder. Called after any change Phanes
 * makes; folders that disappeared are dropped from the expanded set.
 */
export async function refreshTree(): Promise<void> {
  const { root, expanded } = useWorkspace.getState();
  if (!root) return;
  const stillThere: string[] = [];
  const children: Record<string, Entry[]> = {};
  const load = async (dir: string) => {
    try {
      children[dir] = await listDir(dir);
      return true;
    } catch {
      return false;
    }
  };
  await load(root);
  await Promise.all(
    expanded.map(async (dir) => {
      const info = await pathInfo(dir);
      if (info.isDir && (await load(dir))) stillThere.push(dir);
    }),
  );
  // Ignore the result if another workspace was opened meanwhile.
  if (useWorkspace.getState().root !== root) return;
  useWorkspace.setState({ children, expanded: stillThere });
  persistExpanded();
}

export async function setExpanded(dir: string, expand: boolean): Promise<void> {
  const { expanded, children } = useWorkspace.getState();
  if (expand === expanded.includes(dir)) return;
  if (!expand) {
    useWorkspace.setState({ expanded: expanded.filter((p) => p !== dir) });
    persistExpanded();
    return;
  }
  if (!children[dir]) {
    const entries = await listDir(dir);
    useWorkspace.setState((s) => ({ children: { ...s.children, [dir]: entries } }));
  }
  useWorkspace.setState((s) => ({ expanded: [...s.expanded, dir] }));
  persistExpanded();
}

export function toggleFolder(dir: string): Promise<void> {
  return setExpanded(dir, !useWorkspace.getState().expanded.includes(dir));
}

/** Expand every folder from the root down to `path`'s parent, so `path` is visible. */
export async function revealInTree(path: string): Promise<void> {
  const { root } = useWorkspace.getState();
  if (!root || !isInside(path, root) || path === root) return;
  const parts = path.slice(root.length + 1).split("/");
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = `${dir}/${part}`;
    await setExpanded(dir, true);
  }
}

function persistExpanded(): void {
  const { root, expanded } = useWorkspace.getState();
  if (root) useSettings.getState().rememberWorkspace(root, { expanded });
}

export interface TreeRow {
  entry: Entry;
  depth: number;
  expanded: boolean;
}

/** The visible rows of the tree, in order. Only markdown files, images and folders are shown. */
export function visibleRows(s: Pick<WorkspaceStore, "root" | "children" | "expanded">): TreeRow[] {
  const rows: TreeRow[] = [];
  if (!s.root) return rows;
  const expanded = new Set(s.expanded);
  const walk = (dir: string, depth: number) => {
    for (const entry of s.children[dir] ?? []) {
      if (entry.kind === "other") continue;
      const isOpen = entry.kind === "directory" && expanded.has(entry.path);
      rows.push({ entry, depth, expanded: isOpen });
      if (isOpen) walk(entry.path, depth + 1);
    }
  };
  walk(s.root, 0);
  return rows;
}
