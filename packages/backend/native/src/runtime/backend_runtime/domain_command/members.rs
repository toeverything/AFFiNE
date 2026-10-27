use affine_core::access_control::{DomainCommand, WorkspaceRole};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};

use super::authorize_domain;
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

#[derive(Clone, Debug, Eq, PartialEq)]
struct RemovalTarget {
  role: WorkspaceRole,
  state: String,
}

pub(super) async fn revoke_workspace_member(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  target_user_id: String,
) -> RuntimeResult<Value> {
  let located = load_removal_target(transaction, &workspace_id, &target_user_id, false)
    .await?
    .ok_or_else(|| RuntimeError::invalid_input("workspace_member_not_found"))?;
  let command = DomainCommand::RevokeWorkspaceMember {
    target_role: located.role,
    actor_is_target: actor_user_id == target_user_id,
  };
  authorize_domain(authorizer, transaction, &actor_user_id, &workspace_id, None, &command).await?;
  let locked = load_removal_target(transaction, &workspace_id, &target_user_id, true)
    .await?
    .ok_or_else(|| RuntimeError::invalid_input("workspace_member_not_found"))?;
  if locked != located {
    return Err(RuntimeError::invalid_input("workspace_member_target_changed"));
  }
  delete_workspace_target(transaction, &workspace_id, &target_user_id).await?;
  Ok(json!({
    "workspaceId": workspace_id,
    "targetUserId": target_user_id,
    "previousRole": located.role.as_str(),
    "previousState": located.state,
  }))
}

pub(super) async fn leave_workspace(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
) -> RuntimeResult<Value> {
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    None,
    &DomainCommand::LeaveWorkspace,
  )
  .await?;
  let target = load_removal_target(transaction, &workspace_id, &actor_user_id, true)
    .await?
    .filter(|target| target.state == "active")
    .ok_or_else(|| RuntimeError::invalid_input("workspace_member_not_found"))?;
  delete_workspace_target(transaction, &workspace_id, &actor_user_id).await?;
  Ok(json!({
    "workspaceId": workspace_id,
    "targetUserId": actor_user_id,
    "previousRole": target.role.as_str(),
    "previousState": target.state,
  }))
}

async fn load_removal_target(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  target_user_id: &str,
  lock: bool,
) -> RuntimeResult<Option<RemovalTarget>> {
  let member_query = if lock {
    "SELECT role, state FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active' FOR UPDATE"
  } else {
    "SELECT role, state FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active'"
  };
  if let Some(row) = sqlx::query(member_query)
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load workspace member removal target", error))?
  {
    let role: String = row.get("role");
    return Ok(Some(RemovalTarget {
      role: parse_workspace_role(&role)?,
      state: row.get("state"),
    }));
  }
  let invitation_query = if lock {
    "SELECT requested_role AS role, status AS state FROM workspace_invitations WHERE workspace_id=$1 AND \
     invitee_user_id=$2 FOR UPDATE"
  } else {
    "SELECT requested_role AS role, status AS state FROM workspace_invitations WHERE workspace_id=$1 AND \
     invitee_user_id=$2"
  };
  sqlx::query(invitation_query)
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load workspace invitation removal target", error))?
    .map(|row| {
      let role: String = row.get("role");
      Ok(RemovalTarget {
        role: parse_workspace_role(&role)?,
        state: row.get("state"),
      })
    })
    .transpose()
}

fn parse_workspace_role(role: &str) -> RuntimeResult<WorkspaceRole> {
  WorkspaceRole::parse(role)
    .filter(|role| !matches!(role, WorkspaceRole::External))
    .ok_or_else(|| RuntimeError::invalid_input("invalid_workspace_role_state"))
}

