use crate::engine::client::{build_http_client, execute_single_endpoint, ClientBuildOptions};
use crate::engine::template::TemplateContext;
use crate::error::{AppError, AppResult};
use crate::models::endpoint::EndpointConfig;
use crate::models::task::{
    EndpointMetric, ParamInjectionMode, RequestLogEntry, TaskConfig, TaskMetrics, TaskSnapshot,
    TaskStatus, TimeSeriesPoint,
};
use chrono::Utc;
use parking_lot::{Mutex, RwLock};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, watch, Semaphore};

const MAX_RECENT_LOGS: usize = 300;
const MAX_RECENT_FAILURES: usize = 300;
const MAX_TIMELINE_POINTS: usize = 180;
const MAX_LATENCY_SAMPLES: usize = 200_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlSignal {
    Running,
    Paused,
    Cancelled,
}

/// Tracks active execution wall time, freezing when paused and resuming cleanly.
pub struct ActiveStopwatch {
    accumulated: Duration,
    running_since: Option<Instant>,
}

impl ActiveStopwatch {
    pub fn start_new() -> Self {
        Self {
            accumulated: Duration::ZERO,
            running_since: Some(Instant::now()),
        }
    }

    pub fn pause(&mut self) {
        if let Some(since) = self.running_since.take() {
            self.accumulated += since.elapsed();
        }
    }

    pub fn resume(&mut self) {
        if self.running_since.is_none() {
            self.running_since = Some(Instant::now());
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        let extra = self
            .running_since
            .map(|s| s.elapsed())
            .unwrap_or(Duration::ZERO);
        (self.accumulated + extra).as_millis() as u64
    }
}

pub type SnapshotCallback = Arc<dyn Fn(&TaskSnapshot) + Send + Sync>;

pub struct RunningTaskHandle {
    pub id: String,
    pub snapshot: Arc<RwLock<TaskSnapshot>>,
    control_tx: watch::Sender<ControlSignal>,
    stopwatch: Arc<Mutex<ActiveStopwatch>>,
    on_snapshot: SnapshotCallback,
}

impl RunningTaskHandle {
    pub fn pause(&self) -> AppResult<TaskSnapshot> {
        let current = *self.control_tx.borrow();
        if current != ControlSignal::Running {
            return Err(AppError::TaskState("仅运行中的任务可以暂停".to_string()));
        }
        self.stopwatch.lock().pause();
        let _ = self.control_tx.send(ControlSignal::Paused);

        let snap = {
            let mut guard = self.snapshot.write();
            guard.status = TaskStatus::Paused;
            guard.metrics.active_elapsed_ms = self.stopwatch.lock().elapsed_ms();
            guard.clone()
        };
        (self.on_snapshot)(&snap);
        Ok(snap)
    }

    pub fn resume(&self) -> AppResult<TaskSnapshot> {
        let current = *self.control_tx.borrow();
        if current != ControlSignal::Paused {
            return Err(AppError::TaskState("仅已暂停的任务可以恢复执行".to_string()));
        }
        self.stopwatch.lock().resume();
        let _ = self.control_tx.send(ControlSignal::Running);

        let snap = {
            let mut guard = self.snapshot.write();
            guard.status = TaskStatus::Running;
            guard.metrics.active_elapsed_ms = self.stopwatch.lock().elapsed_ms();
            guard.clone()
        };
        (self.on_snapshot)(&snap);
        Ok(snap)
    }

