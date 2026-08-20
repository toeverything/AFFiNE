use serde_json::json;
use sqlx::PgPool;

use super::{
  SearchRuntime, generation,
  projection::project_document,
  provider::RemoteProvider,
  query,
  store::{ProjectionInput, SearchChange, SearchStore, SearchTable, stream::allocate},
  types::SearchRequest,
};
use crate::runtime::{
  SearchRuntimeConfig,
  backend_runtime::permission::{AclPredicate, AuthorizedSearchScope, DocReadScope},
  migrations::migrate_search_tables,
};

static SEARCH_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[test]
fn canonical_query_injects_workspace_and_projected_acl() {
  let request = SearchRequest::parse(serde_json::json!({
    "table":"block",
    "query":{"type":"match","field":"content","match":"hello"},
    "options":{"fields":["docId","content"],"pagination":{"limit":20}}
  }))
  .unwrap();
  let scope = AuthorizedSearchScope {
    workspace_id: "workspace".to_string(),
    permission_revision: 7,
    docs: DocReadScope::ProjectedAcl(AclPredicate {
      actor_user_id: "user".to_string(),
      active_member: true,
      sharing_enabled: false,
    }),
  };
  let dsl = query::compile(&request, &scope).unwrap();
  assert_eq!(dsl["size"], 20);
  assert_eq!(
    dsl["query"]["bool"]["must"][0]["term"]["workspace_id"]["value"],
    "workspace"
  );
  let acl = &dsl["query"]["bool"]["must"][2]["bool"]["should"];
  assert_eq!(acl.as_array().unwrap().len(), 2);
  assert!(dsl.to_string().contains("acl_read_tokens"));
}

fn projection(table: SearchTable, id: &str, revision: i64) -> ProjectionInput {
  let block_id = (table == SearchTable::Block).then_some(id);
  ProjectionInput {
    external_id: id.to_string(),
    workspace_id: "search-runtime-test-workspace".to_string(),
    doc_id: "search-runtime-test-doc".to_string(),
    revision,
    payload: json!({
      "workspace_id": "search-runtime-test-workspace",
      "doc_id": "search-runtime-test-doc",
      "block_id": block_id,
      "revision": revision,
    }),
    acl_public_readable: false,
    acl_member_default_readable: true,
    acl_read_user_ids: vec!["search-runtime-test-user".to_string()],
    acl_revision: revision,
  }
}

async fn pool() -> Option<PgPool> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  let pool = PgPool::connect(&database_url).await.unwrap();
  migrate_search_tables(&pool).await.unwrap();
  sqlx::raw_sql(
    "DELETE FROM search_runtime_changes; DELETE FROM search_runtime_projections; UPDATE search_runtime_streams SET \
     head=0, retained_from=0",
  )
  .execute(&pool)
  .await
  .unwrap();
  Some(pool)
}

#[tokio::test]
async fn projection_replace_replay_delete_and_stale_revision_are_monotonic() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else { return };
  let store = SearchStore::new(pool);

  store
    .replace_document(
      projection(SearchTable::Doc, "doc", 2),
      vec![projection(SearchTable::Block, "block-a", 2)],
    )
    .await
    .unwrap();
  store
    .replace_document(
      projection(SearchTable::Doc, "doc", 1),
      vec![projection(SearchTable::Block, "block-stale", 1)],
    )
    .await
    .unwrap();
  store
    .replace_document(
      projection(SearchTable::Doc, "doc", 2),
      vec![projection(SearchTable::Block, "block-a", 2)],
    )
    .await
    .unwrap();

  let doc = store.snapshot(SearchTable::Doc).await.unwrap();
  let block = store.snapshot(SearchTable::Block).await.unwrap();
  assert_eq!((doc.head, doc.projections.len()), (1, 1));
  assert_eq!((block.head, block.projections.len()), (1, 1));
  let (_, changes) = store.changes(SearchTable::Block, 0, 10).await.unwrap();
  assert_eq!(changes.len(), 1);
  assert_eq!(changes[0].external_id, "block-a");

  store
    .delete_document("search-runtime-test-workspace", "search-runtime-test-doc", 3)
    .await
    .unwrap();
  assert!(store.snapshot(SearchTable::Doc).await.unwrap().projections.is_empty());
  assert!(store.snapshot(SearchTable::Block).await.unwrap().projections.is_empty());
  let (_, changes) = store.changes(SearchTable::Block, 1, 10).await.unwrap();
  assert_eq!(changes[0].operation, "delete");
  assert_eq!(changes[0].revision, 3);
}

