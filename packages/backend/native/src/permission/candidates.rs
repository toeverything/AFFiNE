use std::collections::BTreeSet;

use serde::Serialize;

use super::{
  actions::{
    DOC_PREVIEW_ACTION, WORKSPACE_PREVIEW_ACTION, doc_actions_for_role, is_readonly_restricted_action, is_write_action,
    workspace_actions_for_role,
  },
  types::{
    Candidate, DocRole, PermissionDecisionRestrictionV1, PermissionDecisionSourceV1, PermissionDecisionV1,
    PermissionDocInputV1, PermissionEvaluationInputV1, WorkspaceRole,
  },
};

pub(super) fn parse_workspace_role(role: &str) -> anyhow::Result<WorkspaceRole> {
  match role {
    "external" => Ok(WorkspaceRole::External),
    "member" => Ok(WorkspaceRole::Member),
    "admin" => Ok(WorkspaceRole::Admin),
    "owner" => Ok(WorkspaceRole::Owner),
    _ => anyhow::bail!("unknown workspace role: {role}"),
  }
}

fn parse_doc_role(role: &str) -> anyhow::Result<DocRole> {
  match role {
    "none" => Ok(DocRole::None),
    "external" => Ok(DocRole::External),
    "reader" => Ok(DocRole::Reader),
    "commenter" => Ok(DocRole::Commenter),
    "editor" => Ok(DocRole::Editor),
    "manager" => Ok(DocRole::Manager),
    "owner" => Ok(DocRole::Owner),
    _ => anyhow::bail!("unknown doc role: {role}"),
  }
}

pub(super) fn role_name(role: impl Serialize) -> String {
  serde_json::to_value(role)
    .ok()
    .and_then(|value| value.as_str().map(str::to_string))
    .unwrap_or_default()
}

fn active_workspace_role(input: &PermissionEvaluationInputV1) -> anyhow::Result<Option<WorkspaceRole>> {
  let Some(role) = input.workspace.role.as_deref() else {
    if input.workspace.local && input.subject.allow_local {
      return Ok(Some(WorkspaceRole::Owner));
    }
    if input.workspace.public && sharing_enabled(input, None) {
      return Ok(Some(WorkspaceRole::External));
    }
    return Ok(None);
  };
  if input.workspace.member_state.as_deref().unwrap_or("active") != "active" {
    return Ok(None);
  }
  let role = parse_workspace_role(role)?;
  if role == WorkspaceRole::External {
    return Ok(None);
  }
  Ok(Some(role))
}

fn sharing_enabled(input: &PermissionEvaluationInputV1, doc: Option<&PermissionDocInputV1>) -> bool {
  doc
    .and_then(|doc| doc.sharing_enabled)
    .or(input.runtime.sharing_enabled)
    .or(input.workspace.sharing_enabled)
    .unwrap_or(true)
}

fn url_preview_enabled(input: &PermissionEvaluationInputV1) -> bool {
  input
    .runtime
    .url_preview_enabled
    .or(input.workspace.url_preview_enabled)
    .unwrap_or(false)
}

fn restricted_decision(input: &PermissionEvaluationInputV1, action: &str) -> Vec<PermissionDecisionRestrictionV1> {
  if !is_write_action(action) {
    return Vec::new();
  }

  if input.legacy_compat_mode && input.subject.allow_local && input.workspace.local {
    return Vec::new();
  }

  let mut restrictions = Vec::new();
  if !input.runtime.known {
    restrictions.push(PermissionDecisionRestrictionV1 {
      restriction_type: "runtime_unknown",
      reason: None,
    });
  }
  if input.runtime.stale {
    restrictions.push(PermissionDecisionRestrictionV1 {
      restriction_type: "runtime_stale",
      reason: None,
    });
  }
  if input.runtime.readonly && is_readonly_restricted_action(action) {
    restrictions.push(PermissionDecisionRestrictionV1 {
      restriction_type: "readonly",
      reason: input.runtime.readonly_reason.clone(),
    });
  }
  restrictions
}

pub(super) fn decide(
  input: &PermissionEvaluationInputV1,
  action: &str,
  candidates: &[Candidate],
) -> PermissionDecisionV1 {
  let sources = candidates
    .iter()
    .filter(|candidate| candidate.actions.contains(action))
    .map(|candidate| PermissionDecisionSourceV1 {
      source_type: candidate.source_type,
      role: Some(candidate.role.clone()),
    })
    .collect::<Vec<_>>();
  let restrictions = restricted_decision(input, action);

  PermissionDecisionV1 {
    action: action.to_string(),
    allowed: !sources.is_empty() && restrictions.is_empty(),
    sources,
    restrictions,
  }
}

pub(super) fn decide_doc(
  input: &PermissionEvaluationInputV1,
  doc: &PermissionDocInputV1,
  action: &str,
  candidates: &[Candidate],
) -> PermissionDecisionV1 {
  let mut decision = decide(input, action, candidates);
  if action == "Doc.Publish" && !sharing_enabled(input, Some(doc)) {
    decision.restrictions.push(PermissionDecisionRestrictionV1 {
      restriction_type: "sharing-disabled",
      reason: None,
    });
    decision.allowed = false;
  }
  decision
}

