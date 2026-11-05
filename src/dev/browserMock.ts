/**
 * Development only: lets `npm run dev` run in a plain browser by faking the
 * Tauri backend, so the UI can be checked against the design screens without
 * building the Rust side. Never included in a production build.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Handler = (args: Record<string, unknown>) => unknown;

/** Values a Gruvbox GTK theme reports, to try the GTK Theme colorscheme in a browser. */
const GRUVBOX_LIGHT = {
  name: "Gruvbox-Light-Medium (mock)",
  bg: "#fbf1c7", fg: "rgba(40, 40, 40, 0.87)", base: "#ebdbb2", text: "rgba(40, 40, 40, 0.87)",
  "selected-bg": "#45707a", "selected-fg": "#fbf1c7", borders: "rgba(40, 40, 40, 0.12)",
  error: "#ea6962", "view-bg": "#ebdbb2", "header-bg": "#fbf1c7",
  "wc-minimize-bg": "#c35e0a", "wc-maximize-bg": "#6c782e", "wc-close-bg": "#c14a4a",
  "wc-fg": "rgba(0, 0, 0, 0)", "wc-hover-fg": "#282828", "wc-size": "16px", "wc-gap": "6px",
};
const GRUVBOX_DARK = {
  name: "Gruvbox-Light-Medium (mock)",
  bg: "#282828", fg: "#fbf1c7", base: "#282524", text: "#fbf1c7",
  "selected-bg": "#7daea3", "selected-fg": "rgba(40, 40, 40, 0.87)", borders: "rgba(251, 241, 199, 0.12)",
  error: "#c14a4a", "view-bg": "#282524", "header-bg": "#282828",
  "wc-minimize-bg": "#e78a4e", "wc-maximize-bg": "#a9b665", "wc-close-bg": "#ea6962",
  "wc-fg": "rgba(0, 0, 0, 0)", "wc-hover-fg": "#282828", "wc-size": "16px", "wc-gap": "6px",
};
let gtkDark = false;

/** In the browser, the system preference comes from prefers-color-scheme. */
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const handlers: Record<string, Handler> = {
  load_app_state: () => JSON.parse(localStorage.getItem("phanes-state") ?? "null"),
  save_app_state: ({ state }) => localStorage.setItem("phanes-state", JSON.stringify(state)),
  launch_paths: () => [],
  system_color_scheme: () => (systemDark.matches ? "dark" : "light"),
  gtk_theme_colors: () => (gtkDark ? GRUVBOX_DARK : GRUVBOX_LIGHT),
  "plugin:window|set_theme": ({ value }) => {
    gtkDark = value === "dark";
    void emit("gtk-theme-changed");
  },
  "plugin:window|is_maximized": () => false,
  "plugin:window|is_fullscreen": () => false,
};

/** Other dev mocks (e.g. the file system) add their handlers here. */
export function addMockHandlers(more: Record<string, Handler>): void {
  Object.assign(handlers, more);
}

export async function installBrowserMock(): Promise<void> {
  mockWindows("main");
  const { installMockFs, mockImageUrl } = await import("./mockFs");
  installMockFs(addMockHandlers);
  mockIPC(
    (cmd, payload) => {
      const handler = handlers[cmd];
      if (handler) return handler((payload ?? {}) as Record<string, unknown>);
      if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) return null;
      console.warn("[browser mock] unhandled command", cmd, payload);
      return null;
    },
    { shouldMockEvents: true },
  );
  systemDark.addEventListener("change", () => {
    void emit("system-color-scheme", systemDark.matches ? "dark" : "light");
  });
  // Images of the sample workspace are served by Vite instead of the asset protocol.
  const internals = (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (p: string) => string } })
    .__TAURI_INTERNALS__;
  internals.convertFileSrc = (path) => mockImageUrl(path) ?? path;
}
