import { ArrowDownUp } from "lucide-react";
import { COLORSCHEME } from "../app/theme";
import { runCommand } from "../commands/registry";
import { useEditorStatus } from "../state/editorStatus";
import { useSettings } from "../state/settings";
import { useTabs } from "../state/tabs";

/** GFM · UTF-8 · Ln, Col · words … synced-scroll toggle · colorscheme. */
export function StatusBar() {
  const hasTab = useTabs((s) => s.activeId !== null);
  const line = useEditorStatus((s) => s.line);
  const col = useEditorStatus((s) => s.col);
  const words = useEditorStatus((s) => s.words);
  const syncScroll = useSettings((s) => s.syncScroll);

  return (
    <footer className="status-bar">
      <span className="status-strong">GFM</span>
      <span>UTF-8</span>
      {hasTab && (
        <>
          <span>
            Ln {line}, Col {col}
          </span>
          <span>
            {words} {words === 1 ? "word" : "words"}
          </span>
        </>
      )}
      <span className="status-spacer" />
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
      <span>{COLORSCHEME.name}</span>
    </footer>
  );
}
