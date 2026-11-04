import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { suspendShortcuts } from "../commands/keybindings";
import { listCommands } from "../commands/registry";
import { closePanel, useDialogs } from "../state/dialogs";
import { COLORSCHEME } from "../app/theme";
import appIcon from "../../docs/icons/io.nayed.Phanes.svg";

/** Renders whichever dialog, panel or toast is currently requested. */
export function DialogHost() {
  const alert = useDialogs((s) => s.alert);
  const panel = useDialogs((s) => s.panel);
  const toast = useDialogs((s) => s.toast);
  return (
    <>
      {panel === "about" && <AboutDialog />}
      {panel === "shortcuts" && <ShortcutsDialog />}
      {alert && (
        <Modal label={alert.heading} onEscape={() => alert.resolve(alert.cancelId)} className="alert-dialog">
          <h2 className="dialog-heading">{alert.heading}</h2>
          {alert.body && <p className="dialog-body">{alert.body}</p>}
          <div className="dialog-buttons">
            {alert.buttons.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`dialog-button ${b.appearance ?? "default"}`}
                data-autofocus={b.id === (alert.defaultId ?? alert.cancelId) || undefined}
                onClick={() => alert.resolve(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {toast && (
        <div key={toast.id} className="toast" role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}

interface ModalProps {
  label: string;
  onEscape: () => void;
  className?: string;
  children: ReactNode;
}

/** A centred modal over a scrim. Traps focus and suspends app shortcuts while open. */
function Modal({ label, onEscape, className, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const resume = suspendShortcuts();
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(el)[0];
    (first ?? el)?.focus();
    return () => {
      resume();
      previous?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    } else if (e.key === "Tab") {
      const items = focusables(ref.current);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
      e.preventDefault();
      items[next].focus();
    }
  };

  return (
    <div className="modal-scrim" onPointerDown={(e) => e.target === e.currentTarget && onEscape()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`modal ${className ?? ""}`}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])")].filter(
    (el) => !el.hasAttribute("disabled"),
  );
}

function AboutDialog() {
  return (
    <Modal label="About Phanes" onEscape={closePanel} className="about-dialog">
      <button type="button" className="icon-button small dialog-close" aria-label="Close" onClick={closePanel}>
        <X size={14} aria-hidden />
      </button>
      <img src={appIcon} alt="" width={96} height={96} />
      <h2 className="about-name">Phanes</h2>
      <p className="about-author">Nayed Saïd Ali</p>
      <p className="about-version">Version {__APP_VERSION__}</p>
      <p className="dialog-body">
        Write markdown on the left, read it on the right. A personal editor for GNOME.
      </p>
      <p className="about-meta">Colour scheme: {COLORSCHEME.name}</p>
    </Modal>
  );
}

/** Keys handled by CodeMirror itself rather than the command registry. */
const EDITOR_KEYS: Array<[string, string]> = [
  ["Find and Replace", "Ctrl+F"],
  ["Go to Line", "Alt+Ctrl+G"],
  ["Undo", "Ctrl+Z"],
  ["Redo", "Shift+Ctrl+Z"],
  ["Indent", "Tab"],
  ["Unindent", "Shift+Tab"],
];

function ShortcutsDialog() {
  const commands = listCommands().filter((c) => c.shortcut);
  return (
    <Modal label="Keyboard Shortcuts" onEscape={closePanel} className="shortcuts-dialog">
      <div className="shortcuts-header">
        <h2 className="dialog-heading">Keyboard Shortcuts</h2>
        <button type="button" className="icon-button small" aria-label="Close" onClick={closePanel}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <dl className="shortcuts-list">
        {[
          ...commands.map((c) => ({
            key: c.id,
            label: c.label,
            scope: c.scope === "tree" ? "in the file tree" : null,
            shortcut: c.shortcut!,
          })),
          ...EDITOR_KEYS.map(([label, shortcut]) => ({ key: label, label, scope: "in the editor", shortcut })),
        ].map((row) => (
          <div key={row.key} className="shortcuts-row">
            <dt>
              {row.label}
              {row.scope && <span className="shortcuts-scope"> ({row.scope})</span>}
            </dt>
            <dd>
              {row.shortcut.split("+").map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
