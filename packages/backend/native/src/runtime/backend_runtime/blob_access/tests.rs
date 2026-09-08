use std::time::Duration;

use affine_doc_loader::blob_refs::MAX_SOURCE_BINARY_BYTES;
use chrono::Utc;
use sqlx::PgPool;
use y_octo::Doc;

use super::*;
use crate::runtime::object_storage::types::{ObjectKey, ObjectLocator, StorageScope};

static BLOB_ACCESS_TEST_LOCK: &tokio::sync::Mutex<()> = &crate::runtime::migrations::DATABASE_TEST_LOCK;

struct Fixture {
  pool: PgPool,
  workspace_id: String,
  direct_user_id: String,
  member_user_id: String,
  doc_id: String,
  history_timestamp_ms: i64,
}

async fn setup() -> Option<Fixture> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  let pool = PgPool::connect(&database_url).await.unwrap();
  assert!(
    crate::runtime::migrations::migrate_embedding_tables(&pool)
      .await
      .enabled
  );
  let suffix = Uuid::new_v4().simple().to_string();
  let workspace_id = format!("blob-access-workspace-{suffix}");
  let direct_user_id = format!("blob-access-direct-{suffix}");
  let member_user_id = format!("blob-access-member-{suffix}");
  let doc_id = format!("blob-access-doc-{suffix}");
  for (user_id, email) in [
    (&direct_user_id, format!("blob-direct-{suffix}@example.com")),
    (&member_user_id, format!("blob-member-{suffix}@example.com")),
  ] {
    sqlx::query(
      "INSERT INTO users(id,name,email,registered,email_verified,disabled) VALUES($1,'Blob Access \
       User',$2,true,now(),false)",
    )
    .bind(user_id)
    .bind(email)
    .execute(&pool)
    .await
    .unwrap();
  }
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_access_policies(workspace_id,member_default_doc_role) VALUES($1,'manager')")
    .bind(&workspace_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role,state) VALUES($1,$2,'member','active')")
    .bind(&workspace_id)
    .bind(&member_user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) VALUES($1,$2,'user',$3,'reader')",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(&direct_user_id)
  .execute(&pool)
  .await
  .unwrap();
  let doc = affine_doc_loader::build_full_doc(
    "Blob doc",
    "![completed](blob://completed-key) ![pending](blob://pending-key) ![deleted](blob://deleted-key)",
    &doc_id,
  )
  .unwrap();
  sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&doc)
    .execute(&pool)
    .await
    .unwrap();
  let history_timestamp = chrono::DateTime::from_timestamp_millis(Utc::now().timestamp_millis()).unwrap();
  sqlx::query(
    "INSERT INTO snapshot_histories(workspace_id,guid,timestamp,blob,expired_at) VALUES($1,$2,$3,$4,now()+interval '1 \
     day')",
  )
  .bind(&workspace_id)
  .bind(&doc_id)
  .bind(history_timestamp)
  .bind(&doc)
  .execute(&pool)
  .await
  .unwrap();
  for (key, status, deleted) in [
    ("completed-key", "completed", false),
    ("pending-key", "pending", false),
    ("deleted-key", "completed", true),
  ] {
    sqlx::query(
      "INSERT INTO blobs(workspace_id,key,size,mime,status,deleted_at) \
       VALUES($1,$2,7,'image/png',$3::\"BlobStatus\",CASE WHEN $4 THEN now() ELSE NULL END)",
    )
    .bind(&workspace_id)
    .bind(key)
    .bind(status)
    .bind(deleted)
    .execute(&pool)
    .await
    .unwrap();
  }
  Some(Fixture {
    pool,
    workspace_id,
    direct_user_id,
    member_user_id,
    doc_id,
    history_timestamp_ms: history_timestamp.timestamp_millis(),
  })
}

