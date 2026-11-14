/**
 * Completion in Vim's `:` command line (docs/VIM.md, "Command line
 * completion"): command names on Tab, paths after `:e`, `:tabe` and
 * `:tabnew`, colorschemes and modes after `:theme`. A popup above the
 * command line lists them, the typed part in bold; Tab puts the highlighted
 * one in and moves to the next, Shift+Tab goes back. Typing again starts over.
 *
 * The extension has no completion hook, so this listens to the prompt's
 * input directly (vim.ts hands each `:` prompt over).
 */
import { SCHEMES_BY_NAME } from "../app/theme";
import { listDir } from "../lib/fs";
import { dirname, expandHome, resolve } from "../lib/path";
import { activeTab } from "../state/tabs";
import { useWorkspace } from "../state/workspace";
import { onCommandPrompt } from "./vim";

/** Rows the popup shows before it scrolls (editor.css). */
const VISIBLE_ROWS = 10;

/**
 * The ex commands Tab offers: Phanes' own (vimCommands.ts) and the
 * extension's built-ins that do something here. (The extension doesn't
 * expose its list, and some of its commands, like `:colorscheme`, do nothing
 * in Phanes.) Full names; Vim's short forms (`:w`) still work when typed.
 */
const EX_COMMANDS = [
  // Phanes
  "write", "wall", "quit", "wq", "xit", "qall", "edit", "tabnew", "tabedit", "tabnext", "tabprevious",
  "Explore", "theme",
  // The extension
  "set", "map", "nmap", "imap", "vmap", "noremap", "nnoremap", "inoremap", "vnoremap", "unmap", "mapclear",
  "undo", "redo", "substitute", "global", "vglobal", "sort", "nohlsearch", "normal", "delete", "yank", "put",
  "join", "marks", "delmarks", "registers",
].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

interface Candidate {
  /** What goes into the command line after the command. */
  text: string;
  /** Where the typed part sits inside `text`, to show it in bold. */
  matchFrom: number;
  matchTo: number;
}

/** The command typed so far, split into the part to keep and the part to complete. */
function parse(value: string): { head: string; typed: string; kind: "command" | "path" | "scheme" | "mode" } | null {
  const command = /^(\s*)([A-Za-z]*)$/.exec(value);
  if (command) return { head: command[1], typed: command[2], kind: "command" };
  const path = /^(\s*(?:e|ed|edi|edit|tabe|tabed|tabedi|tabedit|tabnew)\s+)(.*)$/.exec(value);
  if (path) return { head: path[1], typed: path[2], kind: "path" };
  const mode = /^(\s*theme\s+\S+\s+)(\S*)$/.exec(value);
  if (mode) return { head: mode[1], typed: mode[2], kind: "mode" };
  const scheme = /^(\s*theme\s+)(\S*)$/.exec(value);
  if (scheme) return { head: scheme[1], typed: scheme[2], kind: "scheme" };
  return null;
}

/** Names that start with what was typed first, then names that contain it. */
function rank(names: string[], typed: string, prefix = ""): Candidate[] {
  const t = typed.toLowerCase();
  const starts: Candidate[] = [];
  const contains: Candidate[] = [];
  for (const name of names) {
    const at = name.toLowerCase().indexOf(t);
    if (at < 0) continue;
    const candidate = { text: prefix + name, matchFrom: prefix.length + at, matchTo: prefix.length + at + t.length };
    (at === 0 ? starts : contains).push(candidate);
  }
  return [...starts, ...contains];
}

/** Folders and markdown files next to the path being typed, relative to the current file's folder. */
async function pathCandidates(typed: string): Promise<Candidate[]> {
  const tab = activeTab();
  const base = tab?.path ? dirname(tab.path) : useWorkspace.getState().root;
  if (!base) return [];
  const slash = typed.lastIndexOf("/");
  const folderPart = typed.slice(0, slash + 1);
  const namePart = typed.slice(slash + 1);
  const folder = resolve(base, expandHome(folderPart || "."));
  let entries;
  try {
    entries = await listDir(folder);
  } catch {
    return [];
  }
  const names = entries
    .filter((e) => e.kind === "directory" || e.kind === "markdown")
    .map((e) => (e.kind === "directory" ? `${e.name}/` : e.name));
  return rank(names, namePart, folderPart);
}

