//! Pure canonical Service Provider Interfaces (SPI) for AFFiNE server editions.
//!
//! Defines the exact trait boundaries between the open-source community core
//! and commercial extensions, along with [`CommunityExtension`].

pub mod billing;
pub mod byok;
pub mod copilot;
pub mod disposition;
pub mod embedding;
pub mod transcript;

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex, OnceLock};

pub use billing::{
  AdminPaymentAttemptRecord, AdminPaymentCaseRecord, AdminPaymentLookupSpiInput, AdminPaymentResolutionRecord,
  AdminPaymentSourceRecord, BillingAppStorePurchaseInput, BillingAppStorePurchaseResult, BillingCheckoutInput,
  BillingCheckoutResult, BillingGroupRecord, BillingInvoiceRecord, BillingPriceRecord, BillingSourceRecord, BillingSpi,
  BillingSubscriptionList, BillingSubscriptionRecord, CommunityBillingSpi, ReconcileAdminPaymentSpiInput,
};
pub use byok::{
  ByokCapabilityDto, ByokCatalogDto, ByokCatalogModelDto, ByokCatalogProviderDto, ByokEndpointDto, ByokLocalLeaseDto,
  ByokModelDeclarationDto, ByokModelProbeCheckDto, ByokModelProbeDto, ByokPolicyDto, ByokProbeCheckSpiInput,
  ByokProbeResultDto, ByokProbeStatusDto, ByokProfileDefinitionDto, ByokProfileDto, ByokProfileOrderSpiInput,
  ByokSettingsDto, ByokSpi, ByokUsagePointDto, ByokValidationDto, CommunityByokSpi,
  CreateByokLocalLeaseProviderSpiInput, CreateByokLocalLeaseSpiInput, CreateByokProfileSpiInput,
  ProbeByokDraftSpiInput, ProbeByokProfileSpiInput, ReorderByokProfilesSpiInput, ReplaceByokProfileSpiInput,
  RotateByokCredentialSpiInput,
};
use chrono::{DateTime, Utc};
pub use copilot::{
  CleanupCopilotSessionsSpiInput, CommunityCopilotPolicySpi, CommunityCopilotRuntime, CopilotAttachmentObject,
  CopilotChatMessageRecord, CopilotHistoryOrder, CopilotHistoryRecord, CopilotPolicySpi, CopilotQuotaRecord,
  CopilotRouteOptionsRecord, CopilotRouteTargetRecord, CopilotRuntimeSpi, CopilotScopeMode,
  CopilotSessionSummaryRecord, CopilotSseFrame, CopilotSseStream, CopilotStreamObjectRecord, CopilotStreamSpiInput,
  CreateCopilotMessageSpiInput, CreateCopilotSessionSpiInput, DownloadCopilotAttachmentSpiInput,
  ForkCopilotSessionSpiInput, ListCopilotChatsSpiInput, ListCopilotHistoriesSpiInput, ListCopilotSessionsSpiInput,
  PaginatedCopilotHistoriesRecord, PreparedCopilotSseStream, UpdateCopilotSessionSpiInput,
  UploadCopilotAttachmentSpiInput, UploadedCopilotFile,
};
pub use disposition::DomainDispositionHandler;
pub use embedding::{
  AddWorkspaceArtifactInput, BoxedWorkspaceArtifactLock, CommunityCopilotEmbeddingSpi, CopilotEmbeddingSpi,
  EmbeddingPagination, VectorDocSearchHit, WorkspaceArtifactLock, WorkspaceArtifactPage, WorkspaceArtifactRecord,
  WorkspaceIgnoredDocPage, WorkspaceIgnoredDocRecord,
};
pub use server_types::BillingSubject;
use server_types::{AccessGrant, DomainError};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};
pub use transcript::{
  AudioSliceManifestItemRecord, AudioSlicePayload, AudioSliceUpload, CommunityCopilotTranscriptSpi,
  CopilotTranscriptSpi, MAX_TRANSCRIPT_SLICE_BYTES, MAX_TRANSCRIPT_SLICE_COUNT, MeetingActionItemRecord,
  MeetingSummaryV2Record, NormalizedTranscriptSegmentRecord, SubmitTranscriptTaskSpiInput, TranscriptItemRecord,
  TranscriptJobStatus, TranscriptQualityRecord, TranscriptSourceAudioInputRecord, TranscriptSourceAudioRecord,
  TranscriptTaskRecord,
};

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

