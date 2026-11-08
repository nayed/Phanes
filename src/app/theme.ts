import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettings, type ColorSchemePreference, type SchemeId } from "../state/settings";

/**
 * Colorscheme names. Adding one: its id in SCHEME_IDS (state/settings.ts), a
 * light and a dark `[data-scheme]` block in tokens.css, its code themes in
 * markdown/plugins/highlight.ts and preview.css, and a command in the menus.
 */
export const COLORSCHEMES: Record<SchemeId, { name: string }> = {
  "github-default": { name: "GitHub Default" },
  gruvbox: { name: "Gruvbox" },
};

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

/** Apply the settings; resolves once GTK uses the matching light or dark variant. */
function apply(): Promise<void> {
  const { scheme, colorScheme } = useSettings.getState();
  const mode = resolveMode(colorScheme);
  const root = document.documentElement;
  root.dataset.scheme = scheme;
  root.dataset.mode = mode;
  // Tell GTK which variant to use, so the window shadow, native dialogs and
  // WebKit's own controls (checkboxes, scrollbars) match the app.
  return invoke<void>("set_gtk_dark", { dark: mode === "dark" }).catch(() => {});
}

/**
 * Apply the settings now and whenever they, or the system preference, change.
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
    if (s.colorScheme !== prev.colorScheme || s.scheme !== prev.scheme) void apply();
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
