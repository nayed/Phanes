//! Where Phanes keeps the files it writes for itself (`state.json`,
//! `window.json`): `~/.local/state/phanes`, the XDG state folder. They are
//! state, not configuration: `~/.config/phanes` is the user's own (the vimrc).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const FILES: &[&str] = &["state.json", "window.json"];

/// `$XDG_STATE_HOME/phanes`, by default `~/.local/state/phanes`.
pub fn dir() -> Option<PathBuf> {
    let base = env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/state")))?;
    Some(base.join("phanes"))
}

/// The folder Phanes 1.3 and older used: Tauri's config folder for the app id.
fn old_dir() -> Option<PathBuf> {
    let base = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    Some(base.join("io.nayed.Phanes"))
}

/// Move the files of an older Phanes to the state folder, once. Called at
/// startup before anything reads them.
pub fn migrate() {
    if let (Some(old), Some(new)) = (old_dir(), dir()) {
        move_files(&old, &new);
    }
}

/// Move each file that is in `old` but not yet in `new`, then remove `old` if
/// nothing else is left in it. Failures are logged and leave the old file be.
fn move_files(old: &Path, new: &Path) {
    for name in FILES {
        let (from, to) = (old.join(name), new.join(name));
        if !from.is_file() || to.exists() {
            continue;
        }
        let moved = fs::create_dir_all(new)
            .and_then(|_| fs::rename(&from, &to).or_else(|_| fs::copy(&from, &to).and_then(|_| fs::remove_file(&from))));
        if let Err(e) = moved {
            eprintln!("Phanes: cannot move {} to {}: {e}", from.display(), to.display());
        }
    }
    // Only succeeds when empty: a folder holding anything else is kept.
    let _ = fs::remove_dir(old);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("phanes-state-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_the_files_and_removes_the_empty_old_folder() {
        let root = temp("move");
        let (old, new) = (root.join("old"), root.join("new"));
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("state.json"), "{}").unwrap();
        fs::write(old.join("window.json"), "[]").unwrap();
        move_files(&old, &new);
        assert_eq!(fs::read_to_string(new.join("state.json")).unwrap(), "{}");
        assert_eq!(fs::read_to_string(new.join("window.json")).unwrap(), "[]");
        assert!(!old.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn never_overwrites_newer_files() {
        let root = temp("keep");
        let (old, new) = (root.join("old"), root.join("new"));
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(old.join("state.json"), "old").unwrap();
        fs::write(new.join("state.json"), "new").unwrap();
        fs::write(old.join("notes.txt"), "mine").unwrap();
        move_files(&old, &new);
        assert_eq!(fs::read_to_string(new.join("state.json")).unwrap(), "new");
        // The old folder still holds a file of its own, so it stays.
        assert!(old.join("notes.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
