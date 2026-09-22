use std::{
  collections::{HashMap, HashSet, VecDeque},
  fs,
  path::{Path, PathBuf},
  sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
  },
  time::Duration,
};

use affine_common::doc_parser::{build_full_doc, parse_doc_to_markdown, update_doc};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use tokio::{sync::Mutex, task::JoinHandle};

use super::{
  DiskDocClock, DiskDocUpdateInput, DiskSessionOptions, DiskSyncDocUpdateEvent, DiskSyncEvent,
  frontmatter::{normalize_tags, parse_frontmatter, render_frontmatter},
  root_meta::{build_root_meta_update, extract_all_root_meta, extract_root_meta_for_doc},
  state_db::StateDb,
  types::{Baseline, FrontmatterMeta},
  utils::{
    collect_markdown_files, derive_title_from_markdown, derive_title_from_path, generate_missing_doc_id, hash_meta,
    hash_string, is_empty_update, merge_update_binary, now_naive, paths_equal, sanitize_file_stem, write_atomic,
  },
};

#[derive(Clone)]
pub(crate) struct DiskSession {
  workspace_id: String,
  sync_folder: PathBuf,
  state_db: StateDb,
  events: Arc<Mutex<VecDeque<DiskSyncEvent>>>,
  docs: Arc<Mutex<HashMap<String, Vec<u8>>>>,
  root_doc: Arc<Mutex<Vec<u8>>>,
  bindings: Arc<Mutex<HashMap<String, PathBuf>>>,
  path_bindings: Arc<Mutex<HashMap<PathBuf, String>>>,
  baselines: Arc<Mutex<HashMap<String, Baseline>>>,
  missing_logged: Arc<Mutex<HashSet<PathBuf>>>,
  last_sync: Arc<Mutex<HashMap<String, chrono::NaiveDateTime>>>,
  last_error: Arc<Mutex<Option<String>>>,
  subscribers: Arc<Mutex<HashMap<u64, Arc<ThreadsafeFunction<DiskSyncEvent, ()>>>>>,
  poll_task: Arc<Mutex<Option<JoinHandle<()>>>>,
  closed: Arc<AtomicBool>,
  scan_guard: Arc<Mutex<()>>,
}

impl DiskSession {
  pub(crate) async fn new(options: DiskSessionOptions) -> Result<Self, String> {
    let sync_folder = PathBuf::from(&options.sync_folder);
    fs::create_dir_all(&sync_folder)
      .map_err(|err| format!("failed to create sync folder {}: {}", sync_folder.display(), err))?;

    let state_db = StateDb::open(&sync_folder, &options.workspace_id).await?;
    let bindings = state_db.load_bindings().await?;
    let baselines = state_db.load_baselines().await?;

    let mut path_bindings = HashMap::new();
    for (doc_id, file_path) in &bindings {
      path_bindings.insert(file_path.clone(), doc_id.clone());
    }

    Ok(Self {
      workspace_id: options.workspace_id,
      sync_folder,
      state_db,
      events: Arc::new(Mutex::new(VecDeque::new())),
      docs: Arc::new(Mutex::new(HashMap::new())),
      root_doc: Arc::new(Mutex::new(Vec::new())),
      bindings: Arc::new(Mutex::new(bindings)),
      path_bindings: Arc::new(Mutex::new(path_bindings)),
      baselines: Arc::new(Mutex::new(baselines)),
      missing_logged: Arc::new(Mutex::new(HashSet::new())),
      last_sync: Arc::new(Mutex::new(HashMap::new())),
      last_error: Arc::new(Mutex::new(None)),
      subscribers: Arc::new(Mutex::new(HashMap::new())),
      poll_task: Arc::new(Mutex::new(None)),
      closed: Arc::new(AtomicBool::new(false)),
      scan_guard: Arc::new(Mutex::new(())),
    })
  }

