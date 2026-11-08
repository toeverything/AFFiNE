use std::{
  collections::{HashMap, VecDeque},
  future::Future,
  sync::Arc,
  time::{Duration, Instant},
};

use affine_doc_loader::blob_refs::{MAX_SOURCE_BINARY_BYTES, live_blob_keys};
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

use super::{SourceIdentity, types::LoadedSource};
use crate::runtime::{
  RuntimeError, RuntimeResult, backend_runtime::permission::PermissionTelemetry, blob_ref_projection_error_code,
};

const DEFAULT_MAX_BYTES: usize = 64 * 1024 * 1024;
const HARD_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Clone)]
struct Entry {
  stamp: Box<str>,
  keys: Arc<[Box<str>]>,
  bytes: usize,
  inserted_at: Instant,
  generation: u64,
}

#[derive(Default)]
struct State {
  entries: HashMap<SourceIdentity, Entry>,
  lru: VecDeque<SourceIdentity>,
  bytes: usize,
  generation: HashMap<SourceIdentity, u64>,
  flights: HashMap<(SourceIdentity, String), Arc<Flight>>,
}

struct Flight {
  gate: Mutex<()>,
  generation: u64,
  _admission: OwnedSemaphorePermit,
}

pub(super) struct BlobRefCache {
  state: Mutex<State>,
  parse_slots: Arc<Semaphore>,
  admission: Arc<Semaphore>,
  max_bytes: usize,
  telemetry: PermissionTelemetry,
}

impl Default for BlobRefCache {
  fn default() -> Self {
    let parallelism = std::thread::available_parallelism().map_or(1, usize::from).max(1);
    Self {
      state: Mutex::new(State::default()),
      parse_slots: Arc::new(Semaphore::new(parallelism)),
      admission: Arc::new(Semaphore::new(parallelism.saturating_mul(8))),
      max_bytes: DEFAULT_MAX_BYTES,
      telemetry: Default::default(),
    }
  }
}

impl BlobRefCache {
  pub(super) fn new(telemetry: PermissionTelemetry) -> Self {
    Self {
      telemetry,
      ..Default::default()
    }
  }

  #[cfg(test)]
  pub(super) fn with_limits(max_bytes: usize, parse_slots: usize, queue: usize) -> Self {
    Self {
      state: Mutex::new(State::default()),
      parse_slots: Arc::new(Semaphore::new(parse_slots.max(1))),
      admission: Arc::new(Semaphore::new(queue.max(1))),
      max_bytes,
      telemetry: Default::default(),
    }
  }

