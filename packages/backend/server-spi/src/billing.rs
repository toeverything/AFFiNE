//! Billing SPI for commercial edition hooks.

use server_types::DomainError;

#[async_trait::async_trait]
pub trait BillingSpi: Send + Sync + 'static {
  async fn on_pre_delete_user(&self, _user_id: &str) -> Result<(), DomainError> {
    Ok(())
  }

  async fn on_workspace_members_changed(&self, _workspace_id: &str) -> Result<(), DomainError> {
    Ok(())
  }

  async fn create_selfhost_customer_portal(&self, _workspace_id: &str) -> Result<String, DomainError> {
    Err(DomainError::Unavailable(
      "Self-hosted customer portal is not configured.".to_owned(),
    ))
  }
}

/// Default community billing SPI with no-op hooks.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityBillingSpi;

#[async_trait::async_trait]
impl BillingSpi for CommunityBillingSpi {}
