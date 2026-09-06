use crate::reserved_doc;

pub(crate) fn authorize(user_id: &str, workspace_id: &str, doc_id: &str) -> bool {
  reserved_doc::authorize(user_id, workspace_id, doc_id)
}

pub(crate) fn doc_id(user_id: &str, workspace_id: &str, table: &str) -> Option<String> {
  reserved_doc::is_userdata_table(table).then(|| format!("userdata${user_id}${workspace_id}${table}"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::reserved_doc::ReservedDoc;

  #[test]
  fn userdata_subject_is_owner_only_and_closed() {
    for table in ["favorite", "settings", "docIntegrationRef"] {
      let id = doc_id("user-a", "workspace-a", table).unwrap();
      assert!(authorize("user-a", "workspace-a", &id));
      assert!(!authorize("user-b", "workspace-a", &id));
      assert!(!authorize("user-a", "workspace-b", &id));
    }
    for id in [
      "userdata$user-a$workspace-a$unknown",
      "userdata$user-a$favorite",
      "userdata$__local__$workspace-a$favorite",
      "userdata$$workspace-a$favorite",
      "userdata$user-a$workspace-a$favorite$extra",
    ] {
      assert!(!authorize("user-a", "workspace-a", id));
    }
    assert!(authorize("user-a", "workspace-a", "ordinary-doc"));

    for table in [
      "folders",
      "docProperties",
      "docCustomPropertyInfo",
      "pinnedCollections",
      "explorerIcon",
    ] {
      assert!(matches!(
        reserved_doc::classify("workspace-a", &format!("db$workspace-a${table}")),
        Some(ReservedDoc::WorkspaceDatabase)
      ));
      assert!(authorize("user-a", "workspace-a", &format!("db$workspace-a${table}")));
    }
    for id in [
      "db$docProperties",
      "db$workspace-b$docProperties",
      "db$workspace-a$unknown",
      "userdata$__local__$workspace-a$favorite",
      "userdata$user-a$workspace-b$favorite",
    ] {
      assert!(reserved_doc::classify("workspace-a", id).is_none());
      assert!(!authorize("user-a", "workspace-a", id));
    }
  }
}
