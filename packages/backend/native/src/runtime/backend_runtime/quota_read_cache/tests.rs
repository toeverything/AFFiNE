use std::{sync::Arc, time::Duration};

use sqlx::{PgPool, postgres::PgPoolOptions};

use super::QuotaReadCache;
use crate::runtime::{
  Deployment,
  backend_runtime::{
    RedisRuntimeConfig, entitlement::RuntimeAdminGrantInput, invalidation::InvalidationRuntime,
    tests::runtime_from_database_url,
  },
  migrations::DATABASE_TEST_LOCK,
};

async fn pool() -> Option<PgPool> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  Some(
    PgPoolOptions::new()
      .max_connections(5)
      .connect(&database_url)
      .await
      .unwrap(),
  )
}

async fn insert_user(pool: &PgPool, user_id: &str) {
  sqlx::query(
    "INSERT INTO users(id,name,email,registered,email_verified,disabled,created_at) VALUES($1,'Quota \
     Test',$2,true,now(),false,now())",
  )
  .bind(user_id)
  .bind(format!("{user_id}@example.com"))
  .execute(pool)
  .await
  .unwrap();
}

async fn insert_workspace(pool: &PgPool, workspace_id: &str, owner_id: &str) {
  sqlx::query("INSERT INTO workspaces(id,created_at) VALUES($1,now())")
    .bind(workspace_id)
    .execute(pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at) \
     VALUES($1,$2,$3,'owner','active',now(),now())",
  )
  .bind(format!("member:{workspace_id}:{owner_id}"))
  .bind(workspace_id)
  .bind(owner_id)
  .execute(pool)
  .await
  .unwrap();
}

fn cache(pool: &PgPool, deployment: Deployment) -> QuotaReadCache {
  QuotaReadCache::new(pool.clone(), deployment, Default::default())
}