async fn teardown(fixture: &Fixture) {
  for table in [
    "updates",
    "snapshot_histories",
    "snapshots",
    "blobs",
    "doc_access_policies",
    "workspace_pages",
    "doc_grants",
    "workspace_members",
    "workspace_access_policies",
  ] {
    sqlx::query(&format!("DELETE FROM {table} WHERE workspace_id=$1"))
      .bind(&fixture.workspace_id)
      .execute(&fixture.pool)
      .await
      .unwrap();
  }
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(&fixture.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=ANY($1)")
    .bind(vec![&fixture.direct_user_id, &fixture.member_user_id])
    .execute(&fixture.pool)
    .await
    .unwrap();
}

fn service(fixture: &Fixture) -> BlobAccessService {
  BlobAccessService::new(
    fixture.pool.clone(),
    Arc::new(ObjectStorageService::from_config_json("{}").unwrap()),
    Deployment::Cloud,
    PermissionTelemetry::default(),
  )
}

fn current(fixture: &Fixture) -> SourceIdentity {
  SourceIdentity::CurrentDoc {
    workspace_id: fixture.workspace_id.clone(),
    doc_id: fixture.doc_id.clone(),
  }
}

fn history(fixture: &Fixture) -> SourceIdentity {
  SourceIdentity::History {
    workspace_id: fixture.workspace_id.clone(),
    doc_id: fixture.doc_id.clone(),
    timestamp_ms: fixture.history_timestamp_ms,
  }
}

fn root_with_avatar(page_doc_id: &str, avatar_key: &str) -> Vec<u8> {
  let root = Doc::default();
  let mut meta = root.get_or_create_map("meta").unwrap();
  meta.insert("avatar".to_string(), avatar_key).unwrap();
  let mut pages = root.create_array().unwrap();
  let mut page = root.create_map().unwrap();
  page.insert("id".to_string(), page_doc_id).unwrap();
  pages.push(page).unwrap();
  meta.insert("pages".to_string(), pages).unwrap();
  root.encode_update_v1().unwrap()
}

#[tokio::test]
async fn source_acl_history_and_live_ledger_are_enforced_together() {
  let _guard = BLOB_ACCESS_TEST_LOCK.lock().await;
  let Some(fixture) = setup().await else {
    return;
  };
  let service = service(&fixture);

  let direct = service
    .manifest(Some(&fixture.direct_user_id), current(&fixture))
    .await
    .unwrap();
  assert_eq!(direct.entries.len(), 1);
  assert_eq!(direct.entries[0].key, "completed-key");
  assert!(service.manifest(None, current(&fixture)).await.is_err());
  assert!(
    service
      .manifest(Some(&fixture.direct_user_id), history(&fixture))
      .await
      .is_err()
  );
  let member_history = service
    .manifest(Some(&fixture.member_user_id), history(&fixture))
    .await
    .unwrap();
  assert_eq!(member_history.entries.len(), 1);

  sqlx::query(
    "INSERT INTO doc_access_policies(workspace_id,doc_id,visibility,public_role) VALUES($1,$2,'public','external')",
  )
  .bind(&fixture.workspace_id)
  .bind(&fixture.doc_id)
  .execute(&fixture.pool)
  .await
  .unwrap();
  assert!(service.manifest(None, current(&fixture)).await.is_err());
  sqlx::query("UPDATE doc_access_policies SET published_at=now() WHERE workspace_id=$1 AND doc_id=$2")
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_pages(workspace_id,page_id,published_at) VALUES($1,$2,now())")
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  assert_eq!(
    service.manifest(None, current(&fixture)).await.unwrap().entries.len(),
    1
  );
  teardown(&fixture).await;
}

#[tokio::test]
async fn workspace_root_uses_workspace_acl_and_only_exposes_current_avatar_ref() {
  let _guard = BLOB_ACCESS_TEST_LOCK.lock().await;
  let Some(fixture) = setup().await else {
    return;
  };
  let source = SourceIdentity::CurrentDoc {
    workspace_id: fixture.workspace_id.clone(),
    doc_id: fixture.workspace_id.clone(),
  };
  sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$1,$2,now())")
    .bind(&fixture.workspace_id)
    .bind(root_with_avatar(&fixture.doc_id, "avatar-old"))
    .execute(&fixture.pool)
    .await
    .unwrap();
  for key in ["avatar-old", "avatar-new", "arbitrary-completed"] {
    sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,7,'image/png','completed')")
      .bind(&fixture.workspace_id)
      .bind(key)
      .execute(&fixture.pool)
      .await
      .unwrap();
  }
  let service = service(&fixture);

  sqlx::query(
    "INSERT INTO doc_access_policies(workspace_id,doc_id,visibility,public_role,published_at) \
     VALUES($1,$2,'public','external',now())",
  )
  .bind(&fixture.workspace_id)
  .bind(&fixture.doc_id)
  .execute(&fixture.pool)
  .await
  .unwrap();
  sqlx::query("INSERT INTO workspace_pages(workspace_id,page_id,published_at) VALUES($1,$2,now())")
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  assert!(service.manifest(None, source.clone()).await.is_err());
  let first = service
    .manifest(Some(&fixture.member_user_id), source.clone())
    .await
    .unwrap();
  assert_eq!(
    first.entries.iter().map(|entry| entry.key.as_str()).collect::<Vec<_>>(),
    ["avatar-old"]
  );

  sqlx::query(
    "UPDATE snapshots SET blob=$2,updated_at=updated_at + interval '1 millisecond' WHERE workspace_id=$1 AND guid=$1",
  )
  .bind(&fixture.workspace_id)
  .bind(root_with_avatar(&fixture.doc_id, "avatar-new"))
  .execute(&fixture.pool)
  .await
  .unwrap();
  let second = service
    .manifest(Some(&fixture.member_user_id), source.clone())
    .await
    .unwrap();
  assert_eq!(
    second
      .entries
      .iter()
      .map(|entry| entry.key.as_str())
      .collect::<Vec<_>>(),
    ["avatar-new"]
  );
  assert!(
    service
      .open_read(Some(&fixture.member_user_id), source, "arbitrary-completed".to_string())
      .await
      .is_err()
  );
  teardown(&fixture).await;
}

