use rand::Rng;
use serde_json::json;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// Starts a lightweight local Tokio HTTP server on `127.0.0.1:0` (ephemeral free port)
/// for instant offline testing, benchmarking, and automated integration tests.
pub async fn start_local_mock_server() -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr: SocketAddr = listener.local_addr()?;
    let port = addr.port();

    tokio::spawn(async move {
        loop {
            if let Ok((stream, _)) = listener.accept().await {
                tokio::spawn(handle_connection(stream));
            }
        }
    });

    Ok(port)
}

/// Synchronous port bind + async accept loop on Tauri's global Tokio runtime.
pub fn spawn_mock_server_on_tauri_runtime() -> std::io::Result<u16> {
    let std_listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    std_listener.set_nonblocking(true)?;
    let port = std_listener.local_addr()?.port();

    tauri::async_runtime::spawn(async move {
        if let Ok(listener) = TcpListener::from_std(std_listener) {
            loop {
                if let Ok((stream, _)) = listener.accept().await {
                    tauri::async_runtime::spawn(handle_connection(stream));
                }
            }
        }
    });

    Ok(port)
}

async fn handle_connection(mut stream: TcpStream) {
    let mut data = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];

    loop {
        let n = match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        data.extend_from_slice(&chunk[..n]);

        if let Some(header_end) = find_subsequence(&data, b"\r\n\r\n") {
            let head_str = String::from_utf8_lossy(&data[..header_end]);
            let expected_body_len = head_str
                .lines()
                .find_map(|line| {
                    let (k, v) = line.split_once(':')?;
                    if k.trim().eq_ignore_ascii_case("content-length") {
                        v.trim().parse::<usize>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(0);

            if data.len() >= header_end + 4 + expected_body_len || data.len() > 64 * 1024 {
                break;
            }
        } else if data.len() > 64 * 1024 {
            break;
        }
    }

    if data.is_empty() {
        return;
    }

    let raw_req = String::from_utf8_lossy(&data);
    let (head, body_part) = match raw_req.split_once("\r\n\r\n") {
        Some((h, b)) => (h, b),
        None => (raw_req.as_ref(), ""),
    };

    let first_line = head.lines().next().unwrap_or("GET / HTTP/1.1");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let full_target = parts.next().unwrap_or("/");
    let (path, query) = full_target.split_once('?').unwrap_or((full_target, ""));

    // Parse optional query params like `delay_ms=50` or `fail_rate=20`
    let mut delay_ms: u64 = 0;
    let mut fail_rate: u32 = 0;
    let mut query_map = serde_json::Map::new();
    for pair in query.split('&').filter(|s| !s.is_empty()) {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        if k == "delay_ms" {
            delay_ms = v.parse::<u64>().unwrap_or(0).min(5_000);
        } else if k == "fail_rate" {
            fail_rate = v.parse::<u32>().unwrap_or(0).min(100);
        }
        query_map.insert(k.to_string(), json!(url_decode_simple(v)));
    }

    if path.starts_with("/mock/delay") && delay_ms == 0 {
        delay_ms = 65;
    }
    if path.starts_with("/mock/flaky") && fail_rate == 0 {
        fail_rate = 20;
    }

    if delay_ms > 0 {
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
    }

    let should_fail = if fail_rate > 0 {
        rand::thread_rng().gen_range(0..100) < fail_rate
    } else {
        path.starts_with("/mock/error")
    };

    let (status_line, payload) = if should_fail {
        let err_json = json!({
            "code": 5003,
            "success": false,
            "message": "模拟上游限流或临时异常 (Simulated upstream failure)",
            "path": path,
        });
        ("HTTP/1.1 503 Service Unavailable", err_json.to_string())
    } else {
        let parsed_body = serde_json::from_str::<serde_json::Value>(body_part.trim())
            .unwrap_or_else(|_| json!(body_part.trim()));

        let ok_json = json!({
            "code": 0,
            "success": true,
            "message": "ok",
            "echo": {
                "method": method,
                "path": path,
                "query": query_map,
                "body": parsed_body,
            }
        });
        ("HTTP/1.1 200 OK", ok_json.to_string())
    };

    let response = format!(
        "{status_line}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: keep-alive\r\n\r\n{}",
        payload.len(),
        payload
    );

    let _ = stream.write_all(response.as_bytes()).await;
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn url_decode_simple(input: &str) -> String {
    let mut out = Vec::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
        } else if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push(((hi << 4) | lo) as u8);
                i += 3;
                continue;
            }
            out.push(bytes[i]);
            i += 1;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