#[tokio::test]
async fn document_projection_loads_snapshot_metadata_and_search_units() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else { return };
  let suffix = uuid::Uuid::new_v4().simple().to_string();
  let workspace_id = format!("search-projection-workspace-{suffix}");
  let user_id = format!("search-projection-user-{suffix}");
  let doc_id = format!("search-projection-doc-{suffix}");
  sqlx::query(
    "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Search Projection \
     User',$2,true,now(),false)",
  )
  .bind(&user_id)
  .bind(format!("search-projection-{suffix}@example.com"))
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1) ON CONFLICT DO NOTHING")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'owner','active')")
    .bind(&workspace_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  let blob = affine_doc_loader::build_full_doc(
    "Projection title",
    "Projection body\n\n![Asset](blob://projection-blob)",
    &doc_id,
  )
  .unwrap();
  sqlx::query(
    "INSERT INTO snapshots(workspace_id,guid,blob,created_by,updated_by,updated_at) \
     VALUES($1,$2,$3,$4,$4,clock_timestamp())",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(blob)
  .bind(&user_id)
  .execute(&pool)
  .await
  .unwrap();

  let (document, blocks) = project_document(&pool, &workspace_id, &doc_id).await.unwrap().unwrap();
  assert_eq!(document.payload["title"], "Projection title");
  assert_eq!(document.payload["created_by_user_id"], user_id);
  assert!(
    document.payload["summary"]
      .as_str()
      .unwrap()
      .contains("Projection body")
  );
  assert!(document.acl_revision > 0);
  assert!(blocks.iter().any(|block| block.payload["content"] == "Projection body"));
  assert!(blocks.iter().any(|block| block.payload["blob"] == "projection-blob"));
  assert!(
    blocks
      .iter()
      .all(|block| block.payload["acl_revision"] == document.payload["acl_revision"])
  );
}

#[tokio::test]
async fn stream_sequence_follows_commit_order_and_rollback_has_no_gap() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else { return };

  let mut first = pool.begin().await.unwrap();
  assert_eq!(allocate(&mut first, SearchTable::Doc, 1).await.unwrap(), 1);
  let second_pool = pool.clone();
  let second = tokio::spawn(async move {
    let mut transaction = second_pool.begin().await.unwrap();
    let sequence = allocate(&mut transaction, SearchTable::Doc, 1).await.unwrap();
    transaction.commit().await.unwrap();
    sequence
  });
  tokio::task::yield_now().await;
  let visible_head: i64 = sqlx::query_scalar("SELECT head FROM search_runtime_streams WHERE table_key='doc'")
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(visible_head, 0);
  first.commit().await.unwrap();
  assert_eq!(second.await.unwrap(), 2);

  sqlx::query("UPDATE search_runtime_streams SET head=0 WHERE table_key='doc'")
    .execute(&pool)
    .await
    .unwrap();
  let mut rolled_back = pool.begin().await.unwrap();
  assert_eq!(allocate(&mut rolled_back, SearchTable::Doc, 1).await.unwrap(), 1);
  rolled_back.rollback().await.unwrap();
  let mut committed = pool.begin().await.unwrap();
  assert_eq!(allocate(&mut committed, SearchTable::Doc, 1).await.unwrap(), 1);
  committed.commit().await.unwrap();
}

