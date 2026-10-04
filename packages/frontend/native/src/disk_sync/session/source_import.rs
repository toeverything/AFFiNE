use super::*;

const RICH_MARKDOWN_MAX_BYTES: usize = 1_000_000;
const RICH_MARKDOWN_MAX_LINES: usize = 20_000;
const PREVIEW_MAX_BYTES: usize = 64 * 1024;
const PREVIEW_MAX_LINES: usize = 1_000;

struct BuiltSourceDoc {
  snapshot: Vec<u8>,
  markdown: String,
  scope: String,
  profile: u32,
  readonly_preview: bool,
}

fn source_is_too_large(markdown: &str) -> bool {
  markdown.len() > RICH_MARKDOWN_MAX_BYTES
}

fn source_file_requires_replacement(path: &Path) -> bool {
  if fs::metadata(path).is_ok_and(|metadata| metadata.len() > RICH_MARKDOWN_MAX_BYTES as u64) {
    return true;
  }
  fs::read_to_string(path)
    .is_ok_and(|markdown| markdown.lines().take(RICH_MARKDOWN_MAX_LINES + 1).count() > RICH_MARKDOWN_MAX_LINES)
}

fn is_markdown_limit_error(error: &impl std::fmt::Display) -> bool {
  let message = error.to_string();
  message.contains("markdown_too_large") || message.contains("block_count_too_large")
}

fn source_excerpt(markdown: &str) -> (&str, bool) {
  let mut end = 0;
  for line in markdown.split_inclusive('\n').take(PREVIEW_MAX_LINES) {
    if end + line.len() > PREVIEW_MAX_BYTES {
      break;
    }
    end += line.len();
  }
  if end == 0 {
    end = markdown.len().min(PREVIEW_MAX_BYTES);
    while !markdown.is_char_boundary(end) {
      end -= 1;
    }
  }
  (&markdown[..end], end < markdown.len())
}

fn large_markdown_preview(markdown: &str) -> String {
  let (excerpt, truncated) = source_excerpt(markdown);
  let longest_backtick_run = excerpt
    .split(|character| character != '`')
    .map(str::len)
    .max()
    .unwrap_or_default();
  let fence = "`".repeat(longest_backtick_run.max(2) + 1);
  let truncation_note = if truncated {
    " Only the beginning of the file is shown."
  } else {
    ""
  };
  format!(
    "# Large Markdown preview\n\n> This file is too large or complex for full AFFiNE editing.{truncation_note} This \
     preview is read-only and changes made here are not written to the source \
     file.\n\n{fence}text\n{excerpt}\n{fence}\n"
  )
}

fn build_source_doc(title: &str, markdown: &str, doc_id: &str) -> Result<BuiltSourceDoc, String> {
  let (snapshot, readonly_preview) = match build_full_doc(title, markdown, doc_id) {
    Ok(snapshot) => (snapshot, false),
    Err(error) if is_markdown_limit_error(&error) => {
      let preview = large_markdown_preview(markdown);
      (
        build_full_doc(title, &preview, doc_id)
          .map_err(|preview_error| format!("failed to build large Markdown preview: {preview_error}"))?,
        true,
      )
    }
    Err(error) => return Err(error.to_string()),
  };
  let source = export_markdown_source(&snapshot, doc_id, None)
    .map_err(|error| format!("failed to export built Markdown source: {error}"))?;
  Ok(BuiltSourceDoc {
    snapshot,
    markdown: source.markdown,
    scope: source.scope,
    profile: source.profile,
    readonly_preview,
  })
}

