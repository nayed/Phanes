//! Window chrome. Phanes draws its own libadwaita-style header bar. On Linux
//! the GTK window keeps client-side decorations (so GNOME's shadow and
//! resize edges stay), but its title bar is replaced with an empty widget
//! and its corners are rounded to match the web content.

use tauri::{Runtime, WebviewWindow};

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
