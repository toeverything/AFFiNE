use std::{
  future::Future,
  pin::Pin,
  sync::{
    Arc, RwLock,
    atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering},
  },
  time::Duration,
};

use affine_core::invalidation::{INVALIDATION_CHANNEL_V1, decode_invalidation_v1, encode_invalidation_v1};
use futures_util::StreamExt;
use napi::{
  Status,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use redis::aio::MultiplexedConnection;
use tokio::{sync::Mutex, task::JoinHandle};

use super::RedisRuntimeConfig;
use crate::runtime::types::InvalidationHealth;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const PUBLISH_TIMEOUT: Duration = Duration::from_secs(1);
pub(super) use affine_core::invalidation::InvalidationHintV1;

pub(super) trait InvalidationTarget: Send + Sync {
  fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

  fn invalidate_all<'a>(&'a self) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async {})
  }
}

type InvalidationCallback = ThreadsafeFunction<String, (), String, Status, true, true, 1024>;

#[derive(Clone, Default)]
pub(super) struct InvalidationEvents(Arc<RwLock<Option<InvalidationCallback>>>);

impl InvalidationEvents {
  pub(super) fn from_threadsafe_function(callback: Option<InvalidationCallback>) -> Self {
    Self(Arc::new(RwLock::new(callback)))
  }

  pub(super) fn shutdown(&self) {
    if let Ok(mut callback) = self.0.write() {
      callback.take();
    }
  }

  fn emit(&self, hint: &InvalidationHintV1) {
    let Ok(payload) = encode_invalidation_v1(hint) else {
      return;
    };
    let Ok(payload) = String::from_utf8(payload) else {
      return;
    };
    if let Ok(callback) = self.0.read()
      && let Some(callback) = callback.as_ref()
    {
      let _ = callback.call(Ok(payload), ThreadsafeFunctionCallMode::NonBlocking);
    }
  }
}

pub(super) struct EventInvalidationTarget(pub(super) InvalidationEvents);

impl InvalidationTarget for EventInvalidationTarget {
  fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move { self.0.emit(hint) })
  }
}

#[cfg(test)]
pub(super) struct NoopInvalidationTarget;

#[cfg(test)]
impl InvalidationTarget for NoopInvalidationTarget {
  fn invalidate<'a>(&'a self, _hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async {})
  }
}

pub(super) struct CompositeInvalidationTarget(pub(super) Vec<Arc<dyn InvalidationTarget>>);

impl InvalidationTarget for CompositeInvalidationTarget {
  fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
      for target in &self.0 {
        target.invalidate(hint).await;
      }
    })
  }

  fn invalidate_all<'a>(&'a self) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
      for target in &self.0 {
        target.invalidate_all().await;
      }
    })
  }
}

#[derive(Default)]
struct Health {
  state: AtomicU8,
  publish_failed: AtomicBool,
  publish_failure_epoch: AtomicU64,
  reconnects: AtomicU64,
  decode_failures: AtomicU64,
  received: AtomicU64,
  published: AtomicU64,
  publish_failures: AtomicU64,
}

pub(super) struct InvalidationRuntime {
  client: Option<redis::Client>,
  subscribes: bool,
  publisher: Mutex<Option<MultiplexedConnection>>,
  reconnecting: Mutex<()>,
  target: Arc<dyn InvalidationTarget>,
  health: Arc<Health>,
  shutdown: Arc<AtomicBool>,
  subscriber: Mutex<Option<JoinHandle<()>>>,
  publisher_recovery: Mutex<Option<JoinHandle<()>>>,
}