fn replace_doc_blocks(existing: &[u8], replacement: &[u8], doc_id: &str) -> Result<(Vec<u8>, Vec<u8>), String> {
  let mut doc = load_doc_or_new(existing, Some(doc_id))?;
  let before = doc.get_state_vector();
  let mut blocks = doc
    .get_map("blocks")
    .map_err(|error| format!("failed to load existing blocks for {}: {}", doc_id, error))?;
  let block_ids = blocks.keys().map(str::to_string).collect::<Vec<_>>();
  for block_id in block_ids {
    blocks.remove(&block_id);
  }
  doc
    .apply_update_from_binary_v1(replacement)
    .map_err(|error| format!("failed to apply replacement blocks for {}: {}", doc_id, error))?;
  let delta = doc
    .encode_state_as_update_v1(&before)
    .map_err(|error| format!("failed to encode replacement update for {}: {}", doc_id, error))?;
  let snapshot = doc
    .encode_update_v1()
    .map_err(|error| format!("failed to encode replacement snapshot for {}: {}", doc_id, error))?;
  Ok((delta, snapshot))
}

impl DiskSession {
  pub(crate) async fn should_replace_source_doc(&self, doc_id: &str) -> bool {
    let checkpoint_is_preview = self
      .checkpoints
      .lock()
      .await
      .get(doc_id)
      .is_some_and(|checkpoint| checkpoint.readonly_preview);
    if checkpoint_is_preview {
      return true;
    }

    let file_path = match self.source_preparation.lock().await.get(doc_id) {
      Some(SourcePreparation::Awaiting(path)) => Some(path.clone()),
      _ => self.bindings.lock().await.get(doc_id).cloned(),
    };
    file_path.is_some_and(|path| source_file_requires_replacement(&path))
  }

  pub(crate) async fn replay_pending_updates(&self) -> Result<(), String> {
    for (doc_id, bin) in self.state_db.pending_source_updates().await? {
      if doc_id != self.workspace_id && !self.should_sync_doc(&doc_id).await {
        continue;
      }
      let replay = if doc_id == self.workspace_id {
        let root = self.root_doc.lock().await.clone();
        if is_empty_update(&root) { bin } else { root }
      } else {
        self
          .checkpoints
          .lock()
          .await
          .get(&doc_id)
          .map(|checkpoint| checkpoint.snapshot.clone())
          .unwrap_or(bin)
      };
      if !matches!(is_complete_update(&replay), Ok(true)) {
        continue;
      }
      self
        .queue_doc_update_event(
          DiskSyncDocUpdateEvent {
            doc_id,
            bin: replay.into(),
            timestamp: now_naive(),
            editor: None,
          },
          Some("disk:file-import".to_string()),
        )
        .await;
    }
    Ok(())
  }

  pub(crate) async fn acknowledge_source_update(&self, doc_id: &str, snapshot: &[u8]) -> Result<(), String> {
    self.state_db.acknowledge_source_update(doc_id, snapshot).await
  }

