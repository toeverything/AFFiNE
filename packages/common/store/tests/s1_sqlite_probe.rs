//! S1 SQLite 1,000-update single-transaction (`BEGIN IMMEDIATE`) throughput probe.

#![cfg(not(target_family = "wasm"))]

use std::path::PathBuf;
use std::time::Instant;

use affine_store::sqlite::SqliteDocStorage;
use affine_store::workspace_db::PendingDocUpdate;

fn percentile_ms(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn peak_rss_kib() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let status = std::fs::read_to_string("/proc/self/status").ok()?;
        for line in status.lines() {
            if let Some(rest) = line.strip_prefix("VmHWM:") {
                let kb = rest.split_whitespace().next()?.parse::<u64>().ok()?;
                return Some(kb);
            }
        }
        None
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

#[tokio::test]
async fn s1_sqlite_1k_batch_begin_immediate_probe() {
    let dir = std::env::temp_dir().join(format!("affine-s1-sqlite-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    let db_path: PathBuf = dir.join("s1-probe.db");
    let _ = std::fs::remove_file(&db_path);

    let storage = SqliteDocStorage::new(db_path.to_str().expect("utf-8 temp path"));
    storage.connect().await.expect("connect sqlite storage");

    let rounds = 20usize;
    let batch_size = 1_000usize;
    let mut samples_ms = Vec::with_capacity(rounds);

    for round in 0..rounds {
        let mut updates = Vec::with_capacity(batch_size);
        for i in 0..batch_size {
            updates.push(PendingDocUpdate {
                doc_id: format!("doc-{:02}", i % 16),
                update: vec![1, 1, (round as u8).wrapping_add(i as u8), (i & 0xff) as u8],
            });
        }
        let now_ms = 1_700_000_000_000_i64 + (round as i64) * 10_000;
        let t0 = Instant::now();
        let committed = storage
            .push_updates_batch(&updates, Some("cloud"), now_ms)
            .await
            .expect("push_updates_batch 1k updates");
        let elapsed_ms = t0.elapsed().as_secs_f64() * 1_000.0;
        assert_eq!(committed.len(), batch_size);
        samples_ms.push(elapsed_ms);
    }

    samples_ms.sort_by(|a, b| a.total_cmp(b));
    let p50 = percentile_ms(&samples_ms, 0.50);
    let p95 = percentile_ms(&samples_ms, 0.95);
    let p99 = percentile_ms(&samples_ms, 0.99);
    let rss_kib = peak_rss_kib().unwrap_or(0);

    println!(
        "S1 SQLite 1k batch (rounds={rounds}): p50={p50:.2}ms p95={p95:.2}ms p99={p99:.2}ms peak_rss_kib={rss_kib}"
    );

    if let Ok(out_dir) = std::env::var("AFFINE_S1_OUT_DIR")
        && !out_dir.is_empty()
    {
        let out_path = PathBuf::from(&out_dir);
        let _ = std::fs::create_dir_all(&out_path);
        let report = serde_json::json!({
            "probe": "sqlite_1k_batch_begin_immediate",
            "rounds": rounds,
            "batch_size": batch_size,
            "p50_ms": p50,
            "p95_ms": p95,
            "p99_ms": p99,
            "peak_rss_kib": rss_kib,
        });
        std::fs::write(
            out_path.join("s1-sqlite-report.json"),
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("write s1-sqlite-report.json");
    }

    let _ = std::fs::remove_dir_all(&dir);
}
