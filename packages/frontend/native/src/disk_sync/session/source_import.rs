use super::*;

impl DiskSession {
  pub(crate) async fn replay_pending_updates(&self) -> Result<(), String> {
    for (doc_id, bin) in self.state_db.pending_source_updates().await? {
      self
        .queue_doc_update_event(
          DiskSyncDocUpdateEvent {
            doc_id,
            bin: bin.into(),
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
    let file_path = match self.source_preparation.lock().await.get(doc_id) {
      Some(SourcePreparation::Awaiting(path)) => Some(path.clone()),
      _ => None,
    };
    let Some(file_path) = file_path else {
      return Ok(None);
    };
    if let Some(local_root) = local_root {
      let root = self.root_doc.lock().await.clone();
      let merged = merge_root_update_binary(&root, local_root)?;
      self.state_db.store_root_snapshot(&merged).await?;
      *self.root_doc.lock().await = merged.clone();
      self.discover_root_docs(&merged).await?;
    }
    if let Some(local) = local {
      if let Some(checkpoint) = self.checkpoints.lock().await.get(doc_id).cloned() {
        let current = if same_update_state(&checkpoint.snapshot, local)? {
          local.to_vec()
        } else {
          merge_update_binary(Some(&checkpoint.snapshot), local)?
        };
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
          scope: source.scope,
          profile: source.profile,
          meta_hash,
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
        checkpoint.markdown == body && checkpoint.meta_hash == meta_hash && paths_equal(bound_path, file_path)
      })
      .unwrap_or(false);

    if unchanged {
      return Ok(());
    }

    let current = self.docs.lock().await.get(&doc_id).cloned();
    let (page_update, next_checkpoint) = match existing_checkpoint.clone() {
      Some(checkpoint) => {
        let current = current.as_deref().unwrap_or(&checkpoint.snapshot);
        let result = merge_markdown(MarkdownMergeRequest {
          baseline: &checkpoint.snapshot,
          current,
          source_before: &checkpoint.markdown,
          source_after: &body,
          doc_id: &doc_id,
          scope: &checkpoint.scope,
          profile: checkpoint.profile,
        })
        .map_err(|err| format!("failed to merge markdown source for {}: {}", doc_id, err))?;
        if result.markdown != body {
          let candidate = self.write_candidate(&doc_id, &render_frontmatter(&normalized_meta, &result.markdown))?;
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
            markdown: result.markdown,
            scope: result.scope,
            profile: result.profile,
            meta_hash: meta_hash.clone(),
          },
        )
      }
      None => {
        if current_binding.is_some() || current.is_some() {
          return Err(format!("markdown source for {} has no verified checkpoint", doc_id));
        }
        let snapshot = build_full_doc(normalized_meta.title.as_deref().unwrap_or("Untitled"), &body, &doc_id)
          .map_err(|err| format!("failed to build doc from markdown {}: {}", doc_id, err))?;
        let source = export_markdown_source(&snapshot, &doc_id, None)
          .map_err(|err| format!("failed to export markdown source for {}: {}", doc_id, err))?;
        let verified = merge_markdown(MarkdownMergeRequest {
          baseline: &snapshot,
          current: &snapshot,
          source_before: &body,
          source_after: &body,
          doc_id: &doc_id,
          scope: &source.scope,
          profile: source.profile,
        })
        .map_err(|err| format!("failed to verify initial markdown source for {}: {}", doc_id, err))?;
        if verified.delta.is_some() {
          return Err(format!(
            "initial markdown source for {} does not match the built document",
            doc_id
          ));
        }
        (
          snapshot.clone(),
          SourceCheckpoint {
            snapshot,
            markdown: body.clone(),
            scope: source.scope,
            profile: source.profile,
            meta_hash: meta_hash.clone(),
          },
        )
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
