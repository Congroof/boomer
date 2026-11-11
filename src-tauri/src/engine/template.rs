use chrono::Utc;
use rand::{distributions::Alphanumeric, Rng};
use std::collections::HashMap;
use uuid::Uuid;

/// Context passed when interpolating `{{...}}` placeholders for a single HTTP request.
pub struct TemplateContext<'a> {
    pub params: &'a HashMap<String, String>,
    pub defaults: &'a HashMap<String, String>,
    pub seq: u64,
}

/// Interpolates `{{key}}` and built-in `{{$...}}` tokens inside `input`.
/// Single-pass scanner with zero regex allocation for high concurrency throughput.
pub fn render_template(input: &str, ctx: &TemplateContext<'_>) -> String {
    if !input.contains("{{") {
        return input.to_string();
    }

    let mut out = String::with_capacity(input.len() + 32);
    let mut rest = input;

    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after_open = &rest[start + 2..];
        if let Some(end) = after_open.find("}}") {
            let raw_token = after_open[..end].trim();
            if raw_token.is_empty() {
                out.push_str("{{}}");
            } else if let Some(builtin) = raw_token.strip_prefix('$') {
                out.push_str(&eval_builtin(builtin, ctx.seq));
            } else if let Some(val) = ctx.params.get(raw_token) {
                out.push_str(val);
            } else if let Some(def) = ctx.defaults.get(raw_token) {
                out.push_str(def);
            } else {
                // Keep unresolved placeholder visible if neither injected nor defaulted
                out.push_str("{{");
                out.push_str(raw_token);
                out.push_str("}}");
            }
            rest = &after_open[end + 2..];
        } else {
            // Unclosed `{{`
            out.push_str(&rest[start..]);
            rest = "";
            break;
        }
    }

    out.push_str(rest);
    out
}

fn eval_builtin(expr: &str, seq: u64) -> String {
    let parts: Vec<&str> = expr.split(':').collect();
    match parts[0] {
        "uuid" => Uuid::new_v4().to_string(),
        "timestamp" => Utc::now().timestamp().to_string(),
        "timestamp_ms" => Utc::now().timestamp_millis().to_string(),
        "seq" => seq.to_string(),
        "random_int" => {
            let (min, max) = if parts.len() >= 3 {
                let lo = parts[1].parse::<i64>().unwrap_or(100_000);
                let hi = parts[2].parse::<i64>().unwrap_or(999_999);
                if lo <= hi {
                    (lo, hi)
                } else {
                    (hi, lo)
                }
            } else {
                (100_000, 999_999)
            };
            rand::thread_rng().gen_range(min..=max).to_string()
        }
        "random_str" => {
            let len = parts
                .get(1)
                .and_then(|s| s.parse::<usize>().ok())
                .unwrap_or(8)
                .clamp(1, 128);
            rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(len)
                .map(char::from)
                .collect()
        }
        "random_phone" => {
            let prefixes = ["138", "139", "136", "158", "186", "188", "199"];
            let mut rng = rand::thread_rng();
            let prefix = prefixes[rng.gen_range(0..prefixes.len())];
            let suffix: u32 = rng.gen_range(10_000_000..=99_999_999);
            format!("{}{}", prefix, suffix)
        }
        other => format!("{{${}}}", other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_custom_and_default_vars() {
        let mut params = HashMap::new();
        params.insert("phone".to_string(), "13800138000".to_string());

        let mut defaults = HashMap::new();
        defaults.insert("channel".to_string(), "web".to_string());
        defaults.insert("phone".to_string(), "00000000000".to_string());

        let ctx = TemplateContext {
            params: &params,
            defaults: &defaults,
            seq: 42,
        };

        let tpl = "https://api.example.com/send?phone={{ phone }}&ch={{channel}}&seq={{$seq}}";
        let rendered = render_template(tpl, &ctx);
        assert_eq!(
            rendered,
            "https://api.example.com/send?phone=13800138000&ch=web&seq=42"
        );
    }

    #[test]
    fn test_render_builtins() {
        let params = HashMap::new();
        let defaults = HashMap::new();
        let ctx = TemplateContext {
            params: &params,
            defaults: &defaults,
            seq: 1,
        };

        let uid = render_template("{{$uuid}}", &ctx);
        assert_eq!(uid.len(), 36);

        let rstr = render_template("{{$random_str:12}}", &ctx);
        assert_eq!(rstr.len(), 12);

        let rint = render_template("{{$random_int:10:20}}", &ctx)
            .parse::<i64>()
            .unwrap();
        assert!((10..=20).contains(&rint));
    }
}
