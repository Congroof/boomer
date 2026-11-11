use crate::error::AppResult;
use crate::models::settings::AppSettings;
use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub os: String,
    pub arch: String,
    pub cpu_cores: usize,
    pub mock_base_url: String,
    pub data_dir: String,
    pub app_version: String,
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.store.load_settings()
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    state.store.save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn get_runtime_info(state: State<'_, AppState>) -> AppResult<RuntimeInfo> {
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);

    Ok(RuntimeInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_cores: cores,
        mock_base_url: format!("http://127.0.0.1:{}/mock", state.manager.mock_port),
        data_dir: state.store.base_dir().to_string_lossy().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
