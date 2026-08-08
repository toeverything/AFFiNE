use std::{
  collections::BTreeSet,
  net::{IpAddr, Ipv4Addr, Ipv6Addr},
  time::Duration,
};

use llm_adapter::target::EgressPolicy;

use super::ByokEndpoint;
use crate::{
  llm::Deployment,
  runtime::{RuntimeError, RuntimeResult, config::CopilotByokRuntimeConfig},
};

const DNS_RESOLUTION_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ByokCustomEndpointMode {
  Unavailable,
  Disabled,
  Enabled,
}

impl ByokCustomEndpointMode {
  fn name(self) -> &'static str {
    match self {
      Self::Unavailable => "unavailable",
      Self::Disabled => "disabled",
      Self::Enabled => "enabled",
    }
  }
}

#[derive(Clone)]
pub(crate) struct ByokPolicy {
  enabled: bool,
  allowed_providers: BTreeSet<String>,
  custom_endpoint_mode: ByokCustomEndpointMode,
  allow_private_endpoint: bool,
}

#[derive(Clone)]
#[napi_derive::napi(object)]
pub struct ByokPolicyOutput {
  pub enabled: bool,
  pub allowed_providers: Vec<String>,
  pub custom_endpoint_mode: String,
  pub private_endpoint_supported: bool,
}

impl ByokPolicy {
  pub(crate) fn from(deployment: Deployment, config: &CopilotByokRuntimeConfig) -> Self {
    let custom_endpoint_mode = match deployment {
      Deployment::Cloud => ByokCustomEndpointMode::Unavailable,
      Deployment::SelfHosted if config.allow_custom_endpoint => ByokCustomEndpointMode::Enabled,
      Deployment::SelfHosted => ByokCustomEndpointMode::Disabled,
    };
    Self {
      enabled: config.enabled,
      allowed_providers: config.allowed_providers.iter().cloned().collect(),
      custom_endpoint_mode,
      allow_private_endpoint: custom_endpoint_mode == ByokCustomEndpointMode::Enabled && config.allow_private_endpoint,
    }
  }

  pub(crate) fn project(&self) -> ByokPolicyOutput {
    ByokPolicyOutput {
      enabled: self.enabled,
      allowed_providers: self.allowed_providers.iter().cloned().collect(),
      custom_endpoint_mode: self.custom_endpoint_mode.name().to_string(),
      private_endpoint_supported: self.allow_private_endpoint,
    }
  }

  pub(crate) async fn admit(&self, provider: &str, endpoint: &ByokEndpoint) -> RuntimeResult<()> {
    if !self.allows(provider, endpoint) {
      return Err(RuntimeError::invalid_input("BYOK target is unavailable"));
    }
    let ByokEndpoint::OpenAiCompatible { url, .. } = endpoint else {
      return Ok(());
    };
    if self.allow_private_endpoint {
      return Ok(());
    }
    let parsed = url::Url::parse(url).map_err(|_| RuntimeError::invalid_input("invalid BYOK endpoint"))?;
    let host = parsed
      .host_str()
      .ok_or_else(|| RuntimeError::invalid_input("invalid BYOK endpoint"))?;
    if host.eq_ignore_ascii_case("localhost") {
      return Err(RuntimeError::invalid_input("private BYOK endpoints are disabled"));
    }
    let port = parsed.port_or_known_default().unwrap_or(443);
    let addresses = tokio::time::timeout(DNS_RESOLUTION_TIMEOUT, tokio::net::lookup_host((host, port)))
      .await
      .map_err(|_| RuntimeError::invalid_input("BYOK endpoint DNS resolution timed out"))?
      .map_err(|_| RuntimeError::invalid_input("BYOK endpoint DNS resolution failed"))?;
    let mut resolved = false;
    for address in addresses {
      resolved = true;
      if !is_public(address.ip()) {
        return Err(RuntimeError::invalid_input("private BYOK endpoints are disabled"));
      }
    }
    if !resolved {
      return Err(RuntimeError::invalid_input("BYOK endpoint DNS resolution failed"));
    }
    Ok(())
  }

  pub(crate) fn allows(&self, provider: &str, endpoint: &ByokEndpoint) -> bool {
    self.enabled
      && self.allowed_providers.contains(provider)
      && match endpoint {
        ByokEndpoint::ProviderDefault => true,
        ByokEndpoint::OpenAiCompatible { .. } => {
          provider == "openai" && self.custom_endpoint_mode == ByokCustomEndpointMode::Enabled
        }
      }
  }

  pub(crate) fn egress_policy(&self, endpoint: &ByokEndpoint) -> EgressPolicy {
    if self.allow_private_endpoint && matches!(endpoint, ByokEndpoint::OpenAiCompatible { .. }) {
      EgressPolicy::AllowPrivate
    } else {
      EgressPolicy::PublicOnly
    }
  }
}

