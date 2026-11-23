//! Background worker runtime primitives:
//! - `SessionRedis`-compatible distributed mutex (atomic Lua acquire/renew/fence/unlock with millisecond `PX` TTL)
//! - `v2:` private keyspace helper for shared logical DB isolation
//! - [`CancellationToken`] and [`WorkerSupervisor`] for graceful lease drain on shutdown.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::time::Duration;

use redis::{AsyncCommands, Script};
use tokio::sync::{Mutex, watch};
use tokio::task::JoinHandle;

/// Offset used by `v0.27.5` `SessionRedis` relative to the base Redis DB index.
pub const SESSION_REDIS_DB_OFFSET: u8 = 2;
/// Default lock TTL in seconds (matches `v0.27.5` `Locker`: 60s).
pub const DEFAULT_LOCK_TTL_SECS: u64 = 60;
/// Default timeout for a single Redis connect or command operation.
pub const REDIS_OP_TIMEOUT: Duration = Duration::from_secs(5);

const ACQUIRE_LOCK_MS_SCRIPT: &str = r#"
local cur = redis.call("get", KEYS[1])
if not cur then
  redis.call("set", KEYS[1], ARGV[1], "PX", tonumber(ARGV[2]))
  return 1
elseif cur == ARGV[1] then
  local pttl = redis.call("pttl", KEYS[1])
  if pttl > 0 then
    redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
  else
    redis.call("set", KEYS[1], ARGV[1], "PX", tonumber(ARGV[2]))
  end
  return 1
else
  return 0
end
"#;

const RENEW_LOCK_SCRIPT: &str = r#"
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("expire", KEYS[1], tonumber(ARGV[2]))
else
  return 0
end
"#;

const RENEW_LOCK_MS_SCRIPT: &str = r#"
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
else
  return 0
end
"#;

const FENCE_AND_RENEW_MS_SCRIPT: &str = r#"
if redis.call("get", KEYS[1]) == ARGV[1] and redis.call("pttl", KEYS[1]) > 0 then
  redis.call("pexpire", KEYS[1], tonumber(ARGV[2]))
  return 1
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
  #[error("redis operation timed out: {0}")]
  Timeout(String),
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

/// Helper for `V_new` private keys inside the shared Redis logical DB.
///
/// Every key is prefixed with `<optional_prefix>v2:` so `V_new` worker state
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
/// atomic Lua acquire/renew/fence/release scripts with millisecond `PX` TTLs,
/// cached multiplexed connections, and cancel-safe lease release.
#[derive(Clone)]
pub struct RedisMutex {
  client: redis::Client,
  conn: Arc<Mutex<Option<redis::aio::MultiplexedConnection>>>,
  key_prefix: String,
}

impl RedisMutex {
  pub fn new(redis_url: &str, key_prefix: impl Into<String>) -> Result<Self, WorkerError> {
    let client = redis::Client::open(redis_url)?;
    Ok(Self {
      client,
      conn: Arc::new(Mutex::new(None)),
      key_prefix: key_prefix.into(),
    })
  }

  pub fn lock_key(&self, resource: &str) -> String {
    format!("{}MutexLock:{resource}", self.key_prefix)
  }

  async fn get_connection(&self) -> Result<redis::aio::MultiplexedConnection, WorkerError> {
    {
      let guard = self.conn.lock().await;
      if let Some(existing) = guard.as_ref() {
        return Ok(existing.clone());
      }
    }
    let conn = tokio::time::timeout(REDIS_OP_TIMEOUT, self.client.get_multiplexed_async_connection())
      .await
      .map_err(|_| WorkerError::Timeout("connect multiplexed redis connection".to_owned()))??;
    let mut guard = self.conn.lock().await;
    if let Some(existing) = guard.as_ref() {
      return Ok(existing.clone());
    }
    *guard = Some(conn.clone());
    Ok(conn)
  }

  async fn invalidate_connection(&self) {
    let mut guard = self.conn.lock().await;
    *guard = None;
  }

