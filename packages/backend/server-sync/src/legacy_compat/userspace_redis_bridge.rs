// compat(coexist): sync-userspace-session-redis-lock -- cross-generation SessionRedis MutexLock:userspace:<uid>:<doc> lease and pre-commit fence
//! The `SessionRedis` lock that userspace document writes share with
//! `v0.27.5`: acquire with retries, renew while the write runs, and fence the
//! lease right before commit.

use server_worker::{RedisLockLease, RedisMutex, WorkerError, new_owner_token};

use super::{SyncError, SyncStorage};

pub(super) const USERSPACE_MUTEX_MAX_RETRIES: usize = 5;
pub(super) const USERSPACE_MUTEX_RETRY_WAIT_MS: u64 = 100;
pub(super) const USERSPACE_WRITE_DEADLINE_SECS: u64 = 30;

pub(super) struct AbortOnDrop(tokio::task::JoinHandle<()>);

impl Drop for AbortOnDrop {
  fn drop(&mut self) {
    self.0.abort();
  }
}

#[derive(Clone)]
pub(super) enum UserspaceRedisLockBackend {
  Disabled,
  Active(RedisMutex),
  InvalidConfig(String),
}

/// Renews `lease` every third of `ttl_ms` until the returned guard drops.
pub(super) fn spawn_lease_renewal(lease: RedisLockLease, ttl_ms: u64) -> AbortOnDrop {
  let interval = std::time::Duration::from_millis((ttl_ms / 3).max(20));
  AbortOnDrop(tokio::spawn(async move {
    loop {
      tokio::time::sleep(interval).await;
      if lease.renew_ms(ttl_ms).await.is_err() {
        break;
      }
    }
  }))
}

/// Fails when the userspace lease was lost, so the write rolls back instead of
/// committing without the lock.
pub(super) async fn fence_userspace_lease(lease: Option<&RedisLockLease>, ttl_ms: u64) -> Result<(), SyncError> {
  if let Some(lease) = lease
    && let Err(err) = lease.fence_and_renew_ms(ttl_ms).await
  {
    return Err(SyncError::Internal(format!(
      "userspace redis lock lost before commit: {err}"
    )));
  }
  Ok(())
}

impl SyncStorage {
  pub(super) async fn acquire_userspace_redis_lock(
    &self,
    user_id: &str,
    doc_id: &str,
  ) -> Result<Option<RedisLockLease>, SyncError> {
    let mutex = match &self.session_redis {
      UserspaceRedisLockBackend::Disabled => return Ok(None),
      UserspaceRedisLockBackend::InvalidConfig(err) => {
        return Err(SyncError::Internal(format!("invalid session redis config: {err}")));
      }
      UserspaceRedisLockBackend::Active(mutex) => mutex,
    };
    let resource = format!("userspace:{user_id}:{doc_id}");
    let owner = new_owner_token("v2-sync");
    let ttl_ms = self.userspace_lock_ttl_ms;

    for attempt in 0..=USERSPACE_MUTEX_MAX_RETRIES {
      match mutex.try_acquire_ms(&resource, owner.clone(), ttl_ms).await {
        Ok(lease) => return Ok(Some(lease)),
        Err(WorkerError::AlreadyLocked(_)) => {
          if attempt < USERSPACE_MUTEX_MAX_RETRIES {
            tokio::time::sleep(std::time::Duration::from_millis(USERSPACE_MUTEX_RETRY_WAIT_MS)).await;
          }
        }
        Err(err) => {
          return Err(SyncError::Internal(format!("acquire userspace redis lock: {err}")));
        }
      }
    }
    Err(SyncError::TooManyConcurrentWritings)
  }
}
