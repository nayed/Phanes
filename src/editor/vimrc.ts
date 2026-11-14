/**
 * The vimrc (docs/VIM.md): `~/.config/phanes/vimrc`, read once at startup.
 * Phanes applies the lines it understands, mappings, `set` and
 * `let mapleader`, through the same Vim API as `:map` and `:set`, and lists
 * the others once in the status bar.
 */
import { Vim } from "@replit/codemirror-vim";
import { readVimrc } from "../lib/fs";
import { useVimStatus } from "../state/vimStatus";

type Context = "normal" | "insert" | "visual";

/** Mapping commands: the modes they map in, and whether the result is mapped again. */
const MAP_COMMANDS: Record<string, { modes: Context[]; noremap: boolean }> = {
  // Like Vim, plain `map` leaves Insert mode alone (`map j gj` must not change typing).
  map: { modes: ["normal", "visual"], noremap: false },
  noremap: { modes: ["normal", "visual"], noremap: true },
  nmap: { modes: ["normal"], noremap: false },
  nnoremap: { modes: ["normal"], noremap: true },
  imap: { modes: ["insert"], noremap: false },
  inoremap: { modes: ["insert"], noremap: true },
  vmap: { modes: ["visual"], noremap: false },
  vnoremap: { modes: ["visual"], noremap: true },
  xmap: { modes: ["visual"], noremap: false },
  xnoremap: { modes: ["visual"], noremap: true },
};

/** Mapping flags that change nothing here. (`<expr>` does; it stays unsupported.) */
const IGNORED_FLAGS = /^<(silent|buffer|nowait|unique)>/i;

/** `set` lines may end with a `"` comment; mappings may not (`"` is a key there). */
const withoutComment = (s: string) => s.replace(/\s+".*$/, "");

/** Apply one `set` argument (`rnu`, `nowrap`, `invnu`, `nu!`, `clipboard=unnamedplus`). False if it can't be. */
function applySetting(arg: string): boolean {
  const assign = /^(\w+)[=:](.*)$/.exec(arg);
  if (assign) return !(Vim.setOption(assign[1], assign[2]) instanceof Error);
  const isBool = (name: string) => typeof Vim.getOption(name) === "boolean";
  const toggle = /^inv(\w+)$/.exec(arg) ?? /^(\w+)!$/.exec(arg);
  if (toggle && isBool(toggle[1])) return !(Vim.setOption(toggle[1], !Vim.getOption(toggle[1])) instanceof Error);
  if (isBool(arg)) return !(Vim.setOption(arg, true) instanceof Error);
  if (arg.startsWith("no") && isBool(arg.slice(2))) return !(Vim.setOption(arg.slice(2), false) instanceof Error);
  return false;
}

/**
 * Vim waits for the next key when a key is both a command and the start of a
 * mapping; the extension doesn't, it runs the command. So a mapping such as
 * `<Space>w` (Space as leader) would never run: drop the built-in commands
 * on the keys a mapping starts with (`<Space>`, which moves right, or `,`).
 */
function freePrefixes(lhs: string, mode: Context): void {
  const keys = lhs.match(/<[^>]+>|./g) ?? [];
  for (let n = 1; n < keys.length; n++) {
    const prefix = keys.slice(0, n).join("");
    Vim.unmap(prefix, undefined as unknown as string); // the built-in for every mode
    Vim.unmap(prefix, mode);
  }
}

/** Apply a vimrc's text; returns the lines that weren't applied. */
export function applyVimrc(text: string): { line: number; text: string }[] {
  const ignored: { line: number; text: string }[] = [];
  let leader = "\\";
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('"')) return;
    const [command, ...rest] = line.split(/\s+/);
    let ok = false;

    // The value itself may be `" "`, so match the quotes before looking for a comment.
    const leaderLine = /^let\s+(?:g:)?mapleader\s*=\s*(["'])(.*?)\1\s*(?:".*)?$/.exec(line);
    if (leaderLine) {
      const value = leaderLine[2].replace(/^\\<(.+)>$/, "<$1>");
      leader = value === " " ? "<Space>" : value;
      ok = !!value;
    } else if (command === "set" || command === "se") {
      const args = withoutComment(rest.join(" ")).split(/\s+/).filter(Boolean);
      // A line counts as applied only if every one of its settings was.
      ok = args.length > 0 && args.map(applySetting).every(Boolean);
    } else if (MAP_COMMANDS[command]) {
      let args = line.slice(command.length).trim();
      while (IGNORED_FLAGS.test(args)) args = args.replace(IGNORED_FLAGS, "").trim();
      const match = /^(\S+)\s+(.+)$/.exec(args);
      if (match && !/^<expr>/i.test(args)) {
        const [lhs, rhs] = [match[1], match[2]].map((keys) => keys.replace(/<leader>/gi, leader));
        const { modes, noremap } = MAP_COMMANDS[command];
        for (const mode of modes) {
          freePrefixes(lhs, mode);
          Vim[noremap ? "noremap" : "map"](lhs, rhs, mode);
        }
        ok = true;
      }
    }
    if (!ok) ignored.push({ line: i + 1, text: line });
  });
  return ignored;
}

/** Read and apply the vimrc, if there is one. Once, at startup, after the options are defined. */
export async function loadVimrc(): Promise<void> {
  let text: string | null;
  try {
    text = await readVimrc();
  } catch (err) {
    useVimStatus.setState({ vimrcIgnored: [{ line: 0, text: String(err) }] });
    return;
  }
  if (text) useVimStatus.setState({ vimrcIgnored: applyVimrc(text) });
}
