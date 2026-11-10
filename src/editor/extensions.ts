/**
 * Every editor behavior is a CodeMirror extension configured here.
 * Later features (focus mode…) are added to `editorExtensions`. Settings that
 * change live (Vim mode, line numbers, wrapping) sit in compartments.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab, redo } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  MatchDecorator,
  rectangularSelection,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { styleTags, Tag, tagHighlighter, tags as t } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";
import { vimExtension, vimCompartment } from "./vim";

/* ---------- Syntax highlighting ---------- */

/** Finer tags than @lezer/markdown gives, to match the designs. */
const mdTags = {
  imageUrl: Tag.define(t.url),
  inlineCodeMark: Tag.define(),
  taskMarker: Tag.define(),
};

const phanesMarkdownTags: MarkdownConfig = {
  props: [
    styleTags({
      "Image/URL": mdTags.imageUrl,
      "InlineCode/CodeMark": mdTags.inlineCodeMark,
      "Task/TaskMarker": mdTags.taskMarker,
    }),
  ],
};

/**
 * Map syntax tags to CSS classes; colors live in styles/editor.css as
 * CSS variables, so the editor follows the colorscheme without reconfiguring.
 */
const highlighter = tagHighlighter([
  // Markdown
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName, mdTags.taskMarker], class: "tok-mark" },
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], class: "tok-heading" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.emphasis, class: "tok-emphasis" },
  { tag: t.strikethrough, class: "tok-strike" },
  { tag: [t.monospace, mdTags.inlineCodeMark], class: "tok-code" },
  { tag: t.url, class: "tok-url" },
  { tag: mdTags.imageUrl, class: "tok-image-url" },
  { tag: t.escape, class: "tok-mark" },
  // Code in fenced blocks
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword], class: "tok-keyword" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: "tok-function" },
  { tag: [t.string, t.special(t.string), t.regexp, t.attributeValue], class: "tok-string" },
  { tag: [t.number, t.bool, t.null, t.atom, t.constant(t.variableName), t.literal], class: "tok-constant" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName, t.attributeName], class: "tok-type" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta], class: "tok-comment" },
  { tag: t.invalid, class: "tok-invalid" },
]);

/* ---------- GitHub alert markers ([!NOTE] …) ---------- */

const alertMatcher = new MatchDecorator({
  regexp: /^(\s*>\s?)(\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])/gim,
  decorate: (add, from, _to, match) => {
    const start = from + match[1].length;
    add(start, start + match[2].length, Decoration.mark({ class: `cm-alert-marker cm-alert-${match[3].toLowerCase()}` }));
  },
});

const alertMarkers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = alertMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = alertMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

/* ---------- Line numbers and wrapping ---------- */

class LineNumber extends GutterMarker {
  constructor(readonly text: string) {
    super();
  }
  eq(other: LineNumber) {
    return other.text === this.text;
  }
  toDOM() {
    return document.createTextNode(this.text);
  }
}

/** The cursor line shows its own number, the others their distance from it. */
const relativeLineNumbers = gutter({
  class: "cm-lineNumbers",
  lineMarker(view, line) {
    const current = view.state.doc.lineAt(view.state.selection.main.head).number;
    const n = view.state.doc.lineAt(line.from).number;
    return new LineNumber(String(n === current ? n : Math.abs(n - current)));
  },
  lineMarkerChange: (update) => update.selectionSet || update.docChanged,
  initialSpacer: (view) => new LineNumber(String(view.state.doc.lines)),
  updateSpacer: (_spacer, update) => new LineNumber(String(update.state.doc.lines)),
});

export const lineNumbersCompartment = new Compartment();
export const wrapCompartment = new Compartment();

export interface EditorOptions {
  vim: boolean;
  lineNumbers: boolean;
  relativeLineNumbers: boolean;
  wrap: boolean;
}

export function lineNumbersExtension(o: Pick<EditorOptions, "lineNumbers" | "relativeLineNumbers">): Extension {
  if (!o.lineNumbers) return [];
  return [o.relativeLineNumbers ? relativeLineNumbers : lineNumbers(), highlightActiveLineGutter()];
}

export function wrapExtension(wrap: boolean): Extension {
  return wrap ? EditorView.lineWrapping : [];
}

/* ---------- Assembly ---------- */

export interface EditorHooks {
  /** Called on every view update (document, selection, viewport). */
  onUpdate: (update: ViewUpdate) => void;
}

/** The full extension set of a Phanes document. */
export function editorExtensions(hooks: EditorHooks, options: EditorOptions): Extension[] {
  return [
    // Vim first: its keys win over every other keymap.
    vimCompartment.of(vimExtension(options.vim)),
    lineNumbersCompartment.of(lineNumbersExtension(options)),
    highlightActiveLine(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    EditorState.allowMultipleSelections.of(true),
    wrapCompartment.of(wrapExtension(options.wrap)),
    indentUnit.of("  "),
    EditorState.tabSize.of(4),
    markdown({
      base: markdownLanguage, // GFM: tables, task lists, strikethrough, autolinks
      codeLanguages: languages, // fenced code highlighted by language (loaded on demand)
      extensions: [phanesMarkdownTags],
      addKeymap: false,
    }),
    syntaxHighlighting(highlighter),
    alertMarkers,
    search({ top: false }),
    highlightSelectionMatches(),
    keymap.of([
      // GNOME's redo shortcut, next to CodeMirror's Ctrl+Y.
      { key: "Mod-Shift-z", run: redo, preventDefault: true },
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.contentAttributes.of({ spellcheck: "false", "aria-label": "Markdown source" }),
    EditorView.updateListener.of(hooks.onUpdate),
  ];
}