impl InvalidationRuntime {
  pub(super) async fn start(
    config: &RedisRuntimeConfig,
    subscribe: bool,
    target: Arc<dyn InvalidationTarget>,
  ) -> Arc<Self> {
    let client = config.url.as_deref().and_then(|url| redis::Client::open(url).ok());
    let health = Arc::new(Health::default());
    health
      .state
      .store(if client.is_some() { 3 } else { 0 }, Ordering::Relaxed);
    let runtime = Arc::new(Self {
      client,
      subscribes: subscribe,
      publisher: Mutex::new(None),
      reconnecting: Mutex::new(()),
      target,
      health,
      shutdown: Arc::new(AtomicBool::new(false)),
      subscriber: Mutex::new(None),
      publisher_recovery: Mutex::new(None),
    });
    runtime.connect_publisher().await;
    if subscribe && runtime.client.is_some() {
      let task_runtime = Arc::clone(&runtime);
      *runtime.subscriber.lock().await = Some(tokio::spawn(async move {
        task_runtime.subscribe_loop().await;
      }));
    }
    if runtime.client.is_some() {
      let task_runtime = Arc::clone(&runtime);
      *runtime.publisher_recovery.lock().await = Some(tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(250));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        while !task_runtime.shutdown.load(Ordering::Acquire) {
          interval.tick().await;
          if task_runtime.health.publish_failed.load(Ordering::Acquire) {
            task_runtime.connect_publisher().await;
          }
        }
      }));
    }
    runtime
  }

  pub(super) async fn stop(&self) {
    self.shutdown.store(true, Ordering::Release);
    if let Some(task) = self.subscriber.lock().await.take() {
      task.abort();
      let _ = task.await;
    }
    if let Some(task) = self.publisher_recovery.lock().await.take() {
      task.abort();
      let _ = task.await;
    }
    self.publisher.lock().await.take();
  }

  pub(super) fn is_degraded(&self) -> bool {
    let state = self.health.state.load(Ordering::Acquire);
    self.client.is_some()
      && ((self.subscribes && state != 1)
        || (!self.subscribes && state == 2)
        || self.health.publish_failed.load(Ordering::Acquire))
  }

  pub(super) fn health(&self) -> InvalidationHealth {
    let state = match self.health.state.load(Ordering::Relaxed) {
      _ if self.health.publish_failed.load(Ordering::Acquire) && self.client.is_some() => "degraded",
      0 => "disabled",
      1 => "healthy",
      2 => "degraded",
      _ => "connecting",
    };
    InvalidationHealth {
      state: state.to_string(),
      reconnects: self.health.reconnects.load(Ordering::Relaxed) as i64,
      decode_failures: self.health.decode_failures.load(Ordering::Relaxed) as i64,
      received: self.health.received.load(Ordering::Relaxed) as i64,
      published: self.health.published.load(Ordering::Relaxed) as i64,
      publish_failures: self.health.publish_failures.load(Ordering::Relaxed) as i64,
    }
  }

  // Failure recording and recovery's final epoch check share only this short
  // critical section; no network or cache loading runs under the publisher
  // lock.
  fn record_publish_failure(&self, publisher: &mut Option<MultiplexedConnection>) {
    publisher.take();
    self.health.publish_failures.fetch_add(1, Ordering::Relaxed);
    self.health.publish_failure_epoch.fetch_add(1, Ordering::AcqRel);
    self.health.publish_failed.store(true, Ordering::Release);
    if !self.subscribes {
      self.health.state.store(2, Ordering::Release);
    }
  }

  pub(super) async fn publish(&self, hint: InvalidationHintV1) {
    self.target.invalidate(&hint).await;
    let Ok(payload) = encode_invalidation_v1(&hint) else {
      self.record_publish_failure(&mut *self.publisher.lock().await);
      return;
    };
    let mut connection = {
      let mut publisher = self.publisher.lock().await;
      let Some(connection) = publisher.as_ref() else {
        // Reconnection belongs to the background task. A blackholed Redis must
        // never make business requests queue behind connection attempts.
        self.record_publish_failure(&mut publisher);
        return;
      };
      connection.clone()
    };
    let published = tokio::time::timeout(
      PUBLISH_TIMEOUT,
      redis::cmd("PUBLISH")
        .arg(INVALIDATION_CHANNEL_V1)
        .arg(payload)
        .query_async::<i64>(&mut connection),
    )
    .await;
    if matches!(published, Ok(Ok(_))) {
      self.health.published.fetch_add(1, Ordering::Relaxed);
    } else {
      self.record_publish_failure(&mut *self.publisher.lock().await);
    }
  }

  async fn connect_publisher(&self) {
    let Some(client) = self.client.as_ref() else { return };
    // Only recovery attempts serialize here. Publishers never acquire this
    // lock.
    let _reconnecting = self.reconnecting.lock().await;
    let (epoch, recovering) = {
      let publisher = self.publisher.lock().await;
      let recovering = self.health.publish_failed.load(Ordering::Acquire);
      if publisher.is_some() && !recovering {
        return;
      }
      (self.health.publish_failure_epoch.load(Ordering::Acquire), recovering)
    };
    let connected = tokio::time::timeout(CONNECT_TIMEOUT, client.get_multiplexed_async_connection()).await;
    if let Ok(Ok(mut connection)) = connected {
      let flushed = !recovering
        || matches!(
          tokio::time::timeout(
            PUBLISH_TIMEOUT,
            redis::cmd("PUBLISH")
              .arg(INVALIDATION_CHANNEL_V1)
              .arg(r#"{"version":1,"kind":"flush_all"}"#)
              .query_async::<i64>(&mut connection)
          )
          .await,
          Ok(Ok(_))
        );
      if flushed {
        if recovering && self.health.publish_failure_epoch.load(Ordering::Acquire) == epoch {
          self.target.invalidate_all().await;
        }
        let mut publisher = self.publisher.lock().await;
        *publisher = Some(connection);
        // A publish can fail while the network or local full clear was pending.
        // Such a newer failure needs another flush; never clear its latch.
        if self.health.publish_failure_epoch.load(Ordering::Acquire) == epoch {
          self.health.publish_failed.store(false, Ordering::Release);
          if !self.subscribes {
            self.health.state.store(1, Ordering::Release);
          }
        }
        return;
      }
    }
    let _publisher = self.publisher.lock().await;
    self.health.publish_failed.store(true, Ordering::Release);
    if !self.subscribes {
      self.health.state.store(2, Ordering::Release);
    }
  }

  async fn subscribe_loop(self: Arc<Self>) {
    let Some(client) = self.client.clone() else {
      return;
    };
    let mut backoff = Duration::from_millis(250);
    while !self.shutdown.load(Ordering::Acquire) {
      let connected = tokio::time::timeout(CONNECT_TIMEOUT, client.get_async_pubsub()).await;
      let Ok(Ok(mut pubsub)) = connected else {
        self.degraded_wait(&mut backoff).await;
        continue;
      };
      if !matches!(
        tokio::time::timeout(CONNECT_TIMEOUT, pubsub.subscribe(INVALIDATION_CHANNEL_V1)).await,
        Ok(Ok(_))
      ) {
        self.degraded_wait(&mut backoff).await;
        continue;
      }
      self.target.invalidate_all().await;
      self.health.state.store(1, Ordering::Release);
      backoff = Duration::from_millis(250);
      let mut messages = pubsub.on_message();
      while !self.shutdown.load(Ordering::Acquire) {
        let Some(message) = messages.next().await else {
          break;
        };
        let Ok(payload) = message.get_payload::<String>() else {
          self.health.decode_failures.fetch_add(1, Ordering::Relaxed);
          continue;
        };
        self.apply_payload(&payload).await;
      }
      self.degraded_wait(&mut backoff).await;
    }
  }

  async fn apply_payload(&self, payload: &str) {
    let Ok(hint) = decode_invalidation_v1(payload.as_bytes()) else {
      let value = serde_json::from_str::<serde_json::Value>(payload).ok();
      if value.as_ref().is_some_and(|value| {
        value.get("version").and_then(serde_json::Value::as_u64) == Some(1)
          && value.get("kind").and_then(serde_json::Value::as_str) == Some("flush_all")
      }) {
        self.target.invalidate_all().await;
        self.health.received.fetch_add(1, Ordering::Relaxed);
        return;
      }
      self.health.decode_failures.fetch_add(1, Ordering::Relaxed);
      if value
        .as_ref()
        .and_then(serde_json::Value::as_object)
        .is_some_and(|map| map.contains_key("version"))
      {
        self.target.invalidate_all().await;
      }
      return;
    };
    self.target.invalidate(&hint).await;
    self.health.received.fetch_add(1, Ordering::Relaxed);
  }

  async fn degraded_wait(&self, backoff: &mut Duration) {
    self.health.state.store(2, Ordering::Release);
    self.health.reconnects.fetch_add(1, Ordering::Release);
    tokio::time::sleep(*backoff).await;
    *backoff = (*backoff * 2).min(Duration::from_secs(5));
  }
}