/// Request network source metadata passed to [`RateLimitPolicy`] for
/// rolling-window rate limiting by extensions.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RequestSource {
  pub trusted: bool,
  pub ip: Option<String>,
  pub asn: Option<u32>,
}

/// Deferred side effect executed after the caller rolls back a rejected
/// rate-limited transaction and releases its pooled database connection.
pub type PostRollbackEffect = Pin<Box<dyn Future<Output = Result<(), DomainError>> + Send>>;

/// Structured rate-limit rejection carrying an optional post-rollback side
/// effect (such as out-of-transaction invite abuse quarantine persistence).
pub struct RateLimitRejection {
  pub error: DomainError,
  pub post_rollback: Option<PostRollbackEffect>,
}

impl std::fmt::Debug for RateLimitRejection {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("RateLimitRejection")
      .field("error", &self.error)
      .field("has_post_rollback", &self.post_rollback.is_some())
      .finish()
  }
}

impl RateLimitRejection {
  pub fn new(error: DomainError) -> Self {
    Self {
      error,
      post_rollback: None,
    }
  }

  pub fn with_post_rollback(error: DomainError, post_rollback: PostRollbackEffect) -> Self {
    Self {
      error,
      post_rollback: Some(post_rollback),
    }
  }

  /// Runs any deferred side effect after the caller has rolled back its outer
  /// transaction, then returns the original [`DomainError`].
  pub async fn apply_post_rollback(self) -> Result<DomainError, DomainError> {
    if let Some(effect) = self.post_rollback {
      effect.await?;
    }
    Ok(self.error)
  }
}

impl From<DomainError> for RateLimitRejection {
  fn from(error: DomainError) -> Self {
    Self::new(error)
  }
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
  ) -> Result<(), RateLimitRejection>;

  async fn check_workspace_invite_link(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _inviter_id: &str,
    _source: Option<&RequestSource>,
    _now: DateTime<Utc>,
  ) -> Result<(), RateLimitRejection> {
    Ok(())
  }
}

#[async_trait::async_trait]
pub trait CopilotRealtimeSpi: Send + Sync + 'static {
  async fn get_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    blob_id: Option<&str>,
    task_id: Option<&str>,
  ) -> Result<serde_json::Value, DomainError>;

  async fn retry_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<serde_json::Value, DomainError>;

  async fn authorize_transcript_task(
    &self,
    user_id: &str,
    workspace_id: &str,
    task_id: &str,
  ) -> Result<(), DomainError>;

  async fn get_embedding_progress(&self, user_id: &str, workspace_id: &str) -> Result<serde_json::Value, DomainError>;

  async fn authorize_embedding_progress(&self, user_id: &str, workspace_id: &str) -> Result<(), DomainError>;

  async fn delegated_editor_upsert(
    &self,
    user_id: &str,
    connection_id: &str,
    input: serde_json::Value,
  ) -> Result<serde_json::Value, DomainError>;

  async fn delegated_editor_release(
    &self,
    user_id: &str,
    input: serde_json::Value,
  ) -> Result<serde_json::Value, DomainError>;

  async fn delegated_tool_respond(
    &self,
    user_id: &str,
    input: serde_json::Value,
  ) -> Result<serde_json::Value, DomainError>;
}