    pub fn cancel(&self) -> AppResult<TaskSnapshot> {
        self.stopwatch.lock().pause();
        let _ = self.control_tx.send(ControlSignal::Cancelled);

        let snap = {
            let mut guard = self.snapshot.write();
            if guard.status == TaskStatus::Running || guard.status == TaskStatus::Paused {
                guard.status = TaskStatus::Cancelled;
                guard.finished_at = Some(Utc::now().to_rfc3339());
            }
            guard.metrics.active_elapsed_ms = self.stopwatch.lock().elapsed_ms();
            guard.clone()
        };
        (self.on_snapshot)(&snap);
        Ok(snap)
    }
}

struct WorkerOutcomeEvent {
    endpoint_idx: usize,
    log: RequestLogEntry,
    bytes_received: usize,
    active_sec_bucket: u64,
}

struct EndpointStatsAcc {
    endpoint_id: String,
    endpoint_name: String,
    method: String,
    total: u64,
    succeeded: u64,
    failed: u64,
    latency_sum_ms: u128,
    min_latency_ms: u64,
    max_latency_ms: u64,
    latencies: Vec<u64>,
}

struct SecondBucketAcc {
    rps: u64,
    succeeded: u64,
    failed: u64,
    latency_sum_ms: u128,
}

/// Validates parameters, constructs HTTP client(s), spawns the Tokio concurrent dispatcher + aggregator,
/// and returns a `RunningTaskHandle`.
pub fn spawn_concurrent_task(
    task_id: String,
    config: TaskConfig,
    endpoints: Vec<EndpointConfig>,
    default_user_agent: String,
    global_proxy_url: String,
    on_snapshot: SnapshotCallback,
    on_finished: Arc<dyn Fn(TaskSnapshot) + Send + Sync>,
) -> AppResult<Arc<RunningTaskHandle>> {
    if endpoints.is_empty() {
        return Err(AppError::Validation("至少需要选择一个有效接口".to_string()));
    }
    if config.concurrency == 0 || config.concurrency > 512 {
        return Err(AppError::Validation(
            "并发数需在 1 ~ 512 之间".to_string(),
        ));
    }
    if config.iterations == 0 {
        return Err(AppError::Validation("执行轮次至少为 1".to_string()));
    }

    // Build effective parameter rows
    let param_rows: Vec<HashMap<String, String>> = match config.param_mode {
        ParamInjectionMode::Single => vec![config.single_params.clone()],
        ParamInjectionMode::Dataset => {
            if config.dataset_rows.is_empty() {
                vec![config.single_params.clone()]
            } else {
                config
                    .dataset_rows
                    .iter()
                    .map(|row| {
                        let mut merged = config.single_params.clone();
                        for (k, v) in row {
                            merged.insert(k.clone(), v.clone());
                        }
                        merged
                    })
                    .collect()
            }
        }
    };

    let total_planned = config
        .iterations
        .saturating_mul(param_rows.len() as u64)
        .saturating_mul(endpoints.len() as u64);

    if total_planned == 0 {
        return Err(AppError::Validation("计算得到的总请求数为 0".to_string()));
    }

    let effective_proxy = config
        .proxy_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            if global_proxy_url.trim().is_empty() {
                None
            } else {
                Some(global_proxy_url.as_str())
            }
        });

    // Build per-endpoint HTTP client (preserving per-endpoint SSL verify & redirect settings while sharing pools)
    let mut clients = Vec::with_capacity(endpoints.len());
    let mut endpoint_defaults = Vec::with_capacity(endpoints.len());
    for ep in &endpoints {
        let client = build_http_client(ClientBuildOptions {
            timeout_ms: ep.timeout_ms.unwrap_or(config.timeout_ms),
            follow_redirects: ep.follow_redirects,
            verify_ssl: ep.verify_ssl,
            pool_max_idle: config.concurrency.max(32),
            user_agent: &default_user_agent,
            proxy_url: effective_proxy,
        })?;
        clients.push(client);

        let defs: HashMap<String, String> = ep
            .variables
            .iter()
            .filter(|v| !v.key.trim().is_empty())
            .map(|v| (v.key.trim().to_string(), v.default_value.clone()))
            .collect();
        endpoint_defaults.push(defs);
    }

    let now_str = Utc::now().to_rfc3339();
    let initial_endpoint_metrics: Vec<EndpointMetric> = endpoints
        .iter()
        .map(|ep| EndpointMetric {
            endpoint_id: ep.id.clone(),
            endpoint_name: ep.name.clone(),
            method: ep.method.as_str().to_string(),
            total: 0,
            succeeded: 0,
            failed: 0,
            avg_latency_ms: 0.0,
            min_latency_ms: 0,
            max_latency_ms: 0,
            p95_latency_ms: 0,
        })
        .collect();

    let initial_snapshot = TaskSnapshot {
        id: task_id.clone(),
        config: config.clone(),
        status: TaskStatus::Running,
        created_at: now_str.clone(),
        started_at: now_str,
        finished_at: None,
        metrics: TaskMetrics {
            total_planned,
            endpoint_metrics: initial_endpoint_metrics,
            ..Default::default()
        },
        recent_logs: Vec::new(),
        recent_failures: Vec::new(),
    };

    let snapshot_lock = Arc::new(RwLock::new(initial_snapshot.clone()));
    let (control_tx, control_rx) = watch::channel(ControlSignal::Running);
    let stopwatch = Arc::new(Mutex::new(ActiveStopwatch::start_new()));
    let in_flight = Arc::new(AtomicU64::new(0));
    let failed_atomic = Arc::new(AtomicU64::new(0));
    let circuit_broken = Arc::new(AtomicBool::new(false));

    let handle = Arc::new(RunningTaskHandle {
        id: task_id.clone(),
        snapshot: snapshot_lock.clone(),
        control_tx: control_tx.clone(),
        stopwatch: stopwatch.clone(),
        on_snapshot: on_snapshot.clone(),
    });

    // Emit initial Running snapshot
    (on_snapshot)(&initial_snapshot);

    let (outcome_tx, mut outcome_rx) = mpsc::unbounded_channel::<WorkerOutcomeEvent>();

    // Spawn Dispatcher Task
    let disp_endpoints = Arc::new(endpoints);
    let agg_endpoints = disp_endpoints.clone();
    let disp_clients = Arc::new(clients);
    let disp_defaults = Arc::new(endpoint_defaults);
    let disp_rows = Arc::new(param_rows);
    let disp_config = config.clone();
    let disp_stopwatch = stopwatch.clone();
    let disp_in_flight = in_flight.clone();
    let disp_failed = failed_atomic.clone();
    let disp_circuit = circuit_broken.clone();
    let mut disp_ctrl_rx = control_rx.clone();

    tokio::spawn(async move {
        let semaphore = Arc::new(Semaphore::new(disp_config.concurrency));
        let mut rate_limiter = disp_config.max_rps.and_then(|rps| {
            if rps > 0 {
                let period_ns = (1_000_000_000u64 / (rps as u64)).max(1_000);
                let mut interval = tokio::time::interval(Duration::from_nanos(period_ns));
                interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Burst);
                Some(interval)
            } else {
                None
            }
        });

        let mut seq: u64 = 0;

        'outer: for _round in 0..disp_config.iterations {
            for row_idx in 0..disp_rows.len() {
                for ep_idx in 0..disp_endpoints.len() {
                    if let Some(max_fails) = disp_config.stop_on_fail_count {
                        if max_fails > 0 && disp_failed.load(Ordering::Relaxed) >= max_fails {
                            disp_circuit.store(true, Ordering::Relaxed);
                            break 'outer;
                        }
                    }

                    // Wait while paused, or exit if cancelled
                    if wait_until_runnable(&mut disp_ctrl_rx).await.is_err() {
                        break 'outer;
                    }

                    // Optional global RPS pacing
                    if let Some(limiter) = rate_limiter.as_mut() {
                        tokio::select! {
                            _ = limiter.tick() => {}
                            _ = wait_for_cancel(&mut disp_ctrl_rx) => {
                                break 'outer;
                            }
                        }
                    }

                    // Acquire concurrency slot (racing against cancel)
                    let permit = tokio::select! {
                        res = semaphore.clone().acquire_owned() => {
                            match res {
                                Ok(p) => p,
                                Err(_) => break 'outer,
                            }
                        }
                        _ = wait_for_cancel(&mut disp_ctrl_rx) => {
                            break 'outer;
                        }
                    };

                    // Re-verify pause/cancel right after acquiring semaphore slot
                    if wait_until_runnable(&mut disp_ctrl_rx).await.is_err() {
                        drop(permit);
                        break 'outer;
                    }

                    seq += 1;
                    let req_seq = seq;

                    let ep_arc = disp_endpoints.clone();
                    let clients_arc = disp_clients.clone();
                    let defs_arc = disp_defaults.clone();
                    let rows_arc = disp_rows.clone();
                    let tx = outcome_tx.clone();
                    let ua = default_user_agent.clone();
                    let sw = disp_stopwatch.clone();
                    let inflight_ctr = disp_in_flight.clone();
                    let fail_ctr = disp_failed.clone();
                    let retry_limit = disp_config.retry_count;
                    let interval_ms = disp_config.interval_ms;
                    let mut worker_ctrl_rx = disp_ctrl_rx.clone();

                    inflight_ctr.fetch_add(1, Ordering::Relaxed);

                    tokio::spawn(async move {
                        let _permit = permit;
                        let ep = &ep_arc[ep_idx];
                        let client = &clients_arc[ep_idx];
                        let defaults = &defs_arc[ep_idx];
                        let params = &rows_arc[row_idx];

                        let ctx = TemplateContext {
                            params,
                            defaults,
                            seq: req_seq,
                        };

                        let mut retries_used = 0u32;
                        let mut outcome =
                            execute_single_endpoint(client, ep, &ctx, &ua, 1024).await;

                        while !outcome.success && retries_used < retry_limit {
                            if *worker_ctrl_rx.borrow() == ControlSignal::Cancelled {
                                break;
                            }
                            if wait_until_runnable(&mut worker_ctrl_rx).await.is_err() {
                                break;
                            }
                            retries_used += 1;
                            outcome = execute_single_endpoint(client, ep, &ctx, &ua, 1024).await;
                        }

                        if !outcome.success {
                            fail_ctr.fetch_add(1, Ordering::Relaxed);
                        }

                        let active_sec_bucket = sw.lock().elapsed_ms() / 1000;
                        let log = RequestLogEntry {
                            seq: req_seq,
                            timestamp: Utc::now().format("%H:%M:%S%.3f").to_string(),
                            endpoint_id: ep.id.clone(),
                            endpoint_name: ep.name.clone(),
                            method: ep.method.as_str().to_string(),
                            resolved_url: outcome.resolved_url,
                            injected_params: params.clone(),
                            success: outcome.success,
                            status_code: outcome.status_code,
                            latency_ms: outcome.latency_ms,
                            retries_used,
                            failure_reason: outcome.failure_reason,
                            response_preview: outcome.response_body,
                        };

                        let _ = tx.send(WorkerOutcomeEvent {
                            endpoint_idx: ep_idx,
                            log,
                            bytes_received: outcome.bytes_received,
                            active_sec_bucket,
                        });

                        if interval_ms > 0 && *worker_ctrl_rx.borrow() != ControlSignal::Cancelled {
                            tokio::select! {
                                _ = tokio::time::sleep(Duration::from_millis(interval_ms)) => {}
                                _ = wait_for_cancel(&mut worker_ctrl_rx) => {}
                            }
                        }

                        inflight_ctr.fetch_sub(1, Ordering::Relaxed);
                    });
                }
            }
        }
        // Dropping outcome_tx signals aggregator once all spawned workers also drop their clones
        drop(outcome_tx);
    });

    // Spawn Telemetry Aggregator Task
    let agg_snapshot = snapshot_lock;
    let agg_stopwatch = stopwatch;
    let agg_in_flight = in_flight;
    let mut agg_ctrl_rx = control_rx;
    let agg_circuit = circuit_broken;

    tokio::spawn(async move {
        let mut ep_accs: Vec<EndpointStatsAcc> = agg_endpoints
            .iter()
            .map(|ep| EndpointStatsAcc {
                endpoint_id: ep.id.clone(),
                endpoint_name: ep.name.clone(),
                method: ep.method.as_str().to_string(),
                total: 0,
                succeeded: 0,
                failed: 0,
                latency_sum_ms: 0,
                min_latency_ms: u64::MAX,
                max_latency_ms: 0,
                latencies: Vec::new(),
            })
            .collect();

        let mut completed: u64 = 0;
        let mut succeeded: u64 = 0;
        let mut failed: u64 = 0;
        let mut retried: u64 = 0;
        let mut bytes_received: u64 = 0;
        let mut latency_sum_ms: u128 = 0;
        let mut min_latency_ms: u64 = u64::MAX;
        let mut max_latency_ms: u64 = 0;
        let mut all_latencies: Vec<u64> =
            Vec::with_capacity((total_planned as usize).min(MAX_LATENCY_SAMPLES));

        let mut status_codes: BTreeMap<String, u64> = BTreeMap::new();
        let mut failure_reasons: BTreeMap<String, u64> = BTreeMap::new();
        let mut sec_buckets: BTreeMap<u64, SecondBucketAcc> = BTreeMap::new();
        let mut peak_rps: u64 = 0;

        let mut recent_logs: VecDeque<RequestLogEntry> = VecDeque::with_capacity(MAX_RECENT_LOGS);
        let mut recent_failures: VecDeque<RequestLogEntry> =
            VecDeque::with_capacity(MAX_RECENT_FAILURES);

        let mut flush_tick = tokio::time::interval(Duration::from_millis(120));
        flush_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut dirty = false;

        loop {
            tokio::select! {
                maybe_ev = outcome_rx.recv() => {
                    match maybe_ev {
                        Some(ev) => {
                            dirty = true;
                            completed += 1;
                            retried += ev.log.retries_used as u64;
                            bytes_received += ev.bytes_received as u64;
                            let lat = ev.log.latency_ms;
                            latency_sum_ms += lat as u128;
                            min_latency_ms = min_latency_ms.min(lat);
                            max_latency_ms = max_latency_ms.max(lat);
                            if all_latencies.len() < MAX_LATENCY_SAMPLES {
                                all_latencies.push(lat);
                            } else {
                                let replace_idx = (completed as usize) % MAX_LATENCY_SAMPLES;
                                all_latencies[replace_idx] = lat;
                            }

                            let code_key = ev.log.status_code
                                .map(|c| c.to_string())
                                .unwrap_or_else(|| "ERR".to_string());
                            *status_codes.entry(code_key).or_insert(0) += 1;

                            if ev.log.success {
                                succeeded += 1;
                            } else {
                                failed += 1;
                                let reason_key = ev.log.failure_reason.clone().unwrap_or_else(|| "未知错误".to_string());
                                *failure_reasons.entry(reason_key).or_insert(0) += 1;
                                if recent_failures.len() >= MAX_RECENT_FAILURES {
                                    recent_failures.pop_back();
                                }
                                recent_failures.push_front(ev.log.clone());
                            }

                            if recent_logs.len() >= MAX_RECENT_LOGS {
                                recent_logs.pop_back();
                            }
                            recent_logs.push_front(ev.log);

                            // Per-endpoint stats
                            if let Some(ep_acc) = ep_accs.get_mut(ev.endpoint_idx) {
                                ep_acc.total += 1;
                                if succeeded + failed > 0 {
                                    // Check recent_logs front which we just pushed
                                    if recent_logs.front().map(|l| l.success).unwrap_or(false) {
                                        ep_acc.succeeded += 1;
                                    } else {
                                        ep_acc.failed += 1;
                                    }
                                }
                                ep_acc.latency_sum_ms += lat as u128;
                                ep_acc.min_latency_ms = ep_acc.min_latency_ms.min(lat);
                                ep_acc.max_latency_ms = ep_acc.max_latency_ms.max(lat);
                                if ep_acc.latencies.len() < 20_000 {
                                    ep_acc.latencies.push(lat);
                                }
                            }

                            // Per-second timeline bucket
                            let bucket = sec_buckets.entry(ev.active_sec_bucket).or_insert(SecondBucketAcc {
                                rps: 0,
                                succeeded: 0,
                                failed: 0,
                                latency_sum_ms: 0,
                            });
                            bucket.rps += 1;
                            if recent_logs.front().map(|l| l.success).unwrap_or(false) {
                                bucket.succeeded += 1;
                            } else {
                                bucket.failed += 1;
                            }
                            bucket.latency_sum_ms += lat as u128;
                            peak_rps = peak_rps.max(bucket.rps);

                            if *agg_ctrl_rx.borrow() == ControlSignal::Paused
                                && agg_in_flight.load(Ordering::Relaxed) == 0
                            {
                                dirty = false;
                                let snap = build_updated_snapshot(
                                    &agg_snapshot,
                                    None,
                                    false,
                                    total_planned,
                                    completed,
                                    succeeded,
                                    failed,
                                    retried,
                                    0,
                                    bytes_received,
                                    agg_stopwatch.lock().elapsed_ms(),
                                    peak_rps,
                                    min_latency_ms,
                                    max_latency_ms,
                                    latency_sum_ms,
                                    &all_latencies,
                                    &status_codes,
                                    &failure_reasons,
                                    &ep_accs,
                                    &sec_buckets,
                                    &recent_logs,
                                    &recent_failures,
                                );
                                (on_snapshot)(&snap);
                            }
                        }
                        None => {
                            // All workers finished! Perform final snapshot flush and break
                            agg_stopwatch.lock().pause();
                            let final_status = if *agg_ctrl_rx.borrow() == ControlSignal::Cancelled {
                                TaskStatus::Cancelled
                            } else if agg_circuit.load(Ordering::Relaxed) {
                                TaskStatus::Failed
                            } else {
                                TaskStatus::Completed
                            };

                            let final_snap = build_updated_snapshot(
                                &agg_snapshot,
                                Some(final_status),
                                true,
                                total_planned,
                                completed,
                                succeeded,
                                failed,
                                retried,
                                0,
                                bytes_received,
                                agg_stopwatch.lock().elapsed_ms(),
                                peak_rps,
                                min_latency_ms,
                                max_latency_ms,
                                latency_sum_ms,
                                &all_latencies,
                                &status_codes,
                                &failure_reasons,
                                &ep_accs,
                                &sec_buckets,
                                &recent_logs,
                                &recent_failures,
                            );
                            (on_snapshot)(&final_snap);
                            (on_finished)(final_snap);
                            break;
                        }
                    }
                }
                Ok(()) = agg_ctrl_rx.changed() => {
                    dirty = false;
                    let inflight_now = agg_in_flight.load(Ordering::Relaxed);
                    let snap = build_updated_snapshot(
                        &agg_snapshot,
                        None,
                        false,
                        total_planned,
                        completed,
                        succeeded,
                        failed,
                        retried,
                        inflight_now,
                        bytes_received,
                        agg_stopwatch.lock().elapsed_ms(),
                        peak_rps,
                        min_latency_ms,
                        max_latency_ms,
                        latency_sum_ms,
                        &all_latencies,
                        &status_codes,
                        &failure_reasons,
                        &ep_accs,
                        &sec_buckets,
                        &recent_logs,
                        &recent_failures,
                    );
                    (on_snapshot)(&snap);
                }
                _ = flush_tick.tick() => {
                    let inflight_now = agg_in_flight.load(Ordering::Relaxed);
                    if dirty || inflight_now > 0 {
                        dirty = false;
                        let snap = build_updated_snapshot(
                            &agg_snapshot,
                            None,
                            false,
                            total_planned,
                            completed,
                            succeeded,
                            failed,
                            retried,
                            inflight_now,
                            bytes_received,
                            agg_stopwatch.lock().elapsed_ms(),
                            peak_rps,
                            min_latency_ms,
                            max_latency_ms,
                            latency_sum_ms,
                            &all_latencies,
                            &status_codes,
                            &failure_reasons,
                            &ep_accs,
                            &sec_buckets,
                            &recent_logs,
                            &recent_failures,
                        );
                        (on_snapshot)(&snap);
                    }
                }
            }
        }
    });

    Ok(handle)
}

