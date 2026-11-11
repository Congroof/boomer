use crate::error::AppResult;
use crate::models::endpoint::{
    AssertionConfig, BodyType, EndpointConfig, HttpMethod, JsonFieldAssertion, KeyValueItem,
    RequestBodyConfig, VariableDefinition,
};
use crate::models::settings::AppSettings;
use crate::models::task::TaskSnapshot;
use chrono::Utc;
use parking_lot::Mutex;
use regex::Regex;
use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct LocalStore {
    base_dir: PathBuf,
    io_lock: Mutex<()>,
}

impl LocalStore {
    pub fn new(base_dir: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&base_dir)?;
        Ok(Self {
            base_dir,
            io_lock: Mutex::new(()),
        })
    }

    pub fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    fn endpoints_path(&self) -> PathBuf {
        self.base_dir.join("endpoints.json")
    }

    fn history_path(&self) -> PathBuf {
        self.base_dir.join("task_history.json")
    }

    fn settings_path(&self) -> PathBuf {
        self.base_dir.join("settings.json")
    }

    fn read_json_or<T: DeserializeOwned>(&self, path: &Path, fallback: T) -> AppResult<T> {
        let _guard = self.io_lock.lock();
        if !path.exists() {
            return Ok(fallback);
        }
        let content = fs::read_to_string(path)?;
        if content.trim().is_empty() {
            return Ok(fallback);
        }
        let parsed = serde_json::from_str::<T>(&content)?;
        Ok(parsed)
    }

    fn write_json_atomic<T: Serialize>(&self, path: &Path, value: &T) -> AppResult<()> {
        let _guard = self.io_lock.lock();
        let tmp_path = path.with_extension("json.tmp");
        let serialized = serde_json::to_string_pretty(value)?;
        fs::write(&tmp_path, serialized)?;
        fs::rename(&tmp_path, path)?;
        Ok(())
    }

    pub fn load_or_seed_endpoints(&self, mock_port: u16) -> AppResult<Vec<EndpointConfig>> {
        let path = self.endpoints_path();
        if !path.exists() {
            let demo = build_demo_endpoints(mock_port);
            self.write_json_atomic(&path, &demo)?;
            return Ok(demo);
        }

        let mut list: Vec<EndpointConfig> = self.read_json_or(&path, Vec::new())?;
        // Keep built-in `127.0.0.1:<ephemeral>/mock/...` URLs synced with current session's mock_port
        let re = Regex::new(r"^http://127\.0\.0\.1:\d+/mock/").unwrap();
        let mut updated = false;
        for ep in &mut list {
            if re.is_match(&ep.url) {
                let new_prefix = format!("http://127.0.0.1:{}/mock/", mock_port);
                let replaced = re.replace(&ep.url, new_prefix.as_str()).to_string();
                if replaced != ep.url {
                    ep.url = replaced;
                    updated = true;
                }
            }
        }
        if updated {
            self.write_json_atomic(&path, &list)?;
        }
        Ok(list)
    }

    pub fn save_endpoints(&self, endpoints: &[EndpointConfig]) -> AppResult<()> {
        self.write_json_atomic(&self.endpoints_path(), &endpoints)
    }

    pub fn append_demo_endpoints(&self, mock_port: u16) -> AppResult<Vec<EndpointConfig>> {
        let mut current = self.load_or_seed_endpoints(mock_port)?;
        let demos = build_demo_endpoints(mock_port);
        current.extend(demos);
        self.save_endpoints(&current)?;
        Ok(current)
    }

    pub fn load_settings(&self) -> AppResult<AppSettings> {
        self.read_json_or(&self.settings_path(), AppSettings::default())
    }

    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<()> {
        self.write_json_atomic(&self.settings_path(), settings)
    }

    pub fn load_task_history(&self) -> AppResult<Vec<TaskSnapshot>> {
        self.read_json_or(&self.history_path(), Vec::new())
    }

    pub fn save_task_to_history(
        &self,
        snapshot: TaskSnapshot,
        max_records: usize,
    ) -> AppResult<()> {
        let mut history = self.load_task_history()?;
        history.retain(|item| item.id != snapshot.id);
        history.insert(0, snapshot);
        let cap = max_records.clamp(5, 500);
        if history.len() > cap {
            history.truncate(cap);
        }
        self.write_json_atomic(&self.history_path(), &history)
    }

    pub fn delete_task_history_item(&self, task_id: &str) -> AppResult<Vec<TaskSnapshot>> {
        let mut history = self.load_task_history()?;
        history.retain(|item| item.id != task_id);
        self.write_json_atomic(&self.history_path(), &history)?;
        Ok(history)
    }

    pub fn clear_task_history(&self) -> AppResult<()> {
        let empty: Vec<TaskSnapshot> = Vec::new();
        self.write_json_atomic(&self.history_path(), &empty)
    }
}

