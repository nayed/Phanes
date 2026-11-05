//! Colors of the user's GTK theme, for the "GTK Theme" colorscheme.
//!
//! Phanes draws its interface in HTML, so it cannot inherit GTK styling
//! directly. Instead GTK is asked for the theme's named colors
//! (`theme_bg_color`, `borders`…) and for the computed colors of a header bar
//! and its minimize / maximize / close buttons, which the frontend turns into
//! CSS variables. The values follow the variant GTK currently uses (light or
//! dark), which the frontend sets to match its own mode.

use std::collections::HashMap;

use tauri::{AppHandle, Runtime};

pub const EVENT: &str = "gtk-theme-changed";

#[cfg(target_os = "linux")]
mod imp {
    use super::EVENT;
    use gtk::prelude::*;
    use std::collections::HashMap;
    use tauri::{AppHandle, Emitter, Runtime};

    fn css(c: gtk::gdk::RGBA) -> String {
        format!(
            "rgba({}, {}, {}, {:.3})",
            (c.red() * 255.0).round(),
            (c.green() * 255.0).round(),
            (c.blue() * 255.0).round(),
            c.alpha()
        )
    }

    /// A computed CSS color of a widget, if it is set and not fully transparent.
    fn computed(ctx: &gtk::StyleContext, property: &str, state: gtk::StateFlags) -> Option<String> {
        let value = ctx.style_property_for_state(property, state);
        let color = value.get::<gtk::gdk::RGBA>().ok()?;
        (color.alpha() > 0.0).then(|| css(color))
    }

    /// Must run on the GTK main thread (synchronous Tauri commands do).
    pub fn read() -> HashMap<String, String> {
        let mut out = HashMap::new();

        // Widgets are created only to compute styles; they are never shown.
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        let header = gtk::HeaderBar::new();
        window.set_titlebar(Some(&header));
        let button = |class: &str| {
            let b = gtk::Button::new();
            b.style_context().add_class("titlebutton");
            b.style_context().add_class(class);
            header.pack_end(&b);
            b
        };
        let (minimize, maximize, close) = (button("minimize"), button("maximize"), button("close"));

        let ctx = window.style_context();
        for (key, name) in [
            ("bg", "theme_bg_color"),
            ("fg", "theme_fg_color"),
            ("base", "theme_base_color"),
            ("text", "theme_text_color"),
            ("selected-bg", "theme_selected_bg_color"),
            ("selected-fg", "theme_selected_fg_color"),
            ("borders", "borders"),
            ("error", "error_color"),
            ("warning", "warning_color"),
            ("success", "success_color"),
            ("view-bg", "content_view_bg"),
        ] {
            if let Some(color) = ctx.lookup_color(name) {
                out.insert(key.to_string(), css(color));
            }
        }

        let normal = gtk::StateFlags::NORMAL;
        if let Some(c) = computed(&header.style_context(), "background-color", normal) {
            out.insert("header-bg".into(), c);
        }
        for (key, b) in [("minimize", &minimize), ("maximize", &maximize), ("close", &close)] {
            let ctx = b.style_context();
            if let Some(c) = computed(&ctx, "background-color", normal) {
                out.insert(format!("wc-{key}-bg"), c);
            }
            if let Some(c) = computed(&ctx, "background-color", gtk::StateFlags::PRELIGHT) {
                out.insert(format!("wc-{key}-hover-bg"), c);
            }
        }
        // Icon colors: some themes hide the icon until hover (transparent color).
        let ctx = close.style_context();
        let icon = ctx.style_property_for_state("color", normal).get::<gtk::gdk::RGBA>().ok();
        if let Some(c) = icon {
            out.insert("wc-fg".into(), css(c));
        }
        if let Some(c) = computed(&ctx, "color", gtk::StateFlags::PRELIGHT) {
            out.insert("wc-hover-fg".into(), c);
        }

        // Themes that draw the buttons as colored discs (macOS-like, Gruvbox…)
        // size them explicitly: take that size (min size + padding + border)
        // and the header's spacing. Themes with flat, icon-sized buttons
        // (Adwaita) keep the design's own size.
        if out.contains_key("wc-close-bg") {
            let int = |prop: &str| ctx.style_property_for_state(prop, normal).get::<i32>().unwrap_or(0);
            let (pad, border) = (ctx.padding(normal), ctx.border(normal));
            let width = int("min-width") + i32::from(pad.left + pad.right + border.left + border.right);
            let height = int("min-height") + i32::from(pad.top + pad.bottom + border.top + border.bottom);
            let size = width.max(height);
            if size >= 10 {
                out.insert("wc-size".into(), format!("{}px", size.min(36)));
                let margin = ctx.margin(normal);
                let gap = header.spacing() + i32::from(margin.left + margin.right);
                out.insert("wc-gap".into(), format!("{}px", gap.clamp(2, 24)));
            }
        }

        if let Some(settings) = gtk::Settings::default() {
            if let Some(name) = settings.gtk_theme_name() {
                out.insert("name".into(), name.to_string());
            }
        }

        // SAFETY: the window was created above, has never been shown and is not used afterwards.
        unsafe { window.destroy() };
        out
    }

    /// Tell the frontend when the theme or its light/dark variant changes.
    pub fn watch<R: Runtime>(app: &AppHandle<R>) {
        let Some(settings) = gtk::Settings::default() else {
            return;
        };
        let a = app.clone();
        settings.connect_gtk_theme_name_notify(move |_| {
            let _ = a.emit(EVENT, ());
        });
        let a = app.clone();
        settings.connect_gtk_application_prefer_dark_theme_notify(move |_| {
            let _ = a.emit(EVENT, ());
        });
    }
}

/// The current GTK theme's colors as CSS color strings, keyed by role.
/// Missing keys mean the theme does not define that color.
#[tauri::command]
pub fn gtk_theme_colors() -> HashMap<String, String> {
    #[cfg(target_os = "linux")]
    return imp::read();
    #[cfg(not(target_os = "linux"))]
    HashMap::new()
}

/// Must be called on the main thread (e.g. from the Tauri `setup` hook).
pub fn watch<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "linux")]
    imp::watch(app);
    #[cfg(not(target_os = "linux"))]
    let _ = app;
}
