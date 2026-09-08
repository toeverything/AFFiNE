use std::sync::{Arc, Mutex};

use sqlx::PgPool;

use super::{
  DocReadScope, PermissionAuthorizer, SearchActor,
  telemetry::{PermissionTelemetry, PermissionTelemetryEvent},
};
use crate::{
  entitlement::signed_test_license,
  permission::{AuthorizePermissionDocInputV1, AuthorizePermissionInputV1},
  runtime::Deployment,
};

static PERMISSION_TEST_LOCK: &tokio::sync::Mutex<()> = &crate::runtime::migrations::DATABASE_TEST_LOCK;

async fn setup() -> Option<(PgPool, String, String)> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  let pool = PgPool::connect(&database_url).await.unwrap();
  let legacy_relations: Vec<Option<String>> = sqlx::query_scalar(
    "SELECT to_regclass(name) FROM \
     unnest(ARRAY['workspace_permission_revisions','workspace_permission_changes','search_runtime_generations']) name",
  )
  .fetch_all(&pool)
  .await
  .unwrap();
  assert!(legacy_relations.into_iter().all(|relation| relation.is_none()));
  let suffix = uuid::Uuid::new_v4().simple().to_string();
  let user_id = format!("search-permission-user-{suffix}");
  let workspace_id = format!("search-permission-workspace-{suffix}");
  sqlx::query(
    "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Search Permission \
     User',$2,true,now(),false)",
  )
  .bind(&user_id)
  .bind(format!("search-permission-{suffix}@example.com"))
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1)")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  Some((pool, workspace_id, user_id))
}

#[tokio::test]
async fn search_uses_canonical_acl_for_members_and_bypasses_projection_for_privileged_roles() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
  let actor = SearchActor::User {
    user_id: user_id.clone(),
  };
  let free = authorizer.authorize_search(&actor, &workspace_id).await.unwrap();
  assert!(matches!(free.docs, DocReadScope::ProjectedAcl(_)));

  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status,validated_at) \
     VALUES($1,'workspace',$2,'admin_grant','team','active',now())",
  )
  .bind(format!("search-permission-entitlement-{workspace_id}"))
  .bind(&workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let team = authorizer.authorize_search(&actor, &workspace_id).await.unwrap();
  let DocReadScope::ProjectedAcl(predicate) = team.docs else {
    panic!("team member must use projected ACL");
  };
  assert_eq!(predicate.actor_user_id, user_id);
  assert!(predicate.active_member);

  sqlx::query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  let admin = authorizer.authorize_search(&actor, &workspace_id).await.unwrap();
  assert_eq!(admin.docs, DocReadScope::All);
}

#[tokio::test]
async fn inactive_member_is_denied_and_untrusted_entitlement_is_ignored() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
  let actor = SearchActor::User {
    user_id: user_id.clone(),
  };
  sqlx::query("UPDATE workspace_members SET state='suspended' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  let error = authorizer.authorize_search(&actor, &workspace_id).await.unwrap_err();
  assert!(matches!(error, crate::runtime::RuntimeError::SearchWorkspaceDenied));

  sqlx::query("UPDATE workspace_members SET state='active' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status,validated_at) \
     VALUES($1,'workspace',$2,'admin_grant','future_plan','active',now())",
  )
  .bind(format!("search-permission-entitlement-{workspace_id}"))
  .bind(&workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let scope = authorizer.authorize_search(&actor, &workspace_id).await.unwrap();
  assert!(matches!(scope.docs, DocReadScope::ProjectedAcl(_)));
}

#[tokio::test]
async fn canonical_doc_acl_facts_are_evaluated_without_search_state() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
  sqlx::query(
    "INSERT INTO doc_access_policies(workspace_id,doc_id,visibility,member_default_role) \
     VALUES($1,'doc','private','none'),($1,'hidden','private','none')",
  )
  .bind(&workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) VALUES($1,'doc','user',$2,'reader')",
  )
  .bind(&workspace_id)
  .bind(&user_id)
  .execute(&pool)
  .await
  .unwrap();
  let readable = authorizer
    .filter_readable_docs(&workspace_id, &user_id, vec!["doc".to_string(), "hidden".to_string()])
    .await
    .unwrap();
  assert_eq!(readable, ["doc".to_string()].into_iter().collect());

  sqlx::query("UPDATE doc_access_policies SET member_default_role='reader' WHERE workspace_id=$1 AND doc_id='hidden'")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  let readable = authorizer
    .filter_readable_docs(&workspace_id, &user_id, vec!["doc".to_string(), "hidden".to_string()])
    .await
    .unwrap();
  assert_eq!(
    readable,
    ["doc".to_string(), "hidden".to_string()].into_iter().collect()
  );
}

