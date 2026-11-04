import { homeDir } from "@tauri-apps/api/path";
import { pathInfo } from "../lib/fs";
import { launchPaths } from "../lib/launch";
import { dirname, setHomeDir } from "../lib/path";
import { showToast } from "../state/dialogs";
import { useSettings } from "../state/settings";
import { newUntitledTab, openFile } from "../state/tabs";
import { openWorkspace } from "../state/workspace";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Decide what to show on launch:
 *   phanes            → the last workspace and its tabs
 *   phanes notes.md   → the file, with its folder as the workspace
 *   phanes ~/notes    → the folder as the workspace
 * A path that does not exist opens as a new unsaved file at that path.
 */
export async function startup(): Promise<void> {
  try {
    setHomeDir(await homeDir());
  } catch {
    // Paths are then shown in full.
  }

  const args = await launchPaths().catch(() => []);
  if (args.length) {
    const first = args[0];
    const workspace = first.isDir ? first.path : dirname(first.path);
    try {
      if ((await pathInfo(workspace)).isDir) await openWorkspace(workspace);
    } catch (err) {
      showToast(message(err));
    }
    for (const arg of args) {
      if (arg.isDir) continue;
      try {
        if (arg.exists) await openFile(arg.path);
        else newUntitledTab(arg.path);
      } catch (err) {
        showToast(message(err));
      }
    }
    return;
  }

  const last = useSettings.getState().lastWorkspace;
  if (last && (await pathInfo(last)).isDir) {
    try {
      await openWorkspace(last);
    } catch (err) {
      showToast(message(err));
    }
  }
}
