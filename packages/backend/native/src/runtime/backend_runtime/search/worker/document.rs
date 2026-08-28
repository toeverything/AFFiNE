use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::{
  ActiveGeneration, DOCUMENT_LEASE_SECONDS, ProjectionInput, SearchChange, SearchProvider,
  SearchTable as ProviderTable, project_document, projection_external_id, provider_payload,
};
use crate::{
  runtime::{RuntimeError, RuntimeResult},
  search_index::EmbeddedSearchIndex,
};

struct DocumentClaim {
  fence: i64,
  target_source_version: i64,
  target_source_exists: bool,
  target_permission_version: i64,
}

struct ProjectionTuple {
  source_version: i64,
  source_exists: bool,
  permission_version: i64,
}

pub(super) async fn upsert_document(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<()> {
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search document enqueue", error))?;
  sqlx::query("SELECT pg_advisory_xact_lock_shared(hashtextextended('search-projection-generation', 0))")
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("lock search document enqueue", error))?;
  let updated = sqlx::query(
    r#"UPDATE search_projection.document_states state
       SET target_permission_version=GREATEST(state.target_permission_version,workspace.required_permission_version),
           last_error=NULL, available_at=now(), updated_at=now()
       FROM search_projection.workspace_states workspace
       WHERE state.generation_id=$1 AND state.workspace_id=$2 AND state.doc_id=$3
         AND workspace.generation_id=state.generation_id AND workspace.workspace_id=state.workspace_id"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .bind(doc_id)
  .execute(&mut *transaction)
  .await
  .map_err(|error| RuntimeError::database("refresh search document target", error))?
  .rows_affected();
  if updated == 0 {
    sqlx::query(
      r#"INSERT INTO search_projection.document_states
         (generation_id,workspace_id,doc_id,target_source_version,target_source_exists,target_permission_version)
         SELECT $1,$2,$3,nextval('search_projection.source_mutation_version'),
                EXISTS(SELECT 1 FROM snapshots WHERE workspace_id=$2 AND guid=$3),
                required_permission_version
         FROM search_projection.workspace_states
         WHERE generation_id=$1 AND workspace_id=$2"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .bind(doc_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("enqueue search document", error))?;
  }
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit search document enqueue", error))?;

  let Some(claim) = claim_document(pool, generation.id, workspace_id, doc_id).await? else {
    let published = sqlx::query_as::<_, (i64, bool, i64)>(
      r#"SELECT target_source_version,target_source_exists,target_permission_version
         FROM search_projection.document_states
         WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3
           AND target_source_version=published_source_version
           AND target_source_exists=published_source_exists
           AND target_permission_version=published_permission_version
           AND (lease_expires_at IS NULL OR lease_expires_at <= now())"#,
    )
    .bind(generation.id)
    .bind(workspace_id)
    .bind(doc_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| RuntimeError::database("load published search repair tuple", error))?;
    if let Some((source_version, source_exists, permission_version)) = published {
      let changes = projection_changes(
        pool,
        generation,
        workspace_id,
        doc_id,
        ProjectionTuple {
          source_version,
          source_exists,
          permission_version,
        },
      )
      .await?;
      apply_changes(embedded, remote, generation, changes).await?;
    }
    return Ok(());
  };
  let changes = projection_changes(
    pool,
    generation,
    workspace_id,
    doc_id,
    ProjectionTuple {
      source_version: claim.target_source_version,
      source_exists: claim.target_source_exists,
      permission_version: claim.target_permission_version,
    },
  )
  .await?;
  renew_document_claim(pool, generation.id, workspace_id, doc_id, claim.fence).await?;
  apply_changes(embedded, remote, generation, changes).await?;
  complete_document(pool, generation.id, workspace_id, doc_id, &claim).await?;
  Ok(())
}

async fn projection_changes(
  pool: &PgPool,
  generation: &ActiveGeneration,
  workspace_id: &str,
  doc_id: &str,
  projection_tuple: ProjectionTuple,
) -> RuntimeResult<Vec<SearchChange>> {
  if !projection_tuple.source_exists {
    return Ok(Vec::new());
  }
  let Some((document, blocks)) = project_document(pool, workspace_id, doc_id).await? else {
    return Ok(Vec::new());
  };
  let mut changes = Vec::with_capacity(blocks.len() + 1);
  changes.push(change(
    document,
    generation,
    projection_tuple.source_version,
    projection_tuple.permission_version,
    ProviderTable::Doc,
  )?);
  changes.extend(
    blocks
      .into_iter()
      .map(|block| {
        change(
          block,
          generation,
          projection_tuple.source_version,
          projection_tuple.permission_version,
          ProviderTable::Block,
        )
      })
      .collect::<RuntimeResult<Vec<_>>>()?,
  );
  Ok(changes)
}

async fn renew_document_claim(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
  fence: i64,
) -> RuntimeResult<()> {
  let updated = sqlx::query(
    r#"UPDATE search_projection.document_states
       SET lease_expires_at=now()+make_interval(secs=>$5), updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3 AND claim_fence=$4
         AND lease_expires_at > now()"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(fence)
  .bind(DOCUMENT_LEASE_SECONDS)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("renew search document claim", error))?
  .rows_affected();
  if updated != 1 {
    return Err(RuntimeError::invalid_state("search document claim lost"));
  }
  Ok(())
}

async fn claim_document(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<DocumentClaim>> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search document claim", error))?;
  let row = sqlx::query(
    r#"SELECT generation_id,workspace_id,doc_id,target_source_version,target_source_exists,target_permission_version
       FROM search_projection.document_states
       WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3 AND available_at <= now()
         AND (lease_expires_at IS NULL OR lease_expires_at <= now())
         AND (target_source_version <> published_source_version
           OR target_source_exists <> published_source_exists
           OR target_permission_version <> published_permission_version)
       FOR UPDATE SKIP LOCKED"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("claim search document publication", error))?;
  let Some(row) = row else {
    tx.rollback()
      .await
      .map_err(|error| RuntimeError::database("rollback empty search document claim", error))?;
    return Ok(None);
  };
  let fence: i64 = sqlx::query_scalar("SELECT nextval('search_projection.claim_fence')")
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("allocate search claim fence", error))?;
  let target_source_version: i64 = row
    .try_get("target_source_version")
    .map_err(|error| RuntimeError::database("decode search state source version", error))?;
  let target_source_exists: bool = row
    .try_get("target_source_exists")
    .map_err(|error| RuntimeError::database("decode search state source existence", error))?;
  let permission_version: i64 = row
    .try_get("target_permission_version")
    .map_err(|error| RuntimeError::database("decode search publication permission version", error))?;
  let workspace_id: String = row
    .try_get("workspace_id")
    .map_err(|error| RuntimeError::database("decode search publication workspace", error))?;
  let doc_id: String = row
    .try_get("doc_id")
    .map_err(|error| RuntimeError::database("decode search publication document", error))?;
  sqlx::query(
    r#"UPDATE search_projection.document_states
       SET claim_fence=$4, lease_owner=$5, lease_expires_at=now()+make_interval(secs=>$6),
           attempt_count=attempt_count+1, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3"#,
  )
  .bind(generation_id)
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(fence)
  .bind(format!("native-search-{}", std::process::id()))
  .bind(DOCUMENT_LEASE_SECONDS)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("write search document claim", error))?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit search document claim", error))?;
  Ok(Some(DocumentClaim {
    fence,
    target_source_version,
    target_source_exists,
    target_permission_version: permission_version,
  }))
}

async fn complete_document(
  pool: &PgPool,
  generation_id: Uuid,
  workspace_id: &str,
  doc_id: &str,
  claim: &DocumentClaim,
) -> RuntimeResult<()> {
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin search document completion", error))?;
  let completed = sqlx::query(
    r#"UPDATE search_projection.document_states
       SET published_source_version=$5, published_source_exists=$6,
           published_permission_version=$7, claim_fence=NULL, lease_owner=NULL,
           lease_expires_at=NULL, last_error=NULL, updated_at=now()
       WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3 AND claim_fence=$4
         AND target_source_version=$5 AND target_source_exists=$6
         AND target_permission_version=$7"#,
  )
  .bind(generation_id)
  .bind(workspace_id)
  .bind(doc_id)
  .bind(claim.fence)
  .bind(claim.target_source_version)
  .bind(claim.target_source_exists)
  .bind(claim.target_permission_version)
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("publish search document state", error))?
  .rows_affected();
  if completed == 0 {
    sqlx::query(
      r#"UPDATE search_projection.document_states
         SET available_at=now(), lease_owner=NULL, lease_expires_at=NULL, updated_at=now()
         WHERE generation_id=$1 AND workspace_id=$2 AND doc_id=$3 AND claim_fence=$4"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(doc_id)
    .bind(claim.fence)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("reschedule changed search document state", error))?;
  }
  if completed == 1 {
    sqlx::query(
      r#"UPDATE search_projection.workspace_states state
         SET applied_permission_version=GREATEST(state.applied_permission_version, state.required_permission_version),
             updated_at=now()
         WHERE state.generation_id=$1 AND state.workspace_id=$2
           AND state.required_permission_version <= $3
           AND state.pending_scope='none'
           AND NOT EXISTS(
             SELECT 1 FROM search_projection.document_states document
             WHERE document.generation_id=state.generation_id AND document.workspace_id=state.workspace_id
               AND document.target_permission_version <> document.published_permission_version
           )"#,
    )
    .bind(generation_id)
    .bind(workspace_id)
    .bind(claim.target_permission_version)
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("advance search permission state", error))?;
  }
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit search document completion", error))
}

