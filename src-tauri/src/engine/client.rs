use crate::engine::assertion::evaluate_assertions;
use crate::engine::template::{render_template, TemplateContext};
use crate::error::{AppError, AppResult};
use crate::models::endpoint::{BodyType, EndpointConfig, HttpMethod, SingleTestResponse};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, USER_AGENT};
use reqwest::redirect::Policy;
use std::collections::HashMap;
use std::str::FromStr;
use std::time::{Duration, Instant};
use url::Url;

pub struct ClientBuildOptions<'a> {
    pub timeout_ms: u64,
    pub follow_redirects: bool,
    pub verify_ssl: bool,
    pub pool_max_idle: usize,
    pub user_agent: &'a str,
    pub proxy_url: Option<&'a str>,
}

pub fn build_http_client(opts: ClientBuildOptions<'_>) -> AppResult<reqwest::Client> {
    let redirect_policy = if opts.follow_redirects {
        Policy::limited(10)
    } else {
        Policy::none()
    };

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_millis(opts.timeout_ms.max(100)))
        .connect_timeout(Duration::from_millis(opts.timeout_ms.min(10_000).max(500)))
        .pool_max_idle_per_host(opts.pool_max_idle.max(32))
        .tcp_nodelay(true)
        .redirect(redirect_policy)
        .danger_accept_invalid_certs(!opts.verify_ssl);

    if !opts.user_agent.trim().is_empty() {
        builder = builder.user_agent(opts.user_agent.trim());
    }

    if let Some(proxy_str) = opts.proxy_url {
        let trimmed = proxy_str.trim();
        if !trimmed.is_empty() {
            let proxy = reqwest::Proxy::all(trimmed)
                .map_err(|e| AppError::Validation(format!("无效代理地址 '{}': {}", trimmed, e)))?;
            builder = builder.proxy(proxy);
        }
    }

    builder
        .build()
        .map_err(|e| AppError::Internal(format!("初始化 HTTP 客户端失败: {}", e)))
}

#[derive(Debug)]
pub struct ExecutedRequestOutcome {
    pub resolved_url: String,
    pub resolved_headers: Vec<(String, String)>,
    pub resolved_body_preview: String,
    pub status_code: Option<u16>,
    pub status_text: String,
    pub latency_ms: u64,
    pub bytes_received: usize,
    pub response_headers: Vec<(String, String)>,
    pub response_body: String,
    pub success: bool,
    pub failure_reason: Option<String>,
}

