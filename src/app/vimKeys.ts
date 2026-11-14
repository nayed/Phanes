/**
 * Vim keys outside the editor (docs/VIM.md, "Vim keys outside the editor"):
 * the preview and the sidebar tree turn a key press into one of these moves
 * when Vim mode is on.
 */
import { useSettings } from "../state/settings";

export type VimMove = "down" | "up" | "top" | "bottom" | "halfDown" | "halfUp" | "left" | "right";

/** How long the first `g` of `gg` waits for the second, like Vim's 'timeoutlen'. */
const G_TIMEOUT_MS = 1000;
let gAt = 0;

/** The move a key stands for, or null (Vim mode off, or another key). */
export function vimMove(e: KeyboardEvent | React.KeyboardEvent): VimMove | null {
  if (!useSettings.getState().vimMode || e.altKey || e.metaKey) return null;
  if (e.ctrlKey) {
    if (e.shiftKey) return null;
    const key = e.key.toLowerCase();
    return key === "d" ? "halfDown" : key === "u" ? "halfUp" : null;
  }
  if (e.key !== "g") gAt = 0;
  switch (e.key) {
    case "j":
      return "down";
    case "k":
      return "up";
    case "h":
      return "left";
    case "l":
      return "right";
    case "G":
      return "bottom";
    case "g": {
      const now = Date.now();
      if (now - gAt < G_TIMEOUT_MS) {
        gAt = 0;
        return "top";
      }
      gAt = now;
      return null;
    }
  }
  return null;
}
