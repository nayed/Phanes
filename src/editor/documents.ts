import { EditorState, type StateEffect, type Text } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import {
  editorExtensions,
  lineNumbersCompartment,
  lineNumbersExtension,
  wrapCompartment,
  wrapExtension,
  type EditorOptions,
} from "./extensions";
import { clearVimStatus, closeVimPrompt, vimCompartment, vimExtension } from "./vim";

/**
 * The editor state of every open tab (document, undo history, selection,
 * scroll). Kept outside React; one EditorView shows the active one.
 */
interface Doc {
  state: EditorState;
  /** The document as last loaded or saved, to tell whether it is dirty. */
  saved: Text;
  /** Scroll position to restore when the tab becomes active again. */
  scrollTop: number;
}

const docs = new Map<string, Doc>();

type UpdateHandler = (tabId: string, update: ViewUpdate) => void;
let handler: UpdateHandler = () => {};
let activeId: string | null = null;
let view: EditorView | null = null;

/** The tabs store receives every editor update of the active tab. */
export function setDocUpdateHandler(fn: UpdateHandler): void {
  handler = fn;
}

/* ---------- Options shared by every tab ---------- */

let options: EditorOptions = { vim: false, lineNumbers: true, relativeLineNumbers: false, wrap: true };

export function getEditorOptions(): EditorOptions {
  return options;
}

/**
 * Change editor options live in every tab: the open ones are reconfigured,
 * keeping their undo history, selection and scroll.
 */
export function setEditorOptions(patch: Partial<EditorOptions>): void {
  const next = { ...options, ...patch };
  const effects: StateEffect<unknown>[] = [];
  if (next.vim !== options.vim) effects.push(vimCompartment.reconfigure(vimExtension(next.vim)));
  if (next.lineNumbers !== options.lineNumbers || next.relativeLineNumbers !== options.relativeLineNumbers) {
    effects.push(lineNumbersCompartment.reconfigure(lineNumbersExtension(next)));
  }
  if (next.wrap !== options.wrap) effects.push(wrapCompartment.reconfigure(wrapExtension(next.wrap)));
  options = next;
  if (!effects.length) return;
  for (const [id, doc] of docs) {
    if (view && id === activeId) view.dispatch({ effects }); // updates doc.state through its listener
    else doc.state = doc.state.update({ effects }).state;
  }
  if (!next.vim) clearVimStatus(view);
}

export function createDoc(id: string, text: string): void {
  const state = EditorState.create({
    doc: text,
    extensions: editorExtensions(
      {
        onUpdate: (update) => {
          const doc = docs.get(id);
          if (doc) doc.state = update.state;
          handler(id, update);
        },
      },
      options,
    ),
  });
  docs.set(id, { state, saved: state.doc, scrollTop: 0 });
}

export function deleteDoc(id: string): void {
  docs.delete(id);
}

export function getDocText(id: string): string {
  const doc = docs.get(id);
  return doc ? doc.state.doc.toString() : "";
}

export function getDocState(id: string): EditorState | undefined {
  return docs.get(id)?.state;
}

export function isDocDirty(id: string): boolean {
  const doc = docs.get(id);
  return !!doc && !doc.state.doc.eq(doc.saved);
}

/** Record the current document as saved. */
export function markDocSaved(id: string): void {
  const doc = docs.get(id);
  if (doc) doc.saved = doc.state.doc;
}

/* ---------- The one editor view ---------- */

export function attachView(v: EditorView | null): void {
  view = v;
  if (v && activeId) showDoc(activeId);
}

export function getView(): EditorView | null {
  return view;
}

export function focusEditor(): void {
  requestAnimationFrame(() => view?.focus());
}

/** Put the document of `id` into the editor view, keeping the previous one's scroll. */
export function showDoc(id: string | null): void {
  if (view && activeId && docs.has(activeId) && activeId !== id) {
    docs.get(activeId)!.scrollTop = view.scrollDOM.scrollTop;
  }
  activeId = id;
  if (!view || !id) return;
  const doc = docs.get(id);
  if (!doc) return;
  if (view.state !== doc.state) {
    closeVimPrompt(view);
    view.setState(doc.state);
  }
  const top = doc.scrollTop;
  requestAnimationFrame(() => {
    if (view && activeId === id) view.scrollDOM.scrollTop = top;
  });
}
