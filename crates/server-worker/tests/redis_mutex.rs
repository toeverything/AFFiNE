//! Real Redis integration tests for `RedisMutex`, Lua owner-token safety,
//! and `WorkerSupervisor` graceful lease drain.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use server_worker::{
  CancellationToken, DEFAULT_LOCK_TTL_SECS, RedisMutex, WorkerError, WorkerSupervisor, new_owner_token,
  session_redis_url,
};
use test_db_harness::redis::TestRedis;

#[tokio::test]
async fn concurrent_acquire_and_lua_owner_safety_on_real_redis() {
  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, db_index) = session_redis_url(test_redis.url()).expect("compute session redis url");
  assert_eq!(db_index, 2);

  let mutex = Arc::new(RedisMutex::new(&session_url, test_redis.key_prefix()).expect("create redis mutex"));
  let resource = format!("job:contend:{}", uuid::Uuid::new_v4());

  // 1. 8 concurrent contenders race for the same lock; strictly 1 wins.
  let mut handles = Vec::new();
  for idx in 0..8 {
    let m = Arc::clone(&mutex);
    let res = resource.clone();
    handles.push(tokio::spawn(async move {
      let token = new_owner_token(&format!("worker-{idx}"));
      m.try_acquire(&res, token, DEFAULT_LOCK_TTL_SECS).await
    }));
  }

  let mut winners = Vec::new();
  let mut losers = 0usize;
  for h in handles {
    match h.await.expect("join contender") {
      Ok(lease) => winners.push(lease),
      Err(WorkerError::AlreadyLocked(_)) => losers += 1,
      Err(other) => panic!("unexpected lock error: {other}"),
    }
  }
  assert_eq!(winners.len(), 1, "strictly one contender must win the lock");
  assert_eq!(losers, 7, "all other contenders must fail with AlreadyLocked");
  let lease = winners.pop().unwrap();

  // 2. Foreign owner cannot renew or delete the lock via Lua scripts.
  let foreign_token = new_owner_token("impostor");
  assert!(
    !mutex
      .renew_with_token(&resource, &foreign_token, 120)
      .await
      .expect("foreign renew call")
  );
  assert!(
    !mutex
      .release_with_token(&resource, &foreign_token)
      .await
      .expect("foreign release call")
  );
  assert_eq!(
    mutex.current_owner(&resource).await.expect("read owner").as_deref(),
    Some(lease.owner_token()),
    "foreign release must not remove owner's lock"
  );

  // 3. True owner can renew and release; afterward another owner can acquire.
  lease.renew(90).await.expect("owner renew succeeds");
  lease.release().await.expect("owner release succeeds");
  assert_eq!(mutex.current_owner(&resource).await.expect("read after release"), None);

  let second = mutex
    .try_acquire(&resource, foreign_token, DEFAULT_LOCK_TTL_SECS)
    .await
    .expect("re-acquire after release");
  second.release().await.expect("release second lease");
}

#[tokio::test]
async fn worker_supervisor_drain_releases_active_redis_locks() {
  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, _) = session_redis_url(test_redis.url()).expect("session url");
  let mutex = RedisMutex::new(&session_url, test_redis.key_prefix()).expect("redis mutex");

  let resource = format!("worker:drain:{}", uuid::Uuid::new_v4());
  let lease = mutex
    .try_acquire(&resource, new_owner_token("drain-node"), DEFAULT_LOCK_TTL_SECS)
    .await
    .expect("acquire worker lease");

  let shutdown = CancellationToken::new();
  let supervisor = WorkerSupervisor::new(shutdown.clone());
  supervisor.track_lease(lease).await;
  supervisor
    .spawn(|token| async move {
      token.cancelled().await;
    })
    .await;

  assert!(
    mutex
      .current_owner(&resource)
      .await
      .expect("owner before drain")
      .is_some(),
    "lock must be held before drain"
  );

  let released = supervisor.drain(Duration::from_secs(2)).await;
  assert_eq!(released, 1, "supervisor must release tracked Redis lock");
  assert!(
    mutex
      .current_owner(&resource)
      .await
      .expect("owner after drain")
      .is_none(),
    "lock key must be deleted immediately on drain"
  );
}

#[tokio::test]
async fn worker_supervisor_drain_aborts_stubborn_task_before_releasing_lock() {
  struct DropFlag(Arc<AtomicBool>);
  impl Drop for DropFlag {
    fn drop(&mut self) {
      self.0.store(true, Ordering::SeqCst);
    }
  }

  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, _) = session_redis_url(test_redis.url()).expect("session url");
  let mutex = RedisMutex::new(&session_url, test_redis.key_prefix()).expect("redis mutex");

  let resource = format!("worker:stubborn:{}", uuid::Uuid::new_v4());
  let lease = mutex
    .try_acquire(&resource, new_owner_token("stubborn-node"), DEFAULT_LOCK_TTL_SECS)
    .await
    .expect("acquire stubborn lease");

  let terminated = Arc::new(AtomicBool::new(false));
  let started = Arc::new(tokio::sync::Notify::new());
  let shutdown = CancellationToken::new();
  let supervisor = WorkerSupervisor::new(shutdown);
  supervisor.track_lease(lease).await;

  {
    let terminated = Arc::clone(&terminated);
    let started = Arc::clone(&started);
    supervisor
      .spawn(move |_ignored_token| async move {
        let _guard = DropFlag(terminated);
        started.notify_one();
        tokio::time::sleep(Duration::from_secs(60)).await;
      })
      .await;
  }
  started.notified().await;
  assert!(!terminated.load(Ordering::SeqCst));

  let released = supervisor.drain(Duration::from_millis(50)).await;
  assert_eq!(released, 1, "tracked lease must be released after task abort");

  // Successor acquires the same lock immediately; old stubborn task MUST already be terminated.
  let successor = mutex
    .try_acquire(&resource, new_owner_token("successor-node"), DEFAULT_LOCK_TTL_SECS)
    .await
    .expect("successor acquires lock immediately after drain");
  assert!(
    terminated.load(Ordering::SeqCst),
    "stubborn worker must be completely terminated before Redis lock is handed off"
  );

  // Spawning after drain must be rejected without running.
  let post_drain_ran = Arc::new(AtomicBool::new(false));
  {
    let flag = Arc::clone(&post_drain_ran);
    supervisor
      .spawn(move |_| async move {
        flag.store(true, Ordering::SeqCst);
      })
      .await;
  }
  tokio::task::yield_now().await;
  assert!(!post_drain_ran.load(Ordering::SeqCst));

  successor.release().await.expect("release successor lease");
}
