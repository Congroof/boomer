pub mod commands;
pub mod engine;
pub mod error;
pub mod models;
pub mod storage;

use engine::manager::TaskManager;
use engine::mock_server::spawn_mock_server_on_tauri_runtime;
use std::sync::Arc;
use storage::LocalStore;
use tauri::Manager;

pub struct AppState {
    pub store: Arc<LocalStore>,
    pub manager: Arc<TaskManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("com.pulse.desktop"));

            let store = Arc::new(
                LocalStore::new(data_dir).expect("Failed to initialize local data directory"),
            );
            let mock_port = spawn_mock_server_on_tauri_runtime().unwrap_or(18999);
            // Seed or sync built-in demo endpoints on startup
            let _ = store.load_or_seed_endpoints(mock_port);

            let manager = Arc::new(TaskManager::new(store.clone(), mock_port));

            app.manage(AppState { store, manager });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::endpoint_cmds::list_endpoints,
            commands::endpoint_cmds::upsert_endpoint,
            commands::endpoint_cmds::delete_endpoints,
            commands::endpoint_cmds::toggle_endpoint,
            commands::endpoint_cmds::import_endpoints,
            commands::endpoint_cmds::add_demo_endpoints,
            commands::endpoint_cmds::test_single_endpoint,
            commands::task_cmds::start_task,
            commands::task_cmds::pause_task,
            commands::task_cmds::resume_task,
            commands::task_cmds::cancel_task,
            commands::task_cmds::list_tasks,
            commands::task_cmds::get_task,
            commands::task_cmds::delete_task_history,
            commands::task_cmds::clear_task_history,
            commands::system_cmds::get_settings,
            commands::system_cmds::update_settings,
            commands::system_cmds::get_runtime_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
