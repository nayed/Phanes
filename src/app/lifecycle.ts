import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushSettings } from "../state/settings";

/** Hooks that may veto quitting (e.g. unsaved tabs). Return false to cancel. */
type QuitGuard = () => Promise<boolean>;
const guards: QuitGuard[] = [];

export function addQuitGuard(guard: QuitGuard): void {
  guards.push(guard);
}

let quitting = false;

/** Quit Phanes, asking about unsaved changes first. */
export async function quit(): Promise<void> {
  if (quitting) return;
  quitting = true;
  try {
    for (const guard of guards) {
      if (!(await guard())) return;
    }
    await flushSettings();
    await getCurrentWindow().destroy();
  } finally {
    quitting = false;
  }
}

/** Route the window manager's close request (Alt+F4, overview ✕) through `quit`. */
export async function installCloseHandler(): Promise<void> {
  await getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    void quit();
  });
}

/** Mirror the maximized state on <html> so the frame drops its rounded corners. */
export async function installMaximizeTracking(): Promise<void> {
  const win = getCurrentWindow();
  const update = async () => {
    const maximized = (await win.isMaximized()) || (await win.isFullscreen());
    document.documentElement.dataset.maximized = String(maximized);
  };
  await update();
  await win.onResized(() => void update());
}

/**
 * Who draws the title bar: Phanes in its header bar ("own", on GNOME), or the
 * desktop's window manager in the user's theme ("system", everywhere else).
 * Mirrored on <html>: with a system title bar the header bar has no window
 * buttons and the frame has square corners.
 */
export async function installTitleBarStyle(): Promise<void> {
  const style = await invoke<"own" | "system">("title_bar_style").catch(() => "own" as const);
  document.documentElement.dataset.titleBar = style;
}

/** The window's own title, shown in a system title bar, the taskbar and the window switcher. */
export function setWindowTitle(name: string | null): void {
  void getCurrentWindow()
    .setTitle(name ? `${name} — Phanes` : "Phanes")
    .catch(() => {});
}
