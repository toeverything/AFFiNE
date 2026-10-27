use sqlx::PgPool;

use super::{Result, RuntimeWorkspaceInviteLinkRecord, dto::RuntimeStateRows, invite_link};

pub(super) struct RuntimeStateStore {
  rows: RuntimeStateRows,
}

impl RuntimeStateStore {
  pub(super) fn new(pool: PgPool) -> Self {
    Self {
      rows: RuntimeStateRows::new(pool),
    }
  }

  pub(super) async fn cleanup_expired_runtime_states(&self, limit: i64) -> Result<i64> {
    self
      .rows
      .cleanup_expired_or_consumed(limit, "RuntimeState cleanup")
      .await
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
}
