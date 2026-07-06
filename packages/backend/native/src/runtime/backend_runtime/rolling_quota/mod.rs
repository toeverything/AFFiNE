use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

mod invite_abuse_actions;
mod mail_delivery;
mod reservation;
mod workspace_invite;
mod workspace_invite_policy;

use mail_delivery::{build_mail_scopes, decision_from_violation as mail_decision_from_violation, mail_class};
use napi::Result;
use reservation::{
  QuotaViolation, ScopeLimit, bucket_seconds, cleanup_expired, commit_reservation, release_reservation, reserve_scopes,
  scope,
};
use sha2::{Digest, Sha256};
use workspace_invite_policy::{
  ActorFacts, InviteAbuseDecision, InviteActivityFacts, QuotaFacts, WorkspaceFacts, build_invite_scopes,
  evaluate_projection, high_confidence_invite_abuse, invite_commit_usage_for_scope, source_cohort_subject_key,
  subject_hash, sum_domains,
};

#[cfg(test)]
pub(super) use super::types::{RuntimeMailDeliveryQuotaMetadataInput, RuntimeMailDeliveryQuotaRecipientInput};
pub(super) use super::{
  BackendRuntime, InviteQuotaConfig, RuntimeError, RuntimeResult, napi_error,
  types::{
    RuntimeInviteAbuseActionRequired, RuntimeInviteAbuseClaimedAction, RuntimeMailDeliveryQuotaDecision,
    RuntimeMailDeliveryQuotaInput, RuntimeQuotaSourceInput, RuntimeQuotaTargetDomainInput,
    RuntimeWorkspaceInviteQuotaDecision, RuntimeWorkspaceInviteQuotaInput, RuntimeWorkspaceInviteQuotaUsage,
  },
};

pub(super) fn normalize_domain(domain: &str) -> String {
  domain.trim().trim_end_matches('.').to_ascii_lowercase()
}

pub(super) fn high_risk_domain(domain: &str, config: &InviteQuotaConfig) -> bool {
  let domain = normalize_domain(domain);
  config
    .high_risk_target_domains
    .iter()
    .any(|configured| normalize_domain(configured) == domain)
}

pub(super) fn workspace_subject_key(workspace_id: &str) -> String {
  format!("workspace:v1:{}", short_hash(workspace_id))
}

pub(super) fn short_hash(value: &str) -> String {
  hex::encode(Sha256::digest(value.as_bytes()))[..24].to_string()
}

pub(super) fn source_prefix(source: Option<&RuntimeQuotaSourceInput>) -> Option<String> {
  let source = source?;
  if !source.trusted {
    return None;
  }
  let ip = source.ip.as_ref()?.parse::<IpAddr>().ok()?;
  match ip {
    IpAddr::V4(ip) => {
      let octets = ip.octets();
      Some(Ipv4Addr::new(octets[0], octets[1], octets[2], 0).to_string() + "/24")
    }
    IpAddr::V6(ip) => {
      let segments = ip.segments();
      Some(Ipv6Addr::new(segments[0], segments[1], segments[2], 0, 0, 0, 0, 0).to_string() + "/48")
    }
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn assert_mail_delivery_quota_v1(
    &self,
    input: RuntimeMailDeliveryQuotaInput,
  ) -> Result<RuntimeMailDeliveryQuotaDecision> {
    let config = self.config()?.invite_quota;
    let Some(class) = mail_class(&input.mail_name, &config) else {
      return Ok(RuntimeMailDeliveryQuotaDecision {
        allowed: false,
        reservation_id: None,
        mail_class: "unmapped".to_string(),
        retry_after_seconds: None,
        reason: Some("unmapped_mail_name".to_string()),
        scope_key: Some(format!("mail:name:{}", input.mail_name)),
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(1),
      });
    };
    let pool = self.pool().await?;
    let scopes = build_mail_scopes(&input, class, &config);
    match reserve_scopes(&pool, "mail_delivery", input.request_id.as_deref(), scopes).await? {
      Ok(reservation) => Ok(RuntimeMailDeliveryQuotaDecision {
        allowed: true,
        reservation_id: Some(reservation.reservation_id),
        mail_class: class.as_str().to_string(),
        retry_after_seconds: None,
        reason: None,
        scope_key: None,
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(1),
      }),
      Err(violation) => Ok(mail_decision_from_violation(violation, class, "mail_class")),
    }
  }

  #[napi]
  pub async fn commit_mail_delivery_quota_v1(&self, reservation_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    commit_reservation(&pool, &reservation_id, 1, |_, reserved_count| reserved_count.min(1))
      .await
      .map_err(Into::into)
  }

  #[napi]
  pub async fn release_mail_delivery_quota_v1(&self, reservation_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    release_reservation(&pool, &reservation_id).await.map_err(Into::into)
  }

  #[napi]
  pub async fn cleanup_expired_rolling_quota(&self, limit: i64) -> Result<i64> {
    if limit <= 0 {
      return Err(napi_error("rolling quota cleanup limit must be positive"));
    }
    let pool = self.pool().await?;
    cleanup_expired(&pool, limit).await.map_err(Into::into)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn derives_source_prefix_only_from_trusted_raw_ip() {
    assert_eq!(
      source_prefix(Some(&RuntimeQuotaSourceInput {
        trusted: true,
        ip: Some("192.168.12.34".to_string()),
        country: None,
        asn: None,
        ray_id: None,
      }))
      .as_deref(),
      Some("192.168.12.0/24")
    );
    assert_eq!(
      source_prefix(Some(&RuntimeQuotaSourceInput {
        trusted: true,
        ip: Some("2001:db8:abcd:1234::1".to_string()),
        country: None,
        asn: None,
        ray_id: None,
      }))
      .as_deref(),
      Some("2001:db8:abcd::/48")
    );
    assert!(
      source_prefix(Some(&RuntimeQuotaSourceInput {
        trusted: false,
        ip: Some("192.168.12.34".to_string()),
        country: None,
        asn: None,
        ray_id: None,
      }))
      .is_none()
    );
  }
}