pub trait ServerExtension: Send + Sync + 'static {
  fn edition_name(&self) -> &'static str;
  fn quota_gate(&self) -> Arc<dyn QuotaGate>;
  fn session_policy(&self) -> Arc<dyn SessionPolicyHook>;
  fn copilot_policy(&self) -> Arc<dyn CopilotPolicySpi>;
  fn copilot_runtime(&self) -> Arc<dyn CopilotRuntimeSpi> {
    Arc::new(CommunityCopilotRuntime)
  }
  fn byok_spi(&self) -> Arc<dyn ByokSpi> {
    Arc::new(CommunityByokSpi)
  }
  fn copilot_embedding_spi(&self) -> Arc<dyn CopilotEmbeddingSpi> {
    Arc::new(CommunityCopilotEmbeddingSpi)
  }
  fn copilot_transcript_spi(&self) -> Arc<dyn CopilotTranscriptSpi> {
    Arc::new(CommunityCopilotTranscriptSpi)
  }
  fn copilot_realtime_spi(&self) -> Option<Arc<dyn CopilotRealtimeSpi>> {
    None
  }
  fn available_user_features(&self) -> &'static [&'static str] {
    &["administrator"]
  }
  fn rate_limit_policy(&self) -> Arc<dyn RateLimitPolicy> {
    Arc::new(CommunityRateLimitPolicy)
  }
  fn billing_spi(&self) -> Arc<dyn BillingSpi> {
    Arc::new(CommunityBillingSpi)
  }
  fn extra_router(&self) -> Option<axum::Router> {
    None
  }
}

/// Default community quota gate backed by the bundled 10-seat / 100 GiB
/// signed `selfhost_default` license and active self-hosted workspace licenses.
#[derive(Clone, Debug, Default)]
pub struct CommunityQuotaGate {
  keyring: server_types::license::Keyring,
}

impl CommunityQuotaGate {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn with_keyring(keyring: server_types::license::Keyring) -> Self {
    Self { keyring }
  }

  fn verify_cached_commercial_grant(
    &self,
    workspace_id: &str,
    license_bytes: &[u8],
    now: DateTime<Utc>,
    require_workspace_scoped: bool,
  ) -> Option<(u8, u8, AccessGrant)> {
    let digest: [u8; 32] = Sha256::digest(license_bytes).into();
    let keyring_digest: [u8; 32] = Sha256::digest(
      self
        .keyring
        .get(server_types::license::PRO_KID)
        .unwrap_or("")
        .as_bytes(),
    )
    .into();
    let cache_key = (workspace_id.to_owned(), digest, keyring_digest);
    if let Ok(guard) = verified_license_cache().lock()
      && let Some(cached) = guard.get(&cache_key)
    {
      if now >= cached.not_before()
        && cached.expires_at().is_none_or(|exp| now < exp)
        && cached.is_commercial()
        && (!require_workspace_scoped || cached.is_workspace_scoped())
      {
        let scope_priority = u8::from(cached.is_workspace_scoped());
        let grant = cached.to_access_grant();
        let tier_rank = match grant.tier {
          server_types::LicenseTier::SelfhostEnterprise => 4,
          server_types::LicenseTier::SelfhostTeam => 3,
          _ => 0,
        };
        return Some((scope_priority, tier_rank, grant));
      }
      return None;
    }
    let normalized = server_types::license::normalize_license(license_bytes).ok()?;
    let verified =
      server_types::license::verify_any_license(normalized.as_ref(), &self.keyring, Some(workspace_id), now).ok()?;
    if !verified.is_commercial() || (require_workspace_scoped && !verified.is_workspace_scoped()) {
      return None;
    }
    let scope_priority = u8::from(verified.is_workspace_scoped());
    let grant = verified.to_access_grant();
    let tier_rank = match grant.tier {
      server_types::LicenseTier::SelfhostEnterprise => 4,
      server_types::LicenseTier::SelfhostTeam => 3,
      _ => 0,
    };
    if let Ok(mut guard) = verified_license_cache().lock() {
      if guard.len() >= 1024 {
        guard.clear();
      }
      guard.insert(cache_key, verified);
    }
    Some((scope_priority, tier_rank, grant))
  }
}

