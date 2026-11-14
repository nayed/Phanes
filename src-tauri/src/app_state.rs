//! Phanes' own persisted state (settings, last workspace, session tabs),
//! kept as one JSON document in the state folder (`state_dir.rs`).

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::state_dir;

const FILE_NAME: &str = "state.json";

fn state_path() -> Result<PathBuf, String> {
    let dir = state_dir::dir().ok_or("No home folder to keep Phanes' state in")?;
    Ok(dir.join(FILE_NAME))
}

#[tauri::command]
pub fn load_app_state<R: Runtime>(_app: AppHandle<R>) -> Result<Value, String> {
    let path = state_path()?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or(Value::Null)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_app_state<R: Runtime>(_app: AppHandle<R>, state: Value) -> Result<(), String> {
    let path = state_path()?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    // Write to a temporary file then rename, so a crash never leaves half a file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
