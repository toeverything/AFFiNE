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

#[tokio::test]
async fn concurrent_drains_wait_for_one_drain_and_leases_after_shutdown_are_released_at_once() {
  struct DropFlag(Arc<AtomicBool>);
  impl Drop for DropFlag {
    fn drop(&mut self) {
      self.0.store(true, Ordering::SeqCst);
    }
  }

  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, _) = session_redis_url(test_redis.url()).expect("session url");
  let mutex = RedisMutex::new(&session_url, test_redis.key_prefix()).expect("redis mutex");
  let acquire = |label: &'static str| {
    let mutex = mutex.clone();
    async move {
      let resource = format!("worker:{label}:{}", uuid::Uuid::new_v4());
      let lease = mutex
        .try_acquire(&resource, new_owner_token(label), DEFAULT_LOCK_TTL_SECS)
        .await
        .expect("acquire lease");
      (resource, lease)
    }
  };

  let (tracked_resource, tracked) = acquire("tracked").await;
  let shutdown = CancellationToken::new();
  let supervisor = WorkerSupervisor::new(shutdown.clone());
  assert!(supervisor.track_lease(tracked).await);

  // A task that ignores cancellation, so the drain must wait out its timeout
  // and abort it before releasing the tracked lease.
  let terminated = Arc::new(AtomicBool::new(false));
  let started = Arc::new(tokio::sync::Notify::new());
  {
    let terminated = Arc::clone(&terminated);
    let started = Arc::clone(&started);
    supervisor
      .spawn(move |_ignored| async move {
        let _guard = DropFlag(terminated);
        started.notify_one();
        tokio::time::sleep(Duration::from_secs(60)).await;
      })
      .await;
  }
  started.notified().await;

  let first = tokio::spawn({
    let supervisor = supervisor.clone();
    async move { supervisor.drain(Duration::from_millis(300)).await }
  });
  shutdown.cancelled().await;

  // Offered while the first drain is still waiting for the stubborn task.
  let (late_resource, late) = acquire("late").await;
  assert!(
    !supervisor.track_lease(late).await,
    "a lease offered during drain is not tracked"
  );
  assert_eq!(
    mutex.current_owner(&late_resource).await.unwrap(),
    None,
    "and is released at once"
  );

  // The second caller joins the running drain: when it returns, the task is
  // gone and the tracked lock is released, although its own timeout is longer.
  let second = supervisor.drain(Duration::from_secs(30)).await;
  assert!(
    terminated.load(Ordering::SeqCst),
    "second drain returned before the task terminated"
  );
  assert_eq!(
    mutex.current_owner(&tracked_resource).await.unwrap(),
    None,
    "second drain returned before the tracked lease was released"
  );
  assert_eq!((first.await.unwrap(), second), (1, 1));
  assert_eq!(
    supervisor.drain(Duration::ZERO).await,
    1,
    "a later drain reports the finished drain"
  );

  // Shutdown signalled without any drain also refuses new leases.
  let signalled = CancellationToken::new();
  signalled.cancel();
  let idle = WorkerSupervisor::new(signalled);
  let (refused_resource, refused) = acquire("refused").await;
  assert!(!idle.track_lease(refused).await);
  assert_eq!(mutex.current_owner(&refused_resource).await.unwrap(), None);
}

fn redis_upstream_addr(session_url: &str) -> String {
  let without_scheme = session_url.split_once("://").expect("redis url scheme").1;
  without_scheme
    .split_once('/')
    .map(|(a, _)| a)
    .unwrap_or(without_scheme)
    .to_owned()
}