  pub(crate) async fn prepare_source_doc(
    &self,
    doc_id: &str,
    local: Option<&[u8]>,
    local_root: Option<&[u8]>,
  ) -> Result<Option<Vec<u8>>, String> {
    let _guard = self.scan_guard.lock().await;
    let (file_path, ready) = match self.source_preparation.lock().await.get(doc_id) {
      Some(SourcePreparation::Awaiting(path)) => (Some(path.clone()), false),
      Some(SourcePreparation::Ready) => (None, true),
      None => (None, false),
    };
    if ready
      && let Some(local_root) = local_root
      && let Some(file_path) = self.bindings.lock().await.get(doc_id).cloned()
    {
      self
        .repair_ready_source_local_root(doc_id, &file_path, local_root)
        .await?;
    }
    let file_path = if file_path.is_some() || !ready {
      file_path
    } else {
      let checkpoint_is_preview = self
        .checkpoints
        .lock()
        .await
        .get(doc_id)
        .is_some_and(|checkpoint| checkpoint.readonly_preview);
      self
        .bindings
        .lock()
        .await
        .get(doc_id)
        .filter(|path| checkpoint_is_preview || source_file_requires_replacement(path))
        .cloned()
    };
    let Some(file_path) = file_path else {
      return Ok(None);
    };
    if let Some(local_root) = local_root {
      let root = self.root_doc.lock().await.clone();
      if let Some(merged) = merge_complete_root_update(&root, local_root)? {
        self.state_db.store_root_snapshot(&merged).await?;
        *self.root_doc.lock().await = merged.clone();
        self.discover_root_docs(&merged).await?;
      }
    }
    let source_requires_replacement = source_file_requires_replacement(&file_path);
    let checkpoint_is_preview = self
      .checkpoints
      .lock()
      .await
      .get(doc_id)
      .is_some_and(|checkpoint| checkpoint.readonly_preview);
    if let Some(local) = local.filter(|_| !source_requires_replacement && !checkpoint_is_preview) {
      if let Some(checkpoint) = self.checkpoints.lock().await.get(doc_id).cloned() {
        let current = if same_update_state(&checkpoint.snapshot, local)? {
          local.to_vec()
        } else {
          merge_update_binary(Some(&checkpoint.snapshot), local)?
        };
        let current = normalize_source_merge_current(&checkpoint.snapshot, &current, doc_id)?;
        self.docs.lock().await.insert(doc_id.to_string(), current);
      } else {
        let raw = fs::read_to_string(&file_path)
          .map_err(|err| format!("failed to read markdown file {}: {}", file_path.display(), err))?;
        let (meta, body) = parse_frontmatter(&raw);
        let source = export_markdown_source(local, doc_id, None)
          .map_err(|err| format!("failed to project local doc {}: {}", doc_id, err))?;
        let verified = merge_markdown(MarkdownMergeRequest {
          baseline: local,
          current: local,
          source_before: &body,
          source_after: &body,
          doc_id,
          scope: &source.scope,
          profile: source.profile,
        })
        .map_err(|err| format!("markdown source for {} has no verified checkpoint: {}", doc_id, err))?;
        if verified.delta.is_some() || verified.markdown != body {
          return Err(format!("markdown source for {} has no verified checkpoint", doc_id));
        }
        if fs::read_to_string(&file_path)
          .map_err(|err| format!("failed to recheck markdown file {}: {}", file_path.display(), err))?
          != raw
        {
          return Err(format!(
            "markdown file changed during baseline setup: {}",
            file_path.display()
          ));
        }
        let meta_hash = hash_meta(&normalized_meta_for_file(doc_id, &file_path, meta, &body));
        let checkpoint = SourceCheckpoint {
          snapshot: verified.snapshot,
          markdown: body,
          source_markdown: verified.markdown,
          scope: source.scope,
          profile: source.profile,
          meta_hash,
          readonly_preview: false,
        };
        self.state_db.upsert_source_checkpoint(doc_id, &checkpoint).await?;
        self
          .checkpoints
          .lock()
          .await
          .insert(doc_id.to_string(), checkpoint.clone());
        self.docs.lock().await.insert(doc_id.to_string(), checkpoint.snapshot);
      }
    }
    self.import_file_if_changed(&file_path).await?;
    if local.is_some() {
      let checkpoint = self.checkpoints.lock().await.get(doc_id).cloned();
      let current = self.docs.lock().await.get(doc_id).cloned();
      if let (Some(checkpoint), Some(current)) = (checkpoint, current)
        && current != checkpoint.snapshot
      {
        self
          .apply_local_page_update(doc_id.to_string(), current)
          .await
          .map_err(|error| error.to_string())?;
      }
    }
    let root = self.root_doc.lock().await.clone();
    if let Some(meta) = extract_root_meta_for_doc(&root, doc_id)? {
      self.export_root_meta_for_doc(doc_id, &meta).await?;
    }
    self
      .source_preparation
      .lock()
      .await
      .insert(doc_id.to_string(), SourcePreparation::Ready);
    Ok(self.docs.lock().await.get(doc_id).cloned())
  }