  async fn exec_with_retry<T, F, Fut>(&self, op_name: &'static str, op: F) -> Result<T, WorkerError>
  where
    F: Fn(redis::aio::MultiplexedConnection) -> Fut,
    Fut: std::future::Future<Output = Result<T, redis::RedisError>>,
  {
    let conn = self.get_connection().await?;
    match tokio::time::timeout(REDIS_OP_TIMEOUT, op(conn)).await {
      Ok(Ok(val)) => return Ok(val),
      Ok(Err(_)) | Err(_) => {
        self.invalidate_connection().await;
      }
    }
    let conn = self.get_connection().await?;
    match tokio::time::timeout(REDIS_OP_TIMEOUT, op(conn)).await {
      Ok(Ok(val)) => Ok(val),
      Ok(Err(err)) => {
        self.invalidate_connection().await;
        Err(WorkerError::Redis(err))
      }
      Err(_) => {
        self.invalidate_connection().await;
        Err(WorkerError::Timeout(op_name.to_owned()))
      }
    }
  }

  /// Acquires `MutexLock:<resource>` for `owner_token` with `ttl_secs` expiration.
  ///
  /// Callers must pass a fresh unique `owner_token` per acquisition attempt
  /// (e.g. [`new_owner_token`]); reusing the same `owner_token` is intentionally
  /// idempotent so transport retries after a dropped reply recover cleanly.
  pub async fn try_acquire(
    &self,
    resource: &str,
    owner_token: impl Into<String>,
    ttl_secs: u64,
  ) -> Result<RedisLockLease, WorkerError> {
    self
      .try_acquire_ms(resource, owner_token, ttl_secs.max(1).saturating_mul(1_000))
      .await
  }

  /// Acquires `MutexLock:<resource>` for `owner_token` with `ttl_ms` millisecond expiration.
  ///
  /// Callers must pass a fresh unique `owner_token` per acquisition attempt
  /// (e.g. [`new_owner_token`]); reusing the same `owner_token` is intentionally
  /// idempotent so transport retries after a dropped reply recover cleanly.
  /// Cancel-safe: if the caller cancels this future before it returns, any lock
  /// acquired for this `owner_token` is released asynchronously without ever
  /// disturbing a lock held by another owner.
  pub async fn try_acquire_ms(
    &self,
    resource: &str,
    owner_token: impl Into<String>,
    ttl_ms: u64,
  ) -> Result<RedisLockLease, WorkerError> {
    const STATE_IN_FLIGHT: u8 = 0;
    const STATE_ACQUIRED_ON_SERVER: u8 = 1;
    const STATE_CANCELLED_BY_CALLER: u8 = 2;

    struct AcquireCancelGuard {
      state: Arc<AtomicU8>,
      mutex: RedisMutex,
      lock_key: String,
      owner_token: String,
      disarmed: bool,
    }

    impl Drop for AcquireCancelGuard {
      fn drop(&mut self) {
        if self.disarmed {
          return;
        }
        let prev = self.state.swap(STATE_CANCELLED_BY_CALLER, Ordering::AcqRel);
        if prev == STATE_ACQUIRED_ON_SERVER
          && let Ok(handle) = tokio::runtime::Handle::try_current()
        {
          let mutex = self.mutex.clone();
          let lock_key = std::mem::take(&mut self.lock_key);
          let owner_token = std::mem::take(&mut self.owner_token);
          handle.spawn(async move {
            let _ = mutex.release_raw_key(&lock_key, &owner_token).await;
          });
        }
      }
    }

    let owner_token = owner_token.into();
    let lock_key = self.lock_key(resource);
    let ttl_ms = ttl_ms.max(1);
    let state = Arc::new(AtomicU8::new(STATE_IN_FLIGHT));

    let mut guard = AcquireCancelGuard {
      state: Arc::clone(&state),
      mutex: self.clone(),
      lock_key: lock_key.clone(),
      owner_token: owner_token.clone(),
      disarmed: false,
    };

    let task_mutex = self.clone();
    let task_lock_key = lock_key.clone();
    let task_owner_token = owner_token.clone();
    let task_state = Arc::clone(&state);

    let join = tokio::spawn(async move {
      let res: Result<i32, WorkerError> = task_mutex
        .exec_with_retry("ACQUIRE_LOCK_MS", |mut conn| {
          let lock_key = task_lock_key.clone();
          let owner_token = task_owner_token.clone();
          async move {
            Script::new(ACQUIRE_LOCK_MS_SCRIPT)
              .key(&lock_key)
              .arg(&owner_token)
              .arg(ttl_ms)
              .invoke_async(&mut conn)
              .await
          }
        })
        .await;

      match res {
        Ok(1) => {
          if task_state
            .compare_exchange(
              STATE_IN_FLIGHT,
              STATE_ACQUIRED_ON_SERVER,
              Ordering::AcqRel,
              Ordering::Acquire,
            )
            .is_err()
          {
            let _ = task_mutex.release_raw_key(&task_lock_key, &task_owner_token).await;
          }
          Ok(1)
        }
        Ok(other) => Ok(other),
        Err(err) => {
          // Best-effort cleanup in case the first attempt succeeded on Redis
          // but its reply was lost and the retry also failed.
          let _ = task_mutex.release_raw_key(&task_lock_key, &task_owner_token).await;
          Err(err)
        }
      }
    });

    let acquired = match join.await {
      Ok(Ok(val)) => val,
      Ok(Err(err)) => {
        guard.disarmed = true;
        return Err(err);
      }
      Err(err) => {
        guard.disarmed = true;
        return Err(WorkerError::Timeout(format!("acquire task join failed: {err}")));
      }
    };

    guard.disarmed = true;
    if acquired == 1 {
      Ok(RedisLockLease {
        inner: Arc::new(RedisLockLeaseInner {
          mutex: self.clone(),
          lock_key,
          owner_token,
          released: AtomicBool::new(false),
        }),
      })
    } else {
      Err(WorkerError::AlreadyLocked(resource.to_owned()))
    }
  }

  /// Attempts to release a lock key using an explicit owner token (useful for
  /// testing foreign-owner rejection and manual cleanup).
  pub async fn release_with_token(&self, resource: &str, owner_token: &str) -> Result<bool, WorkerError> {
    let lock_key = self.lock_key(resource);
    self.release_raw_key(&lock_key, owner_token).await
  }

  async fn release_raw_key(&self, lock_key: &str, owner_token: &str) -> Result<bool, WorkerError> {
    let released: i32 = self
      .exec_with_retry("UNLOCK", |mut conn| {
        let lock_key = lock_key.to_owned();
        let owner_token = owner_token.to_owned();
        async move {
          Script::new(UNLOCK_SCRIPT)
            .key(&lock_key)
            .arg(&owner_token)
            .invoke_async(&mut conn)
            .await
        }
      })
      .await?;
    Ok(released == 1)
  }

  /// Attempts to extend a lock key using an explicit owner token.
  pub async fn renew_with_token(&self, resource: &str, owner_token: &str, ttl_secs: u64) -> Result<bool, WorkerError> {
    let lock_key = self.lock_key(resource);
    let ttl_secs = ttl_secs.max(1);
    let renewed: i32 = self
      .exec_with_retry("RENEW", |mut conn| {
        let lock_key = lock_key.clone();
        let owner_token = owner_token.to_owned();
        async move {
          Script::new(RENEW_LOCK_SCRIPT)
            .key(&lock_key)
            .arg(&owner_token)
            .arg(ttl_secs)
            .invoke_async(&mut conn)
            .await
        }
      })
      .await?;
    Ok(renewed == 1)
  }

  /// Reads the current owner token stored at `MutexLock:<resource>`, if any.
  pub async fn current_owner(&self, resource: &str) -> Result<Option<String>, WorkerError> {
    let lock_key = self.lock_key(resource);
    self
      .exec_with_retry("GET", |mut conn| {
        let lock_key = lock_key.clone();
        async move { conn.get(&lock_key).await }
      })
      .await
  }
}

struct RedisLockLeaseInner {
  mutex: RedisMutex,
  lock_key: String,
  owner_token: String,
  released: AtomicBool,
}

impl std::fmt::Debug for RedisLockLeaseInner {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("RedisLockLease")
      .field("lock_key", &self.lock_key)
      .field("owner_token", &self.owner_token)
      .field("released", &self.released.load(Ordering::Acquire))
      .finish()
  }
}