async fn delete_workspace_target(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  target_user_id: &str,
) -> RuntimeResult<()> {
  sqlx::query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active'")
    .bind(workspace_id)
    .bind(target_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("delete workspace member", error))?;
  sqlx::query("DELETE FROM workspace_invitations WHERE workspace_id=$1 AND invitee_user_id=$2")
    .bind(workspace_id)
    .bind(target_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("delete workspace invitation", error))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::Deployment;

  async fn add_member(pool: &sqlx::PgPool, workspace_id: &str, role: &str) -> String {
    let user_id = format!("domain-member-{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Domain \
       Member',$2,true,now(),false)",
    )
    .bind(&user_id)
    .bind(format!("{user_id}@example.com"))
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,$3,'active')")
      .bind(workspace_id)
      .bind(&user_id)
      .bind(role)
      .execute(pool)
      .await
      .unwrap();
    user_id
  }

  #[tokio::test]
  async fn removal_invariants_and_member_invitation_targets_are_canonical() {
    assert_eq!(parse_workspace_role("admin").unwrap(), WorkspaceRole::Admin);
    assert_eq!(
      parse_workspace_role("unknown").unwrap_err().to_string(),
      "invalid_workspace_role_state"
    );
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, owner_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let member_id = add_member(&pool, &workspace_id, "member").await;
    let leaving_id = add_member(&pool, &workspace_id, "member").await;
    let invitee_id = format!("domain-invitee-{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Domain \
       Invitee',$2,true,now(),false)",
    )
    .bind(&invitee_id)
    .bind(format!("{invitee_id}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_invitations(id,workspace_id,invitee_user_id,normalized_email,status) \
       VALUES($1,$2,$3,$4,'pending')",
    )
    .bind(format!("invitation-{invitee_id}"))
    .bind(&workspace_id)
    .bind(&invitee_id)
    .bind(format!("{invitee_id}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);

    let mut transaction = pool.begin().await.unwrap();
    let error = revoke_workspace_member(
      &authorizer,
      &mut transaction,
      owner_id.clone(),
      workspace_id.clone(),
      owner_id.clone(),
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "cannot_revoke_self");
    transaction.rollback().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    let error = revoke_workspace_member(
      &authorizer,
      &mut transaction,
      member_id.clone(),
      workspace_id.clone(),
      owner_id.clone(),
    )
    .await
    .unwrap_err();
    assert_eq!(error.to_string(), "workspace_owner_must_transfer");
    transaction.rollback().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    let error = leave_workspace(&authorizer, &mut transaction, owner_id.clone(), workspace_id.clone())
      .await
      .unwrap_err();
    assert_eq!(error.to_string(), "workspace_owner_cannot_leave");
    transaction.rollback().await.unwrap();

    for (target_user_id, expected_state) in [(&member_id, "active"), (&invitee_id, "pending")] {
      let mut transaction = pool.begin().await.unwrap();
      let value = revoke_workspace_member(
        &authorizer,
        &mut transaction,
        owner_id.clone(),
        workspace_id.clone(),
        target_user_id.clone(),
      )
      .await
      .unwrap();
      assert_eq!(value["previousState"], expected_state);
      transaction.commit().await.unwrap();
    }

    let mut transaction = pool.begin().await.unwrap();
    let value = leave_workspace(&authorizer, &mut transaction, leaving_id.clone(), workspace_id.clone())
      .await
      .unwrap();
    assert_eq!(value["previousState"], "active");
    transaction.commit().await.unwrap();

    let remaining = sqlx::query_scalar::<_, i64>(
      "SELECT (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND user_id=ANY($2) AND state='active') + \
       (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1 AND invitee_user_id=ANY($2))",
    )
    .bind(&workspace_id)
    .bind(vec![member_id, invitee_id, leaving_id])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(remaining, 0);
  }

  #[tokio::test]
  async fn revoke_rejects_a_target_changed_between_locate_and_lock() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, owner_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let target_id = add_member(&pool, &workspace_id, "member").await;
    let mut holder = pool.begin().await.unwrap();
    sqlx::query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE")
      .bind(&workspace_id)
      .bind(&target_id)
      .execute(&mut *holder)
      .await
      .unwrap();

    let revoke = {
      let pool = pool.clone();
      let workspace_id = workspace_id.clone();
      let owner_id = owner_id.clone();
      let target_id = target_id.clone();
      tokio::spawn(async move {
        let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
        let mut transaction = pool.begin().await.unwrap();
        let result = revoke_workspace_member(&authorizer, &mut transaction, owner_id, workspace_id, target_id).await;
        transaction.rollback().await.unwrap();
        result
      })
    };
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(!revoke.is_finished());
    sqlx::query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&target_id)
      .execute(&mut *holder)
      .await
      .unwrap();
    holder.commit().await.unwrap();

    let error = revoke.await.unwrap().unwrap_err();
    assert_eq!(error.to_string(), "workspace_member_target_changed");
    let target = sqlx::query_as::<_, (String, String)>(
      "SELECT role,state FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",
    )
    .bind(&workspace_id)
    .bind(&target_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(target, ("admin".to_string(), "active".to_string()));
  }
}
