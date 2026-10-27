use affine_core::access_control::DomainCommand;
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};

use super::authorize_domain;
use crate::runtime::{RuntimeError, RuntimeResult, backend_runtime::permission::PermissionAuthorizer};

pub(super) async fn set_published(
  authorizer: &PermissionAuthorizer,
  transaction: &mut Transaction<'_, Postgres>,
  actor_user_id: String,
  workspace_id: String,
  doc_id: String,
  mode: i16,
  publish: bool,
) -> RuntimeResult<Value> {
  if workspace_id == doc_id {
    return Err(RuntimeError::invalid_input("doc_is_workspace"));
  }
  let command = if publish {
    DomainCommand::PublishDoc { doc_id: doc_id.clone() }
  } else {
    DomainCommand::UnpublishDoc { doc_id: doc_id.clone() }
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

  if publish {
    let snapshot =
      sqlx::query_scalar::<_, String>("SELECT guid FROM snapshots WHERE workspace_id=$1 AND guid=$2 FOR UPDATE")
        .bind(&workspace_id)
        .bind(&doc_id)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(|error| RuntimeError::database("lock published doc snapshot", error))?;
    let updates = sqlx::query_scalar::<_, String>(
      "SELECT guid FROM updates WHERE workspace_id=$1 AND guid=$2 ORDER BY created_at FOR SHARE",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("lock published doc updates", error))?;
    if snapshot.is_none() && updates.is_empty() {
      return Err(RuntimeError::invalid_input("doc_not_found"));
    }
  } else {
    let is_public = sqlx::query_scalar::<_, bool>(
      "SELECT EXISTS(SELECT 1 FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2 AND visibility='public' \
       AND public_role='external')",
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| RuntimeError::database("check public doc", error))?;
    if !is_public {
      return Err(RuntimeError::invalid_input("doc_is_not_public"));
    }
  }

  sqlx::query(
    r#"INSERT INTO doc_access_policies
         (workspace_id, doc_id, visibility, public_role, published_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $3='public' THEN now() ELSE NULL END)
       ON CONFLICT (workspace_id, doc_id) DO UPDATE SET
         visibility=EXCLUDED.visibility,
         public_role=EXCLUDED.public_role,
         published_at=EXCLUDED.published_at,
         updated_at=now()"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(if publish { "public" } else { "private" })
  .bind(if publish { Some("external") } else { None::<&str> })
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("write public doc policy", error))?;

  let row = sqlx::query(
    r#"INSERT INTO workspace_pages (workspace_id, page_id, mode, published_at)
       VALUES ($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END)
       ON CONFLICT (workspace_id, page_id) DO UPDATE SET
         mode=CASE WHEN $4 THEN EXCLUDED.mode ELSE workspace_pages.mode END,
         published_at=EXCLUDED.published_at
       RETURNING mode, published_at"#,
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(mode)
  .bind(publish)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("write public doc metadata", error))?;

  Ok(json!({
    "workspaceId": workspace_id,
    "docId": doc_id,
    "mode": row.try_get::<i16, _>("mode").map_err(|error| RuntimeError::database("decode doc mode", error))?,
    "public": publish,
    "publishedAt": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("published_at").map_err(|error| RuntimeError::database("decode published time", error))?,
  }))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::runtime::Deployment;

  #[tokio::test]
  async fn readonly_denies_publish_but_allows_unpublish() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let doc_id = format!("domain-doc-{}", uuid::Uuid::new_v4().simple());
    let missing_doc_id = format!("missing-{doc_id}");
    let authorizer = PermissionAuthorizer::new(pool.clone(), Deployment::Cloud);
    let mut transaction = pool.begin().await.unwrap();
    assert!(
      set_published(
        &authorizer,
        &mut transaction,
        actor_user_id.clone(),
        workspace_id.clone(),
        missing_doc_id.clone(),
        0,
        true,
      )
      .await
      .is_err()
    );
    transaction.rollback().await.unwrap();
    let ghost_rows = sqlx::query_scalar::<_, i64>(
      "SELECT (SELECT count(*) FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2) + (SELECT count(*) FROM \
       workspace_pages WHERE workspace_id=$1 AND page_id=$2)",
    )
    .bind(&workspace_id)
    .bind(&missing_doc_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(ghost_rows, 0);
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind([0_u8, 0_u8])
      .execute(&pool)
      .await
      .unwrap();
    let mut overflow_user_ids = Vec::new();
    for index in 0..3 {
      let user_id = format!("domain-publish-overflow-{index}-{}", uuid::Uuid::new_v4().simple());
      sqlx::query(
        "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Overflow',$2,true,now(),false)",
      )
      .bind(&user_id)
      .bind(format!("{user_id}@example.com"))
      .execute(&pool)
      .await
      .unwrap();
      sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
        .bind(&workspace_id)
        .bind(&user_id)
        .execute(&pool)
        .await
        .unwrap();
      overflow_user_ids.push(user_id);
    }
    let mut transaction = pool.begin().await.unwrap();
    let denied = set_published(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      0,
      true,
    )
    .await;
    assert!(denied.is_err());
    transaction.rollback().await.unwrap();

    sqlx::query("UPDATE workspace_members SET state='left' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&overflow_user_ids[0])
      .execute(&pool)
      .await
      .unwrap();
    let mut transaction = pool.begin().await.unwrap();
    set_published(
      &authorizer,
      &mut transaction,
      actor_user_id.clone(),
      workspace_id.clone(),
      doc_id.clone(),
      0,
      true,
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();

    sqlx::query("UPDATE workspace_members SET state='active' WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&overflow_user_ids[0])
      .execute(&pool)
      .await
      .unwrap();
    let mut transaction = pool.begin().await.unwrap();
    set_published(
      &authorizer,
      &mut transaction,
      actor_user_id,
      workspace_id,
      doc_id,
      0,
      false,
    )
    .await
    .unwrap();
    transaction.commit().await.unwrap();
  }
}
