use sqlx::PgPool;

use super::{DocReadScope, PermissionAuthorizer, SearchActor};

static PERMISSION_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

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
async fn canonical_doc_acl_facts_are_evaluated_without_search_state() {
  let _guard = PERMISSION_TEST_LOCK.lock().await;
  let Some((pool, workspace_id, user_id)) = setup().await else {
    return;
  };
  let authorizer = PermissionAuthorizer::new(pool.clone());
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
