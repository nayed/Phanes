//! GNOME's light/dark preference ("Style" in Settings › Appearance), read
//! from the XDG desktop portal (`org.freedesktop.appearance color-scheme`).
//!
//! WebKitGTK's `prefers-color-scheme` only mirrors the GTK setting that the
//! app itself sets, so it cannot tell the frontend what the *system* wants.
//! This module can: `system_color_scheme` answers once, and the
//! `system-color-scheme` event fires whenever the user changes it.

use serde::Serialize;
use tauri::{AppHandle, Runtime};

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ColorScheme {
    Light,
    Dark,
}

pub const EVENT: &str = "system-color-scheme";

/// Portal values: 0 = no preference, 1 = prefer dark, 2 = prefer light.
fn from_portal(value: u32) -> ColorScheme {
    if value == 1 {
        ColorScheme::Dark
    } else {
        ColorScheme::Light
    }
}

#[cfg(target_os = "linux")]
mod portal {
    use super::{from_portal, ColorScheme, EVENT};
    use dbus::arg::Variant;
    use dbus::blocking::{Connection, SyncConnection};
    use dbus::message::MatchRule;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, Runtime};

    const NAMESPACE: &str = "org.freedesktop.appearance";
    const KEY: &str = "color-scheme";

    pub fn read() -> Option<ColorScheme> {
        let conn = Connection::new_session().ok()?;
        let proxy = conn.with_proxy(
            "org.freedesktop.portal.Desktop",
            "/org/freedesktop/portal/desktop",
            Duration::from_secs(3),
        );
        // `ReadOne` (portal v2) returns the value directly; `Read` wraps it twice.
        if let Ok((value,)) = proxy.method_call::<(Variant<u32>,), _, _, _>(
            "org.freedesktop.portal.Settings",
            "ReadOne",
            (NAMESPACE, KEY),
        ) {
            return Some(from_portal(value.0));
        }
        let (value,): (Variant<Variant<u32>>,) = proxy
            .method_call("org.freedesktop.portal.Settings", "Read", (NAMESPACE, KEY))
            .ok()?;
        Some(from_portal(value.0 .0))
    }

    pub fn watch<R: Runtime>(app: AppHandle<R>) {
        std::thread::spawn(move || {
            let Ok(conn) = SyncConnection::new_session() else {
                return;
            };
            let rule = MatchRule::new_signal("org.freedesktop.portal.Settings", "SettingChanged");
            let added = conn.add_match(rule, move |_: (), _, msg| {
                let mut args = msg.iter_init();
                if let (Ok(NAMESPACE), Ok(KEY), Ok(value)) = (
                    args.read::<&str>(),
                    args.read::<&str>(),
                    args.read::<Variant<u32>>(),
                ) {
                    let _ = app.emit(EVENT, from_portal(value.0));
                }
                true
            });
            if added.is_err() {
                return;
            }
            while conn.process(Duration::from_secs(60)).is_ok() {}
        });
    }
}

/// The system preference right now (light when it cannot be read).
#[tauri::command]
pub fn system_color_scheme() -> ColorScheme {
    #[cfg(target_os = "linux")]
    if let Some(scheme) = portal::read() {
        return scheme;
    }
    ColorScheme::Light
}

/// Emit `system-color-scheme` whenever the preference changes.
pub fn watch<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "linux")]
    portal::watch(app.clone());
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}
