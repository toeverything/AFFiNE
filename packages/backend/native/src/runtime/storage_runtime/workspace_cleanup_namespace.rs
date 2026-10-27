use crate::runtime::object_storage::types::{StorageScope, is_id_segment};

#[derive(Clone, Copy)]
pub(super) struct NamespaceShard {
  pub(super) scope: StorageScope,
  pub(super) checkpoint_scope: &'static str,
  pub(super) prefix: Option<&'static str>,
  pub(super) delimiter: Option<&'static str>,
  pub(super) kind: NamespaceKind,
}

#[derive(Clone, Copy)]
pub(super) enum NamespaceKind {
  BlobWorkspace,
  BlobComment,
  BlobCommentObjects,
  CopilotWorkspace,
  CopilotChat,
  Avatar,
}

pub(super) const NAMESPACE_SHARDS: [NamespaceShard; 8] = [
  NamespaceShard {
    scope: StorageScope::Blob,
    checkpoint_scope: "blob/workspaces",
    prefix: None,
    delimiter: Some("/"),
    kind: NamespaceKind::BlobWorkspace,
  },
  NamespaceShard {
    scope: StorageScope::Blob,
    checkpoint_scope: "blob/comment-attachments",
    prefix: Some("comment-attachments/"),
    delimiter: Some("/"),
    kind: NamespaceKind::BlobComment,
  },
  NamespaceShard {
    scope: StorageScope::Blob,
    checkpoint_scope: "blob/comment-attachment-objects",
    prefix: Some("comment-attachments/"),
    delimiter: None,
    kind: NamespaceKind::BlobCommentObjects,
  },
  NamespaceShard {
    scope: StorageScope::Copilot,
    checkpoint_scope: "copilot/workspace-files",
    prefix: Some("workspace-files/"),
    delimiter: Some("/"),
    kind: NamespaceKind::CopilotWorkspace,
  },
  NamespaceShard {
    scope: StorageScope::Copilot,
    checkpoint_scope: "copilot/context-files",
    prefix: Some("context-files/"),
    delimiter: Some("/"),
    kind: NamespaceKind::CopilotWorkspace,
  },
  NamespaceShard {
    scope: StorageScope::Copilot,
    checkpoint_scope: "copilot/artifacts",
    prefix: Some("artifacts/"),
    delimiter: Some("/"),
    kind: NamespaceKind::CopilotWorkspace,
  },
  NamespaceShard {
    scope: StorageScope::Copilot,
    checkpoint_scope: "copilot/user-workspaces",
    prefix: None,
    delimiter: None,
    kind: NamespaceKind::CopilotChat,
  },
  NamespaceShard {
    scope: StorageScope::Avatar,
    checkpoint_scope: "avatar/users",
    prefix: None,
    delimiter: None,
    kind: NamespaceKind::Avatar,
  },
];

pub(super) fn workspace_id_from_prefix(kind: NamespaceKind, prefix: &str) -> Option<String> {
  let segments = prefix.trim_end_matches('/').split('/').collect::<Vec<_>>();
  let workspace_id = match (kind, segments.as_slice()) {
    (NamespaceKind::BlobWorkspace, [workspace_id]) if *workspace_id != "comment-attachments" => *workspace_id,
    (NamespaceKind::BlobComment, ["comment-attachments", workspace_id]) => *workspace_id,
    (NamespaceKind::CopilotWorkspace, ["workspace-files" | "context-files" | "artifacts", workspace_id]) => {
      *workspace_id
    }
    _ => return None,
  };
  is_id_segment(workspace_id).then(|| workspace_id.to_string())
}

pub(super) fn comment_object_identity(key: &str) -> Option<(String, String, String, Option<String>)> {
  let segments = key.split('/').collect::<Vec<_>>();
  match segments.as_slice() {
    ["comment-attachments", workspace_id, doc_id, attachment_key]
      if [workspace_id, doc_id, attachment_key]
        .iter()
        .all(|value| is_id_segment(value)) =>
    {
      Some((
        (*workspace_id).to_string(),
        (*doc_id).to_string(),
        (*attachment_key).to_string(),
        None,
      ))
    }
    [
      "comment-attachments",
      workspace_id,
      doc_id,
      ".reservations",
      reservation_id,
      attachment_key,
    ] if [workspace_id, doc_id, reservation_id, attachment_key]
      .iter()
      .all(|value| is_id_segment(value)) =>
    {
      Some((
        (*workspace_id).to_string(),
        (*doc_id).to_string(),
        (*attachment_key).to_string(),
        Some((*reservation_id).to_string()),
      ))
    }
    _ => None,
  }
}
