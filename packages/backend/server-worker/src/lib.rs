//! Background worker runtime primitives:
//! - `SessionRedis`-compatible distributed mutex (`SET NX EX` + atomic Lua renew/unlock)
//! - `v2:` private keyspace helper for shared logical DB isolation
//! - [`CancellationToken`] and [`WorkerSupervisor`] for graceful lease drain on shutdown.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use redis::{AsyncCommands, Script};
use tokio::sync::{Mutex, watch};
use tokio::task::JoinHandle;

/// Offset used by `v0.27.5` `SessionRedis` relative to the base Redis DB index.
pub const SESSION_REDIS_DB_OFFSET: u8 = 2;
/// Default lock TTL in seconds (matches `v0.27.5` `Locker`: 60s).
pub const DEFAULT_LOCK_TTL_SECS: u64 = 60;

const RENEW_LOCK_SCRIPT: &str = r#"
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("expire", KEYS[1], tonumber(ARGV[2]))
else
  return 0
end
"#;

const UNLOCK_SCRIPT: &str = r#"
local value = redis.call("get", KEYS[1])
if value == ARGV[1] then
  return redis.call("del", KEYS[1])
elseif not value then
  return 1
else
  return 0
end
"#;

#[derive(Debug, thiserror::Error)]
pub enum WorkerError {
  #[error("redis error: {0}")]
  Redis(#[from] redis::RedisError),
  #[error("invalid redis url: {0}")]
  InvalidRedisUrl(String),
  #[error("lock `{0}` is already held by another owner")]
  AlreadyLocked(String),
  #[error("lock `{0}` is not owned by this lease")]
  NotOwner(String),
}

/// Parses the logical DB index from a Redis URL (`redis://host:port/N` -> `N`, default `0`).
pub fn parse_redis_db_index(redis_url: &str) -> Result<u8, WorkerError> {
  let without_scheme = redis_url
    .split_once("://")
    .map(|(_, rest)| rest)
    .ok_or_else(|| WorkerError::InvalidRedisUrl(redis_url.to_owned()))?;
  let path = without_scheme
    .split_once('/')
    .map(|(_, p)| p.split('?').next().unwrap_or(""))
    .unwrap_or("");
  if path.is_empty() {
    return Ok(0);
  }
  path
    .parse::<u8>()
    .map_err(|_| WorkerError::InvalidRedisUrl(format!("invalid db index `{path}`")))
}

/// Computes the `SessionRedis` URL (`base_db + 2`), matching `v0.27.5` `SessionRedis`.
pub fn session_redis_url(base_redis_url: &str) -> Result<(String, u8), WorkerError> {
  let base_db = parse_redis_db_index(base_redis_url)?;
  let session_db = base_db
    .checked_add(SESSION_REDIS_DB_OFFSET)
    .filter(|&db| db <= 15)
    .ok_or_else(|| {
      WorkerError::InvalidRedisUrl(format!(
        "session db index out of range for base db {base_db} (must be <= 13)"
      ))
    })?;

  let (scheme, rest) = base_redis_url
    .split_once("://")
    .ok_or_else(|| WorkerError::InvalidRedisUrl(base_redis_url.to_owned()))?;
  let (authority_and_path, query) = match rest.split_once('?') {
    Some((a, q)) => (a, Some(q)),
    None => (rest, None),
  };
  let authority = authority_and_path
    .split_once('/')
    .map(|(a, _)| a)
    .unwrap_or(authority_and_path);

  let mut out = format!("{scheme}://{authority}/{session_db}");
  if let Some(q) = query {
    out.push('?');
    out.push_str(q);
  }
  Ok((out, session_db))
}

/// Helper for private worker keys inside the shared Redis logical DB.
///
/// Every key is prefixed with `<optional_prefix>v2:` so worker state
/// never collides with `v0.27.5` keys.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct V2Keyspace {
  prefix: String,
}

impl V2Keyspace {
  pub fn new(prefix: impl Into<String>) -> Self {
    Self { prefix: prefix.into() }
  }

  pub fn key(&self, segments: &[&str]) -> String {
    let mut out = String::with_capacity(self.prefix.len() + 16);
    out.push_str(&self.prefix);
    out.push_str("v2:");
    for (idx, seg) in segments.iter().enumerate() {
      if idx > 0 {
        out.push(':');
      }
      out.push_str(seg);
    }
    out
  }
}

/// Distributed Redis mutex compatible with `v0.27.5` `SessionRedis` `Locker`.
///
/// Uses `MutexLock:<resource>` keys (optionally prefixed in test environments),
/// `SET <key> <owner_token> NX EX <ttl>` for acquisition, and atomic Lua scripts
/// verifying `owner_token` for renewal and release.
#[derive(Clone)]
pub struct RedisMutex {
  client: redis::Client,
  key_prefix: String,
}

