use std::collections::{BTreeMap, BTreeSet};

use serde_json::{Value, json};

use super::types::{DocRole, WorkspaceRole};

pub(super) const VERSION: u32 = 1;

const WORKSPACE_EXTERNAL_ACTIONS: &[&str] = &[
  "Workspace.Read",
  "Workspace.Organize.Read",
  "Workspace.Properties.Read",
  "Workspace.Blobs.Read",
];

const WORKSPACE_MEMBER_ACTIONS: &[&str] = &[
  "Workspace.Sync",
  "Workspace.CreateDoc",
  "Workspace.Users.Read",
  "Workspace.Settings.Read",
  "Workspace.Blobs.Write",
  "Workspace.Blobs.List",
  "Workspace.Copilot",
];

const WORKSPACE_ADMIN_ACTIONS: &[&str] = &[
  "Workspace.Users.Manage",
  "Workspace.Settings.Update",
  "Workspace.Properties.Create",
  "Workspace.Properties.Update",
  "Workspace.Properties.Delete",
];

const WORKSPACE_OWNER_ACTIONS: &[&str] = &[
  "Workspace.Delete",
  "Workspace.Administrators.Manage",
  "Workspace.TransferOwner",
  "Workspace.Payment.Manage",
];

const DOC_EXTERNAL_ACTIONS: &[&str] = &["Doc.Read", "Doc.Copy", "Doc.Properties.Read", "Doc.Comments.Read"];
const DOC_READER_ACTIONS: &[&str] = &["Doc.Users.Read", "Doc.Duplicate"];
const DOC_COMMENTER_ACTIONS: &[&str] = &["Doc.Comments.Create"];

const DOC_EDITOR_ACTIONS: &[&str] = &[
  "Doc.Trash",
  "Doc.Restore",
  "Doc.Delete",
  "Doc.Properties.Update",
  "Doc.Update",
  "Doc.Comments.Update",
  "Doc.Comments.Resolve",
  "Doc.Comments.Delete",
];

const DOC_MANAGER_ACTIONS: &[&str] = &["Doc.Publish", "Doc.Users.Manage"];
const DOC_OWNER_ACTIONS: &[&str] = &["Doc.TransferOwner"];

pub(super) const WORKSPACE_PREVIEW_ACTION: &str = "Workspace.Preview";
pub(super) const DOC_PREVIEW_ACTION: &str = "Doc.Preview";

const WORKSPACE_WRITE_ACTIONS: &[&str] = &[
  "Workspace.Sync",
  "Workspace.CreateDoc",
  "Workspace.Delete",
  "Workspace.TransferOwner",
  "Workspace.Users.Manage",
  "Workspace.Administrators.Manage",
  "Workspace.Properties.Create",
  "Workspace.Properties.Update",
  "Workspace.Properties.Delete",
  "Workspace.Settings.Update",
  "Workspace.Blobs.Write",
  "Workspace.Payment.Manage",
];

const DOC_WRITE_ACTIONS: &[&str] = &[
  "Doc.Duplicate",
  "Doc.Trash",
  "Doc.Restore",
  "Doc.Delete",
  "Doc.Update",
  "Doc.Publish",
  "Doc.TransferOwner",
  "Doc.Properties.Update",
  "Doc.Users.Manage",
  "Doc.Comments.Create",
  "Doc.Comments.Update",
  "Doc.Comments.Delete",
  "Doc.Comments.Resolve",
];

fn action_set(groups: &[&[&str]]) -> BTreeSet<String> {
  groups
    .iter()
    .flat_map(|group| group.iter().copied())
    .map(str::to_string)
    .collect()
}

pub(super) fn workspace_actions_for_role(role: WorkspaceRole) -> BTreeSet<String> {
  match role {
    WorkspaceRole::External => action_set(&[WORKSPACE_EXTERNAL_ACTIONS]),
    WorkspaceRole::Member => action_set(&[WORKSPACE_EXTERNAL_ACTIONS, WORKSPACE_MEMBER_ACTIONS]),
    WorkspaceRole::Admin => action_set(&[
      WORKSPACE_EXTERNAL_ACTIONS,
      WORKSPACE_MEMBER_ACTIONS,
      WORKSPACE_ADMIN_ACTIONS,
    ]),
    WorkspaceRole::Owner => action_set(&[
      WORKSPACE_EXTERNAL_ACTIONS,
      WORKSPACE_MEMBER_ACTIONS,
      WORKSPACE_ADMIN_ACTIONS,
      WORKSPACE_OWNER_ACTIONS,
    ]),
  }
}

