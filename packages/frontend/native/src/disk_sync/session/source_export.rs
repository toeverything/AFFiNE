use super::*;

impl DiskSession {
  pub(crate) async fn apply_local_update(&self, update: DiskDocUpdateInput) -> Result<DiskDocClock, String> {
    // Serialize local updates with filesystem scanning/importing.
    //
    // Without this guard, root-meta exports and page exports can run
    // concurrently and race on the same markdown file/baseline, causing the
    // file content to flip between different snapshots while the client is
    // editing.
    let _guard = self.scan_guard.lock().await;

    let timestamp = now_naive();

    if update.doc_id == self.workspace_id {
      self.apply_local_root_update(update.bin.as_ref().to_vec()).await?;
      return Ok(DiskDocClock {
        doc_id: update.doc_id,
        timestamp,
        review_required: None,
        export_error: None,
      });
    }

    let (review_required, export_error) = match self
      .apply_local_page_update(update.doc_id.clone(), update.bin.as_ref().to_vec())
      .await
    {
      Ok(review_required) => (review_required, None),
      Err(PageExportError::Unexportable(message)) => (None, Some(message)),
      Err(PageExportError::Failed(message)) => return Err(message),
    };

    Ok(DiskDocClock {
      doc_id: update.doc_id,
      timestamp,
      review_required,
      export_error,
    })
  }

  async fn apply_local_root_update(&self, update_bin: Vec<u8>) -> Result<(), String> {
    let current_root = self.root_doc.lock().await.clone();
    let merged_root = merge_root_update_binary(&current_root, &update_bin)?;
    self.state_db.store_root_snapshot(&merged_root).await?;

    {
      let mut root = self.root_doc.lock().await;
      *root = merged_root.clone();
    }

    self.discover_root_docs(&merged_root).await?;

    let metas = extract_all_root_meta(&merged_root)?;

    for (doc_id, meta) in metas {
      self.export_root_meta_for_doc(&doc_id, &meta).await?;
    }

    Ok(())
  }

  pub(super) async fn export_root_meta_for_doc(&self, doc_id: &str, meta: &FrontmatterMeta) -> Result<(), String> {
    let Some(path) = self.bindings.lock().await.get(doc_id).cloned() else {
      return Ok(());
    };
    let Some(mut checkpoint) = self.checkpoints.lock().await.get(doc_id).cloned() else {
      return Ok(());
    };
    if !path.exists() {
      return Ok(());
    }

    if self.is_markdown_dirty(doc_id, &path).await {
      self
        .queue_error_event(format!(
          "markdown metadata export paused for {}: {} has changed",
          doc_id,
          path.display()
        ))
        .await;
      return Ok(());
    }

    let meta_with_id = meta.clone().with_id(doc_id.to_string());
    let next_hash = hash_meta(&meta_with_id);
    if checkpoint.meta_hash == next_hash {
      return Ok(());
    }
    let existing = fs::read_to_string(&path).map_err(|err| {
      format!(
        "failed to read markdown for metadata update {}: {}",
        path.display(),
        err
      )
    })?;
    let (_, body) = parse_frontmatter(&existing);
    let rendered = render_frontmatter(&meta_with_id, &body);
    if existing != rendered {
      let candidate = self.write_candidate(doc_id, &rendered)?;
      self
        .queue_error_event(format!(
          "markdown metadata for {} is ready to review: {}",
          doc_id,
          candidate.display()
        ))
        .await;
      return Ok(());
    }
    checkpoint.meta_hash = next_hash;
    self.state_db.upsert_source_checkpoint(doc_id, &checkpoint).await?;
    self.checkpoints.lock().await.insert(doc_id.to_string(), checkpoint);

    Ok(())
  }

  pub(super) async fn apply_local_page_update(
    &self,
    doc_id: String,
    update_bin: Vec<u8>,
  ) -> Result<Option<String>, PageExportError> {
    // Internal docs (e.g. `db$folders`) are not page documents and are not
    // exportable to markdown. Avoid emitting noisy parser errors for them.
    if doc_id.starts_with("db$") {
      return Ok(None);
    }

    let current_doc = {
      let docs = self.docs.lock().await;
      docs.get(&doc_id).cloned()
    };

    let merged_doc = merge_frontend_update_binary(current_doc.as_deref(), &update_bin)?;

    {
      let mut docs = self.docs.lock().await;
      docs.insert(doc_id.clone(), merged_doc.clone());
    }

    let markdown = export_markdown_source(&merged_doc, &doc_id, None)
      .map_err(|err| PageExportError::Unexportable(format!("failed to export doc {}: {}", doc_id, err)))?;

    let title = parse_doc_to_markdown(merged_doc.clone(), doc_id.clone(), true, None)
      .ok()
      .map(|result| result.title);
    let meta = self.meta_for_doc(&doc_id, title).await?;
    let file_path = self.resolve_file_path(&doc_id, meta.title.as_deref()).await?;

    // Avoid overwriting local filesystem edits that haven't been imported yet.
    // This is especially important when multiple export passes happen (e.g.
    // page update + root meta update) and users edit the markdown file in
    // between them.
    if self.is_markdown_dirty(&doc_id, &file_path).await {
      self
        .queue_error_event(format!(
          "markdown export paused for {}: {} has changed",
          doc_id,
          file_path.display()
        ))
        .await;
      return Ok(None);
    }

    let meta_with_id = meta.clone().with_id(doc_id.clone());
    let rendered = render_frontmatter(&meta_with_id, &markdown.markdown);
    if file_path.exists() {
      let existing = fs::read_to_string(&file_path)
        .map_err(|err| format!("failed to read markdown file {}: {}", file_path.display(), err))?;
      if existing != rendered {
        let candidate = self.write_candidate(&doc_id, &rendered)?;
        self
          .queue_error_event(format!(
            "markdown source for {} is ready to review: {}",
            doc_id,
            candidate.display()
          ))
          .await;
        return Ok(Some(candidate.display().to_string()));
      }
    } else {
      write_new_file(&file_path, &rendered)?;
    }

    let checkpoint = SourceCheckpoint {
      snapshot: merged_doc,
      markdown: markdown.markdown,
      scope: markdown.scope,
      profile: markdown.profile,
      meta_hash: hash_meta(&meta_with_id),
    };
    self.state_db.upsert_source_checkpoint(&doc_id, &checkpoint).await?;
    self.checkpoints.lock().await.insert(doc_id.clone(), checkpoint);
    self
      .source_preparation
      .lock()
      .await
      .insert(doc_id.clone(), SourcePreparation::Ready);

    Ok(None)
  }

  async fn is_markdown_dirty(&self, doc_id: &str, file_path: &Path) -> bool {
    if !file_path.exists() {
      return false;
    }

    let checkpoint = {
      let checkpoints = self.checkpoints.lock().await;
      checkpoints.get(doc_id).cloned()
    };
    let Some(checkpoint) = checkpoint else {
      return true;
    };

    let raw = match fs::read_to_string(file_path) {
      Ok(raw) => raw,
      Err(err) => {
        self
          .queue_error_event(format!("failed to read markdown file {}: {}", file_path.display(), err))
          .await;
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

    let meta_hash = hash_meta(&normalized_meta);

    checkpoint.markdown != body || checkpoint.meta_hash != meta_hash
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
      if candidate.exists() {
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