impl RedisMutex {
  pub fn new(redis_url: &str, key_prefix: impl Into<String>) -> Result<Self, WorkerError> {
    let client = redis::Client::open(redis_url)?;
    Ok(Self {
      client,
      key_prefix: key_prefix.into(),
    })
  }

  pub fn lock_key(&self, resource: &str) -> String {
    format!("{}MutexLock:{resource}", self.key_prefix)
  }

  /// Acquires `MutexLock:<resource>` for `owner_token` with `ttl_secs` expiration.
  pub async fn try_acquire(
    &self,
    resource: &str,
    owner_token: impl Into<String>,
    ttl_secs: u64,
  ) -> Result<RedisLockLease, WorkerError> {
    let owner_token = owner_token.into();
    let lock_key = self.lock_key(resource);
    let mut conn = self.client.get_multiplexed_async_connection().await?;
    let acquired: Option<String> = redis::cmd("SET")
      .arg(&lock_key)
      .arg(&owner_token)
      .arg("NX")
      .arg("EX")
      .arg(ttl_secs.max(1))
      .query_async(&mut conn)
      .await?;

    if acquired.is_some() {
      Ok(RedisLockLease {
        client: self.client.clone(),
        lock_key,
        owner_token,
      })
    } else {
      Err(WorkerError::AlreadyLocked(resource.to_owned()))
    }
  }

  /// Attempts to release a lock key using an explicit owner token (useful for
  /// testing foreign-owner rejection and manual cleanup).
  pub async fn release_with_token(&self, resource: &str, owner_token: &str) -> Result<bool, WorkerError> {
    let lock_key = self.lock_key(resource);
    let mut conn = self.client.get_multiplexed_async_connection().await?;
    let released: i32 = Script::new(UNLOCK_SCRIPT)
      .key(&lock_key)
      .arg(owner_token)
      .invoke_async(&mut conn)
      .await?;
    Ok(released == 1)
  }

  /// Attempts to extend a lock key using an explicit owner token.
  pub async fn renew_with_token(&self, resource: &str, owner_token: &str, ttl_secs: u64) -> Result<bool, WorkerError> {
    let lock_key = self.lock_key(resource);
    let mut conn = self.client.get_multiplexed_async_connection().await?;
    let renewed: i32 = Script::new(RENEW_LOCK_SCRIPT)
      .key(&lock_key)
      .arg(owner_token)
      .arg(ttl_secs.max(1))
      .invoke_async(&mut conn)
      .await?;
    Ok(renewed == 1)
  }

  /// Reads the current owner token stored at `MutexLock:<resource>`, if any.
  pub async fn current_owner(&self, resource: &str) -> Result<Option<String>, WorkerError> {
    let lock_key = self.lock_key(resource);
    let mut conn = self.client.get_multiplexed_async_connection().await?;
    let val: Option<String> = conn.get(&lock_key).await?;
    Ok(val)
  }
}

/// Active lease over a Redis distributed lock.
#[derive(Clone, Debug)]
pub struct RedisLockLease {
  client: redis::Client,
  lock_key: String,
  owner_token: String,
}

impl RedisLockLease {
  pub fn lock_key(&self) -> &str {
    &self.lock_key
  }

  pub fn owner_token(&self) -> &str {
    &self.owner_token
  }

  /// Atomically extends this lock's TTL only if still owned by `owner_token`.
  pub async fn renew(&self, ttl_secs: u64) -> Result<(), WorkerError> {
    let mut conn = self.client.get_multiplexed_async_connection().await?;
    let renewed: i32 = Script::new(RENEW_LOCK_SCRIPT)
      .key(&self.lock_key)
      .arg(&self.owner_token)
      .arg(ttl_secs.max(1))
      .invoke_async(&mut conn)
      .await?;
    if renewed == 1 {
      Ok(())
    } else {
      Err(WorkerError::NotOwner(self.lock_key.clone()))
    }
  }

  /// Atomically deletes this lock only if still owned by `owner_token`.
  pub async fn release(&self) -> Result<(), WorkerError> {
    let mut conn = self.client.get_multiplexed_async_connection().await?;
    let released: i32 = Script::new(UNLOCK_SCRIPT)
      .key(&self.lock_key)
      .arg(&self.owner_token)
      .invoke_async(&mut conn)
      .await?;
    if released == 1 {
      Ok(())
    } else {
      Err(WorkerError::NotOwner(self.lock_key.clone()))
    }
  }
}

/// Lightweight, cloneable cooperative cancellation token backed by `tokio::sync::watch`.
#[derive(Clone, Debug)]
pub struct CancellationToken {
  tx: Arc<watch::Sender<bool>>,
  rx: watch::Receiver<bool>,
}

