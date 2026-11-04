import { DialogHost } from "../components/Dialogs";
import { HeaderBar } from "../components/HeaderBar";

export function App() {
  return (
    <>
      <div className="window-frame">
        <HeaderBar title="Phanes" subtitle="No folder open" />
        <div className="workbench" />
      </div>
      <DialogHost />
    </>
  );
}
