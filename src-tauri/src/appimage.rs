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
    fn appimage_entries_are_dropped() {
        let appdir = Path::new("/tmp/.mount_PhanesX");
        let path = "/tmp/.mount_PhanesX/usr/bin/:/tmp/.mount_PhanesX//usr/sbin::/usr/local/bin:/usr/bin";
        assert_eq!(without_appdir(appdir, path), "/usr/local/bin:/usr/bin");
        // A sibling mount whose name starts the same is not inside it.
        assert_eq!(without_appdir(appdir, "/tmp/.mount_PhanesXY/usr/bin"), "/tmp/.mount_PhanesXY/usr/bin");
    }
}
