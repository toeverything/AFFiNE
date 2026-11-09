use llm_adapter::{capability::declared_model_matches, target::EgressPolicy};

use super::{CatalogSlot, ResolvedManagedTarget};
use crate::{
  llm::byok::{ByokEndpoint, ByokModelDeclaration},
  runtime::Deployment,
};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProfileSource {
  Server,
  Local,
}

#[derive(Clone)]
pub(crate) struct AuthorizedProviderProfile {
  pub(crate) profile_id: String,
  pub(crate) source: ProfileSource,
  pub(crate) provider: String,
  pub(crate) endpoint: ByokEndpoint,
  pub(crate) egress_policy: EgressPolicy,
  pub(crate) models: Vec<ByokModelDeclaration>,
  pub(crate) sort_order: i32,
  pub(crate) credential_ref: CredentialRef,
}

#[derive(Clone)]
pub(crate) struct CredentialRef {
  pub(crate) encrypted: String,
  pub(crate) aad: Vec<u8>,
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
  Ready(AuthorizedRouteTargets),
  Denied(RouteDecisionReason),
  NoRoute(RouteDecisionReason),
}

pub(crate) enum AuthorizedRouteTargets {
  Byok(Vec<AuthorizedTargetRef>),
  Managed(ResolvedManagedTarget),
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
  pub(crate) managed_target: Option<&'a ResolvedManagedTarget>,
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
    return match input.managed_target.filter(|target| target.supports(input.slot)) {
      Some(target) => RouteDecision::Ready(AuthorizedRouteTargets::Managed(target.clone())),
      None => RouteDecision::Denied(RouteDecisionReason::ExplicitTargetUnavailable),
    };
  }

  if let Some(target) = input.target_override {
    let mut selected = compatible_targets(&input);
    selected.retain(|candidate| {
      let profile = &input.profiles[candidate.profile_index];
      let model = &profile.models[candidate.model_index];
      profile.profile_id == target.profile_id && model.model_id == target.model_id
    });
    return if selected.is_empty() {
      RouteDecision::Denied(RouteDecisionReason::ExplicitTargetUnavailable)
    } else {
      RouteDecision::Ready(AuthorizedRouteTargets::Byok(selected))
    };
  }
  let byok = compatible_targets(&input);
  if !byok.is_empty() {
    return RouteDecision::Ready(AuthorizedRouteTargets::Byok(byok));
  }
  if !input.access_available {
    return RouteDecision::Denied(RouteDecisionReason::AccessUnavailable);
  }
  if input.deployment == Deployment::Cloud {
    match input.managed_target.filter(|target| target.supports(input.slot)) {
      Some(target) => RouteDecision::Ready(AuthorizedRouteTargets::Managed(target.clone())),
      None => RouteDecision::NoRoute(RouteDecisionReason::ManagedPresetUnavailable),
    }
  } else {
    RouteDecision::NoRoute(RouteDecisionReason::NoCompatibleTarget)
  }
}

