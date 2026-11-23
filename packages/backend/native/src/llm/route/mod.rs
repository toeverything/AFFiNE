mod catalog;
mod contract;
mod policy;

pub(crate) use catalog::{
  CatalogSlot, ManagedTarget, QuotaPolicy, RouteOperation, managed_catalog, managed_selected_target, managed_targets,
  quota_policy, slot, with_request_requirements,
};
pub(crate) use contract::ResolvedManagedTarget;
pub use contract::{
  CopilotAccessProjection, CopilotExecuteInput, CopilotManagedTier, CopilotRouteCheckInput, CopilotTargetOverrideInput,
};
pub(crate) use policy::{
  AuthorizedProviderProfile, AuthorizedRouteTargets, CredentialRef, ProfileSource, RouteDecision, RouteDecisionReason,
  RoutePolicyInput, TargetOverride, decide,
};