#[tokio::test]
async fn replay_rejects_retention_gap() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else { return };
  sqlx::query("UPDATE search_runtime_streams SET head=5, retained_from=3 WHERE table_key='doc'")
    .execute(&pool)
    .await
    .unwrap();
  let error = SearchStore::new(pool)
    .changes(SearchTable::Doc, 2, 10)
    .await
    .unwrap_err();
  assert!(matches!(error, crate::runtime::RuntimeError::SearchReplayGap));
}

#[tokio::test]
async fn concurrent_generation_prepare_reuses_pending_and_restart_preserves_active() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else { return };
  sqlx::query("DELETE FROM search_runtime_generations")
    .execute(&pool)
    .await
    .unwrap();
  let config = SearchRuntimeConfig::default();
  let (first, second) = tokio::join!(
    generation::prepare(&pool, &config, None),
    generation::prepare(&pool, &config, None)
  );
  let first = first.unwrap();
  let second = second.unwrap();
  assert_eq!(first.id, second.id);
  generation::activate(&pool, &first).await.unwrap();
  let restarted = generation::prepare(&pool, &config, None).await.unwrap();
  assert_eq!(restarted.id, first.id);
  generation::activate(&pool, &restarted).await.unwrap();
  let active: i64 = sqlx::query_scalar("SELECT count(*) FROM search_runtime_generations WHERE state='active'")
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(active, 1);
  let unavailable = SearchRuntimeConfig {
    provider: "elasticsearch".into(),
    endpoint: "http://127.0.0.1:1".into(),
    ..Default::default()
  };
  let remote = RemoteProvider::new(&unavailable, pool.clone()).unwrap();
  assert!(generation::prepare(&pool, &unavailable, Some(&remote)).await.is_err());
  let states: (i64, i64, i64) = sqlx::query_as(
    "SELECT count(*) FILTER (WHERE state='active'), count(*) FILTER (WHERE state='pending'), count(*) FILTER (WHERE \
     state='failed') FROM search_runtime_generations",
  )
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(states, (1, 0, 1));
}