/// Executes a single HTTP request for `endpoint` using `client` and template `ctx`.
pub async fn execute_single_endpoint(
    client: &reqwest::Client,
    endpoint: &EndpointConfig,
    ctx: &TemplateContext<'_>,
    default_user_agent: &str,
    max_body_chars: usize,
) -> ExecutedRequestOutcome {
    let start = Instant::now();

    // 1. Resolve URL + query parameters
    let raw_url = render_template(endpoint.url.trim(), ctx);
    let parsed_url = match build_url_with_query(&raw_url, endpoint, ctx) {
        Ok(u) => u,
        Err(reason) => {
            return ExecutedRequestOutcome {
                resolved_url: raw_url,
                resolved_headers: Vec::new(),
                resolved_body_preview: String::new(),
                status_code: None,
                status_text: "INVALID_URL".to_string(),
                latency_ms: start.elapsed().as_millis() as u64,
                bytes_received: 0,
                response_headers: Vec::new(),
                response_body: String::new(),
                success: false,
                failure_reason: Some(reason),
            };
        }
    };

    let resolved_url_str = parsed_url.to_string();

    let method = match endpoint.method {
        HttpMethod::GET => reqwest::Method::GET,
        HttpMethod::POST => reqwest::Method::POST,
        HttpMethod::PUT => reqwest::Method::PUT,
        HttpMethod::PATCH => reqwest::Method::PATCH,
        HttpMethod::DELETE => reqwest::Method::DELETE,
        HttpMethod::HEAD => reqwest::Method::HEAD,
        HttpMethod::OPTIONS => reqwest::Method::OPTIONS,
    };

    let mut req_builder = client.request(method, parsed_url);

    if let Some(ep_timeout) = endpoint.timeout_ms {
        if ep_timeout > 0 {
            req_builder = req_builder.timeout(Duration::from_millis(ep_timeout));
        }
    }

    // 2. Resolve Headers
    let mut header_map = HeaderMap::new();
    let mut resolved_headers_vec = Vec::new();
    let mut has_user_agent = false;
    let mut has_content_type = false;

    for item in endpoint.headers.iter().filter(|h| h.enabled && !h.key.trim().is_empty()) {
        let k = render_template(item.key.trim(), ctx);
        let v = render_template(&item.value, ctx);
        if k.eq_ignore_ascii_case("user-agent") {
            has_user_agent = true;
        }
        if k.eq_ignore_ascii_case("content-type") {
            has_content_type = true;
        }
        if let (Ok(hn), Ok(hv)) = (HeaderName::from_str(&k), HeaderValue::from_str(&v)) {
            header_map.append(hn, hv);
            resolved_headers_vec.push((k, v));
        }
    }

    if !has_user_agent && !default_user_agent.trim().is_empty() {
        if let Ok(hv) = HeaderValue::from_str(default_user_agent.trim()) {
            header_map.insert(USER_AGENT, hv);
        }
    }

    // 3. Resolve Body
    let mut resolved_body_preview = String::new();
    match endpoint.body.body_type {
        BodyType::None => {}
        BodyType::Json => {
            let rendered = render_template(&endpoint.body.raw_content, ctx);
            resolved_body_preview = truncate_chars(&rendered, 1024);
            if !has_content_type {
                header_map.insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static("application/json; charset=utf-8"),
                );
                resolved_headers_vec.push((
                    "Content-Type".to_string(),
                    "application/json; charset=utf-8".to_string(),
                ));
            }
            req_builder = req_builder.body(rendered);
        }
        BodyType::Raw => {
            let rendered = render_template(&endpoint.body.raw_content, ctx);
            resolved_body_preview = truncate_chars(&rendered, 1024);
            if !has_content_type {
                let ct = if endpoint.body.raw_content_type.trim().is_empty() {
                    "text/plain; charset=utf-8"
                } else {
                    endpoint.body.raw_content_type.trim()
                };
                if let Ok(hv) = HeaderValue::from_str(ct) {
                    header_map.insert(CONTENT_TYPE, hv);
                    resolved_headers_vec.push(("Content-Type".to_string(), ct.to_string()));
                }
            }
            req_builder = req_builder.body(rendered);
        }
        BodyType::FormUrlencoded => {
            let mut pairs = Vec::new();
            for item in endpoint
                .body
                .form_items
                .iter()
                .filter(|f| f.enabled && !f.key.trim().is_empty())
            {
                let k = render_template(item.key.trim(), ctx);
                let v = render_template(&item.value, ctx);
                pairs.push((k, v));
            }
            resolved_body_preview = pairs
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("&");
            resolved_body_preview = truncate_chars(&resolved_body_preview, 1024);
            req_builder = req_builder.form(&pairs);
        }
        BodyType::Multipart => {
            let mut form = reqwest::multipart::Form::new();
            let mut summary_parts = Vec::new();
            for item in endpoint
                .body
                .form_items
                .iter()
                .filter(|f| f.enabled && !f.key.trim().is_empty())
            {
                let k = render_template(item.key.trim(), ctx);
                let v = render_template(&item.value, ctx);
                summary_parts.push(format!("{}={}", k, v));
                form = form.text(k, v);
            }
            resolved_body_preview = truncate_chars(&summary_parts.join("; "), 1024);
            req_builder = req_builder.multipart(form);
        }
    }

    req_builder = req_builder.headers(header_map);

    // 4. Send & Measure
    match req_builder.send().await {
        Err(err) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let reason = classify_reqwest_error(&err);
            ExecutedRequestOutcome {
                resolved_url: resolved_url_str,
                resolved_headers: resolved_headers_vec,
                resolved_body_preview,
                status_code: None,
                status_text: "NETWORK_ERROR".to_string(),
                latency_ms,
                bytes_received: 0,
                response_headers: Vec::new(),
                response_body: String::new(),
                success: false,
                failure_reason: Some(reason),
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let status_code = status.as_u16();
            let status_text = status
                .canonical_reason()
                .unwrap_or("UNKNOWN")
                .to_string();

            let response_headers: Vec<(String, String)> = resp
                .headers()
                .iter()
                .map(|(k, v)| {
                    (
                        k.as_str().to_string(),
                        v.to_str().unwrap_or("<binary>").to_string(),
                    )
                })
                .collect();

            match resp.bytes().await {
                Err(err) => {
                    let latency_ms = start.elapsed().as_millis() as u64;
                    ExecutedRequestOutcome {
                        resolved_url: resolved_url_str,
                        resolved_headers: resolved_headers_vec,
                        resolved_body_preview,
                        status_code: Some(status_code),
                        status_text,
                        latency_ms,
                        bytes_received: 0,
                        response_headers,
                        response_body: String::new(),
                        success: false,
                        failure_reason: Some(format!("读取响应流失败: {}", err)),
                    }
                }
                Ok(bytes) => {
                    let latency_ms = start.elapsed().as_millis() as u64;
                    let bytes_received = bytes.len();
                    // Cap decoded string size for safety when responses are huge
                    let inspect_slice = &bytes[..bytes.len().min(256 * 1024)];
                    let full_text = String::from_utf8_lossy(inspect_slice);

                    let assertion_res = evaluate_assertions(
                        &endpoint.assertions,
                        status_code,
                        &full_text,
                        latency_ms,
                    );

                    let preview = truncate_chars(&full_text, max_body_chars);
                    let (success, failure_reason) = match assertion_res {
                        Ok(()) => (true, None),
                        Err(reason) => (false, Some(reason)),
                    };

                    ExecutedRequestOutcome {
                        resolved_url: resolved_url_str,
                        resolved_headers: resolved_headers_vec,
                        resolved_body_preview,
                        status_code: Some(status_code),
                        status_text,
                        latency_ms,
                        bytes_received,
                        response_headers,
                        response_body: preview,
                        success,
                        failure_reason,
                    }
                }
            }
        }
    }
}

