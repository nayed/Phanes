import { File, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { runCommand } from "../commands/registry";
import { tildify } from "../lib/path";
import { activateTab, closeTab, useTabs } from "../state/tabs";

/** One tab per open file, a dot for unsaved changes, and a + for a new document. */
export function TabStrip() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const strip = useRef<HTMLDivElement>(null);

  // Keep the active tab in view.
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === activeId);
    const to =
      e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const tab = tabs[to];
    if (!tab) return;
    activateTab(tab.id);
    strip.current?.querySelector<HTMLElement>(`[data-tab-id="${tab.id}"] [role=tab]`)?.focus();
  };

  return (
    <div className="tab-strip" ref={strip}>
      <div role="tablist" aria-label="Open files" className="tab-list" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className="tab"
              data-tab-id={tab.id}
              data-active={active || undefined}
              onAuxClick={(e) => {
                if (e.button === 1) void closeTab(tab.id);
              }}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className="tab-button"
                title={tab.path ? tildify(tab.path) : tab.title}
                onClick={() => activateTab(tab.id)}
              >
                <File size={14} aria-hidden className="tab-icon" />
                <span className="tab-title">{tab.title}</span>
              </button>
              {tab.dirty ? (
                <span className="tab-dirty" role="img" aria-label="Unsaved changes" title="Unsaved changes">
                  <span />
                </span>
              ) : null}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tab.title}`}
                tabIndex={-1}
                onClick={() => void closeTab(tab.id)}
              >
                <X size={12} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="icon-button new-tab"
        aria-label="New document"
        title="New Document (Ctrl+T)"
        onClick={() => void runCommand("tab.new")}
      >
        <Plus size={15} aria-hidden />
      </button>
    </div>
  );
}