  pub(super) async fn refs<F, Fut>(&self, source: LoadedSource, confirm: F) -> RuntimeResult<Arc<[Box<str>]>>
  where
    F: FnOnce() -> Fut,
    Fut: Future<Output = RuntimeResult<()>>,
  {
    if source.blob.len() > MAX_SOURCE_BINARY_BYTES {
      return Err(RuntimeError::invalid_state("blob_ref_source_too_large"));
    }
    let LoadedSource { identity, stamp, blob } = source;
    if let Some(keys) = self.hit(&identity, &stamp).await {
      self.record("request", "hit").await;
      return Ok(keys);
    }
    self.record("request", "miss").await;
    let flight = if let Some(flight) = self
      .state
      .lock()
      .await
      .flights
      .get(&(identity.clone(), stamp.clone()))
      .cloned()
    {
      flight
    } else {
      match self.admission.clone().try_acquire_owned() {
        Ok(admission) => {
          let mut state = self.state.lock().await;
          let generation = state.generation.get(&identity).copied().unwrap_or_default();
          match state.flights.entry((identity.clone(), stamp.clone())) {
            std::collections::hash_map::Entry::Occupied(entry) => Arc::clone(entry.get()),
            std::collections::hash_map::Entry::Vacant(entry) => Arc::clone(entry.insert(Arc::new(Flight {
              gate: Mutex::new(()),
              generation,
              _admission: admission,
            }))),
          }
        }
        Err(_) => {
          let flight = self
            .state
            .lock()
            .await
            .flights
            .get(&(identity.clone(), stamp.clone()))
            .cloned();
          let Some(flight) = flight else {
            self.record("parse", "overload").await;
            return Err(RuntimeError::invalid_state("blob_ref_parse_overloaded"));
          };
          flight
        }
      }
    };
    let _flight = flight.gate.lock().await;
    if let Some(keys) = self.hit(&identity, &stamp).await {
      self.remove_flight(&identity, &stamp, &flight).await;
      return Ok(keys);
    }
    let Ok(_parse) = self.parse_slots.clone().acquire_owned().await else {
      self.remove_flight(&identity, &stamp, &flight).await;
      return Err(RuntimeError::invalid_state("blob_ref_parse_unavailable"));
    };
    let workspace_root = identity.is_workspace_root();
    let parsed = tokio::task::spawn_blocking(move || live_blob_keys(blob, workspace_root)).await;
    drop(_parse);
    let (keys, parser) = match parsed {
      Ok(Ok((keys, parser))) => (Arc::<[Box<str>]>::from(keys), parser),
      Ok(Err(error)) => {
        let reason = blob_ref_projection_error_code(error);
        self.remove_flight(&identity, &stamp, &flight).await;
        self.record("parse", reason).await;
        return Err(RuntimeError::invalid_state(reason));
      }
      Err(_) => {
        self.remove_flight(&identity, &stamp, &flight).await;
        self.record("parse", "parse_task_failed").await;
        return Err(RuntimeError::invalid_state("parse_task_failed"));
      }
    };
    self.record("parse", parser.label()).await;
    let result = confirm().await;
    if result.is_ok() {
      self
        .install(&identity, &stamp, flight.generation, Arc::clone(&keys))
        .await;
    }
    self.remove_flight(&identity, &stamp, &flight).await;
    result.map(|()| keys)
  }

  async fn hit(&self, source: &SourceIdentity, stamp: &str) -> Option<Arc<[Box<str>]>> {
    let mut state = self.state.lock().await;
    let generation = state.generation.get(source).copied().unwrap_or_default();
    let valid = state.entries.get(source).is_some_and(|entry| {
      entry.stamp.as_ref() == stamp && entry.generation == generation && entry.inserted_at.elapsed() < HARD_TTL
    });
    if !valid {
      if let Some(entry) = state.entries.remove(source) {
        state.bytes = state.bytes.saturating_sub(entry.bytes);
      }
      state.lru.retain(|candidate| candidate != source);
      prune_generation(&mut state, source);
      return None;
    }
    let keys = Arc::clone(&state.entries.get(source)?.keys);
    state.lru.retain(|candidate| candidate != source);
    state.lru.push_back(source.clone());
    Some(keys)
  }

  async fn install(&self, source: &SourceIdentity, stamp: &str, generation: u64, keys: Arc<[Box<str>]>) {
    let mut state = self.state.lock().await;
    if state.generation.get(source).copied().unwrap_or_default() != generation {
      return;
    }
    let identity_bytes = source.workspace_id().len() + source.doc_id().len() + std::mem::size_of::<SourceIdentity>();
    let bytes = identity_bytes
      + stamp.len()
      + keys
        .iter()
        .map(|key| key.len() + std::mem::size_of::<Box<str>>())
        .sum::<usize>()
      + std::mem::size_of::<Entry>();
    if bytes > self.max_bytes {
      return;
    }
    if let Some(entry) = state.entries.remove(source) {
      state.bytes = state.bytes.saturating_sub(entry.bytes);
    }
    state.lru.retain(|candidate| candidate != source);
    state.entries.insert(
      source.clone(),
      Entry {
        stamp: stamp.into(),
        keys,
        bytes,
        inserted_at: Instant::now(),
        generation,
      },
    );
    state.lru.push_back(source.clone());
    state.bytes += bytes;
    while state.bytes > self.max_bytes {
      let Some(candidate) = state.lru.pop_front() else {
        break;
      };
      if let Some(entry) = state.entries.remove(&candidate) {
        state.bytes = state.bytes.saturating_sub(entry.bytes);
      }
      prune_generation(&mut state, &candidate);
    }
  }