fn is_public(address: IpAddr) -> bool {
  match address {
    IpAddr::V4(address) => is_public_ipv4(address),
    IpAddr::V6(address) => {
      if address.is_loopback()
        || address.is_unspecified()
        || address.is_unique_local()
        || address.is_unicast_link_local()
        || address.is_multicast()
      {
        return false;
      }
      embedded_ipv4(address).is_none_or(is_public_ipv4)
    }
  }
}

fn is_public_ipv4(address: Ipv4Addr) -> bool {
  let [first, second, third, _] = address.octets();
  !(address.is_private()
    || address.is_loopback()
    || address.is_link_local()
    || address.is_broadcast()
    || address.is_documentation()
    || address.is_unspecified()
    || address.is_multicast()
    || first == 0
    || first >= 240
    || first == 100 && (64..=127).contains(&second)
    || first == 192 && second == 0 && third == 0
    || first == 198 && matches!(second, 18 | 19))
}

fn embedded_ipv4(address: Ipv6Addr) -> Option<Ipv4Addr> {
  if let Some(address) = address.to_ipv4() {
    return Some(address);
  }
  let segments = address.segments();
  if segments[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
    return Some(Ipv4Addr::new(
      (segments[6] >> 8) as u8,
      segments[6] as u8,
      (segments[7] >> 8) as u8,
      segments[7] as u8,
    ));
  }
  if segments[0] == 0x2002 {
    return Some(Ipv4Addr::new(
      (segments[1] >> 8) as u8,
      segments[1] as u8,
      (segments[2] >> 8) as u8,
      segments[2] as u8,
    ));
  }
  None
}

#[cfg(test)]
mod tests {
  use llm_adapter::target::OpenAiDialect;

  use super::*;

  fn config(custom: bool, private: bool) -> CopilotByokRuntimeConfig {
    CopilotByokRuntimeConfig {
      enabled: true,
      allowed_providers: vec!["openai".to_string()],
      allow_custom_endpoint: custom,
      allow_private_endpoint: private,
    }
  }

  #[test]
  fn projects_deployment_policy_matrix() {
    let custom = ByokEndpoint::OpenAiCompatible {
      url: "https://example.com/v1".to_string(),
      dialect: OpenAiDialect::Responses,
    };
    let cases = [
      (Deployment::Cloud, false, false, "unavailable", false),
      (Deployment::Cloud, true, true, "unavailable", false),
      (Deployment::SelfHosted, false, true, "disabled", false),
      (Deployment::SelfHosted, true, false, "enabled", true),
    ];
    for (deployment, allow_custom, allow_private, mode, allows_custom) in cases {
      let policy = ByokPolicy::from(deployment, &config(allow_custom, allow_private));
      assert_eq!(policy.project().custom_endpoint_mode, mode);
      assert_eq!(policy.allows("openai", &custom), allows_custom);
      assert!(policy.allows("openai", &ByokEndpoint::ProviderDefault));
      assert_eq!(
        policy.egress_policy(&custom) == EgressPolicy::AllowPrivate,
        allows_custom && allow_private
      );
    }

    let mut restricted = config(true, false);
    restricted.allowed_providers = vec!["anthropic".to_string()];
    let policy = ByokPolicy::from(Deployment::SelfHosted, &restricted);
    assert!(!policy.allows("openai", &ByokEndpoint::ProviderDefault));
    assert!(policy.allows("anthropic", &ByokEndpoint::ProviderDefault));
    restricted.enabled = false;
    let policy = ByokPolicy::from(Deployment::SelfHosted, &restricted);
    assert!(!policy.allows("anthropic", &ByokEndpoint::ProviderDefault));
  }

  #[test]
  fn classifies_public_endpoints() {
    for address in [
      "1.1.1.1",
      "100.63.255.255",
      "100.128.0.1",
      "192.0.1.1",
      "198.17.255.255",
      "198.20.0.1",
      "2606:4700:4700::1111",
      "64:ff9b::101:101",
      "2002:0101:0101::",
    ] {
      assert!(is_public(address.parse().unwrap()), "{address}");
    }

    for address in [
      "0.1.2.3",
      "10.0.0.1",
      "100.64.0.1",
      "100.99.255.255",
      "100.127.255.255",
      "127.0.0.1",
      "169.254.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.19.255.255",
      "198.51.100.1",
      "224.0.0.1",
      "240.0.0.1",
      "::",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "::a00:1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "2002:0a00:0001::",
    ] {
      assert!(!is_public(address.parse().unwrap()), "{address}");
    }
  }
}
