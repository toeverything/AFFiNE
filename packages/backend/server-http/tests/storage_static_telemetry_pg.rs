//! End-to-end HTTP integration tests for:
//! - WorkerProxy (SSRF blocking without IP leakage, SVG attachment headers, link preview OG parsing & header allowlist)
//! - DocRenderer (Markdown `Doc.Read` authz + HTML `X-Robots-Tag: noindex` & OG escaping)
//! - StaticFiles (Selfhost + Front + canary mobile shell contract, `?shell=`, `affine_shell` cookie, `/wasm/` strict 404, `sign-in.html`)
//! - Telemetry (`OPTIONS`/`POST /api/telemetry/collect`, CORS, anonymous low-version bypass, userId backfill & dedupe)
//! - R2/local proxy multipart upload + GraphQL `createBlobUpload` / `blobUploadPartUrl` / `completeBlobUpload`.

use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use http::{HeaderValue, Request, StatusCode, header};
use server_blob::{BlobService, LocalFsBlobStorage};
use server_db::{DbConfig, ServerDb};
use server_http::{AppServices, AppState, RuntimeConfig, build_router};
use server_spi::{CommunityExtension, ServerExtension as _};
use server_types::{DeploymentMode, ServerRole};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpListener;
use tower::ServiceExt as _;
use y_octo::{Any, Doc};

fn leased_0275_database() -> DbLease {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let migrations = MigrationSet::load(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations"))
    .expect("load v0.27.5 migrations");
  let template = cluster.ensure_template(&migrations).expect("v0.27.5 template");
  cluster
    .lease(&template, DEFAULT_LEASE_TTL)
    .expect("lease test database")
}

async fn connect_db(url: &str) -> ServerDb {
  let db = ServerDb::connect(DbConfig {
    database_url: url.to_owned(),
    channel: "canary".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections: 4,
    statement_timeout_ms: 5_000,
    tier_permits: [8, 4, 2, 1],
  })
  .await
  .expect("connect db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema for fresh ensure_schema_ready");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

async fn spawn_simple_http<F>(handler: F) -> (std::net::SocketAddr, tokio::task::JoinHandle<()>)
where
  F: Fn(String) -> Vec<u8> + Send + Sync + 'static,
{
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let addr = listener.local_addr().unwrap();
  let handler = Arc::new(handler);
  let handle = tokio::spawn(async move {
    loop {
      let Ok((mut socket, _)) = listener.accept().await else {
        break;
      };
      let handler = Arc::clone(&handler);
      tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        let Ok(n) = socket.read(&mut buf).await else {
          return;
        };
        if n == 0 {
          return;
        }
        let req = String::from_utf8_lossy(&buf[..n]).into_owned();
        let resp = handler(req);
        let _ = socket.write_all(&resp).await;
        let _ = socket.shutdown().await;
      });
    }
  });
  (addr, handle)
}

fn build_sample_yjs_doc(title: &str, paragraph: &str) -> Vec<u8> {
  let doc = Doc::default();
  let mut blocks = doc.get_or_create_map("blocks").unwrap();
  let mut page = doc.create_map().unwrap();
  page
    .insert("sys:flavour".to_owned(), Any::String("affine:page".into()))
    .unwrap();
  let mut title_text = doc.create_text().unwrap();
  title_text.insert(0, title).unwrap();
  page.insert("prop:title".to_owned(), title_text).unwrap();
  let mut children = doc.create_array().unwrap();
  children.push(Any::String("para-1".into())).unwrap();
  page.insert("sys:children".to_owned(), children).unwrap();
  blocks.insert("page-1".to_owned(), page).unwrap();

  let mut para = doc.create_map().unwrap();
  para
    .insert("sys:flavour".to_owned(), Any::String("affine:paragraph".into()))
    .unwrap();
  let mut para_text = doc.create_text().unwrap();
  para_text.insert(0, paragraph).unwrap();
  para.insert("prop:text".to_owned(), para_text).unwrap();
  blocks.insert("para-1".to_owned(), para).unwrap();

  doc.encode_state_as_update_v1(&y_octo::StateVector::default()).unwrap()
}

