mod invite_abuse_actions;
mod invite_facts;
mod policy_adapter;
mod reservation;
mod workspace_invite;

pub(super) use affine_core::rate_limit::{
  ActorFacts, InviteAbuseFacts, InviteAbusePersistencePlan, InviteAbuseSubject, InviteActivityFacts, InviteCommitUsage,
  InviteInput, InviteOperation, InvitePlan, InvitePolicyDecision, PersistedInviteAbuseError,
  PersistedInviteAbuseRecord, QuotaFacts, RateLimitDenialReason, RateLimitPolicyError, TargetDomain, WorkspaceFacts,
  plan_invite, plan_invite_commit, plan_mail, validate_persisted_invite_abuse,
};
use invite_facts::{
  PERSISTED_ABUSE_COLUMNS, load_active_abuse_subjects, load_actor, load_invite_activity, load_quota, load_workspace,
  persisted_abuse_subject,
};
use napi::Result;
use policy_adapter::{invite_input, invite_policy_config, mail_input};
pub(super) use reservation::commit_scopes_in_transaction;
use reservation::{QuotaViolation, cleanup_expired, commit_reservation, release_reservation, reserve_scopes};

pub(super) use super::{
  BackendRuntime, ChargeSubject, InviteQuotaConfig, RuntimeError, RuntimeResult, napi_error, resolve_quota_charge,
  resolve_user_entitlement,
  types::{
    RuntimeInviteAbuseActionRequired, RuntimeInviteAbuseClaimedAction, RuntimeMailDeliveryQuotaDecision,
    RuntimeMailDeliveryQuotaInput, RuntimeQuotaSourceInput, RuntimeQuotaTargetDomainInput,
    RuntimeWorkspaceActionDecision, RuntimeWorkspaceInviteQuotaDecision, RuntimeWorkspaceInviteQuotaInput,
    RuntimeWorkspaceInviteQuotaUsage,
  },
};

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn assert_mail_delivery_quota_v1(
    &self,
    input: RuntimeMailDeliveryQuotaInput,
  ) -> Result<RuntimeMailDeliveryQuotaDecision> {
    let plan = match plan_mail(&mail_input(&input)) {
      Ok(plan) => plan,
      Err(error) => {
        let (mail_class, reason) = match error {
          RateLimitPolicyError::UnmappedMailName => ("unmapped", RateLimitDenialReason::UnmappedMailName),
          RateLimitPolicyError::InvalidEmail => ("invalid", RateLimitDenialReason::InvalidEmail),
          _ => return Err(napi_error(error.to_string())),
        };
        return Ok(RuntimeMailDeliveryQuotaDecision {
          allowed: false,
          reservation_id: None,
          mail_class: mail_class.to_string(),
          retry_after_seconds: None,
          reason: Some(reason.as_str().to_string()),
          scope_key: None,
          window_seconds: None,
          limit: None,
          current: None,
          requested: Some(1),
        });
      }
    };
    let pool = self.pool().await?;
    match reserve_scopes(&pool, plan.purpose, input.request_id.as_deref(), plan.scopes).await? {
      Ok(reservation) => Ok(RuntimeMailDeliveryQuotaDecision {
        allowed: true,
        reservation_id: Some(reservation.reservation_id),
        mail_class: plan.class.as_str().to_string(),
        retry_after_seconds: None,
        reason: None,
        scope_key: None,
        window_seconds: None,
        limit: None,
        current: None,
        requested: Some(1),
      }),
      Err(violation) => Ok(RuntimeMailDeliveryQuotaDecision {
        allowed: false,
        reservation_id: None,
        mail_class: plan.class.as_str().to_string(),
        retry_after_seconds: Some(60),
        reason: Some(RateLimitDenialReason::MailClass.as_str().to_string()),
        scope_key: Some(violation.scope_key),
        window_seconds: Some(violation.window_seconds),
        limit: Some(violation.limit),
        current: Some(violation.current),
        requested: Some(violation.requested),
      }),
    }
  }

  #[napi]
  pub async fn commit_mail_delivery_quota_v1(&self, reservation_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    commit_reservation(&pool, &reservation_id, 1, |scope_keys| Ok(vec![1; scope_keys.len()]))
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
