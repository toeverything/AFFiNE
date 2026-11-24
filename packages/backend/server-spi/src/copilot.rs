//! Copilot policy and runtime SPI for community and commercial editions.

use server_types::{AccessGrant, DomainError};

#[async_trait::async_trait]
pub trait CopilotPolicySpi: Send + Sync + 'static {
  async fn check_copilot_allowed(&self, grant: &AccessGrant, using_byok: bool) -> Result<(), DomainError>;
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

/// Runtime availability and execution boundary for Copilot features.
#[async_trait::async_trait]
pub trait CopilotRuntimeSpi: Send + Sync + 'static {
  fn is_enabled(&self) -> bool {
    false
  }

  async fn assert_enabled(&self) -> Result<(), DomainError> {
    if self.is_enabled() {
      Ok(())
    } else {
      Err(DomainError::Forbidden("Copilot is disabled.".into()))
    }
  }
}

/// Default community copilot runtime SPI that reports Copilot as disabled.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityCopilotRuntime;

#[async_trait::async_trait]
impl CopilotRuntimeSpi for CommunityCopilotRuntime {}
