use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AuthorizePermissionInputV1 {
  pub version: u32,
  pub workspace_id: String,
  #[serde(default)]
  pub actor_user_id: Option<String>,
  #[serde(default)]
  pub workspace_actions: Vec<String>,
  #[serde(default)]
  pub docs: Vec<AuthorizePermissionDocInputV1>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AuthorizePermissionDocInputV1 {
  pub doc_id: String,
  #[serde(default)]
  pub actions: Vec<String>,
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
  #[serde(skip)]
  pub sources: Vec<PermissionDecisionSourceV1>,
  #[serde(skip)]
  pub restrictions: Vec<PermissionDecisionRestrictionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionWorkspaceEvaluationOutputV1 {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub effective_role: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub preview_exposure: Option<&'static str>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub preview_basis: Option<&'static str>,
  pub decisions: Vec<PermissionDecisionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDocEvaluationOutputV1 {
  pub doc_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub effective_role: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub preview_exposure: Option<&'static str>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub preview_basis: Option<&'static str>,
  pub decisions: Vec<PermissionDecisionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionEvaluationOutputV1 {
  pub version: u32,
  pub workspace: PermissionWorkspaceEvaluationOutputV1,
  pub docs: Vec<PermissionDocEvaluationOutputV1>,
}
