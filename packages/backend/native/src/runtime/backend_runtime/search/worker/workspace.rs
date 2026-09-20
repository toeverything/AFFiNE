use sqlx::{PgPool, Row};

use super::{
  ActiveGeneration, DOCUMENT_LEASE_SECONDS, RECONCILE_BATCH, RootReconcilePhase, SearchProvider, SearchTable,
  WorkspacePhase, WorkspaceReconcileContext, WorkspaceStep, checkpoint_workspace, checkpoint_workspace_after,
  claim_workspace, complete_workspace, delete_workspace_state, load_root_document_ids, mark_workspace_failed,
  reconcile_root_documents, reconcile_stale_provider_rows, renew_workspace_lease, sweep_deleted_workspace,
  upsert_document,
};
use crate::{
  runtime::{RuntimeError, RuntimeResult},
  search_index::EmbeddedSearchIndex,
};

const DUE_DOCUMENT_PUBLICATION_BATCH_SQL: &str = r#"SELECT doc_id
     FROM search_projection.document_states
     WHERE generation_id=$1 AND workspace_id=$2 AND available_at <= now()
       AND last_error IS NULL
       AND (lease_expires_at IS NULL OR lease_expires_at <= now())
       AND (target_source_version <> published_source_version
         OR target_source_exists <> published_source_exists
         OR target_permission_version <> published_permission_version)
       AND ($3::text IS NULL OR doc_id > $3)
     ORDER BY doc_id LIMIT $4"#;