#[tokio::test]
async fn user_state_composes_loaded_entitlement_and_storage() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let suffix = uuid::Uuid::new_v4().simple().to_string();
  let user_id = format!("quota-user-{suffix}");
  let workspace_id = format!("quota-workspace-{suffix}");
  insert_user(&pool, &user_id).await;
  insert_workspace(&pool, &workspace_id, &user_id).await;
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status) \
     VALUES($1,'user',$2,'cloud_subscription','pro','active')",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&user_id)
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,64,'text/plain','completed')")
    .bind(&workspace_id)
    .bind(format!("quota-user-blob-{suffix}"))
    .execute(&pool)
    .await
    .unwrap();

  let state = cache(&pool, Deployment::Cloud).user_state(&user_id).await.unwrap();
  assert_eq!(state.plan, "pro");
  assert_eq!(state.used_storage_quota, 64);
}
#[tokio::test]
async fn workspace_state_uses_canonical_owner_seats_storage_and_team_scope() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let suffix = uuid::Uuid::new_v4().simple().to_string();
  let owner_id = format!("quota-owner-{suffix}");
  let member_id = format!("quota-member-{suffix}");
  let other_owner_id = format!("quota-other-owner-{suffix}");
  let workspace_id = format!("quota-workspace-{suffix}");
  let second_workspace_id = format!("quota-second-workspace-{suffix}");
  let other_workspace_id = format!("quota-other-workspace-{suffix}");
  for user_id in [&owner_id, &member_id, &other_owner_id] {
    insert_user(&pool, user_id).await;
  }
  insert_workspace(&pool, &workspace_id, &owner_id).await;
  insert_workspace(&pool, &second_workspace_id, &owner_id).await;
  insert_workspace(&pool, &other_workspace_id, &other_owner_id).await;
  sqlx::query(
    "INSERT INTO workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at) \
     VALUES($1,$2,$3,'member','active',now(),now()),($4,$5,$3,'member','active',now(),now())",
  )
  .bind(format!("member:{workspace_id}:{member_id}"))
  .bind(&workspace_id)
  .bind(&member_id)
  .bind(format!("member:{other_workspace_id}:{owner_id}"))
  .bind(&other_workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  for (index, status) in ["pending", "waiting_review", "waiting_seat", "accepted"]
    .into_iter()
    .enumerate()
  {
    sqlx::query("INSERT INTO workspace_invitations(id,workspace_id,normalized_email,status) VALUES($1,$2,$3,$4)")
      .bind(format!("invitation:{suffix}:{index}"))
      .bind(&workspace_id)
      .bind(format!("invite-{index}-{suffix}@example.com"))
      .bind(status)
      .execute(&pool)
      .await
      .unwrap();
  }
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status) \
     VALUES($1,'user',$2,'cloud_subscription','pro','active')",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&owner_id)
  .execute(&pool)
  .await
  .unwrap();
  for (workspace, key, size) in [
    (&workspace_id, "primary", 100),
    (&second_workspace_id, "secondary", 200),
    (&other_workspace_id, "not-owned", 500),
  ] {
    sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,$3,'text/plain','completed')")
      .bind(workspace)
      .bind(format!("{key}-{suffix}"))
      .bind(size)
      .execute(&pool)
      .await
      .unwrap();
  }
  sqlx::query(
    "INSERT INTO comment_attachments(workspace_id,doc_id,key,size,mime,name,status) \
     VALUES($1,'doc',$2,30,'text/plain','attachment','completed')",
  )
  .bind(&workspace_id)
  .bind(format!("attachment-{suffix}"))
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO blobs(workspace_id,key,size,mime,status,deleted_at) VALUES($1,$2,1000,'text/plain','completed',now())",
  )
  .bind(&workspace_id)
  .bind(format!("deleted-{suffix}"))
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO blobs(workspace_id,key,size,mime,status,reservation_expires_at) \
     VALUES($1,$2,1000,'text/plain','pending',now()-interval '1 second')",
  )
  .bind(&workspace_id)
  .bind(format!("expired-pending-{suffix}"))
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    r#"INSERT INTO effective_workspace_quota_states(
           workspace_id,plan,owner_user_id,uses_owner_quota,seat_limit,member_count,
           overcapacity_member_count,blob_limit,storage_quota,used_storage_quota,
           history_period_seconds,readonly,readonly_reasons,flags,known,stale
         ) VALUES($1,'paid_team',$2,false,99,99,0,1,1,999,1,false,ARRAY[]::text[],'{}',true,false)"#,
  )
  .bind(&workspace_id)
  .bind(&owner_id)
  .execute(&pool)
  .await
  .unwrap();

  let state = cache(&pool, Deployment::Cloud)
    .workspace_state(&workspace_id)
    .await
    .unwrap();
  assert_eq!(state.plan, "pro");
  assert!(state.uses_owner_quota);
  assert_eq!(state.member_count, 5);
  assert_eq!(state.used_storage_quota, 330);
  assert!(!state.readonly);

  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,plan,status,quantity) \
     VALUES($1,'workspace',$2,'cloud_subscription','team','active',3)",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&workspace_id)
  .execute(&pool)
  .await
  .unwrap();
  let state = cache(&pool, Deployment::Cloud)
    .workspace_state(&workspace_id)
    .await
    .unwrap();
  assert_eq!(state.plan, "team");
  assert!(!state.uses_owner_quota);
  assert_eq!(state.member_count, 5);
  assert_eq!(state.overcapacity_member_count, 2);
  assert_eq!(state.used_storage_quota, 130);
  let owner = cache(&pool, Deployment::Cloud).user_state(&owner_id).await.unwrap();
  assert_eq!(owner.used_storage_quota, 200);
}

#[tokio::test]
async fn workspace_state_requires_an_active_owner() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let workspace_id = format!("quota-ownerless-{}", uuid::Uuid::new_v4().simple());
  sqlx::query("INSERT INTO workspaces(id,created_at) VALUES($1,now())")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();

  assert!(
    cache(&pool, Deployment::Cloud)
      .workspace_state(&workspace_id)
      .await
      .is_err()
  );
}

