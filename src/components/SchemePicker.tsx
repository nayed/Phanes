import { Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLORSCHEMES, previewScheme, useAppliedMode } from "../app/theme";
import { suspendShortcuts } from "../commands/keybindings";
import { runCommand } from "../commands/registry";
import { SCHEME_IDS, useSettings, type SchemeId } from "../state/settings";

interface Props {
  /** The status bar button it opens from; the picker sits above it, right-aligned. */
  anchor: DOMRect;
  /** That button: pressing it again is not an "outside" click. */
  toggle: HTMLElement | null;
  onClose: () => void;
}

const MARGIN = 6;
const SWATCH_COLORS = ["--window", "--alert-caution", "--alert-tip", "--alert-note", "--fg"];

/**
 * The colorscheme picker, command-palette style: type to filter, the arrow
 * keys preview the highlighted scheme live on the whole window (in the
 * current light or dark mode), Enter or a click applies it, Escape (or
 * clicking elsewhere) goes back to the chosen one.
 */
export function SchemePicker({ anchor, toggle, onClose }: Props) {
  const current = useSettings((s) => s.scheme);
  // Swatches show the variant on screen: with Follow System, GNOME's current one.
  const mode = useAppliedMode((s) => s.mode);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(() => SCHEME_IDS.indexOf(current));
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCHEME_IDS.filter((id) => COLORSCHEMES[id].name.toLowerCase().includes(q));
  }, [query]);
  const highlighted: SchemeId | undefined = matches[active];

  // Live preview of the highlighted scheme; back to the chosen one on close.
  useEffect(() => {
    previewScheme(highlighted ?? null);
  }, [highlighted]);
  useEffect(() => () => previewScheme(null), []);

  // Global shortcuts pause while typing here; focus goes back where it was.
  useEffect(() => {
    const resume = suspendShortcuts();
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      resume();
      previous?.focus?.();
    };
  }, []);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(anchor.right - width, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, anchor.top - height - 6);
    setPos({ left, top });
  }, [anchor, matches.length]);

  // Clicking elsewhere, leaving the window or resizing it closes without applying.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || toggle?.contains(target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, toggle]);

  const apply = (id: SchemeId) => {
    void runCommand(COLORSCHEMES[id].command);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const count = matches.length;
    switch (e.key) {
      case "ArrowDown":
        if (count) setActive((i) => (i + 1) % count);
        break;
      case "ArrowUp":
        if (count) setActive((i) => (i - 1 + count) % count);
        break;
      case "Enter":
        if (highlighted) apply(highlighted);
        break;
      case "Escape":
        onClose();
        break;
      case "Tab":
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return createPortal(
    <div
      ref={panelRef}
      className="scheme-picker"
      // Transparent (not hidden) while measuring, so the search field can take focus.
      style={pos ? { left: pos.left, top: pos.top } : { opacity: 0 }}
      onKeyDown={onKeyDown}
    >
      <label className="scheme-search">
        <Search size={16} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search color schemes"
          value={query}
          spellCheck={false}
          role="combobox"
          aria-label="Search color schemes"
          aria-expanded="true"
          aria-controls="scheme-picker-list"
          aria-activedescendant={highlighted ? `scheme-option-${highlighted}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
      </label>
      <div id="scheme-picker-list" className="scheme-list" role="listbox" aria-label="Color schemes">
        {matches.map((id, i) => (
          <div
            key={id}
            id={`scheme-option-${id}`}
            role="option"
            aria-selected={i === active}
            className="scheme-option"
            data-active={i === active || undefined}
            data-current={id === current || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => apply(id)}
          >
            <span className="scheme-swatch" data-scheme={id} data-mode={mode} aria-hidden>
              {SWATCH_COLORS.map((v) => (
                <i key={v} style={{ background: `var(${v})` }} />
              ))}
            </span>
            <span className="scheme-name">{COLORSCHEMES[id].name}</span>
            {id === current ? (
              <span className="scheme-note">Current</span>
            ) : i === active ? (
              <span className="scheme-note">Previewing</span>
            ) : null}
          </div>
        ))}
        {!matches.length && <div className="scheme-empty">No color schemes match</div>}
      </div>
      <div className="scheme-hints" aria-hidden>
        <span>
          <b>↑↓</b> preview
        </span>
        <span>
          <b>Enter</b> apply
        </span>
        <span>
          <b>Esc</b> revert
        </span>
      </div>
    </div>,
    document.body,
  );
}
