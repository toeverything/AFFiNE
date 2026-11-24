use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use chrono::{Duration, Utc};
use server_db::{DbConfig, ServerDb};
use server_domain::calendar::caldav::{CalendarCaldavAuthType, CalendarCaldavConfig, CalendarCaldavProviderPreset};
use server_domain::calendar::crypto::{decrypt_token, encrypt_token};
use server_domain::calendar::google::CalendarGoogleConfig;
use server_domain::calendar::sync::{SyncSubscriptionOptions, poll_due_calendar_subscriptions, sync_subscription};
use server_domain::calendar::{
  CalendarError, CalendarProviderName, CalendarService, EffectiveCalendarConfigs, LinkCaldavInput, TokenPatch,
  UpsertCalendarAccountParams, WorkspaceCalendarItemPatch,
};
use sqlx::Row;
use test_db_harness::pg::PgCluster;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
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

async fn spawn_http_mock<F>(handler: F) -> (SocketAddr, tokio::task::JoinHandle<()>)
where
  F: Fn(String) -> Vec<u8> + Send + Sync + 'static,
{
  let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind loopback");
  let addr = listener.local_addr().expect("local addr");
  let handler = Arc::new(handler);
  let handle = tokio::spawn(async move {
    loop {
      let Ok((mut socket, _)) = listener.accept().await else {
        break;
      };
      let handler = Arc::clone(&handler);
      tokio::spawn(async move {
        let mut buf = vec![0u8; 16384];
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

#[test]
fn calendar_account_token_encryption_preserves_omitted_refresh_token_and_clears_explicitly() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 2).await;
    let user_id = insert_user(&db, "cal-crypto@example.com").await;
    let private_key = "calendar-crypto-integration-secret";
    let svc = CalendarService::new(db.clone(), private_key.to_owned(), "http://localhost:3010".to_owned());

    let created = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_id.clone(),
        provider: CalendarProviderName::Google,
        provider_account_id: "google-acct-1".to_owned(),
        display_name: Some("Primary".to_owned()),
        email: Some("cal-crypto@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("access-v1".to_owned()),
        refresh_token: TokenPatch::Set("refresh-v1".to_owned()),
        expires_at: Some(Utc::now() + Duration::hours(1)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("create account");

    let enc_access = created.access_token_encrypted.as_deref().expect("enc access");
    let enc_refresh = created.refresh_token_encrypted.as_deref().expect("enc refresh");
    assert_eq!(
      BASE64_STANDARD.decode(enc_access).unwrap().len(),
      12 + 12 + "access-v1".len()
    );
    assert_eq!(decrypt_token(private_key, enc_access).unwrap(), "access-v1");
    assert_eq!(decrypt_token(private_key, enc_refresh).unwrap(), "refresh-v1");
    assert!(decrypt_token("wrong-key", enc_refresh).is_err());

    let kept = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_id.clone(),
        provider: CalendarProviderName::Google,
        provider_account_id: "google-acct-1".to_owned(),
        display_name: Some("Primary Updated".to_owned()),
        email: Some("cal-crypto@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("access-v2".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: Some(Utc::now() + Duration::hours(2)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("keep refresh token");
    assert_eq!(
      decrypt_token(private_key, kept.access_token_encrypted.as_deref().unwrap()).unwrap(),
      "access-v2"
    );
    assert_eq!(
      decrypt_token(private_key, kept.refresh_token_encrypted.as_deref().unwrap()).unwrap(),
      "refresh-v1"
    );

    let cleared = svc
      .update_account_tokens(&created.id, TokenPatch::Keep, TokenPatch::Clear, None, None, None, None)
      .await
      .expect("clear refresh token");
    assert!(cleared.refresh_token_encrypted.is_none());
    assert_eq!(
      decrypt_token(private_key, cleared.access_token_encrypted.as_deref().unwrap()).unwrap(),
      "access-v2"
    );

    let mut raw = BASE64_STANDARD
      .decode(encrypt_token(private_key, "t").unwrap())
      .unwrap();
    raw[12] ^= 0xff;
    assert!(decrypt_token(private_key, &BASE64_STANDARD.encode(raw)).is_err());

    db.pool().close().await;
  });
}

#[test]
fn caldav_discovery_basic_digest_ssrf_and_single_connection_pool_sync() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    // Use max_connections = 1 to prove zero PgPool connection holding during external CalDAV HTTP I/O.
    let db = connect_test_db(&db_url, 1).await;
    let user_id = insert_user(&db, "caldav-user@example.com").await;

    let expected_basic = format!(
      "Basic {}",
      BASE64_STANDARD.encode("caldav-user@example.com:caldav-pass")
    );
    let expected_basic_clone = expected_basic.clone();
    let (caldav_addr, caldav_srv) = spawn_http_mock(move |req| {
      let first_line = req.lines().next().unwrap_or("");
      let has_basic = req
        .lines()
        .any(|l| l.to_ascii_lowercase().starts_with("authorization:") && l.contains(&expected_basic_clone));
      if !has_basic {
        return b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"CalDAV\"\r\nContent-Length: 0\r\n\r\n"
          .to_vec();
      }
      if first_line.starts_with("PROPFIND /.well-known/caldav ") {
        return b"HTTP/1.1 302 Found\r\nLocation: /caldav/\r\nContent-Length: 0\r\n\r\n".to_vec();
      }
      if first_line.starts_with("PROPFIND /caldav/ ") {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/caldav/</d:href>
    <d:propstat>
      <d:prop><d:current-user-principal><d:href>/principals/user/</d:href></d:current-user-principal></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;
        return format!(
          "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
          xml.len(),
          xml
        )
        .into_bytes();
      }
      if first_line.starts_with("PROPFIND /principals/user/ ") {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/principals/user/</d:href>
    <d:propstat>
      <d:prop><c:calendar-home-set><d:href>/calendars/user/</d:href></c:calendar-home-set></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;
        return format!(
          "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
          xml.len(),
          xml
        )
        .into_bytes();
      }
      if first_line.starts_with("PROPFIND /calendars/user/ ") {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/">
  <d:response>
    <d:href>/calendars/user/home/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Home</d:displayname>
        <d:resourcetype><d:collection /><c:calendar /></d:resourcetype>
        <c:calendar-timezone>BEGIN:VTIMEZONE
TZID:UTC
END:VTIMEZONE</c:calendar-timezone>
        <ic:calendar-color>#ff0000</ic:calendar-color>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;
        return format!(
          "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
          xml.len(),
          xml
        )
        .into_bytes();
      }
      if first_line.starts_with("REPORT /calendars/user/home/ ") {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/calendars/user/home/evt-1.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-1"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-1
DTSTART:20261125T090000Z
DTEND:20261125T100000Z
SUMMARY:Team Standup
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;
        return format!(
          "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
          xml.len(),
          xml
        )
        .into_bytes();
      }
      b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".to_vec()
    })
    .await;

    let server_url = format!("http://{caldav_addr}");
    let configs = EffectiveCalendarConfigs {
      google: CalendarGoogleConfig::default(),
      caldav: CalendarCaldavConfig {
        enabled: true,
        allow_custom_provider: Some(false),
        providers: vec![CalendarCaldavProviderPreset {
          id: "local-basic".to_owned(),
          label: "Local Basic".to_owned(),
          server_url: server_url.clone(),
          auth_type: Some(CalendarCaldavAuthType::Auto),
          requires_app_password: Some(false),
          docs_url: None,
        }],
        allow_insecure_http: Some(true),
        allowed_hosts: Some(vec![]),
        block_private_network: Some(false),
        request_timeout_ms: Some(5_000),
        max_redirects: Some(5),
      },
    };

    let svc = CalendarService::new(db.clone(), "caldav-test-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(configs);
    let account = svc
      .link_caldav_account(
        &user_id,
        LinkCaldavInput {
          provider_preset_id: "local-basic".to_owned(),
          username: "caldav-user@example.com".to_owned(),
          password: "caldav-pass".to_owned(),
          display_name: Some("Local CalDAV".to_owned()),
        },
      )
      .await
      .expect("link caldav account under max_connections=1");
    assert_eq!(account.calendars_count, 1);

    let event_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM calendar_events WHERE title = 'Team Standup'")
      .fetch_one(db.pool())
      .await
      .expect("count synced events");
    assert_eq!(event_count, 1);

    let strict_configs = EffectiveCalendarConfigs {
      google: CalendarGoogleConfig::default(),
      caldav: CalendarCaldavConfig {
        enabled: true,
        allow_custom_provider: Some(false),
        providers: vec![CalendarCaldavProviderPreset {
          id: "ssrf-target".to_owned(),
          label: "SSRF Target".to_owned(),
          server_url,
          auth_type: Some(CalendarCaldavAuthType::Basic),
          requires_app_password: None,
          docs_url: None,
        }],
        allow_insecure_http: Some(true),
        allowed_hosts: Some(vec![]),
        block_private_network: Some(true),
        request_timeout_ms: Some(5_000),
        max_redirects: Some(5),
      },
    };
    let strict_svc = CalendarService::new(db.clone(), "caldav-test-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(strict_configs);
    let ssrf_err = strict_svc
      .link_caldav_account(
        &user_id,
        LinkCaldavInput {
          provider_preset_id: "ssrf-target".to_owned(),
          username: "u".to_owned(),
          password: "p".to_owned(),
          display_name: None,
        },
      )
      .await
      .unwrap_err();
    match ssrf_err {
      CalendarError::BadRequest { code, .. } => assert_eq!(code, "caldav_private_network"),
      other => panic!("expected caldav_private_network, got {other:?}"),
    }

    let digest_hits = Arc::new(AtomicUsize::new(0));
    let digest_hits_clone = Arc::clone(&digest_hits);
    let (digest_addr, digest_srv) = spawn_http_mock(move |req| {
      let first_line = req.lines().next().unwrap_or("");
      let has_digest = req
        .lines()
        .any(|l| l.to_ascii_lowercase().starts_with("authorization:") && l.contains("Digest ") && l.contains("response=\""));
      if !has_digest {
        return b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Digest realm=\"CalDAV\", nonce=\"abc123\", qop=\"auth\", algorithm=SHA-256\r\nContent-Length: 0\r\n\r\n".to_vec();
      }
      digest_hits_clone.fetch_add(1, Ordering::SeqCst);
      if first_line.contains("/.well-known/caldav") {
        let xml = r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:current-user-principal><d:href>/p/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#;
        return format!("HTTP/1.1 207 Multi-Status\r\nContent-Length: {}\r\n\r\n{}", xml.len(), xml).into_bytes();
      }
      if first_line.contains(" /p/ ") {
        let xml = r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>/h/</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>"#;
        return format!("HTTP/1.1 207 Multi-Status\r\nContent-Length: {}\r\n\r\n{}", xml.len(), xml).into_bytes();
      }
      let empty = r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>"#;
      format!("HTTP/1.1 207 Multi-Status\r\nContent-Length: {}\r\n\r\n{}", empty.len(), empty).into_bytes()
    })
    .await;

    let digest_configs = EffectiveCalendarConfigs {
      google: CalendarGoogleConfig::default(),
      caldav: CalendarCaldavConfig {
        enabled: true,
        allow_custom_provider: Some(false),
        providers: vec![CalendarCaldavProviderPreset {
          id: "local-digest".to_owned(),
          label: "Local Digest".to_owned(),
          server_url: format!("http://{digest_addr}"),
          auth_type: Some(CalendarCaldavAuthType::Auto),
          requires_app_password: None,
          docs_url: None,
        }],
        allow_insecure_http: Some(true),
        allowed_hosts: Some(vec![]),
        block_private_network: Some(false),
        request_timeout_ms: Some(5_000),
        max_redirects: Some(5),
      },
    };
    let digest_svc = CalendarService::new(db.clone(), "caldav-test-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(digest_configs);
    let digest_acct = digest_svc
      .link_caldav_account(
        &user_id,
        LinkCaldavInput {
          provider_preset_id: "local-digest".to_owned(),
          username: "digest-user".to_owned(),
          password: "digest-pass".to_owned(),
          display_name: None,
        },
      )
      .await
      .expect("digest caldav account");
    assert_eq!(digest_acct.auth_type.as_deref(), Some("digest"));
    assert!(digest_hits.load(Ordering::SeqCst) >= 2);

    caldav_srv.abort();
    digest_srv.abort();
    db.pool().close().await;
  });
}

#[test]
fn google_sync_token_410_fallback_and_polling_under_single_pg_connection() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 1).await;
    let user_id = insert_user(&db, "gcal@example.com").await;

    let (mock_addr, mock_srv) = spawn_http_mock(|req| {
      let first_line = req.lines().next().unwrap_or("");
      if first_line.contains("syncToken=stale-token") {
        return b"HTTP/1.1 410 Gone\r\nContent-Type: application/json\r\nContent-Length: 23\r\n\r\n{\"error\":\"sync_expired\"}"
          .to_vec();
      }
      let body = r#"{"items":[{"id":"g-evt-1","status":"confirmed","summary":"Full Resync Event","start":{"dateTime":"2026-11-25T12:00:00Z"},"end":{"dateTime":"2026-11-25T13:00:00Z"}}],"nextSyncToken":"fresh-token-2"}"#;
      format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
      )
      .into_bytes()
    })
    .await;

    let configs = EffectiveCalendarConfigs {
      google: CalendarGoogleConfig {
        enabled: true,
        allow_new_accounts: Some(true),
        client_id: "cid".to_owned(),
        client_secret: "csec".to_owned(),
        api_base_override: Some(format!("http://{mock_addr}")),
        ..CalendarGoogleConfig::default()
      },
      caldav: CalendarCaldavConfig::default(),
    };
    let svc = CalendarService::new(db.clone(), "gcal-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(configs);

    let acct = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_id.clone(),
        provider: CalendarProviderName::Google,
        provider_account_id: "g-1".to_owned(),
        display_name: None,
        email: Some("gcal@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("google-access".to_owned()),
        refresh_token: TokenPatch::Set("google-refresh".to_owned()),
        expires_at: Some(Utc::now() + Duration::hours(1)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("create google account");

    let sub_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO calendar_subscriptions (
           id, account_id, provider, external_calendar_id, display_name, enabled,
           sync_token, next_sync_at, created_at, updated_at
         ) VALUES ($1, $2, 'google', 'primary', 'Primary', true, 'stale-token', clock_timestamp() - interval '5 minutes', clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&sub_id)
    .bind(&acct.id)
    .execute(db.pool())
    .await
    .expect("insert sub");

    let polled = poll_due_calendar_subscriptions(&svc)
      .await
      .expect("poll due subscriptions");
    assert_eq!(polled, 1);

    let row = sqlx::query("SELECT sync_token FROM calendar_subscriptions WHERE id = $1")
      .bind(&sub_id)
      .fetch_one(db.pool())
      .await
      .expect("load sub");
    let new_token: Option<String> = row.get("sync_token");
    assert_eq!(new_token.as_deref(), Some("fresh-token-2"));

    let evt_title: String = sqlx::query_scalar("SELECT title FROM calendar_events WHERE subscription_id = $1")
      .bind(&sub_id)
      .fetch_one(db.pool())
      .await
      .expect("load synced event");
    assert_eq!(evt_title, "Full Resync Event");

    sync_subscription(&svc, &sub_id, SyncSubscriptionOptions::default())
      .await
      .expect("direct sync");

    mock_srv.abort();
    db.pool().close().await;
  });
}

#[test]
fn update_workspace_calendars_blocks_cross_user_subscription_binding() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 2).await;
    let user_a = insert_user(&db, "cal-owner-a@example.com").await;
    let user_b = insert_user(&db, "cal-attacker-b@example.com").await;
    let ws_a = insert_workspace(&db, &user_a).await;
    let ws_b = insert_workspace(&db, &user_b).await;

    let svc = CalendarService::new(db.clone(), "cal-acl-key".to_owned(), "http://localhost:3010".to_owned());
    let acct_a = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_a.clone(),
        provider: CalendarProviderName::Google,
        provider_account_id: "acct-a".to_owned(),
        display_name: None,
        email: Some("cal-owner-a@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("tok-a".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: None,
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("create acct A");
    let sub_a = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, enabled, next_sync_at, created_at, updated_at)
         VALUES ($1, $2, 'google', 'private-a', true, clock_timestamp(), clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&sub_a)
    .bind(&acct_a.id)
    .execute(db.pool())
    .await
    .expect("insert sub A");

    let err = svc
      .update_workspace_calendars(
        &ws_b,
        &user_b,
        &[WorkspaceCalendarItemPatch {
          subscription_id: sub_a.clone(),
          sort_order: Some(0),
          color_override: None,
        }],
      )
      .await
      .unwrap_err();
    assert!(matches!(err, CalendarError::Domain(server_types::DomainError::Forbidden(_))));
    assert!(svc.get_workspace_calendars(&ws_b).await.expect("list ws B").is_empty());

    let bound = svc
      .update_workspace_calendars(
        &ws_a,
        &user_a,
        &[WorkspaceCalendarItemPatch {
          subscription_id: sub_a.clone(),
          sort_order: Some(0),
          color_override: None,
        }],
      )
      .await
      .expect("user A binds own subscription");
    assert_eq!(bound.items.len(), 1);
    assert_eq!(bound.items[0].subscription_id, sub_a);

    db.pool().close().await;
  });
}

