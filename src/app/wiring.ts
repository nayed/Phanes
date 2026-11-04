import { addQuitGuard } from "./lifecycle";
import { closeAllTabs, restoreSession, settleAllUnsaved } from "../state/tabs";
import { addWorkspaceChangeGuard, onWorkspaceOpened } from "../state/workspace";

/** Connect the stores that would otherwise import each other. */
export function wireStores(): void {
  addQuitGuard(settleAllUnsaved);
  addWorkspaceChangeGuard(closeAllTabs);
  onWorkspaceOpened(restoreSession);
}