  async fn remove_flight(&self, source: &SourceIdentity, stamp: &str, flight: &Arc<Flight>) {
    let mut state = self.state.lock().await;
    let key = (source.clone(), stamp.to_string());
    if state
      .flights
      .get(&key)
      .is_some_and(|current| Arc::ptr_eq(current, flight))
    {
      state.flights.remove(&key);
    }
    prune_generation(&mut state, source);
  }

  async fn record(&self, event: &'static str, result: &'static str) {
    let state = self.state.lock().await;
    self
      .telemetry
      .blob_ref_cache(event, result, state.entries.len(), state.bytes);
  }

  pub(super) async fn invalidate(&self, source: &SourceIdentity) {
    let mut state = self.state.lock().await;
    *state.generation.entry(source.clone()).or_default() += 1;
    if let Some(entry) = state.entries.remove(source) {
      state.bytes = state.bytes.saturating_sub(entry.bytes);
    }
    state.lru.retain(|candidate| candidate != source);
    prune_generation(&mut state, source);
  }

  #[cfg(test)]
  async fn bytes(&self) -> usize {
    self.state.lock().await.bytes
  }

  #[cfg(test)]
  async fn flights(&self) -> usize {
    self.state.lock().await.flights.len()
  }

  #[cfg(test)]
  async fn generations(&self) -> usize {
    self.state.lock().await.generation.len()
  }
}

fn prune_generation(state: &mut State, source: &SourceIdentity) {
  if !state.entries.contains_key(source) && !state.flights.keys().any(|(candidate, _)| candidate == source) {
    state.generation.remove(source);
  }
}

#[cfg(test)]
mod tests {
  use y_octo::{Any, Doc};

  use super::*;

  fn loaded_source(stamp: &str, key: &str) -> LoadedSource {
    LoadedSource {
      identity: SourceIdentity::CurrentDoc {
        workspace_id: "workspace".to_string(),
        doc_id: "doc".to_string(),
      },
      stamp: stamp.to_string(),
      blob: affine_doc_loader::build_full_doc("Doc", &format!("![image](blob://{key})"), "doc").unwrap(),
    }
  }

  #[tokio::test]
  async fn parsed_refs_install_only_after_stamp_and_generation_confirmation() {
    let cache = BlobRefCache::with_limits(4096, 1, 1);
    let source = loaded_source("stamp-1", "blob-1");
    let refs = cache
      .refs(source.clone(), || async {
        cache.invalidate(&source.identity).await;
        Ok(())
      })
      .await
      .unwrap();
    assert_eq!(refs[0].as_ref(), "blob-1");
    assert_eq!(cache.bytes().await, 0);
    assert_eq!(cache.flights().await, 0);
    assert_eq!(cache.generations().await, 0);
    assert!(cache.hit(&source.identity, &source.stamp).await.is_none());

    let current = loaded_source("stamp-2", "blob-2");
    cache.refs(current.clone(), || async { Ok(()) }).await.unwrap();
    assert!(cache.bytes().await > 0);
    assert_eq!(
      cache.hit(&current.identity, &current.stamp).await.unwrap()[0].as_ref(),
      "blob-2"
    );

    let mut detached = loaded_source("detached", "live");
    let mut doc = Doc::default();
    doc.apply_update_from_binary_v1(&detached.blob).unwrap();
    let mut blocks = doc.get_map("blocks").unwrap();
    let mut block = doc.create_map().unwrap();
    block
      .insert("sys:id".to_string(), Any::String("detached".to_string()))
      .unwrap();
    block
      .insert("sys:flavour".to_string(), Any::String("affine:image".to_string()))
      .unwrap();
    block
      .insert("prop:sourceId".to_string(), Any::String("detached-key".to_string()))
      .unwrap();
    blocks.insert("detached".to_string(), block).unwrap();
    detached.blob = doc.encode_update_v1().unwrap();
    let refs = cache.refs(detached.clone(), || async { Ok(()) }).await.unwrap();
    assert_eq!(refs.iter().map(AsRef::as_ref).collect::<Vec<&str>>(), ["live"]);

    blocks
      .values()
      .filter_map(|value| value.to_map())
      .find(|block| {
        block.get("sys:flavour").and_then(|value| value.to_any()) == Some(Any::String("affine:page".to_string()))
      })
      .unwrap()
      .get("sys:children")
      .and_then(|value| value.to_array())
      .unwrap()
      .push(Any::String("missing".to_string()))
      .unwrap();
    detached.stamp = "missing".to_string();
    detached.blob = doc.encode_update_v1().unwrap();
    let refs = cache.refs(detached, || async { Ok(()) }).await.unwrap();
    assert_eq!(refs.iter().map(AsRef::as_ref).collect::<Vec<&str>>(), ["live"]);
  }