#[test]
fn all_day_dst_midnight_and_sync_does_not_bypass_next_sync_at() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 2).await;
    let user_id = insert_user(&db, "cal-dst-due@example.com").await;

    let provider_hits = Arc::new(AtomicUsize::new(0));
    let provider_hits_clone = Arc::clone(&provider_hits);
    let (mock_addr, mock_srv) = spawn_http_mock(move |_req| {
      provider_hits_clone.fetch_add(1, Ordering::SeqCst);
      let body = r#"{"items":[{"id":"allday-auckland","status":"confirmed","summary":"NZ DST","start":{"date":"2026-09-27","timeZone":"Pacific/Auckland"},"end":{"date":"2026-09-28","timeZone":"Pacific/Auckland"}},{"id":"allday-tokyo","status":"confirmed","summary":"Tokyo Day","start":{"date":"2026-01-02","timeZone":"Asia/Tokyo"},"end":{"date":"2026-01-03","timeZone":"Asia/Tokyo"}}],"nextSyncToken":"tok-dst-1"}"#;
      format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
      )
      .into_bytes()
    })
    .await;

    let google = CalendarGoogleConfig {
      enabled: true,
      client_id: "cid".to_owned(),
      client_secret: "csec".to_owned(),
      api_base_override: Some(format!("http://{mock_addr}")),
      ..CalendarGoogleConfig::default()
    };
    let svc = CalendarService::new(db.clone(), "cal-dst-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(EffectiveCalendarConfigs {
        google,
        caldav: CalendarCaldavConfig::default(),
      });

    let acct = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id,
        provider: CalendarProviderName::Google,
        provider_account_id: "acct-dst".to_owned(),
        display_name: None,
        email: Some("cal-dst-due@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("tok-dst".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: Some(Utc::now() + chrono::Duration::hours(2)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("upsert account");

    let sub_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, enabled, next_sync_at, created_at, updated_at)
         VALUES ($1, $2, 'google', 'primary', true, clock_timestamp() - interval '1 minute', clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&sub_id)
    .bind(&acct.id)
    .execute(db.pool())
    .await
    .expect("insert due sub");

    // First poll claims and syncs once, advancing next_sync_at into the future.
    let synced = poll_due_calendar_subscriptions(&svc).await.expect("first poll");
    assert_eq!(synced, 1);
    assert_eq!(provider_hits.load(Ordering::SeqCst), 1);

    // Calling sync_subscription directly afterwards must NOT bypass next_sync_at <= clock_timestamp().
    sync_subscription(&svc, &sub_id, SyncSubscriptionOptions::default())
      .await
      .expect("second sync no-op");
    assert_eq!(provider_hits.load(Ordering::SeqCst), 1);

    // Verify all-day DST midnight conversion matches v0.27.5 service.ts:834-839.
    let nz_start: chrono::DateTime<Utc> =
      sqlx::query_scalar("SELECT start_at_utc FROM calendar_events WHERE external_event_id = 'allday-auckland'")
        .fetch_one(db.pool())
        .await
        .expect("nz start");
    assert_eq!(nz_start.to_rfc3339(), "2026-09-26T11:00:00+00:00");
    let tokyo_start: chrono::DateTime<Utc> =
      sqlx::query_scalar("SELECT start_at_utc FROM calendar_events WHERE external_event_id = 'allday-tokyo'")
        .fetch_one(db.pool())
        .await
        .expect("tokyo start");
    assert_eq!(tokyo_start.to_rfc3339(), "2026-01-01T15:00:00+00:00");

    mock_srv.abort();
    db.pool().close().await;
  });
}