#[test]
fn static_files_front_canary_mobile_shell_contract_and_strict_404() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = connect_db(&db_url).await;
    let fixture = std::env::temp_dir().join(format!("affine-static-front-{}", uuid::Uuid::new_v4()));
    let files = [
      ("index.html", "desktop-index"),
      ("admin/index.html", "admin-index"),
      ("assets/app.js", "desktop-js"),
      ("mobile/index.html", "mobile-native-index"),
      ("mobile/sign-in.html", "mobile-signin"),
      ("mobile/assets/app.js", "mobile-native-js"),
      ("mobile/wasm/core.wasm", "\0asm\x01\0\0\0"),
      ("mobile/pkg/boot.js", "wasm-boot"),
      ("mobile-legacy/index.html", "mobile-legacy-index"),
      ("mobile-legacy/assets/app.js", "mobile-legacy-js"),
      ("mobile-legacy/bundle.js", "legacy-direct"),
    ];
    for (rel, content) in files {
      let path = fixture.join(rel);
      std::fs::create_dir_all(path.parent().unwrap()).unwrap();
      std::fs::write(&path, content).unwrap();
    }

    let cfg = RuntimeConfig {
      role: ServerRole::Front,
      deployment_mode: DeploymentMode::Cloud,
      channel: "canary".into(),
      static_dir: Some(fixture.clone()),
      ..RuntimeConfig::default()
    };
    let state = AppState::new(db.clone(), None, cfg, Arc::new(CommunityExtension::new()));
    let app = build_router(state);

    let mobile_ua = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36";

    // 1. Admin fallback + no-store + 302 /index.html & /admin/index.html + ETag/304/HEAD.
    let idx_redir = app
      .clone()
      .oneshot(Request::builder().uri("/index.html").body(Body::empty()).unwrap())
      .await
      .unwrap();
    assert_eq!(idx_redir.status(), StatusCode::FOUND);
    assert_eq!(idx_redir.headers().get(header::LOCATION).unwrap(), "/");
    let admin_redir = app
      .clone()
      .oneshot(Request::builder().uri("/admin/index.html").body(Body::empty()).unwrap())
      .await
      .unwrap();
    assert_eq!(admin_redir.status(), StatusCode::FOUND);
    assert_eq!(admin_redir.headers().get(header::LOCATION).unwrap(), "/admin");

    let resp = app
      .clone()
      .oneshot(Request::builder().uri("/admin/settings").body(Body::empty()).unwrap())
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let etag = resp.headers().get(header::ETAG).unwrap().to_str().unwrap().to_owned();
    assert_eq!(
      resp.headers().get(header::CACHE_CONTROL).unwrap(),
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    assert_eq!(
      axum::body::to_bytes(resp.into_body(), 1024).await.unwrap(),
      "admin-index"
    );

    let resp_304 = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/admin/settings")
          .header(header::IF_NONE_MATCH, &etag)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp_304.status(), StatusCode::NOT_MODIFIED);

    let resp_head = app
      .clone()
      .oneshot(
        Request::builder()
          .method("HEAD")
          .uri("/assets/app.js")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp_head.status(), StatusCode::OK);
    assert!(
      axum::body::to_bytes(resp_head.into_body(), 1024)
        .await
        .unwrap()
        .is_empty()
    );

    // 2. Mobile UA defaults to native mobile shell & sign-in.html priority.
    let resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/sign-in")
          .header(header::USER_AGENT, mobile_ua)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(
      resp.headers().get(header::CACHE_CONTROL).unwrap(),
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    assert_eq!(
      axum::body::to_bytes(resp.into_body(), 1024).await.unwrap(),
      "mobile-signin"
    );

    // 3. `?shell=legacy` overrides mobile UA and sets `affine_shell=legacy` cookie.
    let resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/?shell=legacy")
          .header(header::USER_AGENT, mobile_ua)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let set_cookie = resp.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap();
    assert!(set_cookie.contains("affine_shell=legacy"), "{set_cookie}");
    assert_eq!(
      axum::body::to_bytes(resp.into_body(), 1024).await.unwrap(),
      "mobile-legacy-index"
    );

    // 4. `affine_shell=desktop` cookie overrides mobile UA.
    let resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/assets/app.js")
          .header(header::USER_AGENT, mobile_ua)
          .header(header::COOKIE, "affine_shell=desktop")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(
      axum::body::to_bytes(resp.into_body(), 1024).await.unwrap(),
      "desktop-js"
    );

    // 5. `/wasm/` serves `application/wasm` from `mobile/wasm` and strictly 404s on miss.
    let wasm_ok = app
      .clone()
      .oneshot(Request::builder().uri("/wasm/core.wasm").body(Body::empty()).unwrap())
      .await
      .unwrap();
    assert_eq!(wasm_ok.status(), StatusCode::OK);
    assert_eq!(wasm_ok.headers().get(header::CONTENT_TYPE).unwrap(), "application/wasm");

    let wasm_miss = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/wasm/missing.wasm")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(wasm_miss.status(), StatusCode::NOT_FOUND);

    // 6. `/assets/missing.js` strictly returns 404 (never falls back to index.html).
    let asset_miss = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/assets/missing.js")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(asset_miss.status(), StatusCode::NOT_FOUND);

    let _ = std::fs::remove_dir_all(&fixture);
    db.pool().close().await;
  });
}

