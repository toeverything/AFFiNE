const WORKSPACE_DATABASE_TABLES: [&str; 5] = [
  "folders",
  "docProperties",
  "docCustomPropertyInfo",
  "pinnedCollections",
  "explorerIcon",
];
const USER_DATABASE_TABLES: [&str; 3] = ["favorite", "settings", "docIntegrationRef"];

pub(crate) enum ReservedDoc<'a> {
  WorkspaceDatabase,
  UserDatabase { owner_id: &'a str },
}

pub(crate) fn classify<'a>(workspace_id: &str, doc_id: &'a str) -> Option<ReservedDoc<'a>> {
  let mut parts = doc_id.split('$');
  match parts.next()? {
    "db" => {
      let (Some(encoded_workspace_id), Some(table), None) = (parts.next(), parts.next(), parts.next()) else {
        return None;
      };
      (encoded_workspace_id == workspace_id && WORKSPACE_DATABASE_TABLES.contains(&table))
        .then_some(ReservedDoc::WorkspaceDatabase)
    }
    "userdata" => {
      let (Some(owner_id), Some(encoded_workspace_id), Some(table), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
      else {
        return None;
      };
      (!owner_id.is_empty()
        && owner_id != "__local__"
        && encoded_workspace_id == workspace_id
        && USER_DATABASE_TABLES.contains(&table))
      .then_some(ReservedDoc::UserDatabase { owner_id })
    }
    _ => None,
  }
}

pub(crate) fn authorize(user_id: &str, workspace_id: &str, doc_id: &str) -> bool {
  if !doc_id.starts_with("db$") && !doc_id.starts_with("userdata$") {
    return true;
  }
  match classify(workspace_id, doc_id) {
    Some(ReservedDoc::WorkspaceDatabase) => true,
    Some(ReservedDoc::UserDatabase { owner_id }) => owner_id == user_id,
    None => false,
  }
}

pub(crate) fn is_userdata_table(table: &str) -> bool {
  USER_DATABASE_TABLES.contains(&table)
}
