use std::{
  net::{IpAddr, Ipv4Addr},
  time::Duration,
};

use super::{RuntimeError, RuntimeResult};
use crate::{
  llm::byok::{ByokEndpoint, ByokProfileDefinition},
  runtime::config::CopilotByokRuntimeConfig,
};

const DNS_RESOLUTION_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) async fn admit_endpoint(
  definition: &ByokProfileDefinition,
  policy: &CopilotByokRuntimeConfig,
) -> RuntimeResult<()> {
  let ByokEndpoint::Custom { url } = &definition.endpoint else {
    return Ok(());
  };
  if !policy.allow_custom_endpoint {
    return Err(RuntimeError::invalid_input("custom BYOK endpoints are disabled"));
  }
  if policy.allow_private_endpoint {
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
    if is_private_address(address.ip()) {
      return Err(RuntimeError::invalid_input("private BYOK endpoints are disabled"));
    }
  }
  if !resolved {
    return Err(RuntimeError::invalid_input("BYOK endpoint DNS resolution failed"));
  }
  Ok(())
}

fn is_private_address(address: IpAddr) -> bool {
  match address {
    IpAddr::V4(address) => {
      address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_broadcast()
        || address.is_documentation()
        || address.is_unspecified()
        || address.octets()[0] == 0
        || Ipv4Addr::new(100, 64, 0, 0) <= address && address <= Ipv4Addr::new(100, 127, 255, 255)
    }
    IpAddr::V6(address) => {
      address.is_loopback()
        || address.is_unspecified()
        || address.is_unique_local()
        || address.is_unicast_link_local()
        || address
          .to_ipv4_mapped()
          .is_some_and(|address| is_private_address(IpAddr::V4(address)))
    }
  }
}
