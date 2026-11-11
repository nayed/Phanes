//! Window chrome, in one of two styles chosen from the desktop at startup.
//!
//! "own": on GNOME, where apps draw their own header bars, Phanes draws a
//! libadwaita-style one with the window buttons in it. The GTK window keeps
//! client-side decorations (so GNOME's shadow and resize edges stay), but its
//! title bar is replaced with an empty widget and its corners are rounded to
//! match the web content.
//!
//! "system": everywhere else (KDE Plasma, Xfce, Cinnamon, MATE, tiling
//! compositors…) the window is left alone, so the desktop's window manager
//! draws its usual title bar, buttons and borders in the user's theme, and
//! the header bar is a plain toolbar without window buttons.

use tauri::{Runtime, WebviewWindow};

/// Whether Phanes draws the title bar itself. `desktop` is
/// `XDG_CURRENT_DESKTOP` (a colon-separated list, e.g. `ubuntu:GNOME`);
/// `choice` is `PHANES_TITLE_BAR`, which overrides it with `own` or `system`.
fn draws_own_title_bar(desktop: Option<&str>, choice: Option<&str>) -> bool {
    match choice.map(str::trim) {
        Some(c) if c.eq_ignore_ascii_case("own") => return true,
        Some(c) if c.eq_ignore_ascii_case("system") => return false,
        _ => {}
    }
    // Desktops whose own apps use header bars. An unknown session (nothing
    // set) keeps the header bar too.
    const HEADER_BAR_DESKTOPS: [&str; 3] = ["gnome", "pantheon", "budgie"];
    let desktop = desktop.unwrap_or("").to_ascii_lowercase();
    let mut names = desktop.split(':').filter(|name| !name.is_empty()).peekable();
    names.peek().is_none() || names.any(|name| HEADER_BAR_DESKTOPS.contains(&name))
}

fn own_title_bar() -> bool {
    if !cfg!(target_os = "linux") {
        return false;
    }
    draws_own_title_bar(
        std::env::var("XDG_CURRENT_DESKTOP").ok().as_deref(),
        std::env::var("PHANES_TITLE_BAR").ok().as_deref(),
    )
}

/// Who draws the title bar: `"own"` (Phanes, in its header bar) or
/// `"system"` (the desktop's window manager).
#[tauri::command]
pub fn title_bar_style() -> &'static str {
    if own_title_bar() {
        "own"
    } else {
        "system"
    }
}

#[cfg(target_os = "linux")]
const GTK_CSS: &str = r#"
window.phanes,
window.phanes.background {
  background-color: transparent;
}
window.phanes decoration {
  border-radius: 12px;
}
window.phanes.maximized decoration,
window.phanes.fullscreen decoration,
window.phanes.tiled decoration,
window.phanes.tiled-top decoration,
window.phanes.tiled-left decoration,
window.phanes.tiled-right decoration,
window.phanes.tiled-bottom decoration {
  border-radius: 0;
}
.phanes-titlebar {
  min-height: 0;
  padding: 0;
  margin: 0;
  border: 0;
  background: none;
  box-shadow: none;
}
"#;

#[cfg(target_os = "linux")]
pub fn setup<R: Runtime>(window: &WebviewWindow<R>) {
    use gtk::prelude::*;

    // Left untouched, the window gets the desktop's own title bar.
    if !own_title_bar() {
        return;
    }
    let Ok(gtk_window) = window.gtk_window() else {
        return;
    };

    // An empty, zero-height title bar: GTK keeps drawing the shadow and the
    // resize edges, the web content draws everything else.
    let titlebar = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    titlebar.style_context().add_class("phanes-titlebar");
    titlebar.set_size_request(-1, 0);
    titlebar.show();
    gtk_window.set_titlebar(Some(&titlebar));
    gtk_window.style_context().add_class("phanes");

    let provider = gtk::CssProvider::new();
    if provider.load_from_data(GTK_CSS.as_bytes()).is_ok() {
        if let Some(screen) = gtk::prelude::GtkWindowExt::screen(&gtk_window) {
            gtk::StyleContext::add_provider_for_screen(
                &screen,
                &provider,
                gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub fn setup<R: Runtime>(_window: &WebviewWindow<R>) {}

#[cfg(test)]
mod tests {
    use super::draws_own_title_bar;

    #[test]
    fn gnome_like_desktops_keep_the_header_bar() {
        for desktop in ["GNOME", "ubuntu:GNOME", "GNOME-Classic:GNOME", "Budgie:GNOME", "Pantheon"] {
            assert!(draws_own_title_bar(Some(desktop), None), "{desktop}");
        }
    }

    #[test]
    fn other_desktops_get_the_system_title_bar() {
        for desktop in ["KDE", "XFCE", "X-Cinnamon", "MATE", "LXQt", "sway", "Hyprland"] {
            assert!(!draws_own_title_bar(Some(desktop), None), "{desktop}");
        }
    }

    #[test]
    fn unknown_session_keeps_the_header_bar() {
        assert!(draws_own_title_bar(None, None));
        assert!(draws_own_title_bar(Some(""), None));
    }

    #[test]
    fn the_environment_variable_overrides_the_desktop() {
        assert!(!draws_own_title_bar(Some("GNOME"), Some("system")));
        assert!(draws_own_title_bar(Some("KDE"), Some("Own")));
        assert!(draws_own_title_bar(Some("GNOME"), Some("nonsense")));
    }
}