  async fn repair_ready_source_local_root(
    &self,
    doc_id: &str,
    file_path: &Path,
    local_root: &[u8],
  ) -> Result<(), String> {
    if !is_complete_update(local_root)? || extract_root_meta_for_doc(local_root, doc_id)?.is_some() {
      return Ok(());
    }

    let raw = fs::read_to_string(file_path)
      .map_err(|err| format!("failed to read markdown file {}: {}", file_path.display(), err))?;
    let (meta, body) = parse_frontmatter(&raw);
    let normalized_meta = normalized_meta_for_file(doc_id, file_path, meta, &body);
    let update = build_root_meta_update(local_root, &self.workspace_id, doc_id, &normalized_meta)?;
    if is_empty_update(&update) {
      return Ok(());
    }

    let repaired = merge_update_binary(Some(local_root), &update)?;
    if !is_complete_update(&repaired)? || extract_root_meta_for_doc(&repaired, doc_id)?.is_none() {
      return Err(format!("failed to repair local root metadata for {}", doc_id));
    }

    self
      .queue_doc_update_event(
        DiskSyncDocUpdateEvent {
          doc_id: self.workspace_id.clone(),
          bin: update.into(),
          timestamp: now_naive(),
          editor: None,
        },
        Some("disk:file-meta".to_string()),
      )
      .await;
    Ok(())
  }