#[tokio::test]
async fn try_acquire_ms_recovers_idempotently_when_first_reply_drops() {
  use std::sync::atomic::AtomicUsize;
  use tokio::io::{AsyncReadExt, AsyncWriteExt};

  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, session_db) = session_redis_url(test_redis.url()).expect("session url");
  let upstream_addr = redis_upstream_addr(&session_url);

  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let proxy_port = listener.local_addr().unwrap().port();
  let proxy_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");
  let conn_count = Arc::new(AtomicUsize::new(0));
  let conn_count_c = Arc::clone(&conn_count);

  let proxy_task = tokio::spawn(async move {
    while let Ok((client, _)) = listener.accept().await {
      let idx = conn_count_c.fetch_add(1, Ordering::SeqCst);
      let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
      if idx == 0 {
        // Connection #1: forward requests to Redis, wait until ACQUIRE_LOCK_MS
        // commits (`:1\r\n`), then drop the client socket without delivering `:1\r\n`.
        let (mut cr, mut cw) = client.into_split();
        let (mut ur, mut uw) = upstream.into_split();
        let c2u = tokio::spawn(async move {
          let _ = tokio::io::copy(&mut cr, &mut uw).await;
        });
        let u2c = tokio::spawn(async move {
          let mut buf = [0u8; 4096];
          while let Ok(n) = ur.read(&mut buf).await {
            if n == 0 {
              break;
            }
            let chunk = &buf[..n];
            if chunk.windows(4).any(|w| w == b":1\r\n") {
              // Drop reply after Redis has committed the lock.
              drop(cw);
              break;
            }
            if cw.write_all(chunk).await.is_err() {
              break;
            }
          }
        });
        let _ = u2c.await;
        c2u.abort();
      } else {
        let mut client = client;
        let mut upstream = upstream;
        tokio::spawn(async move {
          let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
        });
      }
    }
  });

  let direct_mutex = RedisMutex::new(&session_url, test_redis.key_prefix()).expect("direct mutex");
  let proxied_mutex = RedisMutex::new(&proxy_url, test_redis.key_prefix()).expect("proxied mutex");
  let resource = format!("worker:reply-drop:{}", uuid::Uuid::new_v4());
  let token = new_owner_token("reply-drop-node");

  // Single call to `try_acquire_ms` drops reply on conn #1, reconnects on conn #2,
  // re-confirms ownership with the same owner_token, and returns Ok(lease).
  let lease = proxied_mutex
    .try_acquire_ms(&resource, token.clone(), 60_000)
    .await
    .expect("idempotent retry must succeed after dropped reply");
  assert_eq!(lease.owner_token(), token);
  assert_eq!(
    direct_mutex.current_owner(&resource).await.unwrap().as_deref(),
    Some(token.as_str())
  );
  assert!(conn_count.load(Ordering::SeqCst) >= 2);

  lease.release().await.expect("release recovered lease");
  assert_eq!(direct_mutex.current_owner(&resource).await.unwrap(), None);
  proxy_task.abort();
}

