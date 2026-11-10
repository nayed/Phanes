# Phanes — project brief

Phanes is a desktop markdown editor and reader. You write markdown on the left and see GitHub-style rendering on the right, inside a workspace folder shown as a file tree.

It is a personal tool with one user, its author. It is not a commercial product. It only needs to run well on **Linux (Debian and Arch), under GNOME (Wayland)**. There is no Windows or macOS target (yet), no accounts, no telemetry and no network access at runtime.

This file is the source of truth. Read it fully, look at the screens in `design/screens/`, then build the first version described in [Scope of version 1](#scope-of-version-1).

---

## What's in this folder

| Path | What it is |
| --- | --- |
| `PHANES.md` | This brief. |
| `design/screens/*.png` | The approved designs, rendered at 2× (1440 px wide windows). **Match these.** |
| `design/html/*.html` | The same screens as static HTML. Open them to read exact sizes, spacing and colors. They are a visual reference, not code to copy. |
| `icons/io.nayed.Phanes.svg` | Full-color app icon (128 px grid, scalable). |
| `icons/io.nayed.Phanes-symbolic.svg` | One-color symbolic icon (16 px grid) for the GNOME top bar and notifications. |
| `icons/phanes-1024.png` | 1024 px source for `npx tauri icon` to generate Tauri's icon set. |
| `sample-workspace/` | A small folder to open during development (`phanes docs/sample-workspace`). `notes.md` is the exact document shown in the designs; `projects/markdown-editor.md` exercises every GFM feature. |

The screens:

| Screen | Shows |
| --- | --- |
| `01-main-light` | The main window: workspace sidebar, tabs, split editor and preview, status bar. GitHub Light Default. |
| `02-main-dark` | The same window in GitHub Dark Default. |
| `03-workspace-context-menu` | Right-click menu open on a folder in the sidebar. |
| `04-editor-only` | Editor view mode. |
| `05-preview-only` | Preview (reading) view mode, document centered. |
| `06-app-icon-directions` | Icon exploration; the chosen icon is "navy cosmic egg (A2)" (marked Pick). Use the files in `icons/`, not this image. |
| `07-vim-mode` | Vim mode's four states (Normal, Insert, Visual line, Command line) in Gruvbox Light. Specified in [`VIM.md`](VIM.md). |

---

## Tech stack (decided)

| Area | Choice | Notes |
| --- | --- | --- |
| App shell | **Tauri 2** | Uses WebKitGTK on Linux. Binary name `phanes`, app identifier `io.nayed.Phanes`, product name `Phanes`. |
| UI | **React + TypeScript + Vite** | Function components and hooks. Keep state simple (React state/context or a small store like Zustand); no heavy framework. |
| Editor | **CodeMirror 6** | `@codemirror/lang-markdown` with the GFM extensions. Never a plain `<textarea>`: later features (vim mode, focus mode, synced scroll) are CodeMirror extensions. |
| Markdown → HTML | **unified**: `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-sanitize` → `rehype-stringify` | Each later feature (math, Mermaid, front matter) is one more plugin. Add a plugin for GitHub alerts (`> [!NOTE]` etc.). |
| Code highlighting in preview | **Shiki** with themes `github-light-default` / `github-dark-default` | These are the exact GitHub colors and match the app colorscheme. |
| Fonts | **Inter** (interface and preview), **JetBrains Mono** (editor and code) | Bundle both locally with `@fontsource/*`. No Google Fonts or any other network request. |
| Icons in the UI | **lucide-react** | 2 px stroke line icons, matching the designs (folder, file, file-text, image, chevrons, x, plus, menu, panel-left, minus, square, info). |
| Rust side | Tauri commands for all file access; `notify` crate reserved for the later file watcher; `trash` crate for Move to Trash | |
| Packaging | `.deb`, `.rpm` and AppImage from the Tauri bundler | Arch can use the AppImage or a simple PKGBUILD later. |

---

## Architecture foundations

These five rules exist so that every feature on the [later list](#later-features-not-version-1) can be added without rewriting anything. Follow them from the first commit.

1. **CodeMirror 6 for editing.** All editor behavior (highlighting, line numbers, current line, keymaps) is configured as CodeMirror extensions in one module, e.g. `src/editor/extensions.ts`.
2. **A plugin pipeline for markdown.** One module, e.g. `src/markdown/render.ts`, builds the unified processor from an array of plugins. Adding a feature = adding to that array. Rendering must keep source line positions (add `data-line` attributes to block elements) for synced scroll.
3. **Colors only through CSS variables.** Every color in the UI and the preview comes from a variable defined per colorscheme (see [Design tokens](#design-tokens)). No hex values inside components. A new colorscheme is a new block of variable values.
4. **All file access in one place.** Reading, writing, listing, renaming, trashing and watching files happen in Rust, exposed as Tauri commands from one module (e.g. `src-tauri/src/fs.rs`), and called from one TypeScript module (e.g. `src/lib/fs.ts`). Components never call the filesystem directly.
5. **One command registry.** Every user action is defined once with an id, a label, an optional shortcut and a handler (e.g. `src/commands/registry.ts`). The main menu, the right-click menu, keyboard shortcuts and the future command palette all read from it. See [Commands](#commands).

Also from day one: the `phanes` binary reads its command-line arguments (see [Command line](#command-line)).

Suggested layout:

```
phanes/
├── docs/                      # this folder
├── src/
│   ├── app/                   # App shell, layout, window chrome
│   ├── components/            # HeaderBar, Sidebar, FileTree, Tabs, StatusBar, ContextMenu…
│   ├── editor/                # CodeMirror setup and extensions
│   ├── markdown/              # unified pipeline and preview component
│   ├── commands/              # command registry and keybindings
│   ├── lib/fs.ts              # the only module that talks to Rust for files
│   ├── state/                 # workspace, tabs, settings
│   └── styles/                # tokens.css (colorschemes), base.css, preview.css
└── src-tauri/
    └── src/                   # main.rs, fs.rs, cli handling
```

---

## Scope of version 1

### Window and header bar

GNOME/libadwaita look. Use a custom title bar (`decorations: false` with `data-tauri-drag-region` on the header) so the header bar matches the design. The window has rounded corners (12 px) and the system shadow.

Header bar, 48 px tall, from left to right:

- **Sidebar toggle** (panel-left icon). Shows and hides the workspace sidebar. Shown in its pressed state while the sidebar is visible.
- **Title**, centered: the active file's name in bold, and below it the workspace path and save state, e.g. `~/notes · Saved` or `~/notes · Unsaved changes`. Abbreviate the home directory as `~`.
- **View switcher**: a segmented control with *Editor*, *Split*, *Preview*. The active segment is raised (window background, small shadow, semi-bold).
- **Main menu** (hamburger). Items: Open Folder…, New File, Save, Save As…, Color scheme ▸ (Follow System / Light / Dark), Show Sidebar, Keyboard Shortcuts, About Phanes, Quit.
- **Window controls**: minimize, maximize/restore, close. Round 24 px buttons with 12 px icons, 10 px apart, on the right.

Dragging the header moves the window; double-clicking it toggles maximize.

### Workspace sidebar (left)

264 px wide, separated from the editor by a 1 px border. Matches `01-main-light`.

- **Header**: a small uppercase "Workspace" label, the workspace path below it (`~/notes`), and a button on the right to choose a different folder (opens GNOME's own folder chooser through the desktop portal, via the Tauri dialog plugin).
- **File tree** of the workspace folder: folders first, then files, each alphabetical and case-insensitive. Hide dotfiles and `.git`, `node_modules`. Folders expand and collapse with a chevron; remember which are expanded per workspace.
- Show markdown files (`.md`, `.markdown`) with a file-text icon and images with an image icon. Other files can be hidden in version 1.
- Rows are 30 px tall, indented 18 px per level. The file open in the active tab is highlighted (accent tint background, accent text, semi-bold).
- Clicking a markdown file opens it in a tab (or focuses its tab if already open).
- **Right-click menu** (see `03-workspace-context-menu`), anchored at the pointer, with the clicked row highlighted:
  - New File (`Ctrl+N`), New Folder (`Shift+Ctrl+N`), created inside the clicked folder (or next to the clicked file), then put straight into inline rename.
  - Rename (`F2`), inline in the tree.
  - Duplicate.
  - Copy Path (`Shift+Ctrl+C`), the absolute path to the clipboard.
  - Open in Files, which reveals the item in the GNOME file manager.
  - Move to Trash (`Delete`), shown in the danger color. Moves to the system trash, never a permanent delete. Closes any tab for that file (asking first if it has unsaved changes).
  - Right-clicking empty space in the tree offers New File and New Folder at the workspace root.
- The menu is a GNOME-style popover: 12 px radius, 6 px padding, 32 px items, a separator between groups, shortcuts right-aligned in the muted color. It is keyboard-navigable (arrows, Enter, Escape).
- Refresh the tree after any change Phanes makes. Picking up changes made outside the app is a later feature.
- Remember the last workspace and reopen it on launch when no argument is given.

### Tabs

A tab strip above the editor and preview, to the right of the sidebar, as in `01-main-light`.

- One tab per open file. The tab shows a file icon and the file name; hovering shows the full path as a tooltip.
- The active tab is raised (window background, small shadow, semi-bold, normal text color); inactive tabs are flat with muted text.
- A tab with unsaved changes shows a dot in place of its close button. Clean tabs show a close ✕.
- A **+** button after the last tab creates a new untitled document. Saving it asks for a name and location (default: the workspace root).
- Closing a tab with unsaved changes asks: Save, Discard, or Cancel. The same applies when quitting.
- Middle-click closes a tab. `Ctrl+W` closes the active tab, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle tabs, `Ctrl+PageUp` / `Ctrl+PageDown` too.
- Reopen the previous session's tabs on launch.

### Editor

- CodeMirror 6 with markdown + GFM syntax highlighting, styled like the designs:
  - Markdown punctuation (`#`, `**`, `_`, `|`, `[`, `](`, `- [ ]`, fences) in the muted "mark" color.
  - Headings in the heading color and semi-bold.
  - Bold, italic and strikethrough applied to the text itself.
  - Inline code in the code color; link and image URLs in the link color, underlined; image paths in the string color.
  - Fenced code blocks highlighted by language.
- JetBrains Mono 14 px, 24 px line height. Line numbers in a 52 px gutter, right-aligned, muted; the current line number in the main text color. The current line has a subtle background tint.
- Soft line wrapping on. Standard keybindings (undo/redo, search with `Ctrl+F`, indent with Tab).
- Track the cursor position and word count for the status bar.

### Preview

- Live: re-render as you type, debounced (about 150 ms).
- Styled like GitHub's markdown rendering, using the app's CSS variables: Inter 15 px with 1.6 line height, headings with a bottom border on H1 and H2, 720 px max width centered in the pane, 28–36 px padding.
- Full GFM: tables, task lists (rendered as disabled checkboxes), strikethrough, autolinks, footnotes, and GitHub alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) with their icon, title and colored left rule.
- Code blocks highlighted by Shiki with the theme matching the current mode.
- **Images with relative paths** resolve against the open file's folder and load through Tauri's asset protocol (`convertFileSrc`). Configure the asset protocol scope to the workspace.
- **Links** (including image links like `[![alt](img.png)](https://…)`) open in the default browser via the Tauri opener plugin, never inside the app. Relative links to other `.md` files open them in a tab.
- **Sanitize** the HTML (`rehype-sanitize` with GitHub's schema, extended for the classes Shiki and alerts need). No script ever runs from a document. `sample-workspace/projects/markdown-editor.md` includes a `<script>` to check this.

### View modes

- **Split** (default): editor and preview side by side, 50/50, separated by a 1 px border.
- **Editor**: the editor fills the area.
- **Preview**: the preview fills the area, the document centered at its reading width.
- Switch with the header's segmented control or `Ctrl+1` / `Ctrl+2` / `Ctrl+3`. Remember the last mode.
- The sidebar and tabs stay visible in all three modes.

### Synced scroll (basic)

In Split mode, scrolling the editor scrolls the preview to the matching block, using the `data-line` positions from rendering. Scrolling the preview should move the editor the same way. A toggle in the status bar turns it on and off (on by default).

### Status bar

30 px tall, along the bottom of the window, 12 px muted text, items 20 px apart:

`UTF-8` · `Ln 22, Col 42` · `64 words` (preceded by the Vim mode pill when Vim mode is on, see [`VIM.md`](VIM.md)) … then, aligned right, the Vim mode toggle (keyboard icon + "Vim", struck through when off, like the synced-scroll toggle), the synced-scroll toggle (arrows icon + "Synced scroll") and the colorscheme name (`GitHub Default` with a small up chevron), which opens the colorscheme picker, followed by an icon-only color mode button: each click moves to the next of Follow System (monitor icon), Light (sun) and Dark (moon), in a loop.

#### Colorscheme picker

A command-palette-style popover that opens above the colorscheme name, right-aligned with it. It scales to twenty colorschemes.

- **Search field** at the top ("Search color schemes"), focused on open: typing filters the list by name.
- **One row per colorscheme**: a color strip (its background, red, green, blue and text colors), the name, and on the right `Current` for the chosen colorscheme (its name in semi-bold) or `Previewing` for the highlighted one.
- **Key hints** at the bottom: `↑↓ preview`, `Enter apply`, `Esc revert`.
- **Live preview:** the arrow keys move the highlight, and the highlighted colorscheme is shown on the whole window right away, without being saved. The status bar keeps showing the chosen one.
- **Enter** or a click applies the highlighted colorscheme and closes the picker. **Escape**, clicking elsewhere or leaving the window closes it and goes back to the chosen colorscheme.
- **The preview keeps the current mode.** Previewing Catppuccin in Light mode shows Catppuccin Latte, and in Dark mode Catppuccin Mocha.
- **The strips show the variant on screen.** In Light or Dark mode, every strip shows that variant. With Follow System, they show whichever variant GNOME is currently using.

### Files

- Open, edit and save UTF-8 markdown files. `Ctrl+S` saves, `Ctrl+Shift+S` saves as.
- Keep the file's line endings when saving.
- Track unsaved state per tab, shown in the tab and the header subtitle.
- No autosave in version 1.

### Theming

- Four colorschemes: **GitHub Default**, **Gruvbox**, **Catppuccin** (Latte for light, Mocha for dark) and **Everforest**, each in light and dark variants (see [Design tokens](#design-tokens)). Pick one from the main menu's Color Scheme submenu or from the status bar.
- Default to following the system: GNOME's dark style preference arrives through `prefers-color-scheme` in WebKitGTK. The main menu can force Light or Dark. Remember the choice.
- Structure the CSS so another colorscheme (Tokyo Night, Nord…) is one more set of variable values.

### Command line

```
phanes                    # reopen the last workspace and tabs
phanes notes.md           # open the file; its folder becomes the workspace
phanes ~/notes            # open the folder as the workspace
phanes .                  # same, for the current directory
```

Resolve relative paths against the current working directory. A path that doesn't exist opens a new unsaved file at that path. Use Tauri's CLI plugin or `std::env::args` in Rust.

### Desktop integration

- Install the icons as `share/icons/hicolor/scalable/apps/io.nayed.Phanes.svg` and `share/icons/hicolor/symbolic/apps/io.nayed.Phanes-symbolic.svg`, and generate Tauri's PNG set from `icons/phanes-1024.png` with `npx tauri icon`.
- Ship a desktop entry so Phanes appears in the GNOME app grid and can open markdown files from the Files app:

```ini
[Desktop Entry]
Name=Phanes
Comment=Write and read markdown
Exec=phanes %F
Icon=io.nayed.Phanes
Terminal=false
Type=Application
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;
StartupWMClass=phanes
```

---

## Design tokens

All values come from the designs. Define them as CSS variables in `src/styles/tokens.css`, one block per colorscheme variant, switched with an attribute on the root (e.g. `<html data-scheme="github-default" data-mode="dark">`).

### GitHub Default — colors

| Variable | Used for | Light | Dark |
| --- | --- | --- | --- |
| `--desk` | Area around the window in the mockups only (not used in the app) | `#d8dee4` | `#010409` |
| `--window` | Window, preview and editor background; active tab and segment | `#ffffff` | `#0d1117` |
| `--surface` | Header bar, sidebar, tab strip, status bar, code block background, table stripe | `#f6f8fa` | `#151b23` |
| `--button` | Filled icon buttons, segmented control track, right-clicked tree row | `#e6eaef` | `#262c36` |
| `--fg` | Main text | `#1f2328` | `#f0f6fc` |
| `--muted` | Secondary text, line numbers, inactive tabs, shortcuts, tree icons | `#59636e` | `#9198a1` |
| `--border` | All 1 px borders and separators | `#d1d9e0` | `#3d444d` |
| `--link` | Links, accent, checkbox tick, cursor | `#0969da` | `#4493f8` |
| `--active-bg` | Highlighted row of the open file in the tree | `#ddf4ff` | `#152842` |
| `--current-line` | Editor current line background | `#f0f6ff` | `#151b23` |
| `--menu-bg` | Popover menus | `#ffffff` | `#212830` |
| `--menu-hover` | Hovered menu item | `#eff2f5` | `#2f3742` |
| `--danger` | Destructive menu items (Move to Trash) | `#d1242f` | `#ff7b72` |
| `--code-inline-bg` | Inline code background in the preview | `#eff2f5` | `#212830` |

Editor syntax colors:

| Variable | Used for | Light | Dark |
| --- | --- | --- | --- |
| `--syn-mark` | Markdown punctuation | `#59636e` | `#9198a1` |
| `--syn-heading` | Heading text | `#0550ae` | `#58a6ff` |
| `--syn-code` | Inline code | `#953800` | `#ffa657` |
| `--syn-keyword` | Keywords in code | `#cf222e` | `#ff7b72` |
| `--syn-function` | Function names | `#8250df` | `#d2a8ff` |
| `--syn-string` | Strings, image paths | `#0a3069` | `#a5d6ff` |

GitHub alert colors:

| Alert | Light | Dark |
| --- | --- | --- |
| Note | `#0969da` | `#4493f8` |
| Tip | `#1a7f37` | `#3fb950` |
| Important | `#8250df` | `#ab7df8` |
| Warning | `#9a6700` | `#d29922` |
| Caution | `#d1242f` | `#f85149` |

Keep text contrast at least 4.5:1 against its background when adding colors.

### Type

| Use | Font | Size / line height | Weight |
| --- | --- | --- | --- |
| Header title | Inter | 14 px | 700 |
| Header subtitle | Inter | 12 px | 400, muted |
| Segmented control | Inter | 13 px | 500, active 600 |
| Sidebar label "Workspace" | Inter | 11 px uppercase, 0.06em tracking | 600, muted |
| Sidebar path, tree rows, menus, tabs | Inter | 13 px | 400 (active 600) |
| Status bar | Inter | 12 px | 400 |
| Editor | JetBrains Mono | 14 px / 24 px | 400, headings 600 |
| Preview body | Inter | 15 px / 1.6 | 400 |
| Preview H1 / H2 | Inter | 28 px / 21 px | 600 |
| Preview code | JetBrains Mono | 13 px / 1.6 | 400 |

### Sizes

| Element | Size |
| --- | --- |
| Header bar | 48 px tall, 8 px × 10 px padding |
| Icon buttons | 36 × 36 px, 8 px radius |
| Window control buttons | 24 px round, 12 px icons |
| Segmented control | 30 px buttons, 3 px track padding, 10 px track radius, 7 px button radius |
| Sidebar | 264 px wide (min 220 px) |
| Tree row | 30 px tall, 6 px radius, 18 px indent per level |
| Tab strip | 6 px × 8 px padding; tabs 34 px tall, 8 px radius, up to 210 px wide (min 130 px) |
| Editor gutter | 52 px |
| Preview | 720 px max width, centered |
| Status bar | 30 px tall, 16 px side padding |
| Popover menu | 232 px wide, 12 px radius, 6 px padding, 32 px items |
| Window | 12 px radius |
| Icons | lucide, 2 px stroke; 16 px in the header, 15 px in the tree, 14 px in tabs, 12 px in window controls and status bar |

---

## Commands

Register every one of these in the command registry. Shortcuts follow GNOME conventions.

| Id | Label | Shortcut |
| --- | --- | --- |
| `workspace.open` | Open Folder… | `Ctrl+O` |
| `file.new` | New File | `Ctrl+N` |
| `folder.new` | New Folder | `Shift+Ctrl+N` |
| `file.save` | Save | `Ctrl+S` |
| `file.saveAs` | Save As… | `Shift+Ctrl+S` |
| `item.rename` | Rename | `F2` |
| `item.duplicate` | Duplicate | |
| `item.copyPath` | Copy Path | `Shift+Ctrl+C` |
| `item.reveal` | Open in Files | |
| `item.trash` | Move to Trash | `Delete` (when the tree has focus) |
| `tab.close` | Close Tab | `Ctrl+W` |
| `tab.next` / `tab.previous` | Next / Previous Tab | `Ctrl+Tab` / `Shift+Ctrl+Tab` |
| `view.editor` / `view.split` / `view.preview` | Editor / Split / Preview | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| `view.toggleSidebar` | Show Sidebar | `F9` |
| `view.toggleSyncScroll` | Synced Scroll | |
| `theme.system` / `theme.light` / `theme.dark` | Follow System / Light / Dark | |
| `theme.cycle` | Switch Color Mode (Follow System → Light → Dark) | |
| `scheme.githubDefault` / `scheme.gruvbox` / `scheme.catppuccin` / `scheme.everforest` | GitHub Default / Gruvbox / Catppuccin / Everforest | |
| `app.shortcuts` | Keyboard Shortcuts | `Ctrl+?` |
| `app.about` | About Phanes | |
| `app.quit` | Quit | `Ctrl+Q` |

The future command palette (`Shift+Ctrl+P`) will list this registry, so give every command a clear label.

---

## Later features (not version 1)

Do not build these now. The foundations above are there so each one is an addition, not a rewrite.

- ~~Vim keybindings in the editor~~: specified in [`VIM.md`](VIM.md).
- Command palette (`Shift+Ctrl+P`) and quick open (`Ctrl+P`, fuzzy file search in the workspace).
- Live reload when a file changes on disk (for example edited in Neovim), and refreshing the tree after outside changes, using the `notify` watcher.
- Mermaid diagrams and math (`$…$`, `$$…$$` with KaTeX), as remark/rehype plugins.
- Front matter shown as a metadata card.
- Outline panel (document headings) as a second sidebar tab.
- Paste or drop an image: save it to the workspace's `assets/` folder and insert the markdown link.
- Focus mode: hide sidebar and tabs, dim everything but the current paragraph.
- Search across the workspace (ripgrep), git status tints in the tree, recent workspaces in the main menu.
- More colorschemes: Tokyo Night, Nord.
- Single-instance: `phanes file.md` while Phanes is running opens a tab in the existing window.

---

## Done means

- `npm run tauri dev` runs the app; `npm run tauri build` produces a `.deb`, an `.rpm` and an AppImage.
- `phanes docs/sample-workspace` opens the sample workspace, and opening `notes.md` looks like `design/screens/01-main-light.png` (and `02-main-dark.png` with GNOME set to dark).
- Every GFM feature in `sample-workspace/projects/markdown-editor.md` renders, and its `<script>` does not run.
- The context menu actions work on real files, and Move to Trash puts files in the GNOME trash.
- No network requests at runtime.
- Everything is reachable by keyboard, with visible focus rings in the link color.
- Build it in small, working steps and commit each one: window and header, then sidebar and tree, then tabs and editor, then preview, then the rest.
