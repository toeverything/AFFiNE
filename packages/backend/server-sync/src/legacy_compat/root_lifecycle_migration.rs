// compat(data): sync-lazy-root-doc-lifecycle-migration -- migrates legacy root-doc meta.pages trash flags into workspace_pages
//! Lazy migration of the legacy workspace root doc `meta.pages` identities and
//! trash flags into `workspace_pages`, run once per workspace.

use std::collections::BTreeMap;

use serde_json::json;
use server_db::WorkloadTier;

use super::{
  LegacyRootPage, SyncError, SyncStorage, WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS, compute_source_revision,
  invalidate_workspace_inventory_in, is_empty_doc_bin, is_ordinary_workspace_doc, load_workspace_doc_parts_in,
  lock_workspace_doc_update, lock_workspace_storage_exclusive,
};

pub(super) enum LifecycleRootDecodeError {
  ResourceLimit(String),
  InvalidMetadata(String),
}

/// Extracts legacy `{ id, trash }` entries from a workspace root doc's
/// `meta.pages` array, matching `packages/backend/native/src/doc/mod.rs`.
pub fn extract_workspace_lifecycle_root_pages(bytes: &[u8]) -> Result<Vec<LegacyRootPage>, SyncError> {
  extract_workspace_lifecycle_root_pages_with_limits(bytes, WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS).map_err(|err| {
    match err {
      LifecycleRootDecodeError::ResourceLimit(detail) => {
        SyncError::DocUpdateInvalid(format!("root doc decode exceeded read limits: {detail}"))
      }
      LifecycleRootDecodeError::InvalidMetadata(detail) => {
        SyncError::DocUpdateInvalid(format!("root doc decode failed: {detail}"))
      }
    }
  })
}

pub(super) fn extract_workspace_lifecycle_root_pages_with_limits(
  bytes: &[u8],
  limits: y_octo::ReadLimits,
) -> Result<Vec<LegacyRootPage>, LifecycleRootDecodeError> {
  if is_empty_doc_bin(bytes) {
    return Ok(Vec::new());
  }

  match y_octo::ReadDoc::from_full_update_v1_with_limits(bytes.to_vec(), limits) {
    Ok(doc) => Ok(extract_lifecycle_pages_from_read_doc(&doc)),
    Err(y_octo::ReadError::IncompleteSnapshot(_)) => {
      let doc = y_octo::Doc::try_from_binary_v1(bytes)
        .map_err(|e| LifecycleRootDecodeError::InvalidMetadata(format!("root doc fallback decode failed: {e}")))?;
      Ok(extract_lifecycle_pages_from_doc(&doc))
    }
    Err(y_octo::ReadError::ResourceLimit(detail)) => Err(LifecycleRootDecodeError::ResourceLimit(detail.to_owned())),
    Err(err) => Err(LifecycleRootDecodeError::InvalidMetadata(err.to_string())),
  }
}

fn push_lifecycle_page(out: &mut Vec<LegacyRootPage>, doc_id: &str, trashed: bool) {
  if !doc_id.trim().is_empty() {
    out.push(LegacyRootPage {
      doc_id: doc_id.to_owned(),
      trashed,
    });
  }
}

fn push_lifecycle_page_from_read_any(out: &mut Vec<LegacyRootPage>, any: &y_octo::ReadAny<'_>) {
  if let Some(doc_id) = any.get("id").and_then(|a| a.as_str()) {
    let trashed = any.get("trash").and_then(|a| a.as_bool()) == Some(true);
    push_lifecycle_page(out, doc_id, trashed);
  }
}

fn push_lifecycle_page_from_object(out: &mut Vec<LegacyRootPage>, object: &y_octo::AHashMap<String, y_octo::Any>) {
  if let Some(y_octo::Any::String(doc_id)) = object.get("id") {
    let trashed = matches!(object.get("trash"), Some(y_octo::Any::True));
    push_lifecycle_page(out, doc_id, trashed);
  }
}

fn extract_lifecycle_pages_from_read_doc(doc: &y_octo::ReadDoc) -> Vec<LegacyRootPage> {
  let mut pages_out = Vec::new();
  let Some(meta) = doc.map("meta") else {
    return pages_out;
  };
  match meta.get("pages") {
    Some(y_octo::ReadValue::Array(pages)) => {
      for entry in pages.iter() {
        match entry {
          y_octo::ReadValue::Map(page) => {
            if let Some(doc_id) = page.get("id").and_then(|v| v.as_any()).and_then(|a| a.as_str()) {
              let trashed = page.get("trash").and_then(|v| v.as_any()).and_then(|a| a.as_bool()) == Some(true);
              push_lifecycle_page(&mut pages_out, doc_id, trashed);
            }
          }
          y_octo::ReadValue::Any(any) => push_lifecycle_page_from_read_any(&mut pages_out, &any),
          _ => {}
        }
      }
    }
    Some(y_octo::ReadValue::Any(any)) => {
      if let Some(entries) = any.array() {
        for entry in entries {
          push_lifecycle_page_from_read_any(&mut pages_out, &entry);
        }
      }
    }
    _ => {}
  }
  pages_out
}

