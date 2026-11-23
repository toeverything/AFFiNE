mod loader;

use std::{
  future::Future,
  pin::Pin,
  sync::{
    Arc, RwLock, Weak,
    atomic::{AtomicU64, Ordering},
  },
  time::Duration,
};

use affine_core::{
  cache::{CacheConfig, CacheError, CacheOutcomeKind, GenerationCache},
  invalidation::QuotaCacheKey,
};
use sqlx::PgPool;

use super::{
  invalidation::{InvalidationHintV1, InvalidationRuntime, InvalidationTarget},
  permission::PermissionTelemetry,
  resolve_user_entitlement, resolve_workspace_entitlement,
  types::{RuntimeUserQuotaState, RuntimeWorkspaceQuotaState},
};
use crate::runtime::Deployment;

const CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const CACHE_BYTES: usize = 4 * 1024 * 1024;
const MAX_FLIGHTS: usize = 1_024;
const REQUEST_METRIC_BATCH: u64 = 256;

struct QuotaCache<K, V> {
  cache: RwLock<Arc<GenerationCache<K, V>>>,
  generation: AtomicU64,
  kind: &'static str,
  telemetry: PermissionTelemetry,
  deployment: Deployment,
  pending_hits: AtomicU64,
  pending_misses: AtomicU64,
}

impl<K, V> QuotaCache<K, V>
where
  K: Clone + Eq + std::hash::Hash + Send + 'static,
  V: Clone + Send + 'static,
{
  fn new_inner_cache() -> Arc<GenerationCache<K, V>> {
    Arc::new(GenerationCache::new(CacheConfig {
      hard_ttl: CACHE_TTL,
      max_bytes: CACHE_BYTES,
      max_flights: MAX_FLIGHTS,
    }))
  }

  fn new(kind: &'static str, deployment: Deployment, telemetry: PermissionTelemetry) -> Self {
    Self {
      cache: RwLock::new(Self::new_inner_cache()),
      generation: AtomicU64::new(0),
      kind,
      deployment,
      telemetry,
      pending_hits: AtomicU64::new(0),
      pending_misses: AtomicU64::new(0),
    }
  }

  fn current_cache(&self) -> Arc<GenerationCache<K, V>> {
    self
      .cache
      .read()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
      .clone()
  }

  #[cfg(test)]
  fn generation(&self) -> u64 {
    self.generation.load(Ordering::Acquire)
  }

  #[cfg(test)]
  async fn get_or_load<F, Fut>(&self, key: K, bytes: usize, load: F) -> super::RuntimeResult<V>
  where
    F: FnOnce() -> Fut,
    Fut: Future<Output = super::RuntimeResult<V>>,
  {
    self.get_or_load_with_bypass(false, key, bytes, load).await
  }

  async fn get_or_load_with_bypass<F, Fut>(
    &self,
    bypass: bool,
    key: K,
    bytes: usize,
    load: F,
  ) -> super::RuntimeResult<V>
  where
    F: FnOnce() -> Fut,
    Fut: Future<Output = super::RuntimeResult<V>>,
  {
    if bypass {
      let result = load().await;
      self
        .record("db_load", if result.is_ok() { "success" } else { "error" })
        .await;
      self.record("request", "miss").await;
      return result;
    }
    let cache = self.current_cache();
    let outcome = cache
      .get_or_load(key, bytes, || async {
        let result = load().await;
        self
          .record("db_load", if result.is_ok() { "success" } else { "error" })
          .await;
        result
      })
      .await;
    self
      .record(
        "request",
        if outcome
          .as_ref()
          .is_ok_and(|outcome| outcome.kind == CacheOutcomeKind::Hit)
        {
          "hit"
        } else {
          "miss"
        },
      )
      .await;
    match outcome {
      Ok(outcome) => Ok(outcome.value),
      Err(CacheError::Loader(error)) => Err(error),
      Err(CacheError::FlightLimit) => Err(super::RuntimeError::invalid_state("quota_cache_flight_limit")),
    }
  }

  async fn invalidate(&self, key: &K) {
    let cache = self.current_cache();
    cache.invalidate(key).await;
    let snapshot = cache.snapshot().await;
    self
      .telemetry
      .quota_cache(self.deployment, self.kind, "invalidation", "applied", 1, snapshot);
  }

  async fn invalidate_all(&self) {
    self.generation.fetch_add(1, Ordering::AcqRel);
    let fresh = Self::new_inner_cache();
    {
      let mut guard = self.cache.write().unwrap_or_else(|poisoned| poisoned.into_inner());
      *guard = Arc::clone(&fresh);
    }
    let snapshot = fresh.snapshot().await;
    self
      .telemetry
      .quota_cache(self.deployment, self.kind, "invalidation", "applied", 1, snapshot);
  }

  async fn record(&self, event: &'static str, result: &'static str) {
    if event == "request" {
      let pending = if result == "hit" {
        &self.pending_hits
      } else {
        &self.pending_misses
      };
      if pending.fetch_add(1, Ordering::Relaxed) + 1 < REQUEST_METRIC_BATCH {
        return;
      }
      let count = pending.swap(0, Ordering::Relaxed);
      if count > 0 {
        self.emit(event, result, count).await;
      }
      return;
    }
    self.emit(event, result, 1).await;
  }

  async fn emit(&self, event: &'static str, result: &'static str, count: u64) {
    let snapshot = self.current_cache().snapshot().await;
    self
      .telemetry
      .quota_cache(self.deployment, self.kind, event, result, count, snapshot);
  }

  async fn flush_metrics(&self) {
    for (result, pending) in [("hit", &self.pending_hits), ("miss", &self.pending_misses)] {
      let count = pending.swap(0, Ordering::Relaxed);
      if count > 0 {
        self.emit("request", result, count).await;
      }
    }
  }
}