impl RedisLockLeaseInner {
  async fn unlock_now(&self) -> Result<(), WorkerError> {
    if self.mutex.release_raw_key(&self.lock_key, &self.owner_token).await? {
      Ok(())
    } else {
      Err(WorkerError::NotOwner(self.lock_key.clone()))
    }
  }
}

impl Drop for RedisLockLeaseInner {
  fn drop(&mut self) {
    if self.released.swap(true, Ordering::AcqRel) {
      return;
    }
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
      let mutex = self.mutex.clone();
      let lock_key = std::mem::take(&mut self.lock_key);
      let owner_token = std::mem::take(&mut self.owner_token);
      handle.spawn(async move {
        if let Err(err) = mutex.release_raw_key(&lock_key, &owner_token).await {
          tracing::warn!(lock_key, error = %err, "failed to release dropped Redis lock lease");
        }
      });
    }
  }
}

/// Active lease over a Redis distributed lock.
#[derive(Clone, Debug)]
pub struct RedisLockLease {
  inner: Arc<RedisLockLeaseInner>,
}

impl RedisLockLease {
  pub fn lock_key(&self) -> &str {
    &self.inner.lock_key
  }

  pub fn owner_token(&self) -> &str {
    &self.inner.owner_token
  }

  /// Atomically extends this lock's TTL in seconds only if still owned by `owner_token`.
  pub async fn renew(&self, ttl_secs: u64) -> Result<(), WorkerError> {
    self.renew_ms(ttl_secs.max(1).saturating_mul(1_000)).await
  }

