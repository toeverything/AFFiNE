//! Test service harness for AFFiNE server tests.
//!
//! - [`pg`]: a dedicated PostgreSQL test cluster (explicit, marked
//!   `AFFINE_TEST_PG_URL` or a disposable `pgvector/pgvector:pg16` container),
//!   an idempotent read-only template database per migration digest, and
//!   millisecond `CREATE DATABASE ... TEMPLATE` clones guarded by heartbeat
//!   leases so the orphan reaper never touches a database in use.
//! - [`redis`]: an explicit `AFFINE_TEST_REDIS_URL` isolated by key prefix, or
//!   a disposable `redis:7-alpine` container on a random loopback port.
//! - [`report`]: the `run.json` report every test lane writes.

mod docker;
mod error;
pub mod migrations;
pub mod pg;
pub mod redis;
pub mod report;

use std::sync::OnceLock;

pub use docker::Container;
pub use error::{Error, Result};

/// Identifier shared by every database, key prefix and report created by this
/// process: lowercase alphanumerics only, safe inside SQL identifiers and
/// Redis keys.
pub fn process_run_id() -> &'static str {
  static RUN_ID: OnceLock<String> = OnceLock::new();
  RUN_ID.get_or_init(|| {
    let nanos = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_nanos())
      .unwrap_or_default();
    format!("{:x}{:06x}", std::process::id(), nanos & 0xff_ffff)
  })
}

/// Stable identifier of this machine for lease ownership.
pub fn host_id() -> String {
  std::env::var("HOSTNAME")
    .ok()
    .filter(|h| !h.trim().is_empty())
    .or_else(|| std::fs::read_to_string("/etc/hostname").ok())
    .or_else(|| {
      std::process::Command::new("hostname")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
    })
    .map(|h| h.trim().to_owned())
    .filter(|h| !h.is_empty())
    .unwrap_or_else(|| "unknown-host".to_owned())
}
