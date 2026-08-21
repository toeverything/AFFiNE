use sqlx::PgPool;

use super::{DocReadScope, PermissionAuthorizer, SearchActor};

static PERMISSION_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn setup() -> Option<(PgPool, String, String)> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  let pool = PgPool::connect(&database_url).await.unwrap();
  crate::runtime::migrations::migrate_search_tables(&pool).await.unwrap();
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
async fn non_team_is_all_and_team_uses_projected_acl() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone());
  let actor = SearchActor::User {
    user_id: user_id.clone(),
  };
  let free = authorizer.authorize_search(&actor, &workspace_id).await.unwrap();
  assert_eq!(free.docs, DocReadScope::All);

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
  assert!(team.permission_revision > free.permission_revision);
}

#[tokio::test]
async fn inactive_member_is_denied_and_unknown_capability_fails_closed() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone());
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
  let error = authorizer.authorize_search(&actor, &workspace_id).await.unwrap_err();
  assert!(matches!(
    error,
    crate::runtime::RuntimeError::SearchPermissionUnavailable
  ));
}

#[tokio::test]
async fn fact_changes_advance_revision_and_write_ordered_change() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone());
  let before = authorizer.revision(&workspace_id).await.unwrap();
  sqlx::query(
    "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) VALUES($1,'doc','user',$2,'reader')",
  )
  .bind(&workspace_id)
  .bind(&user_id)
  .execute(&pool)
  .await
  .unwrap();
  let after = authorizer.revision(&workspace_id).await.unwrap();
  assert_eq!(after, before + 1);
  let change: (i64, Option<String>, String) = sqlx::query_as(
    "SELECT revision,doc_id,scope FROM workspace_permission_changes WHERE workspace_id=$1 AND revision=$2",
  )
  .bind(&workspace_id)
  .bind(after)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(change, (after, Some("doc".to_string()), "doc_grant".to_string()));

  sqlx::query("UPDATE workspace_members SET updated_at=now() WHERE workspace_id=$1 AND user_id=$2")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  assert_eq!(authorizer.revision(&workspace_id).await.unwrap(), after);

  let moved_workspace_id = format!("{workspace_id}-moved");
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&moved_workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  assert_eq!(authorizer.revision(&moved_workspace_id).await.unwrap(), 0);
  sqlx::query("UPDATE doc_grants SET workspace_id=$1 WHERE workspace_id=$2 AND doc_id='doc'")
    .bind(&moved_workspace_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  assert_eq!(authorizer.revision(&workspace_id).await.unwrap(), after + 1);
  assert_eq!(authorizer.revision(&moved_workspace_id).await.unwrap(), 1);
}
