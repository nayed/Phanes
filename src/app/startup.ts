import { homeDir } from "@tauri-apps/api/path";
import { pathInfo } from "../lib/fs";
import { setHomeDir } from "../lib/path";
import { showToast } from "../state/dialogs";
import { useSettings } from "../state/settings";
import { openWorkspace } from "../state/workspace";

/** Decide what to show on launch. */
export async function startup(): Promise<void> {
  try {
    setHomeDir(await homeDir());
  } catch {
    // Paths are then shown in full.
  }

  const last = useSettings.getState().lastWorkspace;
  if (last && (await pathInfo(last)).isDir) {
    try {
      await openWorkspace(last);
    } catch (err) {
      showToast(String(err instanceof Error ? err.message : err));
    }
  }
}