#[test]
fn list_workspace_events_syncs_only_target_workspace_and_survives_background_write_failure() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 2).await;
    let user_a = insert_user(&db, "ws-a-sync@example.com").await;
    let user_b = insert_user(&db, "ws-b-sync@example.com").await;
    let ws_a = insert_workspace(&db, &user_a).await;
    let ws_b = insert_workspace(&db, &user_b).await;

    let hits_a = Arc::new(AtomicUsize::new(0));
    let hits_b = Arc::new(AtomicUsize::new(0));
    let notify_a = Arc::new(tokio::sync::Notify::new());
    let hits_a_c = Arc::clone(&hits_a);
    let hits_b_c = Arc::clone(&hits_b);
    let notify_a_c = Arc::clone(&notify_a);
    let (mock_addr, mock_srv) = spawn_http_mock(move |req| {
      let first_line = req.lines().next().unwrap_or("");
      if first_line.contains("/calendars/cal-a/events") {
        hits_a_c.fetch_add(1, Ordering::SeqCst);
        notify_a_c.notify_one();
      } else if first_line.contains("/calendars/cal-b/events") {
        hits_b_c.fetch_add(1, Ordering::SeqCst);
      }
      let body = r#"{"items":[],"nextSyncToken":"tok-targeted"}"#;
      format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
      )
      .into_bytes()
    })
    .await;

    let svc = CalendarService::new(db.clone(), "cal-targeted-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(EffectiveCalendarConfigs {
        google: CalendarGoogleConfig {
          enabled: true,
          client_id: "cid".to_owned(),
          client_secret: "csec".to_owned(),
          api_base_override: Some(format!("http://{mock_addr}")),
          ..CalendarGoogleConfig::default()
        },
        caldav: CalendarCaldavConfig::default(),
      });

    let acct_a = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_a.clone(),
        provider: CalendarProviderName::Google,
        provider_account_id: "acct-ws-a".to_owned(),
        display_name: None,
        email: Some("ws-a-sync@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("tok-a".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: Some(Utc::now() + Duration::hours(2)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("acct a");
    let acct_b = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: user_b.clone(),
        provider: CalendarProviderName::Google,
        provider_account_id: "acct-ws-b".to_owned(),
        display_name: None,
        email: Some("ws-b-sync@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("tok-b".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: Some(Utc::now() + Duration::hours(2)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("acct b");

    let sub_a = Uuid::new_v4().to_string();
    let sub_b = Uuid::new_v4().to_string();
    for (sid, aid, ext) in [(&sub_a, &acct_a.id, "cal-a"), (&sub_b, &acct_b.id, "cal-b")] {
      sqlx::query(
        r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, enabled, next_sync_at, created_at, updated_at)
           VALUES ($1, $2, 'google', $3, true, clock_timestamp() - interval '2 minutes', clock_timestamp(), clock_timestamp())"#,
      )
      .bind(sid)
      .bind(aid)
      .bind(ext)
      .execute(db.pool())
      .await
      .expect("insert due sub");
    }

    let cal_a = svc
      .update_workspace_calendars(
        &ws_a,
        &user_a,
        &[WorkspaceCalendarItemPatch {
          subscription_id: sub_a.clone(),
          sort_order: Some(0),
          color_override: None,
        }],
      )
      .await
      .expect("bind ws a");
    let _cal_b = svc
      .update_workspace_calendars(
        &ws_b,
        &user_b,
        &[WorkspaceCalendarItemPatch {
          subscription_id: sub_b.clone(),
          sort_order: Some(0),
          color_override: None,
        }],
      )
      .await
      .expect("bind ws b");

    let now = Utc::now();
    sqlx::query(
      r#"INSERT INTO calendar_events (id, subscription_id, external_event_id, status, title, start_at_utc, end_at_utc, all_day, raw, created_at, updated_at)
         VALUES ($1, $2, 'ev-a-1', 'confirmed', 'Existing Event A', $3, $4, false, '{}'::jsonb, clock_timestamp(), clock_timestamp())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&sub_a)
    .bind(now)
    .bind(now + Duration::hours(1))
    .execute(db.pool())
    .await
    .expect("seed event a");

    let events = svc
      .list_workspace_events(&cal_a.id, now - Duration::hours(1), now + Duration::hours(2))
      .await
      .expect("list ws a events");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].title.as_deref(), Some("Existing Event A"));

    tokio::time::timeout(std::time::Duration::from_secs(5), notify_a.notified())
      .await
      .expect("sub_a background sync should fire");
    assert_eq!(hits_a.load(Ordering::SeqCst), 1);
    assert_eq!(hits_b.load(Ordering::SeqCst), 0, "workspace B due sub must not be synced");

    // Simulate background write failure via a trigger rejecting UPDATE on calendar_subscriptions:
    // list_workspace_events must still return cached events without error.
    sqlx::query("UPDATE calendar_subscriptions SET next_sync_at = clock_timestamp() - interval '2 minutes', sync_claimed_until = NULL WHERE id = $1")
      .bind(&sub_a)
      .execute(db.pool())
      .await
      .expect("mark sub_a due again");
    sqlx::query(
      r#"CREATE OR REPLACE FUNCTION fail_sub_update() RETURNS trigger AS $$
         BEGIN RAISE EXCEPTION 'read-only simulation'; END;
         $$ LANGUAGE plpgsql;"#,
    )
    .execute(db.pool())
    .await
    .expect("create fail trigger fn");
    sqlx::query("CREATE TRIGGER trg_fail_sub_update BEFORE UPDATE ON calendar_subscriptions FOR EACH ROW EXECUTE FUNCTION fail_sub_update()")
      .execute(db.pool())
      .await
      .expect("create fail trigger");

    let events_after_fail = svc
      .list_workspace_events(&cal_a.id, now - Duration::hours(1), now + Duration::hours(2))
      .await
      .expect("read path must survive background write failure");
    assert_eq!(events_after_fail.len(), 1);

    mock_srv.abort();
    db.pool().close().await;
  });
}