  /// Atomically extends this lock's TTL in milliseconds only if still owned by `owner_token`.
  pub async fn renew_ms(&self, ttl_ms: u64) -> Result<(), WorkerError> {
    let ttl_ms = ttl_ms.max(1);
    let renewed: i32 = self
      .inner
      .mutex
      .exec_with_retry("RENEW_MS", |mut conn| {
        let lock_key = self.inner.lock_key.clone();
        let owner_token = self.inner.owner_token.clone();
        async move {
          Script::new(RENEW_LOCK_MS_SCRIPT)
            .key(&lock_key)
            .arg(&owner_token)
            .arg(ttl_ms)
            .invoke_async(&mut conn)
            .await
        }
      })
      .await?;
    if renewed == 1 {
      Ok(())
    } else {
      Err(WorkerError::NotOwner(self.inner.lock_key.clone()))
    }
  }

  /// Atomically verifies `GET key == owner_token` and `PTTL key > 0`, then
  /// extends the TTL to `ttl_ms` milliseconds. Returns `Err(NotOwner)` if the
  /// lease has expired or been claimed by another owner.
  pub async fn fence_and_renew_ms(&self, ttl_ms: u64) -> Result<(), WorkerError> {
    let ttl_ms = ttl_ms.max(1);
    let fenced: i32 = self
      .inner
      .mutex
      .exec_with_retry("FENCE_RENEW_MS", |mut conn| {
        let lock_key = self.inner.lock_key.clone();
        let owner_token = self.inner.owner_token.clone();
        async move {
          Script::new(FENCE_AND_RENEW_MS_SCRIPT)
            .key(&lock_key)
            .arg(&owner_token)
            .arg(ttl_ms)
            .invoke_async(&mut conn)
            .await
        }
      })
      .await?;
    if fenced == 1 {
      Ok(())
    } else {
      Err(WorkerError::NotOwner(self.inner.lock_key.clone()))
    }
  }

