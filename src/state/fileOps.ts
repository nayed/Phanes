import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { CommandContext } from "../commands/registry";
import { focusEditor } from "../editor/documents";
import { createDir, createFile, duplicatePath, pathInfo, renamePath, revealPath, trashPath } from "../lib/fs";
import { basename, dirname, extname, isInside, join, rebase } from "../lib/path";
import { ask, showToast } from "./dialogs";
import { activeTab, dropTabsInside, newUntitledTab, onPathRenamed, openFile, tabsInside } from "./tabs";
import { refreshTree, setExpanded, useWorkspace } from "./workspace";

/** The folder new items go into for a command context. */
function targetFolder(ctx: CommandContext): string | null {
  const root = useWorkspace.getState().root;
  if (!root) return null;
  if (ctx.target) return ctx.target.isDir ? ctx.target.path : dirname(ctx.target.path);
  return root;
}

async function freeName(folder: string, base: string, ext: string): Promise<string> {
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}${ext}` : `${base} ${n}${ext}`;
    if (!(await pathInfo(join(folder, name))).exists) return join(folder, name);
  }
}

/**
 * New File / New Folder: create it inside the target folder (or next to the
 * target file), then start renaming it inline. Without a workspace, New File
 * opens an untitled tab instead.
 */
export async function createItem(kind: "file" | "folder", ctx: CommandContext): Promise<void> {
  const folder = targetFolder(ctx);
  if (!folder) {
    if (kind === "file") newUntitledTab();
    return;
  }
  const path = kind === "file" ? await freeName(folder, "Untitled", ".md") : await freeName(folder, "New Folder", "");
  if (kind === "file") await createFile(path);
  else await createDir(path);
  const root = useWorkspace.getState().root;
  if (folder !== root) await setExpanded(folder, true);
  await refreshTree();
  useWorkspace.setState({ selected: path, renaming: { path, isNew: true } });
}

export function startRename(path: string): void {
  useWorkspace.setState({ selected: path, renaming: { path, isNew: false } });
}

export function cancelRename(): void {
  const renaming = useWorkspace.getState().renaming;
  useWorkspace.setState({ renaming: null });
  // A new file keeps its default name and opens, like a committed rename.
  if (renaming?.isNew && /\.(md|markdown)$/i.test(renaming.path)) void openFile(renaming.path);
}

/** Validate a file name typed in the tree. Returns an error message or null. */
export function checkName(name: string): string | null {
  if (!name.trim()) return "The name cannot be empty.";
  if (name.includes("/")) return "The name cannot contain “/”.";
  if (name === "." || name === "..") return `“${name}” is not a valid name.`;
  return null;
}

/** Apply an inline rename. */
export async function commitRename(newName: string): Promise<void> {
  const renaming = useWorkspace.getState().renaming;
  if (!renaming) return;
  const { path: from, isNew } = renaming;
  let name = newName.trim();
  const problem = checkName(name);
  if (problem) {
    showToast(problem);
    return;
  }
  const isDir = (await pathInfo(from)).isDir;
  // New files are markdown: "ideas" becomes "ideas.md".
  if (isNew && !isDir && !extname(name)) name += ".md";
  const to = join(dirname(from), name);
  useWorkspace.setState({ renaming: null });
  if (to !== from) {
    try {
      await renamePath(from, to);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
      useWorkspace.setState({ renaming });
      return;
    }
    onPathRenamed(from, to);
    useWorkspace.setState((s) => ({
      expanded: s.expanded.map((p) => (isInside(p, from) ? rebase(p, from, to) : p)),
      selected: to,
    }));
    await refreshTree();
  }
  if (isNew && !isDir && /\.(md|markdown)$/i.test(to)) {
    await openFile(to);
    focusEditor();
  }
}

export async function duplicateItem(path: string): Promise<void> {
  const copy = await duplicatePath(path);
  await refreshTree();
  useWorkspace.setState({ selected: copy });
}

/** Copy an item's absolute path; without a target, the active file's. */
export async function copyPath(ctx: CommandContext): Promise<void> {
  const path = ctx.target?.path ?? activeTab()?.path;
  if (!path) return;
  await writeText(path);
  showToast(`Copied ${path}`);
}

export async function revealItem(path: string): Promise<void> {
  await revealPath(path);
}

/** Move to the system trash. Tabs for it close, asking first if they have unsaved changes. */
export async function trashItem(path: string): Promise<void> {
  const dirty = tabsInside(path).filter((t) => t.dirty);
  if (dirty.length) {
    const what = dirty.length === 1 ? `“${dirty[0].title}” has` : `${dirty.length} open files have`;
    const choice = await ask({
      heading: "Move to Trash?",
      body: `${what} unsaved changes, which will be lost.`,
      buttons: [
        { id: "cancel", label: "Cancel" },
        { id: "trash", label: "Move to Trash", appearance: "destructive" },
      ],
      cancelId: "cancel",
    });
    if (choice !== "trash") return;
  }
  // Keep keyboard focus in the tree on a neighbor.
  const neighbor = neighborOf(path);
  await trashPath(path);
  dropTabsInside(path);
  useWorkspace.setState({ selected: neighbor });
  await refreshTree();
  showToast(`Moved “${basename(path)}” to the trash`);
}

function neighborOf(path: string): string | null {
  const rows = document.querySelectorAll<HTMLElement>("[data-tree] [role=treeitem]");
  const list = [...rows].map((r) => r.dataset.path ?? "");
  const i = list.indexOf(path);
  const after = list.slice(i + 1).find((p) => !isInside(p, path));
  return after ?? (i > 0 ? list[i - 1] : null);
}
