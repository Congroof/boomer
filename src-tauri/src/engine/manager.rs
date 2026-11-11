use crate::engine::executor::{spawn_concurrent_task, RunningTaskHandle, SnapshotCallback};
use crate::error::{AppError, AppResult};
use crate::models::endpoint::EndpointConfig;
use crate::models::settings::AppSettings;
use crate::models::task::{TaskConfig, TaskSnapshot};
use crate::storage::LocalStore;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

/// Coordinates active Tokio tasks and persists finished task history.
pub struct TaskManager {
    active_tasks: Arc<RwLock<HashMap<String, Arc<RunningTaskHandle>>>>,
    store: Arc<LocalStore>,
    pub mock_port: u16,
}

impl TaskManager {
    pub fn new(store: Arc<LocalStore>, mock_port: u16) -> Self {
        Self {
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            store,
            mock_port,
        }
    }

    pub fn start_task(
        &self,
        config: TaskConfig,
        endpoints: Vec<EndpointConfig>,
        settings: &AppSettings,
        on_snapshot: SnapshotCallback,
    ) -> AppResult<TaskSnapshot> {
        let task_id = Uuid::new_v4().to_string();
        let active_map = self.active_tasks.clone();
        let store_ref = self.store.clone();
        let max_history = settings.max_history_records;

        let task_id_for_finish = task_id.clone();
        let on_finished = Arc::new(move |final_snap: TaskSnapshot| {
            active_map.write().remove(&task_id_for_finish);
            let _ = store_ref.save_task_to_history(final_snap, max_history);
        });

        let handle = spawn_concurrent_task(
            task_id.clone(),
            config,
            endpoints,
            settings.default_user_agent.clone(),
            settings.global_proxy_url.clone(),
            on_snapshot,
            on_finished,
        )?;

        let snap = handle.snapshot.read().clone();
        self.active_tasks.write().insert(task_id, handle);
        Ok(snap)
    }

