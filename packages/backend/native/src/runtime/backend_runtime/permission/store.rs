use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};

use super::types::{DocAclCapability, PermissionSnapshot};
use crate::{
  entitlement::entitlement_priority,
  permission::{
    PermissionDocInputV1, PermissionEvaluationInputV1, PermissionRuntimeInputV1, PermissionSubjectInputV1,
    PermissionWorkspaceInputV1,
  },
  runtime::{RuntimeError, RuntimeResult},
};

pub(super) struct PermissionStore {
  pool: PgPool,
}

impl PermissionStore {
  pub(super) fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  pub(super) async fn permission_snapshot(
    &self,
    workspace_id: &str,
    user_id: &str,
    doc_ids: &[String],
  ) -> RuntimeResult<PermissionSnapshot> {
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin permission snapshot", error))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("configure permission snapshot", error))?;
    let row = sqlx::query(
      r#"SELECT policy.visibility, coalesce(policy.sharing_enabled, true) AS sharing_enabled,
         coalesce(policy.member_default_doc_role, 'manager') AS member_default_doc_role,
         member.role, member.state
       FROM workspaces workspace
       LEFT JOIN workspace_access_policies policy ON policy.workspace_id=workspace.id
       LEFT JOIN LATERAL (
         SELECT role,state FROM workspace_members
         WHERE workspace_id=workspace.id AND user_id=$2
         ORDER BY (state='active') DESC, updated_at DESC LIMIT 1
       ) member ON true
       WHERE workspace.id=$1"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("load workspace permission facts", error))?
    .ok_or_else(|| RuntimeError::invalid_input("workspace_not_found"))?;
    let sharing_enabled: bool = row
      .try_get("sharing_enabled")
      .map_err(|error| RuntimeError::database("decode workspace sharing", error))?;
    let role: Option<String> = row
      .try_get("role")
      .map_err(|error| RuntimeError::database("decode workspace member role", error))?;
    let member_state: Option<String> = row
      .try_get("state")
      .map_err(|error| RuntimeError::database("decode workspace member state", error))?;
    let visibility: Option<String> = row
      .try_get("visibility")
      .map_err(|error| RuntimeError::database("decode workspace visibility", error))?;
    let member_default_doc_role: String = row
      .try_get("member_default_doc_role")
      .map_err(|error| RuntimeError::database("decode member default doc role", error))?;
    let capability = load_doc_acl_capability(&mut transaction, workspace_id).await?;
    let docs = if doc_ids.is_empty() {
      Vec::new()
    } else {
      sqlx::query(
        r#"SELECT candidate.doc_id, policy.visibility, policy.public_role,
           coalesce(policy.member_default_role, $3) AS member_default_role,
           grant_fact.role AS explicit_user_role
         FROM unnest($4::text[]) candidate(doc_id)
         LEFT JOIN doc_access_policies policy
           ON policy.workspace_id=$1 AND policy.doc_id=candidate.doc_id
         LEFT JOIN doc_grants grant_fact
           ON grant_fact.workspace_id=$1 AND grant_fact.doc_id=candidate.doc_id
             AND grant_fact.principal_type='user' AND grant_fact.principal_id=$2"#,
      )
      .bind(workspace_id)
      .bind(user_id)
      .bind(&member_default_doc_role)
      .bind(doc_ids)
      .fetch_all(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("load document permission facts", error))?
      .into_iter()
      .map(|row| {
        Ok(PermissionDocInputV1 {
          doc_id: row
            .try_get("doc_id")
            .map_err(|error| RuntimeError::database("decode permission doc id", error))?,
          actions: vec!["Doc.Read".to_string()],
          explicit_user_role: row
            .try_get("explicit_user_role")
            .map_err(|error| RuntimeError::database("decode explicit doc role", error))?,
          member_default_role: row
            .try_get("member_default_role")
            .map_err(|error| RuntimeError::database("decode member default role", error))?,
          public_role: row
            .try_get("public_role")
            .map_err(|error| RuntimeError::database("decode public doc role", error))?,
          visibility: row
            .try_get("visibility")
            .map_err(|error| RuntimeError::database("decode doc visibility", error))?,
          sharing_enabled: Some(sharing_enabled),
          ..Default::default()
        })
      })
      .collect::<RuntimeResult<Vec<_>>>()?
    };
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit permission snapshot", error))?;
    let active_member =
      member_state.as_deref() == Some("active") && matches!(role.as_deref(), Some("member" | "admin" | "owner"));

    Ok(PermissionSnapshot {
      capability,
      evaluation: PermissionEvaluationInputV1 {
        version: 1,
        legacy_compat_mode: false,
        subject: PermissionSubjectInputV1 {
          user_id: Some(user_id.to_string()),
          ..Default::default()
        },
        runtime: PermissionRuntimeInputV1 {
          known: true,
          sharing_enabled: Some(sharing_enabled),
          ..Default::default()
        },
        workspace: PermissionWorkspaceInputV1 {
          role,
          member_state,
          public: visibility.as_deref() == Some("public"),
          sharing_enabled: Some(sharing_enabled),
          ..Default::default()
        },
        workspace_actions: vec!["Workspace.Read".to_string()],
        docs,
      },
      actor_user_id: user_id.to_string(),
      active_member,
      sharing_enabled,
    })
  }
}

async fn load_doc_acl_capability(
  transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  workspace_id: &str,
) -> RuntimeResult<DocAclCapability> {
  let rows = sqlx::query(
    r#"SELECT plan,status,expires_at,grace_until,validated_at,source,signed_payload
       FROM entitlements
       WHERE target_type='workspace' AND target_id=$1
         AND ((status='active' AND (expires_at IS NULL OR expires_at>now()))
           OR (status='grace' AND grace_until>now()))"#,
  )
  .bind(workspace_id)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load workspace entitlement facts", error))?;
  let mut best: Option<(i32, String)> = None;
  for row in rows {
    let plan: String = row
      .try_get("plan")
      .map_err(|error| RuntimeError::database("decode entitlement plan", error))?;
    let status: String = row
      .try_get("status")
      .map_err(|error| RuntimeError::database("decode entitlement status", error))?;
    let source: String = row
      .try_get("source")
      .map_err(|error| RuntimeError::database("decode entitlement source", error))?;
    let validated_at: Option<DateTime<Utc>> = row
      .try_get("validated_at")
      .map_err(|error| RuntimeError::database("decode entitlement validation", error))?;
    let signed_payload: Option<Vec<u8>> = row
      .try_get("signed_payload")
      .map_err(|error| RuntimeError::database("decode entitlement payload", error))?;
    if source == "selfhost_license" && (validated_at.is_none() || signed_payload.is_none()) {
      continue;
    }
    let priority = entitlement_priority(&status, &plan);
    if best.as_ref().is_none_or(|(current, _)| priority > *current) {
      best = Some((priority, plan));
    }
  }
  match best.map(|(_, plan)| plan) {
    Some(plan) if matches!(plan.as_str(), "team" | "selfhost_team") => Ok(DocAclCapability::Enabled),
    Some(plan) if matches!(plan.as_str(), "free" | "pro" | "lifetime_pro" | "ai" | "selfhost_free") => {
      Ok(DocAclCapability::Disabled)
    }
    Some(_) => Ok(DocAclCapability::Unknown),
    None => Ok(DocAclCapability::Disabled),
  }
}
