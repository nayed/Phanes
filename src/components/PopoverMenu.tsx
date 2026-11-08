import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { suspendShortcuts } from "../commands/keybindings";
import {
  getCommand,
  hasCommand,
  isCommandEnabled,
  runCommand,
  type CommandContext,
  type CommandId,
} from "../commands/registry";

/** One entry of a popover menu. Command entries read label and shortcut from the registry. */
export type MenuEntry =
  | { kind: "command"; id: CommandId; ctx?: CommandContext; label?: string }
  | { kind: "separator" }
  | { kind: "submenu"; label: string; entries: MenuEntry[] };

export type MenuAnchor =
  /** At the pointer (right-click menus). */
  | { kind: "point"; x: number; y: number }
  /** Below a button, aligned to its right edge (header menus). */
  | { kind: "below"; rect: DOMRect }
  /** Above a button, aligned to its right edge (status bar menus). */
  | { kind: "above"; rect: DOMRect };

interface Props {
  entries: MenuEntry[];
  anchor: MenuAnchor;
  label: string;
  /** Highlight the first item on open (when opened from the keyboard). */
  focusFirst?: boolean;
  /** The button that toggles this menu; pressing it is not an "outside" click. */
  toggle?: HTMLElement | null;
  onClose: () => void;
}

const MARGIN = 6;

/**
 * A GNOME-style popover menu: 232 px wide, 12 px radius, 32 px items,
 * separators between groups, shortcuts right-aligned. Keyboard-navigable
 * (arrows, Home/End, Enter/Space, Right/Left for submenus, Escape).
 */
