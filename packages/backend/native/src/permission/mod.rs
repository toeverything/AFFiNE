mod types;

use affine_core::access_control::{DecisionSource, DenialReason, DocRole, doc_role_allows as core_doc_role_allows};
use napi_derive::napi;
pub use types::*;

#[napi(object)]
pub struct CanonicalDocumentIdentity {
  pub workspace_id: String,
  pub doc_id: String,
  pub variant: String,
  pub is_workspace: bool,
}

#[napi]
pub fn canonicalize_document_identity(
  raw_id: String,
  workspace_hint: Option<String>,
) -> napi::Result<CanonicalDocumentIdentity> {
  let identity = affine_core::access_control::canonicalize_document_identity(&raw_id, workspace_hint.as_deref())
    .map_err(|error| napi::Error::from_reason(format!("invalid document identity: {error:?}")))?;
  Ok(CanonicalDocumentIdentity {
    workspace_id: identity.workspace_id().to_string(),
    doc_id: identity.doc_id().to_string(),
    variant: identity.variant().as_str().to_string(),
    is_workspace: identity.is_workspace(),
  })
}

pub(crate) fn permission_evaluation_output(
  decision: affine_core::access_control::AuthorizationDecision,
) -> PermissionEvaluationOutputV1 {
  PermissionEvaluationOutputV1 {
    version: 1,
    workspace: PermissionWorkspaceEvaluationOutputV1 {
      effective_role: decision.effective_workspace_role.map(|role| role.as_str().to_string()),
      preview_exposure: decision.workspace_preview.map(|preview| preview.exposure.as_str()),
      preview_basis: decision.workspace_preview.map(|preview| preview.basis.as_str()),
      decisions: decision.workspace.into_iter().map(map_decision).collect(),
    },
    docs: decision
      .docs
      .into_iter()
      .map(|doc| PermissionDocEvaluationOutputV1 {
        doc_id: doc.doc_id,
        effective_role: doc.effective_role.map(|role| role.as_str().to_string()),
        preview_exposure: doc.preview.map(|preview| preview.exposure.as_str()),
        preview_basis: doc.preview.map(|preview| preview.basis.as_str()),
        decisions: doc.decisions.into_iter().map(map_decision).collect(),
      })
      .collect(),
  }
}

fn parse_doc_role(role: &str) -> anyhow::Result<DocRole> {
  DocRole::parse(role).ok_or_else(|| anyhow::anyhow!("unknown doc role: {role}"))
}

fn map_decision(decision: affine_core::access_control::Decision) -> PermissionDecisionV1 {
  PermissionDecisionV1 {
    action: decision.action,
    allowed: decision.allowed,
    sources: decision
      .source
      .into_iter()
      .map(|source| PermissionDecisionSourceV1 {
        source_type: match source {
          DecisionSource::WorkspaceMember => "workspace-member",
          DecisionSource::WorkspacePolicy => "workspace-policy",
          DecisionSource::WorkspacePreviewPolicy => "workspace-preview-policy",
          DecisionSource::InheritedWorkspaceRole => "inherited-workspace-role",
          DecisionSource::DocGrant => "doc-grant",
          DecisionSource::MemberDefaultPolicy => "member-default-policy",
          DecisionSource::PublicPolicy => "public-policy",
          DecisionSource::DocPreviewPolicy => "doc-preview-policy",
        },
        role: None,
      })
      .collect(),
    restrictions: decision
      .denial_reason
      .into_iter()
      .map(|reason| PermissionDecisionRestrictionV1 {
        restriction_type: match reason {
          DenialReason::UnknownAction => "unknown_action",
          DenialReason::WorkspaceNotFound => "workspace_not_found",
          DenialReason::SharingDisabled => "sharing-disabled",
          DenialReason::CommercialEntitlementRequired => "commercial_entitlement_required",
          DenialReason::ActiveMemberRequired => "active_member_required",
          DenialReason::WorkspaceAdminRequired => "workspace_admin_required",
        },
        reason: None,
      })
      .collect(),
  }
}

#[napi(object)]
pub struct PermissionActionCatalogV1 {
  pub workspace: Vec<String>,
  pub doc: Vec<String>,
}

#[napi]
pub fn permission_action_catalog_v1() -> PermissionActionCatalogV1 {
  PermissionActionCatalogV1 {
    workspace: affine_core::access_control::workspace_action_catalog()
      .iter()
      .map(|action| action.as_str().to_string())
      .collect(),
    doc: affine_core::access_control::doc_action_catalog()
      .iter()
      .map(|action| action.as_str().to_string())
      .collect(),
  }
}

pub(crate) fn doc_role_allows(role: &str, action: &str) -> anyhow::Result<bool> {
  let role = parse_doc_role(role)?;
  let action = affine_core::access_control::DocAction::parse(action)
    .ok_or_else(|| anyhow::anyhow!("unknown doc action: {action}"))?;
  Ok(core_doc_role_allows(role, action))
}

#[cfg(test)]
#[path = "../tests/permission/tests.rs"]
mod tests;
