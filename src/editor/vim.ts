/**
 * The editor side of Vim mode (docs/VIM.md): @replit/codemirror-vim in a
 * compartment, plus what Phanes adds around it: the mode, pending keys and
 * macro recording for the status bar, the Visual-mode tint on lines and line
 * numbers, the search match count, and short error messages.
 *
 * Ex commands, mappings, options and the clipboard are global to the Vim
 * API and registered once, in vimCommands.ts.
 */
import { getCM, vim, Vim } from "@replit/codemirror-vim";
import {
  Compartment,
  Prec,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutterLineClass, type DecorationSet } from "@codemirror/view";
import { useVimStatus, type VimMode } from "../state/vimStatus";

export const vimCompartment = new Compartment();

/* ---------- Visual mode tint ---------- */

type VisualKind = "" | "char" | "line" | "block";

const setVisual = StateEffect.define<VisualKind>();

/** Which kind of Visual mode the editor is in, mirrored into the state so decorations can use it. */
const visualField = StateField.define<VisualKind>({
  create: () => "",
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setVisual)) value = effect.value;
    return value;
  },
});

/** First and last line numbers touched by the selection (all ranges: a block is one per line). */
function selectedLines(state: EditorState): [number, number] {
  const ranges = state.selection.ranges;
  const from = Math.min(...ranges.map((r) => r.from));
  const to = Math.max(...ranges.map((r) => r.to));
  const first = state.doc.lineAt(from);
  let last = state.doc.lineAt(to);
  // A selection ending at the very start of a line doesn't include that line.
  if (to > from && to === last.from && last.number > first.number) last = state.doc.line(last.number - 1);
  return [first.number, last.number];
}

const lineSelected = Decoration.line({ class: "cm-vim-line-selected" });

/** V-LINE tints whole lines, like the design. */
const visualLines = EditorView.decorations.compute([visualField, "selection"], (state): DecorationSet => {
  if (state.field(visualField) !== "line") return Decoration.none;
  const [first, last] = selectedLines(state);
  const builder = new RangeSetBuilder<Decoration>();
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    builder.add(line.from, line.from, lineSelected);
  }
  return builder.finish();
});

class SelectedLineNumber extends GutterMarker {
  elementClass = "cm-vim-selected";
}
const selectedLineNumber = new SelectedLineNumber();

/** Line numbers of selected lines use the main text color, like the current line. */
const visualGutter = gutterLineClass.compute([visualField, "selection"], (state) => {
  if (!state.field(visualField)) return RangeSet.empty;
  const [first, last] = selectedLines(state);
  const builder = new RangeSetBuilder<GutterMarker>();
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    builder.add(line.from, line.from, selectedLineNumber);
  }
  return builder.finish();
});

/* ---------- Following the extension's state ---------- */

/** The CodeMirror 5-style object the extension keeps per view. */
type VimCM = NonNullable<ReturnType<typeof getCM>>;

interface VimState {
  insertMode?: boolean;
  visualMode?: boolean;
  visualLine?: boolean;
  visualBlock?: boolean;
  status?: string;
}

const NOTIFICATION_MS = 2000;
const tracked = new WeakSet<object>();

function modeOf(cm: VimCM): { mode: VimMode; visual: VisualKind } {
  const vim = cm.state.vim as VimState | undefined;
  const dialog = cm.state.dialog as HTMLElement | null | undefined;
  if (dialog?.querySelector("input")) return { mode: "COMMAND", visual: "" };
  if (!vim) return { mode: "NORMAL", visual: "" };
  if (vim.insertMode) return { mode: cm.state.overwrite ? "REPLACE" : "INSERT", visual: "" };
  if (vim.visualMode) {
    if (vim.visualLine) return { mode: "V-LINE", visual: "line" };
    if (vim.visualBlock) return { mode: "V-BLOCK", visual: "block" };
    return { mode: "VISUAL", visual: "char" };
  }
  return { mode: "NORMAL", visual: "" };
}

