mod app_state;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                window::setup(&main);
                main.show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_state::load_app_state,
            app_state::save_app_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Phanes");
}