  #[tokio::test]
  async fn byte_lru_evicts_whole_source_entries() {
    let first = loaded_source("stamp-1", "blob-1");
    let sizing_cache = BlobRefCache::with_limits(4096, 1, 1);
    sizing_cache.refs(first.clone(), || async { Ok(()) }).await.unwrap();
    let one_entry = sizing_cache.bytes().await;
    let cache = BlobRefCache::with_limits(one_entry + one_entry / 2, 1, 1);
    cache.refs(first.clone(), || async { Ok(()) }).await.unwrap();

    let mut second = loaded_source("stamp-2", "blob-2");
    second.identity = SourceIdentity::CurrentDoc {
      workspace_id: "workspace".to_string(),
      doc_id: "doc-2".to_string(),
    };
    cache.refs(second.clone(), || async { Ok(()) }).await.unwrap();

    assert!(cache.bytes().await <= one_entry + one_entry / 2);
    assert!(cache.hit(&first.identity, &first.stamp).await.is_none());
    assert!(cache.hit(&second.identity, &second.stamp).await.is_some());
  }

  #[tokio::test]
  async fn byte_lru_prunes_generation_after_entry_eviction() {
    let first = loaded_source("old", "blob-1");
    let sizing_cache = BlobRefCache::with_limits(4096, 1, 1);
    sizing_cache.refs(first.clone(), || async { Ok(()) }).await.unwrap();
    let one_entry = sizing_cache.bytes().await;
    let cache = Arc::new(BlobRefCache::with_limits(one_entry + one_entry / 2, 2, 2));
    let confirmation_started = Arc::new(tokio::sync::Notify::new());
    let release_confirmation = Arc::new(tokio::sync::Notify::new());
    let old_task = {
      let cache = Arc::clone(&cache);
      let first = first.clone();
      let confirmation_started = Arc::clone(&confirmation_started);
      let release_confirmation = Arc::clone(&release_confirmation);
      tokio::spawn(async move {
        cache
          .refs(first, || async {
            confirmation_started.notify_one();
            release_confirmation.notified().await;
            Ok(())
          })
          .await
      })
    };
    confirmation_started.notified().await;
    cache.invalidate(&first.identity).await;

    let current = loaded_source("current", "blob-1");
    cache.refs(current.clone(), || async { Ok(()) }).await.unwrap();
    release_confirmation.notify_one();
    old_task.await.unwrap().unwrap();
    assert_eq!(cache.generations().await, 1);

    let mut second = loaded_source("stamp-2", "blob-2");
    second.identity = SourceIdentity::CurrentDoc {
      workspace_id: "workspace".to_string(),
      doc_id: "doc-2".to_string(),
    };
    cache.refs(second.clone(), || async { Ok(()) }).await.unwrap();

    assert!(cache.hit(&current.identity, &current.stamp).await.is_none());
    assert!(cache.hit(&second.identity, &second.stamp).await.is_some());
    assert_eq!(cache.generations().await, 0);
  }

