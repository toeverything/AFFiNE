use super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error};
pub(super) use super::{
  constants::{WORKSPACE_INVITE_LINK_ID_PURPOSE, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE},
  token_hash,
  types::RuntimeWorkspaceInviteLinkRecord,
};

mod captcha;
mod dto;
mod invite_link;
mod store;
use store::RuntimeStateStore;

pub(super) type Result<T> = RuntimeResult<T>;

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn create_auth_captcha_challenge_v1(&self) -> napi::Result<captcha::CaptchaChallenge> {
    captcha::create(self.pool().await?).await.map_err(napi::Error::from)
  }

  #[napi]
  pub async fn verify_auth_captcha_v1(&self, input: captcha::CaptchaVerificationInput) -> napi::Result<bool> {
    captcha::verify(self.pool().await?, input)
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
  use super::{WORKSPACE_INVITE_LINK_ID_PURPOSE, WORKSPACE_INVITE_LINK_WORKSPACE_PURPOSE, token_hash};

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
