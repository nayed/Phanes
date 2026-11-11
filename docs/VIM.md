# Phanes — Vim mode

This is the spec for Phanes' optional Vim mode. Read `docs/PHANES.md` first for the overall app, then this file. It replaces the one-line "Vim keybindings" entry under *Later features* in `PHANES.md`.

Design reference: `docs/design/screens/07-vim-mode.png` (static HTML version in `docs/design/html/07-vim-mode.html`). It shows the four states — Normal, Insert, Visual line, Command line — in Gruvbox Light.

---

## Summary

- Vim mode is **off by default** and toggled from the main menu, the **Vim** toggle in the status bar, or the command registry. The setting is remembered.
- It changes the **editor only**. The rest of the app stays the same, except for four touch points: the **status bar** (a mode indicator), a **command line** at the bottom of the editor pane, the **command registry** (ex commands call it), and **keyboard shortcuts** (some Ctrl keys go to Vim while the editor has focus).
- Switching modes must **never shift the layout**. Only the mode pill's text and color, the cursor shape and the selection tint change.

---

## Implementation

### The extension

Use **`@replit/codemirror-vim`** (the maintained Vim extension for CodeMirror 6). It provides motions, operators, text objects, Visual modes, registers, macros, `.` repeat, marks and `/` `?` search. Do not reimplement any of that.

```ts
import { vim, Vim, getCM } from "@replit/codemirror-vim";
```

- Load `vim()` inside a **CodeMirror `Compartment`** in `src/editor/extensions.ts`, so it can be turned on and off live with `view.dispatch({ effects: vimCompartment.reconfigure(enabled ? vim() : []) })` without recreating the editor or losing the undo history.
- `vim()` must come **before other keymaps** in the extension list.
- If the editor doesn't use `basicSetup`, make sure `drawSelection()` is included, or Visual mode selections won't render.
- `getCM(view)` gives the CM5-style object the extension exposes. Use it to listen for mode changes and read Vim state.
- Every editor instance (one per tab) needs the extension. The Vim API (`Vim.defineEx`, `Vim.map`…) is global: register ex commands and mappings **once** at startup, not per tab.

### Reading the mode

```ts
const cm = getCM(view);
cm.on("vim-mode-change", (e: { mode: string; subMode?: string }) => {
  // e.mode: "normal" | "insert" | "visual" | "replace"
  // e.subMode for visual: "linewise" | "blockwise" (absent = charwise)
});
```

- Map `visual` + `subMode` to `VISUAL`, `V-LINE` or `V-BLOCK`.
- While the `:` / `/` / `?` command line is open, show `COMMAND` (the extension stays in Normal mode internally; derive this from the command line being open).
- **Pending keys** (e.g. `2d` while waiting for a motion, or `"a` while choosing a register) are in `cm.state.vim.status`. The extension doesn't emit an event for this, so read it after each key: listen for keydown on the editor DOM (or use a CodeMirror update listener) and read `cm.state.vim.status` on the next frame.
- **Macro recording**: show `recording @q` while recording (read from the Vim state; if the extension exposes no clean hook, read the macro-recording flag from `cm.state.vim` and check the extension source for its name).

Keep this state in the app store (`state/`) per tab, so the status bar re-renders when the active tab changes.

---

## Settings

| Setting | Default | Where it's set |
| --- | --- | --- |
| `editor.vimMode` | off | Main menu checkbox **Vim Mode**; the **Vim** toggle in the status bar; command `editor.toggleVim` |
| `editor.vimSystemClipboard` | on | Main menu → Vim Mode options, or `:set clipboard=unnamedplus` / `:set clipboard=` |
| `editor.relativeLineNumbers` | off | Main menu, or `:set rnu` / `:set nornu` |

All three persist like the other settings. Relative line numbers work with or without Vim mode (current line shows its absolute number, the others show distance).

Register in the command registry:

| Id | Label | Shortcut |
| --- | --- | --- |
| `editor.toggleVim` | Vim Mode | none by default |
| `editor.toggleRelativeNumbers` | Relative Line Numbers | none |

---

## What changes on screen

See `07-vim-mode.png` for all of these.

### 1. Mode pill in the status bar

