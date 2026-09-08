use affine_core::access_control::{ByokAccessContext, ByokExecution, evaluate_byok_access};
use napi::Result;
use sqlx::Row;

use super::{BackendRuntime, CoreDeployment, Deployment, RuntimeError, load_decision_time, resolve_user_entitlement};

#[derive(Debug)]
#[napi_derive::napi(object)]
pub struct RuntimeByokEntitlement {
  pub server: bool,
  pub local: bool,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn has_ai_entitlement_v1(&self, user_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin actor entitlement read", e))?;
    let now = load_decision_time(&mut tx, "actor entitlement clock").await?;
    let deployment = self.config()?.deployment;
    let grant = resolve_user_entitlement(&mut tx, deployment, &user_id, "", now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit actor entitlement read", e))?;
    Ok(
      evaluate_byok_access(
        ByokAccessContext {
          deployment: match deployment {
            Deployment::Cloud => CoreDeployment::Cloud,
            Deployment::SelfHosted => CoreDeployment::SelfHosted,
          },
          execution: ByokExecution::Local,
        },
        None,
        None,
        Some(grant.rights),
      )
      .allowed,
    )
  }

  #[napi]
  pub async fn has_workspace_commercial_entitlement_v1(&self, workspace_id: String) -> Result<bool> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin workspace entitlement read", e))?;
    let now = load_decision_time(&mut tx, "workspace entitlement clock").await?;
    let grant = super::resolve_workspace_entitlement(&mut tx, self.config()?.deployment, &workspace_id, now).await?;
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit workspace entitlement read", e))?;
    Ok(grant.rights.commercial)
  }

  #[napi]
  pub async fn get_byok_entitlement_v1(
    &self,
    workspace_id: String,
    actor_id: Option<String>,
  ) -> Result<RuntimeByokEntitlement> {
    let pool = self.pool().await?;
    let mut tx = pool
      .begin()
      .await
      .map_err(|e| RuntimeError::database("begin BYOK entitlement read", e))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
      .execute(&mut *tx)
      .await
      .map_err(|e| RuntimeError::database("set BYOK snapshot", e))?;
    let row = sqlx::query(
      "SELECT m.user_id FROM workspaces w LEFT JOIN workspace_members m ON m.workspace_id=w.id AND m.role='owner' AND \
       m.state='active' WHERE w.id=$1",
    )
    .bind(&workspace_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| RuntimeError::database("read BYOK workspace owner", e))?;
    let Some(row) = row else {
      return Ok(RuntimeByokEntitlement {
        server: false,
        local: false,
      });
    };
    let owner_id: String = row
      .get::<Option<String>, _>("user_id")
      .ok_or_else(|| RuntimeError::invalid_input("workspace_owner_not_found"))?;
    let deployment = self.config()?.deployment;
    let now = load_decision_time(&mut tx, "BYOK entitlement clock").await?;
    let workspace = super::resolve_workspace_entitlement(&mut tx, deployment, &workspace_id, now).await?;
    let owner = resolve_user_entitlement(&mut tx, deployment, &owner_id, &workspace_id, now).await?;
    let actor = if let Some(actor_id) = actor_id {
      Some(
        resolve_user_entitlement(&mut tx, deployment, &actor_id, &workspace_id, now)
          .await?
          .rights,
      )
    } else {
      None
    };
    let evaluate = |execution| {
      evaluate_byok_access(
        ByokAccessContext {
          deployment: match deployment {
            Deployment::Cloud => CoreDeployment::Cloud,
            Deployment::SelfHosted => CoreDeployment::SelfHosted,
          },
          execution,
        },
        Some(workspace.rights),
        Some(owner.rights),
        actor,
      )
      .allowed
    };
    let result = RuntimeByokEntitlement {
      server: evaluate(ByokExecution::Server),
      local: evaluate(ByokExecution::Local),
    };
    tx.commit()
      .await
      .map_err(|e| RuntimeError::database("commit BYOK entitlement read", e))?;
    Ok(result)
  }
}
