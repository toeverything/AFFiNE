use llm_adapter::{
  capability::declared_model_matches,
  target::{BackendEndpoint, EgressPolicy, OpenAiDialect},
};

use super::CatalogSlot;
use crate::llm::byok::ByokModelDeclaration;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Deployment {
  Cloud,
  SelfHosted,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProfileSource {
  Server,
  Local,
  Managed,
}

pub(crate) struct AuthorizedProviderProfile {
  pub(crate) profile_id: String,
  pub(crate) source: ProfileSource,
  pub(crate) provider: String,
  pub(crate) endpoint: BackendEndpoint,
  pub(crate) openai_dialect: Option<OpenAiDialect>,
  pub(crate) egress_policy: EgressPolicy,
  pub(crate) models: Vec<ByokModelDeclaration>,
  pub(crate) sort_order: i32,
  pub(crate) credential_ref: CredentialRef,
}

pub(crate) enum CredentialRef {
  Envelope { encrypted: String, aad: Vec<u8> },
  Managed { profile_id: String },
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct TargetOverride {
  pub(crate) profile_id: String,
  pub(crate) model_id: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RouteDecisionReason {
  ByokDisabled,
  AccessUnavailable,
  ExplicitTargetUnavailable,
  NoCompatibleTarget,
  ManagedPresetUnavailable,
}

pub(crate) enum RouteDecision {
  Ready(Vec<AuthorizedTargetRef>),
  Denied(RouteDecisionReason),
  NoRoute(RouteDecisionReason),
}

pub(crate) struct AuthorizedTargetRef {
  pub(crate) profile_index: usize,
  pub(crate) model_index: usize,
}

pub(crate) struct RoutePolicyInput<'a> {
  pub(crate) slot: &'a CatalogSlot,
  pub(crate) deployment: Deployment,
  pub(crate) byok_enabled: bool,
  pub(crate) access_available: bool,
  pub(crate) profiles: &'a [AuthorizedProviderProfile],
  pub(crate) target_override: Option<&'a TargetOverride>,
  pub(crate) target_override_managed: bool,
}

pub(crate) fn decide(input: RoutePolicyInput<'_>) -> RouteDecision {
  if input.deployment == Deployment::SelfHosted && !input.byok_enabled {
    return RouteDecision::NoRoute(RouteDecisionReason::ByokDisabled);
  }

  if input.target_override_managed {
    if input.deployment != Deployment::Cloud {
      return RouteDecision::Denied(RouteDecisionReason::ExplicitTargetUnavailable);
    }
    if !input.access_available {
      return RouteDecision::Denied(RouteDecisionReason::AccessUnavailable);
    }
  }

  if let Some(target) = input.target_override {
    let mut selected = compatible_targets(&input, input.target_override_managed);
    selected.retain(|candidate| {
      let profile = &input.profiles[candidate.profile_index];
      let model = &profile.models[candidate.model_index];
      profile.profile_id == target.profile_id && model.model_id == target.model_id
    });
    return if selected.is_empty() {
      RouteDecision::Denied(RouteDecisionReason::ExplicitTargetUnavailable)
    } else {
      RouteDecision::Ready(selected)
    };
  }
  let byok = compatible_targets(&input, false);
  if !byok.is_empty() {
    return RouteDecision::Ready(byok);
  }
  if !input.access_available {
    return RouteDecision::Denied(RouteDecisionReason::AccessUnavailable);
  }
  if input.deployment == Deployment::Cloud {
    let managed = compatible_targets(&input, true);
    if managed.is_empty() {
      RouteDecision::NoRoute(RouteDecisionReason::ManagedPresetUnavailable)
    } else {
      RouteDecision::Ready(managed)
    }
  } else {
    RouteDecision::NoRoute(RouteDecisionReason::NoCompatibleTarget)
  }
}

fn compatible_targets(input: &RoutePolicyInput<'_>, managed: bool) -> Vec<AuthorizedTargetRef> {
  let mut profiles = input
    .profiles
    .iter()
    .enumerate()
    .filter(|(_, profile)| (profile.source == ProfileSource::Managed) == managed)
    .collect::<Vec<_>>();
  profiles.sort_by_key(|(_, profile)| profile.sort_order);
  profiles
    .into_iter()
    .flat_map(|(profile_index, profile)| {
      profile
        .models
        .iter()
        .enumerate()
        .filter(|(_, model)| model.enabled && declared_model_matches(&model.capabilities, &input.slot.requirements))
        .map(move |(model_index, _)| AuthorizedTargetRef {
          profile_index,
          model_index,
        })
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use llm_adapter::capability::{DeclaredModelCapability, ModelInput, ModelOutput};

  use super::*;
  use crate::llm::{byok::ByokModelDeclaration, route::catalog};

  fn profile(id: &str, source: ProfileSource, model: &str, output: ModelOutput) -> AuthorizedProviderProfile {
    AuthorizedProviderProfile {
      profile_id: id.to_string(),
      source,
      provider: "openai".to_string(),
      endpoint: BackendEndpoint::Custom("https://example.test/v1".to_string()),
      openai_dialect: Some(OpenAiDialect::Responses),
      egress_policy: EgressPolicy::PublicOnly,
      models: vec![ByokModelDeclaration {
        model_id: model.to_string(),
        enabled: true,
        capabilities: vec![DeclaredModelCapability {
          input: vec![ModelInput::Text],
          output: vec![output],
          features: vec![],
          attachment_kinds: vec![],
          attachment_sources: vec![],
        }],
      }],
      sort_order: 0,
      credential_ref: CredentialRef::Managed {
        profile_id: id.to_string(),
      },
    }
  }

  #[test]
  fn deployment_matrix_and_unsupported_only_fallback() {
    let slot = catalog::slot("chat.default").unwrap();
    let cases = [
      (
        Deployment::Cloud,
        true,
        vec![profile("managed", ProfileSource::Managed, "A", ModelOutput::Text)],
        true,
      ),
      (
        Deployment::SelfHosted,
        false,
        vec![profile("managed", ProfileSource::Managed, "A", ModelOutput::Text)],
        false,
      ),
      (Deployment::SelfHosted, true, vec![], false),
      (
        Deployment::Cloud,
        true,
        vec![
          profile("byok", ProfileSource::Server, "B", ModelOutput::Image),
          profile("managed", ProfileSource::Managed, "A", ModelOutput::Text),
        ],
        true,
      ),
    ];
    for (deployment, byok_enabled, profiles, ready) in cases {
      let decision = decide(RoutePolicyInput {
        slot: &slot,
        deployment,
        byok_enabled,
        access_available: true,
        profiles: &profiles,
        target_override: None,
        target_override_managed: false,
      });
      assert_eq!(matches!(decision, RouteDecision::Ready(_)), ready);
    }

    let profiles = vec![
      profile("byok", ProfileSource::Server, "B", ModelOutput::Text),
      profile("managed", ProfileSource::Managed, "A", ModelOutput::Text),
    ];
    assert!(matches!(
      decide(RoutePolicyInput {
        slot: &slot,
        deployment: Deployment::Cloud,
        byok_enabled: true,
        access_available: false,
        profiles: &profiles,
        target_override: None,
        target_override_managed: false,
      }),
      RouteDecision::Ready(_)
    ));
    assert!(matches!(
      decide(RoutePolicyInput {
        slot: &slot,
        deployment: Deployment::Cloud,
        byok_enabled: true,
        access_available: false,
        profiles: &profiles[1..],
        target_override: None,
        target_override_managed: false,
      }),
      RouteDecision::Denied(RouteDecisionReason::AccessUnavailable)
    ));
  }

  #[test]
  fn override_is_complete_and_custom_model_is_not_replaced_by_managed_model() {
    let slot = catalog::slot("chat.default").unwrap();
    let profiles = vec![
      profile("byok", ProfileSource::Server, "vendor/model:B", ModelOutput::Text),
      profile("managed", ProfileSource::Managed, "model:A", ModelOutput::Text),
    ];
    let target = TargetOverride {
      profile_id: "byok".to_string(),
      model_id: "vendor/model:B".to_string(),
    };
    let RouteDecision::Ready(candidates) = decide(RoutePolicyInput {
      slot: &slot,
      deployment: Deployment::Cloud,
      byok_enabled: true,
      access_available: true,
      profiles: &profiles,
      target_override: Some(&target),
      target_override_managed: false,
    }) else {
      panic!("override should resolve");
    };
    assert_eq!(
      profiles[candidates[0].profile_index].models[candidates[0].model_index].model_id,
      "vendor/model:B"
    );

    let managed_target = TargetOverride {
      profile_id: "managed".to_string(),
      model_id: "model:A".to_string(),
    };
    let RouteDecision::Ready(candidates) = decide(RoutePolicyInput {
      slot: &slot,
      deployment: Deployment::Cloud,
      byok_enabled: true,
      access_available: true,
      profiles: &profiles,
      target_override: Some(&managed_target),
      target_override_managed: true,
    }) else {
      panic!("managed selection should resolve");
    };
    assert!(matches!(
      profiles[candidates[0].profile_index].source,
      ProfileSource::Managed
    ));

    let mut disabled = profile("disabled", ProfileSource::Server, "model:C", ModelOutput::Text);
    disabled.models[0].enabled = false;
    assert!(matches!(
      decide(RoutePolicyInput {
        slot: &slot,
        deployment: Deployment::SelfHosted,
        byok_enabled: true,
        access_available: true,
        profiles: &[disabled],
        target_override: None,
        target_override_managed: false,
      }),
      RouteDecision::NoRoute(RouteDecisionReason::NoCompatibleTarget)
    ));
  }
}
