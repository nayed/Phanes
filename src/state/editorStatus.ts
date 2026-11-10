import type { EditorState } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { create } from "zustand";
import { getDocState } from "../editor/documents";

/**
 * What the status bar and the preview need from the active document:
 * cursor position (immediate), and the text and word count (debounced).
 */
interface EditorStatus {
  line: number;
  col: number;
  /** Size of the main selection: lines it touches and characters it covers (0 when empty). */
  selLines: number;
  selChars: number;
  words: number;
  /** The active document's text, updated ~150 ms after typing stops. */
  text: string;
  /** Increases on every text change, so the preview can tell documents apart. */
  version: number;
  fromUpdate: (update: ViewUpdate) => void;
  reset: (tabId: string | null) => void;
}

const DEBOUNCE_MS = 150;
let timer: number | undefined;

export function countWords(text: string): number {
  // Whitespace-separated, like `wc -w`, but markdown syntax on its own ("#", "-", "|") is not a word.
  let n = 0;
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) n++;
  return n;
}

function cursorOf(state: EditorState) {
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  // Over every range: a block selection (Vim's V-BLOCK) is one range per line.
  const ranges = state.selection.ranges;
  const from = Math.min(...ranges.map((r) => r.from));
  const to = Math.max(...ranges.map((r) => r.to));
  const selChars = ranges.reduce((n, r) => n + r.to - r.from, 0);
  const firstLine = state.doc.lineAt(from).number;
  let lastLine = state.doc.lineAt(to).number;
  if (to > from && to === state.doc.line(lastLine).from && lastLine > firstLine) lastLine--;
  return {
    line: line.number,
    col: head - line.from + 1,
    selLines: to > from ? lastLine - firstLine + 1 : 0,
    selChars,
  };
}

export const useEditorStatus = create<EditorStatus>((set, get) => ({
  line: 1,
  col: 1,
  selLines: 0,
  selChars: 0,
  words: 0,
  text: "",
  version: 0,
  fromUpdate: (update) => {
    if (update.selectionSet || update.docChanged) set(cursorOf(update.state));
    if (update.docChanged) {
      const state = update.state;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const text = state.doc.toString();
        set({ text, words: countWords(text), version: get().version + 1 });
      }, DEBOUNCE_MS);
    }
  },
  reset: (tabId) => {
    window.clearTimeout(timer);
    const state = tabId ? getDocState(tabId) : undefined;
    const text = state ? state.doc.toString() : "";
    set({
      ...(state ? cursorOf(state) : { line: 1, col: 1, selLines: 0, selChars: 0 }),
      text,
      words: countWords(text),
      version: get().version + 1,
    });
  },
}));