#[tokio::test]
async fn doc_append_invalidation_fences_inflight_refresh_and_stamp_covers_redis_loss() {
  use crate::runtime::backend_runtime::{
    RedisRuntimeConfig,
    doc_writer::append_updates,
    invalidation::{InvalidationRuntime, NoopInvalidationTarget},
  };

  let Ok(redis_url) = std::env::var("INVALIDATION_REDIS_URL") else {
    return;
  };
  let _guard = BLOB_ACCESS_TEST_LOCK.lock().await;
  let Some(fixture) = setup().await else {
    return;
  };
  for key in ["redis-key", "loss-key"] {
    sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,7,'image/png','completed')")
      .bind(&fixture.workspace_id)
      .bind(key)
      .execute(&fixture.pool)
      .await
      .unwrap();
  }
  let pod_b = Arc::new(service(&fixture));
  let loaded = pod_b
    .authorize_and_load(Some(&fixture.member_user_id), current(&fixture))
    .await
    .unwrap();
  let initial_blob = loaded.blob.clone();
  let confirmation_started = Arc::new(tokio::sync::Notify::new());
  let release_confirmation = Arc::new(tokio::sync::Notify::new());
  let inflight = {
    let pod_b = Arc::clone(&pod_b);
    let actor_user_id = fixture.member_user_id.clone();
    let confirmation_started = Arc::clone(&confirmation_started);
    let release_confirmation = Arc::clone(&release_confirmation);
    tokio::spawn(async move {
      let confirmer = Arc::clone(&pod_b);
      pod_b
        .cache
        .refs(loaded.clone(), || async {
          confirmation_started.notify_one();
          release_confirmation.notified().await;
          confirmer
            .confirm_source(Some(&actor_user_id), &loaded.identity, &loaded.stamp)
            .await
        })
        .await
    })
  };
  confirmation_started.notified().await;
  let config = RedisRuntimeConfig { url: Some(redis_url) };
  let subscriber = InvalidationRuntime::start(&config, true, pod_b.clone()).await;
  let publisher = InvalidationRuntime::start(&config, false, Arc::new(NoopInvalidationTarget)).await;
  tokio::time::sleep(std::time::Duration::from_millis(100)).await;

  let redis_update =
    affine_doc_loader::update_doc(&initial_blob, "![redis](blob://redis-key)", &fixture.doc_id).unwrap();
  append_updates(
    &fixture.pool,
    Some(publisher.clone()),
    true,
    fixture.workspace_id.clone(),
    fixture.doc_id.clone(),
    vec![redis_update.into()],
    None,
  )
  .await
  .unwrap();
  tokio::time::timeout(std::time::Duration::from_secs(3), async {
    while subscriber.health().received == 0 {
      tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
  })
  .await
  .unwrap();
  release_confirmation.notify_one();
  assert_eq!(inflight.await.unwrap().unwrap_err().to_string(), "blob_source_changed");
  let after_hint = pod_b
    .manifest(Some(&fixture.member_user_id), current(&fixture))
    .await
    .unwrap();
  assert!(after_hint.entries.iter().any(|entry| entry.key == "redis-key"));

  subscriber.stop().await;
  let current_source = pod_b
    .authorize_and_load(Some(&fixture.member_user_id), current(&fixture))
    .await
    .unwrap();
  let loss_update =
    affine_doc_loader::update_doc(&current_source.blob, "![loss](blob://loss-key)", &fixture.doc_id).unwrap();
  append_updates(
    &fixture.pool,
    None,
    true,
    fixture.workspace_id.clone(),
    fixture.doc_id.clone(),
    vec![loss_update.into()],
    None,
  )
  .await
  .unwrap();
  let after_loss = pod_b
    .manifest(Some(&fixture.member_user_id), current(&fixture))
    .await
    .unwrap();
  assert!(after_loss.entries.iter().any(|entry| entry.key == "loss-key"));
  publisher.stop().await;
  teardown(&fixture).await;
}

