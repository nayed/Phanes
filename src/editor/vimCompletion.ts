/**
 * Completion in Vim's `:` command line (docs/VIM.md, "`:e` completion"):
 * paths after `:e`, `:tabe` and `:tabnew`, colorschemes and modes after
 * `:theme`. A popup above the command line lists them, the typed part in
 * bold; Tab puts the highlighted one in and moves to the next, Shift+Tab
 * goes back. Typing again starts over.
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

const MAX_ROWS = 8;

interface Candidate {
  /** What goes into the command line after the command. */
  text: string;
  /** Where the typed part sits inside `text`, to show it in bold. */
  matchFrom: number;
  matchTo: number;
}

/** The command typed so far, split into the part to keep and the part to complete. */
function parse(value: string): { head: string; typed: string; kind: "path" | "scheme" | "mode" } | null {
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
    items.slice(0, MAX_ROWS).forEach((item, i) => {
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
        hint.textContent = "Tab";
        row.appendChild(hint);
      }
      popup.appendChild(row);
    });
  };

  const refresh = async () => {
    const id = ++request;
    applied = -1;
    const parsed = parse(input.value);
    let found: Candidate[] = [];
    if (parsed) {
      head = parsed.head;
      found =
        parsed.kind === "path"
          ? await pathCandidates(parsed.typed)
          : parsed.kind === "scheme"
            ? schemeCandidates(parsed.typed)
            : modeCandidates(parsed.typed);
    }
    if (id !== request) return; // a newer keystroke won
    // A single candidate equal to what's typed has nothing left to offer.
    items = found.length === 1 && parsed && found[0].text === parsed.typed ? [] : found.slice(0, MAX_ROWS);
    render();
  };

  input.addEventListener("input", () => void refresh());
  // Capture, so Tab is handled here before the extension or focus navigation sees it.
  input.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab" || items.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const n = Math.min(items.length, MAX_ROWS);
      applied = e.shiftKey ? (applied <= 0 ? n - 1 : applied - 1) : (applied + 1) % n;
      input.value = head + items[applied].text;
      render();
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
