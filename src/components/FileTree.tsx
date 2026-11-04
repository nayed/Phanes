import { ChevronDown, ChevronRight, FileText, Folder, Image } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { setTreeContextProvider } from "../commands/keybindings";
import type { CommandContext } from "../commands/registry";
import { dirname, extname } from "../lib/path";
import { cancelRename, commitRename } from "../state/fileOps";
import { setExpanded, toggleFolder, useWorkspace, visibleRows, type TreeRow } from "../state/workspace";
import { PopoverMenu, type MenuAnchor, type MenuEntry } from "./PopoverMenu";

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
  const { root, children, expanded, selected, menuTarget, renaming } = useWorkspace(
    useShallow((s) => ({
      root: s.root,
      children: s.children,
      expanded: s.expanded,
      selected: s.selected,
      menuTarget: s.menuTarget,
      renaming: s.renaming,
    })),
  );
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; ctx: CommandContext; keyboard: boolean } | null>(null);
  const closeMenu = useCallback(() => {
    setMenu(null);
    useWorkspace.setState({ menuTarget: null });
  }, []);
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

  // When a row we focused is re-created (rename, refresh), focus falls to <body>:
  // put it back on the selected row so keyboard work in the tree can continue.
  useEffect(() => {
    if (document.activeElement !== document.body || !selected) return;
    treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(selected)}"]`)?.focus();
  }, [rows, selected, renaming]);

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

  const openMenu = (row: TreeRow | null, anchor: MenuAnchor, keyboard: boolean) => {
    const ctx: CommandContext = row
      ? { target: { path: row.entry.path, isDir: row.entry.kind === "directory" } }
      : { atRoot: true };
    useWorkspace.setState({ menuTarget: row?.entry.path ?? null });
    setMenu({ anchor, ctx, keyboard });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = rows.findIndex((r) => r.entry.path === focusPath);
    const row = rows[i];
    if (!row) return;
    // The context-menu key, or Shift+F10, opens the menu on the focused row.
    if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      return openMenu(row, { kind: "point", x: rect.left + 24, y: rect.bottom }, true);
    }
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
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        const el = (e.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
        const row = rows.find((r) => r.entry.path === el?.dataset.path) ?? null;
        openMenu(row, { kind: "point", x: e.clientX, y: e.clientY }, false);
      }}
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
              if (renaming?.path === entry.path) return;
              select(entry.path, false);
              activate(row);
            }}
          >
            <span className="tree-chevron" aria-hidden>
              {isDir && (row.expanded ? <ChevronDown size={12} strokeWidth={2.5} /> : <ChevronRight size={12} strokeWidth={2.5} />)}
            </span>
            <Icon size={15} className="tree-icon" aria-hidden />
            {renaming?.path === entry.path ? (
              <RenameInput name={entry.name} isDir={isDir} />
            ) : (
              <span className="tree-name">{entry.name}</span>
            )}
          </div>
        );
      })}
      {menu && (
        <PopoverMenu
          entries={menu.ctx.target ? itemMenu(menu.ctx) : rootMenu(menu.ctx)}
          label={menu.ctx.target ? "File actions" : "Workspace actions"}
          anchor={menu.anchor}
          focusFirst={menu.keyboard}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

/** The right-click menu of a tree row (see design 03). */
function itemMenu(ctx: CommandContext): MenuEntry[] {
  return [
    { kind: "command", id: "file.new", ctx },
    { kind: "command", id: "folder.new", ctx },
    { kind: "separator" },
    { kind: "command", id: "item.rename", ctx },
    { kind: "command", id: "item.duplicate", ctx },
    { kind: "command", id: "item.copyPath", ctx },
    { kind: "separator" },
    { kind: "command", id: "item.reveal", ctx },
    { kind: "separator" },
    { kind: "command", id: "item.trash", ctx },
  ];
}

/** The right-click menu of empty tree space: create at the workspace root. */
function rootMenu(ctx: CommandContext): MenuEntry[] {
  return [
    { kind: "command", id: "file.new", ctx },
    { kind: "command", id: "folder.new", ctx },
  ];
}

/** Inline rename field. Enter applies, Escape cancels, leaving the field applies. */
function RenameInput({ name, isDir }: { name: string; isDir: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    // Select the name without its extension, like GNOME Files.
    const ext = isDir ? "" : extname(name);
    input.setSelectionRange(0, name.length - ext.length);
  }, [name, isDir]);

  const finish = (apply: boolean) => {
    if (done.current) return;
    done.current = true;
    const value = ref.current?.value ?? name;
    // Give focus back to the row before it re-renders.
    ref.current?.closest<HTMLElement>("[role=treeitem]")?.focus();
    if (apply) void commitRename(value);
    else cancelRename();
  };

  return (
    <input
      ref={ref}
      className="tree-rename"
      defaultValue={name}
      aria-label={`Rename ${name}`}
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
