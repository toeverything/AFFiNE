use std::collections::BTreeMap;

use affine_core::access_control::{CommandConstraint, DocRole, DomainCommand, WorkspaceRole};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};

use super::authorize_domain;
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

#[derive(Clone, Debug, Eq, PartialEq)]
enum WorkspaceRoleTarget {
  Member(WorkspaceRole),
  Invitation(WorkspaceRole),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum WorkspaceRoleTransitionHint {
  OwnerTransferred,
}

pub(super) struct WorkspaceRoleTransition {
  pub(super) value: Value,
  pub(super) hint: Option<WorkspaceRoleTransitionHint>,
}

pub(super) async fn transition_workspace(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  target_user_id: String,
  new_role: String,
) -> RuntimeResult<WorkspaceRoleTransition> {
  let new_role = WorkspaceRole::parse(&new_role)
    .filter(|role| !matches!(role, WorkspaceRole::External))
    .ok_or_else(|| RuntimeError::invalid_input("invalid_workspace_role"))?;
  let located = load_workspace_target(transaction, &workspace_id, &target_user_id, false).await?;
  let current_role = located.as_ref().map(|target| match target {
    WorkspaceRoleTarget::Member(role) | WorkspaceRoleTarget::Invitation(role) => *role,
  });
  let command = DomainCommand::TransitionWorkspaceRole {
    current_role,
    new_role,
    target_active_member: matches!(located, Some(WorkspaceRoleTarget::Member(_))),
  };
  let decision = authorize_domain(authorizer, transaction, &actor_user_id, &workspace_id, None, &command).await?;
  let target = load_workspace_target(transaction, &workspace_id, &target_user_id, true).await?;
  if target != located {
    return Err(RuntimeError::invalid_input("workspace_role_target_changed"));
  }

  if new_role == WorkspaceRole::Owner {
    let fallback = match decision.constraint {
      Some(CommandConstraint::PreviousOwnerFallback(role)) => role,
      None => return Err(RuntimeError::invalid_state("owner_transfer_fallback_missing")),
    };
    sqlx::query(
      "UPDATE workspace_members SET role=$2, updated_at=now() WHERE workspace_id=$1 AND role='owner' AND \
       state='active' AND user_id<>$3",
    )
    .bind(&workspace_id)
    .bind(fallback.as_str())
    .bind(&target_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("demote previous workspace owner", error))?;
    sqlx::query(
      "UPDATE workspace_members SET role='owner', updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND \
       state='active'",
    )
    .bind(&workspace_id)
    .bind(&target_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("set workspace owner", error))?;
  } else if matches!(target, Some(WorkspaceRoleTarget::Member(_))) {
    sqlx::query(
      "UPDATE workspace_members SET role=$3, updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND state='active'",
    )
    .bind(&workspace_id)
    .bind(&target_user_id)
    .bind(new_role.as_str())
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("transition workspace member role", error))?;
  } else {
    let updated = sqlx::query(
      "UPDATE workspace_invitations SET requested_role=$3, updated_at=now() WHERE workspace_id=$1 AND \
       invitee_user_id=$2",
    )
    .bind(&workspace_id)
    .bind(&target_user_id)
    .bind(new_role.as_str())
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("transition workspace invitation role", error))?;
    if updated.rows_affected() != 1 {
      return Err(RuntimeError::invalid_input("workspace_member_not_found"));
    }
  }
  Ok(WorkspaceRoleTransition {
    value: json!({
      "workspaceId": workspace_id,
      "targetUserId": target_user_id,
      "previousRole": current_role.map(WorkspaceRole::as_str),
      "role": new_role.as_str(),
    }),
    hint: (new_role == WorkspaceRole::Owner).then_some(WorkspaceRoleTransitionHint::OwnerTransferred),
  })
}

