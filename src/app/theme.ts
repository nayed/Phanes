import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettings, type ColorSchemePreference } from "../state/settings";

/** The only colorscheme for now; a new one is a new `[data-scheme]` block in tokens.css. */
export const COLORSCHEME = { id: "github-default", name: "GitHub Default" } as const;

export type Mode = "light" | "dark";

/**
 * GNOME's light/dark preference, from the desktop portal via Rust
 * (src-tauri/src/system_theme.rs). WebKitGTK's `prefers-color-scheme` can't
 * be used for this: it only mirrors the GTK setting Phanes itself sets below.
 */
let systemMode: Mode = "light";

export function resolveMode(pref: ColorSchemePreference): Mode {
  return pref === "system" ? systemMode : pref;
}

/** Apply the setting; resolves once GTK uses the matching light or dark variant. */
function apply(): Promise<void> {
  const mode = resolveMode(useSettings.getState().colorScheme);
  const root = document.documentElement;
  root.dataset.scheme = COLORSCHEME.id;
  root.dataset.mode = mode;
  // Tell GTK which variant to use, so the window shadow, native dialogs and
  // WebKit's own controls (checkboxes, scrollbars) match the app.
  return invoke<void>("set_gtk_dark", { dark: mode === "dark" }).catch(() => {});
}

/**
 * Apply the setting now and whenever it, or the system preference, changes.
 * Resolves once the first frame can be drawn in final colors.
 */
export async function installTheme(): Promise<void> {
  try {
    systemMode = await invoke<Mode>("system_color_scheme");
  } catch {
    systemMode = "light";
  }
  await apply();
  useSettings.subscribe((s, prev) => {
    if (s.colorScheme !== prev.colorScheme) void apply();
  });
  await listen<Mode>("system-color-scheme", (event) => {
    systemMode = event.payload;
    void apply();
    // The window layer (tao) reacts to the same portal signal by setting GTK
    // to the system variant; re-assert ours once it has, in case Light or
    // Dark is forced in the menu.
    window.setTimeout(() => void apply(), 300);
  });
}
