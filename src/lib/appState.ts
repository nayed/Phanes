import { invoke } from "@tauri-apps/api/core";

/**
 * Phanes' own persisted state (settings, last workspace, session tabs).
 * Stored by Rust as JSON in the app config directory
 * (~/.config/io.nayed.Phanes/state.json). This is not user-file access:
 * documents and folders go through `lib/fs.ts`.
 */
export async function loadAppState<T>(): Promise<Partial<T>> {
  try {
    return ((await invoke("load_app_state")) as Partial<T> | null) ?? {};
  } catch (err) {
    console.error("Could not load app state", err);
    return {};
  }
}

export async function saveAppState<T>(state: T): Promise<void> {
  try {
    await invoke("save_app_state", { state });
  } catch (err) {
    console.error("Could not save app state", err);
  }
}
