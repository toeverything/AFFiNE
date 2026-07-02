use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error};
pub(super) use super::{
  constants::{
    BYOK_LOCAL_LEASE_ACTIVE_PURPOSE, BYOK_LOCAL_LEASE_PURPOSE, MAGIC_LINK_OTP_PURPOSE, MAX_MAGIC_LINK_OTP_ATTEMPTS,
    WORKSPACE_INVITE_LINK_ID_PURPOSE, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE,
  },
  token_hash,
  types::{
    RuntimeByokLocalLeaseRecord, RuntimeMagicLinkOtpConsumeResult, RuntimeVerificationTokenRecord,
    RuntimeWorkspaceInviteLinkRecord,
  },
};

mod auth_challenge;
mod byok_local_lease;
mod dto;
mod invite_link;
mod magic_link_otp;
mod store;
mod verification_token;
use store::RuntimeStateStore;

pub(super) type Result<T> = RuntimeResult<T>;

pub(super) fn auth_challenge_purpose(purpose: &str) -> String {
  format!("auth_challenge:{purpose}")
}

pub(super) fn verification_token_purpose(token_type: i32) -> String {
  format!("verification_token:{token_type}")
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn create_auth_challenge(
    &self,
    purpose: String,
    token: String,
    payload: serde_json::Value,
    ttl_ms: i64,
  ) -> napi::Result<bool> {
    if ttl_ms <= 0 {
      return Err(napi_error("auth challenge ttl must be positive"));
    }
    RuntimeStateStore::new(self.pool().await?)
      .create_auth_challenge(&purpose, &token, payload, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn get_auth_challenge(&self, purpose: String, token: String) -> napi::Result<Option<serde_json::Value>> {
    RuntimeStateStore::new(self.pool().await?)
      .get_auth_challenge(&purpose, &token)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn consume_auth_challenge(
    &self,
    purpose: String,
    token: String,
  ) -> napi::Result<Option<serde_json::Value>> {
    RuntimeStateStore::new(self.pool().await?)
      .consume_auth_challenge(&purpose, &token)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn create_verification_token(
    &self,
    token_type: i32,
    credential: Option<String>,
    ttl_ms: i64,
  ) -> napi::Result<String> {
    if ttl_ms <= 0 {
      return Err(napi_error("verification token ttl must be positive"));
    }
    RuntimeStateStore::new(self.pool().await?)
      .create_verification_token(token_type, credential, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn get_verification_token(
    &self,
    token_type: i32,
    token: String,
    keep: Option<bool>,
  ) -> napi::Result<Option<RuntimeVerificationTokenRecord>> {
    let keep = keep.unwrap_or(false);
    RuntimeStateStore::new(self.pool().await?)
      .get_verification_token(token_type, token, keep)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn verify_verification_token(
    &self,
    token_type: i32,
    token: String,
    credential: Option<String>,
    keep: Option<bool>,
  ) -> napi::Result<Option<RuntimeVerificationTokenRecord>> {
    let keep = keep.unwrap_or(false);
    RuntimeStateStore::new(self.pool().await?)
      .verify_verification_token(token_type, token, credential, keep)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn cleanup_expired_verification_tokens(&self, limit: i64) -> napi::Result<i64> {
    if limit <= 0 {
      return Err(napi_error("verification token cleanup limit must be positive"));
    }
    RuntimeStateStore::new(self.pool().await?)
      .cleanup_expired_verification_tokens(limit)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn upsert_magic_link_otp(
    &self,
    email: String,
    otp_hash: String,
    token: String,
    client_nonce: Option<String>,
    ttl_ms: i64,
  ) -> napi::Result<()> {
    RuntimeStateStore::new(self.pool().await?)
      .upsert_magic_link_otp(email, otp_hash, token, client_nonce, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn consume_magic_link_otp(
    &self,
    email: String,
    otp_hash: String,
    client_nonce: Option<String>,
  ) -> napi::Result<RuntimeMagicLinkOtpConsumeResult> {
    RuntimeStateStore::new(self.pool().await?)
      .consume_magic_link_otp(email, otp_hash, client_nonce)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn create_workspace_invite_link(
    &self,
    workspace_id: String,
    invite_id: String,
    inviter_user_id: String,
    ttl_ms: i64,
  ) -> napi::Result<RuntimeWorkspaceInviteLinkRecord> {
    RuntimeStateStore::new(self.pool().await?)
      .create_workspace_invite_link(workspace_id, invite_id, inviter_user_id, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn get_workspace_invite_link(
    &self,
    workspace_id: String,
  ) -> napi::Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
    RuntimeStateStore::new(self.pool().await?)
      .get_workspace_invite_link(workspace_id)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn get_workspace_invite_link_by_id(
    &self,
    invite_id: String,
  ) -> napi::Result<Option<RuntimeWorkspaceInviteLinkRecord>> {
    RuntimeStateStore::new(self.pool().await?)
      .get_workspace_invite_link_by_id(invite_id)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn revoke_workspace_invite_link(&self, workspace_id: String) -> napi::Result<bool> {
    RuntimeStateStore::new(self.pool().await?)
      .revoke_workspace_invite_link(workspace_id)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn create_byok_local_lease(
    &self,
    active_key: String,
    lease_id: String,
    payload: serde_json::Value,
    ttl_ms: i64,
  ) -> napi::Result<RuntimeByokLocalLeaseRecord> {
    RuntimeStateStore::new(self.pool().await?)
      .create_byok_local_lease(active_key, lease_id, payload, ttl_ms)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn get_byok_local_lease(&self, lease_id: String) -> napi::Result<Option<RuntimeByokLocalLeaseRecord>> {
    RuntimeStateStore::new(self.pool().await?)
      .get_byok_local_lease(lease_id)
      .await
      .map_err(napi::Error::from)
  }

  #[napi]
  pub async fn cleanup_expired_runtime_states(&self, limit: i64) -> napi::Result<i64> {
    if limit <= 0 {
      return Err(napi_error("runtime state cleanup limit must be positive"));
    }
    RuntimeStateStore::new(self.pool().await?)
      .cleanup_expired_runtime_states(limit)
      .await
      .map_err(napi::Error::from)
  }
}

#[cfg(test)]
mod tests {
  use super::{
    MAGIC_LINK_OTP_PURPOSE, WORKSPACE_INVITE_LINK_ID_PURPOSE, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE, token_hash,
  };

  #[test]
  fn magic_link_otp_uses_scoped_purpose_and_email_hash() {
    assert_eq!(MAGIC_LINK_OTP_PURPOSE, "magic_link_otp");
    assert_ne!(token_hash("user@affine.test"), "user@affine.test");
    assert_eq!(token_hash("user@affine.test"), token_hash("user@affine.test"));
    assert_ne!(token_hash("user@affine.test"), token_hash("other@affine.test"));
  }

  #[test]
  fn workspace_invite_link_uses_scoped_purposes_and_hashes() {
    assert_eq!(
      WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE,
      "workspace_invite_link:workspace"
    );
    assert_eq!(WORKSPACE_INVITE_LINK_ID_PURPOSE, "workspace_invite_link:id");
    assert_ne!(token_hash("workspace-id"), "workspace-id");
    assert_ne!(token_hash("invite-id"), "invite-id");
  }
}