pub(in crate::runtime::backend_runtime::search) async fn reconcile_workspace(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  workspace_id: &str,
) -> RuntimeResult<bool> {
  sqlx::query(
    r#"INSERT INTO search_projection.workspace_states(generation_id,workspace_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .execute(pool)
  .await
  .map_err(|error| RuntimeError::database("ensure search workspace state", error))?;

  let Some(claim) = claim_workspace(pool, generation.id, workspace_id).await? else {
    return Ok(false);
  };
  let context = WorkspaceReconcileContext {
    pool,
    embedded,
    remote,
    generation,
    workspace_id,
    fence: claim.fence,
  };

  if let WorkspacePhase::Deleted { table, quiet } = claim.progress.phase.clone() {
    match sweep_deleted_workspace(&context, table, quiet).await? {
      WorkspaceStep::Continue(progress) => {
        checkpoint_workspace(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
        )
        .await?;
      }
      WorkspaceStep::Quiet(progress) => {
        checkpoint_workspace_after(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
          DOCUMENT_LEASE_SECONDS,
        )
        .await?;
      }
      WorkspaceStep::Complete => {
        delete_workspace_state(pool, generation.id, workspace_id, claim.fence).await?;
      }
    }
    return Ok(true);
  }

  let root_document_ids = match load_root_document_ids(pool, workspace_id).await {
    Ok(doc_ids) => doc_ids,
    Err(error) if error.is_permanent_search_source() => {
      mark_workspace_failed(pool, generation.id, workspace_id, claim.fence).await?;
      return Ok(true);
    }
    Err(error) => return Err(error),
  };

  if let WorkspacePhase::Stale { table, cursor } = claim.progress.phase.clone() {
    match reconcile_stale_provider_rows(&context, table, cursor).await? {
      WorkspaceStep::Continue(progress) => {
        checkpoint_workspace(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
        )
        .await?;
        return Ok(true);
      }
      WorkspaceStep::Quiet(_) => unreachable!("stale reconciliation does not schedule a quiet period"),
      WorkspaceStep::Complete => {}
    }
    complete_workspace(
      pool,
      generation,
      workspace_id,
      claim.progress.captured_root_revision,
      claim.progress.captured_permission_version,
      claim.fence,
    )
    .await?;
    return Ok(true);
  }

  if let WorkspacePhase::Source { after_doc_id } = claim.progress.phase.clone() {
    match reconcile_root_documents(
      &context,
      &root_document_ids,
      claim.progress.captured_permission_version,
      after_doc_id,
      RootReconcilePhase::Source,
    )
    .await?
    {
      WorkspaceStep::Continue(progress) => {
        checkpoint_workspace(
          pool,
          generation.id,
          workspace_id,
          claim.fence,
          claim.progress.with_phase(progress).value(),
        )
        .await?;
        return Ok(true);
      }
      WorkspaceStep::Quiet(_) => unreachable!("source reconciliation does not schedule a quiet period"),
      WorkspaceStep::Complete => {}
    }
    checkpoint_workspace(
      pool,
      generation.id,
      workspace_id,
      claim.fence,
      claim
        .progress
        .with_phase(WorkspacePhase::Stale {
          table: SearchTable::Doc,
          cursor: None,
        })
        .value(),
    )
    .await?;
    return Ok(true);
  }

  let (mut after_publication_doc_id, after_doc_id, scan_workspace) = match claim.progress.phase.clone() {
    WorkspacePhase::Publications {
      after_publication_doc_id,
      resume_after_doc_id,
      scan_workspace,
    } => (after_publication_doc_id, resume_after_doc_id, scan_workspace),
    WorkspacePhase::Documents { after_doc_id } => (None, after_doc_id, true),
    WorkspacePhase::Source { .. } => unreachable!("source progress is handled before document reconcile"),
    WorkspacePhase::Stale { .. } => unreachable!("stale progress is handled before document reconcile"),
    WorkspacePhase::Deleted { .. } => unreachable!("deleted progress is handled before document reconcile"),
  };
  let publication_rows = sqlx::query(DUE_DOCUMENT_PUBLICATION_BATCH_SQL)
    .bind(generation.id)
    .bind(workspace_id)
    .bind(&after_publication_doc_id)
    .bind(RECONCILE_BATCH + 1)
    .fetch_all(pool)
    .await
    .map_err(|error| RuntimeError::database("load due search document publications", error))?;
  let publications_complete = publication_rows.len() <= RECONCILE_BATCH as usize;
  for row in publication_rows.into_iter().take(RECONCILE_BATCH as usize) {
    let doc_id: String = row
      .try_get("doc_id")
      .map_err(|error| RuntimeError::database("decode due search document publication", error))?;
    if !renew_workspace_lease(pool, generation.id, workspace_id, claim.fence).await? {
      return Ok(false);
    }
    process_document(pool, embedded, remote, generation, workspace_id, &doc_id).await?;
    after_publication_doc_id = Some(doc_id);
  }
  if !publications_complete {
    checkpoint_workspace(
      pool,
      generation.id,
      workspace_id,
      claim.fence,
      claim
        .progress
        .with_phase(WorkspacePhase::Publications {
          after_publication_doc_id,
          resume_after_doc_id: after_doc_id,
          scan_workspace,
        })
        .value(),
    )
    .await?;
    return Ok(true);
  }

  let has_due_publications: bool = sqlx::query_scalar(
    r#"SELECT EXISTS(
         SELECT 1 FROM search_projection.document_states
         WHERE generation_id=$1 AND workspace_id=$2 AND available_at <= now()
           AND last_error IS NULL
           AND (lease_expires_at IS NULL OR lease_expires_at <= now())
           AND (target_source_version <> published_source_version
             OR target_source_exists <> published_source_exists
             OR target_permission_version <> published_permission_version)
       )"#,
  )
  .bind(generation.id)
  .bind(workspace_id)
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("check due search document publications", error))?;
  if has_due_publications {
    checkpoint_workspace(
      pool,
      generation.id,
      workspace_id,
      claim.fence,
      claim
        .progress
        .with_phase(WorkspacePhase::Publications {
          after_publication_doc_id: None,
          resume_after_doc_id: after_doc_id,
          scan_workspace,
        })
        .value(),
    )
    .await?;
    return Ok(true);
  }

  if !scan_workspace {
    complete_workspace(
      pool,
      generation,
      workspace_id,
      claim.progress.captured_root_revision,
      claim.progress.captured_permission_version,
      claim.fence,
    )
    .await?;
    return Ok(true);
  }

  match reconcile_root_documents(
    &context,
    &root_document_ids,
    claim.progress.captured_permission_version,
    after_doc_id,
    RootReconcilePhase::Documents,
  )
  .await?
  {
    WorkspaceStep::Continue(progress) => {
      checkpoint_workspace(
        pool,
        generation.id,
        workspace_id,
        claim.fence,
        claim.progress.with_phase(progress).value(),
      )
      .await?;
      return Ok(true);
    }
    WorkspaceStep::Complete => {}
    WorkspaceStep::Quiet(_) => unreachable!("root document reconcile does not schedule a quiet period"),
  }

  checkpoint_workspace(
    pool,
    generation.id,
    workspace_id,
    claim.fence,
    claim
      .progress
      .with_phase(WorkspacePhase::Source { after_doc_id: None })
      .value(),
  )
  .await?;
  Ok(true)
}