    pub fn pause_task(&self, task_id: &str) -> AppResult<TaskSnapshot> {
        let handle = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("未找到运行中的任务: {}", task_id)))?;
        handle.pause()
    }

    pub fn resume_task(&self, task_id: &str) -> AppResult<TaskSnapshot> {
        let handle = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("未找到已暂停的任务: {}", task_id)))?;
        handle.resume()
    }

    pub fn cancel_task(&self, task_id: &str) -> AppResult<TaskSnapshot> {
        let handle = self
            .active_tasks
            .read()
            .get(task_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("未找到活动任务: {}", task_id)))?;
        handle.cancel()
    }

    pub fn list_all_snapshots(&self) -> AppResult<Vec<TaskSnapshot>> {
        let mut results: Vec<TaskSnapshot> = self
            .active_tasks
            .read()
            .values()
            .map(|h| h.snapshot.read().clone())
            .collect();

        let active_ids: std::collections::HashSet<String> =
            results.iter().map(|s| s.id.clone()).collect();

        let history = self.store.load_task_history()?;
        for item in history {
            if !active_ids.contains(&item.id) {
                results.push(item);
            }
        }

        results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(results)
    }

    pub fn get_task_snapshot(&self, task_id: &str) -> AppResult<TaskSnapshot> {
        if let Some(active) = self.active_tasks.read().get(task_id) {
            return Ok(active.snapshot.read().clone());
        }
        let history = self.store.load_task_history()?;
        history
            .into_iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| AppError::NotFound(format!("未找到任务记录: {}", task_id)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::mock_server::start_local_mock_server;
    use crate::models::endpoint::{
        AssertionConfig, BodyType, HttpMethod, JsonFieldAssertion, RequestBodyConfig,
        VariableDefinition,
    };
    use crate::models::task::{ParamInjectionMode, TaskStatus};
    use std::time::Duration;

    #[tokio::test]
    async fn test_concurrent_execution_pause_resume_and_stats() {
        let port = start_local_mock_server().await.unwrap();
        let temp_dir =
            std::env::temp_dir().join(format!("pulse_test_{}", Uuid::new_v4()));
        let store = Arc::new(LocalStore::new(temp_dir.clone()).unwrap());
        let manager = TaskManager::new(store.clone(), port);

        let endpoint = EndpointConfig {
            id: "ep-1".to_string(),
            name: "Local Echo POST".to_string(),
            group: "测试组".to_string(),
            tags: vec!["mock".to_string()],
            enabled: true,
            description: "测试手机号参数并发注入".to_string(),
            method: HttpMethod::POST,
            url: format!("http://127.0.0.1:{}/mock/echo?delay_ms=25", port),
            query_params: vec![],
            headers: vec![],
            body: RequestBodyConfig {
                body_type: BodyType::Json,
                raw_content: r#"{"phone":"{{phone}}","seq":"{{$seq}}"}"#.to_string(),
                raw_content_type: "application/json".to_string(),
                form_items: vec![],
            },
            variables: vec![VariableDefinition {
                key: "phone".to_string(),
                label: "手机号".to_string(),
                default_value: "13800138000".to_string(),
                required: true,
                description: "".to_string(),
            }],
            assertions: AssertionConfig {
                status_codes: "200".to_string(),
                body_contains: "13912345678".to_string(),
                body_not_contains: "".to_string(),
                json_assertions: vec![JsonFieldAssertion {
                    path: "code".to_string(),
                    expected: "0".to_string(),
                }],
                max_latency_ms: None,
            },
            timeout_ms: Some(5000),
            follow_redirects: true,
            verify_ssl: true,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        };

        let mut single_params = HashMap::new();
        single_params.insert("phone".to_string(), "13912345678".to_string());

        let task_cfg = TaskConfig {
            name: "并发暂停恢复测试".to_string(),
            endpoint_ids: vec!["ep-1".to_string()],
            param_mode: ParamInjectionMode::Single,
            single_params,
            dataset_rows: vec![],
            concurrency: 4,
            iterations: 24,
            interval_ms: 0,
            max_rps: None,
            timeout_ms: 5000,
            retry_count: 0,
            proxy_url: None,
            stop_on_fail_count: None,
        };

        let settings = AppSettings::default();
        let noop_cb: SnapshotCallback = Arc::new(|_| {});

        let initial = manager
            .start_task(task_cfg, vec![endpoint], &settings, noop_cb)
            .unwrap();
        let task_id = initial.id;

        // Wait briefly so a few requests complete, then PAUSE
        tokio::time::sleep(Duration::from_millis(45)).await;
        let paused_snap = manager.pause_task(&task_id).unwrap();
        assert_eq!(paused_snap.status, TaskStatus::Paused);

        // Wait for in-flight requests to settle, record completed count, verify it stays frozen
        tokio::time::sleep(Duration::from_millis(60)).await;
        let frozen_a = manager.get_task_snapshot(&task_id).unwrap();
        tokio::time::sleep(Duration::from_millis(80)).await;
        let frozen_b = manager.get_task_snapshot(&task_id).unwrap();
        assert_eq!(frozen_a.metrics.completed, frozen_b.metrics.completed);
        assert!(frozen_b.metrics.completed < 24);

        // RESUME and wait for completion
        let resumed_snap = manager.resume_task(&task_id).unwrap();
        assert_eq!(resumed_snap.status, TaskStatus::Running);

        for _ in 0..50 {
            let snap = manager.get_task_snapshot(&task_id).unwrap();
            if snap.status == TaskStatus::Completed {
                assert_eq!(snap.metrics.completed, 24);
                assert_eq!(snap.metrics.succeeded, 24);
                assert_eq!(snap.metrics.failed, 0);
                let _ = std::fs::remove_dir_all(&temp_dir);
                return;
            }
            tokio::time::sleep(Duration::from_millis(30)).await;
        }

        panic!("Task did not finish within timeout");
    }
}