/// Runs a standalone endpoint debug request (used by "发送测试" in the UI).
pub async fn run_endpoint_debug_test(
    endpoint: &EndpointConfig,
    injected_params: &HashMap<String, String>,
    default_timeout_ms: u64,
    default_user_agent: &str,
    global_proxy_url: &str,
) -> AppResult<SingleTestResponse> {
    let client = build_http_client(ClientBuildOptions {
        timeout_ms: endpoint.timeout_ms.unwrap_or(default_timeout_ms),
        follow_redirects: endpoint.follow_redirects,
        verify_ssl: endpoint.verify_ssl,
        pool_max_idle: 4,
        user_agent: default_user_agent,
        proxy_url: if global_proxy_url.trim().is_empty() {
            None
        } else {
            Some(global_proxy_url)
        },
    })?;

    let defaults: HashMap<String, String> = endpoint
        .variables
        .iter()
        .filter(|v| !v.key.trim().is_empty())
        .map(|v| (v.key.trim().to_string(), v.default_value.clone()))
        .collect();

    let ctx = TemplateContext {
        params: injected_params,
        defaults: &defaults,
        seq: 1,
    };

    let outcome = execute_single_endpoint(&client, endpoint, &ctx, default_user_agent, 32_768).await;

    Ok(SingleTestResponse {
        success: outcome.success,
        status_code: outcome.status_code,
        status_text: outcome.status_text,
        latency_ms: outcome.latency_ms,
        size_bytes: outcome.bytes_received,
        resolved_url: outcome.resolved_url,
        resolved_headers: outcome.resolved_headers,
        resolved_body_preview: outcome.resolved_body_preview,
        response_headers: outcome.response_headers,
        response_body: outcome.response_body,
        assertion_passed: outcome.success && outcome.status_code.is_some(),
        failure_reason: outcome.failure_reason,
    })
}

fn build_url_with_query(
    raw_url: &str,
    endpoint: &EndpointConfig,
    ctx: &TemplateContext<'_>,
) -> Result<Url, String> {
    let with_scheme = if raw_url.starts_with("http://") || raw_url.starts_with("https://") {
        raw_url.to_string()
    } else {
        format!("https://{}", raw_url)
    };

    let mut parsed =
        Url::parse(&with_scheme).map_err(|e| format!("URL 格式非法 '{}': {}", raw_url, e))?;

    let active_queries: Vec<_> = endpoint
        .query_params
        .iter()
        .filter(|q| q.enabled && !q.key.trim().is_empty())
        .collect();

    if !active_queries.is_empty() {
        let mut pairs = parsed.query_pairs_mut();
        for q in active_queries {
            let k = render_template(q.key.trim(), ctx);
            let v = render_template(&q.value, ctx);
            pairs.append_pair(&k, &v);
        }
    }

    Ok(parsed)
}

fn classify_reqwest_error(err: &reqwest::Error) -> String {
    if err.is_timeout() {
        "请求超时 (ERR_TIMEOUT)".to_string()
    } else if err.is_connect() {
        "连接失败 (ERR_CONNECT)".to_string()
    } else if err.is_redirect() {
        "重定向超限 (ERR_REDIRECT)".to_string()
    } else {
        format!("网络错误: {}", err)
    }
}

pub fn truncate_chars(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let truncated: String = s.chars().take(max_chars).collect();
    format!("{}...(已截断)", truncated)
}