#[tokio::test]
async fn try_acquire_ms_cleans_up_orphan_lock_when_both_attempts_fail_after_commit() {
  use std::sync::atomic::AtomicUsize;
  use tokio::io::{AsyncReadExt, AsyncWriteExt};

  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, session_db) = session_redis_url(test_redis.url()).expect("session url");
  let upstream_addr = redis_upstream_addr(&session_url);

  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let proxy_port = listener.local_addr().unwrap().port();
  let proxy_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");
  let conn_count = Arc::new(AtomicUsize::new(0));
  let conn_count_c = Arc::clone(&conn_count);

  let proxy_task = tokio::spawn(async move {
    while let Ok((client, _)) = listener.accept().await {
      let idx = conn_count_c.fetch_add(1, Ordering::SeqCst);
      if idx == 0 {
        let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
        let (mut cr, mut cw) = client.into_split();
        let (mut ur, mut uw) = upstream.into_split();
        let c2u = tokio::spawn(async move {
          let _ = tokio::io::copy(&mut cr, &mut uw).await;
        });
        let u2c = tokio::spawn(async move {
          let mut buf = [0u8; 4096];
          while let Ok(n) = ur.read(&mut buf).await {
            if n == 0 {
              break;
            }
            let chunk = &buf[..n];
            if chunk.windows(4).any(|w| w == b":1\r\n") {
              drop(cw);
              break;
            }
            if cw.write_all(chunk).await.is_err() {
              break;
            }
          }
        });
        let _ = u2c.await;
        c2u.abort();
      } else if idx == 1 {
        // Connection #2 (the retry attempt): drop immediately so `try_acquire_ms` fails.
        drop(client);
      } else {
        // Connection #3+ (the best-effort cleanup): forward normally so the orphan lock is deleted.
        let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
        let mut client = client;
        let mut upstream = upstream;
        tokio::spawn(async move {
          let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
        });
      }
    }
  });

  let direct_mutex = RedisMutex::new(&session_url, test_redis.key_prefix()).expect("direct mutex");
  let proxied_mutex = RedisMutex::new(&proxy_url, test_redis.key_prefix()).expect("proxied mutex");
  let resource = format!("worker:orphan-cleanup:{}", uuid::Uuid::new_v4());
  let token = new_owner_token("orphan-node");

  let err = proxied_mutex
    .try_acquire_ms(&resource, token, 60_000)
    .await
    .expect_err("double-failure acquire must return Err");
  assert!(
    !matches!(err, WorkerError::AlreadyLocked(_)),
    "must fail with transport error, not AlreadyLocked: {err}"
  );
  assert_eq!(
    direct_mutex.current_owner(&resource).await.unwrap(),
    None,
    "best-effort cleanup must remove orphan lock committed on conn #1"
  );
  proxy_task.abort();
}

