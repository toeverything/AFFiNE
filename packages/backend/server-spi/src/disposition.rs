//! Domain disposition SPI for commercial abuse-mitigation workers.

use server_types::DomainError;

/// Public-domain side-effect callbacks invoked by commercial abuse workers
/// (such as invite-abuse quarantine and ban dispositions) without leaking
/// commercial tables into the public core.
#[async_trait::async_trait]
pub trait DomainDispositionHandler: Send + Sync + 'static {
  /// Cancels unsettled mail deliveries initiated by `actor_user_id` and anonymizes PII.
  async fn cancel_mail_by_actor(&self, actor_user_id: &str, reason: &str) -> Result<u64, DomainError>;

  /// Cancels unsettled mail deliveries associated with `workspace_id` and anonymizes PII.
  async fn cancel_mail_by_workspace(&self, workspace_id: &str, reason: &str) -> Result<u64, DomainError>;

  /// Cancels unsettled mail deliveries tagged with `subject_key` and anonymizes PII.
  async fn cancel_mail_by_abuse_subject(&self, subject_key: &str, reason: &str) -> Result<u64, DomainError>;

  /// Deletes pending/waiting workspace invitations created by `actor_user_id`,
  /// returning the deduplicated list of affected workspace IDs.
  async fn cancel_pending_invitations_by_actor(&self, actor_user_id: &str) -> Result<Vec<String>, DomainError>;

  /// Deletes pending/waiting workspace invitations for `workspace_id`,
  /// returning the deduplicated list of affected workspace IDs.
  async fn cancel_pending_invitations_by_workspace(&self, workspace_id: &str) -> Result<Vec<String>, DomainError>;

  /// Bans `actor_user_id` via recreate-for-ban, revokes sessions for both the
  /// original and recreated tombstone user, and returns the recreated user ID.
  async fn ban_and_recreate_actor(&self, actor_user_id: &str) -> Result<String, DomainError>;

  /// Revokes all active sessions for `actor_user_id` and broadcasts invalidation.
  async fn revoke_actor_sessions(&self, actor_user_id: &str, reason: &str) -> Result<(), DomainError>;
}