fn change(
  input: ProjectionInput,
  generation: &ActiveGeneration,
  source_version: i64,
  permission_version: i64,
  table: ProviderTable,
) -> RuntimeResult<SearchChange> {
  let mut payload = provider_payload(&input.payload);
  payload["generation_id"] = serde_json::json!(generation.id.to_string());
  payload["source_version"] = serde_json::json!(source_version);
  payload["permission_version"] = serde_json::json!(permission_version);
  let block_id = payload.get("block_id").and_then(serde_json::Value::as_str);
  let external_id = projection_external_id(
    table,
    &generation.id.to_string(),
    &input.workspace_id,
    &input.doc_id,
    block_id,
    source_version,
    permission_version,
  )?;
  Ok(SearchChange {
    table,
    external_id,
    workspace_id: input.workspace_id,
    doc_id: input.doc_id,
    source_version,
    permission_version,
    payload,
  })
}

async fn apply_changes(
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  changes: Vec<SearchChange>,
) -> RuntimeResult<()> {
  let mut by_table = [Vec::new(), Vec::new()];
  for change in changes {
    let index = match change.table {
      ProviderTable::Doc => 0,
      ProviderTable::Block => 1,
    };
    by_table[index].push(change);
  }
  if let Some(remote) = remote {
    for (index, changes) in by_table.into_iter().enumerate() {
      if !changes.is_empty() {
        let table = if index == 0 {
          ProviderTable::Doc
        } else {
          ProviderTable::Block
        };
        remote.apply(generation.physical_table(table)?, &changes).await?;
      }
    }
    return Ok(());
  }
  for (index, changes) in by_table.into_iter().enumerate() {
    let table = if index == 0 { "doc" } else { "block" };
    let mut upserts = Vec::new();
    for change in changes {
      upserts.push(change.payload);
    }
    if !upserts.is_empty() {
      embedded
        .write_for_generation(
          generation.id,
          table.to_string(),
          serde_json::to_string(&upserts).map_err(|error| RuntimeError::json("encode embedded changes", error))?,
        )
        .await?;
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use sqlx::PgPool;
  use uuid::Uuid;

  use super::{DocumentClaim, claim_document, complete_document};
  use crate::runtime::{backend_runtime::search::SEARCH_TEST_LOCK, migrations::migrate_search_tables};

  #[tokio::test]
  async fn document_completion_only_advances_document_scoped_permission_work() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();

    let generation_id = Uuid::new_v4();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','failed',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();

    for (workspace_id, pending_scope) in [("workspace-scope", "workspace"), ("document-scope", "none")] {
      sqlx::query(
        r#"INSERT INTO search_projection.workspace_states(
             generation_id,workspace_id,covered,required_permission_version,
             applied_permission_version,pending_scope
           ) VALUES($1,$2,true,5,4,$3)"#,
      )
      .bind(generation_id)
      .bind(workspace_id)
      .bind(pending_scope)
      .execute(&pool)
      .await
      .unwrap();
      for (doc_id, fence) in [("first", 101_i64), ("second", 102_i64)] {
        sqlx::query(
          r#"INSERT INTO search_projection.document_states(
               generation_id,workspace_id,doc_id,target_source_version,target_source_exists,
               target_permission_version,claim_fence
             ) VALUES($1,$2,$3,1,true,5,$4)"#,
        )
        .bind(generation_id)
        .bind(workspace_id)
        .bind(doc_id)
        .bind(fence)
        .execute(&pool)
        .await
        .unwrap();
      }

      complete_document(
        &pool,
        generation_id,
        workspace_id,
        "first",
        &DocumentClaim {
          fence: 101,
          target_source_version: 1,
          target_source_exists: true,
          target_permission_version: 5,
        },
      )
      .await
      .unwrap();
      let applied: i64 = sqlx::query_scalar(
        "SELECT applied_permission_version FROM search_projection.workspace_states WHERE generation_id=$1 AND \
         workspace_id=$2",
      )
      .bind(generation_id)
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap();
      assert_eq!(applied, 4);

      complete_document(
        &pool,
        generation_id,
        workspace_id,
        "second",
        &DocumentClaim {
          fence: 102,
          target_source_version: 1,
          target_source_exists: true,
          target_permission_version: 5,
        },
      )
      .await
      .unwrap();
      let applied: i64 = sqlx::query_scalar(
        "SELECT applied_permission_version FROM search_projection.workspace_states WHERE generation_id=$1 AND \
         workspace_id=$2",
      )
      .bind(generation_id)
      .bind(workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap();
      assert_eq!(applied, if pending_scope == "none" { 5 } else { 4 });
    }

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn document_claim_skips_locked_rows_and_global_fence_prevents_aba_completion() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    let generation_id = Uuid::new_v4();
    let workspace_id = format!("claim-document-{}", Uuid::new_v4().simple());
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version)
         VALUES($1,'embedded','failed',decode(repeat('00',32),'hex'),1)"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO search_projection.workspace_states(generation_id,workspace_id,pending_scope) VALUES($1,$2,'none')",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO \
       search_projection.document_states(generation_id,workspace_id,doc_id,target_source_version,\
       target_source_exists) VALUES($1,$2,'doc',1,true)",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();

    let mut blocker = pool.begin().await.unwrap();
    sqlx::query(
      "SELECT 1 FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 AND doc_id='doc' \
       FOR UPDATE",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&mut *blocker)
    .await
    .unwrap();
    assert!(
      claim_document(&pool, generation_id, &workspace_id, "doc")
        .await
        .unwrap()
        .is_none()
    );
    blocker.rollback().await.unwrap();

    let first_claim = claim_document(&pool, generation_id, &workspace_id, "doc")
      .await
      .unwrap()
      .unwrap();
    complete_document(&pool, generation_id, &workspace_id, "doc", &first_claim)
      .await
      .unwrap();
    sqlx::query(
      "UPDATE search_projection.document_states SET target_source_version=2, claim_fence=NULL, lease_owner=NULL, \
       lease_expires_at=NULL WHERE generation_id=$1 AND workspace_id=$2 AND doc_id='doc'",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    let second_claim = claim_document(&pool, generation_id, &workspace_id, "doc")
      .await
      .unwrap()
      .unwrap();
    assert!(second_claim.fence > first_claim.fence);

    complete_document(&pool, generation_id, &workspace_id, "doc", &first_claim)
      .await
      .unwrap();
    let remaining_fence: i64 = sqlx::query_scalar(
      "SELECT claim_fence FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 AND \
       doc_id='doc'",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(remaining_fence, second_claim.fence);

    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
