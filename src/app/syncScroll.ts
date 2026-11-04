import type { EditorView } from "@codemirror/view";

/**
 * Basic synced scroll between the editor and the preview, using the
 * `data-line` attributes the renderer puts on preview blocks. Each side maps
 * its top edge to a (fractional) source line and scrolls the other side to it.
 */

interface Anchor {
  line: number;
  top: number;
}

/** Preview blocks as (source line, offset from the scroll top), in document order. */
function anchors(preview: HTMLElement): Anchor[] {
  const base = preview.getBoundingClientRect().top - preview.scrollTop;
  const list: Anchor[] = [];
  for (const el of preview.querySelectorAll<HTMLElement>("[data-line]")) {
    const line = Number(el.dataset.line);
    const top = el.getBoundingClientRect().top - base;
    // Keep anchors increasing in both line and position (nested blocks can repeat).
    const last = list[list.length - 1];
    if (!last || (line > last.line && top >= last.top)) list.push({ line, top });
  }
  return list;
}

function maxScroll(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** The source line at the top of the editor, with a fraction for partial lines. */
function editorTopLine(view: EditorView): number {
  const scroller = view.scrollDOM;
  const top = scroller.scrollTop - (view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop);
  const block = view.lineBlockAtHeight(Math.max(0, top));
  const line = view.state.doc.lineAt(block.from).number;
  const frac = block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
  return line + frac;
}

/** Scroll position in the editor that puts `line` (fractional) at the top. */
function editorTopFor(view: EditorView, line: number): number {
  const doc = view.state.doc;
  const n = Math.min(Math.max(1, Math.floor(line)), doc.lines);
  const block = view.lineBlockAt(doc.line(n).from);
  const offset = view.documentTop - view.scrollDOM.getBoundingClientRect().top + view.scrollDOM.scrollTop;
  return offset + block.top + (line - n) * block.height;
}

export function syncPreviewToEditor(view: EditorView, preview: HTMLElement): void {
  if (view.scrollDOM.scrollTop >= maxScroll(view.scrollDOM) - 1) {
    preview.scrollTop = maxScroll(preview);
    return;
  }
  const line = editorTopLine(view);
  const list = anchors(preview);
  if (!list.length) return;
  let i = 0;
  while (i + 1 < list.length && list[i + 1].line <= line) i++;
  const a = list[i];
  const b = list[i + 1];
  let target: number;
  if (line < a.line) target = (a.top * (line - 1)) / Math.max(1, a.line - 1);
  else if (!b) target = a.top;
  else target = a.top + ((line - a.line) / (b.line - a.line)) * (b.top - a.top);
  preview.scrollTop = Math.max(0, target - 28); // keep the preview's top padding visible
}

export function syncEditorToPreview(view: EditorView, preview: HTMLElement): void {
  if (preview.scrollTop >= maxScroll(preview) - 1) {
    view.scrollDOM.scrollTop = maxScroll(view.scrollDOM);
    return;
  }
  const y = preview.scrollTop + 28;
  const list = anchors(preview);
  if (!list.length) return;
  let i = 0;
  while (i + 1 < list.length && list[i + 1].top <= y) i++;
  const a = list[i];
  const b = list[i + 1];
  let line: number;
  if (y < a.top) line = 1 + ((a.line - 1) * y) / Math.max(1, a.top);
  else if (!b) line = a.line;
  else line = a.line + ((y - a.top) / Math.max(1, b.top - a.top)) * (b.line - a.line);
  view.scrollDOM.scrollTop = editorTopFor(view, line);
}

/**
 * Keep the two panes in step. Scroll events caused by syncing are ignored
 * for a moment so the panes don't chase each other.
 */
export function installSyncScroll(getView: () => EditorView | null, preview: HTMLElement): () => void {
  let ignoreEditorUntil = 0;
  let ignorePreviewUntil = 0;
  let frame = 0;
  let editorEl: HTMLElement | null;

  const onEditorScroll = () => {
    if (performance.now() < ignoreEditorUntil) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const view = getView();
      if (!view) return;
      ignorePreviewUntil = performance.now() + 120;
      syncPreviewToEditor(view, preview);
    });
  };
  const onPreviewScroll = () => {
    if (performance.now() < ignorePreviewUntil) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const view = getView();
      if (!view) return;
      ignoreEditorUntil = performance.now() + 120;
      syncEditorToPreview(view, preview);
    });
  };

  // The app has a single EditorView for its whole life, so its scroller is stable.
  editorEl = getView()?.scrollDOM ?? null;
  editorEl?.addEventListener("scroll", onEditorScroll, { passive: true });
  preview.addEventListener("scroll", onPreviewScroll, { passive: true });

  return () => {
    cancelAnimationFrame(frame);
    editorEl?.removeEventListener("scroll", onEditorScroll);
    preview.removeEventListener("scroll", onPreviewScroll);
  };
}
