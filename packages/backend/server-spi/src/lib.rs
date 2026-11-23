//! Pure canonical Service Provider Interfaces (SPI) for AFFiNE server editions.
//!
//! Defines the exact trait boundaries between the open-source community core
//! and commercial extensions, along with [`CommunityExtension`].

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use chrono::{DateTime, Utc};
pub use server_types::BillingSubject;
use server_types::{AccessGrant, DomainError};
use sqlx::{Postgres, Transaction};

#[async_trait::async_trait]
pub trait QuotaGate: Send + Sync + 'static {
  async fn resolve_workspace_grant(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError>;

  async fn resolve_user_grant(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _user_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    Ok(server_types::license::default_selfhost_access_grant())
  }

  async fn check_seat_admission(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    current_active_seats: i32,
    adding_seats: i32,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError>;
}

pub trait SessionPolicyHook: Send + Sync + 'static {
  fn on_session_created<'a>(
    &'a self,
    tx: &'a mut Transaction<'_, Postgres>,
    user_id: &'a str,
    session_id: &'a str,
    now: DateTime<Utc>,
  ) -> Pin<Box<dyn Future<Output = Result<(), DomainError>> + Send + 'a>>;
}

#[async_trait::async_trait]
pub trait CopilotPolicySpi: Send + Sync + 'static {
  async fn check_copilot_allowed(&self, grant: &AccessGrant, using_byok: bool) -> Result<(), DomainError>;
}

/// Request network source metadata passed to [`RateLimitPolicy`] for
/// rolling-window rate limiting by extensions.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RequestSource {
  pub trusted: bool,
  pub ip: Option<String>,
  pub asn: Option<u32>,
}

#[async_trait::async_trait]
pub trait RateLimitPolicy: Send + Sync + 'static {
  async fn check_auth_mail(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    mail_name: &str,
    normalized_email: &str,
    recipient_user_id: Option<&str>,
    source: Option<&RequestSource>,
    now: DateTime<Utc>,
  ) -> Result<(), DomainError>;

  async fn check_workspace_invite(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    inviter_id: &str,
    target_emails: &[&str],
    source: Option<&RequestSource>,
    now: DateTime<Utc>,
  ) -> Result<(), DomainError>;
}

pub trait ServerExtension: Send + Sync + 'static {
  fn edition_name(&self) -> &'static str;
  fn quota_gate(&self) -> Arc<dyn QuotaGate>;
  fn session_policy(&self) -> Arc<dyn SessionPolicyHook>;
  fn copilot_policy(&self) -> Arc<dyn CopilotPolicySpi>;
  fn rate_limit_policy(&self) -> Arc<dyn RateLimitPolicy> {
    Arc::new(CommunityRateLimitPolicy)
  }
  fn extra_router(&self) -> Option<axum::Router> {
    None
  }
}

/// Default community quota gate backed by the bundled 10-seat / 100 GiB
/// signed `selfhost_default` license.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityQuotaGate;

#[async_trait::async_trait]
impl QuotaGate for CommunityQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    Ok(server_types::license::default_selfhost_access_grant())
  }

  async fn resolve_user_grant(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _user_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    Ok(server_types::license::default_selfhost_access_grant())
  }

  async fn check_seat_admission(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    current_active_seats: i32,
    adding_seats: i32,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    if current_active_seats < 0 || adding_seats < 0 {
      return Err(DomainError::Validation("seat counts must be non-negative".into()));
    }
    let grant = self.resolve_workspace_grant(tx, workspace_id, now).await?;
    if grant.limits.seat_limit <= 0 {
      return Err(DomainError::QuotaExceeded {
        kind: "seat_limit",
        message: "workspace is in fail-closed readonly state".into(),
      });
    }
    let projected = current_active_seats
      .checked_add(adding_seats)
      .ok_or_else(|| DomainError::Validation("seat count overflow".into()))?;
    if projected > grant.limits.seat_limit {
      return Err(DomainError::QuotaExceeded {
        kind: "seat_limit",
        message: format!(
          "workspace seat limit exceeded: {projected} > {}",
          grant.limits.seat_limit
        ),
      });
    }
    Ok(grant)
  }
}

/// Default community session policy hook (no extra session restrictions).
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunitySessionPolicyHook;

impl SessionPolicyHook for CommunitySessionPolicyHook {
  fn on_session_created<'a>(
    &'a self,
    _tx: &'a mut Transaction<'_, Postgres>,
    _user_id: &'a str,
    _session_id: &'a str,
    _now: DateTime<Utc>,
  ) -> Pin<Box<dyn Future<Output = Result<(), DomainError>> + Send + 'a>> {
    Box::pin(async { Ok(()) })
  }
}

/// Default community copilot policy SPI.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityCopilotPolicySpi;

