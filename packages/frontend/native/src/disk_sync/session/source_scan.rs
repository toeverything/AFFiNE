use super::*;

impl DiskSession {
  async fn handle_missing_files(&self, seen_paths: &HashSet<PathBuf>) {
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
        .queue_error_event(format!("markdown file for {} is missing: {}", doc_id, path.display()))
        .await;
    }
  }

  pub(crate) async fn scan_once(&self) -> Result<(), String> {
    let _guard = self.scan_guard.lock().await;

    let mut markdown_files = Vec::new();
    collect_markdown_files(&self.sync_folder, &mut markdown_files)?;

    let now = Instant::now();
    let full_scan = self
      .scan_cache
      .lock()
      .await
      .last_full_scan
      .is_none_or(|last| now.duration_since(last) >= FULL_SCAN_INTERVAL);

    let mut seen_paths = HashSet::new();
    for file_path in markdown_files {
      seen_paths.insert(file_path.clone());
      let metadata = match fs::metadata(&file_path) {
        Ok(metadata) => metadata,
        Err(err) => {
          self.scan_cache.lock().await.files.remove(&file_path);
          self
            .queue_error_event(format!("failed to stat markdown file {}: {}", file_path.display(), err))
            .await;
          continue;
        }
      };
      let stamp = metadata.modified().ok().map(|modified| (modified, metadata.len()));
      if !full_scan && stamp.is_some() && self.scan_cache.lock().await.files.get(&file_path) == stamp.as_ref() {
        continue;
      }
      match self.discover_source_change(&file_path).await {
        Ok(()) => {
          if let Some(stamp) = stamp {
            self.scan_cache.lock().await.files.insert(file_path, stamp);
          }
        }
        Err(err) => {
          self.scan_cache.lock().await.files.remove(&file_path);
          self.queue_error_event(err).await;
        }
      }
    }

    let mut cache = self.scan_cache.lock().await;
    cache.files.retain(|path, _| seen_paths.contains(path));
    if full_scan {
      cache.last_full_scan = Some(Instant::now());
    }
    drop(cache);

    self.handle_missing_files(&seen_paths).await;

    Ok(())
  }

  async fn discover_source_change(&self, file_path: &Path) -> Result<(), String> {
    let raw = fs::read_to_string(file_path)
      .map_err(|err| format!("failed to read markdown file {}: {}", file_path.display(), err))?;
    let (meta, body) = parse_frontmatter(&raw);
    let doc_id = if let Some(id) = meta.id.clone() {
      id
    } else {
      self.doc_id_for_unmarked_file(file_path).await
    };
    if let Some(bound) = self.bindings.lock().await.get(&doc_id)
      && bound.exists()
      && !paths_equal(bound, file_path)
    {
      return Err(format!("multiple markdown sources claim doc {}", doc_id));
    }
    let checkpoint = self.checkpoints.lock().await.get(&doc_id).cloned();
    let unchanged = checkpoint.is_some_and(|checkpoint| {
      checkpoint.markdown == body
        && checkpoint.meta_hash == hash_meta(&normalized_meta_for_file(&doc_id, file_path, meta, &body))
    }) && self
      .bindings
      .lock()
      .await
      .get(&doc_id)
      .is_some_and(|bound| paths_equal(bound, file_path));
    let new = {
      let mut preparation = self.source_preparation.lock().await;
      match preparation.get(&doc_id) {
        Some(SourcePreparation::Ready) if unchanged => return Ok(()),
        Some(SourcePreparation::Ready) => {
          preparation.insert(doc_id.clone(), SourcePreparation::Awaiting(file_path.to_path_buf()));
          true
        }
        Some(SourcePreparation::Awaiting(existing)) if !paths_equal(existing, file_path) => {
          return Err(format!("multiple markdown sources claim doc {}", doc_id));
        }
        Some(SourcePreparation::Awaiting(_)) => false,
        None => {
          preparation.insert(doc_id.clone(), SourcePreparation::Awaiting(file_path.to_path_buf()));
          true
        }
      }
    };
    if new {
      self
        .emit_event(DiskSyncEvent {
          r#type: "source-discovered".to_string(),
          update: None,
          doc_id: Some(doc_id),
          timestamp: Some(now_naive()),
          origin: None,
          message: None,
        })
        .await;
    }
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn full_scan_finds_same_size_and_timestamp_change() {
    let dir = std::env::temp_dir().join(format!("affine-disk-scan-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&dir).expect("create directory");
    let path = dir.join("doc.md");
    fs::write(&path, "---\nid: doc-cache\ntitle: Cache\n---\n\n# Cache\n\none").expect("write source");
    let session = DiskSession::new(DiskSessionOptions {
      workspace_id: "ws-cache".to_string(),
      sync_folder: dir.to_string_lossy().to_string(),
    })
    .await
    .expect("start session");
    session.scan_once().await.expect("initial scan");
    session
      .prepare_source_doc("doc-cache", None, None)
      .await
      .expect("prepare source");
    session.events.lock().await.clear();

    let modified = fs::metadata(&path)
      .expect("metadata")
      .modified()
      .expect("modified time");
    fs::write(&path, "---\nid: doc-cache\ntitle: Cache\n---\n\n# Cache\n\ntwo").expect("change source");
    fs::File::options()
      .write(true)
      .open(&path)
      .expect("open source")
      .set_times(fs::FileTimes::new().set_modified(modified))
      .expect("restore modified time");

    session.scan_once().await.expect("cached scan");
    assert!(session.events.lock().await.is_empty());
    session.scan_cache.lock().await.last_full_scan = Some(Instant::now() - FULL_SCAN_INTERVAL);
    session.scan_once().await.expect("full scan");
    assert!(
      session
        .events
        .lock()
        .await
        .iter()
        .any(|event| { event.r#type == "source-discovered" && event.doc_id.as_deref() == Some("doc-cache") })
    );

    session.close().await;
    fs::remove_dir_all(dir).expect("remove directory");
  }
}
