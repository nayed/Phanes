import { DialogHost } from "../components/Dialogs";
import { HeaderBar } from "../components/HeaderBar";
import { Sidebar } from "../components/Sidebar";
import { tildify } from "../lib/path";
import { useSettings } from "../state/settings";
import { useWorkspace } from "../state/workspace";

export function App() {
  const sidebarVisible = useSettings((s) => s.sidebarVisible);
  const root = useWorkspace((s) => s.root);

  return (
    <>
      <div className="window-frame">
        <HeaderBar title="Phanes" subtitle={root ? tildify(root) : "No folder open"} />
        <div className="workbench">
          {sidebarVisible && <Sidebar activePath={null} onOpenFile={() => {}} />}
          <div className="main-column" />
        </div>
      </div>
      <DialogHost />
    </>
  );
}