#[tokio::test]
async fn try_acquire_ms_cancelled_before_return_unlocks_own_key_and_preserves_foreign_owner() {
  use tokio::io::{AsyncReadExt, AsyncWriteExt};

  let test_redis = TestRedis::from_env_or_docker().expect("test redis");
  let (session_url, session_db) = session_redis_url(test_redis.url()).expect("session url");
  let upstream_addr = redis_upstream_addr(&session_url);
  let direct_mutex = RedisMutex::new(&session_url, test_redis.key_prefix()).expect("direct mutex");

  // Scenario 1: proxy forwards ACQUIRE_LOCK_MS to Redis, receives `:1\r\n`,
  // holds the reply and signals caller to cancel `try_acquire_ms`, then releases
  // the reply. A successor must acquire the same resource immediately (well
  // before the 60s TTL).
  {
    let reply_held = Arc::new(tokio::sync::Notify::new());
    let (allow_reply_tx, allow_reply_rx) = tokio::sync::watch::channel(false);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_port = listener.local_addr().unwrap().port();
    let proxy_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");
    let reply_held_c = Arc::clone(&reply_held);
    let proxy_task = tokio::spawn(async move {
      let mut held_once = false;
      while let Ok((client, _)) = listener.accept().await {
        let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
        let (mut cr, mut cw) = client.into_split();
        let (mut ur, mut uw) = upstream.into_split();
        let reply_held_c = Arc::clone(&reply_held_c);
        let mut allow_rx = allow_reply_rx.clone();
        let should_hold = !held_once;
        held_once = true;
        tokio::spawn(async move {
          let _ = tokio::io::copy(&mut cr, &mut uw).await;
        });
        tokio::spawn(async move {
          let mut buf = [0u8; 4096];
          let mut did_hold = false;
          while let Ok(n) = ur.read(&mut buf).await {
            if n == 0 {
              break;
            }
            let chunk = &buf[..n];
            if should_hold && !did_hold && chunk.windows(4).any(|w| w == b":1\r\n") {
              did_hold = true;
              reply_held_c.notify_one();
              let _ = allow_rx.wait_for(|v| *v).await;
            }
            if cw.write_all(chunk).await.is_err() {
              break;
            }
          }
        });
      }
    });

    let proxied_mutex = RedisMutex::new(&proxy_url, test_redis.key_prefix()).expect("proxied mutex");
    let resource = format!("worker:cancel-own:{}", uuid::Uuid::new_v4());
    tokio::select! {
      _ = proxied_mutex.try_acquire_ms(&resource, new_owner_token("cancelled-caller"), 60_000) => {
        panic!("try_acquire_ms must be cancelled before returning")
      }
      () = reply_held.notified() => {}
    }
    let _ = allow_reply_tx.send(true);

    let mut successor_lease = None;
    for _ in 0..100 {
      if let Ok(lease) = direct_mutex
        .try_acquire_ms(&resource, new_owner_token("successor"), 60_000)
        .await
      {
        successor_lease = Some(lease);
        break;
      }
      tokio::time::sleep(Duration::from_millis(15)).await;
    }
    let lease = successor_lease.expect("cancelled try_acquire_ms must release its own lock before TTL");
    lease.release().await.expect("release successor");
    proxy_task.abort();
  }

  // Scenario 2: a foreign owner already holds the lock; cancelling a contender's
  // `try_acquire_ms` while `:0\r\n` is held MUST NOT delete the foreign owner's lock.
  {
    let resource = format!("worker:cancel-foreign:{}", uuid::Uuid::new_v4());
    let foreign_token = new_owner_token("foreign-holder");
    let foreign_lease = direct_mutex
      .try_acquire_ms(&resource, foreign_token.clone(), 60_000)
      .await
      .expect("foreign acquire");

    let upstream_addr = redis_upstream_addr(&session_url);
    let reply_held = Arc::new(tokio::sync::Notify::new());
    let (allow_reply_tx, allow_reply_rx) = tokio::sync::watch::channel(false);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_port = listener.local_addr().unwrap().port();
    let proxy_url = format!("redis://127.0.0.1:{proxy_port}/{session_db}");
    let reply_held_c = Arc::clone(&reply_held);
    let proxy_task = tokio::spawn(async move {
      let mut held_once = false;
      while let Ok((client, _)) = listener.accept().await {
        let upstream = tokio::net::TcpStream::connect(&upstream_addr).await.unwrap();
        let (mut cr, mut cw) = client.into_split();
        let (mut ur, mut uw) = upstream.into_split();
        let reply_held_c = Arc::clone(&reply_held_c);
        let mut allow_rx = allow_reply_rx.clone();
        let should_hold = !held_once;
        held_once = true;
        tokio::spawn(async move {
          let _ = tokio::io::copy(&mut cr, &mut uw).await;
        });
        tokio::spawn(async move {
          let mut buf = [0u8; 4096];
          let mut did_hold = false;
          while let Ok(n) = ur.read(&mut buf).await {
            if n == 0 {
              break;
            }
            let chunk = &buf[..n];
            if should_hold && !did_hold && chunk.windows(4).any(|w| w == b":0\r\n") {
              did_hold = true;
              reply_held_c.notify_one();
              let _ = allow_rx.wait_for(|v| *v).await;
            }
            if cw.write_all(chunk).await.is_err() {
              break;
            }
          }
        });
      }
    });

    let proxied_mutex = RedisMutex::new(&proxy_url, test_redis.key_prefix()).expect("proxied mutex");
    tokio::select! {
      _ = proxied_mutex.try_acquire_ms(&resource, new_owner_token("cancelled-contender"), 60_000) => {
        panic!("contender try_acquire_ms must be cancelled before returning")
      }
      () = reply_held.notified() => {}
    }
    let _ = allow_reply_tx.send(true);
    tokio::time::sleep(Duration::from_millis(80)).await;

    assert_eq!(
      direct_mutex.current_owner(&resource).await.unwrap().as_deref(),
      Some(foreign_token.as_str()),
      "cancelled contender must never disturb foreign owner's lock"
    );
    foreign_lease.release().await.expect("release foreign lease");
    proxy_task.abort();
  }
}
