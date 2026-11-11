use crate::models::endpoint::AssertionConfig;
use serde_json::Value;

/// Evaluates whether an HTTP response satisfies the endpoint's `AssertionConfig`.
/// Returns `Ok(())` when all configured rules pass, or `Err(reason)` describing the first failure.
pub fn evaluate_assertions(
    config: &AssertionConfig,
    status_code: u16,
    body: &str,
    latency_ms: u64,
) -> Result<(), String> {
    // 1. Check HTTP status code rule
    let status_expr = config.status_codes.trim();
    let effective_expr = if status_expr.is_empty() {
        "200-299"
    } else {
        status_expr
    };

    if !matches_status_expression(status_code, effective_expr) {
        return Err(format!("HTTP {} (期望 {})", status_code, effective_expr));
    }

    // 2. Check max latency SLA if set
    if let Some(max_ms) = config.max_latency_ms {
        if max_ms > 0 && latency_ms > max_ms {
            return Err(format!("响应耗时超限: {}ms > {}ms", latency_ms, max_ms));
        }
    }

    // 3. Check body_contains
    if !config.body_contains.trim().is_empty() && !body.contains(config.body_contains.trim()) {
        return Err(format!("响应未包含: \"{}\"", config.body_contains.trim()));
    }

    // 4. Check body_not_contains
    if !config.body_not_contains.trim().is_empty() && body.contains(config.body_not_contains.trim())
    {
        return Err(format!(
            "响应命中异常关键字: \"{}\"",
            config.body_not_contains.trim()
        ));
    }

    // 5. Check JSON field assertions
    let active_json_rules: Vec<_> = config
        .json_assertions
        .iter()
        .filter(|r| !r.path.trim().is_empty())
        .collect();

    if !active_json_rules.is_empty() {
        let parsed: Value = serde_json::from_str(body)
            .map_err(|_| "响应体非合法 JSON，无法执行字段断言".to_string())?;

        for rule in active_json_rules {
            let path = rule.path.trim();
            match lookup_json_path(&parsed, path) {
                None => {
                    return Err(format!("JSON 字段缺失: {}", path));
                }
                Some(val) => {
                    let actual_str = json_scalar_to_string(val);
                    if actual_str != rule.expected.trim() {
                        return Err(format!(
                            "JSON 断言失败: {}={} (期望 {})",
                            path,
                            actual_str,
                            rule.expected.trim()
                        ));
                    }
                }
            }
        }
    }

    Ok(())
}

fn matches_status_expression(code: u16, expr: &str) -> bool {
    for part in expr.split(',') {
        let token = part.trim();
        if token.is_empty() {
            continue;
        }
        if let Some((lo_s, hi_s)) = token.split_once('-') {
            if let (Ok(lo), Ok(hi)) = (lo_s.trim().parse::<u16>(), hi_s.trim().parse::<u16>()) {
                if code >= lo && code <= hi {
                    return true;
                }
            }
        } else if let Ok(exact) = token.parse::<u16>() {
            if code == exact {
                return true;
            }
        }
    }
    false
}

fn lookup_json_path<'a>(root: &'a Value, dot_path: &str) -> Option<&'a Value> {
    let mut current = root;
    for seg in dot_path.split('.') {
        let seg = seg.trim();
        if seg.is_empty() {
            continue;
        }
        match current {
            Value::Object(map) => {
                current = map.get(seg)?;
            }
            Value::Array(arr) => {
                let idx = seg.parse::<usize>().ok()?;
                current = arr.get(idx)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

fn json_scalar_to_string(v: &Value) -> String {
    match v {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::endpoint::JsonFieldAssertion;

    #[test]
    fn test_status_and_json_assertions() {
        let cfg = AssertionConfig {
            status_codes: "200,201".to_string(),
            body_contains: "".to_string(),
            body_not_contains: "fatal".to_string(),
            json_assertions: vec![
                JsonFieldAssertion {
                    path: "code".to_string(),
                    expected: "0".to_string(),
                },
                JsonFieldAssertion {
                    path: "data.accepted".to_string(),
                    expected: "true".to_string(),
                },
            ],
            max_latency_ms: Some(1500),
        };

        let ok_body = r#"{"code": 0, "data": {"accepted": true}}"#;
        assert!(evaluate_assertions(&cfg, 200, ok_body, 120).is_ok());

        let bad_code_body = r#"{"code": 1001, "data": {"accepted": true}}"#;
        let err = evaluate_assertions(&cfg, 200, bad_code_body, 120).unwrap_err();
        assert!(err.contains("code=1001"));

        let err_status = evaluate_assertions(&cfg, 500, ok_body, 120).unwrap_err();
        assert!(err_status.contains("HTTP 500"));
    }
}
