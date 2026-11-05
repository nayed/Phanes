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
