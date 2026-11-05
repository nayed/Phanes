import { openUrl } from "@tauri-apps/plugin-opener";
import { forwardRef, useEffect, useState } from "react";
import { pathInfo } from "../lib/fs";
import { dirname, isMarkdown, resolve } from "../lib/path";
import { showToast } from "../state/dialogs";
import { useEditorStatus } from "../state/editorStatus";
import { activeTab, openFile, useTabs } from "../state/tabs";
import { renderMarkdown } from "./render";

/**
 * The live preview: GitHub-style rendering of the active document, re-rendered
 * ~150 ms after typing stops (the debounce lives in editorStatus).
 */
export const Preview = forwardRef<HTMLDivElement>(function Preview(_props, ref) {
  const text = useEditorStatus((s) => s.text);
  const version = useEditorStatus((s) => s.version);
  const path = useTabs((s) => activeTab(s)?.path ?? null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    let canceled = false;
    const baseDir = path ? dirname(path) : undefined;
    renderMarkdown(text, { baseDir })
      .then((out) => !canceled && setHtml(out))
      .catch((err) => console.error("Preview failed", err));
    return () => {
      canceled = true;
    };
  }, [text, version, path]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    // Never navigate the app's own webview.
    e.preventDefault();
    const href = a.getAttribute("href");
    if (href) void followLink(href, path, e.currentTarget as HTMLElement);
  };

  return (
    <div ref={ref} className="preview-scroll" onClick={onClick} onAuxClick={(e) => e.button === 1 && e.preventDefault()}>
      <article className="markdown-body" aria-label="Preview" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});

/**
 * Web links open in the default browser; relative links to markdown files
 * open them in a tab; #fragments scroll the preview.
 */
async function followLink(href: string, currentPath: string | null, container: HTMLElement): Promise<void> {
  if (/^(https?|mailto):/i.test(href)) {
    await openUrl(href);
    return;
  }
  if (href.startsWith("#")) {
    const id = decodeURIComponent(href.slice(1));
    const target =
      container.querySelector(`[id="${CSS.escape(id)}"]`) ??
      container.querySelector(`[id="${CSS.escape(`user-content-${id}`)}"]`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || !currentPath) return;
  let target = href.split("#")[0].split("?")[0];
  try {
    target = decodeURI(target);
  } catch {
    // Keep the raw value.
  }
  const path = resolve(dirname(currentPath), target);
  if (!isMarkdown(path)) {
    showToast(`Phanes only opens markdown files (${target})`);
    return;
  }
  if (!(await pathInfo(path)).exists) {
    showToast(`${target} does not exist`);
    return;
  }
  await openFile(path);
}