fn extract_lifecycle_pages_from_doc(doc: &y_octo::Doc) -> Vec<LegacyRootPage> {
  let mut pages_out = Vec::new();
  let Ok(meta) = doc.get_map("meta") else {
    return pages_out;
  };
  match meta.get("pages") {
    Some(y_octo::Value::Array(pages)) => {
      for entry in pages.iter() {
        match entry {
          y_octo::Value::Map(page) => {
            if let Some(y_octo::Value::Any(y_octo::Any::String(doc_id))) = page.get("id") {
              let trashed = matches!(page.get("trash"), Some(y_octo::Value::Any(y_octo::Any::True)));
              push_lifecycle_page(&mut pages_out, &doc_id, trashed);
            }
          }
          y_octo::Value::Any(y_octo::Any::Object(object)) => push_lifecycle_page_from_object(&mut pages_out, &object),
          _ => {}
        }
      }
    }
    Some(y_octo::Value::Any(y_octo::Any::Array(entries))) => {
      for entry in entries {
        if let y_octo::Any::Object(object) = entry {
          push_lifecycle_page_from_object(&mut pages_out, &object);
        }
      }
    }
    _ => {}
  }
  pages_out
}

impl SyncStorage {
  /// Ensures `storage_reconciliation_checkpoints` contains a completed
  /// `workspace_doc_lifecycle` checkpoint for `workspace_id`, migrating any
  /// legacy `meta.pages` document identities & trash flags from the workspace
  /// root doc before marking `completed` (1:1 with `workspace_state.rs`).
  pub async fn ensure_workspace_lifecycle(&self, workspace_id: &str, protocol_version: u8) -> Result<(), SyncError> {
    self
      .ensure_workspace_lifecycle_with_limits(
        workspace_id,
        protocol_version,
        WORKSPACE_LIFECYCLE_MIGRATION_READ_LIMITS,
      )
      .await
  }

  pub(super) async fn ensure_workspace_lifecycle_with_limits(
    &self,
    workspace_id: &str,
    protocol_version: u8,
    limits: y_octo::ReadLimits,
  ) -> Result<(), SyncError> {
    let mut tx = self.db.begin_tiered(WorkloadTier::InteractiveWrite).await?;

    let globally_active: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
    )
    .fetch_one(&mut **tx.tx_mut())
    .await?;

    if globally_active && protocol_version == 1 {
      return Err(SyncError::BadRequest("Sync protocol upgrade required.".into()));
    }
    if !globally_active && protocol_version == 2 {
      return Err(SyncError::BadRequest("Workspace lifecycle not active.".into()));
    }
    if protocol_version != 2 {
      tx.commit().await?;
      return Ok(());
    }

