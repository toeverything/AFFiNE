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
}

#[derive(Default)]
struct Health {
  state: AtomicU8,
  reconnects: AtomicU64,
  decode_failures: AtomicU64,
  received: AtomicU64,
  published: AtomicU64,
  publish_failures: AtomicU64,
}

pub(super) struct InvalidationRuntime {
  client: Option<redis::Client>,
  publisher: Mutex<Option<MultiplexedConnection>>,
  target: Arc<dyn InvalidationTarget>,
  health: Arc<Health>,
  shutdown: Arc<AtomicBool>,
  subscriber: Mutex<Option<JoinHandle<()>>>,
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
      publisher: Mutex::new(None),
      target,
      health,
      shutdown: Arc::new(AtomicBool::new(false)),
      subscriber: Mutex::new(None),
    });
    runtime.connect_publisher().await;
    if subscribe && runtime.client.is_some() {
      let task_runtime = Arc::clone(&runtime);
      *runtime.subscriber.lock().await = Some(tokio::spawn(async move {
        task_runtime.subscribe_loop().await;
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
    self.publisher.lock().await.take();
  }

  pub(super) fn health(&self) -> InvalidationHealth {
    let state = match self.health.state.load(Ordering::Relaxed) {
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

  pub(super) async fn publish(&self, hint: InvalidationHintV1) {
    self.target.invalidate(&hint).await;
    let Ok(payload) = encode_invalidation_v1(&hint) else {
      self.health.publish_failures.fetch_add(1, Ordering::Relaxed);
      return;
    };
    if self.publisher.lock().await.is_none() {
      self.connect_publisher().await;
    }
    let mut publisher = self.publisher.lock().await;
    let Some(connection) = publisher.as_mut() else {
      self.health.publish_failures.fetch_add(1, Ordering::Relaxed);
      return;
    };
    let published = tokio::time::timeout(
      PUBLISH_TIMEOUT,
      redis::cmd("PUBLISH")
        .arg(INVALIDATION_CHANNEL_V1)
        .arg(payload)
        .query_async::<i64>(connection),
    )
    .await;
    if matches!(published, Ok(Ok(_))) {
      self.health.published.fetch_add(1, Ordering::Relaxed);
    } else {
      publisher.take();
      self.health.publish_failures.fetch_add(1, Ordering::Relaxed);
      self.health.state.store(2, Ordering::Relaxed);
    }
  }

  async fn connect_publisher(&self) {
    let Some(client) = self.client.as_ref() else {
      return;
    };
    match tokio::time::timeout(CONNECT_TIMEOUT, client.get_multiplexed_async_connection()).await {
      Ok(Ok(connection)) => {
        *self.publisher.lock().await = Some(connection);
        self.health.state.store(1, Ordering::Relaxed);
      }
      _ => self.health.state.store(2, Ordering::Relaxed),
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
      if pubsub.subscribe(INVALIDATION_CHANNEL_V1).await.is_err() {
        self.degraded_wait(&mut backoff).await;
        continue;
      }
      self.health.state.store(1, Ordering::Relaxed);
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
      self.health.decode_failures.fetch_add(1, Ordering::Relaxed);
      return;
    };
    self.target.invalidate(&hint).await;
    self.health.received.fetch_add(1, Ordering::Relaxed);
  }

  async fn degraded_wait(&self, backoff: &mut Duration) {
    self.health.state.store(2, Ordering::Relaxed);
    self.health.reconnects.fetch_add(1, Ordering::Relaxed);
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
  struct RecordingTarget(TokioMutex<Vec<InvalidationHintV1>>);

  impl InvalidationTarget for RecordingTarget {
    fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
      Box::pin(async move { self.0.lock().await.push(hint.clone()) })
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

  #[tokio::test]
  async fn decode_failure_is_counted_and_duplicate_hints_are_safe() {
    let target = Arc::new(RecordingTarget::default());
    let runtime = InvalidationRuntime::start(&RedisRuntimeConfig::default(), false, target.clone()).await;
    runtime.apply_payload(r#"{"version":1,"kind":"unknown"}"#).await;
    let payload = r#"{"version":1,"kind":"quotaSeatUsage","workspaceId":"workspace"}"#;
    runtime.apply_payload(payload).await;
    runtime.apply_payload(payload).await;

    let health = runtime.health();
    assert_eq!(health.decode_failures, 1);
    assert_eq!(health.received, 2);
    assert_eq!(target.0.lock().await.len(), 2);
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
    assert!(health.reconnects > 0);
    assert_eq!(health.publish_failures, 1);
    assert_eq!(target.0.lock().await.len(), 1);
    tokio::time::timeout(Duration::from_secs(1), runtime.stop())
      .await
      .expect("invalidation shutdown must join the subscriber");
    assert_eq!(Arc::strong_count(&runtime), 1);
  }

  #[tokio::test]
  async fn redis_publisher_subscriber_reconnect_and_decode_contract() {
    let Ok(url) = std::env::var("INVALIDATION_REDIS_URL") else {
      return;
    };
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
      async move { subscriber_target.0.lock().await.len() == 3 }
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
      async move { subscriber_target.0.lock().await.len() == 4 }
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
    tokio::time::sleep(Duration::from_secs(2)).await;
    publisher
      .publish(InvalidationHintV1::QuotaSeatUsage {
        workspace_id: "after-stall".to_string(),
      })
      .await;
    wait_for("message after stalled publisher", || {
      let subscriber_target = Arc::clone(&subscriber_target);
      async move {
        subscriber_target.0.lock().await.iter().any(|hint| {
          matches!(
            hint,
            InvalidationHintV1::QuotaSeatUsage { workspace_id }
              if workspace_id == "after-stall"
          )
        })
      }
    })
    .await;

    assert_eq!(publisher_target.0.lock().await.len(), 6);
    assert!((5..=6).contains(&subscriber_target.0.lock().await.len()));
    subscriber.stop().await;
    publisher.stop().await;
  }
}
