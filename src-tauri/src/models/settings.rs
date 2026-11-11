use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_concurrency: usize,
    pub default_timeout_ms: u64,
    pub default_user_agent: String,
    pub global_proxy_url: String,
    pub max_history_records: usize,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_concurrency: 16,
            default_timeout_ms: 10_000,
            default_user_agent: "Pulse/0.1.0".to_string(),
            global_proxy_url: String::new(),
            max_history_records: 50,
            theme: "dark".to_string(),
        }
    }
}