#[tokio::test]
async fn embedded_replicas_share_one_checkpoint_and_rebuild_a_corrupt_snapshot() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else { return };
  sqlx::raw_sql(
    "DELETE FROM search_runtime_generations; DELETE FROM search_runtime_checkpoints; DELETE FROM \
     search_runtime_changes; DELETE FROM search_runtime_projections; UPDATE search_runtime_streams SET head=0, \
     retained_from=0",
  )
  .execute(&pool)
  .await
  .unwrap();
  SearchStore::new(pool.clone())
    .replace_document(
      ProjectionInput {
        payload: json!({
          "workspace_id":"replica-workspace","doc_id":"replica-doc","title":"replica search",
          "summary":"","created_by_user_id":"user","updated_by_user_id":"user",
          "created_at":1,"updated_at":1,"acl_public_readable":false,
          "acl_member_default_readable":true,"acl_read_tokens":["member"],
          "acl_revision":1
        }),
        external_id: "replica-workspace/replica-doc".into(),
        workspace_id: "replica-workspace".into(),
        doc_id: "replica-doc".into(),
        revision: 1,
        acl_public_readable: false,
        acl_member_default_readable: true,
        acl_read_user_ids: vec![],
        acl_revision: 1,
      },
      vec![],
    )
    .await
    .unwrap();
  let config = SearchRuntimeConfig::default();
  let first = SearchRuntime::new(pool.clone(), config.clone()).unwrap();
  let second = SearchRuntime::new(pool.clone(), config.clone()).unwrap();
  let third = SearchRuntime::new(pool.clone(), config.clone()).unwrap();
  let (first_result, second_result, third_result) =
    tokio::join!(first.initialize(), second.initialize(), third.initialize());
  first_result.unwrap();
  second_result.unwrap();
  third_result.unwrap();
  SearchStore::new(pool.clone())
    .replace_document(
      ProjectionInput {
        payload: json!({
          "workspace_id":"replica-workspace","doc_id":"replica-doc-2","title":"replica search second",
          "summary":"","created_by_user_id":"user","updated_by_user_id":"user",
          "created_at":2,"updated_at":2,"acl_public_readable":false,
          "acl_member_default_readable":true,"acl_read_tokens":["member"],
          "acl_revision":1
        }),
        external_id: "replica-workspace/replica-doc-2".into(),
        workspace_id: "replica-workspace".into(),
        doc_id: "replica-doc-2".into(),
        revision: 2,
        acl_public_readable: false,
        acl_member_default_readable: true,
        acl_read_user_ids: vec![],
        acl_revision: 1,
      },
      vec![],
    )
    .await
    .unwrap();
  first.sync().await.unwrap();
  sqlx::query("UPDATE search_runtime_streams SET retained_from=head WHERE table_key='doc'")
    .execute(&pool)
    .await
    .unwrap();
  second.sync().await.unwrap();
  let second_replica_result: serde_json::Value = serde_json::from_str(
    &second
      .embedded
      .search(
        "doc".into(),
        json!({"query":{"match_all":{}},"fields":["doc_id"],"sort":["doc_id"],"size":10}).to_string(),
      )
      .await
      .unwrap(),
  )
  .unwrap();
  assert_eq!(second_replica_result["total"], 2);
  let checkpoints: i64 = sqlx::query_scalar("SELECT count(*) FROM search_runtime_checkpoints")
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(checkpoints, 1);
  sqlx::query("UPDATE search_runtime_checkpoints SET checkpoint_blob='\\x010203' WHERE table_key='doc'")
    .execute(&pool)
    .await
    .unwrap();
  let recovered = SearchRuntime::new(pool, config).unwrap();
  recovered.initialize().await.unwrap();
  let result: serde_json::Value = serde_json::from_str(
    &recovered
      .embedded
      .search(
        "doc".into(),
        json!({"query":{"match_all":{}},"fields":["doc_id"],"sort":["doc_id"],"size":10}).to_string(),
      )
      .await
      .unwrap(),
  )
  .unwrap();
  assert_eq!(result["total"], 2);
}