type VerifiedLicenseCacheMap = HashMap<(String, [u8; 32], [u8; 32]), server_types::license::VerifiedAnyLicense>;

static VERIFIED_LICENSE_CACHE: OnceLock<Mutex<VerifiedLicenseCacheMap>> = OnceLock::new();

fn verified_license_cache() -> &'static Mutex<VerifiedLicenseCacheMap> {
  VERIFIED_LICENSE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

type EntitlementCandidateRow = (
  String,
  String,
  Option<DateTime<Utc>>,
  Option<DateTime<Utc>>,
  Option<DateTime<Utc>>,
  Option<Vec<u8>>,
);

#[async_trait::async_trait]
impl QuotaGate for CommunityQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    let entitlement_rows: Vec<EntitlementCandidateRow> = sqlx::query_as(
      "SELECT id, status, starts_at, expires_at, grace_until, signed_payload
       FROM entitlements
       WHERE source = 'selfhost_license'
         AND target_type = 'workspace'
         AND target_id = $1
       ORDER BY updated_at DESC, id DESC",
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load selfhost entitlements for workspace {workspace_id}: {e}")))?;

    if !entitlement_rows.is_empty() {
      let fallback = server_types::license::default_selfhost_access_grant();
      let mut best_priority: (u8, u8, bool, u8, i32, i64) = (
        0,
        0,
        false,
        0,
        fallback.limits.seat_limit,
        fallback.limits.storage_quota_bytes,
      );
      let mut best_payload: Vec<u8> = Vec::new();
      let mut best = fallback;

      for (_id, status, starts_at, expires_at, grace_until, signed_payload) in entitlement_rows {
        let status_priority: u8 = match status.as_str() {
          "active" => 2,
          "grace" => 1,
          _ => continue,
        };
        if starts_at.is_some_and(|starts| now < starts) {
          continue;
        }
        if status == "grace" {
          if grace_until.is_none_or(|grace| now >= grace) {
            continue;
          }
        } else if expires_at.is_some_and(|exp| now >= exp) {
          continue;
        }
        let Some(payload) = signed_payload else {
          continue;
        };
        let Some((scope_priority, tier_rank, grant)) =
          self.verify_cached_commercial_grant(workspace_id, &payload, now, false)
        else {
          continue;
        };
        let priority = (
          scope_priority,
          status_priority,
          grant.rights.commercial,
          tier_rank,
          grant.limits.seat_limit,
          grant.limits.storage_quota_bytes,
        );
        if (priority, payload.as_slice()) > (best_priority, best_payload.as_slice()) {
          best_priority = priority;
          best_payload = payload;
          best = grant;
        }
      }
      return Ok(best);
    }

    let installed_bytes: Option<Vec<u8>> = sqlx::query_scalar::<_, Option<Vec<u8>>>(
      "SELECT license FROM installed_licenses WHERE workspace_id = $1 LIMIT 1",
    )
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("load installed license for workspace {workspace_id}: {e}")))?
    .flatten();

    if let Some(license_bytes) = installed_bytes
      && let Some((_, _, grant)) = self.verify_cached_commercial_grant(workspace_id, &license_bytes, now, true)
    {
      return Ok(grant);
    }
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
  ) -> Result<(), RateLimitRejection> {
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
      quota_gate: Arc::new(CommunityQuotaGate::new()),
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

  #[tokio::test]
  async fn community_extension_edition_and_defaults() {
    let ext = CommunityExtension::new();
    assert_eq!(ext.edition_name(), "community");
    assert!(ext.extra_router().is_none());
    let runtime = ext.copilot_runtime();
    assert!(!runtime.is_enabled());
    assert!(!runtime.is_effectively_enabled(true).await);
    assert!(matches!(
      runtime.assert_enabled(true).await,
      Err(DomainError::Forbidden(msg)) if msg == "Copilot is disabled."
    ));
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
