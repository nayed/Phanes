//! Phanes' own persisted state (settings, last workspace, session tabs),
//! kept as one JSON document in the app config directory.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

const FILE_NAME: &str = "state.json";

fn state_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(FILE_NAME))
}

#[tauri::command]
pub fn load_app_state<R: Runtime>(app: AppHandle<R>) -> Result<Value, String> {
    let path = state_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or(Value::Null)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_app_state<R: Runtime>(app: AppHandle<R>, state: Value) -> Result<(), String> {
    let path = state_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    // Write to a temporary file then rename, so a crash never leaves half a file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