pub(super) async fn transition_doc(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  target_user_id: String,
  new_role: Option<String>,
) -> RuntimeResult<Value> {
  super::lock_workspace(transaction, &workspace_id).await?;
  let new_role = match new_role.as_deref() {
    Some(role) => Some(
      DocRole::parse(role)
        .filter(|role| !matches!(role, DocRole::None | DocRole::External))
        .ok_or_else(|| RuntimeError::invalid_input("invalid_doc_role"))?,
    ),
    None => None,
  };
  let current_role = sqlx::query_scalar::<_, String>(
    "SELECT role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND principal_id=$3",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(&target_user_id)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load doc role target", error))?
  .map(|role| parse_doc_role(&role))
  .transpose()?;
  let target_active_member = if new_role == Some(DocRole::Owner) {
    sqlx::query_scalar::<_, bool>(
      "SELECT state='active' FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE",
    )
    .bind(&workspace_id)
    .bind(&target_user_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("check doc owner target", error))?
    .unwrap_or(false)
  } else {
    false
  };
  let command = DomainCommand::TransitionDocRole {
    doc_id: doc_id.clone(),
    current_role,
    new_role,
    target_active_member,
  };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;
  let locked_role = sqlx::query_scalar::<_, String>(
    "SELECT role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND principal_id=$3 \
     FOR UPDATE",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(&target_user_id)
  .fetch_optional(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("lock doc role target", error))?
  .map(|role| parse_doc_role(&role))
  .transpose()?;
  if locked_role != current_role {
    return Err(RuntimeError::invalid_input("doc_role_target_changed"));
  }

  if new_role == Some(DocRole::Owner) {
    sqlx::query(
      "UPDATE doc_grants SET role='manager', updated_at=now() WHERE workspace_id=$1 AND doc_id=$2 AND \
       principal_type='user' AND role='owner' AND principal_id<>$3",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&target_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("demote previous doc owner", error))?;
  }
  if let Some(role) = new_role {
    sqlx::query(
      r#"INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by)
         VALUES ($1, $2, 'user', $3, $4, $5)
         ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
         DO UPDATE SET role=EXCLUDED.role, granted_by=EXCLUDED.granted_by, updated_at=now()"#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&target_user_id)
    .bind(role.as_str())
    .bind(&actor_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("transition doc grant", error))?;
  } else {
    sqlx::query(
      "DELETE FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND principal_id=$3",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&target_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("revoke doc grant", error))?;
  }
  Ok(json!({
    "workspaceId": workspace_id,
    "docId": doc_id,
    "targetUserId": target_user_id,
    "previousRole": current_role.map(DocRole::as_str),
    "role": new_role.map(DocRole::as_str),
  }))
}

pub(super) async fn grant_docs(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  target_user_ids: Vec<String>,
  new_role: String,
) -> RuntimeResult<Value> {
  let new_role = DocRole::parse(&new_role)
    .filter(|role| {
      matches!(
        role,
        DocRole::Reader | DocRole::Commenter | DocRole::Editor | DocRole::Manager
      )
    })
    .ok_or_else(|| RuntimeError::invalid_input("invalid_doc_role"))?;
  let mut target_user_ids = target_user_ids;
  target_user_ids.sort();
  target_user_ids.dedup();
  let located = load_doc_roles(transaction, &workspace_id, &doc_id, &target_user_ids, false).await?;
  let command = DomainCommand::GrantDocRoles {
    doc_id: doc_id.clone(),
    current_roles: target_user_ids
      .iter()
      .map(|target| located.get(target).copied())
      .collect(),
    new_role,
  };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;
  let locked = load_doc_roles(transaction, &workspace_id, &doc_id, &target_user_ids, true).await?;
  if locked != located {
    return Err(RuntimeError::invalid_input("doc_role_targets_changed"));
  }
  for target_user_id in &target_user_ids {
    sqlx::query(
      r#"INSERT INTO doc_grants (workspace_id, doc_id, principal_type, principal_id, role, granted_by)
         VALUES ($1, $2, 'user', $3, $4, $5)
         ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
         DO UPDATE SET role=EXCLUDED.role, granted_by=EXCLUDED.granted_by, updated_at=now()"#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(target_user_id)
    .bind(new_role.as_str())
    .bind(&actor_user_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("grant doc roles", error))?;
  }
  Ok(json!({
    "workspaceId": workspace_id,
    "docId": doc_id,
    "targetUserIds": target_user_ids,
    "role": new_role.as_str(),
  }))
}

pub(super) async fn set_doc_default_role(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  new_role: String,
) -> RuntimeResult<Value> {
  let new_role = DocRole::parse(&new_role)
    .filter(|role| !matches!(role, DocRole::External | DocRole::Owner))
    .ok_or_else(|| RuntimeError::invalid_input("invalid_doc_default_role"))?;
  let current_role = load_doc_default_role(transaction, &workspace_id, &doc_id).await?;
  let command = DomainCommand::SetDocDefaultRole {
    doc_id: doc_id.clone(),
    current_role,
    new_role,
  };
  authorize_domain(
    authorizer,
    transaction,
    &actor_user_id,
    &workspace_id,
    Some(&doc_id),
    &command,
  )
  .await?;
  if load_doc_default_role(transaction, &workspace_id, &doc_id).await? != current_role {
    return Err(RuntimeError::invalid_input("doc_default_role_changed"));
  }
  sqlx::query(
    r#"INSERT INTO doc_access_policies(workspace_id,doc_id,member_default_role)
       VALUES($1,$2,$3)
       ON CONFLICT(workspace_id,doc_id) DO UPDATE
       SET member_default_role=EXCLUDED.member_default_role,updated_at=clock_timestamp()"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(new_role.as_str())
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("set doc default role", error))?;
  Ok(json!({
    "workspaceId": workspace_id,
    "docId": doc_id,
    "previousRole": current_role.as_str(),
    "role": new_role.as_str(),
  }))
}

async fn load_doc_default_role(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<DocRole> {
  sqlx::query_scalar(
    r#"SELECT COALESCE(
         (SELECT member_default_role FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2),
         (SELECT member_default_doc_role FROM workspace_access_policies WHERE workspace_id=$1),
         'manager'
       )"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load doc default role", error))
  .and_then(|role: String| parse_doc_role(&role))
}

async fn load_workspace_target(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  target_user_id: &str,
  lock: bool,
) -> RuntimeResult<Option<WorkspaceRoleTarget>> {
  let member_query = if lock {
    "SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active' FOR UPDATE"
  } else {
    "SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active'"
  };
  if let Some(role) = sqlx::query_scalar::<_, String>(member_query)
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load workspace role target", error))?
  {
    return parse_workspace_role(&role).map(|role| Some(WorkspaceRoleTarget::Member(role)));
  }
  let invitation_query = if lock {
    "SELECT requested_role FROM workspace_invitations WHERE workspace_id=$1 AND invitee_user_id=$2 FOR UPDATE"
  } else {
    "SELECT requested_role FROM workspace_invitations WHERE workspace_id=$1 AND invitee_user_id=$2"
  };
  sqlx::query_scalar::<_, String>(invitation_query)
    .bind(workspace_id)
    .bind(target_user_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load workspace invitation role target", error))?
    .map(|role| parse_workspace_role(&role).map(WorkspaceRoleTarget::Invitation))
    .transpose()
}

async fn load_doc_roles(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  doc_id: &str,
  target_user_ids: &[String],
  lock: bool,
) -> RuntimeResult<BTreeMap<String, DocRole>> {
  let query = if lock {
    "SELECT principal_id,role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND \
     principal_id=ANY($3) ORDER BY principal_id FOR UPDATE"
  } else {
    "SELECT principal_id,role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' AND \
     principal_id=ANY($3) ORDER BY principal_id"
  };
  sqlx::query(query)
    .bind(workspace_id)
    .bind(doc_id)
    .bind(target_user_ids)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("load doc role targets", error))?
    .into_iter()
    .map(|row| {
      let role: String = row.get("role");
      Ok((row.get("principal_id"), parse_doc_role(&role)?))
    })
    .collect()
}

fn parse_workspace_role(role: &str) -> RuntimeResult<WorkspaceRole> {
  WorkspaceRole::parse(role)
    .filter(|role| !matches!(role, WorkspaceRole::External))
    .ok_or_else(|| RuntimeError::invalid_input("invalid_workspace_role_state"))
}

fn parse_doc_role(role: &str) -> RuntimeResult<DocRole> {
  DocRole::parse(role).ok_or_else(|| RuntimeError::invalid_input("invalid_doc_role_state"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::Deployment;

  #[tokio::test]
  async fn permission_fact_revoke_cannot_pass_guard_lock() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let mut guarded = pool.begin().await.unwrap();
    super::super::lock_permission_facts(&mut guarded, &actor_user_id, &workspace_id, None)
      .await
      .unwrap();

    let mut revoke = pool.begin().await.unwrap();
    sqlx::query("SET LOCAL lock_timeout='100ms'")
      .execute(&mut *revoke)
      .await
      .unwrap();
    let blocked = sqlx::query("UPDATE workspace_members SET state='left' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&actor_user_id)
      .execute(&mut *revoke)
      .await;
    assert!(blocked.is_err());
    revoke.rollback().await.unwrap();
    guarded.commit().await.unwrap();

    let updated = sqlx::query("UPDATE workspace_members SET state='left' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&actor_user_id)
      .execute(&pool)
      .await
      .unwrap();
    assert_eq!(updated.rows_affected(), 1);
  }

  #[tokio::test]
  async fn doc_owner_transfer_rechecks_locked_target_membership() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let target_user_id = format!("doc-owner-target-{suffix}");
    let doc_id = format!("doc-owner-transfer-{suffix}");
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Doc Owner \
       Target',$2,true,now(),false)",
    )
    .bind(&target_user_id)
    .bind(format!("{target_user_id}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
      .bind(&workspace_id)
      .bind(&target_user_id)
      .execute(&pool)
      .await
      .unwrap();
    for (user_id, role) in [(&actor_user_id, "owner"), (&target_user_id, "editor")] {
      sqlx::query(
        "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role,granted_by) \
         VALUES($1,$2,'user',$3,$4,$5)",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(user_id)
      .bind(role)
      .bind(&actor_user_id)
      .execute(&pool)
      .await
      .unwrap();
    }

    let mut holder = pool.begin().await.unwrap();
    sqlx::query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE")
      .bind(&workspace_id)
      .bind(&target_user_id)
      .execute(&mut *holder)
      .await
      .unwrap();
    let transfer = {
      let pool = pool.clone();
      let workspace_id = workspace_id.clone();
      let actor_user_id = actor_user_id.clone();
      let target_user_id = target_user_id.clone();
      let doc_id = doc_id.clone();
      tokio::spawn(async move {
        let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
        let mut transaction = pool.begin().await.unwrap();
        let result = transition_doc(
          &authorizer,
          &mut transaction,
          actor_user_id,
          workspace_id,
          doc_id,
          target_user_id,
          Some("owner".to_string()),
        )
        .await;
        transaction.rollback().await.unwrap();
        result
      })
    };
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(!transfer.is_finished());
    sqlx::query("UPDATE workspace_members SET state='left' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&target_user_id)
      .execute(&mut *holder)
      .await
      .unwrap();
    holder.commit().await.unwrap();

    let error = transfer.await.unwrap().unwrap_err();
    assert_eq!(error.to_string(), "target_member_not_active");
    let role: String =
      sqlx::query_scalar("SELECT role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_id=$3")
        .bind(&workspace_id)
        .bind(&doc_id)
        .bind(&target_user_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(role, "editor");
  }

  #[tokio::test]
  async fn readonly_role_effects_and_member_removal_follow_direction() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let mut users = Vec::new();
    for (index, role) in ["admin", "member", "member"].into_iter().enumerate() {
      let user_id = format!("domain-role-{index}-{suffix}");
      sqlx::query(
        "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Role \
         Target',$2,true,now(),false)",
      )
      .bind(&user_id)
      .bind(format!("{user_id}@example.com"))
      .execute(&pool)
      .await
      .unwrap();
      sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,$3,'active')")
        .bind(&workspace_id)
        .bind(&user_id)
        .bind(role)
        .execute(&pool)
        .await
        .unwrap();
      users.push(user_id);
    }
    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);

    for role in ["admin", "member"] {
      let mut transaction = pool.begin().await.unwrap();
      assert!(
        transition_workspace(
          &authorizer,
          &mut transaction,
          actor_user_id.clone(),
          workspace_id.clone(),
          users[1].clone(),
          role.to_string(),
        )
        .await
        .is_err()
      );
      transaction.rollback().await.unwrap();
    }

    let mut transaction = pool.begin().await.unwrap();
    transition_workspace(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      users[0].clone(),
      "member".to_string(),
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    assert!(
      transition_workspace(
        &authorizer,
        &mut transaction,
        actor_user_id.clone(),
        workspace_id.clone(),
        users[1].clone(),
        "owner".to_string(),
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    assert!(
      transition_workspace(
        &authorizer,
        &mut transaction,
        actor_user_id.clone(),
        workspace_id.clone(),
        actor_user_id.clone(),
        "owner".to_string(),
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();

    let doc_id = format!("domain-role-doc-{suffix}");
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role,granted_by) \
       VALUES($1,$2,'user',$3,'editor',$4)",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&users[1])
    .bind(&actor_user_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role,granted_by) \
       VALUES($1,$2,'user',$3,'owner',$3)",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&actor_user_id)
    .execute(&pool)
    .await
    .unwrap();
    let mut transaction = pool.begin().await.unwrap();
    set_doc_default_role(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      "reader".to_string(),
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();
    for role in ["reader", "editor"] {
      let mut transaction = pool.begin().await.unwrap();
      assert!(
        set_doc_default_role(
          &authorizer,
          &mut transaction,
          actor_user_id.clone(),
          workspace_id.clone(),
          doc_id.clone(),
          role.to_string(),
        )
        .await
        .is_err()
      );
      transaction.rollback().await.unwrap();
    }
    let mut transaction = pool.begin().await.unwrap();
    assert!(
      transition_doc(
        &authorizer,
        &mut transaction,
        actor_user_id.clone(),
        workspace_id.clone(),
        doc_id.clone(),
        actor_user_id.clone(),
        Some("owner".to_string()),
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();
    let mut transaction = pool.begin().await.unwrap();
    transition_doc(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      users[1].clone(),
      Some("reader".to_string()),
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();

    let mut transaction = pool.begin().await.unwrap();
    assert!(
      grant_docs(
        &authorizer,
        &mut transaction,
        actor_user_id.clone(),
        workspace_id.clone(),
        doc_id,
        vec![users[2].clone()],
        "reader".to_string(),
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();
  }
}