- At the **far left** of the status bar, **before the file path**, touching the left edge, full status bar height (30 px), 12 px horizontal padding.
- Text: `NORMAL`, `INSERT`, `VISUAL`, `V-LINE`, `V-BLOCK`, `REPLACE`, `COMMAND`. JetBrains Mono 11 px, weight 700, letter-spacing 0.06em, uppercase.
- Background and text colors come from the active colorscheme (table below).
- **Pending keys** appear right after the pill in JetBrains Mono 12 px semi-bold, main text color (e.g. `2d`). Hidden when empty.
- **Recording**: `recording @q` in the same spot, muted text color.
- In Visual modes, the status bar's free space (where the word count usually is) shows the selection size: `3 lines selected`, or `14 characters selected` for charwise.
- When Vim mode is **off**, the pill and these extras are not rendered at all; only the **Vim** toggle remains, struck through.

### 1b. Vim toggle in the status bar

- Right-aligned, just left of the "Synced scroll" toggle, and styled the same: a keyboard icon and the word **Vim**, 12 px muted text, struck through and dimmed when Vim mode is off.
- Clicking it runs `editor.toggleVim`, like the main menu's **Vim Mode** checkbox. Its tooltip says "Vim mode is on" or "Vim mode is off".

### 2. Cursor shape

| Mode | Cursor |
| --- | --- |
| Normal, Visual | **Block** over the character. Background `--link` at 85% opacity, the character drawn in `--window` color so it stays readable. 1 px radius. |
| Insert | **Bar**, 2 px wide, `--link`, same as the editor without Vim. |
| Replace | **Underline**, 2 px tall, `--vim-replace`. |

The extension draws its own block cursor; restyle it in the editor theme rather than drawing a new one. The cursor does not blink in Normal mode.

### 3. Selection tint

- Visual mode selections (all three kinds) use `--vim-visual` at **20% opacity** for the selected text or lines, so the selection matches the pill's color.
- Line numbers of selected lines use the main text color, like the current line.
- Outside Vim mode, keep the normal selection color.

### 4. Command line

- A bar **at the bottom of the editor pane** (not the whole window), above the status bar. 28 px tall, `--surface` background, 1 px top border in `--border`, 14 px horizontal padding.
- JetBrains Mono 14 px. The prompt character (`:`, `/`, `?`) in `--vim-command`, bold. Text in `--fg`, cursor as a 2 px `--link` bar.
- The extension already renders its command line as a CodeMirror panel with the class **`.cm-vim-panel`**: restyle that rather than building a new one.
- It opens on `:`, `/`, `?` and closes on Enter or Escape. Opening it never resizes the preview pane.
- **Search** (`/`, `?`): show the match count on the right of the bar, `3/12`, muted text. With Vim on, `/` replaces the Ctrl+F search panel; with Vim off, Ctrl+F works as today.
- Search matches use the existing search highlight; the current match is stronger.
- Errors (unknown command, pattern not found) show in the same bar in `--danger` for 2 seconds, e.g. `E492: Not an editor command: foo`.

### 5. `:e` and `:theme` completion

