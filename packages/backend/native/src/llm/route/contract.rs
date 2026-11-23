use std::sync::Arc;

use llm_adapter::{
  backend::{BackendProvider, CredentialPlan},
  capability::{DeclaredModelCapability, declared_model_matches},
  target::PreparedBackendTarget,
};

#[derive(Clone)]
pub(crate) struct ResolvedManagedTarget {
  pub(crate) profile_id: String,
  pub(crate) provider: BackendProvider,
  pub(crate) target: PreparedBackendTarget,
  pub(crate) capabilities: Vec<DeclaredModelCapability>,
  pub(crate) credential_plan: Arc<CredentialPlan>,
  pub(crate) credential_config: Arc<serde_json::Value>,
}

impl ResolvedManagedTarget {
  pub(crate) fn supports(&self, slot: &super::CatalogSlot) -> bool {
    declared_model_matches(&self.capabilities, &slot.requirements)
  }
}

#[napi_derive::napi(string_enum)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CopilotManagedTier {
  Standard,
  Premium,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CopilotAccessProjection {
  pub route_allowed: bool,
  pub managed_tier: CopilotManagedTier,
  pub server_byok: bool,
  pub local_byok: bool,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CopilotTargetOverrideInput {
  pub profile_id: String,
  pub model_id: String,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CopilotRouteCheckInput {
  pub slot: String,
  pub built_in_route_id: Option<String>,
  pub workspace_id: Option<String>,
  pub user_id: Option<String>,
  pub local_lease_id: Option<String>,
  pub access: CopilotAccessProjection,
  pub managed_target_id: Option<String>,
  pub target_override: Option<CopilotTargetOverrideInput>,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct CopilotExecuteInput {
  pub slot: String,
  pub built_in_route_id: Option<String>,
  pub workspace_id: Option<String>,
  pub user_id: Option<String>,
  pub local_lease_id: Option<String>,
  pub access: CopilotAccessProjection,
  pub managed_target_id: Option<String>,
  pub target_override: Option<CopilotTargetOverrideInput>,
  #[napi(ts_type = "unknown")]
  pub request: serde_json::Value,
}