#[tokio::test]
async fn entitlement_start_time_changes_loaded_admin_cap() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
  sqlx::query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  let request = || AuthorizePermissionInputV1 {
    version: 1,
    workspace_id: workspace_id.clone(),
    actor_user_id: Some(user_id.clone()),
    workspace_actions: vec![
      "Workspace.Read".to_string(),
      "Workspace.Administrators.Manage".to_string(),
    ],
    docs: Vec::new(),
  };

  let admin = authorizer.authorize(request()).await.unwrap();
  assert_eq!(admin.workspace.effective_role.as_deref(), Some("member"));
  assert!(!admin.workspace.decisions[1].allowed);

  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status,starts_at,expires_at) \
     VALUES($1,'workspace',$2,'admin_grant','team','active',statement_timestamp()+interval '1 minute', \
     statement_timestamp()+interval '1 hour')",
  )
  .bind(format!("permission-cap-{workspace_id}"))
  .bind(&workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let future_admin = authorizer.authorize(request()).await.unwrap();
  assert_eq!(future_admin.workspace.effective_role.as_deref(), Some("member"));

  sqlx::query("UPDATE entitlements SET starts_at=statement_timestamp()-interval '1 minute' WHERE target_id=$1")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  let paid_admin = authorizer.authorize(request()).await.unwrap();
  assert_eq!(paid_admin.workspace.effective_role.as_deref(), Some("admin"));
  assert!(paid_admin.workspace.decisions[1].allowed);
}

#[tokio::test]
async fn selfhost_admin_cap_ignores_unsigned_cloud_grants() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  sqlx::query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status) \
     VALUES($1,'workspace',$2,'admin_grant','team','active')",
  )
  .bind(format!("permission-selfhost-{workspace_id}"))
  .bind(&workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let authorizer = PermissionAuthorizer::with_license_public_key(pool, Deployment::SelfHosted, None);
  let output = authorizer
    .authorize(AuthorizePermissionInputV1 {
      version: 1,
      workspace_id,
      actor_user_id: Some(user_id),
      workspace_actions: vec!["Workspace.Administrators.Manage".to_string()],
      docs: Vec::new(),
    })
    .await
    .unwrap();
  assert_eq!(output.workspace.effective_role.as_deref(), Some("member"));
  assert!(!output.workspace.decisions[0].allowed);
}