  /// Cancel-safely deletes this lock only if still owned by `owner_token`.
  ///
  /// Spawns the Lua unlock task onto the Tokio runtime before awaiting its
  /// `JoinHandle` so dropping/cancelling the outer future never aborts the
  /// unlock.
  pub async fn release(&self) -> Result<(), WorkerError> {
    let inner = Arc::clone(&self.inner);
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
      if inner.released.swap(true, Ordering::AcqRel) {
        return Ok(());
      }
      let join = handle.spawn(async move { inner.unlock_now().await });
      match join.await {
        Ok(res) => res,
        Err(err) => Err(WorkerError::Timeout(format!("unlock task join failed: {err}"))),
      }
    } else {
      if inner.released.swap(true, Ordering::AcqRel) {
        return Ok(());
      }
      inner.unlock_now().await
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
  /// Completion of the one drain every `drain` caller waits for; `Some` once
  /// a drain has started, carrying its released-lease count when it finishes.
  drain_done: Arc<Mutex<Option<watch::Receiver<Option<usize>>>>>,
}

impl WorkerSupervisor {
  pub fn new(shutdown: CancellationToken) -> Self {
    Self {
      shutdown,
      draining: Arc::new(AtomicBool::new(false)),
      active_leases: Arc::new(Mutex::new(Vec::new())),
      tasks: Arc::new(Mutex::new(Vec::new())),
      drain_done: Arc::new(Mutex::new(None)),
    }
  }

  pub fn shutdown_token(&self) -> CancellationToken {
    self.shutdown.clone()
  }

  fn is_closed(&self) -> bool {
    self.draining.load(Ordering::Acquire) || self.shutdown.is_cancelled()
  }

  /// Registers an active Redis lock lease so graceful shutdown releases it
  /// automatically. Once shutdown has been signalled or a drain has begun the
  /// lease is not tracked: it is released at once and `false` is returned.
  pub async fn track_lease(&self, lease: RedisLockLease) -> bool {
    {
      let mut guard = self.active_leases.lock().await;
      if !self.is_closed() {
        guard.push(lease);
        return true;
      }
    }
    if let Err(err) = lease.release().await {
      tracing::warn!(lock_key = lease.lock_key(), error = %err, "failed to release lease offered after shutdown");
    }
    false
  }

  /// Spawns a supervised background task that receives a clone of the supervisor's
  /// cancellation token. Rejects new tasks once shutdown has been signalled or
  /// [`WorkerSupervisor::drain`] has begun.
  pub async fn spawn<F, Fut>(&self, f: F)
  where
    F: FnOnce(CancellationToken) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
  {
    let mut guard = self.tasks.lock().await;
    if self.is_closed() {
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
  /// so no worker outlives its lock, and only then releases every tracked Redis
  /// lease. Returns the number of leases released.
  ///
  /// There is one drain per supervisor: it runs as its own task, so it
  /// completes even if a caller stops waiting, and every caller, concurrent or
  /// later, waits for that drain to finish and gets its count. The first
  /// caller's `drain_timeout` applies.
  pub async fn drain(&self, drain_timeout: Duration) -> usize {
    let mut done = {
      let mut slot = self.drain_done.lock().await;
      match slot.as_ref() {
        Some(done) => done.clone(),
        None => {
          self.draining.store(true, Ordering::Release);
          self.shutdown.cancel();
          let (tx, rx) = watch::channel(None);
          let this = self.clone();
          tokio::spawn(async move {
            let released = this.drain_once(drain_timeout).await;
            let _ = tx.send(Some(released));
          });
          *slot = Some(rx.clone());
          rx
        }
      }
    };
    match done.wait_for(Option::is_some).await {
      Ok(released) => released.unwrap_or_default(),
      Err(_) => {
        tracing::error!("worker drain task ended without reporting completion");
        0
      }
    }
  }

  async fn drain_once(&self, drain_timeout: Duration) -> usize {
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
