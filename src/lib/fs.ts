import { invoke } from "@tauri-apps/api/core";

/**
 * The only module that talks to Rust about files (src-tauri/src/fs.rs).
 * Components and stores never touch the file system any other way.
 */

export type EntryKind = "directory" | "markdown" | "image" | "other";

export interface Entry {
  name: string;
  path: string;
  kind: EntryKind;
}

export interface PathInfo {
  exists: boolean;
  isDir: boolean;
}

/** Errors from Rust arrive as strings; turn them into Errors. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/** Folders first, then files, each sorted case-insensitively; dotfiles hidden. */
export const listDir = (path: string) => call<Entry[]>("list_dir", { path });
export const pathInfo = (path: string) => call<PathInfo>("path_info", { path });
export const readTextFile = (path: string) => call<string>("read_text_file", { path });
export const writeTextFile = (path: string, contents: string) =>
  call<void>("write_text_file", { path, contents });
export const createFile = (path: string) => call<void>("create_file", { path });
export const createDir = (path: string) => call<void>("create_dir", { path });
/** Never overwrites an existing item. */
export const renamePath = (from: string, to: string) => call<void>("rename_path", { from, to });
/** Copies next to the original ("name copy.md") and returns the new path. */
export const duplicatePath = (path: string) => call<string>("duplicate_path", { path });
/** Moves to the system trash, never a permanent delete. */
export const trashPath = (path: string) => call<void>("trash_path", { path });
/** Shows the item in GNOME Files. */
export const revealPath = (path: string) => call<void>("reveal_path", { path });
/** Checks a folder, returns its canonical path, and allows the preview to load its images. */
export const openWorkspaceDir = (path: string) => call<string>("open_workspace", { path });
/** Allows the preview to load images from a folder outside the workspace. */
export const allowAssetDir = (path: string) => call<void>("allow_asset_dir", { path });
