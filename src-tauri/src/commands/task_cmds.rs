use crate::error::{AppError, AppResult};
use crate::models::task::{TaskConfig, TaskSnapshot};
use crate::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn start_task(
    app: AppHandle,
    state: State<'_, AppState>,
    config: TaskConfig,
) -> AppResult<TaskSnapshot> {
    let all_endpoints = state.store.load_or_seed_endpoints(state.manager.mock_port)?;
    let id_set: std::collections::HashSet<&str> =
        config.endpoint_ids.iter().map(|s| s.as_str()).collect();

    let selected: Vec<_> = all_endpoints
        .into_iter()
        .filter(|ep| id_set.contains(ep.id.as_str()))
        .collect();

    if selected.is_empty() {
        return Err(AppError::Validation(
            "未找到所选接口，请先选择至少一个有效接口".to_string(),
        ));
    }

    let settings = state.store.load_settings()?;
    let app_handle = app.clone();
    let emit_cb = Arc::new(move |snap: &TaskSnapshot| {
        let _ = app_handle.emit("task-updated", snap);
    });

    state
        .manager
        .start_task(config, selected, &settings, emit_cb)
}

#[tauri::command]
pub async fn pause_task(state: State<'_, AppState>, task_id: String) -> AppResult<TaskSnapshot> {
    state.manager.pause_task(&task_id)
}

#[tauri::command]
pub async fn resume_task(state: State<'_, AppState>, task_id: String) -> AppResult<TaskSnapshot> {
    state.manager.resume_task(&task_id)
}

#[tauri::command]
pub async fn cancel_task(state: State<'_, AppState>, task_id: String) -> AppResult<TaskSnapshot> {
    state.manager.cancel_task(&task_id)
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> AppResult<Vec<TaskSnapshot>> {
    state.manager.list_all_snapshots()
}

#[tauri::command]
pub async fn get_task(state: State<'_, AppState>, task_id: String) -> AppResult<TaskSnapshot> {
    state.manager.get_task_snapshot(&task_id)
}

#[tauri::command]
pub async fn delete_task_history(
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<Vec<TaskSnapshot>> {
    let _ = state.store.delete_task_history_item(&task_id)?;
    state.manager.list_all_snapshots()
}

#[tauri::command]
pub async fn clear_task_history(state: State<'_, AppState>) -> AppResult<Vec<TaskSnapshot>> {
    state.store.clear_task_history()?;
    state.manager.list_all_snapshots()
}