  async fn import_file_if_changed(&self, file_path: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(file_path)
      .map_err(|err| format!("failed to read markdown file {}: {}", file_path.display(), err))?;

    let (meta, body) = parse_frontmatter(&raw);
    let (doc_id, has_doc_id) = match meta.id.clone() {
      Some(doc_id) => (doc_id, true),
      None => (self.doc_id_for_unmarked_file(file_path).await, false),
    };

    let normalized_meta = normalized_meta_for_file(&doc_id, file_path, meta, &body);

    let meta_hash = hash_meta(&normalized_meta);

    let current_binding = {
      let bindings = self.bindings.lock().await;
      bindings.get(&doc_id).cloned()
    };

    let existing_checkpoint = self.checkpoints.lock().await.get(&doc_id).cloned();
    let unchanged = existing_checkpoint
      .as_ref()
      .zip(current_binding.as_ref())
      .map(|(checkpoint, bound_path)| {
        checkpoint.markdown == body
          && checkpoint.meta_hash == meta_hash
          && paths_equal(bound_path, file_path)
          && (!source_is_too_large(&body) || checkpoint.readonly_preview)
      })
      .unwrap_or(false);

    if unchanged {
      let root = self.root_doc.lock().await.clone();
      if is_complete_update(&root)? && extract_root_meta_for_doc(&root, &doc_id)?.is_some() {
        return Ok(());
      }
    }

    let current = self.docs.lock().await.get(&doc_id).cloned();
    let (page_update, next_checkpoint) = if unchanged {
      (
        Vec::new(),
        existing_checkpoint.clone().expect("unchanged source checkpoint"),
      )
    } else {
      match existing_checkpoint.clone() {
        Some(checkpoint) if checkpoint.readonly_preview || source_is_too_large(&body) => {
          let built = build_source_doc(normalized_meta.title.as_deref().unwrap_or("Untitled"), &body, &doc_id)
            .map_err(|error| format!("failed to build doc from markdown {}: {}", doc_id, error))?;
          let (delta, snapshot) = replace_doc_blocks(&checkpoint.snapshot, &built.snapshot, &doc_id)?;
          (
            delta,
            SourceCheckpoint {
              snapshot,
              markdown: body.clone(),
              source_markdown: built.markdown,
              scope: built.scope,
              profile: built.profile,
              meta_hash: meta_hash.clone(),
              readonly_preview: built.readonly_preview,
            },
          )
        }
        Some(checkpoint) => {
          let current = current.as_deref().unwrap_or(&checkpoint.snapshot);
          let merge_body = annotate_markdown_blocks(&body, &checkpoint.markdown, &checkpoint.source_markdown)
            .map_err(|error| format!("failed to project markdown source for {}: {}", doc_id, error))?;
          let merge_result = merge_markdown(MarkdownMergeRequest {
            baseline: &checkpoint.snapshot,
            current,
            source_before: &checkpoint.source_markdown,
            source_after: &merge_body,
            doc_id: &doc_id,
            scope: &checkpoint.scope,
            profile: checkpoint.profile,
          });
          match merge_result {
            Ok(result) => {
              let strip_block_markers = |markdown: &str| {
                markdown
                  .split_inclusive('\n')
                  .filter(|line| {
                    let marker = line.trim();
                    !(marker.starts_with("<!--")
                      && marker.ends_with("-->")
                      && marker.contains("block_id=")
                      && marker.contains("flavour="))
                  })
                  .collect::<String>()
              };
              if checkpoint.source_markdown == checkpoint.markdown
                && strip_block_markers(&result.markdown).trim_end() != strip_block_markers(&body).trim_end()
              {
                let candidate =
                  self.write_candidate(&doc_id, &render_frontmatter(&normalized_meta, &result.markdown))?;
                return Err(format!(
                  "markdown source for {} has concurrent edits; review {}",
                  doc_id,
                  candidate.display()
                ));
              }
              (
                result.delta.unwrap_or_default(),
                SourceCheckpoint {
                  snapshot: result.snapshot,
                  markdown: body.clone(),
                  source_markdown: result.markdown,
                  scope: result.scope,
                  profile: result.profile,
                  meta_hash: meta_hash.clone(),
                  readonly_preview: false,
                },
              )
            }
            Err(error) if is_markdown_limit_error(&error) => {
              let built = build_source_doc(normalized_meta.title.as_deref().unwrap_or("Untitled"), &body, &doc_id)
                .map_err(|build_error| format!("failed to build doc from markdown {}: {}", doc_id, build_error))?;
              let (delta, snapshot) = replace_doc_blocks(&checkpoint.snapshot, &built.snapshot, &doc_id)?;
              (
                delta,
                SourceCheckpoint {
                  snapshot,
                  markdown: body.clone(),
                  source_markdown: built.markdown,
                  scope: built.scope,
                  profile: built.profile,
                  meta_hash: meta_hash.clone(),
                  readonly_preview: built.readonly_preview,
                },
              )
            }
            Err(error) => return Err(format!("failed to merge markdown source for {}: {}", doc_id, error)),
          }
        }
        None => {
          if current_binding.is_some() || current.is_some() {
            return Err(format!("markdown source for {} has no verified checkpoint", doc_id));
          }
          let built = build_source_doc(normalized_meta.title.as_deref().unwrap_or("Untitled"), &body, &doc_id)
            .map_err(|error| format!("failed to build doc from markdown {}: {}", doc_id, error))?;
          (
            built.snapshot.clone(),
            SourceCheckpoint {
              snapshot: built.snapshot,
              markdown: body.clone(),
              source_markdown: built.markdown,
              scope: built.scope,
              profile: built.profile,
              meta_hash: meta_hash.clone(),
              readonly_preview: built.readonly_preview,
            },
          )
        }
      }
    };

    if fs::read_to_string(file_path)
      .map_err(|err| format!("failed to recheck markdown file {}: {}", file_path.display(), err))?
      != raw
    {
      return Err(format!("markdown file changed during import: {}", file_path.display()));
    }

    let root_update = self
      .prepare_root_meta_from_file(&doc_id, &normalized_meta, existing_checkpoint.as_ref())
      .await?;

    let id_candidate = if has_doc_id {
      None
    } else {
      Some(self.write_candidate(&doc_id, &render_frontmatter(&normalized_meta, &body))?)
    };

    let (pending_page, pending_root) = self
      .state_db
      .stage_source_import(
        &doc_id,
        file_path,
        &next_checkpoint,
        &page_update,
        root_update
          .as_ref()
          .map(|(snapshot, update)| (snapshot.as_slice(), update.as_slice())),
      )
      .await?;
    {
      let mut checkpoints = self.checkpoints.lock().await;
      checkpoints.insert(doc_id.clone(), next_checkpoint.clone());
    }
    {
      let mut docs = self.docs.lock().await;
      docs.insert(doc_id.clone(), next_checkpoint.snapshot);
    }
    if let Some((snapshot, _)) = &root_update {
      *self.root_doc.lock().await = snapshot.clone();
    }

    let now = now_naive();
    if let Some(pending) = pending_page {
      self
        .queue_doc_update_event(
          DiskSyncDocUpdateEvent {
            doc_id: doc_id.clone(),
            bin: pending.into(),
            timestamp: now,
            editor: None,
          },
          Some("disk:file-import".to_string()),
        )
        .await;
    }

    if let Some(pending) = pending_root {
      self
        .queue_doc_update_event(
          DiskSyncDocUpdateEvent {
            doc_id: self.workspace_id.clone(),
            bin: pending.into(),
            timestamp: now,
            editor: None,
          },
          Some("disk:file-meta".to_string()),
        )
        .await;
    }

    if let Some((snapshot, _)) = &root_update {
      self.discover_root_docs(snapshot).await?;
    }

    {
      let mut bindings = self.bindings.lock().await;
      let mut path_bindings = self.path_bindings.lock().await;

      if let Some(prev) = bindings.insert(doc_id.clone(), file_path.to_path_buf()) {
        path_bindings.remove(&prev);
      }
      path_bindings.insert(file_path.to_path_buf(), doc_id.clone());
    }

    if let Some(candidate) = id_candidate {
      self
        .queue_error_event(format!(
          "markdown source for {} needs its generated id: {}",
          doc_id,
          candidate.display()
        ))
        .await;
    }

    Ok(())
  }

