use affine_core::access_control::{
  AccessContext, AclFacts, AuthorizationRequest, Deployment as CoreDeployment, DocAclFacts, DocAuthorizationRequest,
  DocRole, EntitlementFact as CoreEntitlementFact, RequestedDocAction, RequestedWorkspaceAction, TargetType,
  WorkspaceRole, resolve_entitlements,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::{Executor, PgPool, Postgres, Row, Transaction};

use super::{telemetry::PermissionTelemetry, types::PermissionSnapshot};
use crate::{
  AFFINE_PRO_PUBLIC_KEY,
  permission::AuthorizePermissionInputV1,
  runtime::{Deployment, RuntimeError, RuntimeResult},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotRow {
  visibility: Option<String>,
  sharing_enabled: bool,
  url_preview_enabled: bool,
  decision_at: DateTime<Utc>,
  role: Option<String>,
  member_state: Option<String>,
  docs: Vec<DocFact>,
  entitlements: Vec<EntitlementFact>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocFact {
  doc_id: String,
  visibility: Option<String>,
  public_role: Option<String>,
  member_default_role: String,
  explicit_user_role: Option<String>,
  url_preview_enabled: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntitlementFact {
  source: String,
  plan: String,
  quantity: Option<i32>,
  status: String,
  expires_at: Option<DateTime<Utc>>,
  starts_at: Option<DateTime<Utc>>,
  grace_until: Option<DateTime<Utc>>,
  signed_payload: Option<String>,
}

pub(super) struct PermissionStore {
  pool: PgPool,
  license_public_key: Option<String>,
  deployment: Deployment,
  telemetry: PermissionTelemetry,
}

impl PermissionStore {
  pub(super) fn with_telemetry(pool: PgPool, deployment: Deployment, telemetry: PermissionTelemetry) -> Self {
    Self {
      pool,
      license_public_key: AFFINE_PRO_PUBLIC_KEY.map(str::to_string),
      deployment,
      telemetry,
    }
  }

  #[cfg(test)]
  pub(super) fn with_license_public_key(
    pool: PgPool,
    deployment: Deployment,
    license_public_key: Option<String>,
  ) -> Self {
    Self {
      pool,
      license_public_key,
      deployment,
      telemetry: PermissionTelemetry::default(),
    }
  }

  #[cfg(test)]
  pub(super) fn with_license_public_key_and_telemetry(
    pool: PgPool,
    deployment: Deployment,
    license_public_key: Option<String>,
    telemetry: PermissionTelemetry,
  ) -> Self {
    Self {
      pool,
      license_public_key,
      deployment,
      telemetry,
    }
  }

  pub(super) async fn permission_snapshot(
    &self,
    request: AuthorizePermissionInputV1,
  ) -> RuntimeResult<PermissionSnapshot> {
    let (workspace_id, actor_user_id, request) = core_request(request);
    self
      .permission_snapshot_with(&self.pool, &workspace_id, actor_user_id.as_deref(), request)
      .await
  }

  pub(super) async fn typed_permission_snapshot(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    request: AuthorizationRequest,
  ) -> RuntimeResult<PermissionSnapshot> {
    self
      .permission_snapshot_with(&self.pool, workspace_id, actor_user_id, request)
      .await
  }

  pub(super) async fn typed_permission_snapshot_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    request: AuthorizationRequest,
  ) -> RuntimeResult<PermissionSnapshot> {
    self
      .permission_snapshot_with(&mut **transaction, workspace_id, actor_user_id, request)
      .await
  }

  pub(super) async fn command_snapshot_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: &str,
    doc_id: Option<&str>,
  ) -> RuntimeResult<PermissionSnapshot> {
    let request = AuthorizationRequest {
      workspace_actions: Vec::new(),
      doc_actions: doc_id
        .map(|doc_id| DocAuthorizationRequest {
          doc_id: doc_id.to_string(),
          actions: Vec::new(),
        })
        .into_iter()
        .collect(),
    };
    self
      .permission_snapshot_with(&mut **transaction, workspace_id, Some(actor_user_id), request)
      .await
  }

  async fn permission_snapshot_with<'e, E>(
    &self,
    executor: E,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    core_request: AuthorizationRequest,
  ) -> RuntimeResult<PermissionSnapshot>
  where
    E: Executor<'e, Database = Postgres>,
  {
    let doc_ids = core_request
      .doc_actions
      .iter()
      .map(|doc| doc.doc_id.clone())
      .collect::<Vec<_>>();
    let row = sqlx::query(
      r#"SELECT jsonb_build_object(
        'visibility', policy.visibility,
        'sharingEnabled', coalesce(policy.sharing_enabled, true),
        'urlPreviewEnabled', coalesce(policy.url_preview_enabled, false),
        'memberDefaultDocRole', coalesce(policy.member_default_doc_role, 'manager'),
        'decisionAt', statement_timestamp(),
        'role', member.role,
        'memberState', member.state,
        'docs', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'docId', candidate.doc_id,
            'visibility', doc_policy.visibility,
            'publicRole', CASE WHEN doc_policy.published_at IS NOT NULL AND EXISTS(
              SELECT 1 FROM workspace_pages page
              WHERE page.workspace_id=workspace.id AND page.page_id=candidate.doc_id AND page.published_at IS NOT NULL
            ) THEN doc_policy.public_role ELSE NULL END,
            'memberDefaultRole', coalesce(doc_policy.member_default_role, policy.member_default_doc_role, 'manager'),
            'explicitUserRole', doc_grant.role,
            'urlPreviewEnabled', coalesce(doc_policy.url_preview_enabled, false)
          ) ORDER BY candidate.ordinality)
          FROM unnest($3::text[]) WITH ORDINALITY candidate(doc_id, ordinality)
          LEFT JOIN doc_access_policies doc_policy
            ON doc_policy.workspace_id=workspace.id AND doc_policy.doc_id=candidate.doc_id
          LEFT JOIN doc_grants doc_grant
            ON doc_grant.workspace_id=workspace.id AND doc_grant.doc_id=candidate.doc_id
              AND doc_grant.principal_type='user' AND doc_grant.principal_id=$2
        ), '[]'::jsonb),
        'entitlements', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'source', entitlement.source,
            'plan', entitlement.plan,
            'quantity', entitlement.quantity,
            'status', entitlement.status,
            'expiresAt', entitlement.expires_at,
            'startsAt', entitlement.starts_at,
            'graceUntil', entitlement.grace_until,
            'signedPayload', CASE WHEN entitlement.signed_payload IS NULL THEN NULL
              ELSE encode(entitlement.signed_payload, 'hex') END
          ))
          FROM entitlements entitlement
          WHERE entitlement.target_type='workspace' AND entitlement.target_id=workspace.id
        ), '[]'::jsonb)
      ) AS snapshot
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
    .bind(actor_user_id)
    .bind(&doc_ids)
    .fetch_optional(executor)
    .await
    .map_err(|error| RuntimeError::database("load canonical permission snapshot", error))?;
    let Some(row) = row else {
      let docs = core_request
        .doc_actions
        .iter()
        .map(|doc| DocAclFacts {
          doc_id: doc.doc_id.clone(),
          explicit_user_role: None,
          member_default_role: None,
          public_role: None,
          visibility_public: false,
          sharing_enabled: false,
          preview_enabled: false,
        })
        .collect();
      return Ok(PermissionSnapshot {
        request: core_request,
        facts: AclFacts {
          workspace_exists: false,
          assigned_workspace_role: None,
          active_member: false,
          workspace_public: false,
          sharing_enabled: false,
          url_preview_enabled: false,
          docs,
        },
        grant: resolve_entitlements(
          &AccessContext {
            deployment: core_deployment(self.deployment),
            target_type: TargetType::Workspace,
            workspace_id: Some(workspace_id),
            now: Utc::now(),
            license_public_key: self.license_public_key.as_deref(),
          },
          &[],
        ),
        active_member: false,
        sharing_enabled: false,
      });
    };
    let facts: SnapshotRow = serde_json::from_value(
      row
        .try_get("snapshot")
        .map_err(|error| RuntimeError::database("decode canonical permission snapshot", error))?,
    )
    .map_err(|error| RuntimeError::json("decode canonical permission snapshot", error))?;
    let now = facts.decision_at;
    let payloads = facts
      .entitlements
      .iter()
      .map(|entitlement| {
        entitlement
          .signed_payload
          .as_deref()
          .and_then(|payload| hex::decode(payload).ok())
      })
      .collect::<Vec<_>>();
    let entitlement_facts = facts
      .entitlements
      .iter()
      .zip(&payloads)
      .map(|(entitlement, payload)| CoreEntitlementFact {
        source: &entitlement.source,
        status: &entitlement.status,
        plan: &entitlement.plan,
        quantity: entitlement.quantity,
        starts_at: entitlement.starts_at,
        expires_at: entitlement.expires_at,
        grace_until: entitlement.grace_until,
        signed_payload: payload.as_deref(),
      })
      .collect::<Vec<_>>();
    let grant = resolve_entitlements(
      &AccessContext {
        deployment: match self.deployment {
          Deployment::Cloud => CoreDeployment::Cloud,
          Deployment::SelfHosted => CoreDeployment::SelfHosted,
        },
        target_type: TargetType::Workspace,
        workspace_id: Some(workspace_id),
        now,
        license_public_key: self.license_public_key.as_deref(),
      },
      &entitlement_facts,
    );
    if self.deployment == Deployment::SelfHosted {
      let reason = if grant.rights.commercial {
        "valid"
      } else if grant.diagnostics.iter().any(|diagnostic| {
        matches!(
          diagnostic,
          affine_core::access_control::AccessDiagnostic::InvalidLicense(
            affine_core::access_control::LicenseError::Expired
          )
        )
      }) {
        "expired"
      } else if grant
        .diagnostics
        .iter()
        .any(|diagnostic| matches!(diagnostic, affine_core::access_control::AccessDiagnostic::InvalidStatus))
      {
        "status"
      } else if entitlement_facts.is_empty() {
        "inapplicable"
      } else {
        "invalid"
      };
      self
        .telemetry
        .license_verification(if grant.rights.commercial { "allow" } else { "deny" }, reason);
    }
    let active_member = facts.member_state.as_deref() == Some("active")
      && matches!(facts.role.as_deref(), Some("member" | "admin" | "owner"));
    let assigned_workspace_role = facts.role.clone().filter(|_| active_member);
    let sharing_enabled = facts.sharing_enabled;
    let docs = core_request
      .doc_actions
      .iter()
      .zip(facts.docs)
      .map(|(_, fact)| {
        Ok(DocAclFacts {
          doc_id: fact.doc_id,
          explicit_user_role: fact.explicit_user_role.as_deref().map(parse_doc_role).transpose()?,
          member_default_role: Some(parse_doc_role(&fact.member_default_role)?),
          public_role: fact.public_role.as_deref().map(parse_doc_role).transpose()?,
          visibility_public: fact.visibility.as_deref() == Some("public"),
          sharing_enabled,
          preview_enabled: fact.url_preview_enabled,
        })
      })
      .collect::<RuntimeResult<Vec<_>>>()?;
    Ok(PermissionSnapshot {
      request: core_request,
      facts: AclFacts {
        workspace_exists: true,
        assigned_workspace_role: assigned_workspace_role
          .as_deref()
          .map(parse_workspace_role)
          .transpose()?,
        active_member,
        workspace_public: facts.visibility.as_deref() == Some("public"),
        sharing_enabled,
        url_preview_enabled: facts.url_preview_enabled,
        docs,
      },
      grant,
      active_member,
      sharing_enabled,
    })
  }
}

