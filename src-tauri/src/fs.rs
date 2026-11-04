//! All file access of Phanes: reading, writing, listing, creating, renaming,
//! duplicating, trashing and revealing files. The frontend reaches these
//! only through `src/lib/fs.ts`. (The file watcher will live here too.)

use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

type Result<T> = std::result::Result<T, String>;

/// Names never shown in the workspace tree.
const IGNORED: &[&str] = &[".git", "node_modules"];
const MARKDOWN: &[&str] = &["md", "markdown"];
const IMAGES: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"];

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Directory,
    Markdown,
    Image,
    Other,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    path: String,
    kind: EntryKind,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    exists: bool,
    is_dir: bool,
}

fn err(context: &str, path: &Path, e: io::Error) -> String {
    let what = match e.kind() {
        ErrorKind::NotFound => "not found".to_string(),
        ErrorKind::PermissionDenied => "permission denied".to_string(),
        ErrorKind::AlreadyExists => "already exists".to_string(),
        _ => e.to_string(),
    };
    format!("{context} {}: {what}", path.display())
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn kind_of(path: &Path, is_dir: bool) -> EntryKind {
    if is_dir {
        return EntryKind::Directory;
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if MARKDOWN.contains(&ext.as_str()) {
        EntryKind::Markdown
    } else if IMAGES.contains(&ext.as_str()) {
        EntryKind::Image
    } else {
        EntryKind::Other
    }
}

/// List a folder for the tree: no dotfiles, `.git` or `node_modules`;
/// folders first, then files, each sorted case-insensitively.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<Entry>> {
    let dir = PathBuf::from(&path);
    let read = fs::read_dir(&dir).map_err(|e| err("Cannot list", &dir, e))?;
    let mut entries: Vec<Entry> = read
        .filter_map(|r| r.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            if name.starts_with('.') || IGNORED.contains(&name.as_str()) {
                return None;
            }
            let path = entry.path();
            // Follow symlinks so a linked folder shows as a folder.
            let is_dir = fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false);
            Some(Entry {
                kind: kind_of(&path, is_dir),
                path: path_string(&path),
                name,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        let a_dir = a.kind == EntryKind::Directory;
        let b_dir = b.kind == EntryKind::Directory;
        b_dir
            .cmp(&a_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

#[tauri::command]
pub fn path_info(path: String) -> PathInfo {
    match fs::metadata(&path) {
        Ok(m) => PathInfo { exists: true, is_dir: m.is_dir() },
        Err(_) => PathInfo { exists: false, is_dir: false },
    }
}

/// Read a UTF-8 text file. A leading byte-order mark is dropped.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String> {
    let p = Path::new(&path);
    let bytes = fs::read(p).map_err(|e| err("Cannot open", p, e))?;
    let text = String::from_utf8(bytes)
        .map_err(|_| format!("Cannot open {}: it is not UTF-8 text", p.display()))?;
    Ok(text.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(text))
}

/// Write a text file, creating it if needed. Writes in place so permissions,
/// symlinks and hard links of the existing file are kept.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<()> {
    let p = Path::new(&path);
    fs::write(p, contents).map_err(|e| err("Cannot save", p, e))
}

/// Create a new empty file. Fails if something already exists at that path.
#[tauri::command]
pub fn create_file(path: String) -> Result<()> {
    let p = Path::new(&path);
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(p)
        .map(|_| ())
        .map_err(|e| err("Cannot create", p, e))
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<()> {
    let p = Path::new(&path);
    fs::create_dir(p).map_err(|e| err("Cannot create", p, e))
}

/// Rename or move a file or folder. Never overwrites an existing item.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<()> {
    let (from, to) = (Path::new(&from), Path::new(&to));
    if from == to {
        return Ok(());
    }
    if let Ok(existing) = to.symlink_metadata() {
        // Only allowed when `to` is the same item (a case-only rename on a
        // case-insensitive file system); never replace another file.
        if !same_file(from, &existing) {
            return Err(format!("Cannot rename: {} already exists", to.display()));
        }
    }
    fs::rename(from, to).map_err(|e| err("Cannot rename", from, e))
}

#[cfg(unix)]
fn same_file(path: &Path, other: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    path.symlink_metadata()
        .map(|m| m.dev() == other.dev() && m.ino() == other.ino())
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn same_file(_path: &Path, _other: &fs::Metadata) -> bool {
    false
}

/// The first free "name copy.ext", "name copy 2.ext"… next to `path`.
fn duplicate_target(path: &Path) -> PathBuf {
    let parent = path.parent().unwrap_or(Path::new("/"));
    let is_dir = path.is_dir();
    let (stem, ext) = if is_dir {
        (path.file_name().unwrap_or_default().to_string_lossy().into_owned(), None)
    } else {
        (
            path.file_stem().unwrap_or_default().to_string_lossy().into_owned(),
            path.extension().map(|e| e.to_string_lossy().into_owned()),
        )
    };
    (1..)
        .map(|n| {
            let base = if n == 1 { format!("{stem} copy") } else { format!("{stem} copy {n}") };
            let name = match &ext {
                Some(ext) => format!("{base}.{ext}"),
                None => base,
            };
            parent.join(name)
        })
        .find(|candidate| candidate.symlink_metadata().is_err())
        .expect("an unused name always exists")
}

fn copy_recursive(from: &Path, to: &Path) -> io::Result<()> {
    if from.is_dir() {
        fs::create_dir(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

/// Copy a file or folder next to itself and return the new path.
#[tauri::command]
pub fn duplicate_path(path: String) -> Result<String> {
    let from = Path::new(&path);
    let to = duplicate_target(from);
    copy_recursive(from, &to).map_err(|e| err("Cannot duplicate", from, e))?;
    Ok(path_string(&to))
}

/// Move to the system trash (GNOME Files' Trash). Never a permanent delete.
#[tauri::command]
pub fn trash_path(path: String) -> Result<()> {
    trash::delete(&path).map_err(|e| format!("Cannot move {path} to the trash: {e}"))
}

/// Show the item selected in the file manager.
#[tauri::command]
pub fn reveal_path(path: String) -> Result<()> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| format!("Cannot show {path}: {e}"))
}

/// Make a folder the workspace: check it, return its canonical path, and let
/// the preview load its images through the asset protocol.
#[tauri::command]
pub fn open_workspace<R: Runtime>(app: AppHandle<R>, path: String) -> Result<String> {
    let p = Path::new(&path);
    let canonical = fs::canonicalize(p).map_err(|e| err("Cannot open", p, e))?;
    if !canonical.is_dir() {
        return Err(format!("{} is not a folder", canonical.display()));
    }
    allow_assets(&app, &canonical)?;
    Ok(path_string(&canonical))
}

/// Let the preview load images from a folder (e.g. a file opened outside the workspace).
#[tauri::command]
pub fn allow_asset_dir<R: Runtime>(app: AppHandle<R>, path: String) -> Result<()> {
    allow_assets(&app, Path::new(&path))
}

fn allow_assets<R: Runtime>(app: &AppHandle<R>, dir: &Path) -> Result<()> {
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|e| e.to_string())
}
