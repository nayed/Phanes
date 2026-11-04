import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings, type ColorSchemePreference } from "../state/settings";

/** The only colorscheme for now; a new one is a new `[data-scheme]` block in tokens.css. */
export const COLORSCHEME = { id: "github-default", name: "GitHub Default" } as const;

export type Mode = "light" | "dark";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function resolveMode(pref: ColorSchemePreference): Mode {
  if (pref === "system") return systemDark.matches ? "dark" : "light";
  return pref;
}

function apply(pref: ColorSchemePreference): void {
  const root = document.documentElement;
  root.dataset.scheme = COLORSCHEME.id;
  root.dataset.mode = resolveMode(pref);
  // Keep GTK (window shadow, native dialogs) in step with a forced choice.
  // When following the system, GNOME's preference already applies.
  void getCurrentWindow()
    .setTheme(pref === "system" ? null : pref)
    .catch(() => {});
}

/**
 * Follow the setting and, when it is "system", GNOME's dark style preference,
 * which WebKitGTK exposes through `prefers-color-scheme`.
 */
export function installTheme(): () => void {
  apply(useSettings.getState().colorScheme);
  const unsubscribe = useSettings.subscribe((s, prev) => {
    if (s.colorScheme !== prev.colorScheme) apply(s.colorScheme);
  });
  const onSystemChange = () => apply(useSettings.getState().colorScheme);
  systemDark.addEventListener("change", onSystemChange);
  return () => {
    unsubscribe();
    systemDark.removeEventListener("change", onSystemChange);
  };
}

/** Current resolved mode, re-rendering when it changes. */
export function useMode(): Mode {
  const pref = useSettings((s) => s.colorScheme);
  const dark = useSystemDark();
  if (pref === "system") return dark ? "dark" : "light";
  return pref;
}

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      systemDark.addEventListener("change", cb);
      return () => systemDark.removeEventListener("change", cb);
    },
    () => systemDark.matches,
  );
}