#[tokio::test]
async fn remote_providers_apply_search_and_delete_the_same_contract() {
  let _guard = SEARCH_TEST_LOCK.lock().await;
  let require_remote = std::env::var("SEARCH_REQUIRE_REMOTE_TESTS").as_deref() == Ok("1");
  let pool = match pool().await {
    Some(pool) => pool,
    None if require_remote => panic!("DATABASE_URL is required"),
    None => return,
  };
  let mut tested_providers = 0;
  for (provider, variable) in [("elasticsearch", "SEARCH_ES_URL"), ("manticoresearch", "SEARCH_MS_URL")] {
    let Ok(endpoint) = std::env::var(variable) else {
      continue;
    };
    tested_providers += 1;
    let remote = RemoteProvider::new(
      &SearchRuntimeConfig {
        provider: provider.to_string(),
        endpoint: endpoint.clone(),
        ..Default::default()
      },
      pool.clone(),
    )
    .unwrap();
    let table = format!("affine_search_contract_{}", uuid::Uuid::new_v4().simple());
    let block_table = format!("affine_search_contract_block_{}", uuid::Uuid::new_v4().simple());
    let cleanup_tables = [table.clone(), block_table.clone()];
    let contract = tokio::spawn(async move {
      remote.provision(&table, super::types::SearchTable::Doc).await.unwrap();
      let upsert = SearchChange {
        sequence: 1,
        external_id: "workspace/doc".into(),
        workspace_id: "workspace".into(),
        doc_id: Some("doc".into()),
        revision: 1,
        operation: "upsert".into(),
        payload: Some(json!({
          "workspace_id":"workspace","workspace_token":super::exact_token("workspace"),
          "doc_id":"doc","doc_token":super::exact_token("doc"),"title":"search contract",
          "summary":"","created_by_user_id":"user","updated_by_user_id":"user",
          "created_at":1,"updated_at":1,"acl_public_readable":false,
          "acl_member_default_readable":true,"acl_read_tokens":["member"],"acl_revision":1
        })),
      };
      let mut second = upsert.clone();
      second.sequence = 2;
      second.external_id = "workspace/doc-2".into();
      second.doc_id = Some("doc-2".into());
      second.payload.as_mut().unwrap()["doc_id"] = json!("doc-2");
      second.payload.as_mut().unwrap()["doc_token"] = json!(super::exact_token("doc-2"));
      remote.apply(&table, &[upsert.clone(), second.clone()]).await.unwrap();
      let dsl = json!({
        "query":{"bool":{"must":[
          {"term":{"workspace_id":{"value":"workspace"}}},
          {"match":{"title":{"query":"contract"}}},
          {"bool":{"should":[{"term":{"acl_read_tokens":{"value":"member"}}}]}}
        ]}},
        "fields":["doc_id","title"],"_source":["workspace_id","doc_id"],
        "highlight":{"fields":{"title":{"pre_tags":["<b>"],"post_tags":["</b>"]}}},
        "sort":["doc_id"],"size":1
      });
      let result = remote.search(&table, dsl.clone()).await.unwrap();
      assert_eq!(result["total"], 2, "provider {provider}");
      assert!(result["nodes"][0]["fields"]["doc_id"].is_array(), "provider {provider}");
      assert!(
        result["nodes"][0]["highlights"]["title"].is_array(),
        "provider {provider}"
      );
      let first_doc = result["nodes"][0]["fields"]["doc_id"][0].clone();
      let mut next_dsl = dsl.clone();
      let first_cursor = result["nextCursor"].clone();
      next_dsl["cursor"] = first_cursor.clone();
      let next = remote.search(&table, next_dsl).await.unwrap();
      assert_ne!(
        first_doc, next["nodes"][0]["fields"]["doc_id"][0],
        "provider {provider}"
      );
      assert_ne!(first_cursor, next["nextCursor"], "provider {provider}");
      let aggregate_dsl = json!({
        "query":{"term":{"workspace_id":{"value":"workspace"}}},
        "size":0,
        "aggs":{"result":{"terms":{"field":"doc_id","size":10},"aggs":{"result":{"top_hits":{
          "size":1,"_source":["workspace_id","doc_id"],"fields":["doc_id","title"],"sort":["doc_id"]
        }}}}}
      });
      let aggregate = remote.aggregate(&table, aggregate_dsl).await.unwrap();
      assert_eq!(aggregate["total"], 2, "provider {provider}");
      assert_eq!(aggregate["buckets"].as_array().unwrap().len(), 2, "provider {provider}");
      assert!(
        aggregate["buckets"][0]["hits"]["nodes"][0]["fields"]["doc_id"].is_array(),
        "provider {provider}"
      );

      remote
        .provision(&block_table, super::types::SearchTable::Block)
        .await
        .unwrap();
      let block = SearchChange {
        sequence: 1,
        external_id: "workspace/doc/block".into(),
        workspace_id: "workspace".into(),
        doc_id: Some("doc".into()),
        revision: 1,
        operation: "upsert".into(),
        payload: Some(json!({
          "workspace_id":"workspace","workspace_token":super::exact_token("workspace"),
          "doc_id":"doc","doc_token":super::exact_token("doc"),
          "block_id":"block","block_token":super::exact_token("block"),
          "content":"笔记应用 다람쥐 いろはにほへと https://linear.app/affine-design/issue/AF-1379/slash-commands",
          "flavour":"affine:paragraph",
          "ref_doc_id":["ref-a","ref-b"],"blob":["blob-a","blob-b"],
          "created_by_user_id":"user","updated_by_user_id":"user",
          "created_at":2_000,"updated_at":3_000,"acl_public_readable":false,
          "acl_member_default_readable":true,"acl_read_tokens":["member"],"acl_revision":1
        })),
      };
      remote.apply(&block_table, std::slice::from_ref(&block)).await.unwrap();
      let exists = remote
        .search(
          &block_table,
          json!({
            "query":{"exists":{"field":"ref_doc_id"}},
            "fields":["block_id","ref_doc_id"],"_source":["workspace_id","doc_id"],
            "sort":["block_id"],"size":10
          }),
        )
        .await
        .unwrap();
      assert_eq!(exists["total"], 1, "provider {provider}");
      let exact_ref = remote
        .search(
          &block_table,
          json!({
            "query":{"bool":{"must":[
              {"term":{"workspace_id":{"value":"workspace"}}},
              {"term":{"ref_doc_id":{"value":"ref-a"}}},
              {"bool":{"must_not":[{"term":{"doc_id":{"value":"other-doc"}}}]}}
            ]}},
            "fields":["block_id","ref_doc_id"],"_source":["workspace_id","doc_id"],
            "sort":["block_id"],"size":10
          }),
        )
        .await
        .unwrap();
      assert_eq!(exact_ref["total"], 1, "provider {provider}");
      let terms = if provider == "elasticsearch" {
        ["记", "https://linear.app"].as_slice()
      } else {
        ["쥐", "へ", "https://linear.app"].as_slice()
      };
      for term in terms {
        let language = remote
          .search(
            &block_table,
            json!({
              "query":{"match":{"content":{"query":term}}},
              "fields":["block_id","ref_doc_id","blob","created_at","updated_at"],
              "_source":["workspace_id","doc_id"],
              "highlight":{"fields":{"content":{"pre_tags":["<b>"],"post_tags":["</b>"]}}},
              "sort":["block_id"],"size":10
            }),
          )
          .await
          .unwrap();
        assert_eq!(language["total"], 1, "provider {provider}, term {term}");
        assert_eq!(language["nodes"][0]["fields"]["ref_doc_id"], json!(["ref-a", "ref-b"]));
        assert!(language["nodes"][0]["fields"]["created_at"].is_array());
        assert!(language["nodes"][0]["highlights"]["content"].is_array());
      }
      let mut revoked = upsert.clone();
      revoked.sequence = 3;
      revoked.revision = 3;
      revoked.payload.as_mut().unwrap()["acl_read_tokens"] = json!([]);
      remote.apply(&table, &[revoked]).await.unwrap();
      let revoked_result = remote.search(&table, dsl.clone()).await.unwrap();
      assert_eq!(revoked_result["total"], 1, "provider {provider}");
      assert_eq!(revoked_result["nodes"][0]["fields"]["doc_id"][0], "doc-2");
      let deletion = SearchChange {
        operation: "delete".into(),
        payload: None,
        sequence: 4,
        revision: 4,
        ..upsert.clone()
      };
      let second_deletion = SearchChange {
        operation: "delete".into(),
        payload: None,
        sequence: 5,
        revision: 5,
        ..second
      };
      remote.apply(&table, &[deletion, second_deletion]).await.unwrap();
      let result = remote
        .search(
          &table,
          json!({"query":{"match_all":{}},"fields":["doc_id"],"sort":["doc_id"],"size":10}),
        )
        .await
        .unwrap();
      assert_eq!(result["total"], 0, "provider {provider}");
    })
    .await;
    let client = reqwest::Client::new();
    if provider == "elasticsearch" {
      for physical_table in &cleanup_tables {
        let response = client
          .delete(format!("{endpoint}/{physical_table}"))
          .send()
          .await
          .unwrap();
        assert!(response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND);
      }
    } else {
      for physical_table in &cleanup_tables {
        client
          .post(format!("{endpoint}/cli"))
          .header("content-type", "text/plain")
          .body(format!("DROP TABLE IF EXISTS {physical_table}"))
          .send()
          .await
          .unwrap()
          .error_for_status()
          .unwrap();
      }
    }
    contract.unwrap();
  }
  if require_remote {
    assert_eq!(tested_providers, 2, "SEARCH_ES_URL and SEARCH_MS_URL are required");
  }
}
