use std::sync::Arc;

use chrono::{Duration, Utc};
use server_db::{DbConfig, ServerDb};
use server_domain::events::NoopEventPublisher;
use server_domain::mcp::{CreateMcpCredentialParams, McpAccessMode, McpCredentialService, McpCredentialStatus};
use test_db_harness::pg::PgCluster;
use uuid::Uuid;

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

fn lease_test_db(cluster: &PgCluster) -> test_db_harness::pg::DbLease {
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load prisma migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure migrated template");
  cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn connect_test_db(url: &str, max_connections: u32) -> ServerDb {
  let mut cfg = DbConfig::new(url);
  cfg.max_connections = max_connections;
  ServerDb::connect(cfg).await.expect("connect server db")
}

async fn insert_user(db: &ServerDb, email: &str) -> String {
  let id = Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO users (id, name, email, registered, disabled, email_verified, created_at)
       VALUES ($1, 'Test User', $2, true, false, clock_timestamp(), clock_timestamp())"#,
  )
  .bind(&id)
  .bind(email)
  .execute(db.pool())
  .await
  .expect("insert user");
  id
}

async fn insert_workspace(db: &ServerDb, owner_id: &str) -> String {
  let ws_id = Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO workspaces (id, name, avatar_key, enable_ai, enable_doc_embedding, indexed, last_check_embeddings, created_at)
       VALUES ($1, 'Test Workspace', NULL, true, true, false, to_timestamp(0), clock_timestamp())"#,
  )
  .bind(&ws_id)
  .execute(db.pool())
  .await
  .expect("insert workspace");
  sqlx::query(
    r#"INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source, created_at, updated_at)
       VALUES ($1, $2, $3, 'owner', 'active', 'legacy', clock_timestamp(), clock_timestamp())"#,
  )
  .bind(Uuid::new_v4().to_string())
  .bind(&ws_id)
  .bind(owner_id)
  .execute(db.pool())
  .await
  .expect("insert owner member");
  ws_id
}

