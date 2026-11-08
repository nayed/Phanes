import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { CommandId } from "../commands/registry";
import { useSettings, type ColorSchemePreference, type SchemeId } from "../state/settings";

/**
 * Colorschemes: name, and the command that applies it. Adding one: its id in
 * SCHEME_IDS (state/settings.ts), a light and a dark `[data-scheme]` block in
 * tokens.css, its code themes (and their backgrounds) in
 * markdown/plugins/highlight.ts and preview.css, and its command in
 * commands/ (listed in the main menu too).
 */
export const COLORSCHEMES: Record<SchemeId, { name: string; command: CommandId }> = {
  "github-default": { name: "GitHub Default", command: "scheme.githubDefault" },
  gruvbox: { name: "Gruvbox", command: "scheme.gruvbox" },
  catppuccin: { name: "Catppuccin", command: "scheme.catppuccin" },
  everforest: { name: "Everforest", command: "scheme.everforest" },
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

/** The light or dark variant on screen now (Follow System resolved to GNOME's). */
export const useAppliedMode = create<{ mode: Mode }>(() => ({ mode: "light" }));

/** A colorscheme shown on the whole window without being chosen (the picker's live preview). */
let preview: SchemeId | null = null;

/** Show a colorscheme in the current mode without saving it; null goes back to the chosen one. */
export function previewScheme(scheme: SchemeId | null): void {
  if (preview === scheme) return;
  preview = scheme;
  void apply();
}

/** Apply the settings; resolves once GTK uses the matching light or dark variant. */
function apply(): Promise<void> {
  const { scheme, colorScheme } = useSettings.getState();
  const mode = resolveMode(colorScheme);
  const root = document.documentElement;
  root.dataset.scheme = preview ?? scheme;
  root.dataset.mode = mode;
  useAppliedMode.setState({ mode });
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
