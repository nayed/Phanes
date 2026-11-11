//! The window's size and whether it was maximized, remembered between
//! launches in `window.json` next to `state.json`.
//!
//! Position is not remembered: Wayland doesn't let an app place its window.

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{LogicalSize, Manager, Runtime, WebviewWindow, WindowEvent};

const FILE_NAME: &str = "window.json";

/// The size of a first launch, when the screen has room for it.
const DEFAULT_SIZE: (f64, f64) = (1440.0, 900.0);
/// Same as `minWidth` and `minHeight` in tauri.conf.json.
const MIN_SIZE: (f64, f64) = (720.0, 480.0);
/// A first launch takes at most this share of the screen. A window as large
/// as the screen gets maximized by GNOME, and on KDE its bottom ends up
/// behind the panel.
const DEFAULT_SCREEN_SHARE: f64 = 0.85;
/// The window is looked at this long after its last resize: by then the
/// drag is over and the window manager has settled its maximized state.
const SETTLE: Duration = Duration::from_millis(400);

/// Sizes are in logical pixels, without the title bar.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
struct WindowState {
    width: f64,
    height: f64,
    #[serde(default)]
    maximized: bool,
}

fn state_path<R: Runtime>(window: &WebviewWindow<R>) -> Option<PathBuf> {
    Some(window.path().app_config_dir().ok()?.join(FILE_NAME))
}

fn load(path: &PathBuf) -> Option<WindowState> {
    let state: WindowState = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    (state.width.is_finite() && state.height.is_finite()).then_some(state)
}

fn save(path: &PathBuf, state: &WindowState) {
    let Ok(text) = serde_json::to_string_pretty(state) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(&tmp, path);
    }
}

/// The size to open with: the remembered one, or the default on a first
/// launch, made to fit a screen of `screen` logical pixels when it is known.
fn opening_size(saved: Option<WindowState>, screen: Option<(f64, f64)>) -> (f64, f64) {
    let (mut width, mut height) = saved.map_or(DEFAULT_SIZE, |s| (s.width, s.height));
    if let Some((screen_width, screen_height)) = screen {
        // A remembered size fitted the screen it was on; only a smaller
        // screen cuts it down.
        let share = if saved.is_some() { 1.0 } else { DEFAULT_SCREEN_SHARE };
        width = width.min((screen_width * share).floor());
        height = height.min((screen_height * share).floor());
    }
    (width.max(MIN_SIZE.0), height.max(MIN_SIZE.1))
}

/// The screen the window opens on, in logical pixels.
fn screen_size<R: Runtime>(window: &WebviewWindow<R>) -> Option<(f64, f64)> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| window.available_monitors().ok()?.into_iter().next())?;
    let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
    (size.width > 0.0 && size.height > 0.0).then_some((size.width, size.height))
}

/// The window's size as `set_size` takes it: the content, in logical pixels.
/// Asked from GTK itself: with a header bar of its own (GNOME), the size
/// Tauri reports also counts the shadow GTK draws around the window, and a
/// window restored from it would grow at every launch. Main thread only.
#[cfg(target_os = "linux")]
fn content_size<R: Runtime>(window: &WebviewWindow<R>) -> Option<(f64, f64)> {
    use gtk::prelude::*;
    let gtk_window = window.gtk_window().ok()?;
    let (width, height) = gtk_window.size();
    Some((f64::from(width), f64::from(height)))
}

#[cfg(not(target_os = "linux"))]
fn content_size<R: Runtime>(window: &WebviewWindow<R>) -> Option<(f64, f64)> {
    let size = window.inner_size().ok()?.to_logical::<f64>(window.scale_factor().ok()?);
    Some((size.width, size.height))
}

/// What the window looks like now, given what was remembered before.
/// Maximized or full screen, the size to come back to stays the old one.
/// Main thread only.
fn current<R: Runtime>(window: &WebviewWindow<R>, previous: Option<WindowState>) -> Option<WindowState> {
    // Hidden, it is still being set up: nothing the user chose.
    if !window.is_visible().ok()? || window.is_fullscreen().ok()? {
        return previous;
    }
    if window.is_maximized().ok()? {
        return previous.map(|state| WindowState { maximized: true, ..state });
    }
    let (width, height) = content_size(window)?;
    Some(WindowState { width, height, maximized: false })
}

/// Give the (still hidden) window the size it had last time, then keep
/// remembering it as it changes.
pub fn restore_and_track<R: Runtime>(window: &WebviewWindow<R>) {
    let Some(path) = state_path(window) else { return };
    let saved = load(&path);

    let (width, height) = opening_size(saved, screen_size(window));
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.center();
    let mut remembered = Some(WindowState { width, height, maximized: saved.is_some_and(|s| s.maximized) });
    if saved.is_some_and(|s| s.maximized) {
        let _ = window.maximize();
    }

    // Resizes arrive in bursts while an edge is dragged: a worker waits for
    // the burst to end, then looks at the window once.
    let (resized, bursts) = mpsc::channel::<()>();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_)) {
            let _ = resized.send(());
        }
    });
    let window = window.clone();
    std::thread::spawn(move || {
        while bursts.recv().is_ok() {
            while bursts.recv_timeout(SETTLE).is_ok() {}
            // GTK is asked on its own thread.
            let (looked_at, path) = (window.clone(), path.clone());
            let (answer, answered) = mpsc::channel();
            let asked = window.run_on_main_thread(move || {
                let now = current(&looked_at, remembered);
                if let Some(state) = now.filter(|_| now != remembered) {
                    save(&path, &state);
                }
                let _ = answer.send(now);
            });
            if asked.is_err() {
                break; // Phanes is quitting.
            }
            match answered.recv() {
                Ok(now) => remembered = now,
                Err(_) => break,
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(width: f64, height: f64) -> Option<WindowState> {
        Some(WindowState { width, height, maximized: false })
    }

    #[test]
    fn first_launch_uses_the_default_on_a_large_screen() {
        assert_eq!(opening_size(None, Some((2560.0, 1440.0))), DEFAULT_SIZE);
        assert_eq!(opening_size(None, None), DEFAULT_SIZE);
    }

    #[test]
    fn first_launch_leaves_room_on_a_small_screen() {
        assert_eq!(opening_size(None, Some((1280.0, 800.0))), (1088.0, 680.0));
    }

    #[test]
    fn remembered_size_is_kept() {
        assert_eq!(opening_size(state(1000.0, 700.0), Some((1280.0, 800.0))), (1000.0, 700.0));
    }

    #[test]
    fn remembered_size_is_cut_to_a_smaller_screen() {
        assert_eq!(opening_size(state(2000.0, 1200.0), Some((1280.0, 800.0))), (1280.0, 800.0));
    }

    #[test]
    fn never_smaller_than_the_minimum() {
        assert_eq!(opening_size(state(10.0, 10.0), Some((1280.0, 800.0))), MIN_SIZE);
        assert_eq!(opening_size(None, Some((640.0, 400.0))), MIN_SIZE);
    }
}
