//! End-to-end tests for Assetpack SQLite storage (`v0.27.5` disk compatibility),
//! mixed `fs` + `assetpack` storage boot, and `appConfigMetadata` non-leakage.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;

use affine_server::{DeploymentModeArg, RoleArg, ServerCli, serve_with_extension};
use serde_json::{Value, json};
use server_blob::{AssetpackBlobStorage, BlobStorageBackend as _};
use server_spi::CommunityExtension;
use server_worker::CancellationToken;
use test_db_harness::migrations::MigrationSet;
use test_db_harness::pg::{DEFAULT_LEASE_TTL, PgCluster};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

async fn raw_http(
  addr: SocketAddr,
  method: &str,
  path: &str,
  headers: &[(&str, &str)],
  body: &[u8],
) -> (u16, String, Vec<u8>) {
  let mut stream = TcpStream::connect(addr).await.expect("connect server");
  let mut req = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\n");
  for (k, v) in headers {
    req.push_str(&format!("{k}: {v}\r\n"));
  }
  req.push_str(&format!("Content-Length: {}\r\nConnection: close\r\n\r\n", body.len()));
  stream.write_all(req.as_bytes()).await.expect("write req");
  if !body.is_empty() {
    stream.write_all(body).await.expect("write body");
  }
  let mut buf = Vec::new();
  stream.read_to_end(&mut buf).await.expect("read resp");
  let split = buf.windows(4).position(|w| w == b"\r\n\r\n").expect("http split");
  let head = String::from_utf8_lossy(&buf[..split]).into_owned();
  let status: u16 = head
    .lines()
    .next()
    .and_then(|l| l.split_whitespace().nth(1))
    .and_then(|s| s.parse().ok())
    .expect("http status");
  (status, head, buf[split + 4..].to_vec())
}

fn cookie_header(head: &str) -> String {
  head
    .lines()
    .filter_map(|l| {
      let (k, v) = l.split_once(':')?;
      k.trim()
        .eq_ignore_ascii_case("set-cookie")
        .then(|| v.trim().split(';').next().unwrap_or("").to_owned())
    })
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join("; ")
}

/// Minimal valid Yjs v1 update containing a `CONTENT_TYPE_ANY` string (`key`) so
/// `blob_refs` recognizes `key` as referenced by the doc snapshot.
fn yjs_snapshot_referencing(key: &str) -> Vec<u8> {
  let mut u = vec![
    1, 1, 1, 0, 0x28, 1, 4, b'm', b'e', b't', b'a', 6, b'a', b'v', b'a', b't', b'a', b'r', 1, 119,
  ];
  u.push(key.len() as u8);
  u.extend_from_slice(key.as_bytes());
  u.push(0);
  u
}

