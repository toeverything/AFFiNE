use std::collections::{BTreeMap, BTreeSet};

use affine_doc_loader::{WorkspaceFacts, project_workspace_root_facts_doc};
use sqlx::PgConnection;
use y_octo::{Doc, Value};

use super::{RuntimeError, RuntimeResult, is_ordinary_workspace_doc, load_current_doc_in};

pub(in crate::runtime) struct LegacyWorkspace {
  pub(in crate::runtime) facts: WorkspaceFacts,
  pub(in crate::runtime) aliases: BTreeMap<String, String>,
  pub(in crate::runtime) revision: String,
}

impl LegacyWorkspace {
  pub(in crate::runtime) fn active_doc_ids(&self) -> BTreeSet<String> {
    self
      .facts
      .documents
      .iter()
      .filter(|doc| !doc.trash)
      .map(|doc| self.aliases.get(&doc.id).unwrap_or(&doc.id).clone())
      .collect()
  }
}

pub(in crate::runtime) async fn load_legacy_workspace_in(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> RuntimeResult<LegacyWorkspace> {
  let (doc, revision) = match load_current_doc_in(connection, workspace_id, workspace_id).await? {
    Some(root) => {
      let mut doc = Doc::new();
      doc
        .apply_update_from_binary_v1(&root.blob)
        .map_err(|error| RuntimeError::SearchSourceInvalid(format!("legacy workspace root decode failed: {error}")))?;
      (doc, root.updated_at.timestamp_millis().to_string())
    }
    None => (Doc::new(), "0".to_string()),
  };
  let facts = project_workspace_root_facts_doc(&doc)
    .map_err(|error| RuntimeError::SearchSourceInvalid(format!("legacy workspace root projection failed: {error}")))?;
  let mut aliases = BTreeMap::new();
  if doc.keys().iter().any(|key| key == "spaces") {
    let spaces = doc.get_map("spaces").map_err(|error| {
      RuntimeError::SearchSourceInvalid(format!("legacy workspace spaces projection failed: {error}"))
    })?;
    for document in &facts.documents {
      if let Some(Value::Doc(subdoc)) = spaces.get(&document.id) {
        let guid = subdoc.guid();
        if is_ordinary_workspace_doc(workspace_id, guid) {
          aliases.insert(document.id.clone(), guid.to_string());
        }
      }
    }
  }
  Ok(LegacyWorkspace {
    facts,
    aliases,
    revision,
  })
}