#[tokio::test]
async fn workspace_page_uses_complete_root_live_set_and_excludes_orphan_snapshots() {
  let _guard = BLOB_ACCESS_TEST_LOCK.lock().await;
  let Some(fixture) = setup().await else {
    return;
  };
  let live_doc_id = fixture.doc_id.clone();
  let second_doc_id = format!("second-{}", Uuid::new_v4().simple());
  let root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), &live_doc_id, None).unwrap();
  let second_root_update = affine_doc_loader::add_doc_to_root_doc(root.clone(), &second_doc_id, None).unwrap();
  sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$1,$2,now())")
    .bind(&fixture.workspace_id)
    .bind(root.clone())
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO updates(workspace_id,guid,blob,created_at) VALUES($1,$1,$2,now())")
    .bind(&fixture.workspace_id)
    .bind(second_root_update.clone())
    .execute(&fixture.pool)
    .await
    .unwrap();
  let second = affine_doc_loader::build_full_doc("Second", "![same](blob://completed-key)", &second_doc_id).unwrap();
  sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
    .bind(&fixture.workspace_id)
    .bind(&second_doc_id)
    .bind(second)
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role) VALUES($1,$2,'user',$3,'reader')",
  )
  .bind(&fixture.workspace_id)
  .bind(&second_doc_id)
  .bind(&fixture.direct_user_id)
  .execute(&fixture.pool)
  .await
  .unwrap();
  let orphan_id = format!("orphan-{}", Uuid::new_v4().simple());
  let orphan = affine_doc_loader::build_full_doc("Orphan", "![orphan](blob://orphan-key)", &orphan_id).unwrap();
  sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
    .bind(&fixture.workspace_id)
    .bind(&orphan_id)
    .bind(orphan)
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,'orphan-key',7,'image/png','completed')")
    .bind(&fixture.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  let output = service(&fixture)
    .workspace_manifest(WorkspaceManifestRequestV1 {
      actor_user_id: fixture.member_user_id.clone(),
      workspace_id: fixture.workspace_id.clone(),
      cursor: None,
      limit: Some(100),
    })
    .await
    .unwrap();
  assert!(
    service(&fixture)
      .workspace_manifest(WorkspaceManifestRequestV1 {
        actor_user_id: fixture.direct_user_id.clone(),
        workspace_id: fixture.workspace_id.clone(),
        cursor: None,
        limit: Some(100),
      })
      .await
      .is_err(),
    "a direct document grant must not bypass the workspace member-only manifest gate"
  );
  assert!(output.entries.iter().all(|entry| entry.key != "orphan-key"));
  let same_key_sources = output
    .entries
    .iter()
    .filter(|entry| entry.key == "completed-key")
    .map(|entry| entry.source.doc_id())
    .collect::<Vec<_>>();
  assert_eq!(same_key_sources, vec![live_doc_id.as_str(), second_doc_id.as_str()]);

  let many_refs = affine_doc_loader::build_full_doc(
    "Many",
    "![same](blob://completed-key) ![a](blob://page-a) ![b](blob://page-b) ![c](blob://page-c)",
    &live_doc_id,
  )
  .unwrap();
  sqlx::query(
    "UPDATE snapshots SET blob=$3,updated_at=updated_at + interval '1 millisecond' WHERE workspace_id=$1 AND guid=$2",
  )
  .bind(&fixture.workspace_id)
  .bind(&live_doc_id)
  .bind(many_refs)
  .execute(&fixture.pool)
  .await
  .unwrap();
  for key in ["page-a", "page-b", "page-c"] {
    sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,7,'image/png','completed')")
      .bind(&fixture.workspace_id)
      .bind(key)
      .execute(&fixture.pool)
      .await
      .unwrap();
  }
  let paging_service = service(&fixture);
  let mut cursor = None;
  let mut paged = Vec::new();
  loop {
    let page = paging_service
      .workspace_manifest(WorkspaceManifestRequestV1 {
        actor_user_id: fixture.member_user_id.clone(),
        workspace_id: fixture.workspace_id.clone(),
        cursor,
        limit: Some(2),
      })
      .await
      .unwrap();
    assert!(page.entries.len() <= 2);
    paged.extend(
      page
        .entries
        .iter()
        .map(|entry| (entry.source.doc_id().to_string(), entry.key.clone())),
    );
    let Some(next) = page.next_cursor else { break };
    cursor = Some(next);
  }
  assert_eq!(paged.len(), 5);
  assert_eq!(paged.iter().filter(|(_, key)| key == "completed-key").count(), 2);

  let mut complete_root = Doc::default();
  complete_root.apply_update_from_binary_v1(&root).unwrap();
  complete_root.apply_update_from_binary_v1(&second_root_update).unwrap();
  let source_count = usize::try_from(SOURCE_PAGE_LIMIT).unwrap() + 2;
  let large_source_padding = "x".repeat(512 * 1024);
  for index in 0..source_count {
    let doc_id = format!("bounded-{index:02}");
    let current = complete_root.encode_update_v1().unwrap();
    let update = affine_doc_loader::add_doc_to_root_doc(current, &doc_id, None).unwrap();
    complete_root.apply_update_from_binary_v1(&update).unwrap();
    let key = format!("bounded-key-{index:02}");
    let doc = affine_doc_loader::build_full_doc(
      "Bounded",
      &format!("{large_source_padding} ![bounded](blob://{key})"),
      &doc_id,
    )
    .unwrap();
    assert!(doc.len() < MAX_SOURCE_BINARY_BYTES);
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
      .bind(&fixture.workspace_id)
      .bind(&doc_id)
      .bind(doc)
      .execute(&fixture.pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,$2,7,'image/png','completed')")
      .bind(&fixture.workspace_id)
      .bind(key)
      .execute(&fixture.pool)
      .await
      .unwrap();
  }
  sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$1")
    .bind(&fixture.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query(
    "UPDATE snapshots SET blob=$2,updated_at=updated_at + interval '1 millisecond' WHERE workspace_id=$1 AND guid=$1",
  )
  .bind(&fixture.workspace_id)
  .bind(complete_root.encode_update_v1().unwrap())
  .execute(&fixture.pool)
  .await
  .unwrap();
  let bounded = service(&fixture)
    .workspace_manifest(WorkspaceManifestRequestV1 {
      actor_user_id: fixture.member_user_id.clone(),
      workspace_id: fixture.workspace_id.clone(),
      cursor: None,
      limit: Some(100),
    })
    .await
    .unwrap();
  assert_eq!(bounded.entries.len(), source_count + 5);
  assert!(bounded.next_cursor.is_none());

  sqlx::query("DELETE FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_id=$3")
    .bind(&fixture.workspace_id)
    .bind(&live_doc_id)
    .bind(&fixture.direct_user_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  assert!(
    service(&fixture)
      .manifest(
        Some(&fixture.direct_user_id),
        SourceIdentity::CurrentDoc {
          workspace_id: fixture.workspace_id.clone(),
          doc_id: live_doc_id.clone(),
        },
      )
      .await
      .is_err()
  );
  assert_eq!(
    service(&fixture)
      .manifest(
        Some(&fixture.direct_user_id),
        SourceIdentity::CurrentDoc {
          workspace_id: fixture.workspace_id.clone(),
          doc_id: second_doc_id,
        },
      )
      .await
      .unwrap()
      .entries[0]
      .key,
    "completed-key"
  );

  let full_root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), "base", None).unwrap();
  let incomplete_delta = affine_doc_loader::add_doc_to_root_doc(full_root, "delta-only", None).unwrap();
  sqlx::query("DELETE FROM updates WHERE workspace_id=$1 AND guid=$1")
    .bind(&fixture.workspace_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  sqlx::query(
    "UPDATE snapshots SET blob=$2,updated_at=updated_at + interval '1 millisecond' WHERE workspace_id=$1 AND guid=$1",
  )
  .bind(&fixture.workspace_id)
  .bind(incomplete_delta)
  .execute(&fixture.pool)
  .await
  .unwrap();
  assert!(
    service(&fixture)
      .workspace_manifest(WorkspaceManifestRequestV1 {
        actor_user_id: fixture.member_user_id.clone(),
        workspace_id: fixture.workspace_id.clone(),
        cursor: None,
        limit: Some(100),
      })
      .await
      .is_err()
  );
  teardown(&fixture).await;
}

