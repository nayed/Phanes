import { create } from "zustand";

/** What the status bar's mode pill says (docs/VIM.md). */
export type VimMode = "NORMAL" | "INSERT" | "VISUAL" | "V-LINE" | "V-BLOCK" | "REPLACE" | "COMMAND";

interface VimStatus {
  mode: VimMode;
  /** Keys typed so far in a pending command, such as `2d` or `"a`. */
  pending: string;
  /** The register a macro is being recorded into, or null. */
  recording: string | null;
}

/** The Vim state of the editor view, which shows the active tab. */
export const useVimStatus = create<VimStatus>(() => ({ mode: "NORMAL", pending: "", recording: null }));