#[tokio::test]
async fn selfhost_revocation_status_immediately_caps_a_still_valid_envelope() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let (payload, public_key) = signed_test_license(&workspace_id);
  sqlx::query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status,signed_payload) \
     VALUES($1,'workspace',$2,'selfhost_license','selfhost_team','active',$3)",
  )
  .bind(format!("permission-signed-selfhost-{workspace_id}"))
  .bind(&workspace_id)
  .bind(payload)
  .execute(&pool)
  .await
  .unwrap();
  let events = Arc::new(Mutex::new(Vec::new()));
  let captured = Arc::clone(&events);
  let telemetry = PermissionTelemetry::from_sink(move |event| captured.lock().unwrap().push(event));
  let authorizer = PermissionAuthorizer::with_license_public_key_and_telemetry(
    pool.clone(),
    Deployment::SelfHosted,
    Some(public_key),
    telemetry,
  );
  let request = || AuthorizePermissionInputV1 {
    version: 1,
    workspace_id: workspace_id.clone(),
    actor_user_id: Some(user_id.clone()),
    workspace_actions: vec!["Workspace.Administrators.Manage".to_string()],
    docs: Vec::new(),
  };
  let active = authorizer.authorize(request()).await.unwrap();
  assert_eq!(active.workspace.effective_role.as_deref(), Some("admin"));
  assert!(active.workspace.decisions[0].allowed);

  events.lock().unwrap().clear();
  sqlx::query("UPDATE workspace_members SET role='member' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  let acl_denied = authorizer.authorize(request()).await.unwrap();
  assert!(!acl_denied.workspace.decisions[0].allowed);
  {
    let events = events.lock().unwrap();
    assert!(events.contains(&PermissionTelemetryEvent::LicenseVerification {
      deployment: "selfhosted",
      result: "allow",
      reason: "valid",
    }));
    assert!(events.contains(&PermissionTelemetryEvent::Evaluation {
      deployment: "selfhosted",
      action_class: "workspace",
      decision: "deny",
      reason: "acl_deny".to_string(),
      count: 1,
    }));
  }
  sqlx::query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();

  sqlx::query("UPDATE entitlements SET status='revoked' WHERE target_id=$1")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  let revoked = authorizer.authorize(request()).await.unwrap();
  assert_eq!(revoked.workspace.effective_role.as_deref(), Some("member"));
  assert!(!revoked.workspace.decisions[0].allowed);

  sqlx::query("UPDATE entitlements SET status='active', signed_payload=$2 WHERE target_id=$1")
    .bind(&workspace_id)
    .bind(b"invalid-license".as_slice())
    .execute(&pool)
    .await
    .unwrap();
  let invalid = authorizer.authorize(request()).await.unwrap();
  assert_eq!(invalid.workspace.effective_role.as_deref(), Some("member"));
  assert!(!invalid.workspace.decisions[0].allowed);
  let events = events.lock().unwrap();
  assert!(events.contains(&PermissionTelemetryEvent::LicenseVerification {
    deployment: "selfhosted",
    result: "allow",
    reason: "valid",
  }));
  assert!(events.contains(&PermissionTelemetryEvent::LicenseVerification {
    deployment: "selfhosted",
    result: "deny",
    reason: "status",
  }));
  assert!(events.contains(&PermissionTelemetryEvent::LicenseVerification {
    deployment: "selfhosted",
    result: "deny",
    reason: "invalid",
  }));
  assert!(events.contains(&PermissionTelemetryEvent::Evaluation {
    deployment: "selfhosted",
    action_class: "workspace",
    decision: "deny",
    reason: "commercial_entitlement_required".to_string(),
    count: 1,
  }));
}

#[tokio::test]
async fn missing_workspace_returns_a_complete_denial_without_synthetic_owner() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, _, user_id)) = setup().await else {
    return;
  };
  let output = PermissionAuthorizer::new(pool, Deployment::Cloud)
    .authorize(AuthorizePermissionInputV1 {
      version: 1,
      workspace_id: "missing-workspace".to_string(),
      actor_user_id: Some(user_id),
      workspace_actions: vec!["Workspace.Read".to_string()],
      docs: vec![AuthorizePermissionDocInputV1 {
        doc_id: "doc".to_string(),
        actions: vec!["Doc.Read".to_string()],
      }],
    })
    .await
    .unwrap();
  assert_eq!(output.workspace.effective_role, None);
  assert!(!output.workspace.decisions[0].allowed);
  assert_eq!(output.docs[0].effective_role, None);
  assert!(!output.docs[0].decisions[0].allowed);
}