export function PopoverMenu({ entries, anchor, label, focusFirst, toggle, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [stack, setStack] = useState<{ label: string; entries: MenuEntry[] }[]>([]);
  const [active, setActive] = useState(focusFirst ? 0 : -1);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const level = stack.length ? stack[stack.length - 1] : null;
  const current = tidy((level ? level.entries : entries).filter((e) => e.kind !== "command" || hasCommand(e.id)));
  // Items that can be focused, in order: the "back" row of a submenu, then entries.
  const items: Array<{ type: "back" } | { type: "entry"; entry: MenuEntry }> = [
    ...(level ? [{ type: "back" as const }] : []),
    ...current
      .filter((e) => e.kind !== "separator")
      .map((entry) => ({ type: "entry" as const, entry })),
  ];

  // Suspend global shortcuts and remember where focus was, to restore it on close.
  useEffect(() => {
    const resume = suspendShortcuts();
    const previous = document.activeElement as HTMLElement | null;
    menuRef.current?.focus();
    return () => {
      resume();
      previous?.focus?.();
    };
  }, []);

  // Position inside the window.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left: number;
    let top: number;
    if (anchor.kind === "point") {
      left = anchor.x;
      top = anchor.y;
    } else if (anchor.kind === "below") {
      left = anchor.rect.right - width;
      top = anchor.rect.bottom + 4;
    } else {
      left = anchor.rect.right - width;
      top = Math.max(MARGIN, anchor.rect.top - height - 4);
    }
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
    if (top + height > window.innerHeight - MARGIN) {
      top = anchor.kind === "point" ? Math.max(MARGIN, top - height) : window.innerHeight - height - MARGIN;
    }
    setPos({ left, top });
  }, [anchor, stack]);

  // Close when clicking elsewhere, when the window loses focus, or on resize.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || toggle?.contains(target)) return;
      onClose();
    };
    const close = () => onClose();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose, toggle]);

  // Move DOM focus along with the highlighted item so focus rings and screen readers follow.
  useEffect(() => {
    if (active < 0) {
      menuRef.current?.focus();
      return;
    }
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role^=menuitem]");
    buttons?.[active]?.focus();
  }, [active, stack]);

  const openSubmenu = (entry: Extract<MenuEntry, { kind: "submenu" }>) => {
    setStack((s) => [...s, { label: entry.label, entries: entry.entries }]);
    setActive(1);
  };
  const back = () => {
    setStack((s) => s.slice(0, -1));
    setActive(0);
  };

  const activate = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (item.type === "back") return back();
    const entry = item.entry;
    if (entry.kind === "submenu") return openSubmenu(entry);
    if (entry.kind !== "command" || !isCommandEnabled(entry.id, entry.ctx)) return;
    onClose();
    // Run after the menu has closed and focus is restored.
    window.setTimeout(() => void runCommand(entry.id, entry.ctx ?? {}), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const count = items.length;
    const step = (dir: 1 | -1) => {
      e.preventDefault();
      setActive((a) => {
        let i = a;
        for (let n = 0; n < count; n++) {
          i = (i + dir + count) % count;
          const it = items[i];
          if (it.type === "back" || it.entry.kind !== "command" || isCommandEnabled(it.entry.id, it.entry.ctx)) {
            return i;
          }
        }
        return a;
      });
    };
    switch (e.key) {
      case "ArrowDown":
        return step(1);
      case "ArrowUp":
        return step(-1);
      case "Home":
        e.preventDefault();
        return setActive(0);
      case "End":
        e.preventDefault();
        return setActive(count - 1);
      case "Enter":
      case " ":
        e.preventDefault();
        return activate(active);
      case "ArrowRight": {
        const it = items[active];
        if (it?.type === "entry" && it.entry.kind === "submenu") {
          e.preventDefault();
          openSubmenu(it.entry);
        }
        return;
      }
      case "ArrowLeft":
        if (level) {
          e.preventDefault();
          back();
        }
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        if (level) back();
        else onClose();
        return;
      case "Tab":
        e.preventDefault();
        return step(e.shiftKey ? -1 : 1);
    }
  };

  let index = level ? 1 : 0;
  const rows: ReactNode[] = [];
  if (level) {
    rows.push(
      <MenuRow key="back" index={0} active={active} setActive={setActive} onActivate={activate} className="menu-back">
        <ChevronLeft size={14} aria-hidden className="menu-back-icon" />
        <span className="menu-label">{level.label}</span>
      </MenuRow>,
      <div key="back-sep" role="separator" className="menu-separator" />,
    );
  }
  current.forEach((entry, i) => {
    if (entry.kind === "separator") {
      rows.push(<div key={`sep-${i}`} role="separator" className="menu-separator" />);
      return;
    }
    const at = index++;
    if (entry.kind === "submenu") {
      rows.push(
        <MenuRow key={`sub-${i}`} index={at} active={active} setActive={setActive} onActivate={activate} hasPopup>
          <span className="menu-label">{entry.label}</span>
          <ChevronRight size={14} aria-hidden className="menu-trailing" />
        </MenuRow>,
      );
      return;
    }
    const command = getCommand(entry.id);
    const enabled = isCommandEnabled(entry.id, entry.ctx);
    const checked = command.isChecked?.();
    rows.push(
      <MenuRow
        key={entry.id}
        index={at}
        active={active}
        setActive={setActive}
        onActivate={activate}
        disabled={!enabled}
        danger={command.danger}
        checked={checked}
      >
        <span className="menu-label">{entry.label ?? command.label}</span>
        {command.shortcut && <span className="menu-shortcut">{command.shortcut}</span>}
        {checked !== undefined && (
          <span className="menu-check" aria-hidden>
            {checked && <Check size={14} />}
          </span>
        )}
      </MenuRow>,
    );
  });

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={level ? level.label : label}
      tabIndex={-1}
      className="popover-menu"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {rows}
    </div>,
    document.body,
  );
}

/** Drop leading, trailing and doubled separators. */
function tidy(entries: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (e.kind === "separator" && (out.length === 0 || out[out.length - 1].kind === "separator")) continue;
    out.push(e);
  }
  while (out.length && out[out.length - 1].kind === "separator") out.pop();
  return out;
}

interface RowProps {
  index: number;
  active: number;
  setActive: (i: number) => void;
  onActivate: (i: number) => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  hasPopup?: boolean;
  className?: string;
  children: ReactNode;
}

function MenuRow({ index, active, setActive, onActivate, disabled, danger, checked, hasPopup, className, children }: RowProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      aria-haspopup={hasPopup ? "menu" : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={["menu-item", danger && "danger", className].filter(Boolean).join(" ")}
      data-active={index === active || undefined}
      onPointerMove={() => index !== active && setActive(index)}
      onClick={() => !disabled && onActivate(index)}
    >
      {children}
    </button>
  );
}