#[test]
fn mcp_concurrent_rotation_revoke_in_place_yjs_deltas_and_reserved_doc_guards() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 4).await;
    let user_id = insert_user(&db, "mcp-owner@example.com").await;
    let ws1 = insert_workspace(&db, &user_id).await;
    let ws2 = insert_workspace(&db, &user_id).await;

    let svc = McpCredentialService::new(db.clone(), Arc::new(NoopEventPublisher::default()));

    let created = svc
      .create(CreateMcpCredentialParams {
        user_id: user_id.clone(),
        workspace_id: ws1.clone(),
        name: "CLI Agent".to_owned(),
        access_mode: McpAccessMode::ReadOnly,
        expiration_days: 90,
      })
      .await
      .expect("create mcp credential");
    assert!(created.token.starts_with("aff_mcp_v1."));
    assert_eq!(created.credential.status, McpCredentialStatus::Active);

    let auth1 = svc.authenticate(&created.token, &ws1).await.expect("auth ws1");
    assert_eq!(auth1.access_mode, McpAccessMode::ReadOnly);
    assert!(svc.authenticate(&created.token, &ws2).await.is_err());

    // Concurrent dual rotate: exactly one succeeds.
    let (res_a, res_b) = tokio::join!(
      svc.rotate(&created.credential.id, &user_id, &ws1, 90),
      svc.rotate(&created.credential.id, &user_id, &ws1, 90),
    );
    let rotated = match (res_a, res_b) {
      (Ok(r), Err(_)) | (Err(_), Ok(r)) => r,
      (Ok(_), Ok(_)) => panic!("both concurrent rotations must not succeed"),
      (Err(e1), Err(e2)) => panic!("one rotation must succeed, got {e1} and {e2}"),
    };
    assert_eq!(rotated.credential.generation, 1);
    assert_eq!(rotated.credential.status, McpCredentialStatus::Rotating);
    let grace_end = rotated.credential.grace_ends_at.expect("grace_ends_at");
    let diff = grace_end - Utc::now();
    assert!(diff > Duration::hours(23) && diff <= Duration::hours(24) + Duration::minutes(1));

    // Both old and new tokens authenticate during grace window.
    assert!(svc.authenticate(&created.token, &ws1).await.is_ok());
    assert!(svc.authenticate(&rotated.token, &ws1).await.is_ok());

    // Concurrent rotate + revoke on the same family must never deadlock and revoke must leave zero live generations.
    let (rot2, rev) = tokio::join!(
      svc.rotate(&rotated.credential.id, &user_id, &ws1, 90),
      svc.revoke(&rotated.credential.id, &user_id, &ws1),
    );
    assert!(rev.expect("revoke succeeded"));
    if let Ok(r2) = rot2 {
      assert!(svc.authenticate(&r2.token, &ws1).await.is_err());
    }
    assert!(svc.authenticate(&created.token, &ws1).await.is_err());
    assert!(svc.authenticate(&rotated.token, &ws1).await.is_err());

    // Reserved docs are blocked on read/create/update/update_title.
    assert!(svc.read_document_markdown(&ws1, &ws1).await.is_err());
    assert!(
      svc
        .read_document_markdown(&ws1, &format!("db${ws1}$docProperties"))
        .await
        .is_err()
    );
    assert!(svc.update_document(&ws1, &ws1, "evil", &user_id).await.is_err());
    assert!(svc.update_document_title(&ws1, &ws1, "evil", &user_id).await.is_err());

    // Create doc strips leading H1, registers in workspace_pages and rootDoc.
    let doc_id = svc
      .create_document(&ws1, "Doc Title", "# Duplicate Title\n\nFirst body", &user_id, None)
      .await
      .expect("create doc");
    let page_title: String =
      sqlx::query_scalar("SELECT title FROM workspace_pages WHERE workspace_id = $1 AND page_id = $2")
        .bind(&ws1)
        .bind(&doc_id)
        .fetch_one(db.pool())
        .await
        .expect("workspace_pages row");
    assert_eq!(page_title, "Doc Title");
    let root_snap: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
        .bind(&ws1)
        .bind(&ws1)
        .fetch_optional(db.pool())
        .await
        .expect("root doc exists");
    assert!(root_snap.is_some(), "rootDoc must be populated on create_document");

    // Inject an affine:surface canvas block into the doc via updates to prove in-place title/body
    // updates append incremental deltas and NEVER destroy non-note canvas blocks.
    let snap_blob: Vec<u8> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&doc_id)
      .fetch_one(db.pool())
      .await
      .expect("load snap");
    let sv0 = y_octo::encode_state_vector_from_update_v1(&snap_blob).expect("sv0");
    let ydoc = y_octo::Doc::try_from_binary_v1(&snap_blob).expect("decode ydoc");
    let mut blocks = ydoc.get_or_create_map("blocks").expect("blocks");
    let mut surface = ydoc.create_map().expect("surface map");
    surface
      .insert("sys:id".to_owned(), y_octo::Any::String("surface:1".to_owned()))
      .unwrap();
    surface
      .insert(
        "sys:flavour".to_owned(),
        y_octo::Any::String("affine:surface".to_owned()),
      )
      .unwrap();
    blocks.insert("surface:1".to_owned(), surface).unwrap();
    let surface_delta = y_octo::diff_update_v1(&ydoc.encode_update_v1().unwrap(), &sv0).unwrap();
    sqlx::query(
      "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, clock_timestamp(), $4)",
    )
    .bind(&ws1)
    .bind(&doc_id)
    .bind(&surface_delta)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("insert surface update");

    // In-place update_document_title appends to updates and preserves surface:1.
    assert!(
      svc
        .update_document_title(&ws1, &doc_id, "Renamed Title", &user_id)
        .await
        .expect("update title")
    );
    let update_count: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM updates WHERE workspace_id = $1 AND guid = $2")
        .bind(&ws1)
        .bind(&doc_id)
        .fetch_one(db.pool())
        .await
        .expect("count updates");
    assert_eq!(update_count, 2, "title update must append incremental delta to updates");

    // In-place update_document appends to updates and preserves both Renamed Title and surface:1.
    assert!(
      svc
        .update_document(&ws1, &doc_id, "## Section\n\n- bullet item", &user_id)
        .await
        .expect("update body")
    );
    let md = svc
      .read_document_markdown(&ws1, &doc_id)
      .await
      .expect("read md")
      .expect("doc present");
    assert!(md.contains("# Renamed Title"));
    assert!(md.contains("bullet item"));

    // Verify surface:1 still exists after merging snapshot + all appended updates.
    let all_updates: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(&ws1)
        .bind(&doc_id)
        .fetch_all(db.pool())
        .await
        .expect("load updates");
    let mut parts = vec![snap_blob];
    parts.extend(all_updates);
    let merged = y_octo::merge_updates_v1(&parts).unwrap().encode_v1().unwrap();
    let final_doc = y_octo::Doc::try_from_binary_v1(&merged).unwrap();
    let final_blocks = final_doc.get_or_create_map("blocks").unwrap();
    assert!(
      final_blocks.get("surface:1").is_some(),
      "affine:surface canvas block must survive MCP body & title updates"
    );

    // recoverDocCreation (create_document with explicit docId) must NOT overwrite existing content.
    let recovered_id = svc
      .create_document(&ws1, "Should Not Overwrite", "Overwritten Body", &user_id, Some(&doc_id))
      .await
      .expect("recover doc creation");
    assert_eq!(recovered_id, doc_id);
    let after_recover = svc
      .read_document_markdown(&ws1, &doc_id)
      .await
      .expect("read after recover")
      .expect("doc exists");
    assert!(after_recover.contains("bullet item"));
    assert!(!after_recover.contains("Overwritten Body"));

    // Verify rootDoc createDate is Float64 (not BigInt64) and docProperties uses top-level doc_id map
    // without updatedDate, and recoverDocCreation by another actor preserves original createdBy/updatedBy.
    let root_bytes = root_snap.expect("root snap");
    let root_doc = y_octo::Doc::try_from_binary_v1(&root_bytes).expect("decode rootDoc");
    let root_meta = root_doc.get_or_create_map("meta").expect("meta");
    let y_octo::Value::Array(root_pages) = root_meta.get("pages").expect("pages") else {
      panic!("expected Y.Array for meta.pages");
    };
    let y_octo::Value::Map(first_page) = root_pages.get(0).expect("first page") else {
      panic!("expected Y.Map for page entry");
    };
    assert!(
      matches!(first_page.get("createDate"), Some(y_octo::Value::Any(y_octo::Any::Float64(_)))),
      "createDate must be Any::Float64"
    );

    let other_actor = insert_user(&db, "mcp-recover-other@example.com").await;
    svc
      .create_document(&ws1, "Other Recover", "Ignored", &other_actor, Some(&doc_id))
      .await
      .expect("recover by other actor");
    let props_id = format!("db${ws1}$docProperties");
    let props_snap: Vec<u8> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&props_id)
      .fetch_one(db.pool())
      .await
      .expect("docProperties snap");
    let props_upds: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(&ws1)
        .bind(&props_id)
        .fetch_all(db.pool())
        .await
        .expect("docProperties updates");
    let mut p_parts = vec![props_snap];
    p_parts.extend(props_upds);
    let p_merged = y_octo::merge_updates_v1(&p_parts).unwrap().encode_v1().unwrap();
    let p_doc = y_octo::Doc::try_from_binary_v1(&p_merged).expect("decode docProperties");
    let top_entry = p_doc.get_or_create_map(&doc_id).expect("top-level doc_id map");
    assert_eq!(
      top_entry.get("createdBy"),
      Some(y_octo::Value::Any(y_octo::Any::String(user_id.clone())))
    );
    assert_eq!(
      top_entry.get("updatedBy"),
      Some(y_octo::Value::Any(y_octo::Any::String(user_id.clone())))
    );
    assert!(top_entry.get("updatedDate").is_none());

    // D3-R1: structured in-place update preserves affine:image, nested affine:list, unchanged paragraph, and 2nd note.
    let rich_doc_id = Uuid::new_v4().to_string();
    let rich_blob = {
      let d = y_octo::Doc::new();
      let mut bm = d.get_or_create_map("blocks").unwrap();
      let mut pg = d.create_map().unwrap();
      pg.insert("sys:id".to_owned(), y_octo::Any::String("page:r".to_owned())).unwrap();
      pg.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".to_owned())).unwrap();
      let mut t = d.create_text().unwrap();
      t.insert(0, "Rich Doc").unwrap();
      pg.insert("prop:title".to_owned(), t).unwrap();
      let mut pc = d.create_array().unwrap();
      pc.insert(0, y_octo::Any::String("note:primary".to_owned())).unwrap();
      pc.insert(1, y_octo::Any::String("note:secondary".to_owned())).unwrap();
      pg.insert("sys:children".to_owned(), pc).unwrap();
      bm.insert("page:r".to_owned(), pg).unwrap();

      let make_text = |d: &y_octo::Doc, s: &str| {
        let mut yt = d.create_text().unwrap();
        yt.insert(0, s).unwrap();
        yt
      };
      let mut p1 = d.create_map().unwrap();
      p1.insert("sys:id".to_owned(), y_octo::Any::String("blk:p1".to_owned())).unwrap();
      p1.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      p1.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      p1.insert("prop:text".to_owned(), make_text(&d, "Keep Me")).unwrap();
      p1.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("blk:p1".to_owned(), p1).unwrap();

      let mut img = d.create_map().unwrap();
      img.insert("sys:id".to_owned(), y_octo::Any::String("blk:img".to_owned())).unwrap();
      img.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:image".to_owned())).unwrap();
      img.insert("prop:sourceId".to_owned(), y_octo::Any::String("blob-img-1".to_owned())).unwrap();
      img.insert("prop:caption".to_owned(), y_octo::Any::String("Diagram".to_owned())).unwrap();
      img.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("blk:img".to_owned(), img).unwrap();

      let mut child_li = d.create_map().unwrap();
      child_li.insert("sys:id".to_owned(), y_octo::Any::String("blk:li-child".to_owned())).unwrap();
      child_li.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".to_owned())).unwrap();
      child_li.insert("prop:type".to_owned(), y_octo::Any::String("bulleted".to_owned())).unwrap();
      child_li.insert("prop:text".to_owned(), make_text(&d, "Nested")).unwrap();
      child_li.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("blk:li-child".to_owned(), child_li).unwrap();

      let mut parent_li = d.create_map().unwrap();
      parent_li.insert("sys:id".to_owned(), y_octo::Any::String("blk:li-parent".to_owned())).unwrap();
      parent_li.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".to_owned())).unwrap();
      parent_li.insert("prop:type".to_owned(), y_octo::Any::String("bulleted".to_owned())).unwrap();
      parent_li.insert("prop:text".to_owned(), make_text(&d, "Top")).unwrap();
      let mut lc = d.create_array().unwrap();
      lc.insert(0, y_octo::Any::String("blk:li-child".to_owned())).unwrap();
      parent_li.insert("sys:children".to_owned(), lc).unwrap();
      bm.insert("blk:li-parent".to_owned(), parent_li).unwrap();

      let mut p2 = d.create_map().unwrap();
      p2.insert("sys:id".to_owned(), y_octo::Any::String("blk:p2".to_owned())).unwrap();
      p2.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      p2.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      p2.insert("prop:text".to_owned(), make_text(&d, "Change Me")).unwrap();
      p2.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("blk:p2".to_owned(), p2).unwrap();

      let mut n1 = d.create_map().unwrap();
      n1.insert("sys:id".to_owned(), y_octo::Any::String("note:primary".to_owned())).unwrap();
      n1.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
      let mut n1c = d.create_array().unwrap();
      for (i, cid) in ["blk:p1", "blk:img", "blk:li-parent", "blk:p2"].iter().enumerate() {
        n1c.insert(i as u64, y_octo::Any::String((*cid).to_owned())).unwrap();
      }
      n1.insert("sys:children".to_owned(), n1c).unwrap();
      bm.insert("note:primary".to_owned(), n1).unwrap();

      let mut n2 = d.create_map().unwrap();
      n2.insert("sys:id".to_owned(), y_octo::Any::String("note:secondary".to_owned())).unwrap();
      n2.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
      n2.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("note:secondary".to_owned(), n2).unwrap();

      d.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4)",
    )
    .bind(&ws1)
    .bind(&rich_doc_id)
    .bind(&rich_blob)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("insert rich doc");

    let rich_md = svc.read_document_markdown(&ws1, &rich_doc_id).await.unwrap().unwrap();
    let pos_p1 = rich_md.find("Keep Me").unwrap();
    let pos_img = rich_md.find("![Diagram](blob-img-1)").unwrap();
    let pos_top = rich_md.find("- Top").unwrap();
    let pos_nested = rich_md.find("  - Nested").unwrap();
    let pos_p2 = rich_md.find("Change Me").unwrap();
    assert!(pos_p1 < pos_img && pos_img < pos_top && pos_top < pos_nested && pos_nested < pos_p2);

    svc
      .update_document(&ws1, &rich_doc_id, "Keep Me\n\n- Top\n  - Nested\n\nUpdated Paragraph", &user_id)
      .await
      .expect("update rich doc");
    let rich_upds: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(&ws1)
        .bind(&rich_doc_id)
        .fetch_all(db.pool())
        .await
        .unwrap();
    let mut r_parts = vec![rich_blob];
    r_parts.extend(rich_upds);
    let r_merged = y_octo::merge_updates_v1(&r_parts).unwrap().encode_v1().unwrap();
    let r_doc = y_octo::Doc::try_from_binary_v1(&r_merged).unwrap();
    let r_blocks = r_doc.get_or_create_map("blocks").unwrap();
    assert!(r_blocks.get("blk:p1").is_some(), "unchanged paragraph block_id preserved");
    assert!(r_blocks.get("blk:img").is_some(), "opaque image block_id preserved");
    assert!(r_blocks.get("blk:li-parent").is_some(), "nested list parent block_id preserved");
    assert!(r_blocks.get("blk:li-child").is_some(), "nested list child block_id preserved");
    assert!(r_blocks.get("note:secondary").is_some(), "secondary note preserved");

    // D3-R2: malformed rootDoc meta.pages (Any::Array instead of Y.Array) must error without overwriting.
    let bad_ws = insert_workspace(&db, &user_id).await;
    let bad_root = {
      let d = y_octo::Doc::new();
      let mut m = d.get_or_create_map("meta").unwrap();
      m.insert(
        "pages".to_owned(),
        y_octo::Any::Array(vec![y_octo::Any::String("bad".to_owned())]),
      )
      .unwrap();
      d.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $1, $2, octet_length($2), clock_timestamp(), clock_timestamp(), $3, $3)",
    )
    .bind(&bad_ws)
    .bind(&bad_root)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("seed malformed rootDoc");
    let malformed_err = svc.create_document(&bad_ws, "Should Fail", "Body", &user_id, None).await;
    assert!(matches!(malformed_err, Err(server_types::DomainError::Validation(_))));

    // D3-R3: lifecycle activation skips writing rootDoc on create_document and update_document_title.
    let lc_ws = insert_workspace(&db, &user_id).await;
    sqlx::query(
      r#"CREATE TABLE IF NOT EXISTS storage_reconciliation_checkpoints (
           kind TEXT NOT NULL,
           scope TEXT NOT NULL,
           status TEXT NOT NULL,
           cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
           metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
           created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
           PRIMARY KEY (kind, scope)
         )"#,
    )
    .execute(db.pool())
    .await
    .expect("ensure checkpoints table");
    sqlx::query(
      r#"INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, cursor, metadata, created_at, updated_at)
         VALUES ('workspace_doc_lifecycle_activation', 'global', 'active', '{}'::jsonb, '{"protocolVersion":2}'::jsonb, clock_timestamp(), clock_timestamp())
         ON CONFLICT (kind, scope) DO UPDATE SET status = 'active', updated_at = clock_timestamp()"#,
    )
    .execute(db.pool())
    .await
    .expect("activate lifecycle");
    let lc_doc = svc.create_document(&lc_ws, "LC Doc", "Body", &user_id, None).await.expect("create lc doc");
    svc.update_document_title(&lc_ws, &lc_doc, "LC Renamed", &user_id).await.expect("rename lc doc");
    let lc_root: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $1")
        .bind(&lc_ws)
        .fetch_optional(db.pool())
        .await
        .unwrap();
    assert!(lc_root.is_none(), "active lifecycle must skip rootDoc writes");

    // Round 5: recoverDocCreation exact v0.27.5 creator/editor alignment (runtime_doc_creators + snapshots/updates).
    sqlx::query(
      r#"CREATE TABLE IF NOT EXISTS runtime_doc_creators (
           workspace_id TEXT NOT NULL,
           doc_id TEXT NOT NULL,
           created_by TEXT,
           created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
           PRIMARY KEY (workspace_id, doc_id)
         )"#,
    )
    .execute(db.pool())
    .await
    .expect("ensure runtime_doc_creators");
    let author_a = insert_user(&db, "mcp-author-a@example.com").await;
    let author_b = insert_user(&db, "mcp-author-b@example.com").await;
    let author_c = insert_user(&db, "mcp-author-c@example.com").await;
    let recover_actor = insert_user(&db, "mcp-recover-actor@example.com").await;
    let doc_authored = Uuid::new_v4().to_string();
    let doc_anon = Uuid::new_v4().to_string();
    let minimal_doc = {
      let d = y_octo::Doc::new();
      let mut bm = d.get_or_create_map("blocks").unwrap();
      let mut pg = d.create_map().unwrap();
      pg.insert("sys:id".to_owned(), y_octo::Any::String("page:0".to_owned())).unwrap();
      pg.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".to_owned())).unwrap();
      let mut t = d.create_text().unwrap();
      t.insert(0, "Orphan Doc").unwrap();
      pg.insert("prop:title".to_owned(), t).unwrap();
      pg.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("page:0".to_owned(), pg).unwrap();
      d.encode_update_v1().unwrap()
    };
    // Scenario A: runtime_doc_creators = UserA, snapshot updated_by = UserB (t-10s), latest update = UserC (now), actor = UserD.
    sqlx::query("INSERT INTO runtime_doc_creators (workspace_id, doc_id, created_by) VALUES ($1, $2, $3)")
      .bind(&ws1)
      .bind(&doc_authored)
      .bind(&author_a)
      .execute(db.pool())
      .await
      .expect("seed runtime_doc_creators A");
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp() - interval '10 seconds', clock_timestamp() - interval '10 seconds', $4, $4)",
    )
    .bind(&ws1)
    .bind(&doc_authored)
    .bind(&minimal_doc)
    .bind(&author_b)
    .execute(db.pool())
    .await
    .expect("seed snapshot A");
    sqlx::query(
      "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, clock_timestamp(), $4)",
    )
    .bind(&ws1)
    .bind(&doc_authored)
    .bind(&minimal_doc)
    .bind(&author_c)
    .execute(db.pool())
    .await
    .expect("seed update A");

    // Scenario B: runtime_doc_creators = NULL, snapshot created_by = UserB / updated_by = NULL, update = NULL.
    sqlx::query("INSERT INTO runtime_doc_creators (workspace_id, doc_id, created_by) VALUES ($1, $2, NULL)")
      .bind(&ws1)
      .bind(&doc_anon)
      .execute(db.pool())
      .await
      .expect("seed runtime_doc_creators B");
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp() - interval '10 seconds', clock_timestamp() - interval '10 seconds', $4, NULL)",
    )
    .bind(&ws1)
    .bind(&doc_anon)
    .bind(&minimal_doc)
    .bind(&author_b)
    .execute(db.pool())
    .await
    .expect("seed snapshot B");
    sqlx::query(
      "INSERT INTO updates (workspace_id, guid, blob, created_at, created_by) VALUES ($1, $2, $3, clock_timestamp(), NULL)",
    )
    .bind(&ws1)
    .bind(&doc_anon)
    .bind(&minimal_doc)
    .execute(db.pool())
    .await
    .expect("seed update B");

    svc
      .create_document(&ws1, "Ignored", "Ignored", &recover_actor, Some(&doc_authored))
      .await
      .expect("recover authored doc");
    svc
      .create_document(&ws1, "Ignored", "Ignored", &recover_actor, Some(&doc_anon))
      .await
      .expect("recover anon doc");
    let props_snap2: Vec<u8> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&props_id)
      .fetch_one(db.pool())
      .await
      .expect("reload props snap");
    let props_upds2: Vec<Vec<u8>> =
      sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
        .bind(&ws1)
        .bind(&props_id)
        .fetch_all(db.pool())
        .await
        .expect("reload props updates");
    let mut p2_parts = vec![props_snap2];
    p2_parts.extend(props_upds2);
    let p2_doc =
      y_octo::Doc::try_from_binary_v1(y_octo::merge_updates_v1(&p2_parts).unwrap().encode_v1().unwrap()).unwrap();
    let authored_entry = p2_doc.get_or_create_map(&doc_authored).unwrap();
    assert_eq!(authored_entry.get("createdBy"), Some(y_octo::Value::Any(y_octo::Any::String(author_a))));
    assert_eq!(authored_entry.get("updatedBy"), Some(y_octo::Value::Any(y_octo::Any::String(author_c))));
    let anon_entry = p2_doc.get_or_create_map(&doc_anon).unwrap();
    assert!(anon_entry.get("createdBy").is_none(), "NULL runtime_doc_creators must not fall back to snapshots.created_by");
    assert!(anon_entry.get("updatedBy").is_none(), "NULL authors must not fabricate updatedBy");

    // Round 5: bijective leading-backslash escaping for text paragraph starting with "## Memo".
    let esc_doc_id = Uuid::new_v4().to_string();
    let esc_blob = {
      let d = y_octo::Doc::new();
      let mut bm = d.get_or_create_map("blocks").unwrap();
      let make_text = |d: &y_octo::Doc, s: &str| {
        let mut yt = d.create_text().unwrap();
        yt.insert(0, s).unwrap();
        yt
      };
      let mut pg = d.create_map().unwrap();
      pg.insert("sys:id".to_owned(), y_octo::Any::String("page:e".to_owned())).unwrap();
      pg.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".to_owned())).unwrap();
      pg.insert("prop:title".to_owned(), make_text(&d, "Esc Doc")).unwrap();
      let mut pc = d.create_array().unwrap();
      pc.insert(0, y_octo::Any::String("note:e".to_owned())).unwrap();
      pg.insert("sys:children".to_owned(), pc).unwrap();
      bm.insert("page:e".to_owned(), pg).unwrap();

      let mut p = d.create_map().unwrap();
      p.insert("sys:id".to_owned(), y_octo::Any::String("b:esc".to_owned())).unwrap();
      p.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      p.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      p.insert("prop:text".to_owned(), make_text(&d, "## Memo")).unwrap();
      p.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:esc".to_owned(), p).unwrap();

      let mut n = d.create_map().unwrap();
      n.insert("sys:id".to_owned(), y_octo::Any::String("note:e".to_owned())).unwrap();
      n.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
      let mut nc = d.create_array().unwrap();
      nc.insert(0, y_octo::Any::String("b:esc".to_owned())).unwrap();
      n.insert("sys:children".to_owned(), nc).unwrap();
      bm.insert("note:e".to_owned(), n).unwrap();
      d.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4)",
    )
    .bind(&ws1)
    .bind(&esc_doc_id)
    .bind(&esc_blob)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("seed esc doc");
    let esc_md = svc.read_document_markdown(&ws1, &esc_doc_id).await.unwrap().unwrap();
    assert!(esc_md.contains("\\## Memo"), "expected escaped markdown, got: {esc_md}");
    let esc_body = esc_md.strip_prefix("# Esc Doc\n\n").unwrap();
    svc.update_document(&ws1, &esc_doc_id, esc_body, &user_id).await.unwrap();
    let esc_upds: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM updates WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&esc_doc_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(esc_upds, 0, "escaped text paragraph roundtrip must produce 0 updates");

    // Round 5 (D3-R6): O(N) 2,000-item list rewrite finishes < 500ms and size guard rejects >1 MiB.
    let old_2k: String = (0..2000).map(|i| format!("- Old {i}")).collect::<Vec<_>>().join("\n");
    let new_2k: String = (0..2000).map(|i| format!("- New {i}")).collect::<Vec<_>>().join("\n");
    let perf_doc = svc.create_document(&ws1, "Perf 2k", &old_2k, &user_id, None).await.expect("create 2k doc");
    let t0 = std::time::Instant::now();
    svc.update_document(&ws1, &perf_doc, &new_2k, &user_id).await.expect("update 2k doc");
    let elapsed = t0.elapsed();
    assert!(elapsed < std::time::Duration::from_millis(500), "2k rewrite took {elapsed:?} >= 500ms");
    let perf_md = svc.read_document_markdown(&ws1, &perf_doc).await.unwrap().unwrap();
    assert!(perf_md.contains("- New 0") && perf_md.contains("- New 1999") && !perf_md.contains("- Old 0"));
    let oversized = "a".repeat(1_048_577);
    assert!(matches!(
      svc.update_document(&ws1, &perf_doc, &oversized, &user_id).await,
      Err(server_types::DomainError::Validation(_))
    ));

    // Round 6: 32-level list nesting succeeds (exact 32-level chain), 33-level atomically rejected without mutating doc.
    let nested_md = |depth: usize| -> String {
      (0..depth)
        .map(|d| format!("{}- Level {d}", "  ".repeat(d)))
        .collect::<Vec<_>>()
        .join("\n")
    };
    let nest_32_doc = svc
      .create_document(&ws1, "Nest 32", &nested_md(32), &user_id, None)
      .await
      .expect("32-level nested list must succeed");
    let snap_32: Vec<u8> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&nest_32_doc)
      .fetch_one(db.pool())
      .await
      .unwrap();
    let d32 = y_octo::Doc::try_from_binary_v1(&snap_32).unwrap();
    let b32 = d32.get_or_create_map("blocks").unwrap();
    let mut cur = match b32.get("note:0") {
      Some(y_octo::Value::Map(m)) => match m.get("sys:children") {
        Some(y_octo::Value::Array(a)) => match a.get(0) {
          Some(y_octo::Value::Any(y_octo::Any::String(s))) => Some(s),
          _ => None,
        },
        _ => None,
      },
      _ => None,
    };
    let mut chain_len = 0usize;
    while let Some(id) = cur {
      chain_len += 1;
      cur = match b32.get(&id) {
        Some(y_octo::Value::Map(m)) => match m.get("sys:children") {
          Some(y_octo::Value::Array(a)) => match a.get(0) {
            Some(y_octo::Value::Any(y_octo::Any::String(s))) => Some(s),
            _ => None,
          },
          _ => None,
        },
        _ => None,
      };
    }
    assert_eq!(chain_len, 32, "32-level nested list must persist exact 32-level chain");
    assert!(matches!(
      svc.create_document(&ws1, "Nest 33", &nested_md(33), &user_id, None).await,
      Err(server_types::DomainError::Validation(_))
    ));
    let before_md_32 = svc.read_document_markdown(&ws1, &nest_32_doc).await.unwrap().unwrap();
    let before_upds_32: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM updates WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&nest_32_doc)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert!(matches!(
      svc.update_document(&ws1, &nest_32_doc, &nested_md(33), &user_id).await,
      Err(server_types::DomainError::Validation(_))
    ));
    let after_upds_32: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM updates WHERE workspace_id = $1 AND guid = $2")
      .bind(&ws1)
      .bind(&nest_32_doc)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(after_upds_32, before_upds_32, "rejected 33-level update must not write updates");
    assert_eq!(
      svc.read_document_markdown(&ws1, &nest_32_doc).await.unwrap().unwrap(),
      before_md_32
    );

    // Round 4: strict isomorphic read/write invariant (3 rounds produce 0 new updates).
    let iso_doc_id = Uuid::new_v4().to_string();
    let iso_blob = {
      let d = y_octo::Doc::new();
      let mut bm = d.get_or_create_map("blocks").unwrap();
      let make_text = |d: &y_octo::Doc, s: &str| {
        let mut yt = d.create_text().unwrap();
        yt.insert(0, s).unwrap();
        yt
      };
      let mut pg = d.create_map().unwrap();
      pg.insert("sys:id".to_owned(), y_octo::Any::String("page:i".to_owned())).unwrap();
      pg.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".to_owned())).unwrap();
      pg.insert("prop:title".to_owned(), make_text(&d, "Iso Doc")).unwrap();
      let mut pc = d.create_array().unwrap();
      pc.insert(0, y_octo::Any::String("note:1".to_owned())).unwrap();
      pc.insert(1, y_octo::Any::String("note:2".to_owned())).unwrap();
      pg.insert("sys:children".to_owned(), pc).unwrap();
      bm.insert("page:i".to_owned(), pg).unwrap();

      // Editable h2
      let mut h2 = d.create_map().unwrap();
      h2.insert("sys:id".to_owned(), y_octo::Any::String("b:h2".to_owned())).unwrap();
      h2.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      h2.insert("prop:type".to_owned(), y_octo::Any::String("h2".to_owned())).unwrap();
      h2.insert("prop:text".to_owned(), make_text(&d, "Heading")).unwrap();
      h2.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:h2".to_owned(), h2).unwrap();

      // Opaque paragraph with indented child paragraph
      let mut p_child = d.create_map().unwrap();
      p_child.insert("sys:id".to_owned(), y_octo::Any::String("b:pchild".to_owned())).unwrap();
      p_child.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      p_child.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      p_child.insert("prop:text".to_owned(), make_text(&d, "Indented child")).unwrap();
      p_child.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:pchild".to_owned(), p_child).unwrap();
      let mut p_parent = d.create_map().unwrap();
      p_parent.insert("sys:id".to_owned(), y_octo::Any::String("b:pparent".to_owned())).unwrap();
      p_parent.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      p_parent.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      p_parent.insert("prop:text".to_owned(), make_text(&d, "Parent with child")).unwrap();
      let mut ppc = d.create_array().unwrap();
      ppc.insert(0, y_octo::Any::String("b:pchild".to_owned())).unwrap();
      p_parent.insert("sys:children".to_owned(), ppc).unwrap();
      bm.insert("b:pparent".to_owned(), p_parent).unwrap();

      // Opaque callout with inner paragraph + opaque database
      let mut c_inner = d.create_map().unwrap();
      c_inner.insert("sys:id".to_owned(), y_octo::Any::String("b:cinner".to_owned())).unwrap();
      c_inner.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".to_owned())).unwrap();
      c_inner.insert("prop:type".to_owned(), y_octo::Any::String("text".to_owned())).unwrap();
      c_inner.insert("prop:text".to_owned(), make_text(&d, "Callout inner")).unwrap();
      c_inner.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:cinner".to_owned(), c_inner).unwrap();
      let mut callout = d.create_map().unwrap();
      callout.insert("sys:id".to_owned(), y_octo::Any::String("b:callout".to_owned())).unwrap();
      callout.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:callout".to_owned())).unwrap();
      let mut cc = d.create_array().unwrap();
      cc.insert(0, y_octo::Any::String("b:cinner".to_owned())).unwrap();
      callout.insert("sys:children".to_owned(), cc).unwrap();
      bm.insert("b:callout".to_owned(), callout).unwrap();

      let mut db_blk = d.create_map().unwrap();
      db_blk.insert("sys:id".to_owned(), y_octo::Any::String("b:db".to_owned())).unwrap();
      db_blk.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:database".to_owned())).unwrap();
      db_blk.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:db".to_owned(), db_blk).unwrap();

      // Editable checked todo list with nested unchecked todo, code, divider
      let mut t_sub = d.create_map().unwrap();
      t_sub.insert("sys:id".to_owned(), y_octo::Any::String("b:tsub".to_owned())).unwrap();
      t_sub.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".to_owned())).unwrap();
      t_sub.insert("prop:type".to_owned(), y_octo::Any::String("todo".to_owned())).unwrap();
      t_sub.insert("prop:checked".to_owned(), y_octo::Any::False).unwrap();
      t_sub.insert("prop:text".to_owned(), make_text(&d, "Sub todo")).unwrap();
      t_sub.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:tsub".to_owned(), t_sub).unwrap();

      let mut t_top = d.create_map().unwrap();
      t_top.insert("sys:id".to_owned(), y_octo::Any::String("b:ttop".to_owned())).unwrap();
      t_top.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".to_owned())).unwrap();
      t_top.insert("prop:type".to_owned(), y_octo::Any::String("todo".to_owned())).unwrap();
      t_top.insert("prop:checked".to_owned(), y_octo::Any::True).unwrap();
      t_top.insert("prop:text".to_owned(), make_text(&d, "Done item")).unwrap();
      let mut tc = d.create_array().unwrap();
      tc.insert(0, y_octo::Any::String("b:tsub".to_owned())).unwrap();
      t_top.insert("sys:children".to_owned(), tc).unwrap();
      bm.insert("b:ttop".to_owned(), t_top).unwrap();

      let mut code = d.create_map().unwrap();
      code.insert("sys:id".to_owned(), y_octo::Any::String("b:code".to_owned())).unwrap();
      code.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:code".to_owned())).unwrap();
      code.insert("prop:language".to_owned(), y_octo::Any::String("rust".to_owned())).unwrap();
      code.insert("prop:text".to_owned(), make_text(&d, "fn main() {}")).unwrap();
      code.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:code".to_owned(), code).unwrap();

      let mut div = d.create_map().unwrap();
      div.insert("sys:id".to_owned(), y_octo::Any::String("b:div".to_owned())).unwrap();
      div.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:divider".to_owned())).unwrap();
      div.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("b:div".to_owned(), div).unwrap();

      let mut n1 = d.create_map().unwrap();
      n1.insert("sys:id".to_owned(), y_octo::Any::String("note:1".to_owned())).unwrap();
      n1.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
      let mut n1c = d.create_array().unwrap();
      for (i, cid) in ["b:h2", "b:pparent", "b:callout", "b:db", "b:ttop", "b:code", "b:div"].iter().enumerate() {
        n1c.insert(i as u64, y_octo::Any::String((*cid).to_owned())).unwrap();
      }
      n1.insert("sys:children".to_owned(), n1c).unwrap();
      bm.insert("note:1".to_owned(), n1).unwrap();

      let mut n2 = d.create_map().unwrap();
      n2.insert("sys:id".to_owned(), y_octo::Any::String("note:2".to_owned())).unwrap();
      n2.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
      n2.insert("sys:children".to_owned(), d.create_array().unwrap()).unwrap();
      bm.insert("note:2".to_owned(), n2).unwrap();
      d.encode_update_v1().unwrap()
    };
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4)",
    )
    .bind(&ws1)
    .bind(&iso_doc_id)
    .bind(&iso_blob)
    .bind(&user_id)
    .execute(db.pool())
    .await
    .expect("seed iso doc");

    for round in 0..3 {
      let md_out = svc.read_document_markdown(&ws1, &iso_doc_id).await.unwrap().unwrap();
      assert!(md_out.contains("- [x] Done item"), "checked todo preserved on read");
      assert!(!md_out.contains("Callout inner"), "opaque callout inner must not leak");
      assert!(!md_out.contains("Indented child"), "opaque paragraph child must not leak");
      let body_only = md_out.strip_prefix("# Iso Doc\n\n").unwrap_or(&md_out);
      svc.update_document(&ws1, &iso_doc_id, body_only, &user_id).await.unwrap();
      let upd_cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM updates WHERE workspace_id = $1 AND guid = $2")
        .bind(&ws1)
        .bind(&iso_doc_id)
        .fetch_one(db.pool())
        .await
        .unwrap();
      assert_eq!(upd_cnt, 0, "round {round} read->write must produce empty delta");
    }

    db.pool().close().await;
  });
}