  #[tokio::test]
  async fn concurrent_misses_share_one_parsed_result() {
    let cache = Arc::new(BlobRefCache::with_limits(4096, 1, 1));
    let source = loaded_source("stamp", "blob");
    let confirmation_started = Arc::new(tokio::sync::Notify::new());
    let release_confirmation = Arc::new(tokio::sync::Notify::new());
    let left = {
      let cache = Arc::clone(&cache);
      let source = source.clone();
      let confirmation_started = Arc::clone(&confirmation_started);
      let release_confirmation = Arc::clone(&release_confirmation);
      tokio::spawn(async move {
        cache
          .refs(source, || async {
            confirmation_started.notify_one();
            release_confirmation.notified().await;
            Ok(())
          })
          .await
      })
    };
    confirmation_started.notified().await;
    let right = {
      let cache = Arc::clone(&cache);
      let source = source.clone();
      tokio::spawn(async move { cache.refs(source, || async { Ok(()) }).await })
    };
    tokio::task::yield_now().await;
    assert_eq!(cache.flights().await, 1);
    release_confirmation.notify_one();
    let left = left.await.unwrap().unwrap();
    let right = right.await.unwrap().unwrap();
    assert!(Arc::ptr_eq(&left, &right));
    assert!(cache.hit(&source.identity, &source.stamp).await.is_some());
    assert_eq!(cache.flights().await, 0);
  }

  #[tokio::test]
  async fn rejected_confirmations_do_not_accumulate_flights_or_cache_bytes() {
    let cache = BlobRefCache::with_limits(512, 1, 2);
    for index in 0..32 {
      let source = loaded_source(&format!("stamp-{index}"), &format!("blob-{index}"));
      assert!(
        cache
          .refs(source, || async { Err(RuntimeError::invalid_state("stamp_changed")) })
          .await
          .is_err()
      );
    }
    assert_eq!(cache.flights().await, 0);
    assert_eq!(cache.bytes().await, 0);
  }

  #[tokio::test]
  async fn oversized_source_is_rejected_before_flight_admission() {
    let cache = BlobRefCache::with_limits(4096, 1, 8);
    let mut source = loaded_source("stamp", "blob");
    source.blob = vec![0; MAX_SOURCE_BINARY_BYTES + 1];

    let error = cache.refs(source, || async { Ok(()) }).await.unwrap_err();

    assert_eq!(error.to_string(), "blob_ref_source_too_large");
    assert_eq!(cache.flights().await, 0);
    assert_eq!(cache.bytes().await, 0);
  }

  #[tokio::test]
  async fn distinct_flights_are_bounded_before_entering_the_map() {
    let cache = Arc::new(BlobRefCache::with_limits(4096, 1, 1));
    let first = loaded_source("stamp-1", "blob-1");
    let mut second = loaded_source("stamp-2", "blob-2");
    second.identity = SourceIdentity::CurrentDoc {
      workspace_id: "workspace".to_string(),
      doc_id: "doc-2".to_string(),
    };
    let confirmation_started = Arc::new(tokio::sync::Notify::new());
    let release_confirmation = Arc::new(tokio::sync::Notify::new());
    let first_task = {
      let cache = Arc::clone(&cache);
      let confirmation_started = Arc::clone(&confirmation_started);
      let release_confirmation = Arc::clone(&release_confirmation);
      tokio::spawn(async move {
        cache
          .refs(first, || async {
            confirmation_started.notify_one();
            release_confirmation.notified().await;
            Ok(())
          })
          .await
      })
    };
    confirmation_started.notified().await;

    let error = cache.refs(second, || async { Ok(()) }).await.unwrap_err();
    assert_eq!(error.to_string(), "blob_ref_parse_overloaded");
    assert_eq!(cache.flights().await, 1);

    release_confirmation.notify_one();
    first_task.await.unwrap().unwrap();
    assert_eq!(cache.flights().await, 0);
  }
}
