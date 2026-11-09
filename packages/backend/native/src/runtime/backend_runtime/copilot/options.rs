use super::{BackendRuntime, to_napi_error};
use crate::{
  llm::{
    BuiltInManagedTargetTier, BuiltInRouteOptions, built_in_managed_operations, built_in_managed_target,
    llm_get_built_in_route_options,
  },
  runtime::{BackendRuntimeConfig, Deployment},
};

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub fn get_copilot_route_options(&self, name: String) -> napi::Result<Option<BuiltInRouteOptions>> {
    let config = self.config().map_err(to_napi_error)?;
    Ok(route_options(&config, &name))
  }
}

pub(super) fn route_options(config: &BackendRuntimeConfig, name: &str) -> Option<BuiltInRouteOptions> {
  let mut options = llm_get_built_in_route_options(name.to_string())?;
  let operations = built_in_managed_operations(name)?;
  options.choices.retain(|choice| {
    config.copilot.enabled
      && config.deployment == Deployment::Cloud
      && built_in_managed_target(name, &choice.id, true).is_some_and(|target| {
        operations
          .iter()
          .all(|operation| config.copilot.managed_binding(&target.target, *operation).is_some())
      })
  });
  if !options.standard_default_target_id.as_ref().is_some_and(|id| {
    options
      .choices
      .iter()
      .any(|choice| &choice.id == id && choice.minimum_tier == BuiltInManagedTargetTier::Standard)
  }) {
    options.standard_default_target_id = None;
  }
  if !options
    .premium_default_target_id
    .as_ref()
    .is_some_and(|id| options.choices.iter().any(|choice| &choice.id == id))
  {
    options.premium_default_target_id = None;
  }
  Some(options)
}