#[test]
fn mcp_cyclic_and_deep_block_graphs_never_overflow_2mb_stack() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let handle = std::thread::Builder::new()
    .name("mcp-2mb-stack-guard".to_owned())
    .stack_size(2 * 1024 * 1024)
    .spawn(move || {
      let rt = test_runtime();
      rt.block_on(async {
        let db = connect_test_db(&db_url, 2).await;
        let user_id = insert_user(&db, "mcp-cycle@example.com").await;
        let ws = insert_workspace(&db, &user_id).await;
        let svc = McpCredentialService::new(db.clone(), Arc::new(NoopEventPublisher::default()));

        let build_graph = |kind: &str| -> Vec<u8> {
          let d = y_octo::Doc::new();
          let mut bm = d.get_or_create_map("blocks").unwrap();
          let mut pg = d.create_map().unwrap();
          pg.insert("sys:id".to_owned(), y_octo::Any::String("page:0".to_owned())).unwrap();
          pg.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".to_owned())).unwrap();
          let mut t = d.create_text().unwrap();
          t.insert(0, kind).unwrap();
          pg.insert("prop:title".to_owned(), t).unwrap();
          let mut pc = d.create_array().unwrap();
          pc.insert(0, y_octo::Any::String("note:0".to_owned())).unwrap();
          pg.insert("sys:children".to_owned(), pc).unwrap();
          bm.insert("page:0".to_owned(), pg).unwrap();

          let mut n0 = d.create_map().unwrap();
          n0.insert("sys:id".to_owned(), y_octo::Any::String("note:0".to_owned())).unwrap();
          n0.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:note".to_owned())).unwrap();
          let mut nc = d.create_array().unwrap();
          nc.insert(0, y_octo::Any::String("n:0".to_owned())).unwrap();
          n0.insert("sys:children".to_owned(), nc).unwrap();
          bm.insert("note:0".to_owned(), n0).unwrap();

          let add_list = |d: &y_octo::Doc, bm: &mut y_octo::Map, id: &str, child: Option<&str>| {
            let mut m = d.create_map().unwrap();
            m.insert("sys:id".to_owned(), y_octo::Any::String(id.to_owned())).unwrap();
            m.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".to_owned())).unwrap();
            m.insert("prop:type".to_owned(), y_octo::Any::String("bulleted".to_owned())).unwrap();
            let mut yt = d.create_text().unwrap();
            yt.insert(0, id).unwrap();
            m.insert("prop:text".to_owned(), yt).unwrap();
            let mut c = d.create_array().unwrap();
            if let Some(cid) = child {
              c.insert(0, y_octo::Any::String(cid.to_owned())).unwrap();
            }
            m.insert("sys:children".to_owned(), c).unwrap();
            bm.insert(id.to_owned(), m).unwrap();
          };

          match kind {
            "self" => add_list(&d, &mut bm, "n:0", Some("n:0")),
            "two-cycle" => {
              add_list(&d, &mut bm, "n:0", Some("n:1"));
              add_list(&d, &mut bm, "n:1", Some("n:0"));
            }
            _ => {
              for i in 0..10_000usize {
                let id = format!("n:{i}");
                let next = (i + 1 < 10_000).then(|| format!("n:{}", i + 1));
                add_list(&d, &mut bm, &id, next.as_deref());
              }
            }
          }
          d.encode_update_v1().unwrap()
        };

        for kind in ["self", "two-cycle", "deep-10k"] {
          let doc_id = Uuid::new_v4().to_string();
          let blob = build_graph(kind);
          sqlx::query(
            "INSERT INTO snapshots (workspace_id, guid, blob, size, created_at, updated_at, created_by, updated_by) VALUES ($1, $2, $3, octet_length($3), clock_timestamp(), clock_timestamp(), $4, $4)",
          )
          .bind(&ws)
          .bind(&doc_id)
          .bind(&blob)
          .bind(&user_id)
          .execute(db.pool())
          .await
          .expect("insert graph doc");

          let _ = svc.read_document_markdown(&ws, &doc_id).await.expect("read cyclic/deep");
          let _ = svc.update_document(&ws, &doc_id, "Safe body", &user_id).await.expect("update cyclic/deep");
        }
        db.pool().close().await;
      });
    })
    .expect("spawn 2mb stack thread");
  handle.join().expect("2mb stack thread must not overflow");
}
