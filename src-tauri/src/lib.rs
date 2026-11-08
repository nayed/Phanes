mod app_state;
mod cli;
mod fs;
mod gtk_theme;
mod system_theme;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(cli::parse())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                // Shown by the frontend once its first render is in place; shown
                // anyway after a few seconds if the frontend never says so (it
                // failed to start), so there is something on screen to look at.
                window::setup(&main);
                let fallback = main.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    if !fallback.is_visible().unwrap_or(true) {
                        let _ = fallback.show();
                    }
                });
            }
            system_theme::watch(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_state::load_app_state,
            app_state::save_app_state,
            cli::launch_paths,
            system_theme::system_color_scheme,
            gtk_theme::set_gtk_dark,
            fs::list_dir,
            fs::path_info,
            fs::read_text_file,
            fs::write_text_file,
            fs::create_file,
            fs::create_dir,
            fs::rename_path,
            fs::duplicate_path,
            fs::trash_path,
            fs::reveal_path,
            fs::open_workspace,
            fs::allow_asset_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Phanes");
}
