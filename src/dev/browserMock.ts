/**
 * Development only: lets `npm run dev` run in a plain browser by faking the
 * Tauri backend, so the UI can be checked against the design screens without
 * building the Rust side. Never included in a production build.
 */
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Handler = (args: Record<string, unknown>) => unknown;

/** In the browser, the system preference comes from prefers-color-scheme. */
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const handlers: Record<string, Handler> = {
  load_app_state: () => JSON.parse(localStorage.getItem("phanes-state") ?? "null"),
  save_app_state: ({ state }) => localStorage.setItem("phanes-state", JSON.stringify(state)),
  launch_paths: () => [],
  system_color_scheme: () => (systemDark.matches ? "dark" : "light"),
  // GTK's light/dark variant only affects native parts a browser doesn't have.
  set_gtk_dark: () => null,
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
