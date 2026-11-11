//! System programs that Phanes starts from an AppImage get the system's
//! environment, not the AppImage's.
//!
//! The AppImage runs Phanes with its bundled libraries first in line
//! (`LD_LIBRARY_PATH`, `PATH`, `GTK_PATH`, `GSETTINGS_SCHEMA_DIR`…). Phanes
//! and its bundled WebKit need that, so it can't be undone for Phanes itself
//! (nor can the working directory change: WebKit finds its helpers relative
//! to it). But child processes inherit it too, and a program from the
//! system, like zenity (the file dialog when there is no desktop portal),
//! then loads the bundled, older libraries and fails without a word: on
//! Fedora, Ctrl+O did nothing.
//!
//! So in an AppImage, Phanes puts small wrappers for those programs first on
//! its PATH: each removes the AppImage's variables and starts the system's
//! own program.
//!
//! An AppImage is also a lone file: nothing tells the desktop which icon and
//! name go with its window, so KDE's title bar and task bar show a generic
//! icon. On each start Phanes therefore keeps a launcher for itself in the
//! user's data folder (`Phanes.desktop` and its icon), unless Phanes is also
//! installed from a package or the user wrote a launcher of their own.

use std::path::{Path, PathBuf};

/// Programs from the system that Phanes (through its libraries) starts.
const WRAPPED: &[&str] = &["zenity", "xdg-open"];

/// Variables the AppImage sets for its bundled libraries, removed for them.
/// PATH and XDG_DATA_DIRS are kept without the AppImage's entries instead.
const APPIMAGE_VARS: &[&str] = &[
    "LD_LIBRARY_PATH",
    "GTK_DATA_PREFIX",
    "GTK_EXE_PREFIX",
    "GTK_PATH",
    "GTK_THEME",
    "GTK_IM_MODULE_FILE",
    "GDK_PIXBUF_MODULE_FILE",
    "GIO_MODULE_DIR",
    "GI_TYPELIB_PATH",
    "GSETTINGS_SCHEMA_DIR",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "PYTHONHOME",
    "PYTHONPATH",
    "PERLLIB",
    "QT_PLUGIN_PATH",
    "APPDIR",
    "APPIMAGE",
    "ARGV0",
    "OWD",
];

/// Must run first thing in `main`, before any thread starts: it changes PATH.
pub fn isolate_system_programs() {
    #[cfg(target_os = "linux")]
    if let Err(err) = install() {
        eprintln!("Phanes: could not set up the AppImage program wrappers: {err}");
    }
}

#[cfg(target_os = "linux")]
fn install() -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let (Some(appdir), Some(_)) = (std::env::var_os("APPDIR"), std::env::var_os("APPIMAGE")) else {
        return Ok(()); // Not running as an AppImage.
    };
    let appdir = PathBuf::from(appdir);
    add_launcher(&appdir);
    let base = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    remove_stale(&base);
    let dir = base.join(format!("phanes-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;

    let path = outside(&appdir, "PATH");
    let data_dirs = outside(&appdir, "XDG_DATA_DIRS");
    for program in WRAPPED {
        let mut script = String::from("#!/bin/sh\n# Written by Phanes: run the system's program with the system's environment.\nexec env");
        for var in APPIMAGE_VARS {
            script.push_str(&format!(" -u {var}"));
        }
        if data_dirs.is_empty() {
            script.push_str(" -u XDG_DATA_DIRS");
        } else {
            script.push_str(&format!(" XDG_DATA_DIRS={}", quote(&data_dirs)));
        }
        // The system PATH no longer contains this directory, so `env` finds
        // the real program, not this wrapper.
        script.push_str(&format!(" PATH={} {program} \"$@\"\n", quote(&path)));
        let file = dir.join(program);
        std::fs::write(&file, script)?;
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755))?;
    }

    let current = std::env::var("PATH").unwrap_or_default();
    std::env::set_var("PATH", format!("{}:{current}", dir.display()));
    Ok(())
}

/// The launcher's file name: the window's app id (`glib::set_prgname` in
/// lib.rs) plus `.desktop`, which is how a desktop finds a window's icon.
const LAUNCHER: &str = "Phanes.desktop";
const ICON: &str = "icons/hicolor/scalable/apps/io.nayed.Phanes.svg";
/// Marks a launcher as written by Phanes, so it is only ever Phanes' own
/// that gets rewritten.
const LAUNCHER_MARK: &str = "X-Phanes-AppImage=true";

