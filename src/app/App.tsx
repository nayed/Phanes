import { useEffect, useRef } from "react";
import { DialogHost } from "../components/Dialogs";
import { EmptyState } from "../components/EmptyState";
import { HeaderBar } from "../components/HeaderBar";
import { Sidebar } from "../components/Sidebar";
import { StatusBar } from "../components/StatusBar";
import { TabStrip } from "../components/TabStrip";
import { getView } from "../editor/documents";
import { Editor } from "../editor/Editor";
import { Preview } from "../markdown/Preview";
import { dirname, tildify } from "../lib/path";
import { useSettings } from "../state/settings";
import { activeTab, openFile, useTabs } from "../state/tabs";
import { useWorkspace } from "../state/workspace";
import { setWindowTitle } from "./lifecycle";
import { installSyncScroll } from "./syncScroll";

export function App() {
  const sidebarVisible = useSettings((s) => s.sidebarVisible);
  const viewMode = useSettings((s) => s.viewMode);
  const root = useWorkspace((s) => s.root);
  const tab = useTabs(activeTab);
  const hasTabs = useTabs((s) => s.tabs.length > 0);
  const syncScroll = useSettings((s) => s.syncScroll);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!syncScroll || viewMode !== "split" || !hasTabs || !previewRef.current) return;
    return installSyncScroll(getView, previewRef.current);
  }, [syncScroll, viewMode, hasTabs]);

  const tabTitle = tab?.title ?? null;
  useEffect(() => setWindowTitle(tabTitle), [tabTitle]);

  const place = root ? tildify(root) : tab?.path ? tildify(dirname(tab.path)) : null;
  const state = !tab ? null : tab.dirty ? "Unsaved changes" : tab.path ? "Saved" : "New document";
  const subtitle = [place, state].filter(Boolean).join(" · ") || "No folder open";

  return (
    <>
      <div className="window-frame">
        <HeaderBar title={tab?.title ?? "Phanes"} subtitle={subtitle} />
        <div className="workbench">
          {sidebarVisible && <Sidebar activePath={tab?.path ?? null} onOpenFile={(p) => void openFile(p)} />}
          <div className="main-column">
            {hasTabs && <TabStrip />}
            <div className="panes" hidden={!hasTabs} data-view={viewMode}>
              <section className="pane pane-editor" aria-label="Markdown source">
                <Editor />
              </section>
              <section className="pane pane-preview" aria-label="Preview">
                <Preview ref={previewRef} />
              </section>
            </div>
            {!hasTabs && <EmptyState />}
          </div>
        </div>
        <StatusBar />
      </div>
      <DialogHost />
    </>
  );
}
