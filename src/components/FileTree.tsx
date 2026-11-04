import { ChevronDown, ChevronRight, FileText, Folder, Image } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { setTreeContextProvider } from "../commands/keybindings";
import { dirname } from "../lib/path";
import { setExpanded, toggleFolder, useWorkspace, visibleRows, type TreeRow } from "../state/workspace";

interface Props {
  /** The file open in the active tab, highlighted in the tree. */
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

/**
 * The workspace file tree (WAI-ARIA tree pattern). Arrow keys move and
 * expand/collapse, Enter opens, Home/End jump; one row is tabbable at a time.
 */
export function FileTree({ activePath, onOpenFile }: Props) {
  const { root, children, expanded, selected, menuTarget } = useWorkspace(
    useShallow((s) => ({
      root: s.root,
      children: s.children,
      expanded: s.expanded,
      selected: s.selected,
      menuTarget: s.menuTarget,
    })),
  );
  const rows = useMemo(() => visibleRows({ root, children, expanded }), [root, children, expanded]);
  const treeRef = useRef<HTMLDivElement>(null);

  // The row that takes Tab focus: the selection, else the active file, else the first row.
  const focusPath =
    rows.find((r) => r.entry.path === selected)?.entry.path ??
    rows.find((r) => r.entry.path === activePath)?.entry.path ??
    rows[0]?.entry.path;

  // Tree-scoped shortcuts (F2, Delete…) act on the focused row.
  useEffect(() => {
    setTreeContextProvider(() => {
      const s = useWorkspace.getState();
      const row = visibleRows(s).find((r) => r.entry.path === (s.selected ?? focusPath));
      return row ? { target: { path: row.entry.path, isDir: row.entry.kind === "directory" } } : { atRoot: true };
    });
  }, [focusPath]);

  const select = (path: string, focus = true) => {
    useWorkspace.setState({ selected: path });
    if (focus) {
      treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)?.focus();
    }
  };

  const activate = (row: TreeRow) => {
    if (row.entry.kind === "directory") void toggleFolder(row.entry.path);
    else if (row.entry.kind === "markdown") onOpenFile(row.entry.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = rows.findIndex((r) => r.entry.path === focusPath);
    const row = rows[i];
    if (!row) return;
    const move = (to: number) => {
      e.preventDefault();
      const target = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (target) select(target.entry.path);
    };
    switch (e.key) {
      case "ArrowDown":
        return move(i + 1);
      case "ArrowUp":
        return move(i - 1);
      case "Home":
        return move(0);
      case "End":
        return move(rows.length - 1);
      case "ArrowRight":
        e.preventDefault();
        if (row.entry.kind !== "directory") return;
        if (!row.expanded) void setExpanded(row.entry.path, true);
        else if (rows[i + 1]?.depth > row.depth) select(rows[i + 1].entry.path);
        return;
      case "ArrowLeft": {
        e.preventDefault();
        if (row.expanded) return void setExpanded(row.entry.path, false);
        const parent = dirname(row.entry.path);
        if (rows.some((r) => r.entry.path === parent)) select(parent);
        return;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        return activate(row);
    }
  };

  return (
    <div
      ref={treeRef}
      role="tree"
      aria-label="Files"
      className="file-tree"
      data-tree
      onKeyDown={onKeyDown}
    >
      {rows.map((row) => {
        const { entry, depth } = row;
        const isDir = entry.kind === "directory";
        const Icon = isDir ? Folder : entry.kind === "image" ? Image : FileText;
        const active = entry.path === activePath;
        return (
          <div
            key={entry.path}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={isDir ? row.expanded : undefined}
            aria-selected={entry.path === selected}
            aria-current={active ? "page" : undefined}
            tabIndex={entry.path === focusPath ? 0 : -1}
            data-path={entry.path}
            className="tree-row"
            data-active={active || undefined}
            data-menu-target={entry.path === menuTarget || undefined}
            style={{ paddingLeft: 6 + depth * 18 }}
            onFocus={() => entry.path !== selected && useWorkspace.setState({ selected: entry.path })}
            onClick={() => {
              select(entry.path, false);
              activate(row);
            }}
          >
            <span className="tree-chevron" aria-hidden>
              {isDir && (row.expanded ? <ChevronDown size={12} strokeWidth={2.5} /> : <ChevronRight size={12} strokeWidth={2.5} />)}
            </span>
            <Icon size={15} className="tree-icon" aria-hidden />
            <span className="tree-name">{entry.name}</span>
          </div>
        );
      })}
    </div>
  );
}