  pub(crate) async fn close(&self) {
    self.closed.store(true, Ordering::Relaxed);
    self.stop_poll_task().await;
    self.subscribers.lock().await.clear();
    self.state_db.close().await;
  }

  pub(crate) async fn add_subscriber(
    &self,
    subscriber_id: u64,
    callback: ThreadsafeFunction<DiskSyncEvent, ()>,
  ) -> Result<(), String> {
    let callback = Arc::new(callback);

    let backlog = {
      let mut events = self.events.lock().await;
      events.drain(..).collect::<Vec<_>>()
    };

    {
      let mut subscribers = self.subscribers.lock().await;
      subscribers.insert(subscriber_id, callback.clone());
    }

    for event in backlog {
      let _ = callback.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
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

  pub(crate) async fn queue_ready_event(&self) -> Result<(), String> {
    self
      .emit_event(DiskSyncEvent {
        r#type: "ready".to_string(),
        update: None,
        doc_id: None,
        timestamp: None,
        origin: None,
        message: None,
      })
      .await;
    Ok(())
  }

  async fn emit_event(&self, event: DiskSyncEvent) {
    let subscribers = {
      let subscribers = self.subscribers.lock().await;
      subscribers.values().cloned().collect::<Vec<_>>()
    };

    if subscribers.is_empty() {
      let mut events = self.events.lock().await;
      events.push_back(event);
      return;
    }

    for callback in subscribers {
      let _ = callback.call(Ok(event.clone()), ThreadsafeFunctionCallMode::NonBlocking);
    }
  }

  async fn queue_error_event(&self, message: impl Into<String>) {
    let message = message.into();
    {
      let mut last_error = self.last_error.lock().await;
      *last_error = Some(message.clone());
    }

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

  pub(crate) async fn scan_once(&self) -> Result<(), String> {
    let _guard = self.scan_guard.lock().await;

    let mut markdown_files = Vec::new();
    collect_markdown_files(&self.sync_folder, &mut markdown_files)?;

    let mut seen_paths = HashSet::new();
    for file_path in markdown_files {
      seen_paths.insert(file_path.clone());
      if let Err(err) = self.import_file_if_changed(&file_path).await {
        self.state_db.append_event(None, "import-error", &err).await.ok();
        self.queue_error_event(err).await;
      }
    }

    self.handle_missing_files(&seen_paths).await?;

    Ok(())
  }

  async fn handle_missing_files(&self, seen_paths: &HashSet<PathBuf>) -> Result<(), String> {
    let path_bindings = self.path_bindings.lock().await.clone();
    let mut missing_logged = self.missing_logged.lock().await;

    for (path, doc_id) in path_bindings {
      if seen_paths.contains(&path) {
        missing_logged.remove(&path);
        continue;
      }

      if missing_logged.contains(&path) {
        continue;
      }

      missing_logged.insert(path.clone());
      self
        .state_db
        .append_event(Some(&doc_id), "file-missing", &path.to_string_lossy())
        .await?;
    }

    Ok(())
  }

  async fn import_file_if_changed(&self, file_path: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(file_path)
      .map_err(|err| format!("failed to read markdown file {}: {}", file_path.display(), err))?;

    let (mut meta, body) = parse_frontmatter(&raw);
    let mut doc_id = meta.id.clone();

    if doc_id.is_none() {
      doc_id = Some(generate_missing_doc_id(file_path));
      meta.id = doc_id.clone();

      let rendered = render_frontmatter(&meta, &body);
      write_atomic(file_path, &rendered)?;
    }

    let doc_id = doc_id.ok_or_else(|| format!("failed to resolve doc id for markdown file {}", file_path.display()))?;

    let title = meta
      .title
      .clone()
      .or_else(|| derive_title_from_markdown(&body))
      .unwrap_or_else(|| derive_title_from_path(file_path));

    let normalized_meta = FrontmatterMeta {
      id: Some(doc_id.clone()),
      title: Some(title),
      tags: normalize_tags(meta.tags.clone()),
      favorite: Some(meta.favorite.unwrap_or(false)),
      trash: Some(meta.trash.unwrap_or(false)),
    };

    let md_hash = hash_string(&body);
    let meta_hash = hash_meta(&normalized_meta);

    let baseline = {
      let baselines = self.baselines.lock().await;
      baselines.get(&doc_id).cloned()
    };

    let current_binding = {
      let bindings = self.bindings.lock().await;
      bindings.get(&doc_id).cloned()
    };

    let unchanged = baseline
      .as_ref()
      .zip(current_binding.as_ref())
      .map(|(baseline, bound_path)| {
        baseline.md_hash == md_hash && baseline.meta_hash == meta_hash && paths_equal(bound_path, file_path)
      })
      .unwrap_or(false);

    if unchanged {
      return Ok(());
    }

    let (page_update, full_doc) = {
      let docs = self.docs.lock().await;
      let maybe_existing = docs.get(&doc_id).cloned();

      match maybe_existing {
        Some(existing_bin) if !is_empty_update(&existing_bin) => {
          let delta = update_doc(&existing_bin, &body, &doc_id)
            .map_err(|err| format!("failed to update doc from markdown {}: {}", doc_id, err))?;
          let merged = merge_update_binary(Some(&existing_bin), &delta, Some(&doc_id))?;
          (delta, merged)
        }
        _ => {
          let built = build_full_doc(normalized_meta.title.as_deref().unwrap_or("Untitled"), &body, &doc_id)
            .map_err(|err| format!("failed to build doc from markdown {}: {}", doc_id, err))?;
          (built.clone(), built)
        }
      }
    };

    {
      let mut docs = self.docs.lock().await;
      docs.insert(doc_id.clone(), full_doc);
    }

    let now = now_naive();
    self
      .queue_doc_update_event(
        DiskSyncDocUpdateEvent {
          doc_id: doc_id.clone(),
          bin: page_update.into(),
          timestamp: now,
          editor: None,
        },
        Some("disk:file-import".to_string()),
      )
      .await;

    self.apply_root_meta_from_file(&doc_id, &normalized_meta, now).await?;

    {
      let mut bindings = self.bindings.lock().await;
      let mut path_bindings = self.path_bindings.lock().await;

      if let Some(prev) = bindings.insert(doc_id.clone(), file_path.to_path_buf()) {
        path_bindings.remove(&prev);
      }
      path_bindings.insert(file_path.to_path_buf(), doc_id.clone());
    }

    self.state_db.upsert_binding(&doc_id, file_path).await.map_err(|err| {
      format!(
        "failed to persist binding for doc {} path {}: {}",
        doc_id,
        file_path.display(),
        err
      )
    })?;

    let baseline = Baseline {
      base_clock: String::new(),
      base_vector: String::new(),
      md_hash,
      meta_hash,
      synced_at: now,
    };

    {
      let mut baselines = self.baselines.lock().await;
      baselines.insert(doc_id.clone(), baseline.clone());
    }

    self
      .state_db
      .upsert_baseline(&doc_id, &baseline)
      .await
      .map_err(|err| format!("failed to persist baseline for doc {}: {}", doc_id, err))?;

    {
      let mut last_sync = self.last_sync.lock().await;
      last_sync.insert(doc_id.clone(), now);
    }

    self
      .state_db
      .append_event(Some(&doc_id), "import", &file_path.to_string_lossy())
      .await?;

    Ok(())
  }

  async fn apply_root_meta_from_file(
    &self,
    doc_id: &str,
    meta: &FrontmatterMeta,
    timestamp: chrono::NaiveDateTime,
  ) -> Result<(), String> {
    let current_root = self.root_doc.lock().await.clone();
    let delta = build_root_meta_update(&current_root, &self.workspace_id, doc_id, meta)?;

    if is_empty_update(&delta) {
      return Ok(());
    }

    let merged = merge_update_binary(Some(&current_root), &delta, Some(&self.workspace_id))?;
    {
      let mut root = self.root_doc.lock().await;
      *root = merged;
    }

    self
      .queue_doc_update_event(
        DiskSyncDocUpdateEvent {
          doc_id: self.workspace_id.clone(),
          bin: delta.into(),
          timestamp,
          editor: None,
        },
        Some("disk:file-meta".to_string()),
      )
      .await;

    Ok(())
  }

  pub(crate) async fn apply_local_update(
    &self,
    update: DiskDocUpdateInput,
    origin: Option<String>,
  ) -> Result<DiskDocClock, String> {
    // Serialize local updates with filesystem scanning/importing.
    //
    // Without this guard, root-meta exports and page exports can run concurrently
    // and race on the same markdown file/baseline, causing the file content to
    // flip between different snapshots while the client is editing.
    let _guard = self.scan_guard.lock().await;

    let timestamp = now_naive();

    if update.doc_id == self.workspace_id {
      self
        .apply_local_root_update(update.bin.as_ref().to_vec(), timestamp, origin)
        .await?;
      return Ok(DiskDocClock {
        doc_id: update.doc_id,
        timestamp,
      });
    }

    self
      .apply_local_page_update(
        update.doc_id.clone(),
        update.bin.as_ref().to_vec(),
        update.editor,
        timestamp,
      )
      .await?;

    Ok(DiskDocClock {
      doc_id: update.doc_id,
      timestamp,
    })
  }

  async fn apply_local_root_update(
    &self,
    update_bin: Vec<u8>,
    timestamp: chrono::NaiveDateTime,
    _origin: Option<String>,
  ) -> Result<(), String> {
    let current_root = self.root_doc.lock().await.clone();
    let merged_root = merge_update_binary(Some(&current_root), &update_bin, Some(&self.workspace_id))?;

    {
      let mut root = self.root_doc.lock().await;
      *root = merged_root.clone();
    }

    let metas = extract_all_root_meta(&merged_root)?;

    for (doc_id, meta) in metas {
      let binding_path = {
        let bindings = self.bindings.lock().await;
        bindings.get(&doc_id).cloned()
      };

      let doc_body = if let Some(doc_bin) = self.docs.lock().await.get(&doc_id).cloned() {
        parse_doc_to_markdown(doc_bin, doc_id.clone(), true, None)
          .ok()
          .map(|result| result.markdown)
      } else {
        None
      };

      let (body, body_from_doc) = if let Some(body) = doc_body {
        (body, true)
      } else if let Some(path) = binding_path.as_ref().filter(|path| path.exists()) {
        let existing = fs::read_to_string(path).map_err(|err| {
          format!(
            "failed to read markdown for metadata update {}: {}",
            path.display(),
            err
          )
        })?;
        let (_, body) = parse_frontmatter(&existing);
        (body, false)
      } else {
        continue;
      };

      if !body_from_doc && body.trim().is_empty() {
        continue;
      }

      let path = if let Some(path) = binding_path {
        path
      } else {
        self.resolve_file_path(&doc_id, meta.title.as_deref()).await?
      };

      // Avoid overwriting local filesystem edits that haven't been imported yet.
      if self.is_markdown_dirty(&doc_id, &path).await {
        self
          .state_db
          .append_event(Some(&doc_id), "export-root-skip-dirty", &path.to_string_lossy())
          .await
          .ok();
        continue;
      }

      let meta_with_id = meta.clone().with_id(doc_id.clone());
      let rendered = render_frontmatter(&meta_with_id, &body);
      write_atomic(&path, &rendered)?;

      let baseline = Baseline {
        base_clock: String::new(),
        base_vector: String::new(),
        md_hash: hash_string(&body),
        meta_hash: hash_meta(&meta_with_id),
        synced_at: timestamp,
      };

      {
        let mut baselines = self.baselines.lock().await;
        baselines.insert(doc_id.clone(), baseline.clone());
      }
      self.state_db.upsert_baseline(&doc_id, &baseline).await?;
    }

    self
      .state_db
      .append_event(None, "export-root-meta", "root metadata update applied")
      .await?;

    Ok(())
  }

  async fn apply_local_page_update(
    &self,
    doc_id: String,
    update_bin: Vec<u8>,
    editor: Option<String>,
    timestamp: chrono::NaiveDateTime,
  ) -> Result<(), String> {
    // Internal docs (e.g. `db$folders`) are not page documents and are not
    // exportable to markdown. Avoid emitting noisy parser errors for them.
    if doc_id.starts_with("db$") {
      self
        .state_db
        .append_event(
          Some(&doc_id),
          "export-skip-internal",
          "internal doc skipped (not a page)",
        )
        .await
        .ok();
      return Ok(());
    }

    let current_doc = {
      let docs = self.docs.lock().await;
      docs.get(&doc_id).cloned()
    };

    let merged_doc = match merge_update_binary(current_doc.as_deref(), &update_bin, Some(&doc_id)) {
      Ok(merged_doc) => merged_doc,
      Err(err) => {
        // A single malformed document update must not break the whole sync loop.
        // Otherwise every push retries globally and delays other documents.
        if current_doc.is_some() && err.contains("failed to apply existing update") {
          {
            let mut docs = self.docs.lock().await;
            docs.remove(&doc_id);
          }
          self
            .state_db
            .append_event(Some(&doc_id), "export-recover-reset-doc-cache", &err)
            .await
            .ok();

          match merge_update_binary(None, &update_bin, Some(&doc_id)) {
            Ok(recovered) => recovered,
            Err(recover_err) => {
              self
                .state_db
                .append_event(
                  Some(&doc_id),
                  "export-skip-invalid-update",
                  &format!("{err}; recover failed: {recover_err}"),
                )
                .await
                .ok();
              return Ok(());
            }
          }
        } else {
          self
            .state_db
            .append_event(Some(&doc_id), "export-skip-invalid-update", &err)
            .await
            .ok();
          return Ok(());
        }
      }
    };

    {
      let mut docs = self.docs.lock().await;
      docs.insert(doc_id.clone(), merged_doc.clone());
    }

    let markdown = match parse_doc_to_markdown(merged_doc, doc_id.clone(), true, None) {
      Ok(markdown) => markdown,
      Err(err) => {
        self
          .state_db
          .append_event(
            Some(&doc_id),
            "export-skip",
            &format!("failed to convert doc {} to markdown: {}", doc_id, err),
          )
          .await?;
        return Ok(());
      }
    };

    let meta = self.meta_for_doc(&doc_id, Some(markdown.title)).await?;
    let file_path = self.resolve_file_path(&doc_id, meta.title.as_deref()).await?;

    // Avoid overwriting local filesystem edits that haven't been imported yet.
    // This is especially important when multiple export passes happen (e.g. page
    // update + root meta update) and users edit the markdown file in between
    // them.
    if self.is_markdown_dirty(&doc_id, &file_path).await {
      self
        .state_db
        .append_event(Some(&doc_id), "export-skip-dirty", &file_path.to_string_lossy())
        .await
        .ok();
      let _ = editor;
      return Ok(());
    }

    let meta_with_id = meta.clone().with_id(doc_id.clone());
    let rendered = render_frontmatter(&meta_with_id, &markdown.markdown);
    write_atomic(&file_path, &rendered)?;

    let baseline = Baseline {
      base_clock: String::new(),
      base_vector: String::new(),
      md_hash: hash_string(&markdown.markdown),
      meta_hash: hash_meta(&meta_with_id),
      synced_at: timestamp,
    };

    {
      let mut baselines = self.baselines.lock().await;
      baselines.insert(doc_id.clone(), baseline.clone());
    }

    self.state_db.upsert_baseline(&doc_id, &baseline).await?;

    {
      let mut last_sync = self.last_sync.lock().await;
      last_sync.insert(doc_id.clone(), timestamp);
    }

    self
      .state_db
      .append_event(Some(&doc_id), "export-page", &file_path.to_string_lossy())
      .await?;

    let _ = editor;

    Ok(())
  }

  async fn is_markdown_dirty(&self, doc_id: &str, file_path: &Path) -> bool {
    if !file_path.exists() {
      return false;
    }

    // No baseline means the file is not tracked by this session yet.
    // If it already exists, treat it as dirty and let the import path handle it.
    let baseline = {
      let baselines = self.baselines.lock().await;
      baselines.get(doc_id).cloned()
    };
    let Some(baseline) = baseline else {
      return true;
    };

    let raw = match fs::read_to_string(file_path) {
      Ok(raw) => raw,
      Err(err) => {
        self
          .state_db
          .append_event(
            Some(doc_id),
            "export-skip-read-error",
            &format!("{}: {}", file_path.display(), err),
          )
          .await
          .ok();
        return true;
      }
    };

    let (meta, body) = parse_frontmatter(&raw);
    let title = meta
      .title
      .clone()
      .or_else(|| derive_title_from_markdown(&body))
      .unwrap_or_else(|| derive_title_from_path(file_path));
    let normalized_meta = FrontmatterMeta {
      id: meta.id.clone().or_else(|| Some(doc_id.to_string())),
      title: Some(title),
      tags: normalize_tags(meta.tags.clone()),
      favorite: Some(meta.favorite.unwrap_or(false)),
      trash: Some(meta.trash.unwrap_or(false)),
    };

    let md_hash = hash_string(&body);
    let meta_hash = hash_meta(&normalized_meta);

    baseline.md_hash != md_hash || baseline.meta_hash != meta_hash
  }

  async fn meta_for_doc(&self, doc_id: &str, fallback_title: Option<String>) -> Result<FrontmatterMeta, String> {
    let root = self.root_doc.lock().await.clone();
    let mut meta = extract_root_meta_for_doc(&root, doc_id)?.unwrap_or_default();

    if meta.title.is_none() {
      meta.title = fallback_title;
    }
    if meta.tags.is_none() {
      meta.tags = Some(Vec::new());
    }
    if meta.favorite.is_none() {
      meta.favorite = Some(false);
    }
    if meta.trash.is_none() {
      meta.trash = Some(false);
    }

    Ok(meta)
  }

  async fn resolve_file_path(&self, doc_id: &str, title_hint: Option<&str>) -> Result<PathBuf, String> {
    if let Some(path) = self.bindings.lock().await.get(doc_id).cloned() {
      return Ok(path);
    }

    let base_name = sanitize_file_stem(title_hint.unwrap_or(doc_id));
    let mut index = 1usize;

    loop {
      let candidate_name = if index == 1 {
        format!("{}.md", base_name)
      } else {
        format!("{}-{}.md", base_name, index)
      };
      let candidate = self.sync_folder.join(candidate_name);

      let taken = {
        let path_bindings = self.path_bindings.lock().await;
        path_bindings.get(&candidate).cloned()
      };

      if let Some(existing_doc_id) = taken {
        if existing_doc_id == doc_id {
          return Ok(candidate);
        }
        index += 1;
        continue;
      }

      {
        let mut bindings = self.bindings.lock().await;
        bindings.insert(doc_id.to_string(), candidate.clone());
      }
      {
        let mut path_bindings = self.path_bindings.lock().await;
        path_bindings.insert(candidate.clone(), doc_id.to_string());
      }

      self.state_db.upsert_binding(doc_id, &candidate).await?;

      return Ok(candidate);
    }
  }
}
