use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
    HEAD,
    OPTIONS,
}

impl HttpMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            HttpMethod::GET => "GET",
            HttpMethod::POST => "POST",
            HttpMethod::PUT => "PUT",
            HttpMethod::PATCH => "PATCH",
            HttpMethod::DELETE => "DELETE",
            HttpMethod::HEAD => "HEAD",
            HttpMethod::OPTIONS => "OPTIONS",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub id: String,
    pub key: String,
    pub value: String,
    pub enabled: bool,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BodyType {
    None,
    Json,
    FormUrlencoded,
    Multipart,
    Raw,
}

impl Default for BodyType {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestBodyConfig {
    #[serde(default)]
    pub body_type: BodyType,
    #[serde(default)]
    pub raw_content: String,
    #[serde(default = "default_raw_content_type")]
    pub raw_content_type: String,
    #[serde(default)]
    pub form_items: Vec<KeyValueItem>,
}

fn default_raw_content_type() -> String {
    "text/plain; charset=utf-8".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableDefinition {
    pub key: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub default_value: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonFieldAssertion {
    pub path: String,
    pub expected: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssertionConfig {
    #[serde(default = "default_status_codes")]
    pub status_codes: String,
    #[serde(default)]
    pub body_contains: String,
    #[serde(default)]
    pub body_not_contains: String,
    #[serde(default)]
    pub json_assertions: Vec<JsonFieldAssertion>,
    #[serde(default)]
    pub max_latency_ms: Option<u64>,
}

fn default_status_codes() -> String {
    "200-299".to_string()
}

impl Default for AssertionConfig {
    fn default() -> Self {
        Self {
            status_codes: default_status_codes(),
            body_contains: String::new(),
            body_not_contains: String::new(),
            json_assertions: Vec::new(),
            max_latency_ms: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub description: String,
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub query_params: Vec<KeyValueItem>,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub body: RequestBodyConfig,
    #[serde(default)]
    pub variables: Vec<VariableDefinition>,
    #[serde(default)]
    pub assertions: AssertionConfig,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default = "default_true")]
    pub follow_redirects: bool,
    #[serde(default = "default_true")]
    pub verify_ssl: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn default_group() -> String {
    "默认分组".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SingleTestRequest {
    pub endpoint: EndpointConfig,
    #[serde(default)]
    pub params: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SingleTestResponse {
    pub success: bool,
    pub status_code: Option<u16>,
    pub status_text: String,
    pub latency_ms: u64,
    pub size_bytes: usize,
    pub resolved_url: String,
    pub resolved_headers: Vec<(String, String)>,
    pub resolved_body_preview: String,
    pub response_headers: Vec<(String, String)>,
    pub response_body: String,
    pub assertion_passed: bool,
    pub failure_reason: Option<String>,
}