#[allow(clippy::too_many_arguments)]
fn build_updated_snapshot(
    snapshot_lock: &Arc<RwLock<TaskSnapshot>>,
    override_status: Option<TaskStatus>,
    is_finished: bool,
    total_planned: u64,
    completed: u64,
    succeeded: u64,
    failed: u64,
    retried: u64,
    in_flight: u64,
    bytes_received: u64,
    active_elapsed_ms: u64,
    peak_rps: u64,
    min_latency_ms: u64,
    max_latency_ms: u64,
    latency_sum_ms: u128,
    all_latencies: &[u64],
    status_codes: &BTreeMap<String, u64>,
    failure_reasons: &BTreeMap<String, u64>,
    ep_accs: &[EndpointStatsAcc],
    sec_buckets: &BTreeMap<u64, SecondBucketAcc>,
    recent_logs: &VecDeque<RequestLogEntry>,
    recent_failures: &VecDeque<RequestLogEntry>,
) -> TaskSnapshot {
    let avg_latency_ms = if completed > 0 {
        (latency_sum_ms as f64) / (completed as f64)
    } else {
        0.0
    };

    let (p50, p90, p95, p99) = compute_percentiles(all_latencies);

    let elapsed_secs = (active_elapsed_ms as f64) / 1000.0;
    let avg_rps = if elapsed_secs > 0.05 {
        (completed as f64) / elapsed_secs
    } else if completed > 0 {
        completed as f64
    } else {
        0.0
    };

    let current_sec = active_elapsed_ms / 1000;
    let current_rps = if is_finished {
        0.0
    } else {
        sec_buckets
            .get(&current_sec)
            .or_else(|| current_sec.checked_sub(1).and_then(|s| sec_buckets.get(&s)))
            .map(|b| b.rps as f64)
            .unwrap_or(0.0)
    };

    let endpoint_metrics: Vec<EndpointMetric> = ep_accs
        .iter()
        .map(|acc| {
            let avg = if acc.total > 0 {
                (acc.latency_sum_ms as f64) / (acc.total as f64)
            } else {
                0.0
            };
            let (_, _, ep_p95, _) = compute_percentiles(&acc.latencies);
            EndpointMetric {
                endpoint_id: acc.endpoint_id.clone(),
                endpoint_name: acc.endpoint_name.clone(),
                method: acc.method.clone(),
                total: acc.total,
                succeeded: acc.succeeded,
                failed: acc.failed,
                avg_latency_ms: (avg * 10.0).round() / 10.0,
                min_latency_ms: if acc.total > 0 { acc.min_latency_ms } else { 0 },
                max_latency_ms: acc.max_latency_ms,
                p95_latency_ms: ep_p95,
            }
        })
        .collect();

    let timeline: Vec<TimeSeriesPoint> = sec_buckets
        .iter()
        .rev()
        .take(MAX_TIMELINE_POINTS)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|(&sec, b)| TimeSeriesPoint {
            second_offset: sec,
            timestamp_label: format!("{}s", sec),
            rps: b.rps,
            succeeded: b.succeeded,
            failed: b.failed,
            avg_latency_ms: if b.rps > 0 {
                (((b.latency_sum_ms as f64) / (b.rps as f64)) * 10.0).round() / 10.0
            } else {
                0.0
            },
        })
        .collect();

    let mut guard = snapshot_lock.write();
    if let Some(st) = override_status {
        guard.status = st;
    }
    if is_finished && guard.finished_at.is_none() {
        guard.finished_at = Some(Utc::now().to_rfc3339());
    }

    guard.metrics = TaskMetrics {
        total_planned,
        completed,
        succeeded,
        failed,
        retried,
        in_flight,
        bytes_received,
        active_elapsed_ms,
        current_rps: (current_rps * 10.0).round() / 10.0,
        avg_rps: (avg_rps * 10.0).round() / 10.0,
        peak_rps,
        min_latency_ms: if completed > 0 { min_latency_ms } else { 0 },
        max_latency_ms,
        avg_latency_ms: (avg_latency_ms * 10.0).round() / 10.0,
        p50_latency_ms: p50,
        p90_latency_ms: p90,
        p95_latency_ms: p95,
        p99_latency_ms: p99,
        status_codes: status_codes.clone(),
        failure_reasons: failure_reasons.clone(),
        endpoint_metrics,
        timeline,
    };
    guard.recent_logs = recent_logs.iter().cloned().collect();
    guard.recent_failures = recent_failures.iter().cloned().collect();
    guard.clone()
}

fn compute_percentiles(samples: &[u64]) -> (u64, u64, u64, u64) {
    if samples.is_empty() {
        return (0, 0, 0, 0);
    }
    let mut sorted = samples.to_vec();
    sorted.sort_unstable();
    let pick = |p: f64| -> u64 {
        let idx = (((sorted.len() - 1) as f64) * p).round() as usize;
        sorted[idx.min(sorted.len() - 1)]
    };
    (pick(0.50), pick(0.90), pick(0.95), pick(0.99))
}

async fn wait_until_runnable(rx: &mut watch::Receiver<ControlSignal>) -> Result<(), ()> {
    loop {
        let state = *rx.borrow();
        match state {
            ControlSignal::Running => return Ok(()),
            ControlSignal::Cancelled => return Err(()),
            ControlSignal::Paused => {
                if rx.changed().await.is_err() {
                    return Err(());
                }
            }
        }
    }
}

async fn wait_for_cancel(rx: &mut watch::Receiver<ControlSignal>) {
    loop {
        if *rx.borrow() == ControlSignal::Cancelled {
            return;
        }
        if rx.changed().await.is_err() {
            return;
        }
    }
}