fn compatible_targets(input: &RoutePolicyInput<'_>) -> Vec<AuthorizedTargetRef> {
  let mut profiles = input.profiles.iter().enumerate().collect::<Vec<_>>();
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
  use crate::llm::route::slot;

  fn profile(model: &str, output: ModelOutput) -> AuthorizedProviderProfile {
    AuthorizedProviderProfile {
      profile_id: "byok".into(),
      source: ProfileSource::Server,
      provider: "openai".into(),
      endpoint: ByokEndpoint::OpenAiCompatible {
        url: "https://example.test/v1".into(),
        dialect: llm_adapter::target::OpenAiDialect::Responses,
      },
      egress_policy: EgressPolicy::PublicOnly,
      models: vec![ByokModelDeclaration {
        model_id: model.into(),
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
      credential_ref: CredentialRef {
        encrypted: String::new(),
        aad: Vec::new(),
      },
    }
  }

  fn managed() -> ResolvedManagedTarget {
    let mut config: crate::runtime::CopilotRuntimeConfig = serde_json::from_value(serde_json::json!({
      "providers": {"profiles": [{"id": "managed", "type": "openai", "config": {"apiKey": "test"}}]}
    }))
    .unwrap();
    config.initialize_managed_routes().unwrap();
    config
      .managed_routes
      .iter()
      .find(|binding| {
        binding.target.model_id == "gpt-6-luna" && binding.operation == llm_adapter::target::BackendOperation::Chat
      })
      .unwrap()
      .resolved
      .clone()
  }

  #[test]
  fn deployment_matrix_and_unsupported_only_fallback() {
    let slot = slot("chat.default").unwrap();
    let managed = managed();
    for (deployment, byok_enabled, profiles, ready) in [
      (Deployment::Cloud, true, vec![], true),
      (Deployment::SelfHosted, false, vec![], false),
      (Deployment::SelfHosted, true, vec![], false),
      (
        Deployment::Cloud,
        true,
        vec![profile("opaque", ModelOutput::Image)],
        true,
      ),
    ] {
      let decision = decide(RoutePolicyInput {
        slot: &slot,
        deployment,
        byok_enabled,
        access_available: true,
        profiles: &profiles,
        managed_target: Some(&managed),
        target_override: None,
        target_override_managed: false,
      });
      assert_eq!(matches!(decision, RouteDecision::Ready(_)), ready);
    }
    let profiles = vec![profile("vendor/opaque", ModelOutput::Text)];
    for (profiles, expected_byok) in [(&profiles[..], true), (&[][..], false)] {
      let decision = decide(RoutePolicyInput {
        slot: &slot,
        deployment: Deployment::Cloud,
        byok_enabled: true,
        access_available: false,
        profiles,
        managed_target: Some(&managed),
        target_override: None,
        target_override_managed: false,
      });
      if expected_byok {
        assert!(matches!(
          decision,
          RouteDecision::Ready(AuthorizedRouteTargets::Byok(_))
        ));
      } else {
        assert!(matches!(
          decision,
          RouteDecision::Denied(RouteDecisionReason::AccessUnavailable)
        ));
      }
    }
  }

  #[test]
  fn override_is_complete_and_custom_model_is_not_replaced_by_managed_model() {
    let slot = slot("chat.default").unwrap();
    let managed = managed();
    let profiles = vec![profile("vendor/model:B", ModelOutput::Text)];
    let target = TargetOverride {
      profile_id: "byok".into(),
      model_id: "vendor/model:B".into(),
    };
    let input = |explicit| RoutePolicyInput {
      slot: &slot,
      deployment: Deployment::Cloud,
      byok_enabled: true,
      access_available: true,
      profiles: &profiles,
      managed_target: Some(&managed),
      target_override: Some(&target),
      target_override_managed: explicit,
    };
    let RouteDecision::Ready(AuthorizedRouteTargets::Byok(candidates)) = decide(input(false)) else {
      panic!("BYOK override should resolve");
    };
    assert_eq!(
      profiles[candidates[0].profile_index].models[candidates[0].model_index].model_id,
      "vendor/model:B"
    );
    let RouteDecision::Ready(AuthorizedRouteTargets::Managed(selected)) = decide(input(true)) else {
      panic!("managed selection should resolve");
    };
    assert_eq!(selected.profile_id, "managed");
    let mut disabled = profile("model:C", ModelOutput::Text);
    disabled.models[0].enabled = false;
    assert!(matches!(
      decide(RoutePolicyInput {
        slot: &slot,
        deployment: Deployment::SelfHosted,
        byok_enabled: true,
        access_available: true,
        profiles: &[disabled],
        managed_target: None,
        target_override: None,
        target_override_managed: false,
      }),
      RouteDecision::NoRoute(RouteDecisionReason::NoCompatibleTarget)
    ));
    assert!(matches!(
      decide(RoutePolicyInput {
        managed_target: None,
        ..input(true)
      }),
      RouteDecision::Denied(RouteDecisionReason::ExplicitTargetUnavailable)
    ));
  }
}
