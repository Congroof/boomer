use crate::engine::client::run_endpoint_debug_test;
use crate::error::{AppError, AppResult};
use crate::models::endpoint::{EndpointConfig, SingleTestRequest, SingleTestResponse};
use crate::AppState;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn list_endpoints(state: State<'_, AppState>) -> AppResult<Vec<EndpointConfig>> {
    state.store.load_or_seed_endpoints(state.manager.mock_port)
}

#[tauri::command]
pub async fn upsert_endpoint(
    state: State<'_, AppState>,
    mut endpoint: EndpointConfig,
) -> AppResult<Vec<EndpointConfig>> {
    if endpoint.name.trim().is_empty() {
        return Err(AppError::Validation("接口名称不能为空".to_string()));
    }
    if endpoint.url.trim().is_empty() {
        return Err(AppError::Validation("接口 URL 不能为空".to_string()));
    }

    let now = Utc::now().to_rfc3339();
    let mut list = state.store.load_or_seed_endpoints(state.manager.mock_port)?;

    if endpoint.id.trim().is_empty() {
        endpoint.id = Uuid::new_v4().to_string();
        endpoint.created_at = now.clone();
    }
    endpoint.updated_at = now;

    if let Some(existing) = list.iter_mut().find(|item| item.id == endpoint.id) {
        *existing = endpoint;
    } else {
        list.insert(0, endpoint);
    }

    state.store.save_endpoints(&list)?;
    Ok(list)
}

#[tauri::command]
pub async fn delete_endpoints(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> AppResult<Vec<EndpointConfig>> {
    let mut list = state.store.load_or_seed_endpoints(state.manager.mock_port)?;
    let id_set: std::collections::HashSet<String> = ids.into_iter().collect();
    list.retain(|ep| !id_set.contains(&ep.id));
    state.store.save_endpoints(&list)?;
    Ok(list)
}

#[tauri::command]
pub async fn toggle_endpoint(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> AppResult<Vec<EndpointConfig>> {
    let mut list = state.store.load_or_seed_endpoints(state.manager.mock_port)?;
    if let Some(ep) = list.iter_mut().find(|item| item.id == id) {
        ep.enabled = enabled;
        ep.updated_at = Utc::now().to_rfc3339();
    }
    state.store.save_endpoints(&list)?;
    Ok(list)
}

#[tauri::command]
pub async fn import_endpoints(
    state: State<'_, AppState>,
    incoming: Vec<EndpointConfig>,
    replace_all: bool,
) -> AppResult<Vec<EndpointConfig>> {
    let now = Utc::now().to_rfc3339();
    let mut list = if replace_all {
        Vec::new()
    } else {
        state.store.load_or_seed_endpoints(state.manager.mock_port)?
    };

    for mut ep in incoming {
        ep.id = Uuid::new_v4().to_string();
        if ep.created_at.trim().is_empty() {
            ep.created_at = now.clone();
        }
        ep.updated_at = now.clone();
        list.push(ep);
    }

    state.store.save_endpoints(&list)?;
    Ok(list)
}

#[tauri::command]
pub async fn add_demo_endpoints(state: State<'_, AppState>) -> AppResult<Vec<EndpointConfig>> {
    state.store.append_demo_endpoints(state.manager.mock_port)
}

#[tauri::command]
pub async fn test_single_endpoint(
    state: State<'_, AppState>,
    request: SingleTestRequest,
) -> AppResult<SingleTestResponse> {
    let settings = state.store.load_settings()?;
    run_endpoint_debug_test(
        &request.endpoint,
        &request.params,
        settings.default_timeout_ms,
        &settings.default_user_agent,
        &settings.global_proxy_url,
    )
    .await
}
