import { FolderOpen, FolderPlus } from "lucide-react";
import { runCommand } from "../commands/registry";
import { tildify } from "../lib/path";
import { useWorkspace } from "../state/workspace";
import { FileTree } from "./FileTree";

interface Props {
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

/** The workspace sidebar: header with the folder path, then the file tree. */
export function Sidebar({ activePath, onOpenFile }: Props) {
  const root = useWorkspace((s) => s.root);

  return (
    <aside className="sidebar" aria-label="Workspace">
      <div className="sidebar-header">
        <div className="sidebar-heading">
          <span className="sidebar-label">Workspace</span>
          <span className="sidebar-path" title={root ?? undefined}>
            {root ? tildify(root) : "No folder open"}
          </span>
        </div>
        <button
          type="button"
          className="icon-button small"
          aria-label="Change workspace folder"
          title="Open Folder… (Ctrl+O)"
          onClick={() => void runCommand("workspace.open")}
        >
          <FolderPlus size={15} aria-hidden />
        </button>
      </div>
      {root ? (
        <div className="sidebar-scroll">
          <FileTree activePath={activePath} onOpenFile={onOpenFile} />
        </div>
      ) : (
        <div className="sidebar-empty">
          <p>Open a folder of markdown files to browse it here.</p>
          <button type="button" className="pill-button" onClick={() => void runCommand("workspace.open")}>
            <FolderOpen size={15} aria-hidden />
            Open Folder…
          </button>
        </div>
      )}
    </aside>
  );
}
