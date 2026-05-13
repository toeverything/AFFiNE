use super::{
  actions::VERSION,
  candidates::{
    best_doc_role, decide, decide_doc, doc_candidates, parse_workspace_role, role_name, workspace_candidates,
  },
  types::{
    PermissionDocEvaluationOutputV1, PermissionEvaluationInputV1, PermissionEvaluationOutputV1,
    PermissionWorkspaceEvaluationOutputV1,
  },
};

pub fn evaluate_permission(input: PermissionEvaluationInputV1) -> anyhow::Result<PermissionEvaluationOutputV1> {
  if input.version != VERSION {
    anyhow::bail!("unsupported permission evaluation input version: {}", input.version);
  }

  let workspace_candidates = workspace_candidates(&input)?;
  let workspace_decisions = input
    .workspace_actions
    .iter()
    .map(|action| decide(&input, action, &workspace_candidates))
    .collect::<Vec<_>>();
  let workspace_effective_role = workspace_candidates
    .iter()
    .filter_map(|candidate| parse_workspace_role(&candidate.role).ok())
    .max()
    .map(role_name);
  let workspace_resource_owner_role = workspace_candidates
    .iter()
    .any(|candidate| candidate.owner)
    .then(|| "owner".to_string());

  let mut docs = Vec::with_capacity(input.docs.len());
  for doc in &input.docs {
    let candidates = doc_candidates(&input, doc)?;
    let decisions = doc
      .actions
      .iter()
      .map(|action| decide_doc(&input, doc, action, &candidates))
      .collect::<Vec<_>>();
    let resource_owner_role = candidates
      .iter()
      .any(|candidate| candidate.owner)
      .then(|| "owner".to_string());
    docs.push(PermissionDocEvaluationOutputV1 {
      doc_id: doc.doc_id.clone(),
      resource_owner_role,
      effective_role: best_doc_role(&candidates),
      decisions,
    });
  }

  Ok(PermissionEvaluationOutputV1 {
    version: VERSION,
    workspace: PermissionWorkspaceEvaluationOutputV1 {
      resource_owner_role: workspace_resource_owner_role,
      effective_role: workspace_effective_role,
      decisions: workspace_decisions,
    },
    docs,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::permission::types::{
    PermissionDecisionV1, PermissionDocInputV1, PermissionGroupGrantInputV1, PermissionRuntimeInputV1,
    PermissionSubjectInputV1, PermissionWorkspaceInputV1,
  };

  fn base_input() -> PermissionEvaluationInputV1 {
    PermissionEvaluationInputV1 {
      version: 1,
      legacy_compat_mode: false,
      subject: PermissionSubjectInputV1::default(),
      runtime: PermissionRuntimeInputV1 {
        known: true,
        sharing_enabled: Some(true),
        ..Default::default()
      },
      workspace: PermissionWorkspaceInputV1 {
        role: Some("member".to_string()),
        member_state: Some("active".to_string()),
        sharing_enabled: Some(true),
        ..Default::default()
      },
      workspace_actions: vec!["Workspace.Read".to_string(), "Workspace.CreateDoc".to_string()],
      docs: vec![PermissionDocInputV1 {
        doc_id: "doc".to_string(),
        actions: vec!["Doc.Read".to_string(), "Doc.Update".to_string()],
        member_default_role: Some("manager".to_string()),
        ..Default::default()
      }],
    }
  }

  fn decision<'a>(decisions: &'a [PermissionDecisionV1], action: &str) -> &'a PermissionDecisionV1 {
    decisions.iter().find(|decision| decision.action == action).unwrap()
  }

  #[test]
  fn active_member_role_authorizes_workspace_and_doc_default() {
    let output = evaluate_permission(base_input()).unwrap();
    assert!(decision(&output.workspace.decisions, "Workspace.Read").allowed);
    assert!(decision(&output.workspace.decisions, "Workspace.CreateDoc").allowed);
    assert!(decision(&output.docs[0].decisions, "Doc.Read").allowed);
    assert!(decision(&output.docs[0].decisions, "Doc.Update").allowed);
  }

  #[test]
  fn pending_and_waiting_members_do_not_authorize() {
    for state in ["pending", "waiting_review", "waiting_seat"] {
      let mut input = base_input();
      input.workspace.member_state = Some(state.to_string());
      let output = evaluate_permission(input).unwrap();
      assert!(!decision(&output.workspace.decisions, "Workspace.Read").allowed);
      assert!(!decision(&output.docs[0].decisions, "Doc.Read").allowed);
    }
  }

  #[test]
  fn owner_and_admin_inherit_doc_permissions_without_doc_ownership_pollution() {
    let mut owner_input = base_input();
    owner_input.workspace.role = Some("owner".to_string());
    owner_input.docs[0].actions = vec!["Doc.TransferOwner".to_string()];
    let owner_output = evaluate_permission(owner_input).unwrap();
    let owner_doc = &owner_output.docs[0];
    assert!(decision(&owner_doc.decisions, "Doc.TransferOwner").allowed);
    assert_eq!(owner_doc.resource_owner_role, None);
    assert_eq!(owner_doc.effective_role.as_deref(), Some("owner"));

    let mut admin_input = base_input();
    admin_input.workspace.role = Some("admin".to_string());
    admin_input.docs[0].actions = vec!["Doc.Users.Manage".to_string(), "Doc.TransferOwner".to_string()];
    let admin_output = evaluate_permission(admin_input).unwrap();
    assert!(decision(&admin_output.docs[0].decisions, "Doc.Users.Manage").allowed);
    assert!(!decision(&admin_output.docs[0].decisions, "Doc.TransferOwner").allowed);
    assert_eq!(admin_output.docs[0].resource_owner_role, None);
  }

  #[test]
  fn explicit_doc_grant_sets_resource_owner_only_for_owner_grant() {
    let mut input = base_input();
    input.docs[0].explicit_user_role = Some("reader".to_string());
    input.docs[0].member_default_role = Some("manager".to_string());
    input.docs[0].actions = vec!["Doc.Read".to_string(), "Doc.Update".to_string()];
    let output = evaluate_permission(input).unwrap();
    assert!(decision(&output.docs[0].decisions, "Doc.Read").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Update").allowed);
    assert_eq!(output.docs[0].resource_owner_role, None);

    let mut owner_input = base_input();
    owner_input.docs[0].explicit_user_role = Some("owner".to_string());
    owner_input.docs[0].actions = vec!["Doc.TransferOwner".to_string()];
    let owner_output = evaluate_permission(owner_input).unwrap();
    assert!(decision(&owner_output.docs[0].decisions, "Doc.TransferOwner").allowed);
    assert_eq!(owner_output.docs[0].resource_owner_role.as_deref(), Some("owner"));
  }

  #[test]
  fn explicit_none_legacy_row_behaves_like_missing_grant() {
    let mut input = base_input();
    input.docs[0].explicit_user_role = Some("none".to_string());
    input.docs[0].member_default_role = Some("manager".to_string());
    input.docs[0].actions = vec!["Doc.Update".to_string()];
    let output = evaluate_permission(input).unwrap();
    let update = decision(&output.docs[0].decisions, "Doc.Update");
    assert!(update.allowed);
    assert_eq!(update.sources[0].source_type, "member-default-policy");
  }

  #[test]
  fn non_member_explicit_doc_grant_is_capped_at_editor() {
    let mut input = base_input();
    input.workspace.role = None;
    input.docs[0].explicit_user_role = Some("owner".to_string());
    input.docs[0].actions = vec![
      "Doc.Update".to_string(),
      "Doc.Users.Manage".to_string(),
      "Doc.TransferOwner".to_string(),
    ];
    let output = evaluate_permission(input).unwrap();

    assert!(decision(&output.docs[0].decisions, "Doc.Update").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Users.Manage").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.TransferOwner").allowed);
    assert_eq!(output.docs[0].effective_role.as_deref(), Some("editor"));
    assert_eq!(output.docs[0].resource_owner_role, None);
  }

  #[test]
  fn legacy_external_workspace_row_does_not_uncap_explicit_doc_grant() {
    let mut input = base_input();
    input.workspace.role = Some("external".to_string());
    input.docs[0].explicit_user_role = Some("owner".to_string());
    input.docs[0].actions = vec![
      "Doc.Update".to_string(),
      "Doc.Users.Manage".to_string(),
      "Doc.TransferOwner".to_string(),
    ];
    let output = evaluate_permission(input).unwrap();

    assert!(decision(&output.docs[0].decisions, "Doc.Update").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Users.Manage").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.TransferOwner").allowed);
    assert_eq!(output.docs[0].effective_role.as_deref(), Some("editor"));
    assert_eq!(output.docs[0].resource_owner_role, None);
  }

  #[test]
  fn public_workspace_policy_does_not_uncap_explicit_doc_grant() {
    let mut input = base_input();
    input.workspace.role = None;
    input.workspace.public = true;
    input.docs[0].explicit_user_role = Some("owner".to_string());
    input.docs[0].actions = vec![
      "Doc.Update".to_string(),
      "Doc.Users.Manage".to_string(),
      "Doc.TransferOwner".to_string(),
    ];
    let output = evaluate_permission(input).unwrap();

    assert!(decision(&output.docs[0].decisions, "Doc.Update").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Users.Manage").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.TransferOwner").allowed);
    assert_eq!(output.docs[0].effective_role.as_deref(), Some("editor"));
    assert_eq!(output.docs[0].resource_owner_role, None);
  }

  #[test]
  fn member_default_none_unions_with_public_policy() {
    let mut input = base_input();
    input.docs[0].member_default_role = Some("none".to_string());
    input.docs[0].visibility = Some("public".to_string());
    input.docs[0].public_role = Some("external".to_string());
    input.docs[0].actions = vec![
      "Doc.Read".to_string(),
      "Doc.Users.Read".to_string(),
      "Doc.Duplicate".to_string(),
    ];
    let output = evaluate_permission(input).unwrap();
    assert!(decision(&output.docs[0].decisions, "Doc.Read").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Users.Read").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Duplicate").allowed);
  }

  #[test]
  fn public_doc_external_profile_and_url_preview_do_not_grant_read() {
    let mut public_input = base_input();
    public_input.workspace.role = None;
    public_input.docs[0].visibility = Some("public".to_string());
    public_input.docs[0].public_role = Some("external".to_string());
    public_input.docs[0].actions = vec!["Doc.Read".to_string(), "Doc.Users.Read".to_string()];
    let public_output = evaluate_permission(public_input).unwrap();
    assert!(decision(&public_output.docs[0].decisions, "Doc.Read").allowed);
    assert!(!decision(&public_output.docs[0].decisions, "Doc.Users.Read").allowed);

    let mut preview_input = base_input();
    preview_input.workspace.role = None;
    preview_input.runtime.url_preview_enabled = Some(true);
    preview_input.docs[0].actions = vec!["Doc.Preview".to_string(), "Doc.Read".to_string()];
    let preview_output = evaluate_permission(preview_input).unwrap();
    assert!(decision(&preview_output.docs[0].decisions, "Doc.Preview").allowed);
    assert!(!decision(&preview_output.docs[0].decisions, "Doc.Read").allowed);
  }

  #[test]
  fn public_workspace_shell_does_not_grant_private_doc_read() {
    let mut input = base_input();
    input.workspace.role = None;
    input.workspace.public = true;
    input.workspace_actions = vec!["Workspace.Read".to_string()];
    input.docs[0].member_default_role = Some("manager".to_string());
    input.docs[0].visibility = Some("private".to_string());
    input.docs[0].public_role = None;
    input.docs[0].actions = vec!["Doc.Read".to_string()];

    let output = evaluate_permission(input).unwrap();

    assert!(decision(&output.workspace.decisions, "Workspace.Read").allowed);
    assert!(!decision(&output.docs[0].decisions, "Doc.Read").allowed);
  }

  #[test]
  fn sharing_disabled_blocks_public_and_non_member_explicit_sources() {
    let mut input = base_input();
    input.workspace.role = None;
    input.runtime.sharing_enabled = Some(false);
    input.docs[0].visibility = Some("public".to_string());
    input.docs[0].public_role = Some("external".to_string());
    input.docs[0].explicit_user_role = Some("reader".to_string());
    input.docs[0].actions = vec!["Doc.Read".to_string()];
    let output = evaluate_permission(input).unwrap();
    assert!(!decision(&output.docs[0].decisions, "Doc.Read").allowed);
  }

  #[test]
  fn doc_publish_requires_sharing_enabled() {
    let mut input = base_input();
    input.docs[0].member_default_role = Some("manager".to_string());
    input.docs[0].actions = vec!["Doc.Publish".to_string()];
    let output = evaluate_permission(input).unwrap();
    assert!(decision(&output.docs[0].decisions, "Doc.Publish").allowed);

    let mut disabled_input = base_input();
    disabled_input.runtime.sharing_enabled = Some(false);
    disabled_input.docs[0].member_default_role = Some("manager".to_string());
    disabled_input.docs[0].actions = vec!["Doc.Publish".to_string()];
    let disabled_output = evaluate_permission(disabled_input).unwrap();
    let publish = decision(&disabled_output.docs[0].decisions, "Doc.Publish");
    assert!(!publish.allowed);
    assert_eq!(publish.restrictions[0].restriction_type, "sharing-disabled");
  }

  #[test]
  fn readonly_and_unknown_runtime_fail_closed_for_write_actions() {
    let mut input = base_input();
    input.runtime.readonly = true;
    input.runtime.readonly_reason = Some("storage_overflow".to_string());
    input.docs[0].actions = vec!["Doc.Read".to_string(), "Doc.Update".to_string()];
    let output = evaluate_permission(input).unwrap();
    assert!(decision(&output.docs[0].decisions, "Doc.Read").allowed);
    let update = decision(&output.docs[0].decisions, "Doc.Update");
    assert!(!update.allowed);
    assert_eq!(update.restrictions[0].restriction_type, "readonly");

    let mut unknown_input = base_input();
    unknown_input.runtime.known = false;
    let unknown_output = evaluate_permission(unknown_input).unwrap();
    assert!(!decision(&unknown_output.workspace.decisions, "Workspace.CreateDoc").allowed);

    let mut stale_input = base_input();
    stale_input.runtime.stale = true;
    let stale_output = evaluate_permission(stale_input).unwrap();
    let create_doc = decision(&stale_output.workspace.decisions, "Workspace.CreateDoc");
    assert!(!create_doc.allowed);
    assert_eq!(create_doc.restrictions[0].restriction_type, "runtime_stale");
  }

  #[test]
  fn legacy_local_workspace_fallback_is_opt_in() {
    let mut input = base_input();
    input.legacy_compat_mode = true;
    input.subject.allow_local = true;
    input.workspace = PermissionWorkspaceInputV1 {
      local: true,
      ..Default::default()
    };
    input.workspace_actions = vec!["Workspace.Delete".to_string()];
    let output = evaluate_permission(input).unwrap();
    assert!(decision(&output.workspace.decisions, "Workspace.Delete").allowed);
  }

  #[test]
  fn empty_group_ids_do_not_enable_group_grants() {
    let mut input = base_input();
    input.docs[0].member_default_role = Some("none".to_string());
    input.docs[0].group_grants_enabled = true;
    input.docs[0].group_grants = vec![PermissionGroupGrantInputV1 {
      group_id: "group".to_string(),
      role: "manager".to_string(),
    }];
    input.docs[0].actions = vec!["Doc.Update".to_string()];
    let output = evaluate_permission(input).unwrap();
    assert!(!decision(&output.docs[0].decisions, "Doc.Update").allowed);
  }
}
