import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/header.css";
import "./styles/sidebar.css";
import "./styles/tabs.css";
import "./styles/editor.css";
import "./styles/menu.css";
import "./styles/dialogs.css";
import { App } from "./app/App";
import { installCloseHandler, installMaximizeTracking } from "./app/lifecycle";
import { startup } from "./app/startup";
import { installTheme } from "./app/theme";
import { wireStores } from "./app/wiring";
import { installKeybindings } from "./commands/keybindings";
import { registerAllCommands } from "./commands/definitions";
import { setCommandErrorReporter } from "./commands/registry";
import { showToast } from "./state/dialogs";
import { initSettings } from "./state/settings";

async function start() {
  // In a plain browser (vite dev without Tauri), fake the backend for UI work.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    await (await import("./dev/browserMock")).installBrowserMock();
  }

  await initSettings();
  installTheme();
  wireStores();
  registerAllCommands();
  setCommandErrorReporter((err) => showToast(err instanceof Error ? err.message : String(err)));
  installKeybindings();
  await Promise.all([installCloseHandler(), installMaximizeTracking()]);

  // No browser context menu (Reload, Inspect…) except inside text fields and the editor.
  window.addEventListener("contextmenu", (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest("input, textarea, .cm-content")) e.preventDefault();
  });

  await startup();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