#[tokio::test]
async fn blob_stream_is_chunked_and_rechecks_acl_before_first_response_bytes() {
  use crate::runtime::object_storage::types::ObjectPutMetadata;

  let _guard = BLOB_ACCESS_TEST_LOCK.lock().await;
  let Some(fixture) = setup().await else {
    return;
  };
  let temp = tempfile::tempdir().unwrap();
  let config = serde_json::json!({
    "storages": {
      "blob.storage": {
        "provider": "fs",
        "bucket": "blobs",
        "config": { "path": temp.path() }
      }
    }
  });
  let storage = Arc::new(ObjectStorageService::from_config_json(&config.to_string()).unwrap());
  let body = vec![7_u8; STREAM_CHUNK_BYTES * 2 + 17];
  let locator = ObjectLocator::new(
    StorageScope::Blob,
    ObjectKey::new(format!("{}/completed-key", fixture.workspace_id)).unwrap(),
  );
  storage
    .put(
      &locator,
      body.clone(),
      ObjectPutMetadata {
        content_type: Some("image/png".to_string()),
        content_length: Some(body.len() as i64),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();
  sqlx::query("UPDATE blobs SET size=$3 WHERE workspace_id=$1 AND key=$2")
    .bind(&fixture.workspace_id)
    .bind("completed-key")
    .bind(body.len() as i32)
    .execute(&fixture.pool)
    .await
    .unwrap();
  let service = Arc::new(BlobAccessService::new(
    fixture.pool.clone(),
    storage.clone(),
    Deployment::Cloud,
    PermissionTelemetry::default(),
  ));
  let opened = service
    .open_read(
      Some(&fixture.direct_user_id),
      current(&fixture),
      "completed-key".to_string(),
    )
    .await
    .unwrap();
  let stream_id = Uuid::parse_str(&opened.stream_id).unwrap();
  sqlx::query("DELETE FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_id=$3")
    .bind(&fixture.workspace_id)
    .bind(&fixture.doc_id)
    .bind(&fixture.direct_user_id)
    .execute(&fixture.pool)
    .await
    .unwrap();
  assert!(service.read_chunk(stream_id).await.is_err());

  let opened = service
    .open_read(
      Some(&fixture.member_user_id),
      current(&fixture),
      "completed-key".to_string(),
    )
    .await
    .unwrap();
  let stream_id = Uuid::parse_str(&opened.stream_id).unwrap();
  let first = service.read_chunk(stream_id).await.unwrap();
  assert!(!first.done);
  sqlx::query(
    "UPDATE snapshots SET updated_at=updated_at + interval '1 millisecond' WHERE workspace_id=$1 AND guid=$2",
  )
  .bind(&fixture.workspace_id)
  .bind(&fixture.doc_id)
  .execute(&fixture.pool)
  .await
  .unwrap();
  storage.delete(&locator).await.unwrap();
  let error = match service.read_chunk(stream_id).await {
    Ok(_) => panic!("revoked stream must fail before object storage"),
    Err(error) => error,
  };
  assert_eq!(error.to_string(), "blob_source_changed");
  storage
    .put(
      &locator,
      body.clone(),
      ObjectPutMetadata {
        content_type: Some("image/png".to_string()),
        content_length: Some(body.len() as i64),
        checksum_crc32: None,
      },
    )
    .await
    .unwrap();

  let opened = service
    .open_read(
      Some(&fixture.member_user_id),
      current(&fixture),
      "completed-key".to_string(),
    )
    .await
    .unwrap();
  let stream_id = Uuid::parse_str(&opened.stream_id).unwrap();
  let mut streamed = Vec::new();
  loop {
    let chunk = service.read_chunk(stream_id).await.unwrap();
    assert!(chunk.body.len() <= STREAM_CHUNK_BYTES);
    streamed.extend_from_slice(&chunk.body);
    if chunk.done {
      break;
    }
  }
  assert_eq!(streamed, body);

  let opened = service
    .open_read(
      Some(&fixture.member_user_id),
      current(&fixture),
      "completed-key".to_string(),
    )
    .await
    .unwrap();
  let stream_id = Uuid::parse_str(&opened.stream_id).unwrap();
  service.age_stream(stream_id, Duration::from_secs(61)).await;
  service.start_stream_cleanup();
  tokio::time::sleep(Duration::from_millis(50)).await;
  let Err(error) = service.read_chunk(stream_id).await else {
    panic!("expired stream remained readable");
  };
  assert_eq!(error.to_string(), "blob_stream_not_found");
  teardown(&fixture).await;
}