async fn process_document(
  pool: &PgPool,
  embedded: &EmbeddedSearchIndex,
  remote: Option<&SearchProvider>,
  generation: &ActiveGeneration,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<()> {
  upsert_document(pool, embedded, remote, generation, workspace_id, doc_id).await
}

#[cfg(test)]
mod tests {
  use std::sync::Arc;

  use serde_json::{Value, json};
  use sqlx::PgPool;
  use uuid::Uuid;
  use y_octo::Doc;

  use super::{super::workspace_state::WorkspaceProgress, *};
  use crate::runtime::{backend_runtime::search::SEARCH_TEST_LOCK, migrations::migrate_search_tables};

  #[tokio::test]
  async fn deleted_workspace_waits_for_quiet_sweep_before_dropping_state() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    let suffix = Uuid::new_v4().simple().to_string();
    let workspace_id = format!("deleted-workspace-{suffix}");
    let doc_id = format!("doc-{suffix}");
    let generation_id = Uuid::new_v4();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version,manifest)
         VALUES($1,'embedded','failed',decode(repeat('00',32),'hex'),1,'{}')"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO search_projection.workspace_states(generation_id,workspace_id) VALUES($1,$2)")
      .bind(generation_id)
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let embedded = Arc::new(EmbeddedSearchIndex::default());
    embedded.prepare_generation(generation_id).await;
    let projection = json!({
      "generation_id":generation_id.to_string(),"workspace_id":workspace_id,"doc_id":doc_id,
      "source_version":1,"permission_version":1,"title":"late"
    });
    embedded
      .write_for_generation(generation_id, "doc".to_string(), json!([projection]).to_string())
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let generation = ActiveGeneration {
      id: generation_id,
      manifest: json!({}),
    };
    assert!(
      reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
        .await
        .unwrap()
    );
    assert!(
      reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
        .await
        .unwrap()
    );
    let quiet: bool = sqlx::query_scalar(
      "SELECT progress->>'quiet'='true' AND available_at > now() FROM search_projection.workspace_states WHERE \
       generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(quiet);

    let late_projection = json!({
      "generation_id":generation_id.to_string(),"workspace_id":workspace_id,"doc_id":doc_id,
      "source_version":1,"permission_version":1,"title":"late"
    });
    embedded
      .write_for_generation(generation_id, "doc".to_string(), json!([late_projection]).to_string())
      .await
      .unwrap();
    sqlx::query(
      "UPDATE search_projection.workspace_states SET available_at=now() WHERE generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
      reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
        .await
        .unwrap()
    );
    assert!(
      reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
        .await
        .unwrap()
    );
    let state_exists: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2)",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!state_exists);
    let result: Value = serde_json::from_str(
      &embedded
        .search_for_generation(
          generation_id,
          "doc".to_string(),
          json!({"query":{"term":{"workspace_id":{"value":workspace_id}}},"size":10}).to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 0);

    let race_workspace_id = format!("recreated-during-sweep-{suffix}");
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&race_workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO search_projection.workspace_states(generation_id,workspace_id) VALUES($1,$2)")
      .bind(generation_id)
      .bind(&race_workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    embedded
      .write_for_generation(
        generation_id,
        "doc".to_string(),
        json!([{
          "generation_id":generation_id.to_string(),"workspace_id":race_workspace_id,"doc_id":"old",
          "source_version":1,"permission_version":1,"title":"old incarnation"
        }])
        .to_string(),
      )
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&race_workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let mut blocker = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *blocker)
      .await
      .unwrap();
    let sweep_pool = pool.clone();
    let sweep_embedded = Arc::clone(&embedded);
    let sweep_generation = generation.clone();
    let sweep_workspace_id = race_workspace_id.clone();
    let sweep = tokio::spawn(async move {
      reconcile_workspace(
        &sweep_pool,
        &sweep_embedded,
        None,
        &sweep_generation,
        &sweep_workspace_id,
      )
      .await
      .unwrap()
    });
    for _ in 0..100 {
      let claimed: bool = sqlx::query_scalar(
        "SELECT COALESCE(lease_expires_at > now(),false) FROM search_projection.workspace_states WHERE \
         generation_id=$1 AND workspace_id=$2",
      )
      .bind(generation_id)
      .bind(&race_workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap();
      if claimed {
        break;
      }
      tokio::task::yield_now().await;
    }
    let claimed: bool = sqlx::query_scalar(
      "SELECT COALESCE(lease_expires_at > now(),false) FROM search_projection.workspace_states WHERE generation_id=$1 \
       AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&race_workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(claimed);
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&race_workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    blocker.commit().await.unwrap();
    assert!(sweep.await.unwrap());
    let result: Value = serde_json::from_str(
      &embedded
        .search_for_generation(
          generation_id,
          "doc".to_string(),
          json!({"query":{"term":{"workspace_id":{"value":race_workspace_id}}},"size":10}).to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&race_workspace_id)
      .execute(&pool)
      .await
      .unwrap();

    let source_version_high_water = super::super::anti_entropy::capture_orphan_gc_high_water(&pool, &workspace_id)
      .await
      .unwrap()
      .unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let mut recreated_writer = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('search-projection-generation', 0))")
      .execute(&mut *recreated_writer)
      .await
      .unwrap();
    let recreated_source_version: i64 =
      sqlx::query_scalar("SELECT nextval('search_projection.source_mutation_version')")
        .fetch_one(&mut *recreated_writer)
        .await
        .unwrap();
    recreated_writer.commit().await.unwrap();
    assert!(recreated_source_version > source_version_high_water);
    let old_projection = json!({
      "generation_id":generation_id.to_string(),"workspace_id":workspace_id,"doc_id":format!("{doc_id}-old"),
      "source_version":source_version_high_water,"permission_version":1,"title":"old incarnation"
    });
    let recreated_projection = json!({
      "generation_id":generation_id.to_string(),"workspace_id":workspace_id,"doc_id":doc_id,
      "source_version":recreated_source_version,"permission_version":1,"title":"recreated"
    });
    embedded
      .write_for_generation(
        generation_id,
        "doc".to_string(),
        json!([old_projection, recreated_projection]).to_string(),
      )
      .await
      .unwrap();
    embedded
      .gc_workspace_for_generation(generation_id, "doc", &workspace_id, source_version_high_water, 100)
      .await
      .unwrap();
    let result: Value = serde_json::from_str(
      &embedded
        .search_for_generation(
          generation_id,
          "doc".to_string(),
          json!({"query":{"term":{"workspace_id":{"value":workspace_id}}},"fields":["source_version"],"size":10})
            .to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    assert_eq!(
      result["nodes"][0]["fields"]["source_version"],
      json!([recreated_source_version])
    );
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();

    let post_finalize_projections = (0..125)
      .map(|index| {
        json!({
          "generation_id":generation_id.to_string(),"workspace_id":workspace_id,
          "doc_id":format!("{doc_id}-{index:03}"),
          "source_version":1,"permission_version":1,"title":"post-finalize"
        })
      })
      .collect::<Vec<_>>();
    embedded
      .write_for_generation(
        generation_id,
        "doc".to_string(),
        json!(post_finalize_projections).to_string(),
      )
      .await
      .unwrap();
    for _ in 0..5 {
      super::super::sweep_generation_orphans(&pool, &embedded, None, &generation)
        .await
        .unwrap();
    }
    let result: Value = serde_json::from_str(
      &embedded
        .search_for_generation(
          generation_id,
          "doc".to_string(),
          json!({"query":{"term":{"workspace_id":{"value":workspace_id}}},"size":10}).to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 0);
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let recreated_projection = json!({
      "generation_id":generation_id.to_string(),"workspace_id":workspace_id,"doc_id":doc_id,
      "source_version":2,"permission_version":1,"title":"recreated"
    });
    embedded
      .write_for_generation(
        generation_id,
        "doc".to_string(),
        json!([recreated_projection]).to_string(),
      )
      .await
      .unwrap();
    super::super::sweep_generation_orphans(&pool, &embedded, None, &generation)
      .await
      .unwrap();
    super::super::sweep_generation_orphans(&pool, &embedded, None, &generation)
      .await
      .unwrap();
    let result: Value = serde_json::from_str(
      &embedded
        .search_for_generation(
          generation_id,
          "doc".to_string(),
          json!({"query":{"term":{"workspace_id":{"value":workspace_id}}},"size":10}).to_string(),
        )
        .await
        .unwrap(),
    )
    .unwrap();
    assert_eq!(result["total"], 1);
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[tokio::test]
  async fn permanent_document_failures_are_isolated_and_recover_after_source_mutation() {
    let _guard = SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    migrate_search_tables(&pool).await.unwrap();
    sqlx::query("DELETE FROM search_projection.generations")
      .execute(&pool)
      .await
      .unwrap();

    for (phase_name, phase, corrupt_update) in [
      (
        "publications",
        WorkspacePhase::Publications {
          after_publication_doc_id: None,
          resume_after_doc_id: None,
          scan_workspace: false,
        },
        false,
      ),
      ("documents", WorkspacePhase::Documents { after_doc_id: None }, true),
      ("source", WorkspacePhase::Source { after_doc_id: None }, false),
    ] {
      let suffix = Uuid::new_v4().simple().to_string();
      let generation_id = Uuid::new_v4();
      let workspace_id = format!("source-failure-{phase_name}-{suffix}");
      let doc_id = format!("doc-{suffix}");
      let good_doc_id = format!("good-{suffix}");
      sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
        .bind(&workspace_id)
        .execute(&pool)
        .await
        .unwrap();
      let doc_blob = if corrupt_update {
        affine_doc_loader::build_full_doc("title", "body", &doc_id).unwrap()
      } else {
        vec![0]
      };
      let root_blob = affine_doc_loader::add_doc_to_root_doc(Vec::new(), &doc_id, None).unwrap();
      let root_delta = affine_doc_loader::add_doc_to_root_doc(root_blob.clone(), &good_doc_id, None).unwrap();
      let mut root = Doc::default();
      root.apply_update_from_binary_v1(&root_blob).unwrap();
      root.apply_update_from_binary_v1(&root_delta).unwrap();
      let root_blob = root.encode_update_v1().unwrap();
      let good_blob = affine_doc_loader::build_full_doc("good", "searchable", &good_doc_id).unwrap();
      sqlx::query(
        r#"INSERT INTO snapshots(workspace_id,guid,blob,updated_at)
           VALUES($1,$1,$3,now()),($1,$2,$4,now()),($1,$5,$6,now())"#,
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind(root_blob)
      .bind(doc_blob)
      .bind(&good_doc_id)
      .bind(good_blob)
      .execute(&pool)
      .await
      .unwrap();
      if corrupt_update {
        sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at) VALUES($1,$2,decode('00','hex'),now())")
          .bind(&workspace_id)
          .bind(&doc_id)
          .execute(&pool)
          .await
          .unwrap();
      }
      sqlx::query(
        r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version,manifest)
           VALUES($1,'embedded','building',decode(repeat('00',32),'hex'),1,$2)"#,
      )
      .bind(generation_id)
      .bind(json!({}))
      .execute(&pool)
      .await
      .unwrap();
      let progress = WorkspaceProgress::new(0, 0, phase).value();
      sqlx::query(
        r#"INSERT INTO search_projection.workspace_states(
             generation_id,workspace_id,pending_scope,progress
           ) VALUES($1,$2,'workspace',$3)"#,
      )
      .bind(generation_id)
      .bind(&workspace_id)
      .bind(progress)
      .execute(&pool)
      .await
      .unwrap();
      if phase_name == "publications" {
        sqlx::query(
          r#"INSERT INTO search_projection.document_states(
               generation_id,workspace_id,doc_id,target_source_version,target_source_exists
             ) VALUES($1,$2,$3,1,true)"#,
        )
        .bind(generation_id)
        .bind(&workspace_id)
        .bind(&doc_id)
        .execute(&pool)
        .await
        .unwrap();
      }
      let embedded = EmbeddedSearchIndex::default();
      embedded.prepare_generation(generation_id).await;
      let generation = ActiveGeneration {
        id: generation_id,
        manifest: json!({}),
      };

      assert!(
        reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
          .await
          .unwrap()
      );
      let workspace: (bool, Option<String>) = sqlx::query_as(
        "SELECT covered,last_error FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2",
      )
      .bind(generation_id)
      .bind(&workspace_id)
      .fetch_one(&pool)
      .await
      .unwrap();
      assert_ne!(
        workspace.1.as_deref(),
        Some("search_workspace_reconcile_failed"),
        "{phase_name}"
      );
      let document_failure: Option<String> = sqlx::query_scalar(
        "SELECT last_error FROM search_projection.document_states WHERE generation_id=$1 AND workspace_id=$2 AND \
         doc_id=$3",
      )
      .bind(generation_id)
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_one(&pool)
      .await
      .unwrap();
      assert_eq!(
        document_failure.as_deref(),
        Some("search_document_projection_failed"),
        "{phase_name}"
      );
      if phase_name != "publications" {
        let good_published: bool = sqlx::query_scalar(
          "SELECT published_source_exists FROM search_projection.document_states WHERE generation_id=$1 AND \
           workspace_id=$2 AND doc_id=$3",
        )
        .bind(generation_id)
        .bind(&workspace_id)
        .bind(&good_doc_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(good_published, "{phase_name}");
      }

      let repaired = affine_doc_loader::build_full_doc("repaired", "searchable", &doc_id).unwrap();
      sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(&doc_id)
        .execute(&pool)
        .await
        .unwrap();
      sqlx::query("UPDATE snapshots SET blob=$3,updated_at=now() WHERE workspace_id=$1 AND guid=$2")
        .bind(&workspace_id)
        .bind(&doc_id)
        .bind(repaired)
        .execute(&pool)
        .await
        .unwrap();
      for _ in 0..4 {
        let _ = reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
          .await
          .unwrap();
      }
      let repaired_state: (bool, Option<String>) = sqlx::query_as(
        "SELECT published_source_exists,last_error FROM search_projection.document_states WHERE generation_id=$1 AND \
         workspace_id=$2 AND doc_id=$3",
      )
      .bind(generation_id)
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_one(&pool)
      .await
      .unwrap();
      assert_eq!(repaired_state, (true, None), "{phase_name}");

      if phase_name == "documents" {
        let orphan_doc_id = format!("orphan-{suffix}");
        let orphan_blob = affine_doc_loader::build_full_doc("orphan", "must stay hidden", &orphan_doc_id).unwrap();
        sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
          .bind(&workspace_id)
          .bind(&orphan_doc_id)
          .bind(orphan_blob)
          .execute(&pool)
          .await
          .unwrap();
        for _ in 0..4 {
          let _ = reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
            .await
            .unwrap();
        }
        let orphan_published: bool = sqlx::query_scalar(
          "SELECT published_source_exists FROM search_projection.document_states WHERE generation_id=$1 AND \
           workspace_id=$2 AND doc_id=$3",
        )
        .bind(generation_id)
        .bind(&workspace_id)
        .bind(&orphan_doc_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(!orphan_published);
      }

      sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
        .bind(generation_id)
        .execute(&pool)
        .await
        .unwrap();
      sqlx::query("DELETE FROM workspaces WHERE id=$1")
        .bind(&workspace_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    let generation_id = Uuid::new_v4();
    let workspace_id = format!("missing-root-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO search_projection.generations(id,provider,state,config_hash,schema_version,manifest)
         VALUES($1,'embedded','building',decode(repeat('00',32),'hex'),1,'{}')"#,
    )
    .bind(generation_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO search_projection.workspace_states(generation_id,workspace_id) VALUES($1,$2)")
      .bind(generation_id)
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let embedded = EmbeddedSearchIndex::default();
    embedded.prepare_generation(generation_id).await;
    let generation = ActiveGeneration {
      id: generation_id,
      manifest: json!({}),
    };
    assert!(
      reconcile_workspace(&pool, &embedded, None, &generation, &workspace_id)
        .await
        .unwrap()
    );
    let root_failure: Option<String> = sqlx::query_scalar(
      "SELECT last_error FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(root_failure.as_deref(), Some("search_workspace_reconcile_failed"));

    let unrelated_doc = format!("unrelated-{}", Uuid::new_v4().simple());
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,decode('00','hex'),now())")
      .bind(&workspace_id)
      .bind(unrelated_doc)
      .execute(&pool)
      .await
      .unwrap();
    let still_failed: Option<String> = sqlx::query_scalar(
      "SELECT last_error FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(still_failed.as_deref(), Some("search_workspace_reconcile_failed"));

    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$1,$2,now())")
      .bind(&workspace_id)
      .bind(affine_doc_loader::add_doc_to_root_doc(Vec::new(), "recovered", None).unwrap())
      .execute(&pool)
      .await
      .unwrap();
    let reopened: Option<String> = sqlx::query_scalar(
      "SELECT last_error FROM search_projection.workspace_states WHERE generation_id=$1 AND workspace_id=$2",
    )
    .bind(generation_id)
    .bind(&workspace_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(reopened, None);
    sqlx::query("DELETE FROM search_projection.generations WHERE id=$1")
      .bind(generation_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
