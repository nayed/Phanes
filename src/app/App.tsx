import { DialogHost } from "../components/Dialogs";
import { EmptyState } from "../components/EmptyState";
import { HeaderBar } from "../components/HeaderBar";
import { Sidebar } from "../components/Sidebar";
import { TabStrip } from "../components/TabStrip";
import { Editor } from "../editor/Editor";
import { dirname, tildify } from "../lib/path";
import { useSettings } from "../state/settings";
import { activeTab, openFile, useTabs } from "../state/tabs";
import { useWorkspace } from "../state/workspace";

export function App() {
  const sidebarVisible = useSettings((s) => s.sidebarVisible);
  const root = useWorkspace((s) => s.root);
  const tab = useTabs(activeTab);
  const hasTabs = useTabs((s) => s.tabs.length > 0);

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
            <div className="panes" hidden={!hasTabs}>
              <section className="pane pane-editor" aria-label="Markdown source">
                <Editor />
              </section>
            </div>
            {!hasTabs && <EmptyState />}
          </div>
        </div>
      </div>
      <DialogHost />
    </>
  );
}
