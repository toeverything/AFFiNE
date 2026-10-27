use std::{
  collections::{HashMap, HashSet, VecDeque},
  fs,
  path::{Path, PathBuf},
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
  time::{Duration, Instant, SystemTime},
};

use affine_doc_loader::{
  MarkdownMergeRequest, build_full_doc, export_markdown_source, merge_markdown, parse_doc_to_markdown,
};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use tokio::{sync::Mutex, task::JoinHandle};

use super::{
  DiskDocClock, DiskDocUpdateInput, DiskSessionOptions, DiskSyncDocUpdateEvent, DiskSyncEvent,
  frontmatter::{normalize_tags, parse_frontmatter, render_frontmatter},
  root_meta::{build_root_meta_update, extract_all_root_meta, extract_root_meta_for_doc},
  state_db::StateDb,
  types::{FrontmatterMeta, SourceCheckpoint},
  utils::{
    collect_markdown_files, derive_title_from_markdown, derive_title_from_path, generate_missing_doc_id, hash_meta,
    hash_string, is_empty_update, merge_frontend_update_binary, merge_root_update_binary, merge_update_binary,
    now_naive, paths_equal, same_update_state, sanitize_file_stem, write_new_file,
  },
};

mod source_export;
mod source_import;
mod source_scan;

enum PageExportError {
  Unexportable(String),
  Failed(String),
}

impl From<String> for PageExportError {
  fn from(message: String) -> Self {
    Self::Failed(message)
  }
}

type DiskEventCallback = ThreadsafeFunction<DiskSyncEvent, ()>;
const FULL_SCAN_INTERVAL: Duration = Duration::from_secs(5);

impl std::fmt::Display for PageExportError {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Unexportable(message) | Self::Failed(message) => formatter.write_str(message),
    }
  }
}

enum SourcePreparation {
  Awaiting(PathBuf),
  Ready,
}

#[derive(Default)]
struct ScanCache {
  files: HashMap<PathBuf, (SystemTime, u64)>,
  last_full_scan: Option<Instant>,
}

#[derive(Clone)]
pub(crate) struct DiskSession {
  workspace_id: String,
  sync_folder: PathBuf,
  state_db: StateDb,
  events: Arc<Mutex<VecDeque<DiskSyncEvent>>>,
  docs: Arc<Mutex<HashMap<String, Vec<u8>>>>,
  root_doc: Arc<Mutex<Vec<u8>>>,
  discovered_root_docs: Arc<Mutex<HashSet<String>>>,
  bindings: Arc<Mutex<HashMap<String, PathBuf>>>,
  path_bindings: Arc<Mutex<HashMap<PathBuf, String>>>,
  checkpoints: Arc<Mutex<HashMap<String, SourceCheckpoint>>>,
  source_preparation: Arc<Mutex<HashMap<String, SourcePreparation>>>,
  missing_logged: Arc<Mutex<HashSet<PathBuf>>>,
  subscribers: Arc<Mutex<HashMap<u64, Arc<DiskEventCallback>>>>,
  poll_task: Arc<Mutex<Option<JoinHandle<()>>>>,
  closed: Arc<AtomicBool>,
  scan_guard: Arc<Mutex<()>>,
  scan_cache: Arc<Mutex<ScanCache>>,
}

impl DiskSession {
  async fn doc_id_for_unmarked_file(&self, file_path: &Path) -> String {
    if let Some(id) = self.path_bindings.lock().await.get(file_path).cloned() {
      return id;
    }
    self
      .source_preparation
      .lock()
      .await
      .iter()
      .find_map(|(id, state)| match state {
        SourcePreparation::Awaiting(path) if paths_equal(path, file_path) => Some(id.clone()),
        _ => None,
      })
      .unwrap_or_else(|| generate_missing_doc_id(file_path))
  }

  fn write_candidate(&self, doc_id: &str, content: &str) -> Result<PathBuf, String> {
    let candidate = self
      .sync_folder
      .join(".affine-sync")
      .join("candidates")
      .join(format!("{}.md", hash_string(&format!("{doc_id}\0{content}"))));
    if candidate.exists() {
      if fs::read_to_string(&candidate)
        .map_err(|err| format!("failed to read candidate {}: {}", candidate.display(), err))?
        != content
      {
        return Err(format!("candidate {} was changed externally", candidate.display()));
      }
    } else {
      write_new_file(&candidate, content)?;
    }
    Ok(candidate)
  }

  pub(crate) async fn new(options: DiskSessionOptions) -> Result<Self, String> {
    let sync_folder = PathBuf::from(&options.sync_folder);
    fs::create_dir_all(&sync_folder)
      .map_err(|err| format!("failed to create sync folder {}: {}", sync_folder.display(), err))?;

    let state_db = StateDb::open(&sync_folder, &options.workspace_id).await?;
    let bindings = state_db.load_bindings().await?;
    let checkpoints = state_db.load_source_checkpoints().await?;
    let root_doc = state_db.load_root_snapshot().await?;
    let docs = checkpoints
      .iter()
      .map(|(doc_id, checkpoint)| (doc_id.clone(), checkpoint.snapshot.clone()))
      .collect();

    let mut path_bindings = HashMap::new();
    for (doc_id, file_path) in &bindings {
      path_bindings.insert(file_path.clone(), doc_id.clone());
    }

    Ok(Self {
      workspace_id: options.workspace_id,
      sync_folder,
      state_db,
      events: Arc::new(Mutex::new(VecDeque::new())),
      docs: Arc::new(Mutex::new(docs)),
      root_doc: Arc::new(Mutex::new(root_doc)),
      discovered_root_docs: Arc::new(Mutex::new(HashSet::new())),
      bindings: Arc::new(Mutex::new(bindings)),
      path_bindings: Arc::new(Mutex::new(path_bindings)),
      checkpoints: Arc::new(Mutex::new(checkpoints)),
      source_preparation: Arc::new(Mutex::new(HashMap::new())),
      missing_logged: Arc::new(Mutex::new(HashSet::new())),
      subscribers: Arc::new(Mutex::new(HashMap::new())),
      poll_task: Arc::new(Mutex::new(None)),
      closed: Arc::new(AtomicBool::new(false)),
      scan_guard: Arc::new(Mutex::new(())),
      scan_cache: Arc::new(Mutex::new(ScanCache::default())),
    })
  }