#[test]
fn caldav_sync_persists_all_day_overflow_and_floating_24h_events_with_sync_token() {
  if let Ok(mode) = std::env::var("AFFINE_CAL_SYNC_TZ_SUBPROC_TEST") {
    let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
    let lease = lease_test_db(&cluster);
    let db_url = lease.url().to_owned();
    let rt = test_runtime();
    rt.block_on(async {
      let db = connect_test_db(&db_url, 1).await;
      let (g_addr, g_srv) = spawn_http_mock(|_req| {
        let body = r#"{"items":[{"id":"g-naive-dt","status":"confirmed","summary":"Naive DT","start":{"dateTime":"2026-07-01T10:20:30","timeZone":"Europe/Paris"},"end":{"dateTime":"2026-07-01T11:20:30","timeZone":"Europe/Paris"}},{"id":"g-naive-9999","status":"confirmed","summary":"Naive 9999","start":{"dateTime":"9999-12-30T23:00:00"},"end":{"dateTime":"9999-12-30T23:30:00"}}],"nextSyncToken":"tok-tz-ok"}"#;
        format!(
          "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
          body.len(),
          body
        )
        .into_bytes()
      })
      .await;
      let g_svc = CalendarService::new(db.clone(), "cal-tz-key".to_owned(), "http://localhost:3010".to_owned())
        .with_config_override(EffectiveCalendarConfigs {
          google: CalendarGoogleConfig {
            enabled: true,
            client_id: "cid".to_owned(),
            client_secret: "csec".to_owned(),
            api_base_override: Some(format!("http://{g_addr}")),
            ..CalendarGoogleConfig::default()
          },
          caldav: CalendarCaldavConfig::default(),
        });
      let g_acct = g_svc
        .upsert_account(UpsertCalendarAccountParams {
          user_id: insert_user(&db, "g-tz-subproc@example.com").await,
          provider: CalendarProviderName::Google,
          provider_account_id: "acct-g-tz".to_owned(),
          display_name: None,
          email: Some("g-tz-subproc@example.com".to_owned()),
          provider_preset_id: None,
          server_url: None,
          principal_url: None,
          calendar_home_url: None,
          username: None,
          auth_type: None,
          access_token: TokenPatch::Set("tok-g-tz".to_owned()),
          refresh_token: TokenPatch::Keep,
          expires_at: Some(Utc::now() + chrono::Duration::hours(2)),
          scope: None,
          status: "active".to_owned(),
          last_error: None,
          refresh_interval_minutes: 30,
        })
        .await
        .expect("upsert tz acct");
      let g_sub_id = Uuid::new_v4().to_string();
      sqlx::query(
        r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, timezone, enabled, next_sync_at, created_at, updated_at)
           VALUES ($1, $2, 'google', 'primary', 'UTC', true, clock_timestamp() - interval '1 minute', clock_timestamp(), clock_timestamp())"#,
      )
      .bind(&g_sub_id)
      .bind(&g_acct.id)
      .execute(db.pool())
      .await
      .expect("insert tz sub");
      sync_subscription(&g_svc, &g_sub_id, SyncSubscriptionOptions::default())
        .await
        .expect("sync naive dateTime under TZ");
      let start_at: chrono::DateTime<Utc> = sqlx::query_scalar(
        "SELECT start_at_utc FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-naive-dt'",
      )
      .bind(&g_sub_id)
      .fetch_one(db.pool())
      .await
      .expect("fetch naive dateTime event");
      let (expected, expected_9999) = match mode.as_str() {
        "utc" => ("2026-07-01T10:20:30+00:00", "9999-12-30T23:00:00+00:00"),
        "ny" => ("2026-07-01T14:20:30+00:00", "9999-12-31T04:00:00+00:00"),
        other => panic!("unexpected AFFINE_CAL_SYNC_TZ_SUBPROC_TEST={other}"),
      };
      assert_eq!(start_at.to_rfc3339(), expected);
      let start_9999: chrono::DateTime<Utc> = sqlx::query_scalar(
        "SELECT start_at_utc FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-naive-9999'",
      )
      .bind(&g_sub_id)
      .fetch_one(db.pool())
      .await
      .expect("fetch naive 9999 event");
      assert_eq!(start_9999.to_rfc3339(), expected_9999);
      let (tz_tok, tz_retry): (Option<String>, i32) =
        sqlx::query_as("SELECT sync_token, sync_retry_count FROM calendar_subscriptions WHERE id = $1")
          .bind(&g_sub_id)
          .fetch_one(db.pool())
          .await
          .expect("fetch tz sub state");
      assert_eq!(tz_tok.as_deref(), Some("tok-tz-ok"));
      assert_eq!(tz_retry, 0);
      g_srv.abort();
      db.pool().close().await;
    });
    return;
  }
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let db = connect_test_db(&db_url, 2).await;
    let user_id = insert_user(&db, "caldav-overflow@example.com").await;

    let (mock_addr, mock_srv) = spawn_http_mock(move |_req| {
      let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/cal/allday-feb30.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e-allday"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday-feb30
SUMMARY:All Day Feb30
DTSTART;VALUE=DATE:20260228
DTEND;VALUE=DATE:20260230
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/cal/floating-24h.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e-float24"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:floating-24h
SUMMARY:Floating 24h
DTSTART:20260701T090000
DTEND:20260701T240000
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/cal/bad-date-tz.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"e-badtz"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:bad-date-tz
SUMMARY:Mars All Day
DTSTART;VALUE=DATE;TZID=Mars/Olympus_Mons:20260701
DTEND;VALUE=DATE;TZID=Mars/Olympus_Mons:20260702
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:sync-token>https://caldav.example/sync/overflow-ok</D:sync-token>
</D:multistatus>"#;
      format!(
        "HTTP/1.1 207 Multi-Status\r\nContent-Type: application/xml\r\nContent-Length: {}\r\n\r\n{}",
        xml.len(),
        xml
      )
      .into_bytes()
    })
    .await;

    let svc = CalendarService::new(db.clone(), "cal-overflow-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(EffectiveCalendarConfigs {
        google: CalendarGoogleConfig::default(),
        caldav: CalendarCaldavConfig {
          enabled: true,
          allow_custom_provider: Some(true),
          allow_insecure_http: Some(true),
          allowed_hosts: Some(vec![]),
          block_private_network: Some(false),
          request_timeout_ms: Some(5000),
          ..CalendarCaldavConfig::default()
        },
      });

    let acct = svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id,
        provider: CalendarProviderName::CalDAV,
        provider_account_id: "acct-caldav-overflow".to_owned(),
        display_name: Some("CalDAV Overflow".to_owned()),
        email: Some("caldav-overflow@example.com".to_owned()),
        provider_preset_id: None,
        server_url: Some(format!("http://{mock_addr}")),
        principal_url: Some(format!("http://{mock_addr}/principal/")),
        calendar_home_url: Some(format!("http://{mock_addr}/cal/")),
        username: Some("u".to_owned()),
        auth_type: Some("basic".to_owned()),
        access_token: TokenPatch::Set("p".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: None,
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("upsert caldav account");

    let sub_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, timezone, enabled, sync_token, next_sync_at, created_at, updated_at)
         VALUES ($1, $2, 'caldav', $3, 'UTC', true, 'https://caldav.example/sync/prev', clock_timestamp() - interval '1 minute', clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&sub_id)
    .bind(&acct.id)
    .bind(format!("http://{mock_addr}/cal/"))
    .execute(db.pool())
    .await
    .expect("insert caldav sub");

    sync_subscription(&svc, &sub_id, SyncSubscriptionOptions::default())
      .await
      .expect("sync caldav overflow events");

    let (allday_end, allday_flag): (chrono::DateTime<Utc>, bool) = sqlx::query_as(
      "SELECT end_at_utc, all_day FROM calendar_events WHERE subscription_id = $1 AND title = 'All Day Feb30'",
    )
    .bind(&sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch allday event");
    assert_eq!(allday_end.to_rfc3339(), "2026-03-02T00:00:00+00:00");
    assert!(allday_flag);

    let (float_end, float_flag): (chrono::DateTime<Utc>, bool) = sqlx::query_as(
      "SELECT end_at_utc, all_day FROM calendar_events WHERE subscription_id = $1 AND title = 'Floating 24h'",
    )
    .bind(&sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch floating 24h event");
    assert_eq!(float_end.to_rfc3339(), "2026-07-02T00:00:00+00:00");
    assert!(!float_flag);

    let (sync_token, retry_cnt, last_error): (Option<String>, i32, Option<String>) = sqlx::query_as(
      "SELECT s.sync_token, s.sync_retry_count, a.last_error FROM calendar_subscriptions s JOIN calendar_accounts a ON a.id = s.account_id WHERE s.id = $1",
    )
    .bind(&sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch sync_token and last_error");
    assert_eq!(
      sync_token.as_deref(),
      Some("https://caldav.example/sync/overflow-ok")
    );
    assert_eq!(retry_cnt, 0);
    assert!(last_error.is_none());
    let mars_count: i64 =
      sqlx::query_scalar("SELECT COUNT(*) FROM calendar_events WHERE subscription_id = $1 AND title = 'Mars All Day'")
        .bind(&sub_id)
        .fetch_one(db.pool())
        .await
        .expect("count mars event");
    assert_eq!(mars_count, 0, "bad-TZ DATE event must be skipped without aborting batch");

    mock_srv.abort();

    // Google sync: updated:"" -> provider_updated_at IS NULL, dateTime:"" + date:"2026-07-01" -> all_day=true,
    // and non-empty invalid ISO dateTime aborts batch without advancing sync_token.
    let call_idx = Arc::new(AtomicUsize::new(0));
    let call_idx_c = Arc::clone(&call_idx);
    let (g_addr, g_srv) = spawn_http_mock(move |_req| {
      let body = match call_idx_c.fetch_add(1, Ordering::SeqCst) {
        0 => r#"{"items":[{"id":"g-empty-upd","status":"confirmed","summary":"Empty Updated","updated":"","start":{"dateTime":"2026-07-01T10:00:00Z"},"end":{"dateTime":"2026-07-01T11:00:00Z"}},{"id":"g-empty-dt","status":"confirmed","summary":"Empty DateTime","start":{"dateTime":"","date":"2026-07-01"},"end":{"dateTime":"","date":"2026-07-02"}},{"id":"g-js-float","status":"confirmed","summary":"JS Float Date","start":{"date":"2026-7.5-01"},"end":{"date":"2026-07-02"}},{"id":"g-js-exp","status":"confirmed","summary":"JS Exp Date","start":{"date":"2026-7e0-01"},"end":{"date":"2026-07-02"}},{"id":"g-js-hex","status":"confirmed","summary":"JS Hex Date","start":{"date":"2026-0x07-01"},"end":{"date":"2026-07-02"}},{"id":"g-js-half-month","status":"confirmed","summary":"JS Half Month","start":{"date":"2026-0.5-01"},"end":{"date":"2026-01-02"}},{"id":"g-js-large-day","status":"confirmed","summary":"JS Large Day","start":{"date":"2026-07-1000001"},"end":{"date":"4764-05-29"}},{"id":"g-js-nel-skip","status":"confirmed","summary":"JS NEL Skip","start":{"date":"2026-\u008507-01"},"end":{"date":"2026-07-02"}},{"id":"g-naive-dt","status":"confirmed","summary":"Naive DateTime","start":{"dateTime":"2026-07-01T10:20:30","timeZone":"Europe/Paris"},"end":{"dateTime":"2026-07-01T11:20:30","timeZone":"Europe/Paris"}},{"id":"g-bad-date","status":"confirmed","summary":"Bad Date Skip","start":{"date":"not-a-date"},"end":{"date":"2026-07-02"}},{"id":"g-extra-date","status":"confirmed","summary":"Extra Date Seg","start":{"date":"2026-07-01-extra"},"end":{"date":"2026-07-02-extra"}},{"id":"g-lower-tz","status":"confirmed","summary":"Lower t/z +0800","start":{"dateTime":"2026-07-01t10:20:30z"},"end":{"dateTime":"2026-07-01T19:20:30+0800"}}],"nextSyncToken":"tok-empty-ok"}"#,
        1 => r#"{"items":[{"id":"g-bad-iso","status":"confirmed","summary":"Bad ISO","start":{"dateTime":"2026-13-01T10:00:00Z"},"end":{"dateTime":"2026-13-01T11:00:00Z"}}],"nextSyncToken":"tok-should-not-advance"}"#,
        _ => r#"{"items":[{"id":"g-tokyo-fallback","status":"confirmed","summary":"Tokyo Fallback","start":{"date":"2026-07-01"},"end":{"date":"2026-07-02"}}],"nextSyncToken":"tok-tokyo-ok"}"#,
      };
      format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
      )
      .into_bytes()
    })
    .await;
    let g_svc = CalendarService::new(db.clone(), "cal-overflow-key".to_owned(), "http://localhost:3010".to_owned())
      .with_config_override(EffectiveCalendarConfigs {
        google: CalendarGoogleConfig {
          enabled: true,
          client_id: "cid".to_owned(),
          client_secret: "csec".to_owned(),
          api_base_override: Some(format!("http://{g_addr}")),
          ..CalendarGoogleConfig::default()
        },
        caldav: CalendarCaldavConfig::default(),
      });
    let g_acct = g_svc
      .upsert_account(UpsertCalendarAccountParams {
        user_id: insert_user(&db, "g-empty-falsy@example.com").await,
        provider: CalendarProviderName::Google,
        provider_account_id: "acct-g-falsy".to_owned(),
        display_name: None,
        email: Some("g-empty-falsy@example.com".to_owned()),
        provider_preset_id: None,
        server_url: None,
        principal_url: None,
        calendar_home_url: None,
        username: None,
        auth_type: None,
        access_token: TokenPatch::Set("tok-g-falsy".to_owned()),
        refresh_token: TokenPatch::Keep,
        expires_at: Some(Utc::now() + chrono::Duration::hours(2)),
        scope: None,
        status: "active".to_owned(),
        last_error: None,
        refresh_interval_minutes: 30,
      })
      .await
      .expect("upsert g falsy acct");
    let g_sub_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, timezone, enabled, next_sync_at, created_at, updated_at)
         VALUES ($1, $2, 'google', 'primary', 'UTC', true, clock_timestamp() - interval '1 minute', clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&g_sub_id)
    .bind(&g_acct.id)
    .execute(db.pool())
    .await
    .expect("insert g sub");

    sync_subscription(&g_svc, &g_sub_id, SyncSubscriptionOptions::default())
      .await
      .expect("sync empty-string falsy events");
    let upd_at: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
      "SELECT provider_updated_at FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-empty-upd'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch empty updated event");
    assert!(upd_at.is_none());
    let (empty_dt_allday, empty_dt_start): (bool, chrono::DateTime<Utc>) = sqlx::query_as(
      "SELECT all_day, start_at_utc FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-empty-dt'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch empty dateTime event");
    assert!(empty_dt_allday);
    assert_eq!(empty_dt_start.to_rfc3339(), "2026-07-01T00:00:00+00:00");
    let (g_tok, g_retry, g_err): (Option<String>, i32, Option<String>) = sqlx::query_as(
      "SELECT s.sync_token, s.sync_retry_count, a.last_error FROM calendar_subscriptions s JOIN calendar_accounts a ON a.id = s.account_id WHERE s.id = $1",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch g sub state");
    assert_eq!(g_tok.as_deref(), Some("tok-empty-ok"));
    assert_eq!(g_retry, 0);
    assert!(g_err.is_none());
    let bad_date_cnt: i64 = sqlx::query_scalar(
      "SELECT COUNT(*) FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-bad-date'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("count bad date event");
    assert_eq!(bad_date_cnt, 0);
    for (js_id, expected_start) in [
      ("g-js-float", "2026-07-01T00:00:00+00:00"),
      ("g-js-exp", "2026-07-01T00:00:00+00:00"),
      ("g-js-hex", "2026-07-01T00:00:00+00:00"),
      ("g-js-half-month", "2026-01-01T00:00:00+00:00"),
      ("g-js-large-day", "4764-05-28T00:00:00+00:00"),
    ] {
      let js_start: chrono::DateTime<Utc> = sqlx::query_scalar(
        "SELECT start_at_utc FROM calendar_events WHERE subscription_id = $1 AND external_event_id = $2",
      )
      .bind(&g_sub_id)
      .bind(js_id)
      .fetch_one(db.pool())
      .await
      .expect("fetch js-number all-day event");
      assert_eq!(js_start.to_rfc3339(), expected_start, "event={js_id}");
    }
    let nel_cnt: i64 = sqlx::query_scalar(
      "SELECT COUNT(*) FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-js-nel-skip'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("count nel skip event");
    assert_eq!(nel_cnt, 0);
    for (mode, tz) in [("utc", "UTC"), ("ny", "America/New_York")] {
      let status = std::process::Command::new(std::env::current_exe().expect("current_exe"))
        .arg("--exact")
        .arg("caldav_sync_persists_all_day_overflow_and_floating_24h_events_with_sync_token")
        .env("AFFINE_CAL_SYNC_TZ_SUBPROC_TEST", mode)
        .env("TZ", tz)
        .status()
        .expect("spawn sync TZ subprocess");
      assert!(status.success(), "sync TZ={tz} subprocess failed");
    }
    let (extra_start, extra_end, extra_allday): (chrono::DateTime<Utc>, chrono::DateTime<Utc>, bool) = sqlx::query_as(
      "SELECT start_at_utc, end_at_utc, all_day FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-extra-date'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch extra-date event");
    assert_eq!(extra_start.to_rfc3339(), "2026-07-01T00:00:00+00:00");
    assert_eq!(extra_end.to_rfc3339(), "2026-07-02T00:00:00+00:00");
    assert!(extra_allday);
    let (ltz_start, ltz_end): (chrono::DateTime<Utc>, chrono::DateTime<Utc>) = sqlx::query_as(
      "SELECT start_at_utc, end_at_utc FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-lower-tz'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch lower t/z +0800 event");
    assert_eq!(ltz_start.to_rfc3339(), "2026-07-01T10:20:30+00:00");
    assert_eq!(ltz_end.to_rfc3339(), "2026-07-01T11:20:30+00:00");

    // Second sync returns invalid non-empty ISO dateTime -> must fail batch without advancing sync_token.
    sqlx::query("UPDATE calendar_subscriptions SET next_sync_at = clock_timestamp() - interval '1 minute', sync_claimed_until = NULL WHERE id = $1")
      .bind(&g_sub_id)
      .execute(db.pool())
      .await
      .expect("re-due g sub");
    sync_subscription(&g_svc, &g_sub_id, SyncSubscriptionOptions::default())
      .await
      .expect("handle_sync_failure catches invalid ISO error");
    let (g_tok2, g_retry2): (Option<String>, i32) =
      sqlx::query_as("SELECT sync_token, sync_retry_count FROM calendar_subscriptions WHERE id = $1")
        .bind(&g_sub_id)
        .fetch_one(db.pool())
        .await
        .expect("fetch g sub state after bad iso");
    assert_eq!(g_tok2.as_deref(), Some("tok-empty-ok"));
    assert!(g_retry2 >= 1);
    let bad_iso_cnt: i64 = sqlx::query_scalar(
      "SELECT COUNT(*) FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-bad-iso'",
    )
    .bind(&g_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("count bad iso event");
    assert_eq!(bad_iso_cnt, 0);

    // Non-UTC subscription fallback timezone (Asia/Tokyo) when event start/end timeZone are None.
    let tokyo_sub_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO calendar_subscriptions (id, account_id, provider, external_calendar_id, timezone, enabled, next_sync_at, created_at, updated_at)
         VALUES ($1, $2, 'google', 'tokyo-cal', 'Asia/Tokyo', true, clock_timestamp() - interval '1 minute', clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&tokyo_sub_id)
    .bind(&g_acct.id)
    .execute(db.pool())
    .await
    .expect("insert tokyo sub");
    sync_subscription(&g_svc, &tokyo_sub_id, SyncSubscriptionOptions::default())
      .await
      .expect("sync tokyo fallback sub");
    let (tk_start, tk_end, tk_tz): (chrono::DateTime<Utc>, chrono::DateTime<Utc>, Option<String>) = sqlx::query_as(
      "SELECT start_at_utc, end_at_utc, original_timezone FROM calendar_events WHERE subscription_id = $1 AND external_event_id = 'g-tokyo-fallback'",
    )
    .bind(&tokyo_sub_id)
    .fetch_one(db.pool())
    .await
    .expect("fetch tokyo fallback event");
    assert_eq!(tk_start.to_rfc3339(), "2026-06-30T15:00:00+00:00");
    assert_eq!(tk_end.to_rfc3339(), "2026-07-01T15:00:00+00:00");
    assert_eq!(tk_tz.as_deref(), Some("Asia/Tokyo"));

    g_srv.abort();
    db.pool().close().await;
  });
}