    let already_completed: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
    )
    .bind(workspace_id)
    .fetch_one(&mut **tx.tx_mut())
    .await?;

    if already_completed {
      tx.commit().await?;
      return Ok(());
    }

    // Exclusive workspace storage lock -> root doc lock -> workspace KEY SHARE.
    lock_workspace_storage_exclusive(tx.tx_mut(), workspace_id).await?;
    lock_workspace_doc_update(tx.tx_mut(), workspace_id, workspace_id).await?;

    let still_active: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle_activation' AND scope = 'global' AND status = 'active')",
    )
    .fetch_one(&mut **tx.tx_mut())
    .await?;
    if !still_active {
      return Err(SyncError::BadRequest("Workspace lifecycle not active.".into()));
    }

    let workspace_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR KEY SHARE")
      .bind(workspace_id)
      .fetch_optional(&mut **tx.tx_mut())
      .await?;
    if workspace_exists.is_none() {
      tx.commit().await?;
      return Ok(());
    }

    // Re-check under exclusive lock.
    let recheck: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM storage_reconciliation_checkpoints \
       WHERE kind = 'workspace_doc_lifecycle' AND scope = $1 AND status = 'completed')",
    )
    .bind(workspace_id)
    .fetch_one(&mut **tx.tx_mut())
    .await?;
    if recheck {
      tx.commit().await?;
      return Ok(());
    }

    let parts = load_workspace_doc_parts_in(tx.tx_mut(), workspace_id, workspace_id).await?;
    let source_rev = compute_source_revision(&parts);

    let (root_status, legacy_pages): (&'static str, Vec<LegacyRootPage>) = if parts.is_empty() {
      ("absent", Vec::new())
    } else {
      let blobs: Vec<Vec<u8>> = parts.into_iter().map(|p| p.blob).collect();
      tokio::task::spawn_blocking(move || {
        let slices: Vec<&[u8]> = blobs.iter().map(Vec::as_slice).collect();
        let Ok(merged) = y_octo::merge_updates_v1(slices).and_then(|u| u.encode_v1()) else {
          return Ok(("invalid_binary", Vec::new()));
        };
        match extract_workspace_lifecycle_root_pages_with_limits(&merged, limits) {
          Ok(pages) => Ok(("decoded", pages)),
          Err(LifecycleRootDecodeError::InvalidMetadata(_)) => Ok(("invalid_metadata", Vec::new())),
          Err(LifecycleRootDecodeError::ResourceLimit(detail)) => Err(SyncError::Internal(format!(
            "workspace lifecycle root doc exceeded read limits: {detail}"
          ))),
        }
      })
      .await
      .map_err(|e| SyncError::Internal(format!("root lifecycle decode task failed: {e}")))??
    };

    // Deduplicate ordinary docs; duplicate entries clear their trash state (workspace_state.rs:199-211).
    let mut unique = BTreeMap::<String, Option<bool>>::new();
    for page in legacy_pages {
      if is_ordinary_workspace_doc(workspace_id, &page.doc_id) {
        unique
          .entry(page.doc_id)
          .and_modify(|state| *state = None)
          .or_insert(Some(page.trashed));
      }
    }
    let (doc_ids, trashed): (Vec<String>, Vec<bool>) = unique
      .into_iter()
      .filter_map(|(id, state)| state.map(|is_trashed| (id, is_trashed)))
      .unzip();

    if !doc_ids.is_empty() {
      sqlx::query(
        r#"
        INSERT INTO updates(workspace_id, guid, blob, created_at)
        SELECT $1, input.doc_id, $3, date_trunc('milliseconds', clock_timestamp())
        FROM unnest($2::text[]) input(doc_id)
        LEFT JOIN workspace_pages page
          ON page.workspace_id = $1 AND page.page_id = input.doc_id
        WHERE page.lifecycle_state IS DISTINCT FROM 'deleted'
          AND NOT EXISTS (SELECT 1 FROM snapshots WHERE workspace_id = $1 AND guid = input.doc_id)
          AND NOT EXISTS (SELECT 1 FROM updates WHERE workspace_id = $1 AND guid = input.doc_id)
        "#,
      )
      .bind(workspace_id)
      .bind(&doc_ids)
      .bind(&[0u8, 0][..])
      .execute(&mut **tx.tx_mut())
      .await?;

      sqlx::query(
        r#"
        INSERT INTO workspace_pages(workspace_id, page_id, lifecycle_state, lifecycle_changed_at)
        SELECT $1, input.doc_id, 'trashed', date_trunc('milliseconds', clock_timestamp())
        FROM unnest($2::text[], $3::bool[]) input(doc_id, trashed)
        WHERE input.trashed
        ON CONFLICT (workspace_id, page_id) DO UPDATE SET
          lifecycle_state = 'trashed',
          lifecycle_changed_at = EXCLUDED.lifecycle_changed_at
        WHERE workspace_pages.lifecycle_changed_at IS NULL
          AND workspace_pages.lifecycle_state IS DISTINCT FROM 'deleted'
        "#,
      )
      .bind(workspace_id)
      .bind(&doc_ids)
      .bind(&trashed)
      .execute(&mut **tx.tx_mut())
      .await?;
    }

    invalidate_workspace_inventory_in(tx.tx_mut(), workspace_id, &self.search_projection_ready).await?;

    let metadata = json!({
      "protocolVersion": 2,
      "rootStatus": root_status,
      "sourceRevision": source_rev,
    });

    sqlx::query(
      r#"
      INSERT INTO storage_reconciliation_checkpoints
        (kind, scope, status, cursor, metadata, completed_at, updated_at)
      VALUES
        ('workspace_doc_lifecycle', $1, 'completed', '{}'::jsonb, $2, clock_timestamp(), clock_timestamp())
      ON CONFLICT (kind, scope) DO UPDATE SET
        status = 'completed',
        metadata = EXCLUDED.metadata,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at
      "#,
    )
    .bind(workspace_id)
    .bind(metadata)
    .execute(&mut **tx.tx_mut())
    .await?;

    tx.commit().await?;
    Ok(())
  }
}