/** Read the extension's state into the status bar store and the editor's CSS hooks. */
function publish(view: EditorView): void {
  const cm = getCM(view);
  if (!cm) return;
  const { mode, visual } = modeOf(cm);
  const macro = Vim.getVimGlobalState_().macroModeState as { isRecording: boolean; latestRegister?: string };
  useVimStatus.setState({
    mode,
    // The command line shows what is typed there; pending keys are for Normal mode.
    pending: mode === "COMMAND" ? "" : ((cm.state.vim as VimState | undefined)?.status ?? "").trim(),
    recording: macro.isRecording ? (macro.latestRegister ?? "") : null,
  });
  const host = view.dom.parentElement;
  if (host) host.dataset.vimMode = mode.toLowerCase();
  if (view.state.field(visualField, false) !== undefined && view.state.field(visualField) !== visual) {
    // Not from inside the extension's own event handlers: dispatch afterwards.
    queueMicrotask(() => {
      if (view.state.field(visualField, false) !== undefined && view.state.field(visualField) !== visual) {
        view.dispatch({ effects: setVisual.of(visual) });
      }
    });
  }
  watchSearchInput(view, cm);
}

/** Hook into a view's Vim object once (it is recreated when the editor shows another tab). */
function track(view: EditorView): void {
  const cm = getCM(view);
  if (!cm || tracked.has(cm)) return;
  tracked.add(cm);
  // Errors such as "E492: Not an editor command" show for 2 seconds, not 15.
  const open = cm.openNotification.bind(cm);
  cm.openNotification = (template: Node, options?: { bottom?: boolean; duration?: number }) =>
    open(template, { ...options, duration: options?.duration === 0 ? 0 : NOTIFICATION_MS });
  cm.on("vim-mode-change", () => publish(view));
  cm.on("vim-command-done", () => publish(view));
  cm.on("dialog", () => publish(view));
  publish(view);
}

/**
 * Pending keys have no event: read them once Vim has handled the key. (A
 * timeout, not an animation frame: WebKit pauses those in hidden windows.)
 */
const keyWatcher = Prec.highest(
  EditorView.domEventHandlers({
    keydown: (_event, view) => {
      setTimeout(() => publish(view), 0);
      return false;
    },
  }),
);

const tracker = EditorView.updateListener.of((update) => track(update.view));

/* ---------- Search match count ---------- */

const watchedInputs = new WeakSet<HTMLInputElement>();

/** While `/` or `?` is open, show "current/total" matches on the right of the command line. */
function watchSearchInput(view: EditorView, cm: VimCM): void {
  const dialog = cm.state.dialog as HTMLElement | null | undefined;
  const input = dialog?.querySelector("input");
  if (!dialog || !input || watchedInputs.has(input)) return;
  const prompt = (input.previousSibling?.textContent ?? "").trim();
  if (prompt !== "/" && prompt !== "?") return;
  watchedInputs.add(input);
  const count = document.createElement("span");
  count.className = "cm-vim-count";
  dialog.appendChild(count);
  const update = () => {
    count.textContent = matchCount(view.state, input.value, prompt === "?");
  };
  input.addEventListener("input", update);
}

function matchCount(state: EditorState, pattern: string, backward: boolean): string {
  if (!pattern) return "";
  let re: RegExp;
  try {
    re = new RegExp(pattern, "g");
  } catch {
    return "";
  }
  const text = state.doc.toString();
  const cursor = state.selection.main.head;
  let total = 0;
  let current = 0;
  for (const match of text.matchAll(re)) {
    if (!match[0]) break;
    total++;
    const at = match.index ?? 0;
    if (backward ? at < cursor : at > cursor && !current) current = total;
  }
  if (!total) return "0/0";
  return `${current || (backward ? total : 1)}/${total}`;
}

/* ---------- Assembly ---------- */

/** The Vim extension and Phanes' additions; empty when Vim mode is off. Goes first in the extension list. */
export function vimExtension(on: boolean): Extension {
  if (!on) return [];
  return [vim(), visualField, visualLines, visualGutter, keyWatcher, tracker];
}

/** Clear the Vim hooks when Vim mode is turned off. */
export function clearVimStatus(view: EditorView | null): void {
  const host = view?.dom.parentElement;
  if (host) delete host.dataset.vimMode;
  useVimStatus.setState({ mode: "NORMAL", pending: "", recording: null });
}

/**
 * Close Vim's command line or search prompt, if open, before the editor shows
 * another tab: swapping the state removes the Vim object the prompt belongs to,
 * and a prompt left open would then fail when closed.
 */
export function closeVimPrompt(view: EditorView): void {
  const cm = getCM(view);
  const input = (cm?.state.dialog as HTMLElement | null | undefined)?.querySelector("input");
  // The prompt handles its own keys: Escape there closes it as if typed.
  input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
}
