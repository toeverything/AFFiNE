use sqlx::PgPool;

use super::{
  Result, RuntimeByokLocalLeaseRecord, RuntimeMagicLinkOtpConsumeResult, RuntimeVerificationTokenRecord,
  RuntimeWorkspaceInviteLinkRecord, auth_challenge, byok_local_lease, dto::RuntimeStateRows, invite_link,
  magic_link_otp, verification_token,
};

pub(super) struct RuntimeStateStore {
  rows: RuntimeStateRows,
}

impl RuntimeStateStore {
  pub(super) fn new(pool: PgPool) -> Self {
    Self {
      rows: RuntimeStateRows::new(pool),
    }
  }

  pub(super) async fn create_auth_challenge(
    &self,
    purpose: &str,
    token: &str,
    payload: serde_json::Value,
    ttl_ms: i64,
  ) -> Result<bool> {
    auth_challenge::create(&self.rows, purpose, token, payload, ttl_ms).await
  }

  pub(super) async fn get_auth_challenge(&self, purpose: &str, token: &str) -> Result<Option<serde_json::Value>> {
    auth_challenge::get(&self.rows, purpose, token).await
  }

  pub(super) async fn consume_auth_challenge(&self, purpose: &str, token: &str) -> Result<Option<serde_json::Value>> {
    auth_challenge::consume(&self.rows, purpose, token).await
  }

  pub(super) async fn create_verification_token(
    &self,
    token_type: i32,
    credential: Option<String>,
    ttl_ms: i64,
  ) -> Result<String> {
    verification_token::create(&self.rows, token_type, credential, ttl_ms).await
  }

  pub(super) async fn get_verification_token(
    &self,
    token_type: i32,
    token: String,
    keep: bool,
  ) -> Result<Option<RuntimeVerificationTokenRecord>> {
    verification_token::get(&self.rows, token_type, token, keep).await
  }

  pub(super) async fn verify_verification_token(
    &self,
    token_type: i32,
    token: String,
    credential: Option<String>,
    keep: bool,
  ) -> Result<Option<RuntimeVerificationTokenRecord>> {
    verification_token::verify(&self.rows, token_type, token, credential, keep).await
  }

  pub(super) async fn cleanup_expired_verification_tokens(&self, limit: i64) -> Result<i64> {
    verification_token::cleanup_expired(&self.rows, limit).await
  }

  pub(super) async fn cleanup_expired_runtime_states(&self, limit: i64) -> Result<i64> {
    self
      .rows
      .cleanup_expired_or_consumed(limit, "RuntimeState cleanup")
      .await
  }

  pub(super) async fn upsert_magic_link_otp(
    &self,
    email: String,
    otp_hash: String,
    token: String,
    client_nonce: Option<String>,
    ttl_ms: i64,
  ) -> Result<()> {
    magic_link_otp::upsert(&self.rows, email, otp_hash, token, client_nonce, ttl_ms).await
  }

  pub(super) async fn consume_magic_link_otp(
    &self,
    email: String,
    otp_hash: String,
    client_nonce: Option<String>,
  ) -> Result<RuntimeMagicLinkOtpConsumeResult> {
    magic_link_otp::consume(&self.rows, email, otp_hash, client_nonce).await
  }

  pub(super) async fn create_workspace_invite_link(
    &self,
    workspace_id: String,
    invite_id: String,
    inviter_user_id: String,
    ttl_ms: i64,
  ) -> Result<RuntimeWorkspaceInviteLinkRecord> {
    invite_link::create(&self.rows, workspace_id, invite_id, inviter_user_id, ttl_ms).await
  }

  pub(super) async fn get_workspace_invite_link(
    &self,
    workspace_id: String,
  ) -> Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
    invite_link::get_by_workspace(&self.rows, workspace_id).await
  }

  pub(super) async fn get_workspace_invite_link_by_id(
    &self,
    invite_id: String,
  ) -> Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
    invite_link::get_by_invite_id(&self.rows, invite_id).await
  }

  pub(super) async fn revoke_workspace_invite_link(&self, workspace_id: String) -> Result<bool> {
    invite_link::revoke(&self.rows, workspace_id).await
  }

  pub(super) async fn create_byok_local_lease(
    &self,
    active_key: String,
    lease_id: String,
    payload: serde_json::Value,
    ttl_ms: i64,
  ) -> Result<RuntimeByokLocalLeaseRecord> {
    byok_local_lease::create(&self.rows, active_key, lease_id, payload, ttl_ms).await
  }

  pub(super) async fn get_byok_local_lease(&self, lease_id: String) -> Result<Option<RuntimeByokLocalLeaseRecord>> {
    byok_local_lease::get(&self.rows, lease_id).await
  }
}
