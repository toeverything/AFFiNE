use std::sync::Arc;

use llm_adapter::{core::default_model_registry_variants, target::prepare_backend_target};

use super::{
  BackendOperation, CopilotRuntimeConfig, EgressPolicy, ManagedTarget, ResolvedManagedTarget, RuntimeResult, route,
  validate_copilot_config,
};

#[derive(Clone)]
pub(crate) struct ManagedRouteBinding {
  pub(crate) target: ManagedTarget,
  pub(crate) operation: BackendOperation,
  pub(crate) resolved: ResolvedManagedTarget,
}

impl CopilotRuntimeConfig {
  pub(crate) fn initialize_managed_routes(&mut self) -> RuntimeResult<()> {
    validate_copilot_config(self)?;
    let profiles = self
      .providers
      .profiles
      .iter()
      .filter(|profile| profile.enabled)
      .map(|profile| {
        Ok((
          profile,
          profile.provider.endpoint(&profile.config)?,
          Arc::new(profile.provider.credential_plan(&profile.config)?),
          Arc::new(profile.config.clone()),
        ))
      })
      .collect::<RuntimeResult<Vec<_>>>()?;
    let variants = default_model_registry_variants();
    let mut bindings = Vec::new();
    for (target, operation) in route::managed_catalog() {
      let mut selected = None;
      'shapes: for shape in &target.api_shapes {
        for preferred in [true, false] {
          for (profile, endpoint, credential_plan, credential_config) in &profiles {
            for variant in variants.iter().filter(|variant| {
              profile.provider.matches_registry_backend(&variant.backend_kind)
                && variant.matches_model(&target.model_id)
            }) {
              for binding in variant.operation_routes(operation)? {
                let layer = binding.request_layer;
                if layer.api_shape() != *shape
                  || !profile
                    .provider
                    .configured_layer_matches(&profile.config, layer, operation)?
                {
                  continue;
                }
                let matches = profile
                  .models
                  .iter()
                  .any(|model| variant.matches_model(model) || model == &binding.wire_model);
                if matches != preferred {
                  continue;
                }
                selected = Some(ResolvedManagedTarget {
                  profile_id: profile.id.clone(),
                  provider: profile.provider,
                  target: prepare_backend_target(
                    layer,
                    operation,
                    binding.wire_model,
                    endpoint,
                    Some(30 * 60 * 1000),
                    EgressPolicy::PublicOnly,
                  )?,
                  capabilities: binding.capabilities,
                  credential_plan: Arc::clone(credential_plan),
                  credential_config: Arc::clone(credential_config),
                });
                break 'shapes;
              }
            }
          }
        }
      }
      if let Some(resolved) = selected {
        bindings.push(ManagedRouteBinding {
          target,
          operation,
          resolved,
        });
      }
    }
    self.managed_routes = bindings;
    Ok(())
  }

  pub(crate) fn managed_binding(
    &self,
    target: &ManagedTarget,
    operation: BackendOperation,
  ) -> Option<&ResolvedManagedTarget> {
    self
      .managed_routes
      .iter()
      .find(|binding| &binding.target == target && binding.operation == operation)
      .map(|binding| &binding.resolved)
  }
}
