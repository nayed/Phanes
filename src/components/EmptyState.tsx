import { FilePlus, FolderOpen } from "lucide-react";
import { runCommand } from "../commands/registry";
import { useWorkspace } from "../state/workspace";
import appIcon from "../../docs/icons/io.nayed.Phanes-symbolic.svg";

/** Shown in place of the editor when no tab is open. */
export function EmptyState() {
  const root = useWorkspace((s) => s.root);
  return (
    <div className="empty-state">
      <span className="empty-icon" style={{ maskImage: `url("${appIcon}")`, WebkitMaskImage: `url("${appIcon}")` }} aria-hidden />
      <h2>No Open Files</h2>
      <p>{root ? "Pick a file in the sidebar, or start a new document." : "Open a folder of markdown files, or start a new document."}</p>
      <div className="empty-actions">
        {!root && (
          <button type="button" className="pill-button suggested" onClick={() => void runCommand("workspace.open")}>
            <FolderOpen size={15} aria-hidden />
            Open Folder…
          </button>
        )}
        <button type="button" className="pill-button" onClick={() => void runCommand("tab.new")}>
          <FilePlus size={15} aria-hidden />
          New Document
        </button>
      </div>
    </div>
  );
}