  async fn prepare_root_meta_from_file(
    &self,
    doc_id: &str,
    meta: &FrontmatterMeta,
    baseline: Option<&SourceCheckpoint>,
  ) -> Result<Option<(Vec<u8>, Vec<u8>)>, String> {
    if !self.validate_root_meta_from_file(doc_id, meta, baseline).await? {
      return Ok(None);
    }
    let current_root = self.root_doc.lock().await.clone();
    let delta = build_root_meta_update(&current_root, &self.workspace_id, doc_id, meta)?;

    if is_empty_update(&delta) {
      return Ok(None);
    }

    let merged = merge_update_binary(Some(&current_root), &delta)?;
    Ok(Some((merged, delta)))
  }

  pub(super) async fn repair_unchanged_source_root(
    &self,
    doc_id: &str,
    file_path: &Path,
    checkpoint: &SourceCheckpoint,
    meta: &FrontmatterMeta,
  ) -> Result<(), String> {
    let Some((snapshot, update)) = self.prepare_root_meta_from_file(doc_id, meta, Some(checkpoint)).await? else {
      return Ok(());
    };

    let (_, pending_root) = self
      .state_db
      .stage_source_import(
        doc_id,
        file_path,
        checkpoint,
        &[],
        Some((snapshot.as_slice(), update.as_slice())),
      )
      .await?;
    *self.root_doc.lock().await = snapshot.clone();

    if let Some(pending) = pending_root {
      self
        .queue_doc_update_event(
          DiskSyncDocUpdateEvent {
            doc_id: self.workspace_id.clone(),
            bin: pending.into(),
            timestamp: now_naive(),
            editor: None,
          },
          Some("disk:file-meta".to_string()),
        )
        .await;
    }
    self.discover_root_docs(&snapshot).await?;
    Ok(())
  }

  async fn validate_root_meta_from_file(
    &self,
    doc_id: &str,
    meta: &FrontmatterMeta,
    baseline: Option<&SourceCheckpoint>,
  ) -> Result<bool, String> {
    let current_root = self.root_doc.lock().await.clone();
    if let Some(current) = extract_root_meta_for_doc(&current_root, doc_id)? {
      let root_hash = hash_meta(&current);
      let incoming_hash = hash_meta(meta);
      if root_hash == incoming_hash {
        return Ok(false);
      }
      if baseline.is_some_and(|baseline| baseline.meta_hash == incoming_hash) {
        return Ok(false);
      }
      if baseline.is_none_or(|baseline| baseline.meta_hash != root_hash) {
        return Err(format!(
          "markdown metadata for {} has no unambiguous root baseline",
          doc_id
        ));
      }
    }
    Ok(true)
  }
}
