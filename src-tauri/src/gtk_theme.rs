//! Which variant of the GTK theme, light or dark, the window uses.
//!
//! Phanes draws its interface in HTML, but GTK still draws the window shadow,
//! the native dialogs and WebKit's own controls (scrollbars, checkboxes). The
//! frontend tells GTK which variant to use so they match the app's mode.

/// Make GTK use the light or dark variant of its theme.
///
/// GTK reloads its whole theme each time this setting is written, even with
/// the value it already has (~45 ms with a large theme), so it is only
/// written when it differs. Synchronous, so it runs on the GTK main thread.
#[tauri::command]
pub fn set_gtk_dark(dark: bool) {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        if let Some(settings) = gtk::Settings::default() {
            if settings.is_gtk_application_prefer_dark_theme() != dark {
                settings.set_gtk_application_prefer_dark_theme(dark);
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = dark;
}
