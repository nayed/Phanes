import { ArrowDownUp, ChevronUp, Keyboard, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { COLORSCHEMES } from "../app/theme";
import { runCommand } from "../commands/registry";
import { useEditorStatus } from "../state/editorStatus";
import { useSettings, type ColorSchemePreference } from "../state/settings";
import { useTabs } from "../state/tabs";
import { shortenPath } from "../lib/path";
import { useVimStatus } from "../state/vimStatus";
import { SchemePicker } from "./SchemePicker";

/** What the color mode button shows for each setting. */
const COLOR_MODES: Record<ColorSchemePreference, { icon: LucideIcon; label: string }> = {
  system: { icon: Monitor, label: "Follow System" },
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
};

/** [Vim mode pill] path · Ln, Col · words [· CRLF] … Vim toggle · synced-scroll toggle · colorscheme · color mode. */
export function StatusBar() {
  const hasTab = useTabs((s) => s.activeId !== null);
  // Windows line endings, which saving keeps: the one file property worth showing (shown only then).
  const crlf = useTabs((s) => s.tabs.find((t) => t.id === s.activeId)?.lineEnding === "\r\n");
  const path = useTabs((s) => s.tabs.find((t) => t.id === s.activeId)?.path ?? null);
  const line = useEditorStatus((s) => s.line);
  const col = useEditorStatus((s) => s.col);
  const words = useEditorStatus((s) => s.words);
  const syncScroll = useSettings((s) => s.syncScroll);
  const colorMode = COLOR_MODES[useSettings((s) => s.colorScheme)];
  const ColorModeIcon = colorMode.icon;
  const scheme = useSettings((s) => s.scheme);
  const schemeButton = useRef<HTMLButtonElement>(null);
  const [picker, setPicker] = useState<DOMRect | null>(null);
  const closePicker = useCallback(() => setPicker(null), []);
  const vimEnabled = useSettings((s) => s.vimMode);
  const vimOn = vimEnabled && hasTab;
  const vimMode = useVimStatus((s) => s.mode);
  const pending = useVimStatus((s) => s.pending);
  const recording = useVimStatus((s) => s.recording);
  const selLines = useEditorStatus((s) => s.selLines);
  const selChars = useEditorStatus((s) => s.selChars);
  // In Visual modes, the selection size takes the word count's place.
  const visual = !vimOn
    ? null
    : vimMode === "VISUAL"
      ? "chars"
      : vimMode === "V-LINE" || vimMode === "V-BLOCK"
        ? "lines"
        : null;

  return (
    <footer className="status-bar">
      {vimOn && (
        <>
          <span className="vim-pill" data-mode={vimMode.toLowerCase()}>
            {vimMode}
          </span>
          {pending ? (
            <span className="vim-pending">{pending}</span>
          ) : recording !== null ? (
            <span className="vim-recording">recording @{recording}</span>
          ) : null}
        </>
      )}
      {hasTab && (
        <>
          {path && (
            <span className="status-path" title={path}>
              {shortenPath(path)}
            </span>
          )}
          <span>
            Ln {line}, Col {col}
          </span>
          {visual === "lines" ? (
            <span>
              {selLines} {selLines === 1 ? "line" : "lines"} selected
            </span>
          ) : visual === "chars" ? (
            <span>
              {selChars} {selChars === 1 ? "character" : "characters"} selected
            </span>
          ) : (
            <span>
              {words} {words === 1 ? "word" : "words"}
            </span>
          )}
          {crlf && <span title="Windows line endings, kept when saving">CRLF</span>}
        </>
      )}
      <span className="status-spacer" />
      <button
        type="button"
        className="status-toggle"
        aria-pressed={vimEnabled}
        title={vimEnabled ? "Vim mode is on" : "Vim mode is off"}
        onClick={() => void runCommand("editor.toggleVim")}
      >
        <Keyboard size={12} strokeWidth={2.5} aria-hidden />
        Vim
      </button>
      <button
        type="button"
        className="status-toggle"
        aria-pressed={syncScroll}
        title={syncScroll ? "Synced scroll is on" : "Synced scroll is off"}
        onClick={() => void runCommand("view.toggleSyncScroll")}
      >
        <ArrowDownUp size={12} strokeWidth={2.5} aria-hidden />
        Synced scroll
      </button>
      <button
        ref={schemeButton}
        type="button"
        className="status-toggle status-scheme"
        title="Change color scheme"
        aria-haspopup="listbox"
        aria-expanded={!!picker}
        onClick={(e) => setPicker(picker ? null : e.currentTarget.getBoundingClientRect())}
      >
        {COLORSCHEMES[scheme].name}
        <ChevronUp size={12} strokeWidth={2.5} aria-hidden />
      </button>
      {picker && <SchemePicker anchor={picker} toggle={schemeButton.current} onClose={closePicker} />}
      <button
        type="button"
        className="status-toggle"
        aria-label={`Color mode: ${colorMode.label}`}
        title={`Color mode: ${colorMode.label}`}
        onClick={() => void runCommand("theme.cycle")}
      >
        <ColorModeIcon size={12} strokeWidth={2.5} aria-hidden />
      </button>
    </footer>
  );
}