fn core_request(request: AuthorizePermissionInputV1) -> (String, Option<String>, AuthorizationRequest) {
  let core = AuthorizationRequest {
    workspace_actions: request
      .workspace_actions
      .iter()
      .map(|action| RequestedWorkspaceAction::parse(action))
      .collect(),
    doc_actions: request
      .docs
      .iter()
      .map(|doc| DocAuthorizationRequest {
        doc_id: doc.doc_id.clone(),
        actions: doc
          .actions
          .iter()
          .map(|action| RequestedDocAction::parse(action))
          .collect(),
      })
      .collect(),
  };
  (request.workspace_id, request.actor_user_id, core)
}

fn core_deployment(deployment: Deployment) -> CoreDeployment {
  match deployment {
    Deployment::Cloud => CoreDeployment::Cloud,
    Deployment::SelfHosted => CoreDeployment::SelfHosted,
  }
}

fn parse_workspace_role(role: &str) -> RuntimeResult<WorkspaceRole> {
  WorkspaceRole::parse(role).ok_or_else(|| RuntimeError::invalid_input(format!("unknown workspace role: {role}")))
}

fn parse_doc_role(role: &str) -> RuntimeResult<DocRole> {
  DocRole::parse(role).ok_or_else(|| RuntimeError::invalid_input(format!("unknown doc role: {role}")))
}
