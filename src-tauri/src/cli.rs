//! Command-line arguments:
//!
//!   phanes                 reopen the last workspace and tabs
//!   phanes notes.md        open the file; its folder becomes the workspace
//!   phanes ~/notes         open the folder as the workspace
//!   phanes .               same, for the current directory
//!
//! Relative paths resolve against the directory Phanes was started from.
//! A path that does not exist opens as a new, unsaved file at that path.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPath {
    path: String,
    exists: bool,
    is_dir: bool,
}

pub struct LaunchArgs(pub Vec<LaunchPath>);

/// The directory the user started Phanes from. AppImages run from their own
/// mount, so prefer the original directory the AppImage runtime records.
fn start_dir() -> PathBuf {
    std::env::var_os("OWD")
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Make a path absolute and drop `.` and `..` without touching the disk
/// (the file may not exist yet).
fn absolute(base: &Path, arg: &str) -> PathBuf {
    let raw = Path::new(arg);
    let joined = if raw.is_absolute() { raw.to_path_buf() } else { base.join(raw) };
    let mut out = PathBuf::new();
    for part in joined.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Parse the process arguments. Options (anything starting with `-`) are ignored.
pub fn parse() -> LaunchArgs {
    let base = start_dir();
    let paths = std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|arg| {
            // `file://` URIs can come from some launchers.
            let arg = arg.strip_prefix("file://").map(str::to_string).unwrap_or(arg);
            let path = absolute(&base, &arg);
            let meta = std::fs::metadata(&path).ok();
            LaunchPath {
                exists: meta.is_some(),
                is_dir: meta.map(|m| m.is_dir()).unwrap_or(false),
                path: path.to_string_lossy().into_owned(),
            }
        })
        .collect();
    LaunchArgs(paths)
}

/// The paths given on the command line, resolved.
#[tauri::command]
pub fn launch_paths(args: tauri::State<'_, LaunchArgs>) -> Vec<LaunchPath> {
    args.0.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_paths() {
        let base = Path::new("/home/me/notes");
        assert_eq!(absolute(base, "."), PathBuf::from("/home/me/notes"));
        assert_eq!(absolute(base, "a/../b.md"), PathBuf::from("/home/me/notes/b.md"));
        assert_eq!(absolute(base, "../x"), PathBuf::from("/home/me/x"));
        assert_eq!(absolute(base, "/tmp/y.md"), PathBuf::from("/tmp/y.md"));
    }
}