#[test]
fn assetpack_v0275_interop_mixed_boot_and_metadata_exact_keys() {
  let cluster = PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster.lease(&template, DEFAULT_LEASE_TTL).expect("lease db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("tokio rt");
  rt.block_on(async move {
    let tmp = std::env::temp_dir().join(format!("affine-assetpack-e2e-{}", uuid::Uuid::new_v4()));
    let ap_root = tmp.join("assetpack-root");
    let fs_root = tmp.join("fs-root");
    std::fs::create_dir_all(&ap_root).unwrap();
    std::fs::create_dir_all(&fs_root).unwrap();

    // 1. Pre-populate v0.27.5 Assetpack SQLite DBs for both "blob" and "avatar" scopes.
    let pre_ws = "pre-ws-assetpack-1";
    let legacy_blob_body = b"legacy-v0275-assetpack-blob-payload".repeat(32);
    let legacy_avatar_body = b"\x89PNG\r\n\x1a\nlegacy-avatar-bytes".to_vec();
    let blob_ap = AssetpackBlobStorage::new(ap_root.to_str().unwrap(), "blobs", "blob").unwrap();
    let avatar_ap = AssetpackBlobStorage::new(ap_root.to_str().unwrap(), "avatars", "avatar").unwrap();
    blob_ap
      .put(&format!("{pre_ws}/legacy-blob.txt"), legacy_blob_body.clone(), "text/plain")
      .await
      .expect("seed legacy blob");
    avatar_ap
      .put("legacy-avatar.png", legacy_avatar_body.clone(), "image/png")
      .await
      .expect("seed legacy avatar");
    assert!(ap_root.join("blobs/assetpack.sqlite").exists());
    assert!(ap_root.join("avatars/assetpack.sqlite").exists());

    // 2. Boot instance 1 with runtime-config.json setting both blob & avatar to assetpack.
    let cfg1_path = tmp.join("config-both-assetpack.json");
    std::fs::write(
      &cfg1_path,
      serde_json::to_vec(&json!({
        "storages": {
          "blob": { "storage": { "provider": "assetpack", "bucket": "blobs", "config": { "path": ap_root.to_str().unwrap() } } },
          "avatar": { "storage": { "provider": "assetpack", "bucket": "avatars", "config": { "path": ap_root.to_str().unwrap() } } }
        }
      }))
      .unwrap(),
    )
    .unwrap();

    let cli1 = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      deployment_mode: DeploymentModeArg::Selfhosted,
      skip_schema_check: true,
      config_path: Some(cfg1_path),
      ..ServerCli::default()
    };
    let cancel1 = CancellationToken::new();
    let bound1 = serve_with_extension(cli1, Arc::new(CommunityExtension::new()), cancel1.clone())
      .await
      .expect("boot instance 1");
    let addr1 = bound1.addr;

    // Create admin user & sign in.
    let (st_su, _, _) = raw_http(
      addr1,
      "POST",
      "/api/setup/create-admin-user",
      &[("Content-Type", "application/json")],
      br#"{"name":"Admin","email":"ap-admin@affine.test","password":"StrongPassword123"}"#,
    )
    .await;
    assert_eq!(st_su, 200);
    let (st_si, si_head, _) = raw_http(
      addr1,
      "POST",
      "/api/auth/sign-in",
      &[("Content-Type", "application/json")],
      br#"{"email":"ap-admin@affine.test","password":"StrongPassword123"}"#,
    )
    .await;
    assert_eq!(st_si, 200);
    let cookie = cookie_header(&si_head);

    // Seed PG workspace + membership + blobs row + snapshot referencing legacy-blob.txt.
    let pool = sqlx::PgPool::connect(&db_url).await.expect("pg pool");
    let admin_id: String = sqlx::query_scalar("SELECT id FROM users WHERE email = 'ap-admin@affine.test'")
      .fetch_one(&pool)
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspaces (id, name, enable_ai, enable_doc_embedding, indexed, last_check_embeddings, created_at) \
       VALUES ($1, 'Legacy AP', true, true, false, now(), now())",
    )
    .bind(pre_ws)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_access_policies \
       (workspace_id, visibility, sharing_enabled, url_preview_enabled, member_default_doc_role, created_at, updated_at) \
       VALUES ($1, 'private', true, false, 'manager', now(), now())",
    )
    .bind(pre_ws)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, source, state, created_at, updated_at) \
       VALUES ($1, $2, $3, 'owner', 'legacy', 'active', now(), now())",
    )
    .bind(format!("perm_{}", uuid::Uuid::new_v4().simple()))
    .bind(pre_ws)
    .bind(&admin_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO blobs (workspace_id, key, size, mime, status) VALUES ($1, 'legacy-blob.txt', $2, 'text/plain', 'completed')",
    )
    .bind(pre_ws)
    .bind(legacy_blob_body.len() as i32)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO snapshots (workspace_id, guid, blob, created_at, updated_at) VALUES ($1, $1, $2, now(), now())",
    )
    .bind(pre_ws)
    .bind(yjs_snapshot_referencing("legacy-blob.txt"))
    .execute(&pool)
    .await
    .unwrap();

    // Verify HTTP download of pre-stored Assetpack blob & avatar.
    let (st_blob, _, got_blob) = raw_http(
      addr1,
      "GET",
      &format!("/api/workspaces/{pre_ws}/blobs/v1/legacy-blob.txt?sourceType=currentDoc&docId={pre_ws}"),
      &[("Cookie", &cookie)],
      b"",
    )
    .await;
    assert_eq!(st_blob, 200);
    assert_eq!(got_blob, legacy_blob_body);

    let (st_av, _, got_av) = raw_http(addr1, "GET", "/api/avatars/legacy-avatar.png", &[], b"").await;
    assert_eq!(st_av, 200);
    assert_eq!(got_av, legacy_avatar_body);

    // Upload a new blob via GraphQL setBlob and verify roundtrip + SQLite manifest persistence.
    let boundary = "----AssetpackE2EBoundary";
    let ops = json!({
      "query": "mutation($blob: Upload!, $ws: String!) { setBlob(blob: $blob, workspaceId: $ws) }",
      "variables": { "blob": null, "ws": pre_ws }
    });
    let map = json!({ "0": ["variables.blob"] });
    let new_payload = b"fresh-assetpack-upload-2026";
    let mp_body = format!(
      "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{ops}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map}\r\n\
       --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"fresh.txt\"\r\nContent-Type: text/plain\r\n\r\n{}\r\n\
       --{boundary}--\r\n",
      std::str::from_utf8(new_payload).unwrap()
    );
    let (st_set, _, set_raw) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[
        ("Cookie", &cookie),
        ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={boundary}")),
      ],
      mp_body.as_bytes(),
    )
    .await;
    assert_eq!(st_set, 200);
    let set_json: Value = serde_json::from_slice(&set_raw).unwrap();
    assert!(set_json["errors"].is_null(), "setBlob failed: {set_json}");
    let new_key = set_json["data"]["setBlob"].as_str().expect("new blob key");
    sqlx::query("UPDATE snapshots SET blob = $1 WHERE workspace_id = $2 AND guid = $2")
      .bind(yjs_snapshot_referencing(new_key))
      .bind(pre_ws)
      .execute(&pool)
      .await
      .unwrap();
    let (st_new, _, got_new) = raw_http(
      addr1,
      "GET",
      &format!("/api/workspaces/{pre_ws}/blobs/v1/{new_key}?sourceType=currentDoc&docId={pre_ws}"),
      &[("Cookie", &cookie)],
      b"",
    )
    .await;
    assert_eq!(st_new, 200);
    assert_eq!(got_new, new_payload);

    let sqlite_pool = sqlx::SqlitePool::connect(&format!(
      "sqlite://{}",
      ap_root.join("blobs/assetpack.sqlite").display()
    ))
    .await
    .expect("open assetpack sqlite");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM storage_assetpack_blobs WHERE scope = 'blob'")
      .fetch_one(&sqlite_pool)
      .await
      .unwrap();
    assert_eq!(count, 2, "both legacy and newly uploaded blobs must exist in assetpack.sqlite");

    // 2b. Verify assetpack config.precomp2 defaults to true, hot-reloads to false and back to true,
    //     keeps both precomp2 and raw objects readable over HTTP GET, and leaks zero metadata keys.
    let make_png = |salt: u8| -> Vec<u8> {
      use image::ImageEncoder as _;
      let (w, h) = (320u32, 320u32);
      let mut pixels = vec![0u8; (w * h * 4) as usize];
      for y in 0..h {
        for x in 0..w {
          let i = ((y * w + x) * 4) as usize;
          pixels[i] = (((x * 255) / w) as u8).wrapping_add(salt);
          pixels[i + 1] = ((y * 255) / h) as u8;
          pixels[i + 2] = (((x ^ y) * 3 + (x / 17) * 29) & 0xFF) as u8;
          pixels[i + 3] = 255 - ((x + y) & 0x3F) as u8;
        }
      }
      let mut out = Vec::new();
      image::codecs::png::PngEncoder::new(&mut out)
        .write_image(&pixels, w, h, image::ExtendedColorType::Rgba8)
        .expect("encode png");
      assert!(out.len() >= 64 * 1024, "test png must be >= 64 KiB, got {}", out.len());
      out
    };
    let build_set_blob_mp = |boundary: &str, filename: &str, bytes: &[u8]| -> Vec<u8> {
      let ops = json!({
        "query": "mutation($blob: Upload!, $ws: String!) { setBlob(blob: $blob, workspaceId: $ws) }",
        "variables": { "blob": null, "ws": pre_ws }
      });
      let map = json!({ "0": ["variables.blob"] });
      let mut out = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{ops}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"{filename}\"\r\nContent-Type: image/png\r\n\r\n"
      )
      .into_bytes();
      out.extend_from_slice(bytes);
      out.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
      out
    };
    let read_tid = |pool: sqlx::SqlitePool, obj_key: String| async move {
      let hex: String =
        sqlx::query_scalar("SELECT recipe_hash FROM storage_assetpack_blobs WHERE scope = 'blob' AND key = ?1")
          .bind(&obj_key)
          .fetch_one(&pool)
          .await
          .expect("manifest row");
      let rhash = assetpack_core::Hash32::from_hex(&hex).unwrap();
      let raw: Vec<u8> = sqlx::query_scalar("SELECT content FROM objects WHERE hash = ?1 AND kind = 2")
        .bind(rhash.as_bytes().as_ref())
        .fetch_one(&pool)
        .await
        .expect("recipe row");
      assetpack_core::parse_recipe_checked(&raw, &rhash)
        .expect("parse recipe")
        .transform_id
    };

    // Upload 1: default assetpack (no `precomp2` field -> true) produces transform_id != 0.
    let png_default = make_png(1);
    let mp_p1 = build_set_blob_mp(boundary, "precomp-default.png", &png_default);
    let (st_p1, _, raw_p1) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[
        ("Cookie", &cookie),
        ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={boundary}")),
      ],
      &mp_p1,
    )
    .await;
    assert_eq!(st_p1, 200);
    let j_p1: Value = serde_json::from_slice(&raw_p1).unwrap();
    assert!(j_p1["errors"].is_null(), "setBlob png 1 failed: {j_p1}");
    let key_p1 = j_p1["data"]["setBlob"].as_str().expect("key_p1").to_owned();
    let tid_p1 = read_tid(sqlite_pool.clone(), format!("{pre_ws}/{key_p1}")).await;
    assert_ne!(tid_p1, 0, "default assetpack config must enable precomp2");

    // Hot-update blob & avatar storage to precomp2: false.
    let disable_precomp2 = json!({
      "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
      "variables": {
        "u": [
          {
            "module": "storages",
            "key": "blob.storage",
            "value": { "provider": "assetpack", "bucket": "blobs", "config": { "path": ap_root.to_str().unwrap(), "precomp2": false } }
          },
          {
            "module": "storages",
            "key": "avatar.storage",
            "value": { "provider": "assetpack", "bucket": "avatars", "config": { "path": ap_root.to_str().unwrap(), "precomp2": false } }
          }
        ]
      }
    })
    .to_string();
    let (st_off, _, raw_off) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      disable_precomp2.as_bytes(),
    )
    .await;
    assert_eq!(st_off, 200);
    let j_off: Value = serde_json::from_slice(&raw_off).unwrap();
    assert!(j_off["errors"].is_null(), "disable precomp2 failed: {j_off}");

    // Upload 2: with precomp2: false, recipe transform_id == 0; both old & new blobs download 200 OK.
    let png_off = make_png(2);
    let mp_p2 = build_set_blob_mp(boundary, "precomp-off.png", &png_off);
    let (st_p2, _, raw_p2) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[
        ("Cookie", &cookie),
        ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={boundary}")),
      ],
      &mp_p2,
    )
    .await;
    assert_eq!(st_p2, 200);
    let j_p2: Value = serde_json::from_slice(&raw_p2).unwrap();
    assert!(j_p2["errors"].is_null(), "setBlob png 2 failed: {j_p2}");
    let key_p2 = j_p2["data"]["setBlob"].as_str().expect("key_p2").to_owned();
    let tid_p2 = read_tid(sqlite_pool.clone(), format!("{pre_ws}/{key_p2}")).await;
    assert_eq!(tid_p2, 0, "precomp2: false must write transform_id == 0");

    for (k, expected) in [(&key_p1, &png_default), (&key_p2, &png_off)] {
      sqlx::query("UPDATE snapshots SET blob = $1 WHERE workspace_id = $2 AND guid = $2")
        .bind(yjs_snapshot_referencing(k))
        .bind(pre_ws)
        .execute(&pool)
        .await
        .unwrap();
      let (st_dl, _, got_dl) = raw_http(
        addr1,
        "GET",
        &format!("/api/workspaces/{pre_ws}/blobs/v1/{k}?sourceType=currentDoc&docId={pre_ws}"),
        &[("Cookie", &cookie)],
        b"",
      )
      .await;
      assert_eq!(st_dl, 200);
      assert_eq!(got_dl, *expected);
    }

    // Hot-update back to precomp2: true via clear: true; next upload resumes transform_id != 0
    // and appConfigMetadata still exposes only ["configured", "settable", "source"].
    let clear_precomp2 = json!({
      "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
      "variables": {
        "u": [
          { "module": "storages", "key": "blob.storage", "clear": true },
          { "module": "storages", "key": "avatar.storage", "clear": true }
        ]
      }
    })
    .to_string();
    let (st_re, _, raw_re) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      clear_precomp2.as_bytes(),
    )
    .await;
    assert_eq!(st_re, 200);
    let j_re: Value = serde_json::from_slice(&raw_re).unwrap();
    assert!(j_re["errors"].is_null(), "clear precomp2 override failed: {j_re}");

    let png_re = make_png(3);
    let mp_p3 = build_set_blob_mp(boundary, "precomp-restored.png", &png_re);
    let (st_p3, _, raw_p3) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[
        ("Cookie", &cookie),
        ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={boundary}")),
      ],
      &mp_p3,
    )
    .await;
    assert_eq!(st_p3, 200);
    let j_p3: Value = serde_json::from_slice(&raw_p3).unwrap();
    assert!(j_p3["errors"].is_null(), "setBlob png 3 failed: {j_p3}");
    let key_p3 = j_p3["data"]["setBlob"].as_str().expect("key_p3").to_owned();
    let tid_p3 = read_tid(sqlite_pool.clone(), format!("{pre_ws}/{key_p3}")).await;
    assert_ne!(tid_p3, 0, "clearing precomp2: false must restore precomp2 transform");

    let (st_m1, _, raw_m1) = raw_http(
      addr1,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      br#"{"query":"{ appConfigMetadata }"}"#,
    )
    .await;
    assert_eq!(st_m1, 200);
    let jm1: Value = serde_json::from_slice(&raw_m1).unwrap();
    for ptr in ["/storages/blob/storage", "/storages/avatar/storage"] {
      let obj = jm1["data"]["appConfigMetadata"]
        .pointer(ptr)
        .and_then(Value::as_object)
        .expect("storage metadata object");
      let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
      keys.sort_unstable();
      assert_eq!(keys, vec!["configured", "settable", "source"]);
    }

    sqlite_pool.close().await;

    cancel1.cancel();
    let _ = bound1.join_handle.await;

    // 3. Boot instance 2 with blob = fs and avatar = assetpack; verify avatar reads from
    //    Assetpack and appConfigMetadata exposes exact 3-keyset with zero sub-field leak.
    let cfg2_path = tmp.join("config-mixed-fs-assetpack.json");
    std::fs::write(
      &cfg2_path,
      serde_json::to_vec(&json!({
        "storages": {
          "blob": { "storage": { "provider": "fs", "bucket": "blobs", "config": { "path": fs_root.to_str().unwrap() } } },
          "avatar": { "storage": { "provider": "assetpack", "bucket": "avatars", "config": { "path": ap_root.to_str().unwrap() } } }
        }
      }))
      .unwrap(),
    )
    .unwrap();
    let cli2 = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      deployment_mode: DeploymentModeArg::Selfhosted,
      skip_schema_check: true,
      config_path: Some(cfg2_path),
      ..ServerCli::default()
    };
    let cancel2 = CancellationToken::new();
    let bound2 = serve_with_extension(cli2, Arc::new(CommunityExtension::new()), cancel2.clone())
      .await
      .expect("boot instance 2");
    let addr2 = bound2.addr;

    let (st_av2, _, got_av2) = raw_http(addr2, "GET", "/api/avatars/legacy-avatar.png", &[], b"").await;
    assert_eq!(st_av2, 200);
    assert_eq!(got_av2, legacy_avatar_body);

    let (st_meta, _, meta_raw) = raw_http(
      addr2,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      br#"{"query":"{ appConfigMetadata }"}"#,
    )
    .await;
    assert_eq!(st_meta, 200);
    let meta_json: Value = serde_json::from_slice(&meta_raw).unwrap();
    assert!(meta_json["errors"].is_null(), "appConfigMetadata failed: {meta_json}");
    let meta = &meta_json["data"]["appConfigMetadata"];
    for ptr in ["/storages/blob/storage", "/storages/avatar/storage"] {
      let obj = meta
        .pointer(ptr)
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("missing metadata object at {ptr}: {meta}"));
      let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
      keys.sort_unstable();
      assert_eq!(
        keys,
        vec!["configured", "settable", "source"],
        "metadata at {ptr} must not leak sub-fields: {obj:?}"
      );
      assert_eq!(obj["source"], "file");
      assert_eq!(obj["settable"], true);
      assert_eq!(obj["configured"], true);
    }

    // 4. Hot-switch storages.avatar.storage to aws-s3 -> GET /api/avatars/:id must return
    //    403 ACTION_FORBIDDEN; switching back to assetpack (clear: true) restores 200 OK.
    let s3_switch = json!({
      "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
      "variables": {
        "u": [{
          "module": "storages",
          "key": "avatar.storage",
          "value": {
            "provider": "aws-s3",
            "bucket": "avatars",
            "config": {
              "region": "us-east-1",
              "credentials": { "accessKeyId": "AKIA", "secretAccessKey": "SECRET" }
            }
          }
        }]
      }
    })
    .to_string();
    let (st_s3, _, s3_raw) = raw_http(
      addr2,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      s3_switch.as_bytes(),
    )
    .await;
    assert_eq!(st_s3, 200);
    let s3_json: Value = serde_json::from_slice(&s3_raw).unwrap();
    assert!(s3_json["errors"].is_null(), "switch avatar to s3 failed: {s3_json}");

    let (st_403, _, raw_403) = raw_http(addr2, "GET", "/api/avatars/legacy-avatar.png", &[], b"").await;
    assert_eq!(st_403, 403, "s3 avatar storage must reject GET /api/avatars/:id with 403");
    let env_403: Value = serde_json::from_slice(&raw_403).expect("403 JSON envelope");
    assert_eq!(env_403["name"], "ACTION_FORBIDDEN");
    assert_eq!(
      env_403["message"],
      "Only available when avatar storage provider is fs or assetpack."
    );

    let clear_av = json!({
      "query": "mutation($u: [UpdateAppConfigInput!]!) { updateAppConfig(updates: $u) }",
      "variables": { "u": [{ "module": "storages", "key": "avatar.storage", "clear": true }] }
    })
    .to_string();
    let (st_clr, _, clr_raw) = raw_http(
      addr2,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      clear_av.as_bytes(),
    )
    .await;
    assert_eq!(st_clr, 200);
    let clr_json: Value = serde_json::from_slice(&clr_raw).unwrap();
    assert!(clr_json["errors"].is_null(), "clear avatar override failed: {clr_json}");

    let (st_av3, _, got_av3) = raw_http(addr2, "GET", "/api/avatars/legacy-avatar.png", &[], b"").await;
    assert_eq!(st_av3, 200);
    assert_eq!(got_av3, legacy_avatar_body);

    cancel2.cancel();
    let _ = bound2.join_handle.await;

    // 5. File-only config storages.avatar.{publicPath, unregisteredFlag}
    //    (zero DB override): registered publicPath takes effect with source=="file",
    //    unregisteredFlag is absent from both appConfig and appConfigMetadata, and
    //    two consecutive uploadAvatar calls return CDN URLs and delete the first object.
    let av_fs_root = tmp.join("avatar-cdn-fs");
    std::fs::create_dir_all(&av_fs_root).unwrap();
    let cfg3_path = tmp.join("config-avatar-cdn.json");
    std::fs::write(
      &cfg3_path,
      serde_json::to_vec(&json!({
        "storages": {
          "avatar": {
            "publicPath": "https://cdn.example/avatars/",
            "unregisteredFlag": true,
            "storage": { "provider": "fs", "bucket": "avatars", "config": { "path": av_fs_root.to_str().unwrap() } }
          }
        }
      }))
      .unwrap(),
    )
    .unwrap();
    let cli3 = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      deployment_mode: DeploymentModeArg::Selfhosted,
      skip_schema_check: true,
      config_path: Some(cfg3_path),
      ..ServerCli::default()
    };
    let cancel3 = CancellationToken::new();
    let bound3 = serve_with_extension(cli3, Arc::new(CommunityExtension::new()), cancel3.clone())
      .await
      .expect("boot instance 3");
    let addr3 = bound3.addr;

    let meta_q = json!({ "query": "{ appConfig appConfigMetadata }" }).to_string();
    let (st_m, _, raw_m) = raw_http(
      addr3,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      meta_q.as_bytes(),
    )
    .await;
    assert_eq!(st_m, 200);
    let jm: Value = serde_json::from_slice(&raw_m).unwrap();
    assert!(jm["errors"].is_null(), "appConfigMetadata query failed: {jm}");
    assert_eq!(
      jm["data"]["appConfig"]["storages"]["avatar"]["publicPath"],
      "https://cdn.example/avatars/"
    );
    assert!(
      jm["data"]["appConfig"]["storages"]["avatar"]["unregisteredFlag"].is_null(),
      "unregistered file key must not appear in appConfig"
    );
    assert_eq!(
      jm["data"]["appConfigMetadata"]["storages"]["avatar"]["publicPath"]["source"],
      "file"
    );
    assert!(
      jm["data"]["appConfigMetadata"]["storages"]["avatar"]["unregisteredFlag"].is_null(),
      "unregistered file key must not appear in appConfigMetadata"
    );

    // Minimal valid 1x1 PNG (67 bytes).
    let png_1x1: &[u8] = &[
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49,
      0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let build_upload_avatar_mp = |boundary: &str, bytes: &[u8]| -> Vec<u8> {
      let ops = json!({
        "query": "mutation($avatar: Upload!) { uploadAvatar(avatar: $avatar) { avatarUrl } }",
        "variables": { "avatar": null }
      });
      let map = json!({ "0": ["variables.avatar"] });
      let mut out = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"operations\"\r\n\r\n{ops}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"map\"\r\n\r\n{map}\r\n\
         --{boundary}\r\nContent-Disposition: form-data; name=\"0\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n"
      )
      .into_bytes();
      out.extend_from_slice(bytes);
      out.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
      out
    };

    let b3 = "----AvatarCdnBoundary";
    let mp1 = build_upload_avatar_mp(b3, png_1x1);
    let (st_u1, _, raw_u1) = raw_http(
      addr3,
      "POST",
      "/graphql",
      &[
        ("Cookie", &cookie),
        ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={b3}")),
      ],
      &mp1,
    )
    .await;
    assert_eq!(st_u1, 200);
    let j1: Value = serde_json::from_slice(&raw_u1).unwrap();
    assert!(j1["errors"].is_null(), "uploadAvatar 1 failed: {j1}");
    let url1 = j1["data"]["uploadAvatar"]["avatarUrl"].as_str().expect("avatarUrl 1");
    assert!(url1.starts_with("https://cdn.example/avatars/"), "got {url1}");
    let key1 = url1.rsplit('/').next().unwrap().to_owned();
    assert!(av_fs_root.join("avatars").join(&key1).exists(), "first avatar stored");
    let db_url1: String = sqlx::query_scalar("SELECT avatar_url FROM users WHERE id = $1")
      .bind(&admin_id)
      .fetch_one(&pool)
      .await
      .unwrap();
    assert_eq!(db_url1, url1);

    let (st_u2, _, raw_u2) = raw_http(
      addr3,
      "POST",
      "/graphql",
      &[
        ("Cookie", &cookie),
        ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={b3}")),
      ],
      &mp1,
    )
    .await;
    assert_eq!(st_u2, 200);
    let j2: Value = serde_json::from_slice(&raw_u2).unwrap();
    assert!(j2["errors"].is_null(), "uploadAvatar 2 failed: {j2}");
    let url2 = j2["data"]["uploadAvatar"]["avatarUrl"].as_str().expect("avatarUrl 2");
    assert!(url2.starts_with("https://cdn.example/avatars/"), "got {url2}");
    let key2 = url2.rsplit('/').next().unwrap().to_owned();
    assert_ne!(key1, key2);
    assert!(
      !av_fs_root.join("avatars").join(&key1).exists(),
      "old CDN avatar object must be deleted after replacement"
    );
    assert!(av_fs_root.join("avatars").join(&key2).exists(), "new avatar stored");

    cancel3.cancel();
    let _ = bound3.join_handle.await;

    // 6. external_url with subpath + three avatar.publicPath states ("", "/custom-avatars", "/custom-avatars/"):
    //    empty returns bare key; root-relative resolves against origin only without auto-inserting '/' or duplicating /subpath.
    for (idx, (public_path, expected_prefix, expect_bare)) in [
      ("", "", true),
      ("/custom-avatars", "http://127.0.0.1:3010/custom-avatars", false),
      ("/custom-avatars/", "http://127.0.0.1:3010/custom-avatars/", false),
    ]
    .into_iter()
    .enumerate()
    {
      let cfg_p = tmp.join(format!("config-avatar-subpath-{idx}.json"));
      std::fs::write(
        &cfg_p,
        serde_json::to_vec(&json!({
          "storages": {
            "avatar.publicPath": public_path,
            "avatar": { "storage": { "provider": "fs", "bucket": "avatars", "config": { "path": av_fs_root.to_str().unwrap() } } }
          }
        }))
        .unwrap(),
      )
      .unwrap();
      let cli_p = ServerCli {
        role: Some(RoleArg::Allinone),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        external_url: Some("http://127.0.0.1:3010/subpath".into()),
        database_url: db_url.clone(),
        deployment_mode: DeploymentModeArg::Selfhosted,
        skip_schema_check: true,
        config_path: Some(cfg_p),
        ..ServerCli::default()
      };
      let cancel_p = CancellationToken::new();
      let bound_p = serve_with_extension(cli_p, Arc::new(CommunityExtension::new()), cancel_p.clone())
        .await
        .expect("boot avatar three-state instance");
      let (st_u, _, raw_u) = raw_http(
        bound_p.addr,
        "POST",
        "/graphql",
        &[
          ("Cookie", &cookie),
          ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={b3}")),
        ],
        &mp1,
      )
      .await;
      assert_eq!(st_u, 200);
      let ju: Value = serde_json::from_slice(&raw_u).unwrap();
      assert!(ju["errors"].is_null(), "uploadAvatar state {idx} failed: {ju}");
      let url_u = ju["data"]["uploadAvatar"]["avatarUrl"].as_str().expect("avatarUrl");
      if expect_bare {
        assert!(
          url_u.starts_with(&format!("{admin_id}-avatar-")) && !url_u.contains('/'),
          "empty publicPath must return bare key: {url_u}"
        );
      } else {
        let rest = url_u
          .strip_prefix(expected_prefix)
          .unwrap_or_else(|| panic!("expected prefix {expected_prefix}, got {url_u}"));
        assert!(
          rest.starts_with(&format!("{admin_id}-avatar-")) && !url_u.contains("/subpath"),
          "root-relative publicPath ({public_path}) mismatch: {url_u}"
        );
      }
      let db_url_u: String = sqlx::query_scalar("SELECT avatar_url FROM users WHERE id = $1")
        .bind(&admin_id)
        .fetch_one(&pool)
        .await
        .unwrap();
      assert_eq!(db_url_u, url_u);
      cancel_p.cancel();
      let _ = bound_p.join_handle.await;
    }

    // 7. Root-level literal dotted key vs module-scoped dotted key parity:
    //    `{"storages.avatar.publicPath": "/root-dotted/"}` is ignored (stays default + source="default"),
    //    while `{"storages": {"avatar.publicPath": "/mod-dotted/"}}` applies everywhere (source="file").
    let storage_spec = json!({
      "provider": "fs",
      "bucket": "avatars",
      "config": { "path": av_fs_root.to_str().unwrap() }
    });
    for (tag, cfg_json, exp_path, exp_source, exp_prefix) in [
      (
        "root-dotted",
        json!({
          "storages.avatar.publicPath": "/root-dotted/",
          "storages": { "avatar": { "storage": storage_spec } }
        }),
        "/api/avatars/",
        "default",
        "http://127.0.0.1:3010/api/avatars/",
      ),
      (
        "mod-dotted",
        json!({
          "storages": {
            "avatar.publicPath": "/mod-dotted/",
            "avatar": { "storage": storage_spec }
          }
        }),
        "/mod-dotted/",
        "file",
        "http://127.0.0.1:3010/mod-dotted/",
      ),
    ] {
      let cfg_d = tmp.join(format!("config-avatar-{tag}.json"));
      std::fs::write(&cfg_d, serde_json::to_vec(&cfg_json).unwrap()).unwrap();
      let cli_d = ServerCli {
        role: Some(RoleArg::Allinone),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        external_url: Some("http://127.0.0.1:3010".into()),
        database_url: db_url.clone(),
        deployment_mode: DeploymentModeArg::Selfhosted,
        skip_schema_check: true,
        config_path: Some(cfg_d),
        ..ServerCli::default()
      };
      let cancel_d = CancellationToken::new();
      let bound_d = serve_with_extension(cli_d, Arc::new(CommunityExtension::new()), cancel_d.clone())
        .await
        .expect("boot dotted-key comparison instance");
      let (st_md, _, raw_md) = raw_http(
        bound_d.addr,
        "POST",
        "/graphql",
        &[("Cookie", &cookie), ("Content-Type", "application/json")],
        meta_q.as_bytes(),
      )
      .await;
      assert_eq!(st_md, 200);
      let jmd: Value = serde_json::from_slice(&raw_md).unwrap();
      assert!(jmd["errors"].is_null(), "{tag} metadata query failed: {jmd}");
      assert_eq!(jmd["data"]["appConfig"]["storages"]["avatar"]["publicPath"], exp_path);
      assert_eq!(
        jmd["data"]["appConfigMetadata"]["storages"]["avatar"]["publicPath"]["source"],
        exp_source
      );
      let (st_ud, _, raw_ud) = raw_http(
        bound_d.addr,
        "POST",
        "/graphql",
        &[
          ("Cookie", &cookie),
          ("apollo-require-preflight", "true"),
        ("Content-Type", &format!("multipart/form-data; boundary={b3}")),
        ],
        &mp1,
      )
      .await;
      assert_eq!(st_ud, 200);
      let jud: Value = serde_json::from_slice(&raw_ud).unwrap();
      assert!(jud["errors"].is_null(), "{tag} uploadAvatar failed: {jud}");
      let url_d = jud["data"]["uploadAvatar"]["avatarUrl"].as_str().expect("avatarUrl");
      let rest = url_d
        .strip_prefix(exp_prefix)
        .unwrap_or_else(|| panic!("{tag}: expected prefix {exp_prefix}, got {url_d}"));
      assert!(rest.starts_with(&format!("{admin_id}-avatar-")), "{tag}: got {url_d}");
      cancel_d.cancel();
      let _ = bound_d.join_handle.await;
    }

    // 8. Same config file under two real binary startups: file-only vs REDIS_SERVER_HOST conflict.
    let test_redis = test_db_harness::redis::TestRedis::from_env_or_docker().expect("test redis");
    let r_port = url::Url::parse(test_redis.url())
      .unwrap()
      .port()
      .unwrap_or(6379);
    let cfg_redis_path = tmp.join("config-redis-prio.json");
    std::fs::write(
      &cfg_redis_path,
      serde_json::to_vec(&json!({ "redis": { "host": "localhost", "port": r_port } })).unwrap(),
    )
    .unwrap();
    for (tag, extra_env, exp_host, exp_host_src) in [
      ("file-only", None, "localhost", "file"),
      ("env-conflict", Some(("REDIS_SERVER_HOST", "127.0.0.1")), "127.0.0.1", "environment"),
    ] {
      let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
      let p = l.local_addr().unwrap().port();
      drop(l);
      let mut cmd = tokio::process::Command::new(env!("CARGO_BIN_EXE_affine-server"));
      cmd
        .kill_on_drop(true)
        .env_remove("REDIS_URL")
        .env_remove("REDIS_SERVER_URL")
        .env_remove("REDIS_SERVER_HOST")
        .env_remove("REDIS_SERVER_PORT")
        .env_remove("REDIS_SERVER_DATABASE")
        .env_remove("REDIS_SERVER_USERNAME")
        .env_remove("REDIS_SERVER_USER")
        .env_remove("REDIS_SERVER_PASSWORD")
        .args([
          "--role",
          "allinone",
          "--host",
          "127.0.0.1",
          "--port",
          &p.to_string(),
          "--database-url",
          &db_url,
          "--skip-schema-check",
          "--config-path",
          cfg_redis_path.to_str().unwrap(),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
      if let Some((ek, ev)) = extra_env {
        cmd.env(ek, ev);
      }
      let mut child = cmd.spawn().expect("spawn affine-server binary");
      let addr_r = std::net::SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), p);
      let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
      let mut poll = tokio::time::interval(std::time::Duration::from_millis(25));
      poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
      let mut ready = false;
      while std::time::Instant::now() < deadline {
        if tokio::net::TcpStream::connect(addr_r).await.is_ok() {
          let (st_h, _, _) = raw_http(addr_r, "GET", "/healthz", &[], b"").await;
          if st_h == 200 {
            ready = true;
            break;
          }
        }
        poll.tick().await;
      }
      assert!(ready, "{tag}: affine-server failed to become ready");
      let (st_rm, _, raw_rm) = raw_http(
        addr_r,
        "POST",
        "/graphql",
        &[("Cookie", &cookie), ("Content-Type", "application/json")],
        meta_q.as_bytes(),
      )
      .await;
      let _ = child.kill().await;
      let _ = child.wait().await;
      assert_eq!(st_rm, 200);
      let jrm: Value = serde_json::from_slice(&raw_rm).unwrap();
      assert!(jrm["errors"].is_null(), "{tag} metadata query failed: {jrm}");
      assert_eq!(jrm["data"]["appConfig"]["redis"]["host"], exp_host, "{tag}");
      assert_eq!(jrm["data"]["appConfig"]["redis"]["port"], r_port, "{tag}");
      assert_eq!(
        jrm["data"]["appConfigMetadata"]["redis"]["host"]["source"], exp_host_src,
        "{tag}"
      );
      assert_eq!(
        jrm["data"]["appConfigMetadata"]["redis"]["port"]["source"], "file",
        "{tag}"
      );
    }

    // 9. Partial Redis file config `{"redis": {"port": r_port}}` (no host) must default host to
    //    "localhost", actually initialize Redis (`session_mutex.is_some()`), and report
    //    `host.source == "default"` + `port.source == "file"`.
    let cfg_partial_redis = tmp.join("config-redis-partial.json");
    std::fs::write(
      &cfg_partial_redis,
      serde_json::to_vec(&json!({ "redis": { "port": r_port } })).unwrap(),
    )
    .unwrap();
    let built_partial = affine_server::build_server(
      &ServerCli {
        role: Some(RoleArg::Allinone),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        database_url: db_url.clone(),
        deployment_mode: DeploymentModeArg::Selfhosted,
        skip_schema_check: true,
        config_path: Some(cfg_partial_redis.clone()),
        ..ServerCli::default()
      },
      Arc::new(CommunityExtension::new()),
      CancellationToken::new(),
    )
    .await
    .expect("partial redis file config must build");
    assert!(
      built_partial.session_mutex.is_some(),
      "partial redis file config must initialize Redis client/session_mutex"
    );
    drop(built_partial);

    let l_p = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let p_p = l_p.local_addr().unwrap().port();
    drop(l_p);
    let mut child_p = tokio::process::Command::new(env!("CARGO_BIN_EXE_affine-server"))
      .kill_on_drop(true)
      .env_remove("REDIS_URL")
      .env_remove("REDIS_SERVER_URL")
      .env_remove("REDIS_SERVER_HOST")
      .env_remove("REDIS_SERVER_PORT")
      .env_remove("REDIS_SERVER_DATABASE")
      .env_remove("REDIS_SERVER_USERNAME")
      .env_remove("REDIS_SERVER_USER")
      .env_remove("REDIS_SERVER_PASSWORD")
      .args([
        "--role",
        "allinone",
        "--host",
        "127.0.0.1",
        "--port",
        &p_p.to_string(),
        "--database-url",
        &db_url,
        "--skip-schema-check",
        "--config-path",
        cfg_partial_redis.to_str().unwrap(),
      ])
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null())
      .spawn()
      .expect("spawn partial redis binary");
    let addr_p = std::net::SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), p_p);
    let dl_p = std::time::Instant::now() + std::time::Duration::from_secs(10);
    let mut poll_p = tokio::time::interval(std::time::Duration::from_millis(25));
    poll_p.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut ready_p = false;
    while std::time::Instant::now() < dl_p {
      if tokio::net::TcpStream::connect(addr_p).await.is_ok()
        && raw_http(addr_p, "GET", "/healthz", &[], b"").await.0 == 200
      {
        ready_p = true;
        break;
      }
      poll_p.tick().await;
    }
    assert!(ready_p, "partial redis binary failed to become ready");
    let (st_pm, _, raw_pm) = raw_http(
      addr_p,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      meta_q.as_bytes(),
    )
    .await;
    let _ = child_p.kill().await;
    let _ = child_p.wait().await;
    assert_eq!(st_pm, 200);
    let jpm: Value = serde_json::from_slice(&raw_pm).unwrap();
    assert!(jpm["errors"].is_null(), "partial redis query failed: {jpm}");
    assert_eq!(jpm["data"]["appConfig"]["redis"]["host"], "localhost");
    assert_eq!(jpm["data"]["appConfig"]["redis"]["port"], r_port);
    assert_eq!(jpm["data"]["appConfigMetadata"]["redis"]["host"]["source"], "default");
    assert_eq!(jpm["data"]["appConfigMetadata"]["redis"]["port"]["source"], "file");

    // 10. Invalid Redis host in config file must fail startup with InvalidConfig("invalid Redis host").
    let cfg_bad_redis = tmp.join("config-redis-bad.json");
    std::fs::write(
      &cfg_bad_redis,
      serde_json::to_vec(&json!({ "redis": { "host": "bad host name" } })).unwrap(),
    )
    .unwrap();
    let bad_err = match affine_server::build_server(
      &ServerCli {
        role: Some(RoleArg::Allinone),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        database_url: db_url.clone(),
        deployment_mode: DeploymentModeArg::Selfhosted,
        skip_schema_check: true,
        config_path: Some(cfg_bad_redis),
        ..ServerCli::default()
      },
      Arc::new(CommunityExtension::new()),
      CancellationToken::new(),
    )
    .await
    {
      Ok(_) => panic!("invalid redis host must fail build_server"),
      Err(e) => e,
    };
    assert!(
      matches!(bad_err, affine_server::ServerError::InvalidConfig(ref m) if m.contains("invalid Redis host")),
      "expected InvalidConfig(invalid Redis host), got: {bad_err}"
    );

    // 11. REDIS_SERVER_USERNAME with '@' ("team@ops") must be percent-decoded back to "team@ops"
    //     in appConfig (not "team%40ops") with source == "environment".
    let cancel_u = CancellationToken::new();
    let bound_u = serve_with_extension(
      ServerCli {
        role: Some(RoleArg::Allinone),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        database_url: db_url.clone(),
        redis_server_host: Some("127.0.0.1".into()),
        redis_server_port: Some(r_port),
        redis_server_username: Some("team@ops".into()),
        deployment_mode: DeploymentModeArg::Selfhosted,
        skip_schema_check: true,
        ..ServerCli::default()
      },
      Arc::new(CommunityExtension::new()),
      cancel_u.clone(),
    )
    .await
    .expect("boot with team@ops redis username");
    let (st_um, _, raw_um) = raw_http(
      bound_u.addr,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      meta_q.as_bytes(),
    )
    .await;
    cancel_u.cancel();
    let _ = bound_u.join_handle.await;
    assert_eq!(st_um, 200);
    let jum: Value = serde_json::from_slice(&raw_um).unwrap();
    assert!(jum["errors"].is_null(), "redis username query failed: {jum}");
    assert_eq!(jum["data"]["appConfig"]["redis"]["username"], "team@ops");
    assert_eq!(
      jum["data"]["appConfigMetadata"]["redis"]["username"]["source"],
      "environment"
    );

    // 12. Non-Redis key file/env conflict: file mailer.SMTP.host beats MAILER_HOST env,
    //     with metadata source == "file".
    let cfg_mailer = tmp.join("config-mailer-prio.json");
    std::fs::write(
      &cfg_mailer,
      serde_json::to_vec(&json!({ "mailer": { "SMTP": { "host": "file-smtp.example" } } })).unwrap(),
    )
    .unwrap();
    let l_m = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let p_m = l_m.local_addr().unwrap().port();
    drop(l_m);
    let mut child_m = tokio::process::Command::new(env!("CARGO_BIN_EXE_affine-server"))
      .kill_on_drop(true)
      .env_remove("REDIS_URL")
      .env_remove("REDIS_SERVER_URL")
      .env_remove("REDIS_SERVER_HOST")
      .env_remove("REDIS_SERVER_PORT")
      .env_remove("REDIS_SERVER_DATABASE")
      .env_remove("REDIS_SERVER_USERNAME")
      .env_remove("REDIS_SERVER_USER")
      .env_remove("REDIS_SERVER_PASSWORD")
      .env("MAILER_HOST", "env-smtp.example")
      .args([
        "--role",
        "allinone",
        "--host",
        "127.0.0.1",
        "--port",
        &p_m.to_string(),
        "--database-url",
        &db_url,
        "--skip-schema-check",
        "--config-path",
        cfg_mailer.to_str().unwrap(),
      ])
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null())
      .spawn()
      .expect("spawn mailer conflict binary");
    let addr_m = std::net::SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), p_m);
    let dl_m = std::time::Instant::now() + std::time::Duration::from_secs(10);
    let mut poll_m = tokio::time::interval(std::time::Duration::from_millis(25));
    poll_m.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut ready_m = false;
    while std::time::Instant::now() < dl_m {
      if tokio::net::TcpStream::connect(addr_m).await.is_ok()
        && raw_http(addr_m, "GET", "/healthz", &[], b"").await.0 == 200
      {
        ready_m = true;
        break;
      }
      poll_m.tick().await;
    }
    assert!(ready_m, "mailer conflict binary failed to become ready");
    let (st_mm, _, raw_mm) = raw_http(
      addr_m,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      meta_q.as_bytes(),
    )
    .await;
    let _ = child_m.kill().await;
    let _ = child_m.wait().await;
    assert_eq!(st_mm, 200);
    let jmm: Value = serde_json::from_slice(&raw_mm).unwrap();
    assert!(jmm["errors"].is_null(), "mailer conflict query failed: {jmm}");
    assert_eq!(jmm["data"]["appConfig"]["mailer"]["SMTP"]["host"], "file-smtp.example");
    assert_eq!(
      jmm["data"]["appConfigMetadata"]["mailer"]["SMTP"]["host"]["source"],
      "file"
    );

    // 13. Absent "redis" section vs explicit empty `{"redis": {}}`:
    let cfg_no_redis = tmp.join("config-no-redis.json");
    std::fs::write(&cfg_no_redis, b"{}").unwrap();
    let built_no_redis = affine_server::build_server(
      &ServerCli {
        role: Some(RoleArg::Allinone),
        host: IpAddr::V4(Ipv4Addr::LOCALHOST),
        port: 0,
        database_url: db_url.clone(),
        deployment_mode: DeploymentModeArg::Selfhosted,
        skip_schema_check: true,
        config_path: Some(cfg_no_redis),
        ..ServerCli::default()
      },
      Arc::new(CommunityExtension::new()),
      CancellationToken::new(),
    )
    .await
    .expect("empty config without redis section must build");
    assert!(
      built_no_redis.session_mutex.is_none(),
      "missing redis section with no env must leave session_mutex None"
    );
    drop(built_no_redis);

    let cfg_empty_redis = tmp.join("config-empty-redis.json");
    std::fs::write(&cfg_empty_redis, b"{\"redis\":{}}").unwrap();
    let empty_redis_cli = ServerCli {
      role: Some(RoleArg::Allinone),
      host: IpAddr::V4(Ipv4Addr::LOCALHOST),
      port: 0,
      database_url: db_url.clone(),
      deployment_mode: DeploymentModeArg::Selfhosted,
      skip_schema_check: true,
      config_path: Some(cfg_empty_redis),
      ..ServerCli::default()
    };
    assert_eq!(
      empty_redis_cli
        .effective_redis_url_with_file(&json!({ "redis": {} }))
        .unwrap()
        .as_deref(),
      Some("redis://localhost:6379/0")
    );
    let built_empty_redis = affine_server::build_server(
      &empty_redis_cli,
      Arc::new(CommunityExtension::new()),
      CancellationToken::new(),
    )
    .await
    .expect("explicit empty redis object must build");
    assert!(
      built_empty_redis.session_mutex.is_some(),
      "explicit empty redis object must initialize Redis client/session_mutex"
    );
    drop(built_empty_redis);

    // 14. Validate explicit file redis object BEFORE applying env overrides:
    //     (a) `{"redis": {"port": 0}}` + valid REDIS_SERVER_PORT fails both in-process and binary.
    let cfg_port0 = tmp.join("config-redis-port0.json");
    std::fs::write(&cfg_port0, b"{\"redis\":{\"port\":0}}").unwrap();
    assert!(
      affine_server::build_server(
        &ServerCli {
          role: Some(RoleArg::Allinone),
          host: IpAddr::V4(Ipv4Addr::LOCALHOST),
          port: 0,
          database_url: db_url.clone(),
          redis_server_port: Some(r_port),
          deployment_mode: DeploymentModeArg::Selfhosted,
          skip_schema_check: true,
          config_path: Some(cfg_port0.clone()),
          ..ServerCli::default()
        },
        Arc::new(CommunityExtension::new()),
        CancellationToken::new(),
      )
      .await
      .is_err(),
      "redis.port=0 in file must fail even with valid redis_server_port override"
    );
    let out_p0 = tokio::process::Command::new(env!("CARGO_BIN_EXE_affine-server"))
      .env_remove("REDIS_URL")
      .env_remove("REDIS_SERVER_URL")
      .env("REDIS_SERVER_PORT", r_port.to_string())
      .args([
        "--role",
        "allinone",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--database-url",
        &db_url,
        "--skip-schema-check",
        "--config-path",
        cfg_port0.to_str().unwrap(),
      ])
      .output()
      .await
      .expect("run binary with port=0");
    assert!(
      !out_p0.status.success(),
      "binary must exit non-zero for redis.port=0 even when REDIS_SERVER_PORT is valid"
    );

    //     (b) numeric `{"redis": {"username": 123}}` fails both without env and with override.
    let cfg_num_user = tmp.join("config-redis-num-user.json");
    std::fs::write(&cfg_num_user, b"{\"redis\":{\"username\":123}}").unwrap();
    for override_user in [None, Some("override".to_owned())] {
      assert!(
        affine_server::build_server(
          &ServerCli {
            role: Some(RoleArg::Allinone),
            host: IpAddr::V4(Ipv4Addr::LOCALHOST),
            port: 0,
            database_url: db_url.clone(),
            redis_server_username: override_user,
            deployment_mode: DeploymentModeArg::Selfhosted,
            skip_schema_check: true,
            config_path: Some(cfg_num_user.clone()),
            ..ServerCli::default()
          },
          Arc::new(CommunityExtension::new()),
          CancellationToken::new(),
        )
        .await
        .is_err(),
        "numeric redis.username in file must fail startup"
      );
    }

    // 15. Frozen single-pass URL construction + strict decodeURIComponent:
    //     (a) `REDIS_SERVER_USERNAME="team%40ops"` -> GraphQL returns "team@ops".
    //     (b) leading/trailing spaces preserved for both env and file usernames.
    let cfg_space_user = tmp.join("config-redis-space-user.json");
    std::fs::write(
      &cfg_space_user,
      serde_json::to_vec(&json!({ "redis": { "host": "127.0.0.1", "port": r_port, "username": " file user " } }))
        .unwrap(),
    )
    .unwrap();
    for (tag, cli_u, expected_u) in [
      (
        "pct40",
        ServerCli {
          role: Some(RoleArg::Allinone),
          host: IpAddr::V4(Ipv4Addr::LOCALHOST),
          port: 0,
          database_url: db_url.clone(),
          redis_server_host: Some("127.0.0.1".into()),
          redis_server_port: Some(r_port),
          redis_server_username: Some("team%40ops".into()),
          deployment_mode: DeploymentModeArg::Selfhosted,
          skip_schema_check: true,
          ..ServerCli::default()
        },
        "team@ops",
      ),
      (
        "env-spaces",
        ServerCli {
          role: Some(RoleArg::Allinone),
          host: IpAddr::V4(Ipv4Addr::LOCALHOST),
          port: 0,
          database_url: db_url.clone(),
          redis_server_host: Some("127.0.0.1".into()),
          redis_server_port: Some(r_port),
          redis_server_username: Some(" team@ops ".into()),
          deployment_mode: DeploymentModeArg::Selfhosted,
          skip_schema_check: true,
          ..ServerCli::default()
        },
        " team@ops ",
      ),
      (
        "file-spaces",
        ServerCli {
          role: Some(RoleArg::Allinone),
          host: IpAddr::V4(Ipv4Addr::LOCALHOST),
          port: 0,
          database_url: db_url.clone(),
          deployment_mode: DeploymentModeArg::Selfhosted,
          skip_schema_check: true,
          config_path: Some(cfg_space_user),
          ..ServerCli::default()
        },
        " file user ",
      ),
    ] {
      let c_u = CancellationToken::new();
      let b_u = serve_with_extension(cli_u, Arc::new(CommunityExtension::new()), c_u.clone())
        .await
        .unwrap_or_else(|e| panic!("{tag}: boot failed: {e}"));
      let (st_u, _, raw_u) = raw_http(
        b_u.addr,
        "POST",
        "/graphql",
        &[("Cookie", &cookie), ("Content-Type", "application/json")],
        meta_q.as_bytes(),
      )
      .await;
      c_u.cancel();
      let _ = b_u.join_handle.await;
      assert_eq!(st_u, 200);
      let ju: Value = serde_json::from_slice(&raw_u).unwrap();
      assert!(ju["errors"].is_null(), "{tag} query failed: {ju}");
      assert_eq!(ju["data"]["appConfig"]["redis"]["username"], expected_u, "{tag}");
    }

    //     (c) Malformed percent-encoding and invalid UTF-8 in direct Redis URLs must Err.
    for bad_url in [
      "redis://team%2@127.0.0.1:6379/0",
      "redis://%@127.0.0.1:6379/0",
      "redis://team%GG@127.0.0.1:6379/0",
      "redis://%FF@127.0.0.1:6379/0",
      "redis://%C3%28@127.0.0.1:6379/0",
      "redis://%ED%A0%80@127.0.0.1:6379/0",
    ] {
      assert!(
        server_domain::app_config::RedisRuntimeConfig::from_redis_url(bad_url).is_err(),
        "from_redis_url must reject {bad_url}"
      );
      assert!(
        affine_server::build_server(
          &ServerCli {
            role: Some(RoleArg::Allinone),
            host: IpAddr::V4(Ipv4Addr::LOCALHOST),
            port: 0,
            database_url: db_url.clone(),
            redis_url: Some(bad_url.into()),
            deployment_mode: DeploymentModeArg::Selfhosted,
            skip_schema_check: true,
            ..ServerCli::default()
          },
          Arc::new(CommunityExtension::new()),
          CancellationToken::new(),
        )
        .await
        .is_err(),
        "build_server must reject {bad_url}"
      );
    }

    // 16. File-only Redis username with percent-encoding (no REDIS_* env, no PG override):
    //     GraphQL appConfig.redis.username must return decoded "team@ops" while
    //     appConfigMetadata.redis.username.source remains "file".
    let cfg_file_pct40 = tmp.join("config-redis-file-pct40.json");
    std::fs::write(
      &cfg_file_pct40,
      serde_json::to_vec(&json!({
        "redis": { "host": "127.0.0.1", "port": r_port, "username": "team%40ops" }
      }))
      .unwrap(),
    )
    .unwrap();
    let l_rf = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let p_rf = l_rf.local_addr().unwrap().port();
    drop(l_rf);
    let mut child_rf = tokio::process::Command::new(env!("CARGO_BIN_EXE_affine-server"))
      .kill_on_drop(true)
      .env_remove("REDIS_URL")
      .env_remove("REDIS_SERVER_URL")
      .env_remove("REDIS_SERVER_HOST")
      .env_remove("REDIS_SERVER_PORT")
      .env_remove("REDIS_SERVER_DATABASE")
      .env_remove("REDIS_SERVER_USERNAME")
      .env_remove("REDIS_SERVER_USER")
      .env_remove("REDIS_SERVER_PASSWORD")
      .args([
        "--role",
        "allinone",
        "--host",
        "127.0.0.1",
        "--port",
        &p_rf.to_string(),
        "--database-url",
        &db_url,
        "--skip-schema-check",
        "--config-path",
        cfg_file_pct40.to_str().unwrap(),
      ])
      .stdout(std::process::Stdio::null())
      .stderr(std::process::Stdio::null())
      .spawn()
      .expect("spawn file-only redis pct40 binary");
    let addr_rf = std::net::SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), p_rf);
    let dl_rf = std::time::Instant::now() + std::time::Duration::from_secs(10);
    let mut poll_rf = tokio::time::interval(std::time::Duration::from_millis(25));
    poll_rf.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut ready_rf = false;
    while std::time::Instant::now() < dl_rf {
      if tokio::net::TcpStream::connect(addr_rf).await.is_ok()
        && raw_http(addr_rf, "GET", "/healthz", &[], b"").await.0 == 200
      {
        ready_rf = true;
        break;
      }
      poll_rf.tick().await;
    }
    assert!(ready_rf, "file-only redis pct40 binary failed to become ready");
    let (st_rf, _, raw_rf) = raw_http(
      addr_rf,
      "POST",
      "/graphql",
      &[("Cookie", &cookie), ("Content-Type", "application/json")],
      meta_q.as_bytes(),
    )
    .await;
    let _ = child_rf.kill().await;
    let _ = child_rf.wait().await;
    assert_eq!(st_rf, 200);
    let jrf: Value = serde_json::from_slice(&raw_rf).unwrap();
    assert!(jrf["errors"].is_null(), "file-only redis pct40 query failed: {jrf}");
    assert_eq!(jrf["data"]["appConfig"]["redis"]["username"], "team@ops");
    assert_eq!(
      jrf["data"]["appConfigMetadata"]["redis"]["username"]["source"],
      "file"
    );
  });
}
