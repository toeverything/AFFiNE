const USERDATA_PREFIX: &str = "userdata$";
const TABLES: [&str; 3] = ["favorite", "settings", "docIntegrationRef"];

pub(crate) fn authorize(user_id: &str, workspace_id: &str, doc_id: &str) -> bool {
  if !doc_id.starts_with(USERDATA_PREFIX) {
    return true;
  }
  let mut parts = doc_id.split('$');
  let (Some("userdata"), Some(owner_id), Some(encoded_workspace_id), Some(table), None) =
    (parts.next(), parts.next(), parts.next(), parts.next(), parts.next())
  else {
    return false;
  };
  owner_id != "__local__" && owner_id == user_id && encoded_workspace_id == workspace_id && TABLES.contains(&table)
}

pub(crate) fn doc_id(user_id: &str, workspace_id: &str, table: &str) -> Option<String> {
  TABLES
    .contains(&table)
    .then(|| format!("userdata${user_id}${workspace_id}${table}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn userdata_subject_is_owner_only_and_closed() {
    for table in TABLES {
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
  }
}
