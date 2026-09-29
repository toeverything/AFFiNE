mod loader;

use std::{
  future::Future,
  pin::Pin,
  sync::atomic::{AtomicU64, Ordering},
  time::Duration,
};

use affine_core::{
  cache::{CacheConfig, CacheError, CacheOutcomeKind, GenerationCache},
  invalidation::QuotaCacheKey,
};
use sqlx::PgPool;

use super::{
  invalidation::{InvalidationHintV1, InvalidationTarget},
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
  cache: GenerationCache<K, V>,
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
  fn new(kind: &'static str, deployment: Deployment, telemetry: PermissionTelemetry) -> Self {
    Self {
      cache: GenerationCache::new(CacheConfig {
        hard_ttl: CACHE_TTL,
        max_bytes: CACHE_BYTES,
        max_flights: MAX_FLIGHTS,
      }),
      kind,
      deployment,
      telemetry,
      pending_hits: AtomicU64::new(0),
      pending_misses: AtomicU64::new(0),
    }
  }

  async fn get_or_load<F, Fut>(&self, key: K, bytes: usize, load: F) -> super::RuntimeResult<V>
  where
    F: FnOnce() -> Fut,
    Fut: Future<Output = super::RuntimeResult<V>>,
  {
    let outcome = self
      .cache
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
    self.cache.invalidate(key).await;
    let snapshot = self.cache.snapshot().await;
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
    let snapshot = self.cache.snapshot().await;
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
      entitlements: QuotaCache::new("entitlement", deployment, telemetry.clone()),
      owners: QuotaCache::new("owner", deployment, telemetry.clone()),
      storage: QuotaCache::new("storage", deployment, telemetry.clone()),
      seats: QuotaCache::new("seat", deployment, telemetry),
    }
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
}
