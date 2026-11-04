# Phanes

A desktop markdown editor and reader for GNOME: write markdown on the left, read GitHub-style rendering on the right, inside a workspace folder shown as a file tree.

The brief, the designs and the sample workspace are in [`docs/`](docs/PHANES.md).

## Requirements (Debian)

```bash
sudo apt install build-essential curl file libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev librsvg2-dev libxdo-dev
```

Plus Node.js (22 or later) and a Rust toolchain (`rustup`).

## Develop

```bash
npm install
npm run tauri dev
```

Pass arguments to the app after `--`. `tauri dev` runs the binary from `src-tauri/`, so relative paths start there:

```bash
npm run tauri dev -- -- ../docs/sample-workspace
```

`npm run dev` alone serves the UI in a plain browser at http://localhost:1420 with a fake backend (`src/dev/`) and the sample workspace mounted at `~/notes`, which is handy for UI work.

Checks:

```bash
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build

```bash
npm run tauri build
```

This produces `src-tauri/target/release/bundle/deb/Phanes_*.deb` and `src-tauri/target/release/bundle/appimage/Phanes_*.AppImage`. Install the `.deb` with `sudo apt install ./Phanes_*.deb`.

## Layout

| Path | What |
| --- | --- |
| `src/app/` | App shell, startup, theme, synced scroll, quitting |
| `src/components/` | Header bar, sidebar and tree, tabs, status bar, menus, dialogs |
| `src/editor/` | CodeMirror setup (`extensions.ts`) and per-tab editor state |
| `src/markdown/` | The unified pipeline (`render.ts`), its plugins and the preview |
| `src/commands/` | The command registry and keyboard shortcuts |
| `src/lib/fs.ts` | The only module that talks to Rust about files |
| `src/state/` | Settings, workspace, tabs, file operations |
| `src/styles/` | `tokens.css` (colorschemes) and the rest of the CSS |
| `src-tauri/src/` | `fs.rs` (all file access), `cli.rs`, `window.rs`, `app_state.rs` |
