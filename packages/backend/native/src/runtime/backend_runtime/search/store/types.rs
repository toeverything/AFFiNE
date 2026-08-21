use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(in crate::runtime::backend_runtime::search) enum SearchTable {
  Doc,
  Block,
}

impl SearchTable {
  pub(in crate::runtime::backend_runtime::search) const ORDERED: [Self; 2] = [Self::Doc, Self::Block];

  pub(in crate::runtime::backend_runtime::search) fn as_str(self) -> &'static str {
    match self {
      Self::Doc => "doc",
      Self::Block => "block",
    }
  }

  pub(in crate::runtime::backend_runtime::search) fn cursor_index(self) -> usize {
    match self {
      Self::Doc => 0,
      Self::Block => 1,
    }
  }
}

#[derive(Clone, Debug, PartialEq)]
pub(in crate::runtime::backend_runtime::search) struct ProjectionInput {
  pub(in crate::runtime::backend_runtime::search) external_id: String,
  pub(in crate::runtime::backend_runtime::search) workspace_id: String,
  pub(in crate::runtime::backend_runtime::search) doc_id: String,
  pub(in crate::runtime::backend_runtime::search) revision: i64,
  pub(in crate::runtime::backend_runtime::search) payload: Value,
  pub(in crate::runtime::backend_runtime::search) acl_public_readable: bool,
  pub(in crate::runtime::backend_runtime::search) acl_member_default_readable: bool,
  pub(in crate::runtime::backend_runtime::search) acl_read_user_ids: Vec<String>,
  pub(in crate::runtime::backend_runtime::search) acl_revision: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub(in crate::runtime::backend_runtime::search) struct SearchChange {
  pub(in crate::runtime::backend_runtime::search) sequence: i64,
  pub(in crate::runtime::backend_runtime::search) external_id: String,
  pub(in crate::runtime::backend_runtime::search) workspace_id: String,
  pub(in crate::runtime::backend_runtime::search) doc_id: Option<String>,
  pub(in crate::runtime::backend_runtime::search) revision: i64,
  pub(in crate::runtime::backend_runtime::search) operation: String,
  pub(in crate::runtime::backend_runtime::search) payload: Option<Value>,
}

pub(in crate::runtime::backend_runtime::search) struct SearchSnapshot {
  pub(in crate::runtime::backend_runtime::search) head: i64,
  pub(in crate::runtime::backend_runtime::search) projections: Vec<ProjectionInput>,
}