/** Command names starting with what was typed (any case: `ex` finds `Explore`). */
function commandCandidates(typed: string): Candidate[] {
  return rank(EX_COMMANDS, typed).filter((c) => c.matchFrom === 0);
}

function schemeCandidates(typed: string): Candidate[] {
  return rank([...SCHEMES_BY_NAME], typed);
}

function modeCandidates(typed: string): Candidate[] {
  return rank(["light", "dark", "system"], typed);
}

/** The popup for one command line. */
function attach(input: HTMLInputElement, panel: HTMLElement): void {
  const popup = document.createElement("div");
  popup.className = "cm-vim-completion";
  popup.setAttribute("role", "listbox");
  popup.hidden = true;
  panel.appendChild(popup);

  let head = "";
  let items: Candidate[] = [];
  /** The row Tab put in, or -1 before the first Tab (row 0 is then highlighted as the next one). */
  let applied = -1;
  let request = 0;

  const render = () => {
    popup.replaceChildren();
    popup.hidden = items.length === 0;
    const current = applied < 0 ? 0 : applied;
    let selected: HTMLElement | null = null;
    items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "cm-vim-completion-row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(i === current));
      const label = document.createElement("span");
      label.className = "cm-vim-completion-label";
      const strong = document.createElement("b");
      strong.textContent = item.text.slice(item.matchFrom, item.matchTo);
      label.append(item.text.slice(0, item.matchFrom), strong, item.text.slice(item.matchTo));
      row.appendChild(label);
      if (i === current) {
        const hint = document.createElement("span");
        hint.className = "cm-vim-completion-hint";
        hint.textContent = items.length > VISIBLE_ROWS ? `Tab  ${i + 1}/${items.length}` : "Tab";
        row.appendChild(hint);
        selected = row;
      }
      popup.appendChild(row);
    });
    // The list scrolls to keep the highlighted row in view (only the list: not the editor behind it).
    const row = selected as HTMLElement | null;
    if (row) {
      const pad = 5;
      if (row.offsetTop - pad < popup.scrollTop) popup.scrollTop = row.offsetTop - pad;
      else if (row.offsetTop + row.offsetHeight + pad > popup.scrollTop + popup.clientHeight)
        popup.scrollTop = row.offsetTop + row.offsetHeight + pad - popup.clientHeight;
    }
  };

  /**
   * Find the candidates for what's typed. Command names only on Tab: a popup
   * at every letter of `:w` would be in the way.
   */
  const refresh = async (onTab = false) => {
    const id = ++request;
    applied = -1;
    const parsed = parse(input.value);
    let found: Candidate[] = [];
    if (parsed) {
      head = parsed.head;
      found =
        parsed.kind === "command"
          ? onTab
            ? commandCandidates(parsed.typed)
            : []
          : parsed.kind === "path"
            ? await pathCandidates(parsed.typed)
            : parsed.kind === "scheme"
              ? schemeCandidates(parsed.typed)
              : modeCandidates(parsed.typed);
    }
    if (id !== request) return; // a newer keystroke won
    // A single candidate equal to what's typed has nothing left to offer.
    items = found.length === 1 && parsed && found[0].text === parsed.typed ? [] : found;
    render();
  };

  /** Put the next (or previous) candidate in the command line. */
  const step = (back: boolean) => {
    const n = items.length;
    applied = back ? (applied <= 0 ? n - 1 : applied - 1) : (applied + 1) % n;
    input.value = head + items[applied].text;
    render();
  };

  input.addEventListener("input", () => void refresh());
  // Capture, so Tab is handled here before the extension or focus navigation sees it.
  input.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab") return;
      if (items.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        step(e.shiftKey);
        return;
      }
      // Nothing listed yet (`:` or `:ta` then Tab): look now, then put in the first one.
      if (!parse(input.value)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const back = e.shiftKey;
      void refresh(true).then(() => {
        if (items.length) step(back);
      });
    },
    true,
  );
}

let installed = false;

/** Turn on completion for Vim's command line. Once, at startup. */
export function installVimCompletion(): void {
  if (installed) return;
  installed = true;
  onCommandPrompt(attach);
}