pub(super) struct QuotaReadCache {
  pool: PgPool,
  deployment: Deployment,
  invalidation: RwLock<Weak<InvalidationRuntime>>,
  entitlements: QuotaCache<QuotaCacheKey, loader::EntitlementValue>,
  owners: QuotaCache<QuotaCacheKey, String>,
  storage: QuotaCache<QuotaCacheKey, i64>,
  seats: QuotaCache<QuotaCacheKey, loader::SeatUsage>,
}

impl QuotaReadCache {
  pub(super) fn new(pool: PgPool, deployment: Deployment, telemetry: PermissionTelemetry) -> Self {
    Self {
      pool,
      deployment,
      invalidation: RwLock::new(Weak::new()),
      entitlements: QuotaCache::new("entitlement", deployment, telemetry.clone()),
      owners: QuotaCache::new("owner", deployment, telemetry.clone()),
      storage: QuotaCache::new("storage", deployment, telemetry.clone()),
      seats: QuotaCache::new("seat", deployment, telemetry),
    }
  }

  pub(super) fn attach_invalidation(&self, invalidation: &Arc<InvalidationRuntime>) {
    let mut guard = self
      .invalidation
      .write()
      .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Arc::downgrade(invalidation);
  }

  pub(super) fn is_degraded(&self) -> bool {
    self
      .invalidation
      .read()
      .ok()
      .and_then(|weak| weak.upgrade())
      .is_some_and(|runtime| runtime.is_degraded())
  }

  pub(super) async fn user_state(&self, user_id: &str) -> super::RuntimeResult<RuntimeUserQuotaState> {
    loader::user_state(self, user_id).await
  }

  pub(super) async fn workspace_state(&self, workspace_id: &str) -> super::RuntimeResult<RuntimeWorkspaceQuotaState> {
    loader::workspace_state(self, workspace_id).await
  }

  pub(super) async fn flush_metrics(&self) {
    self.entitlements.flush_metrics().await;
    self.owners.flush_metrics().await;
    self.storage.flush_metrics().await;
    self.seats.flush_metrics().await;
  }
}