pub fn build_demo_endpoints(mock_port: u16) -> Vec<EndpointConfig> {
    let now = Utc::now().to_rfc3339();
    vec![
        EndpointConfig {
            id: Uuid::new_v4().to_string(),
            name: "用户信息查询 (GET 参数模板示例)".to_string(),
            group: "内置示例 (本地高速回显)".to_string(),
            tags: vec!["GET".to_string(), "示例".to_string()],
            enabled: true,
            description: "演示 URL Query 中注入自定义参数 {{phone}} 与内置请求序号 {{$seq}}".to_string(),
            method: HttpMethod::GET,
            url: format!("http://127.0.0.1:{}/mock/user/profile", mock_port),
            query_params: vec![
                KeyValueItem {
                    id: Uuid::new_v4().to_string(),
                    key: "phone".to_string(),
                    value: "{{phone}}".to_string(),
                    enabled: true,
                    description: "用户手机号".to_string(),
                },
                KeyValueItem {
                    id: Uuid::new_v4().to_string(),
                    key: "channel".to_string(),
                    value: "{{channel}}".to_string(),
                    enabled: true,
                    description: "渠道标识".to_string(),
                },
                KeyValueItem {
                    id: Uuid::new_v4().to_string(),
                    key: "reqSeq".to_string(),
                    value: "{{$seq}}".to_string(),
                    enabled: true,
                    description: "递增序号".to_string(),
                },
            ],
            headers: vec![KeyValueItem {
                id: Uuid::new_v4().to_string(),
                key: "X-Trace-Id".to_string(),
                value: "{{$uuid}}".to_string(),
                enabled: true,
                description: "分布式追踪 ID".to_string(),
            }],
            body: RequestBodyConfig::default(),
            variables: vec![
                VariableDefinition {
                    key: "phone".to_string(),
                    label: "手机号".to_string(),
                    default_value: "13800138000".to_string(),
                    required: true,
                    description: "待测试的目标手机号".to_string(),
                },
                VariableDefinition {
                    key: "channel".to_string(),
                    label: "业务渠道".to_string(),
                    default_value: "desktop-pc".to_string(),
                    required: false,
                    description: "调用来源渠道".to_string(),
                },
            ],
            assertions: AssertionConfig {
                status_codes: "200".to_string(),
                body_contains: "".to_string(),
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
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        EndpointConfig {
            id: Uuid::new_v4().to_string(),
            name: "消息提交通道 (POST JSON 模板示例)".to_string(),
            group: "内置示例 (本地高速回显)".to_string(),
            tags: vec!["POST".to_string(), "JSON".to_string()],
            enabled: true,
            description: "演示 POST JSON 请求体参数注入与 65ms 模拟网络延迟（适合体验暂停/恢复）".to_string(),
            method: HttpMethod::POST,
            url: format!("http://127.0.0.1:{}/mock/delay?delay_ms=45", mock_port),
            query_params: vec![],
            headers: vec![KeyValueItem {
                id: Uuid::new_v4().to_string(),
                key: "X-Request-Timestamp".to_string(),
                value: "{{$timestamp_ms}}".to_string(),
                enabled: true,
                description: "毫秒级时间戳".to_string(),
            }],
            body: RequestBodyConfig {
                body_type: BodyType::Json,
                raw_content: "{\n  \"phone\": \"{{phone}}\",\n  \"scene\": \"login_verify\",\n  \"nonce\": \"{{$random_str:10}}\",\n  \"timestamp\": {{$timestamp}}\n}".to_string(),
                raw_content_type: "application/json".to_string(),
                form_items: vec![],
            },
            variables: vec![VariableDefinition {
                key: "phone".to_string(),
                label: "手机号".to_string(),
                default_value: "13800138000".to_string(),
                required: true,
                description: "接收业务测试的手机号参数".to_string(),
            }],
            assertions: AssertionConfig {
                status_codes: "200-299".to_string(),
                body_contains: "\"success\":true".to_string(),
                body_not_contains: "".to_string(),
                json_assertions: vec![JsonFieldAssertion {
                    path: "code".to_string(),
                    expected: "0".to_string(),
                }],
                max_latency_ms: Some(2000),
            },
            timeout_ms: Some(5000),
            follow_redirects: true,
            verify_ssl: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        },
        EndpointConfig {
            id: Uuid::new_v4().to_string(),
            name: "偶发限流网关模拟 (Form 表单 + 波动成功率)".to_string(),
            group: "内置示例 (本地高速回显)".to_string(),
            tags: vec!["Form".to_string(), "异常统计演示".to_string()],
            enabled: true,
            description: "模拟约 15% 概率返回 HTTP 503，直观展示成功/失败统计、状态码分布与错误原因分析".to_string(),
            method: HttpMethod::POST,
            url: format!(
                "http://127.0.0.1:{}/mock/flaky?delay_ms=30&fail_rate=15",
                mock_port
            ),
            query_params: vec![],
            headers: vec![],
            body: RequestBodyConfig {
                body_type: BodyType::FormUrlencoded,
                raw_content: String::new(),
                raw_content_type: String::new(),
                form_items: vec![
                    KeyValueItem {
                        id: Uuid::new_v4().to_string(),
                        key: "phone".to_string(),
                        value: "{{phone}}".to_string(),
                        enabled: true,
                        description: "手机号".to_string(),
                    },
                    KeyValueItem {
                        id: Uuid::new_v4().to_string(),
                        key: "ticket".to_string(),
                        value: "{{$random_int:100000:999999}}".to_string(),
                        enabled: true,
                        description: "随机 6 位凭证".to_string(),
                    },
                ],
            },
            variables: vec![VariableDefinition {
                key: "phone".to_string(),
                label: "手机号".to_string(),
                default_value: "13800138000".to_string(),
                required: true,
                description: "手机号参数".to_string(),
            }],
            assertions: AssertionConfig {
                status_codes: "200".to_string(),
                body_contains: "".to_string(),
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
            created_at: now.clone(),
            updated_at: now,
        },
    ]
}
