# AGENTS.md

Phanes is a desktop markdown editor and reader for Linux (GNOME on Wayland, Debian and Arch). It's a personal tool with one user, its author. Tauri 2 opens a GTK 3 window holding a WebKitGTK web view; the whole interface is a React + TypeScript app drawn inside it, and Rust handles everything that touches the system.

- `docs/PHANES.md` is the full product brief and the source of truth for behavior and design. Read the relevant section before changing a feature.
- `docs/VIM.md` specifies the optional Vim mode (CodeMirror's `@replit/codemirror-vim`); read it before touching the editor's keys, the status bar or the command registry.
- `README.md` has the feature list, tech stack, layout table and build steps.

## Commands

```bash
npm install
npm run typecheck                               # TypeScript
cargo test --manifest-path src-tauri/Cargo.toml # Rust
npm run dev                                     # UI only, in a browser at http://localhost:1420
npm run tauri dev                               # the real desktop app
npm run tauri build                             # .deb, .rpm and AppImage in src-tauri/target/release/bundle/
```

- Run `npm run typecheck` and `cargo test` before every commit.
- `npm run dev` runs the UI in a plain browser with a fake backend (`src/dev/browserMock.ts`, `src/dev/mockFs.ts`) and `docs/sample-workspace` mounted at `~/notes`. Use it to check UI changes. When you add a Tauri command, add a mock for it there too.
- `npm run tauri build` takes a few minutes: run it in the background, not in a shell that may be cut off.
- `docs/sample-workspace/projects/markdown-editor.md` exercises every GFM feature, alerts and the sanitizer (it contains a `<script>`).

## Architecture rules

1. **All file access goes through one place**: Rust commands in `src-tauri/src/fs.rs`, called only from `src/lib/fs.ts`. Components never touch files directly.
2. **Every user action is a command** in `src/commands/` (id, label, optional shortcut, handler). Menus, the right-click menu and shortcuts all read from that registry; don't wire an action to a single button.
3. **Colors only through CSS variables** defined per colorscheme in `src/styles/tokens.css`. No hex values in components. A new colorscheme is a light and a dark block of variables, plus the few registrations listed at the top of `src/app/theme.ts` (its id, Shiki code themes, menu command).
4. **Markdown features are unified plugins** added to the pipeline in `src/markdown/render.ts`. Keep `data-line` source positions on blocks (synced scroll needs them), and extend the sanitize schema in `src/markdown/plugins/schema.ts` for any new class or element instead of loosening it.
5. **Editor behavior is CodeMirror 6 extensions** in `src/editor/extensions.ts`.
6. A new Tauri command or plugin call also needs its permission in `src-tauri/capabilities/default.json`.

## Conventions

- **American spelling** in code, UI text and docs (color, behavior, maximize).
- **GNOME-native first.** When there's a choice, prefer what GNOME itself does (desktop portals, GTK settings, libadwaita look) and compare the result with GNOME's own apps, especially Files.
- No network access at runtime, no telemetry. Fonts are bundled.
- Keep UI text short and plain, like GNOME apps.

## Git

- Commit straight to `main`, in small steps: one commit per working change, not one big commit at the end.
- **Never push** unless the user explicitly asks.
- **Releases are built by GitHub**, not locally: pushing a `v*` tag runs `.github/workflows/release.yml`, which builds on Ubuntu 24.04 (glibc 2.39: the oldest target, so packages run on Debian 13, Ubuntu 24.04 and newer; don't move it to a release whose glibc is newer than Debian 13's 2.41) and creates a draft release. Don't upload locally built packages to a release: they need the build machine's newer glibc.
- If a system package is missing, give the user the exact `sudo apt install …` line (and the Arch `pacman` one when relevant); they install it themselves.

## Things that are easy to get wrong

- **Startup:** the window is created hidden and the frontend shows it right after the first render (`src/main.tsx`), so the first frame already has the right colors. Don't wait for `requestAnimationFrame` before showing it: WebKitGTK doesn't run animation frames while the window is hidden, so the window would only appear after the 4 s fallback in `src-tauri/src/lib.rs`.
- **Light/dark:** WebKitGTK's `prefers-color-scheme` doesn't follow GNOME's setting. The system preference comes from the desktop portal (`src-tauri/src/system_theme.rs`), and the frontend tells GTK which variant to use with `set_gtk_dark` (`src-tauri/src/gtk_theme.rs`).
- **GTK's dark setting is expensive:** writing `gtk-application-prefer-dark-theme` reloads the whole GTK theme (~45 ms) even when the value doesn't change. Only write it when it differs.
- **GTK calls run on the main thread.** Synchronous Tauri commands do; async ones don't.
- **No GTK theme colors.** Phanes used to offer a "GTK Theme" colorscheme that read colors and title buttons from the user's GTK 3 theme. It was removed: themes are arbitrary CSS, so colors went missing or fell back to Adwaita and the window buttons came out wrong on many themes and desktops. Colorschemes are fixed palettes in `tokens.css`; don't bring theme reading back.
- **Two title bars:** on GNOME (also Pantheon and Budgie) Phanes draws its own header bar with the window buttons; on any other desktop it leaves the window alone so the window manager draws its title bar in the user's theme (`src-tauri/src/window.rs`, `data-title-bar` on `<html>`). Don't imitate another desktop's buttons in CSS: like GTK theme colors, they would never match the user's theme. Test the other style with `PHANES_TITLE_BAR=system` (or `own`), and in the browser with `http://localhost:1420/?titleBar=system`. On GNOME Wayland the system style shows GTK's fallback title bar, since Mutter draws none; check the real result on KDE.
- **Window size:** remembered in `window.json` by `src-tauri/src/window_state.rs`, measured with GTK's own `gtk_window_get_size`. Don't use Tauri's `inner_size` for it: with Phanes' own header bar it also counts the shadow GTK draws around the window (about 100 px a side), so a window restored from it grows at every launch.
- **App id:** the window's Wayland app id and X11 class are `Phanes` (`glib::set_prgname` in `lib.rs`), the name of the launcher Tauri's bundler installs (`Phanes.desktop`, with `StartupWMClass=Phanes`). KDE finds the title bar icon by that exact, case-sensitive name; keep the three in step. An AppImage has no installed launcher, so on start it writes one to `~/.local/share/applications/Phanes.desktop` plus its icon (`appimage.rs`), unless a package's launcher or one the user wrote is there.
- **File dialogs** use GNOME's chooser through the desktop portal (`tauri-plugin-dialog` with only the `xdg-portal` feature). Don't switch back to the GTK 3 backend: its first open is slow and it doesn't look like the rest of GNOME. Without a portal file chooser (XFCE without `xdg-desktop-portal-gtk`, for example), `rfd` falls back to zenity, which is only given the file name, not the folder: in an AppImage, Save As then starts in the AppImage's mount. That's a known limitation; the fix is installing a portal. Library warnings go to stderr (`env_logger`), so run Phanes from a terminal to see why a dialog failed.
- **Never change the working directory, especially in the AppImage.** Its bundled WebKit finds its helper processes (`WebKitNetworkProcess`…) through paths relative to the working directory, which the AppImage launcher sets to its mount; Phanes crashed at startup in 1.1.1 because it moved out. Test AppImage changes with a real AppImage (`npm run tauri build -- --bundles appimage`), not the plain binary.
- **System programs started from the AppImage need the system's environment.** The AppImage puts its bundled libraries first (`LD_LIBRARY_PATH`, `GTK_PATH`…), and a system program inheriting that can fail silently (Fedora's zenity did: Ctrl+O did nothing). `src-tauri/src/appimage.rs` puts wrappers for `zenity` and `xdg-open` first on PATH that drop those variables; add any other system program Phanes starts to its list.
- **Icons:** the SVGs in `docs/icons/` are used directly. The PNGs in `src-tauri/icons/` are generated from `docs/icons/phanes-1024.png` with `npx tauri icon` (into a temporary folder; copy only `32x32.png`, `64x64.png`, `128x128.png` and `icon.png`).
