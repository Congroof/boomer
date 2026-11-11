use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParamInjectionMode {
    Single,
    Dataset,
}

impl Default for ParamInjectionMode {
    fn default() -> Self {
        Self::Single
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskConfig {
    pub name: String,
    pub endpoint_ids: Vec<String>,
    #[serde(default)]
    pub param_mode: ParamInjectionMode,
    #[serde(default)]
    pub single_params: HashMap<String, String>,
    #[serde(default)]
    pub dataset_rows: Vec<HashMap<String, String>>,
    pub concurrency: usize,
    pub iterations: u64,
    #[serde(default)]
    pub interval_ms: u64,
    #[serde(default)]
    pub max_rps: Option<u32>,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub stop_on_fail_count: Option<u64>,
}

fn default_timeout_ms() -> u64 {
    10_000
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Running,
    Paused,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointMetric {
    pub endpoint_id: String,
    pub endpoint_name: String,
    pub method: String,
    pub total: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub avg_latency_ms: f64,
    pub min_latency_ms: u64,
    pub max_latency_ms: u64,
    pub p95_latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSeriesPoint {
    pub second_offset: u64,
    pub timestamp_label: String,
    pub rps: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub avg_latency_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestLogEntry {
    pub seq: u64,
    pub timestamp: String,
    pub endpoint_id: String,
    pub endpoint_name: String,
    pub method: String,
    pub resolved_url: String,
    pub injected_params: HashMap<String, String>,
    pub success: bool,
    pub status_code: Option<u16>,
    pub latency_ms: u64,
    pub retries_used: u32,
    pub failure_reason: Option<String>,
    pub response_preview: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetrics {
    pub total_planned: u64,
    pub completed: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub retried: u64,
    pub in_flight: u64,
    pub bytes_received: u64,
    pub active_elapsed_ms: u64,
    pub current_rps: f64,
    pub avg_rps: f64,
    pub peak_rps: u64,
    pub min_latency_ms: u64,
    pub max_latency_ms: u64,
    pub avg_latency_ms: f64,
    pub p50_latency_ms: u64,
    pub p90_latency_ms: u64,
    pub p95_latency_ms: u64,
    pub p99_latency_ms: u64,
    pub status_codes: BTreeMap<String, u64>,
    pub failure_reasons: BTreeMap<String, u64>,
    pub endpoint_metrics: Vec<EndpointMetric>,
    pub timeline: Vec<TimeSeriesPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub id: String,
    pub config: TaskConfig,
    pub status: TaskStatus,
    pub created_at: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub metrics: TaskMetrics,
    pub recent_logs: Vec<RequestLogEntry>,
    pub recent_failures: Vec<RequestLogEntry>,
}