pub(super) fn workspace_candidates(input: &PermissionEvaluationInputV1) -> anyhow::Result<Vec<Candidate>> {
  let mut candidates = Vec::new();
  if let Some(role) = active_workspace_role(input)? {
    candidates.push(Candidate {
      source_type: "workspace-member",
      role: role_name(role),
      actions: workspace_actions_for_role(role),
      owner: role == WorkspaceRole::Owner,
    });
  }

  if input.legacy_compat_mode && input.subject.allow_local && input.workspace.local {
    candidates.push(Candidate {
      source_type: "local-workspace",
      role: "owner".to_string(),
      actions: workspace_actions_for_role(WorkspaceRole::Owner),
      owner: true,
    });
  }

  if input.workspace.public && sharing_enabled(input, None) {
    candidates.push(Candidate {
      source_type: "workspace-policy",
      role: "external".to_string(),
      actions: workspace_actions_for_role(WorkspaceRole::External),
      owner: false,
    });
  }

  if sharing_enabled(input, None) && (input.workspace.public || url_preview_enabled(input)) {
    candidates.push(Candidate {
      source_type: "workspace-preview-policy",
      role: "preview".to_string(),
      actions: BTreeSet::from([WORKSPACE_PREVIEW_ACTION.to_string()]),
      owner: false,
    });
  }

  Ok(candidates)
}

pub(super) fn best_doc_role(candidates: &[Candidate]) -> Option<String> {
  candidates
    .iter()
    .filter_map(|candidate| parse_doc_role(&candidate.role).ok())
    .filter(|role| *role != DocRole::None)
    .max()
    .map(role_name)
}

pub(super) fn doc_candidates(
  input: &PermissionEvaluationInputV1,
  doc: &PermissionDocInputV1,
) -> anyhow::Result<Vec<Candidate>> {
  let mut candidates = Vec::new();
  let active_workspace_role = active_workspace_role(input)?;
  let active_workspace_member = matches!(
    active_workspace_role,
    Some(WorkspaceRole::Member | WorkspaceRole::Admin | WorkspaceRole::Owner)
  );
  let sharing = sharing_enabled(input, Some(doc));

  match active_workspace_role {
    Some(WorkspaceRole::Owner) => candidates.push(Candidate {
      source_type: "inherited-workspace-role",
      role: "owner".to_string(),
      actions: doc_actions_for_role(DocRole::Owner),
      owner: false,
    }),
    Some(WorkspaceRole::Admin) => candidates.push(Candidate {
      source_type: "inherited-workspace-role",
      role: "manager".to_string(),
      actions: doc_actions_for_role(DocRole::Manager),
      owner: false,
    }),
    _ => {}
  }

  let explicit_user_role = doc
    .explicit_user_role
    .as_deref()
    .map(parse_doc_role)
    .transpose()?
    .filter(|role| *role != DocRole::None);

  if let Some(mut role) = explicit_user_role {
    if !active_workspace_member {
      role = role.min(DocRole::Editor);
    }
    if active_workspace_member || sharing {
      candidates.push(Candidate {
        source_type: "doc-grant",
        role: role_name(role),
        actions: doc_actions_for_role(role),
        owner: role == DocRole::Owner,
      });
    }
  }

  if doc.group_grants_enabled && !input.subject.group_ids.is_empty() {
    let subject_groups = input.subject.group_ids.iter().collect::<BTreeSet<_>>();
    for grant in &doc.group_grants {
      if subject_groups.contains(&grant.group_id) {
        let role = parse_doc_role(&grant.role)?;
        candidates.push(Candidate {
          source_type: "group-grant",
          role: role_name(role),
          actions: doc_actions_for_role(role),
          owner: false,
        });
      }
    }
  }

  if matches!(active_workspace_role, Some(role) if role != WorkspaceRole::External)
    && explicit_user_role.is_none()
    && let Some(role) = doc.member_default_role.as_deref()
  {
    let role = parse_doc_role(role)?;
    candidates.push(Candidate {
      source_type: "member-default-policy",
      role: role_name(role),
      actions: doc_actions_for_role(role),
      owner: false,
    });
  }

  if sharing
    && doc.visibility.as_deref() == Some("public")
    && let Some(role) = doc.public_role.as_deref()
  {
    let role = parse_doc_role(role)?;
    candidates.push(Candidate {
      source_type: "public-policy",
      role: role_name(role),
      actions: doc_actions_for_role(role),
      owner: false,
    });
  }

  if sharing && (doc.preview_enabled || doc.visibility.as_deref() == Some("public") || url_preview_enabled(input)) {
    candidates.push(Candidate {
      source_type: "doc-preview-policy",
      role: "preview".to_string(),
      actions: BTreeSet::from([DOC_PREVIEW_ACTION.to_string()]),
      owner: false,
    });
  }

  if !sharing {
    for candidate in &mut candidates {
      candidate.actions.remove("Doc.Publish");
    }
  }

  Ok(candidates)
}