#[cfg(test)]
mod tests {
  use affine_core::invalidation::INVALIDATION_CHANNEL_V1;
  use tokio::sync::Mutex as TokioMutex;

  use super::*;

  #[derive(Default)]
  struct RecordingTarget {
    hints: TokioMutex<Vec<InvalidationHintV1>>,
    all_invalidations: AtomicU64,
    cached_value: TokioMutex<Option<&'static str>>,
  }

  impl InvalidationTarget for RecordingTarget {
    fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
      Box::pin(async move { self.hints.lock().await.push(hint.clone()) })
    }

    fn invalidate_all<'a>(&'a self) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
      Box::pin(async move {
        self.all_invalidations.fetch_add(1, Ordering::Relaxed);
        self.cached_value.lock().await.take();
      })
    }
  }

  async fn wait_for(label: &str, mut condition: impl AsyncFnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(5), async {
      while !condition().await {
        tokio::time::sleep(Duration::from_millis(25)).await;
      }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for {label}"));
  }

  #[test]
  fn connecting_subscribers_bypass_cache_until_first_subscription_is_ready() {
    let mut runtime = InvalidationRuntime {
      client: Some(redis::Client::open("redis://127.0.0.1:1/").unwrap()),
      subscribes: true,
      publisher: Mutex::new(None),
      reconnecting: Mutex::new(()),
      target: Arc::new(RecordingTarget::default()),
      health: Arc::new(Health::default()),
      shutdown: Arc::new(AtomicBool::new(false)),
      subscriber: Mutex::new(None),
      publisher_recovery: Mutex::new(None),
    };
    for subscribes in [true, false] {
      runtime.subscribes = subscribes;
      for state in [0, 1, 2, 3] {
        runtime.health.state.store(state, Ordering::Release);
        assert_eq!(runtime.is_degraded(), if subscribes { state != 1 } else { state == 2 });
      }
    }
    runtime.health.state.store(1, Ordering::Release);
    runtime.health.publish_failed.store(true, Ordering::Release);
    assert!(runtime.is_degraded());
  }

  #[tokio::test]
  async fn concurrent_publishes_do_not_wait_for_reconnection_network_lock() {
    let target = Arc::new(RecordingTarget::default());
    let runtime = InvalidationRuntime::start(
      &RedisRuntimeConfig {
        url: Some("redis://127.0.0.1:1/".into()),
      },
      true,
      target,
    )
    .await;
    let blocked_reconnect = runtime.reconnecting.lock().await;
    tokio::time::timeout(
      Duration::from_secs(1),
      futures_util::future::join_all((0..32).map(|index| {
        let runtime = Arc::clone(&runtime);
        async move {
          runtime
            .publish(InvalidationHintV1::QuotaSeatUsage {
              workspace_id: format!("write-{index}"),
            })
            .await
        }
      })),
    )
    .await
    .expect("writes must finish while the reconnect lock is held");
    assert!(runtime.health.publish_failure_epoch.load(Ordering::Acquire) >= 32);
    assert!(runtime.is_degraded());
    drop(blocked_reconnect);
    runtime.stop().await;
  }

  #[tokio::test]
  #[ignore = "requires isolated INVALIDATION_REDIS_URL; run explicitly with --include-ignored"]
  async fn concurrent_publish_timeouts_recover_without_new_writes_and_flush_healthy_peer_cache() {
    let url = std::env::var("INVALIDATION_REDIS_URL").expect("real Redis INVALIDATION_REDIS_URL is required");
    let config = RedisRuntimeConfig { url: Some(url.clone()) };
    let target_a = Arc::new(RecordingTarget::default());
    let target_b = Arc::new(RecordingTarget::default());
    let peer = InvalidationRuntime::start(&config, true, target_b.clone()).await;
    let publisher = InvalidationRuntime::start(&config, false, target_a.clone()).await;
    wait_for("first subscription invalidates before enabling cache", || async {
      !peer.is_degraded() && target_b.all_invalidations.load(Ordering::Acquire) > 0
    })
    .await;
    *target_b.cached_value.lock().await = Some("stale-before-lost-publish");
    let before = target_b.all_invalidations.load(Ordering::Acquire);
    let mut control = redis::Client::open(url)
      .unwrap()
      .get_multiplexed_async_connection()
      .await
      .unwrap();
    redis::cmd("CLIENT")
      .arg("PAUSE")
      .arg(30_000)
      .arg("WRITE")
      .query_async::<()>(&mut control)
      .await
      .unwrap();
    let completed = tokio::time::timeout(
      Duration::from_secs(3),
      futures_util::future::join_all((0..32).map(|index| {
        let publisher = Arc::clone(&publisher);
        async move {
          publisher
            .publish(InvalidationHintV1::QuotaSeatUsage {
              workspace_id: format!("missed-write-{index}"),
            })
            .await
        }
      })),
    )
    .await;
    // Always restore the isolated Redis even when the concurrency assertion
    // fails.
    redis::cmd("CLIENT")
      .arg("UNPAUSE")
      .query_async::<()>(&mut control)
      .await
      .unwrap();
    completed.expect("concurrent writes must not serialize their Redis timeouts");
    assert!(publisher.health().publish_failures > 0);
    assert!(!peer.is_degraded());
    // No further publish call: the recovery task must reconnect, broadcast a
    // full flush and only then allow the publisher's caches to recover.
    wait_for("background recovery flushes healthy peer", || async {
      !publisher.is_degraded()
        && target_b.all_invalidations.load(Ordering::Acquire) > before
        && target_b.cached_value.lock().await.is_none()
    })
    .await;
    assert!(!peer.is_degraded());
    publisher.stop().await;
    peer.stop().await;
    assert_eq!(Arc::strong_count(&publisher), 1);
    assert_eq!(Arc::strong_count(&peer), 1);
  }

  #[tokio::test]
  async fn decode_failures_duplicate_hints_and_flush_all_have_distinct_accounting() {
    let target = Arc::new(RecordingTarget::default());
    let runtime = InvalidationRuntime::start(&RedisRuntimeConfig::default(), false, target.clone()).await;
    assert!(!runtime.is_degraded());
    runtime.apply_payload(r#"{"version":1,"kind":"unknown"}"#).await;
    runtime.apply_payload("not-json").await;
    runtime.apply_payload(r#"{"kind":"noVersionField"}"#).await;
    let payload = r#"{"version":1,"kind":"quotaSeatUsage","workspaceId":"workspace"}"#;
    runtime.apply_payload(payload).await;
    runtime.apply_payload(payload).await;
    runtime.apply_payload(r#"{"version":1,"kind":"flush_all"}"#).await;

    let health = runtime.health();
    assert_eq!(health.decode_failures, 3);
    assert_eq!(health.received, 3);
    assert_eq!(target.hints.lock().await.len(), 2);
    assert_eq!(target.all_invalidations.load(Ordering::Relaxed), 2);
  }

  #[tokio::test]
  async fn degraded_redis_never_blocks_local_invalidation_and_reports_reconnects() {
    let target = Arc::new(RecordingTarget::default());
    let runtime = InvalidationRuntime::start(
      &RedisRuntimeConfig {
        url: Some("redis://127.0.0.1:1/".to_string()),
      },
      true,
      target.clone(),
    )
    .await;
    runtime
      .publish(InvalidationHintV1::QuotaOwnerMapping {
        workspace_id: "workspace".to_string(),
      })
      .await;
    tokio::time::timeout(Duration::from_secs(3), async {
      while runtime.health().reconnects == 0 {
        tokio::task::yield_now().await;
      }
    })
    .await
    .unwrap();

    let health = runtime.health();
    assert_eq!(health.state, "degraded");
    assert!(runtime.is_degraded());
    assert!(health.reconnects > 0);
    assert_eq!(health.publish_failures, 1);
    assert_eq!(target.hints.lock().await.len(), 1);
    tokio::time::timeout(Duration::from_secs(1), runtime.stop())
      .await
      .expect("invalidation shutdown must join the subscriber");
    assert_eq!(Arc::strong_count(&runtime), 1);
  }

  #[tokio::test]
  #[ignore = "requires isolated INVALIDATION_REDIS_URL; run explicitly with --include-ignored"]
  async fn redis_publisher_subscriber_reconnect_and_decode_contract() {
    let url = std::env::var("INVALIDATION_REDIS_URL").expect("real Redis INVALIDATION_REDIS_URL is required");
    let config = RedisRuntimeConfig { url: Some(url.clone()) };
    let publisher_target = Arc::new(RecordingTarget::default());
    let subscriber_target = Arc::new(RecordingTarget::default());
    let subscriber = InvalidationRuntime::start(&config, true, subscriber_target.clone()).await;
    let publisher = InvalidationRuntime::start(&config, false, publisher_target.clone()).await;
    let client = redis::Client::open(url).unwrap();
    let control = Arc::new(TokioMutex::new(
      client.get_multiplexed_async_connection().await.unwrap(),
    ));
    wait_for("initial subscription", || {
      let control = Arc::clone(&control);
      async move {
        redis::cmd("PUBSUB")
          .arg("NUMSUB")
          .arg(INVALIDATION_CHANNEL_V1)
          .query_async::<Vec<(String, i64)>>(&mut *control.lock().await)
          .await
          .is_ok_and(|counts| counts.first().is_some_and(|(_, count)| *count == 1))
      }
    })
    .await;

    for workspace_id in ["duplicate", "owner", "duplicate"] {
      publisher
        .publish(if workspace_id == "owner" {
          InvalidationHintV1::QuotaOwnerMapping {
            workspace_id: workspace_id.to_string(),
          }
        } else {
          InvalidationHintV1::QuotaSeatUsage {
            workspace_id: workspace_id.to_string(),
          }
        })
        .await;
    }
    redis::cmd("PUBLISH")
      .arg(INVALIDATION_CHANNEL_V1)
      .arg(r#"{"version":1,"kind":"unknown"}"#)
      .query_async::<i64>(&mut *control.lock().await)
      .await
      .unwrap();
    wait_for("initial messages", || {
      let subscriber_target = Arc::clone(&subscriber_target);
      async move { subscriber_target.hints.lock().await.len() == 3 }
    })
    .await;
    wait_for("decode failure", || async { subscriber.health().decode_failures == 1 }).await;

    redis::cmd("CLIENT")
      .arg("KILL")
      .arg("TYPE")
      .arg("pubsub")
      .query_async::<i64>(&mut *control.lock().await)
      .await
      .unwrap();
    wait_for("subscriber reconnect", || async { subscriber.health().reconnects > 0 }).await;
    wait_for("subscription after reconnect", || {
      let control = Arc::clone(&control);
      async move {
        redis::cmd("PUBSUB")
          .arg("NUMSUB")
          .arg(INVALIDATION_CHANNEL_V1)
          .query_async::<Vec<(String, i64)>>(&mut *control.lock().await)
          .await
          .is_ok_and(|counts| counts.first().is_some_and(|(_, count)| *count == 1))
      }
    })
    .await;
    publisher
      .publish(InvalidationHintV1::QuotaSeatUsage {
        workspace_id: "after-reconnect".to_string(),
      })
      .await;
    wait_for("message after reconnect", || {
      let subscriber_target = Arc::clone(&subscriber_target);
      async move { subscriber_target.hints.lock().await.len() == 4 }
    })
    .await;

    redis::cmd("CLIENT")
      .arg("PAUSE")
      .arg(1_500)
      .arg("WRITE")
      .query_async::<()>(&mut *control.lock().await)
      .await
      .unwrap();
    let started = std::time::Instant::now();
    publisher
      .publish(InvalidationHintV1::QuotaSeatUsage {
        workspace_id: "stalled".to_string(),
      })
      .await;
    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(publisher.publisher.lock().await.is_none());
    assert!(publisher.health().publish_failures > 0);
    assert!(publisher.is_degraded());
    tokio::time::sleep(Duration::from_secs(2)).await;
    publisher
      .publish(InvalidationHintV1::QuotaSeatUsage {
        workspace_id: "after-stall".to_string(),
      })
      .await;
    wait_for("message after stalled publisher", || {
      let subscriber_target = Arc::clone(&subscriber_target);
      async move {
        subscriber_target.hints.lock().await.iter().any(|hint| {
          matches!(
            hint,
            InvalidationHintV1::QuotaSeatUsage { workspace_id }
              if workspace_id == "after-stall"
          )
        })
      }
    })
    .await;

    assert!(!publisher.is_degraded());
    assert!(publisher_target.all_invalidations.load(Ordering::Relaxed) >= 1);
    // Reconnecting the publishing side cannot hide a disconnected subscriber.
    subscriber.health.state.store(2, Ordering::Release);
    subscriber.connect_publisher().await;
    assert!(subscriber.is_degraded());

    assert_eq!(publisher_target.hints.lock().await.len(), 6);
    assert!((5..=6).contains(&subscriber_target.hints.lock().await.len()));
    assert!(subscriber_target.all_invalidations.load(Ordering::Relaxed) >= 2);
    subscriber.stop().await;
    publisher.stop().await;
  }
}
