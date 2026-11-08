import { create } from "zustand";
import { loadAppState, saveAppState } from "../lib/appState";

export type ViewMode = "editor" | "split" | "preview";
export type ColorSchemePreference = "system" | "light" | "dark";
/** The colorschemes, each a `[data-scheme]` pair of blocks in tokens.css. */
export const SCHEME_IDS = ["github-default", "gruvbox"] as const;
export type SchemeId = (typeof SCHEME_IDS)[number];

/** What Phanes remembers about one workspace between launches. */
export interface WorkspaceMemory {
  /** Absolute paths of expanded folders in the tree. */
  expanded: string[];
  /** Absolute paths of the files open in tabs, in order. */
  tabs: string[];
  /** Absolute path of the active tab, if it was a saved file. */
  active: string | null;
}

export interface Settings {
  scheme: SchemeId;
  /** Light/dark: follow GNOME, or forced. */
  colorScheme: ColorSchemePreference;
  viewMode: ViewMode;
  sidebarVisible: boolean;
  syncScroll: boolean;
  lastWorkspace: string | null;
  workspaces: Record<string, WorkspaceMemory>;
}

const defaults: Settings = {
  scheme: "github-default",
  colorScheme: "system",
  viewMode: "split",
  sidebarVisible: true,
  syncScroll: true,
  lastWorkspace: null,
  workspaces: {},
};

interface SettingsStore extends Settings {
  loaded: boolean;
  set: (patch: Partial<Settings>) => void;
  rememberWorkspace: (root: string, patch: Partial<WorkspaceMemory>) => void;
}

export const useSettings = create<SettingsStore>((set) => ({
  ...defaults,
  loaded: false,
  set: (patch) => set(patch),
  rememberWorkspace: (root, patch) =>
    set((s) => ({
      workspaces: {
        ...s.workspaces,
        [root]: { ...emptyMemory(), ...s.workspaces[root], ...patch },
      },
    })),
}));

export function emptyMemory(): WorkspaceMemory {
  return { expanded: [], tabs: [], active: null };
}

function snapshot(s: SettingsStore): Settings {
  return {
    scheme: s.scheme,
    colorScheme: s.colorScheme,
    viewMode: s.viewMode,
    sidebarVisible: s.sidebarVisible,
    syncScroll: s.syncScroll,
    lastWorkspace: s.lastWorkspace,
    workspaces: s.workspaces,
  };
}

let saveTimer: number | undefined;

/** Load persisted settings, then save them (debounced) whenever they change. */
export async function initSettings(): Promise<void> {
  const stored = await loadAppState<Settings>();
  // A colorscheme that no longer exists (e.g. the removed "gtk") falls back to the default.
  const scheme = SCHEME_IDS.includes(stored?.scheme as SchemeId) ? stored!.scheme : defaults.scheme;
  useSettings.setState({ ...defaults, ...stored, scheme, loaded: true });
  useSettings.subscribe((s) => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveAppState(snapshot(s)), 300);
  });
}

/** Save immediately, e.g. right before quitting. */
export async function flushSettings(): Promise<void> {
  window.clearTimeout(saveTimer);
  await saveAppState(snapshot(useSettings.getState()));
}
