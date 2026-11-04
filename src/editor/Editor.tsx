import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { attachView } from "./documents";

/**
 * The CodeMirror editor. One view for the whole app; switching tabs swaps
 * its EditorState (see documents.ts), so each tab keeps its own history.
 */
export function Editor() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({ parent: host.current! });
    attachView(view);
    return () => {
      attachView(null);
      view.destroy();
    };
  }, []);

  return <div ref={host} className="editor-host" />;
}