pub(super) fn doc_actions_for_role(role: DocRole) -> BTreeSet<String> {
  match role {
    DocRole::None => BTreeSet::new(),
    DocRole::External => action_set(&[DOC_EXTERNAL_ACTIONS]),
    DocRole::Reader => action_set(&[DOC_EXTERNAL_ACTIONS, DOC_READER_ACTIONS]),
    DocRole::Commenter => action_set(&[DOC_EXTERNAL_ACTIONS, DOC_READER_ACTIONS, DOC_COMMENTER_ACTIONS]),
    DocRole::Editor => action_set(&[
      DOC_EXTERNAL_ACTIONS,
      DOC_READER_ACTIONS,
      DOC_COMMENTER_ACTIONS,
      DOC_EDITOR_ACTIONS,
    ]),
    DocRole::Manager => action_set(&[
      DOC_EXTERNAL_ACTIONS,
      DOC_READER_ACTIONS,
      DOC_COMMENTER_ACTIONS,
      DOC_EDITOR_ACTIONS,
      DOC_MANAGER_ACTIONS,
    ]),
    DocRole::Owner => action_set(&[
      DOC_EXTERNAL_ACTIONS,
      DOC_READER_ACTIONS,
      DOC_COMMENTER_ACTIONS,
      DOC_EDITOR_ACTIONS,
      DOC_MANAGER_ACTIONS,
      DOC_OWNER_ACTIONS,
    ]),
  }
}

pub(super) fn is_write_action(action: &str) -> bool {
  WORKSPACE_WRITE_ACTIONS.contains(&action) || DOC_WRITE_ACTIONS.contains(&action)
}

pub(super) fn is_readonly_restricted_action(action: &str) -> bool {
  matches!(
    action,
    "Workspace.CreateDoc"
      | "Workspace.Settings.Update"
      | "Workspace.Properties.Create"
      | "Workspace.Properties.Update"
      | "Workspace.Properties.Delete"
      | "Workspace.Blobs.Write"
      | "Doc.Update"
      | "Doc.Duplicate"
      | "Doc.Publish"
      | "Doc.Comments.Create"
      | "Doc.Comments.Update"
      | "Doc.Comments.Resolve"
  )
}

pub(super) fn role_matrix_json() -> Value {
  let workspace_roles = [
    ("external", WorkspaceRole::External),
    ("member", WorkspaceRole::Member),
    ("admin", WorkspaceRole::Admin),
    ("owner", WorkspaceRole::Owner),
  ]
  .into_iter()
  .map(|(name, role)| (name, workspace_actions_for_role(role).into_iter().collect::<Vec<_>>()))
  .collect::<BTreeMap<_, _>>();

  let doc_roles = [
    ("none", DocRole::None),
    ("external", DocRole::External),
    ("reader", DocRole::Reader),
    ("commenter", DocRole::Commenter),
    ("editor", DocRole::Editor),
    ("manager", DocRole::Manager),
    ("owner", DocRole::Owner),
  ]
  .into_iter()
  .map(|(name, role)| (name, doc_actions_for_role(role).into_iter().collect::<Vec<_>>()))
  .collect::<BTreeMap<_, _>>();

  json!({
    "version": VERSION,
    "workspace": {
      "roles": workspace_roles,
      "capabilityProfiles": {
        "workspacePreview": [WORKSPACE_PREVIEW_ACTION],
      },
      "readonlyWriteActions": {
        "restricted": [
          "Workspace.CreateDoc",
          "Workspace.Settings.Update",
          "Workspace.Properties.Create",
          "Workspace.Properties.Update",
          "Workspace.Properties.Delete",
          "Workspace.Blobs.Write",
        ],
      },
    },
    "doc": {
      "roles": doc_roles,
      "capabilityProfiles": {
        "docPreview": [DOC_PREVIEW_ACTION],
      },
      "readonlyWriteActions": {
        "restricted": [
          "Doc.Update",
          "Doc.Duplicate",
          "Doc.Publish",
          "Doc.Comments.Create",
          "Doc.Comments.Update",
          "Doc.Comments.Resolve",
        ],
      },
    },
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn matrix_artifact_exposes_profiles_and_restrictions() {
    let artifact = role_matrix_json();
    assert_eq!(artifact["version"], 1);
    assert_eq!(
      artifact["doc"]["capabilityProfiles"]["docPreview"][0],
      DOC_PREVIEW_ACTION
    );
    assert_eq!(
      artifact["workspace"]["roles"]["owner"][0],
      "Workspace.Administrators.Manage"
    );
    assert!(
      artifact["doc"]["roles"]["external"]
        .as_array()
        .unwrap()
        .contains(&json!("Doc.Read"))
    );
  }
}
