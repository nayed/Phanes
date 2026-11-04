/**
 * Development only: lets `npm run dev` run in a plain browser by faking the
 * Tauri backend, so the UI can be checked against the design screens without
 * building the Rust side. Never included in a production build.
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

type Handler = (args: Record<string, unknown>) => unknown;

const handlers: Record<string, Handler> = {
  load_app_state: () => JSON.parse(localStorage.getItem("phanes-state") ?? "null"),
  save_app_state: ({ state }) => localStorage.setItem("phanes-state", JSON.stringify(state)),
  "plugin:window|is_maximized": () => false,
  "plugin:window|is_fullscreen": () => false,
};

/** Other dev mocks (e.g. the file system) add their handlers here. */
export function addMockHandlers(more: Record<string, Handler>): void {
  Object.assign(handlers, more);
}

export async function installBrowserMock(): Promise<void> {
  mockWindows("main");
  const { installMockFs } = await import("./mockFs");
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
}