impl InvalidationTarget for QuotaReadCache {
  fn invalidate<'a>(&'a self, hint: &'a InvalidationHintV1) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
      match hint.quota_key() {
        Some(key @ QuotaCacheKey::Entitlement(_)) => self.entitlements.invalidate(&key).await,
        Some(key @ QuotaCacheKey::OwnerMapping(_)) => self.owners.invalidate(&key).await,
        Some(key @ QuotaCacheKey::StorageUsage(_)) => self.storage.invalidate(&key).await,
        Some(key @ QuotaCacheKey::SeatUsage(_)) => self.seats.invalidate(&key).await,
        None => {}
      }
    })
  }

  fn invalidate_all<'a>(&'a self) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
      self.entitlements.invalidate_all().await;
      self.owners.invalidate_all().await;
      self.storage.invalidate_all().await;
      self.seats.invalidate_all().await;
    })
  }
}

#[cfg(test)]
#[path = "tests.rs"]
mod integration_tests;

#[cfg(test)]
mod tests {
  use std::sync::{Arc, Mutex};

  use super::QuotaCache;
  use crate::runtime::{
    Deployment,
    backend_runtime::permission::{PermissionTelemetry, PermissionTelemetryEvent},
  };

  #[tokio::test]
  async fn request_metrics_remain_batched() {
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
    let cache = QuotaCache::new("storage", Deployment::Cloud, telemetry);
    cache.get_or_load("batched", 8, || async { Ok(1) }).await.unwrap();
    for _ in 0..299 {
      cache.get_or_load("batched", 8, || async { Ok(2) }).await.unwrap();
    }
    cache.flush_metrics().await;
    let request_counts = events
      .lock()
      .unwrap()
      .iter()
      .filter_map(|event| match event {
        PermissionTelemetryEvent::QuotaCache {
          event: "request",
          result,
          count,
          ..
        } => Some((*result, *count)),
        _ => None,
      })
      .collect::<Vec<_>>();
    assert_eq!(request_counts, [("hit", 256), ("hit", 43), ("miss", 1)]);
  }

  #[tokio::test]
  async fn invalidate_all_clears_cache_and_prevents_inflight_stale_writeback() {
    let cache = Arc::new(QuotaCache::new(
      "entitlement",
      Deployment::Cloud,
      PermissionTelemetry::default(),
    ));
    let started = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());

    let slow_cache = Arc::clone(&cache);
    let slow_started = Arc::clone(&started);
    let slow_release = Arc::clone(&release);
    let inflight = tokio::spawn(async move {
      slow_cache
        .get_or_load("ws-1", 16, || async move {
          slow_started.notify_one();
          slow_release.notified().await;
          Ok("stale-v1")
        })
        .await
        .unwrap()
    });

    started.notified().await;
    assert_eq!(cache.generation(), 0);
    cache.invalidate_all().await;
    assert_eq!(cache.generation(), 1);
    release.notify_one();
    assert_eq!(inflight.await.unwrap(), "stale-v1");

    // A read after invalidate_all must NOT observe the stale in-flight
    // writeback.
    let fresh = cache
      .get_or_load("ws-1", 16, || async { Ok("fresh-v2") })
      .await
      .unwrap();
    assert_eq!(fresh, "fresh-v2");
  }

  #[tokio::test]
  async fn degraded_bypass_reads_fresh_value_without_serving_cache() {
    let cache = QuotaCache::new("seat", Deployment::Cloud, PermissionTelemetry::default());
    assert_eq!(cache.get_or_load("ws-2", 8, || async { Ok(1) }).await.unwrap(), 1);
    // Normal read serves cached value.
    assert_eq!(cache.get_or_load("ws-2", 8, || async { Ok(2) }).await.unwrap(), 1);
    // Degraded bypass skips cache and hits loader directly.
    assert_eq!(
      cache
        .get_or_load_with_bypass(true, "ws-2", 8, || async { Ok(3) })
        .await
        .unwrap(),
      3
    );
    assert_eq!(
      cache
        .get_or_load_with_bypass(true, "ws-2", 8, || async { Ok(4) })
        .await
        .unwrap(),
      4
    );
  }
}