impl Default for CancellationToken {
  fn default() -> Self {
    Self::new()
  }
}

impl CancellationToken {
  pub fn new() -> Self {
    let (tx, rx) = watch::channel(false);
    Self { tx: Arc::new(tx), rx }
  }

  pub fn cancel(&self) {
    let _ = self.tx.send(true);
  }

  pub fn is_cancelled(&self) -> bool {
    *self.rx.borrow()
  }

  pub async fn cancelled(&self) {
    let mut rx = self.rx.clone();
    if *rx.borrow() {
      return;
    }
    let _ = rx.wait_for(|v| *v).await;
  }
}

/// Supervises background worker tasks and active Redis lock leases, ensuring
/// every task has fully terminated before any tracked Redis lease is released.
#[derive(Clone)]
pub struct WorkerSupervisor {
  shutdown: CancellationToken,
  draining: Arc<AtomicBool>,
  active_leases: Arc<Mutex<Vec<RedisLockLease>>>,
  tasks: Arc<Mutex<Vec<JoinHandle<()>>>>,
}

impl WorkerSupervisor {
  pub fn new(shutdown: CancellationToken) -> Self {
    Self {
      shutdown,
      draining: Arc::new(AtomicBool::new(false)),
      active_leases: Arc::new(Mutex::new(Vec::new())),
      tasks: Arc::new(Mutex::new(Vec::new())),
    }
  }

  pub fn shutdown_token(&self) -> CancellationToken {
    self.shutdown.clone()
  }

  /// Registers an active Redis lock lease so graceful shutdown releases it automatically.
  pub async fn track_lease(&self, lease: RedisLockLease) {
    self.active_leases.lock().await.push(lease);
  }

  /// Spawns a supervised background task that receives a clone of the supervisor's
  /// cancellation token. Rejects new tasks once [`WorkerSupervisor::drain`] has begun.
  pub async fn spawn<F, Fut>(&self, f: F)
  where
    F: FnOnce(CancellationToken) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
  {
    let mut guard = self.tasks.lock().await;
    if self.draining.load(Ordering::Acquire) || self.shutdown.is_cancelled() {
      return;
    }
    let token = self.shutdown.clone();
    let handle = tokio::spawn(async move {
      f(token).await;
    });
    guard.push(handle);
  }

  /// Marks the supervisor as draining, cancels all supervised workers, awaits
  /// them up to `drain_timeout`, explicitly aborts and awaits any stubborn tasks
  /// so no worker outlives its lock, and only then releases every tracked Redis lease.
  pub async fn drain(&self, drain_timeout: Duration) -> usize {
    self.draining.store(true, Ordering::Release);
    self.shutdown.cancel();

    let handles = {
      let mut guard = self.tasks.lock().await;
      std::mem::take(&mut *guard)
    };

    let deadline = tokio::time::Instant::now() + drain_timeout;
    for mut handle in handles {
      let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
      if tokio::time::timeout(remaining, &mut handle).await.is_err() {
        handle.abort();
        let _ = handle.await;
      }
    }

    let leases = {
      let mut guard = self.active_leases.lock().await;
      std::mem::take(&mut *guard)
    };
    let mut released_count = 0usize;
    for lease in leases {
      match lease.release().await {
        Ok(()) => released_count += 1,
        Err(err) => {
          tracing::warn!(lock_key = lease.lock_key(), error = %err, "failed to release tracked lease during drain");
        }
      }
    }
    released_count
  }
}

/// Generates a unique owner token suitable for [`RedisMutex::try_acquire`].
pub fn new_owner_token(node_label: &str) -> String {
  format!("{node_label}:{}", uuid::Uuid::new_v4())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn session_redis_url_adds_db_offset() {
    assert_eq!(
      session_redis_url("redis://127.0.0.1:6379").unwrap(),
      ("redis://127.0.0.1:6379/2".to_owned(), 2)
    );
    assert_eq!(
      session_redis_url("redis://127.0.0.1:6379/1?foo=bar").unwrap(),
      ("redis://127.0.0.1:6379/3?foo=bar".to_owned(), 3)
    );
    assert!(session_redis_url("redis://127.0.0.1:6379/14").is_err());
  }

  #[test]
  fn v2_keyspace_formats_prefixed_keys() {
    let prod = V2Keyspace::default();
    assert_eq!(prod.key(&["worker", "checkpoint", "ws-1"]), "v2:worker:checkpoint:ws-1");

    let test_ks = V2Keyspace::new("test:run1:");
    assert_eq!(test_ks.key(&["lease", "job-9"]), "test:run1:v2:lease:job-9");
  }
}