- While typing `:e `, `:tabe ` or `:tabnew `, show a small popup **above the command line**, left-aligned with it: folders and markdown files next to what's typed (relative to the current file's folder, like the command itself), folders ending in `/`; names that start with the typed part first, then names that contain it; at most 8.
- After `:theme `, the same popup lists the colorschemes (alphabetical); after a scheme name, `light`, `dark` and `system`.
- Popup: `--menu-bg`, 1 px `--border`, 10 px radius, popover shadow, 5 px padding, rows 28 px in JetBrains Mono 13 px, the matched part bold, the selected row in `--menu-hover` with a right-aligned muted `Tab` hint.
- The highlighted row is the one Tab puts in: Tab accepts it and moves to the next on the following press, Shift+Tab cycles back. Typing again starts over (so after Tab puts `projects/` in, typing `mar` lists what's inside).
- The extension has no completion hook for its command line, so this is custom (`src/editor/vimCompletion.ts`): it listens to the input inside `.cm-vim-panel`.

---

## Mode colors

Add five pairs of CSS variables to every colorscheme block in `src/styles/tokens.css`:

`--vim-normal`, `--vim-insert`, `--vim-visual`, `--vim-replace`, `--vim-command` (pill backgrounds), and `--vim-pill-fg` (pill text, one value per scheme variant).

The values below come from each scheme's own palette. Where the scheme's original color was too light for readable pill text, it has been darkened slightly (all pairs reach at least 4.5:1).

| Scheme | `--vim-pill-fg` | Normal | Insert | Visual | Replace | Command |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub Light | `#ffffff` | `#59636e` | `#1a7f37` | `#8250df` | `#cf222e` | `#bc4c00` |
| GitHub Dark | `#0d1117` | `#9198a1` | `#3fb950` | `#d2a8ff` | `#ff7b72` | `#ffa657` |
| Gruvbox Light | `#fbf1c7` | `#665c54` | `#726e0d` | `#8f3f71` | `#9d0006` | `#af3a03` |
| Gruvbox Dark | `#1d2021` | `#a89984` | `#b8bb26` | `#d3869b` | `#fb4934` | `#fe8019` |
| Catppuccin Latte | `#eff1f5` | `#66697e` | `#307a20` | `#8839ef` | `#d20f39` | `#b84805` |
| Catppuccin Mocha | `#1e1e2e` | `#9399b2` | `#a6e3a1` | `#cba6f7` | `#f38ba8` | `#fab387` |
| Everforest Light | `#fdf6e3` | `#5c6a72` | `#657300` | `#ab4f8e` | `#be403d` | `#a95518` |
| Everforest Dark | `#232a2e` | `#9da9a0` | `#a7c080` | `#d699b6` | `#e67e80` | `#e69875` |
| Horizon Bright | `#fdf0ed` | `#504c50` | `#147e57` | `#8a31b9` | `#da103f` | `#b84c16` |
| Horizon | `#1c1e26` | `#9ea0a3` | `#29d398` | `#b877db` | `#e95678` | `#fab795` |

Any future colorscheme must define these too, and check the pill text contrast (4.5:1).

---

## Ex commands

Register these once at startup with `Vim.defineEx(name, prefix, handler)`. Each handler calls the **command registry**, never duplicated logic, so menus, shortcuts and ex commands always behave the same.

| You type | Runs (registry id) | Notes |
| --- | --- | --- |
| `:w` | `file.save` | `:w path` → `file.saveAs` to that path, relative to the file's folder |
| `:wa` | save all modified tabs | |
| `:q` | `tab.close` | Asks Save / Discard / Cancel as usual if modified. `:q!` closes without asking. |
| `:wq`, `:x` | `file.save` then `tab.close` | `:x` only saves if modified |
| `:qa` | close all tabs | `:qa!` discards everything, then quits |
| `:e path` | open in a tab (or focus it) | Path relative to the current file's folder; `:e` alone reloads from disk (asks if modified) |
| `:tabnew [path]`, `:tabe [path]` | `file.new` or open | |
| `:tabn`, `:tabp` | `tab.next`, `tab.previous` | Also map `gt` / `gT` in Normal mode to these |
| `:Ex`, `:Explore` | focus the workspace sidebar | Shows it first if hidden |
| `:set wrap` / `:set nowrap` | editor line wrapping | |
| `:set rnu` / `:set nornu`, `:set nu` / `:set nonu` | `editor.toggleRelativeNumbers` / line numbers | |
| `:set clipboard=unnamedplus` / `:set clipboard=` | `editor.vimSystemClipboard` | |
| `:theme name` | colorscheme | Phanes extra. `:theme gruvbox`, `:theme catppuccin dark`; Tab-completes scheme names. |
| `:noh` | clear search highlight | Built into the extension |

`gt` / `gT`: use `Vim.defineAction` + `Vim.mapCommand` (or `Vim.map("gt", ":tabn<CR>")`) so they go through the same commands.

Use `Vim.defineOption` for the `:set` options so `:set wrap?` reports the current value.

---

## Keyboard conflicts

**Rule: while the editor has focus and Vim mode is on, Vim gets the key.** App commands stay reachable through ex commands, menus and the future command palette.

Implementation: the app-level shortcut handler (in `src/commands/`) checks whether focus is inside the editor and Vim mode is on, and if so lets the keys below pass to CodeMirror instead of running the app command.

| Key | Vim | App command it overrides | Reach the app command with |
| --- | --- | --- | --- |
| `Ctrl+W` | window commands | Close Tab | `:q`, the tab's ✕, middle-click |
| `Ctrl+V` | Visual block | Paste | `p` / `"+p` |
| `Ctrl+R` | redo | — | |
| `Ctrl+O` | jump back | Open Folder | main menu, `:Ex` |
| `Ctrl+N` | completion / next | New File | `:tabnew`, sidebar right-click |
| `Ctrl+D`, `Ctrl+U` | half-page scroll | — | |
| `Ctrl+F`, `Ctrl+B` | page scroll | Find | `/` |
| `Ctrl+A`, `Ctrl+X` | increment / decrement | Select all / Cut | `ggVG`, `d` |
| `Esc` | back to Normal | — | **Never** also closes a menu or moves focus out of the editor |

These stay **app shortcuts** even in Vim mode, because Vim doesn't use them: `Ctrl+S`, `Shift+Ctrl+S`, `Ctrl+Tab`, `Shift+Ctrl+Tab`, `Ctrl+PageUp/PageDown`, `Ctrl+1/2/3`, `F9`, `Ctrl+Q`, `Ctrl+?`, `Shift+Ctrl+P` (future palette), `Ctrl+P` (future quick open).

When focus is outside the editor (sidebar, preview, menus), all app shortcuts work as usual, Vim on or off.

The **Keyboard Shortcuts** dialog gets a "Vim mode" section listing the overridden keys and the ex commands above.

---

## Clipboard

The extension keeps its own registers, separate from the system clipboard.

- With `editor.vimSystemClipboard` **on** (default), the unnamed register is synced with the system clipboard: `y`, `d`, `c` copy to it and `p` / `P` paste from it, so yanking and pasting works with other apps. This is Vim's `clipboard=unnamedplus`.
- With it **off**, registers behave like plain Vim, and `"+y` / `"+p` still reach the system clipboard explicitly.
- Use Tauri's clipboard plugin (`@tauri-apps/plugin-clipboard-manager`) for reads and writes, not `navigator.clipboard`, which is unreliable in WebKitGTK.

---

## Unchanged

- Synced scroll keeps working: Vim motions move the cursor and scroll the editor like any other movement.
- Unsaved-change tracking, tabs, the sidebar, the preview, colorschemes and the light/dark/system mode button behave exactly as without Vim.
- Undo history is shared: `u` / `Ctrl+R` and the app's undo use the same CodeMirror history.

---

## Later (not now)

- **A `vimrc`**: read `~/.config/phanes/vimrc` at startup and apply `map`, `noremap`, `imap`, `nmap`, `vmap` and `set` lines with `Vim.map` / `Vim.noremap` / the options above (e.g. `imap jk <Esc>`). Ignore anything else, and report unsupported lines in the status bar once.
- **Vim keys outside the editor**: `j` / `k` / `gg` / `G` / `Ctrl+D` / `Ctrl+U` to scroll the preview when it has focus, and `j` / `k` / `Enter` / `h` / `l` to move through and expand the sidebar tree.

---

## Done means

- The Vim Mode checkbox switches Vim on and off immediately in every open tab, without losing undo history or cursor position, and the choice survives a restart.
- The mode pill, cursor shape, selection tint and command line match `07-vim-mode.png` in Gruvbox Light, and use the right colors in every other scheme and in dark mode.
- Pending keys show while typing `2d`, `"a`, `ci`; `recording @q` shows while recording.
- Every ex command in the table works and goes through the command registry (`:q` on a modified tab asks before closing).
- The Ctrl keys in the conflicts table reach Vim when the editor has focus, and the app shortcuts in the keep list still work.
- Escape in the editor never closes a menu, leaves the editor or triggers anything outside it.
- Yank in Phanes, paste in another app (and back) works with the system clipboard option on.
- With Vim mode off, nothing in this document is visible and every shortcut behaves as before.
- `npm run typecheck` and `cargo test` pass.