/// Keep a launcher for this AppImage in the user's data folder. Failing is
/// harmless (the window only keeps a generic icon), so errors are dropped.
#[cfg(target_os = "linux")]
fn add_launcher(appdir: &Path) {
    let Some(appimage) = std::env::var_os("APPIMAGE").map(PathBuf::from) else { return };
    let Some(data_home) = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
    else {
        return;
    };

    // Installed from a package as well: that launcher already does the job.
    let mut system_dirs = outside(appdir, "XDG_DATA_DIRS");
    if system_dirs.is_empty() {
        system_dirs = String::from("/usr/local/share:/usr/share");
    }
    let installed = system_dirs
        .split(':')
        .map(Path::new)
        .any(|dir| dir != data_home && dir.join("applications").join(LAUNCHER).exists());
    if installed {
        return;
    }

    let launcher = data_home.join("applications").join(LAUNCHER);
    let existing = std::fs::read_to_string(&launcher).ok();
    if existing.as_ref().is_some_and(|text| !text.contains(LAUNCHER_MARK)) {
        return; // The user's own.
    }
    let Ok(template) = std::fs::read_to_string(appdir.join("usr/share/applications").join(LAUNCHER)) else {
        return;
    };
    let Some(entry) = launcher_entry(&template, &appimage) else { return };
    if existing.as_deref() != Some(entry.as_str()) {
        if let Some(dir) = launcher.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&launcher, entry);
    }

    let icon = data_home.join(ICON);
    let Ok(bundled) = std::fs::read(appdir.join("usr/share").join(ICON)) else { return };
    if std::fs::read(&icon).ok().as_deref() != Some(bundled.as_slice()) {
        if let Some(dir) = icon.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&icon, bundled);
    }
}

/// The bundled launcher, pointed at the AppImage file. `TryExec` makes
/// desktops hide it once that file is moved or deleted.
fn launcher_entry(template: &str, appimage: &Path) -> Option<String> {
    let path = appimage.to_str().filter(|path| !path.contains('\n'))?;
    // Quoting of the Desktop Entry Specification's Exec key.
    let mut quoted = String::new();
    for c in path.chars() {
        match c {
            '"' | '`' | '$' | '\\' => {
                quoted.push('\\');
                quoted.push(c);
            }
            '%' => quoted.push_str("%%"),
            _ => quoted.push(c),
        }
    }
    let mut entry = String::new();
    for line in template.lines() {
        if line.starts_with("Exec=") {
            entry.push_str(&format!("Exec=\"{quoted}\" %F\nTryExec={path}\n{LAUNCHER_MARK}\n"));
        } else if !line.starts_with("TryExec=") {
            entry.push_str(line);
            entry.push('\n');
        }
    }
    entry.contains(LAUNCHER_MARK).then_some(entry)
}

/// Remove the wrapper folders of Phanes instances that are no longer running.
#[cfg(target_os = "linux")]
fn remove_stale(base: &Path) {
    let Ok(entries) = std::fs::read_dir(base) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str().and_then(|n| n.strip_prefix("phanes-")) else { continue };
        if pid.parse::<u32>().is_ok() && !Path::new("/proc").join(pid).exists() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// A colon-separated variable without the entries inside the AppImage.
fn outside(appdir: &Path, var: &str) -> String {
    without_appdir(appdir, &std::env::var(var).unwrap_or_default())
}

fn without_appdir(appdir: &Path, list: &str) -> String {
    list.split(':')
        .filter(|entry| !entry.is_empty() && !Path::new(entry).starts_with(appdir))
        .collect::<Vec<_>>()
        .join(":")
}

/// Quote for /bin/sh.
fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_survives_single_quotes() {
        assert_eq!(quote("/a b/it's"), r"'/a b/it'\''s'");
    }

    #[test]
    fn launcher_points_at_the_appimage() {
        let template = "[Desktop Entry]\nName=Phanes\nExec=phanes %F\nIcon=io.nayed.Phanes\n";
        let entry = launcher_entry(template, Path::new("/home/me/My Apps/Phanes $1.AppImage")).unwrap();
        assert_eq!(
            entry,
            "[Desktop Entry]\nName=Phanes\nExec=\"/home/me/My Apps/Phanes \\$1.AppImage\" %F\n\
             TryExec=/home/me/My Apps/Phanes $1.AppImage\nX-Phanes-AppImage=true\nIcon=io.nayed.Phanes\n"
        );
        assert!(launcher_entry("[Desktop Entry]\nName=Phanes\n", Path::new("/a")).is_none());
    }

    #[test]
    fn appimage_entries_are_dropped() {
        let appdir = Path::new("/tmp/.mount_PhanesX");
        let path = "/tmp/.mount_PhanesX/usr/bin/:/tmp/.mount_PhanesX//usr/sbin::/usr/local/bin:/usr/bin";
        assert_eq!(without_appdir(appdir, path), "/usr/local/bin:/usr/bin");
        // A sibling mount whose name starts the same is not inside it.
        assert_eq!(without_appdir(appdir, "/tmp/.mount_PhanesXY/usr/bin"), "/tmp/.mount_PhanesXY/usr/bin");
    }
}