  pub(crate) async fn close(&self) {
    self.closed.store(true, Ordering::Relaxed);
    self.stop_poll_task().await;
    self.subscribers.lock().await.clear();
    self.state_db.close().await;
  }

  pub(crate) async fn add_subscriber(&self, subscriber_id: u64, callback: DiskEventCallback) -> Result<(), String> {
    let callback = Arc::new(callback);

    {
      let mut subscribers = self.subscribers.lock().await;
      let mut events = self.events.lock().await;
      for event in events.drain(..) {
        let _ = callback.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
      }
      subscribers.insert(subscriber_id, callback);
    }

    self.ensure_poll_task().await;
    Ok(())
  }

  pub(crate) async fn remove_subscriber(&self, subscriber_id: u64) {
    let should_stop = {
      let mut subscribers = self.subscribers.lock().await;
      subscribers.remove(&subscriber_id);
      subscribers.is_empty()
    };

    if should_stop {
      self.stop_poll_task().await;
    }
  }

  async fn ensure_poll_task(&self) {
    if self.closed.load(Ordering::Relaxed) {
      return;
    }

    let has_subscribers = {
      let subscribers = self.subscribers.lock().await;
      !subscribers.is_empty()
    };
    if !has_subscribers {
      return;
    }

    let mut poll_task = self.poll_task.lock().await;
    if poll_task.is_some() {
      return;
    }

    let poll_interval_ms = std::env::var("AFFINE_DISK_POLL_INTERVAL_MS")
      .ok()
      .and_then(|value| value.parse::<u64>().ok())
      .filter(|value| *value > 0)
      .unwrap_or(500);

    let session = self.clone();
    *poll_task = Some(tokio::spawn(async move {
      let mut interval = tokio::time::interval(Duration::from_millis(poll_interval_ms));
      loop {
        interval.tick().await;

        if session.closed.load(Ordering::Relaxed) {
          break;
        }

        let has_subscribers = {
          let subscribers = session.subscribers.lock().await;
          !subscribers.is_empty()
        };
        if !has_subscribers {
          break;
        }

        if let Err(err) = session.scan_once().await {
          session.queue_error_event(err).await;
        }
      }
    }));
  }

  async fn stop_poll_task(&self) {
    let mut poll_task = self.poll_task.lock().await;
    if let Some(handle) = poll_task.take() {
      handle.abort();
    }
  }

  async fn emit_event(&self, event: DiskSyncEvent) {
    let subscribers = self.subscribers.lock().await;
    if subscribers.is_empty() {
      let mut events = self.events.lock().await;
      events.push_back(event);
      return;
    }

    for callback in subscribers.values() {
      let _ = callback.call(Ok(event.clone()), ThreadsafeFunctionCallMode::NonBlocking);
    }
  }

  async fn queue_error_event(&self, message: impl Into<String>) {
    let message = message.into();
    self
      .emit_event(DiskSyncEvent {
        r#type: "error".to_string(),
        update: None,
        doc_id: None,
        timestamp: Some(now_naive()),
        origin: None,
        message: Some(message),
      })
      .await;
  }

  async fn queue_doc_update_event(&self, update: DiskSyncDocUpdateEvent, origin: Option<String>) {
    self
      .emit_event(DiskSyncEvent {
        r#type: "doc-update".to_string(),
        doc_id: Some(update.doc_id.clone()),
        timestamp: Some(update.timestamp),
        update: Some(update),
        origin,
        message: None,
      })
      .await;
  }

  async fn discover_root_docs(&self, root: &[u8]) -> Result<(), String> {
    let projection = affine_doc_loader::project_workspace_root(root.to_vec(), true)
      .map_err(|err| format!("failed to project root docs: {err}"))?;
    let mut discovered = self.discovered_root_docs.lock().await;
    for doc_id in projection.doc_ids {
      if doc_id == self.workspace_id || !discovered.insert(doc_id.clone()) {
        continue;
      }
      self
        .emit_event(DiskSyncEvent {
          r#type: "root-doc-discovered".to_string(),
          update: None,
          doc_id: Some(doc_id),
          timestamp: None,
          origin: None,
          message: None,
        })
        .await;
    }
    Ok(())
  }

  #[cfg(test)]
  pub(crate) async fn pull_events(&self) -> Result<Vec<DiskSyncEvent>, String> {
    if let Err(err) = self.scan_once().await {
      self.queue_error_event(err).await;
    }

    let mut events = self.events.lock().await;
    let mut drained = Vec::with_capacity(events.len());
    while let Some(event) = events.pop_front() {
      drained.push(event);
    }
    Ok(drained)
  }
}

fn normalized_meta_for_file(doc_id: &str, path: &Path, meta: FrontmatterMeta, body: &str) -> FrontmatterMeta {
  let title = meta
    .title
    .or_else(|| derive_title_from_markdown(body))
    .unwrap_or_else(|| derive_title_from_path(path));
  FrontmatterMeta {
    id: Some(doc_id.to_string()),
    title: Some(title),
    tags: normalize_tags(meta.tags),
    favorite: Some(meta.favorite.unwrap_or(false)),
    trash: Some(meta.trash.unwrap_or(false)),
  }
}
