use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum WorkspaceRole {
  External,
  Member,
  Admin,
  Owner,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum DocRole {
  None,
  External,
  Reader,
  Commenter,
  Editor,
  Manager,
  Owner,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionSubjectInputV1 {
  #[serde(default)]
  pub user_id: Option<String>,
  #[serde(default)]
  pub group_ids: Vec<String>,
  #[serde(default)]
  pub allow_local: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRuntimeInputV1 {
  #[serde(default)]
  pub known: bool,
  #[serde(default)]
  pub stale: bool,
  #[serde(default)]
  pub readonly: bool,
  #[serde(default)]
  pub readonly_reason: Option<String>,
  #[serde(default)]
  pub sharing_enabled: Option<bool>,
  #[serde(default)]
  pub url_preview_enabled: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionWorkspaceInputV1 {
  #[serde(default)]
  pub role: Option<String>,
  #[serde(default)]
  pub member_state: Option<String>,
  #[serde(default)]
  pub public: bool,
  #[serde(default)]
  pub sharing_enabled: Option<bool>,
  #[serde(default)]
  pub url_preview_enabled: Option<bool>,
  #[serde(default)]
  pub local: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionGroupGrantInputV1 {
  pub group_id: String,
  pub role: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDocInputV1 {
  pub doc_id: String,
  #[serde(default)]
  pub actions: Vec<String>,
  #[serde(default)]
  pub explicit_user_role: Option<String>,
  #[serde(default)]
  pub group_grants: Vec<PermissionGroupGrantInputV1>,
  #[serde(default)]
  pub group_grants_enabled: bool,
  #[serde(default)]
  pub member_default_role: Option<String>,
  #[serde(default)]
  pub public_role: Option<String>,
  #[serde(default)]
  pub visibility: Option<String>,
  #[serde(default)]
  pub sharing_enabled: Option<bool>,
  #[serde(default)]
  pub preview_enabled: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionEvaluationInputV1 {
  pub version: u32,
  #[serde(default)]
  pub legacy_compat_mode: bool,
  #[serde(default)]
  pub subject: PermissionSubjectInputV1,
  #[serde(default)]
  pub runtime: PermissionRuntimeInputV1,
  #[serde(default)]
  pub workspace: PermissionWorkspaceInputV1,
  #[serde(default)]
  pub workspace_actions: Vec<String>,
  #[serde(default)]
  pub docs: Vec<PermissionDocInputV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecisionSourceV1 {
  #[serde(rename = "type")]
  pub source_type: &'static str,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub role: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecisionRestrictionV1 {
  #[serde(rename = "type")]
  pub restriction_type: &'static str,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecisionV1 {
  pub action: String,
  pub allowed: bool,
  pub sources: Vec<PermissionDecisionSourceV1>,
  pub restrictions: Vec<PermissionDecisionRestrictionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionWorkspaceEvaluationOutputV1 {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub resource_owner_role: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub effective_role: Option<String>,
  pub decisions: Vec<PermissionDecisionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDocEvaluationOutputV1 {
  pub doc_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub resource_owner_role: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub effective_role: Option<String>,
  pub decisions: Vec<PermissionDecisionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionEvaluationOutputV1 {
  pub version: u32,
  pub workspace: PermissionWorkspaceEvaluationOutputV1,
  pub docs: Vec<PermissionDocEvaluationOutputV1>,
}

#[derive(Clone)]
pub(super) struct Candidate {
  pub source_type: &'static str,
  pub role: String,
  pub actions: BTreeSet<String>,
  pub owner: bool,
}