#[tokio::test]
async fn redis_commit_hints_refresh_a_warm_cache_on_another_pod() {
  let Ok(redis_url) = std::env::var("INVALIDATION_REDIS_URL") else {
    return;
  };
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    eprintln!("skipping postgres integration test: DATABASE_URL is not set");
    return;
  };
  let suffix = uuid::Uuid::new_v4().simple().to_string();
  let owner_id = format!("quota-multipod-owner-{suffix}");
  let member_id = format!("quota-multipod-member-{suffix}");
  let workspace_id = format!("quota-multipod-workspace-{suffix}");
  insert_user(&pool, &owner_id).await;
  insert_user(&pool, &member_id).await;
  insert_workspace(&pool, &workspace_id, &owner_id).await;

  let pod_b = Arc::new(cache(&pool, Deployment::Cloud));
  let initial = pod_b.workspace_state(&workspace_id).await.unwrap();
  assert_eq!(initial.plan, "free");
  assert_eq!(initial.member_count, 1);
  assert_eq!(initial.used_storage_quota, 0);

  let config = RedisRuntimeConfig {
    url: Some(redis_url.clone()),
  };
  let subscriber = InvalidationRuntime::start(&config, true, pod_b.clone()).await;
  let pod_a = Arc::new(cache(&pool, Deployment::Cloud));
  assert_eq!(pod_a.workspace_state(&workspace_id).await.unwrap().plan, "free");
  let publisher = InvalidationRuntime::start(&config, false, pod_a.clone()).await;
  let runtime = runtime_from_database_url().await.unwrap().unwrap();
  *runtime.invalidation.lock().await = Some(publisher.clone());

  let client = redis::Client::open(redis_url).unwrap();
  let mut control = client.get_multiplexed_async_connection().await.unwrap();
  tokio::time::timeout(Duration::from_secs(5), async {
    loop {
      let subscribed = redis::cmd("PUBSUB")
        .arg("NUMSUB")
        .arg("affine:backend-runtime:invalidation:v1")
        .query_async::<Vec<(String, i64)>>(&mut control)
        .await
        .is_ok_and(|counts| counts.first().is_some_and(|(_, count)| *count >= 1));
      if subscribed {
        break;
      }
      tokio::time::sleep(Duration::from_millis(20)).await;
    }
  })
  .await
  .expect("quota cache subscriber must connect");

  let mut transaction = pool.begin().await.unwrap();
  sqlx::query(
    "INSERT INTO workspace_members(id,workspace_id,user_id,role,state,created_at,updated_at) \
     VALUES($1,$2,$3,'member','active',now(),now())",
  )
  .bind(format!("quota-multipod-member-row-{suffix}"))
  .bind(&workspace_id)
  .bind(&member_id)
  .execute(&mut *transaction)
  .await
  .unwrap();
  sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,42,'text/plain','completed')")
    .bind(&workspace_id)
    .bind(format!("quota-multipod-blob-{suffix}"))
    .execute(&mut *transaction)
    .await
    .unwrap();
  transaction.commit().await.unwrap();

  runtime
    .upsert_admin_grant_v1(RuntimeAdminGrantInput {
      target_type: "workspace".into(),
      target_id: workspace_id.clone(),
      plan: "team".into(),
      quantity: Some(serde_json::json!(5)),
    })
    .await
    .unwrap();
  assert_eq!(pod_a.workspace_state(&workspace_id).await.unwrap().plan, "team");
  tokio::time::timeout(Duration::from_secs(5), async {
    while subscriber.health().received < 3 {
      tokio::time::sleep(Duration::from_millis(20)).await;
    }
  })
  .await
  .expect("pod B must receive all quota invalidations");

  let refreshed = pod_b.workspace_state(&workspace_id).await.unwrap();
  assert_eq!(refreshed.plan, "team");
  assert!(!refreshed.uses_owner_quota);
  assert_eq!(refreshed.member_count, 2);
  assert_eq!(refreshed.used_storage_quota, 42);
  subscriber.stop().await;
  publisher.stop().await;
}