#[async_trait::async_trait]
impl CopilotPolicySpi for CommunityCopilotPolicySpi {
  async fn check_copilot_allowed(&self, grant: &AccessGrant, using_byok: bool) -> Result<(), DomainError> {
    if using_byok && !grant.rights.copilot_byok {
      return Err(DomainError::Forbidden(
        "copilot BYOK requires a license with copilot_byok right".into(),
      ));
    }
    if grant.limits.seat_limit <= 0 {
      return Err(DomainError::QuotaExceeded {
        kind: "copilot",
        message: "workspace grant is read-only".into(),
      });
    }
    Ok(())
  }
}

/// Default community rate-limit policy (allows all requests).
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityRateLimitPolicy;

#[async_trait::async_trait]
impl RateLimitPolicy for CommunityRateLimitPolicy {
  async fn check_auth_mail(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _mail_name: &str,
    _normalized_email: &str,
    _recipient_user_id: Option<&str>,
    _source: Option<&RequestSource>,
    _now: DateTime<Utc>,
  ) -> Result<(), DomainError> {
    Ok(())
  }

  async fn check_workspace_invite(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _inviter_id: &str,
    _target_emails: &[&str],
    _source: Option<&RequestSource>,
    _now: DateTime<Utc>,
  ) -> Result<(), DomainError> {
    Ok(())
  }
}

/// Open-source community edition [`ServerExtension`] implementation.
#[derive(Clone)]
pub struct CommunityExtension {
  quota_gate: Arc<dyn QuotaGate>,
  session_policy: Arc<dyn SessionPolicyHook>,
  copilot_policy: Arc<dyn CopilotPolicySpi>,
  rate_limit_policy: Arc<dyn RateLimitPolicy>,
}

impl std::fmt::Debug for CommunityExtension {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("CommunityExtension")
      .field("edition", &self.edition_name())
      .finish()
  }
}

impl Default for CommunityExtension {
  fn default() -> Self {
    Self::new()
  }
}

impl CommunityExtension {
  pub fn new() -> Self {
    Self {
      quota_gate: Arc::new(CommunityQuotaGate),
      session_policy: Arc::new(CommunitySessionPolicyHook),
      copilot_policy: Arc::new(CommunityCopilotPolicySpi),
      rate_limit_policy: Arc::new(CommunityRateLimitPolicy),
    }
  }
}

impl ServerExtension for CommunityExtension {
  fn edition_name(&self) -> &'static str {
    "community"
  }

  fn quota_gate(&self) -> Arc<dyn QuotaGate> {
    Arc::clone(&self.quota_gate)
  }

  fn session_policy(&self) -> Arc<dyn SessionPolicyHook> {
    Arc::clone(&self.session_policy)
  }

  fn copilot_policy(&self) -> Arc<dyn CopilotPolicySpi> {
    Arc::clone(&self.copilot_policy)
  }

  fn rate_limit_policy(&self) -> Arc<dyn RateLimitPolicy> {
    Arc::clone(&self.rate_limit_policy)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use server_types::{LicenseTier, Limits, Rights};

  #[test]
  fn community_extension_edition_and_extra_router() {
    let ext = CommunityExtension::new();
    assert_eq!(ext.edition_name(), "community");
    assert!(ext.extra_router().is_none());
  }

  #[tokio::test]
  async fn community_copilot_policy_checks_byok_and_readonly() {
    let policy = CommunityCopilotPolicySpi;
    let default_grant = server_types::license::default_selfhost_access_grant();
    assert_eq!(default_grant.tier, LicenseTier::SelfhostDefault);
    assert_eq!(default_grant.limits.seat_limit, 10);
    assert_eq!(default_grant.limits.storage_quota_bytes, 107_374_182_400);

    assert!(policy.check_copilot_allowed(&default_grant, false).await.is_ok());
    assert!(matches!(
      policy.check_copilot_allowed(&default_grant, true).await,
      Err(DomainError::Forbidden(_))
    ));

    let readonly = AccessGrant {
      tier: LicenseTier::SelfhostDefault,
      billing_subject: BillingSubject::Owner,
      seat_quantity: Some(0),
      expires_at: None,
      limits: Limits {
        blob_limit_bytes: 0,
        storage_quota_bytes: 0,
        seat_limit: 0,
        seat_quota_bytes: None,
        history_period_seconds: 0,
        copilot_action_limit: Some(0),
      },
      rights: Rights {
        commercial: false,
        copilot_byok: false,
        unlimited_copilot: false,
      },
      diagnostics: vec!["readonly".into()],
    };
    assert!(matches!(
      policy.check_copilot_allowed(&readonly, false).await,
      Err(DomainError::QuotaExceeded { kind: "copilot", .. })
    ));
  }
}
