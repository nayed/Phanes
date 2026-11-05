import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { useSettings, type ColorSchemePreference, type SchemeId } from "../state/settings";

/**
 * Colorschemes. Each is a `[data-scheme]` block in tokens.css; "gtk" fills
 * its block from the user's GTK theme at runtime.
 */
export const COLORSCHEMES: Record<SchemeId, { name: string }> = {
  "github-default": { name: "GitHub Default" },
  gtk: { name: "GTK Theme" },
};

export type Mode = "light" | "dark";

/** What the status bar and About show: the scheme, and the GTK theme's name when used. */
export const useThemeInfo = create<{ label: string }>(() => ({ label: COLORSCHEMES["github-default"].name }));

/**
 * GNOME's light/dark preference, from the desktop portal via Rust
 * (src-tauri/src/system_theme.rs). WebKitGTK's `prefers-color-scheme` can't
 * be used for this: it only mirrors the GTK setting Phanes itself sets below.
 */
let systemMode: Mode = "light";

export function resolveMode(pref: ColorSchemePreference): Mode {
  return pref === "system" ? systemMode : pref;
}

/* ---------- GTK Theme colors ---------- */

let gtkKeys: string[] = [];
let gtkRequest = 0;

/** Read the GTK theme's colors (in its current light/dark variant) into --gtk-* variables. */
async function loadGtkColors(): Promise<void> {
  const request = ++gtkRequest;
  let colors: Record<string, string> = {};
  try {
    colors = await invoke<Record<string, string>>("gtk_theme_colors");
  } catch (err) {
    console.error("Could not read the GTK theme", err);
  }
  if (request !== gtkRequest || useSettings.getState().scheme !== "gtk") return;
  const style = document.documentElement.style;
  for (const key of gtkKeys) style.removeProperty(`--gtk-${key}`);
  gtkKeys = Object.keys(colors).filter((k) => k !== "name");
  for (const key of gtkKeys) style.setProperty(`--gtk-${key}`, colors[key]);
  useThemeInfo.setState({ label: colors.name ? `GTK: ${colors.name}` : COLORSCHEMES.gtk.name });
}

function clearGtkColors(): void {
  gtkRequest++;
  const style = document.documentElement.style;
  for (const key of gtkKeys) style.removeProperty(`--gtk-${key}`);
  gtkKeys = [];
}

/* ---------- Applying ---------- */

/** Apply the settings; resolves once GTK uses the right variant and, for the GTK scheme, its colors are in. */
function apply(): Promise<void> {
  const { scheme, colorScheme } = useSettings.getState();
  const mode = resolveMode(colorScheme);
  const root = document.documentElement;
  root.dataset.scheme = scheme;
  root.dataset.mode = mode;
  // Tell GTK which variant to use, so the window shadow, native dialogs and
  // WebKit's own controls (checkboxes, scrollbars) match the app. With the
  // GTK scheme, this also picks the theme's light or dark colors.
  const gtkVariant = invoke<void>("set_gtk_dark", { dark: mode === "dark" }).catch(() => {});
  if (scheme === "gtk") return gtkVariant.then(loadGtkColors);
  clearGtkColors();
  useThemeInfo.setState({ label: COLORSCHEMES[scheme].name });
  return gtkVariant;
}

let gtkTimer: number | undefined;

/**
 * Apply the settings now and whenever they, the system preference or the GTK
 * theme change. Resolves once the first frame can be drawn in final colors.
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
  // The GTK theme, or its light/dark variant, changed: re-read its colors.
  await listen("gtk-theme-changed", () => {
    if (useSettings.getState().scheme !== "gtk") return;
    window.clearTimeout(gtkTimer);
    gtkTimer = window.setTimeout(() => void loadGtkColors(), 50);
  });
}