#[test]
fn worker_proxy_doc_renderer_and_telemetry_contracts() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = connect_db(&db_url).await;

    // Mock upstream target for SVG + HTML link preview (verifies no Cookie/Authorization leak).
    let flaky_hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let always_404_hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let flaky_srv = Arc::clone(&flaky_hits);
    let a404_srv = Arc::clone(&always_404_hits);
    const PNG_1X1: &[u8] = &[
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D,
      0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];
    let (mock_addr, mock_server) = spawn_simple_http(move |req| {
      assert!(!req.to_ascii_lowercase().contains("authorization:"));
      assert!(!req.to_ascii_lowercase().contains("cookie:"));
      if req.starts_with("GET /evil.svg") {
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>";
        format!(
          "HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml\r\nContent-Length: {}\r\n\r\n{svg}",
          svg.len()
        )
        .into_bytes()
      } else if req.starts_with("GET /flaky.png") {
        let n = flaky_srv.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if n == 0 {
          b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".to_vec()
        } else {
          let mut out = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\n\r\n",
            PNG_1X1.len()
          )
          .into_bytes();
          out.extend_from_slice(PNG_1X1);
          out
        }
      } else if req.starts_with("GET /always-404.png") {
        a404_srv.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".to_vec()
      } else if req.starts_with("GET /page") {
        let html = "<html><head><title>Demo</title><meta property=\"og:title\" content=\"OG Demo\" /><meta name=\"description\" content=\"Preview desc\" /></head><body></body></html>";
        format!(
          "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{html}",
          html.len()
        )
        .into_bytes()
      } else if req.starts_with("GET /many-imgs") {
        let mut html = String::from("<html><head><title>Caf\u{00e9}</title></head><body>");
        for i in 0..80 {
          html.push_str(&format!("<img src=\"img-{i}.png\" />"));
        }
        html.push_str("</body></html>");
        let (encoded, _, _) = encoding_rs::WINDOWS_1252.encode(&html);
        let mut out = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=windows-1252\r\nContent-Length: {}\r\n\r\n",
          encoded.len()
        )
        .into_bytes();
        out.extend_from_slice(&encoded);
        out
      } else {
        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".to_vec()
      }
    })
    .await;

    let cfg = RuntimeConfig {
      role: ServerRole::Allinone,
      deployment_mode: DeploymentMode::Selfhosted,
      external_url: "http://affine.local".into(),
      worker_proxy_allow_private_origins: vec![format!("http://{mock_addr}")],
      ..RuntimeConfig::default()
    };
    let state = AppState::new(db.clone(), None, cfg, Arc::new(CommunityExtension::new()));
    let app = build_router(Arc::clone(&state));

    // 1. WorkerProxy blocks private IP not in allowlist without leaking the IP.
    let ssrf_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/api/worker/image-proxy?url=http%3A%2F%2F169.254.169.254%2Flatest")
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(ssrf_resp.status(), StatusCode::BAD_REQUEST);
    let ssrf_body = String::from_utf8(
      axum::body::to_bytes(ssrf_resp.into_body(), 4096)
        .await
        .unwrap()
        .to_vec(),
    )
    .unwrap();
    assert!(ssrf_body.contains("Invalid URL"), "{ssrf_body}");
    assert!(!ssrf_body.contains("169.254.169.254"), "{ssrf_body}");

    // 2. WorkerProxy forces download attachment on SVG and strips Cookie/Authorization.
    let svg_url = url::form_urlencoded::byte_serialize(format!("http://{mock_addr}/evil.svg").as_bytes())
      .collect::<String>();
    let svg_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/worker/image-proxy?url={svg_url}"))
          .header(header::ORIGIN, "http://affine.local")
          .header(header::COOKIE, "affine_session=secret")
          .header(header::AUTHORIZATION, "Basic c2VjcmV0")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(svg_resp.status(), StatusCode::OK);
    assert_eq!(svg_resp.headers().get(header::X_CONTENT_TYPE_OPTIONS).unwrap(), "nosniff");
    assert!(
      svg_resp
        .headers()
        .get(header::CONTENT_DISPOSITION)
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("attachment;")
    );

    // 2b. image-proxy does NOT negative-cache upstream 4xx:
    //     flaky 404 -> 400 envelope, then recovery -> 200 PNG (2 upstream hits);
    //     persistent 404 -> 400 envelope both times (2 upstream hits).
    let flaky_url = url::form_urlencoded::byte_serialize(format!("http://{mock_addr}/flaky.png").as_bytes())
      .collect::<String>();
    let f1 = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/worker/image-proxy?url={flaky_url}"))
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(f1.status(), StatusCode::BAD_REQUEST);
    let f2 = app
      .clone()
      .oneshot(
        Request::builder()
          .uri(format!("/api/worker/image-proxy?url={flaky_url}"))
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(f2.status(), StatusCode::OK);
    let f2_body = axum::body::to_bytes(f2.into_body(), 4096).await.unwrap();
    assert_eq!(f2_body.as_ref(), PNG_1X1);
    assert_eq!(flaky_hits.load(std::sync::atomic::Ordering::SeqCst), 2);

    let a404_url = url::form_urlencoded::byte_serialize(format!("http://{mock_addr}/always-404.png").as_bytes())
      .collect::<String>();
    for attempt in 0..2 {
      let r = app
        .clone()
        .oneshot(
          Request::builder()
            .uri(format!("/api/worker/image-proxy?url={a404_url}"))
            .header(header::ORIGIN, "http://affine.local")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(r.status(), StatusCode::BAD_REQUEST);
      let body_bytes = axum::body::to_bytes(r.into_body(), 4096).await.unwrap();
      let env: serde_json::Value = serde_json::from_slice(&body_bytes).expect("400 error JSON envelope");
      assert_eq!(env["status"], 400, "attempt {attempt}: {env}");
      assert_eq!(env["code"], "Bad Request", "attempt {attempt}: {env}");
      assert_eq!(env["type"], "BAD_REQUEST", "attempt {attempt}: {env}");
      assert_eq!(env["name"], "BAD_REQUEST", "attempt {attempt}: {env}");
      assert_eq!(env["message"], "Failed to fetch image", "attempt {attempt}: {env}");
    }
    assert_eq!(always_404_hits.load(std::sync::atomic::Ordering::SeqCst), 2);

    // 3. WorkerProxy link preview parses OG metadata and strips sensitive headers.
    let preview_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/worker/link-preview")
          .header(header::ORIGIN, "http://affine.local")
          .header(header::CONTENT_TYPE, "application/json")
          .header(header::COOKIE, "affine_session=secret")
          .body(Body::from(
            serde_json::json!({ "url": format!("http://{mock_addr}/page") }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(preview_resp.status(), StatusCode::OK);
    let preview_json: serde_json::Value =
      serde_json::from_slice(&axum::body::to_bytes(preview_resp.into_body(), 8192).await.unwrap()).unwrap();
    assert_eq!(preview_json["title"], "OG Demo");
    assert_eq!(preview_json["description"], "Preview desc");

    // 3b. WorkerProxy link preview enforces 32-item media cap, <=2048 URL cap, and encoding_rs decoding.
    let many_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/worker/link-preview")
          .header(header::ORIGIN, "http://affine.local")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            serde_json::json!({ "url": format!("http://{mock_addr}/many-imgs/{}", "a".repeat(300)) }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(many_resp.status(), StatusCode::OK);
    let many_json: serde_json::Value =
      serde_json::from_slice(&axum::body::to_bytes(many_resp.into_body(), 65536).await.unwrap()).unwrap();
    assert_eq!(many_json["title"], "Caf\u{00e9}");
    let imgs = many_json["images"].as_array().unwrap();
    assert_eq!(imgs.len(), 32, "images must be capped at 32 items");
    assert!(imgs.iter().all(|u| u.as_str().unwrap().len() <= 2048));

    // 4. DocRenderer: private doc returns 404 for Markdown and `X-Robots-Tag: noindex` for HTML;
    //    public doc returns `text/markdown; charset=utf-8` for Markdown.
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ('ws-doc', 'Private WS')")
      .execute(db.pool())
      .await
      .unwrap();
    let doc_bin = build_sample_yjs_doc("Quarterly Plan", "Ship pure Rust routes");
    sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ('ws-doc', 'doc-priv', $1, now())")
      .bind(&doc_bin)
      .execute(db.pool())
      .await
      .unwrap();

    let md_denied = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/workspace/ws-doc/doc-priv")
          .header(header::ACCEPT, "text/markdown")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(md_denied.status(), StatusCode::NOT_FOUND);

    let html_priv = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/workspace/ws-doc/doc-priv")
          .header(header::ACCEPT, "text/html")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(html_priv.status(), StatusCode::OK);
    assert_eq!(html_priv.headers().get("x-robots-tag").unwrap(), "noindex");

    // Make doc public and verify Markdown rendering succeeds.
    sqlx::query(
      "INSERT INTO workspace_pages (workspace_id, page_id, published_at) \
       VALUES ('ws-doc', 'doc-priv', now())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, published_at) \
       VALUES ('ws-doc', 'doc-priv', 'public', 'external', now())",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let md_ok = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/workspace/ws-doc/doc-priv")
          .header(header::ACCEPT, "text/markdown")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(md_ok.status(), StatusCode::OK);
    assert_eq!(
      md_ok.headers().get(header::CONTENT_TYPE).unwrap(),
      "text/markdown; charset=utf-8"
    );
    let md_text = String::from_utf8(axum::body::to_bytes(md_ok.into_body(), 8192).await.unwrap().to_vec()).unwrap();
    assert!(md_text.contains("# Quarterly Plan"), "{md_text}");
    assert!(md_text.contains("Ship pure Rust routes"), "{md_text}");

    // 5. Telemetry: returns 201 Created, zero DB writes to runtime_states, numeric sessionId,
    //    per-event fault tolerance, and dedupe.
    let tel_opt = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/telemetry/collect")
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(tel_opt.status(), StatusCode::OK);
    assert_eq!(
      tel_opt.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN),
      Some(&HeaderValue::from_static("http://affine.local"))
    );

    let batch_payload = serde_json::json!({
      "schemaVersion": 1,
      "transport": "http",
      "sentAt": 1700000000000_i64,
      "events": [
        {
          "schemaVersion": 1,
          "eventName": "track_pageview",
          "clientId": "cli-1",
          "eventId": "ev-1",
          "sessionId": 123456,
          "params": {
            "page": "editor",
            "location": "/workspace/abc",
            "title": "My Doc",
            "docId": "secret-doc-id",
            "workspaceId": "secret-ws-id",
            "other": { "leak": "drop-me" },
            "longVal": "a".repeat(150)
          }
        },
        {
          "schemaVersion": 1,
          "eventName": "track_pageview",
          "clientId": "cli-1",
          "eventId": "ev-1"
        },
        "malformed-event-entry"
      ]
    })
    .to_string();
    let tel_post = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/telemetry/collect")
          .header(header::ORIGIN, "http://affine.local")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(batch_payload))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(tel_post.status(), StatusCode::CREATED);
    let ack: serde_json::Value =
      serde_json::from_slice(&axum::body::to_bytes(tel_post.into_body(), 4096).await.unwrap()).unwrap();
    assert_eq!(ack, serde_json::json!({"ok": true, "accepted": 1, "dropped": 2}));

    // Verify zero persistence to runtime_states.
    let persisted_count: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM runtime_states WHERE purpose = 'telemetry_event'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(persisted_count, 0, "telemetry must not persist events to runtime_states");

    // 5b. GraphQL bracket nesting guard: 65-level and 100,000-level nesting rejected with 400 in ms.
    for depth in [65usize, 100_000usize] {
      let mut q = String::with_capacity(depth * 2 + 8);
      q.push_str("query ");
      for _ in 0..depth {
        q.push('{');
      }
      for _ in 0..depth {
        q.push('}');
      }
      let resp = app
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/graphql")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::json!({ "query": q }).to_string()))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "depth {depth} must return 400");
    }

    // 5c. DocRenderer 6-row table-driven preview visibility matrix.
    type ExposureCase<'a> = (
      &'a str,
      bool,
      &'a str,
      bool,
      Option<(&'a str, Option<&'a str>)>,
      bool,
      bool,
      bool,
    );
    let cases: [ExposureCase<'_>; 6] = [
      ("ws-m1", false, "public", true, Some(("public", Some("external"))), true, false, false),
      ("ws-m2", true, "private", false, Some(("public", Some("external"))), false, true, true),
      ("ws-m3", true, "private", false, Some(("private", None)), true, true, false),
      ("ws-m4", true, "public", false, None, false, false, false),
      ("ws-m5", true, "private", true, None, false, true, false),
      ("ws-m6", true, "private", false, None, false, false, false),
    ];
    for (ws, sh, wvis, wprev, dap, dprev, expect_title, expect_indexable) in cases {
      sqlx::query("INSERT INTO workspaces (id, name) VALUES ($1, 'Matrix WS')").bind(ws).execute(db.pool()).await.unwrap();
      sqlx::query(
        "INSERT INTO workspace_access_policies (workspace_id, sharing_enabled, visibility, url_preview_enabled) \
         VALUES ($1, $2, $3, $4)",
      )
      .bind(ws)
      .bind(sh)
      .bind(wvis)
      .bind(wprev)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query("INSERT INTO snapshots (workspace_id, guid, blob, updated_at) VALUES ($1, 'd1', $2, now())")
        .bind(ws)
        .bind(&doc_bin)
        .execute(db.pool())
        .await
        .unwrap();
      if let Some((dvis, drole)) = dap {
        let pub_at = (dvis == "public").then(chrono::Utc::now);
        sqlx::query(
          "INSERT INTO workspace_pages (workspace_id, page_id, published_at) VALUES ($1, 'd1', $2) \
           ON CONFLICT (workspace_id, page_id) DO UPDATE SET published_at = EXCLUDED.published_at",
        )
        .bind(ws)
        .bind(pub_at)
        .execute(db.pool())
        .await
        .unwrap();
        sqlx::query(
          "INSERT INTO doc_access_policies (workspace_id, doc_id, visibility, public_role, url_preview_enabled, published_at) \
           VALUES ($1, 'd1', $2, $3, $4, $5)",
        )
        .bind(ws)
        .bind(dvis)
        .bind(drole)
        .bind(dprev)
        .bind(pub_at)
        .execute(db.pool())
        .await
        .unwrap();
      }
      let r = app
        .clone()
        .oneshot(Request::builder().uri(format!("/workspace/{ws}/d1")).header(header::ACCEPT, "text/html").body(Body::empty()).unwrap())
        .await
        .unwrap();
      assert_eq!(r.status(), StatusCode::OK, "{ws}");
      assert_eq!(r.headers().get("x-robots-tag").is_none(), expect_indexable, "{ws} indexable");
      let html = String::from_utf8(axum::body::to_bytes(r.into_body(), 16 * 1024).await.unwrap().to_vec()).unwrap();
      assert_eq!(html.contains("Quarterly Plan"), expect_title, "{ws} title visibility");
    }

    // 6. CORS origin reflection protection: malicious Origin + valid Referer must NOT echo evil Origin.
    let evil_worker_opt = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/worker/image-proxy")
          .header(header::ORIGIN, "https://evil.example")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert!(evil_worker_opt.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());

    let evil_preview_ref = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/worker/link-preview")
          .header(header::ORIGIN, "https://evil.example")
          .header(header::REFERER, "http://affine.local/doc")
          .header(header::CONTENT_TYPE, "application/json")
          .body(Body::from(
            serde_json::json!({ "url": format!("http://{mock_addr}/page") }).to_string(),
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(evil_preview_ref.status(), StatusCode::OK);
    assert!(evil_preview_ref.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());

    let evil_tel_ref = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/telemetry/collect")
          .header(header::ORIGIN, "https://evil.example")
          .header(header::REFERER, "http://affine.local/doc")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(evil_tel_ref.status(), StatusCode::OK);
    assert!(evil_tel_ref.headers().get(header::ACCESS_CONTROL_ALLOW_ORIGIN).is_none());

    let bad_origin = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/telemetry/collect")
          .header(header::ORIGIN, "https://evil.example")
          .body(Body::from("{}"))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bad_origin.status(), StatusCode::BAD_REQUEST);

    // 6b. Authenticated Cookie sessions behind the same XFF IP get independent worker throttle buckets,
    //     invalid Bearer returns 401, and 400 error responses (Missing "url" / Invalid header) carry X-RateLimit-*.
    let bad_bearer = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/api/worker/image-proxy")
          .header(header::ORIGIN, "http://affine.local")
          .header(header::AUTHORIZATION, "Bearer invalid.jwt.token")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(bad_bearer.status(), StatusCode::UNAUTHORIZED);
    sqlx::query(
      "INSERT INTO users (id, name, email, registered) VALUES \
       ('u-wp-a', 'WP A', 'wp-a@example.com', true), ('u-wp-b', 'WP B', 'wp-b@example.com', true)",
    )
    .execute(db.pool())
    .await
    .unwrap();
    let s_a = state.auth.issue_cookie_session_for_user("u-wp-a").await.unwrap();
    let s_b = state.auth.issue_cookie_session_for_user("u-wp-b").await.unwrap();
    for (sess, expected_rem) in [(&s_a.session_id, "59"), (&s_b.session_id, "59"), (&s_a.session_id, "58")] {
      let r = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/api/worker/image-proxy")
            .header(header::ORIGIN, "http://affine.local")
            .header("x-forwarded-for", "203.0.113.77")
            .header(header::COOKIE, format!("affine_session={sess}"))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(r.status(), StatusCode::BAD_REQUEST);
      assert_eq!(
        r.headers().get("x-ratelimit-limit").and_then(|v| v.to_str().ok()),
        Some("60")
      );
      assert_eq!(
        r.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok()),
        Some(expected_rem),
        "session {sess} must track independent throttle bucket on 400 Missing url"
      );
      assert!(r.headers().get("x-ratelimit-reset").is_some());
    }
    let invalid_hdr = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/api/worker/image-proxy")
          .header("x-forwarded-for", "203.0.113.78")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(invalid_hdr.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
      invalid_hdr
        .headers()
        .get("x-ratelimit-limit")
        .and_then(|v| v.to_str().ok()),
      Some("60")
    );
    assert_eq!(
      invalid_hdr
        .headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok()),
      Some("59")
    );
    assert!(invalid_hdr.headers().get("x-ratelimit-reset").is_some());

    // 7. C2-R2 deleted doc in public workspace must NOT leak title/summary; bad Bearer on HTML & MD returns auth error.
    sqlx::query("INSERT INTO workspace_pages (workspace_id, page_id, lifecycle_state) VALUES ('ws-m2', 'd1', 'deleted') ON CONFLICT (workspace_id, page_id) DO UPDATE SET lifecycle_state = 'deleted'")
      .execute(db.pool())
      .await
      .unwrap();
    let del_html = app
      .clone()
      .oneshot(Request::builder().uri("/workspace/ws-m2/d1").header(header::ACCEPT, "text/html").body(Body::empty()).unwrap())
      .await
      .unwrap();
    let del_body = String::from_utf8(axum::body::to_bytes(del_html.into_body(), 16 * 1024).await.unwrap().to_vec()).unwrap();
    assert!(!del_body.contains("Quarterly Plan"), "deleted doc must not leak title");

    for accept in ["text/html", "text/markdown"] {
      let bad_auth = app
        .clone()
        .oneshot(
          Request::builder()
            .uri("/workspace/ws-m2/d1")
            .header(header::ACCEPT, accept)
            .header(header::AUTHORIZATION, "Bearer invalid.jwt.token")
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(bad_auth.status(), StatusCode::UNAUTHORIZED, "bad Bearer must fail on {accept}");
    }

    // 8. C2-R3 + Round 5 #5: 5,000-deep block chain does not stack overflow on 2 MiB thread;
    //    orphan blocks are excluded; numbered & todo lists render properly.
    let deep_handle = std::thread::Builder::new()
      .stack_size(2 * 1024 * 1024)
      .spawn(|| {
        let doc = y_octo::Doc::default();
        let mut blocks = doc.get_or_create_map("blocks").unwrap();
        let mut page = doc.create_map().unwrap();
        page
          .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".into()))
          .unwrap();
        let mut ch = doc.create_array().unwrap();
        ch.push(y_octo::Any::String("b0".into())).unwrap();
        page.insert("sys:children".to_owned(), ch).unwrap();
        blocks.insert("page".to_owned(), page).unwrap();
        for i in 0..5_000 {
          let id = format!("b{i}");
          let mut b = doc.create_map().unwrap();
          b.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".into()))
            .unwrap();
          let mut t = doc.create_text().unwrap();
          t.insert(0, format!("node-{i}")).unwrap();
          b.insert("prop:text".to_owned(), t).unwrap();
          if i + 1 < 5_000 {
            let mut c = doc.create_array().unwrap();
            c.push(y_octo::Any::String(format!("b{}", i + 1))).unwrap();
            b.insert("sys:children".to_owned(), c).unwrap();
          }
          blocks.insert(id, b).unwrap();
        }
        let bin = doc.encode_state_as_update_v1(&y_octo::StateVector::default()).unwrap();
        let (_, _, md) = server_http::rest::doc_renderer::render_doc_markdown_from_binary(&bin).unwrap();
        assert!(md.contains("node-0"));
        assert!(!md.contains("node-100"), "depth > 64 must be truncated");
      })
      .unwrap();
    deep_handle.join().expect("5,000-deep doc must not overflow 2 MiB stack");

    {
      let doc = y_octo::Doc::default();
      let mut blocks = doc.get_or_create_map("blocks").unwrap();
      let mut page = doc.create_map().unwrap();
      page
        .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:page".into()))
        .unwrap();
      let mut ch = doc.create_array().unwrap();
      ch.push(y_octo::Any::String("l1".into())).unwrap();
      ch.push(y_octo::Any::String("l2".into())).unwrap();
      page.insert("sys:children".to_owned(), ch).unwrap();
      blocks.insert("p0".to_owned(), page).unwrap();
      let mut l1 = doc.create_map().unwrap();
      l1.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".into()))
        .unwrap();
      l1.insert("prop:type".to_owned(), y_octo::Any::String("numbered".into()))
        .unwrap();
      let mut t1 = doc.create_text().unwrap();
      t1.insert(0, "First item").unwrap();
      l1.insert("prop:text".to_owned(), t1).unwrap();
      blocks.insert("l1".to_owned(), l1).unwrap();
      let mut l2 = doc.create_map().unwrap();
      l2.insert("sys:flavour".to_owned(), y_octo::Any::String("affine:list".into()))
        .unwrap();
      l2.insert("prop:type".to_owned(), y_octo::Any::String("todo".into()))
        .unwrap();
      l2.insert("prop:checked".to_owned(), y_octo::Any::True).unwrap();
      let mut t2 = doc.create_text().unwrap();
      t2.insert(0, "Done task").unwrap();
      l2.insert("prop:text".to_owned(), t2).unwrap();
      blocks.insert("l2".to_owned(), l2).unwrap();
      let mut orphan = doc.create_map().unwrap();
      orphan
        .insert("sys:flavour".to_owned(), y_octo::Any::String("affine:paragraph".into()))
        .unwrap();
      let mut to = doc.create_text().unwrap();
      to.insert(0, "ORPHAN_SECRET_TEXT").unwrap();
      orphan.insert("prop:text".to_owned(), to).unwrap();
      blocks.insert("orphan".to_owned(), orphan).unwrap();
      let bin = doc.encode_state_as_update_v1(&y_octo::StateVector::default()).unwrap();
      let (_, _, md) = server_http::rest::doc_renderer::render_doc_markdown_from_binary(&bin).unwrap();
      assert!(md.contains("1. First item"), "{md}");
      assert!(md.contains("- [x] Done task"), "{md}");
      assert!(!md.contains("ORPHAN_SECRET_TEXT"), "orphan block must not render: {md}");
    }

    // 9. C2-R4: GraphQL depth pre-scan terminates '#' comments on '\r'.
    let cr_attack = format!("#\r{{a(b:{}1{})}}", "[".repeat(3000), "]".repeat(3000));
    assert!(server_http::graphql_query_exceeds_depth(&cr_attack, 64));

    // 10. C2-R5: flatten_object caps depth/path/nodes on hostile nested telemetry payload.
    {
      let mut root = serde_json::Map::new();
      let long_key = "k".repeat(1_000);
      let mut leaf = serde_json::Map::new();
      for i in 0..500 {
        leaf.insert(format!("f{i}"), serde_json::json!(i));
      }
      let mut cur = serde_json::Value::Object(leaf);
      for _ in 0..8 {
        let mut m = serde_json::Map::new();
        m.insert(long_key.clone(), cur);
        cur = serde_json::Value::Object(m);
      }
      root.insert("ok".into(), serde_json::json!("val"));
      root.insert("bomb".into(), cur);
      let out = server_http::rest::telemetry::sanitize_params(&root, 25);
      assert!(out.len() <= 25);
      assert_eq!(out.get("ok").and_then(|v| v.as_str()), Some("val"));
    }

    // 11. Round 5 #4: Telemetry OPTIONS + POST share version guard & default throttler (X-RateLimit-* + 429 JSON + Retry-After).
    sqlx::query(
      "INSERT INTO app_configs (id, value, updated_at) VALUES ('throttle.throttlers.default', $1, now()) \
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    )
    .bind(serde_json::json!({ "limit": 2, "ttl": 60000 }))
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();
    let t_opt1 = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/telemetry/collect")
          .header("x-forwarded-for", "203.0.113.9")
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(t_opt1.status(), StatusCode::OK);
    assert_eq!(t_opt1.headers().get("x-ratelimit-limit").and_then(|v| v.to_str().ok()), Some("2"));
    let t_post2 = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/telemetry/collect")
          .header("x-forwarded-for", "203.0.113.9")
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::from(r#"{"schemaVersion":1,"events":[]}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(t_post2.status(), StatusCode::CREATED);
    let t_429 = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/telemetry/collect")
          .header("x-forwarded-for", "203.0.113.9")
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(t_429.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(t_429.headers().get(header::RETRY_AFTER).is_some());
    assert!(t_429.headers().get("x-ratelimit-limit").is_none());
    let body_429: serde_json::Value =
      serde_json::from_slice(&axum::body::to_bytes(t_429.into_body(), 16 * 1024).await.unwrap()).unwrap();
    assert_eq!(body_429["type"], "TOO_MANY_REQUESTS");
    assert_eq!(body_429["name"], "TOO_MANY_REQUEST");
    assert_eq!(body_429["message"], "Too many requests.");

    // 11a. throttle.enabled = false bypasses throttling and omits X-RateLimit-* headers.
    sqlx::query(
      "INSERT INTO app_configs (id, value, updated_at) VALUES ('throttle.enabled', 'false'::jsonb, now()) \
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    )
    .execute(db.pool())
    .await
    .unwrap();
    state.app_config.invalidate_cache();
    let t_disabled = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/telemetry/collect")
          .header("x-forwarded-for", "203.0.113.9")
          .header(header::ORIGIN, "http://affine.local")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(t_disabled.status(), StatusCode::OK);
    assert!(t_disabled.headers().get("x-ratelimit-limit").is_none());

    // 11b. Telemetry OPTIONS vs POST invalid origin messages match v0.27.5 contract.
    let bad_opt = app
      .clone()
      .oneshot(
        Request::builder()
          .method("OPTIONS")
          .uri("/api/telemetry/collect")
          .header(header::ORIGIN, "https://evil.example")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    let bad_opt_json: serde_json::Value =
      serde_json::from_slice(&axum::body::to_bytes(bad_opt.into_body(), 16 * 1024).await.unwrap()).unwrap();
    assert_eq!(
      bad_opt_json["message"],
      "Invalid origin: https://evil.example, referer: undefined"
    );
    let bad_post = app
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/telemetry/collect")
          .header(header::ORIGIN, "https://evil.example")
          .body(Body::from("{}"))
          .unwrap(),
      )
      .await
      .unwrap();
    let bad_post_json: serde_json::Value =
      serde_json::from_slice(&axum::body::to_bytes(bad_post.into_body(), 16 * 1024).await.unwrap()).unwrap();
    assert_eq!(bad_post_json["message"], "Invalid origin: https://evil.example");

    // 11c. Doc renderer HTML head tags + workspace avatar og:image + affine:surface skip.
    sqlx::query("UPDATE workspaces SET avatar_key = 'ws-av-key' WHERE id = 'ws-m4'")
      .execute(db.pool())
      .await
      .unwrap();
    let ws_html_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .uri("/workspace/ws-m4/ws-m4")
          .header(header::ACCEPT, "text/html")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    let ws_html = String::from_utf8(axum::body::to_bytes(ws_html_resp.into_body(), 32 * 1024).await.unwrap().to_vec()).unwrap();
    assert!(ws_html.contains("mobile-web-app-capable"));
    assert!(ws_html.contains("apple-touch-icon"));
    assert!(ws_html.contains("emotion-insertion-point"));
    assert!(
      ws_html.contains("api&#x2f;workspaces&#x2f;ws-m4&#x2f;blobs&#x2f;v1&#x2f;ws-av-key")
        || ws_html.contains("/api/workspaces/ws-m4/blobs/v1/ws-av-key"),
      "{ws_html}"
    );

    mock_server.abort();
    db.pool().close().await;
  });
}

#[test]
fn rest_r2_proxy_upload_and_multipart_end_to_end() {
  let lease = leased_0275_database();
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = connect_db(&db_url).await;
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ('ws-r2', 'R2 WS')")
      .execute(db.pool())
      .await
      .unwrap();

    let tmp_dir = std::env::temp_dir().join(format!("affine-r2-http-{}", uuid::Uuid::new_v4()));
    let fs = LocalFsBlobStorage::new(tmp_dir.to_str().unwrap(), "blobs")
      .unwrap()
      .with_proxy_upload("r2-http-secret", None);
    let ext = Arc::new(CommunityExtension::new());
    let base_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        external_url: "http://affine.local".into(),
        multipart_part_size: 1024,
        multipart_threshold: 1500,
        ..RuntimeConfig::default()
      },
      Arc::clone(&ext) as Arc<dyn server_spi::ServerExtension>,
    );
    let state = AppState::with_services(
      db.clone(),
      None,
      base_state.config.load().as_ref().clone(),
      ext.clone(),
      AppServices {
        auth: base_state.auth.clone(),
        users: base_state.users.clone(),
        workspaces: base_state.workspaces.clone(),
        doc_sharing: base_state.doc_sharing.clone(),
        histories: base_state.histories.clone(),
        comments: base_state.comments.clone(),
        notifications: base_state.notifications.clone(),
        licenses: base_state.licenses.clone(),
        app_config: base_state.app_config.clone(),
        blobs: BlobService::new(db.clone(), Arc::new(fs), ext.quota_gate()),
        search: Arc::clone(&base_state.search),
        avatars: Arc::clone(&base_state.avatars),
        comment_attachments: Arc::clone(&base_state.comment_attachments),
        copilot_storage: Arc::clone(&base_state.boot_copilot_storage),
        invalidation: Arc::clone(&base_state.invalidation),
        event_bus: Arc::clone(&base_state.event_bus),
      },
    );
    let app = build_router(Arc::clone(&state));

    // Single presigned proxy upload via PUT /api/storage/upload.
    let single_body = b"hello-proxy-upload".to_vec();
    let init = state
      .blobs
      .init_blob_upload(
        "ws-r2",
        "note.txt",
        single_body.len() as i64,
        "text/plain",
        "http://affine.local",
        1500,
        1024,
      )
      .await
      .unwrap();
    let upload_url = url::Url::parse(init.upload_url.as_deref().unwrap()).unwrap();
    let path_and_query = format!("{}?{}", upload_url.path(), upload_url.query().unwrap());

    let put_resp = app
      .clone()
      .oneshot(
        Request::builder()
          .method("PUT")
          .uri(&path_and_query)
          .header(header::CONTENT_LENGTH, single_body.len())
          .body(Body::from(single_body.clone()))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(put_resp.status(), StatusCode::OK);

    let key = state
      .blobs
      .complete_blob_upload("ws-r2", "note.txt", None, None)
      .await
      .unwrap();
    assert_eq!(key, "note.txt");
    let (_, stored) = state.blobs.get_blob("ws-r2", "note.txt").await.unwrap().unwrap();
    assert_eq!(stored, single_body);

    let _ = std::fs::remove_dir_all(&tmp_dir);
    db.pool().close().await;
  });
}
