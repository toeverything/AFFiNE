use std::{
  future::Future,
  pin::Pin,
  sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
  },
  time::Duration,
};

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use futures_util::StreamExt as _;
use serde_json::json;
use server_db::{
  DbConfig, DbError, ServerDb, WorkloadTier,
  sessions::{
    AuthSessionRecord, IssuedAuthSession, IssuedCookieSession, NewAuthSessionInput, ResolvedCookieSession,
    SessionRepository,
  },
};
use server_domain::{
  app_config::{
    AppConfigService, AppConfigUpdate, RedisRuntimeConfig, RuntimeAppConfigBaseline, ServerRuntimeConfig,
    SmtpRuntimeConfig,
  },
  auth::{
    AuthConfig, AuthRequestSource, AuthService, CompleteMagicLinkInput, CreateAdminUserInput, EmailDomainVerification,
    EmailDomainVerifier, PasswordSignInInput, PrepareMagicLinkInput,
    password::{hash_password, verify_password},
  },
  events::{EVENTBUS_CHANNEL_V1, INVALIDATION_CHANNEL_V1, InvalidationHintV1, NoopEventPublisher, RedisEventPublisher},
  workspaces::{UpdateWorkspaceInput, WorkspaceRole, WorkspaceService},
};
use server_spi::{CommunityQuotaGate, CommunitySessionPolicyHook, QuotaGate, RateLimitPolicy, SessionPolicyHook};
use server_types::{AccessGrant, BillingSubject, DomainError, LicenseTier, Limits, Rights};
use sqlx::{Postgres, Row, Transaction};
use test_db_harness::{pg::PgCluster, redis::TestRedis};
use uuid::Uuid;

fn test_runtime() -> tokio::runtime::Runtime {
  tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .expect("build tokio runtime")
}

struct EmptyDbGuard {
  admin_url: String,
  db_name: String,
  url: String,
}

impl EmptyDbGuard {
  fn create(cluster: &PgCluster, prefix: &str) -> Self {
    let suffix = Uuid::new_v4().simple().to_string();
    let db_name = format!("test_{prefix}_{}", &suffix[..12]);
    let mut admin = postgres::Client::connect(cluster.admin_url(), postgres::NoTls).expect("connect admin");
    admin
      .batch_execute(&format!("CREATE DATABASE \"{db_name}\""))
      .expect("create empty db");
    let url = cluster.url_for(&db_name);
    Self {
      admin_url: cluster.admin_url().to_owned(),
      db_name,
      url,
    }
  }
}

impl Drop for EmptyDbGuard {
  fn drop(&mut self) {
    if let Ok(mut admin) = postgres::Client::connect(&self.admin_url, postgres::NoTls) {
      let _ = admin.batch_execute(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name));
    }
  }
}

/// Clean SQL `SessionRepository` used by domain integration tests without
/// importing any compatibility module into `packages/backend/server-domain`.
struct TestSqlSessionRepo;

#[async_trait::async_trait]
impl SessionRepository for TestSqlSessionRepo {
  async fn issue_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    user_id: &str,
    existing_session_id: Option<&str>,
    client_version: Option<&str>,
    ttl_seconds: i64,
    now: DateTime<Utc>,
  ) -> Result<IssuedCookieSession, DbError> {
    let session_id = match existing_session_id.filter(|s| !s.is_empty()) {
      Some(sid) => sid.to_owned(),
      None => {
        let sid = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, $2)")
          .bind(&sid)
          .bind(now)
          .execute(&mut **tx)
          .await?;
        sid
      }
    };
    let expires_at = now + ChronoDuration::seconds(ttl_seconds);
    let user_session_id: String = sqlx::query_scalar(
      r#"INSERT INTO user_sessions
           (id, session_id, user_id, expires_at, sign_in_client_version, refresh_client_version, created_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (session_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at
         RETURNING id"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&session_id)
    .bind(user_id)
    .bind(expires_at)
    .bind(client_version)
    .bind(now)
    .fetch_one(&mut **tx)
    .await?;
    Ok(IssuedCookieSession {
      user_session_id,
      session_id,
      user_id: user_id.to_owned(),
      expires_at,
      created_at: now,
    })
  }

  async fn resolve_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    requested_user_id: Option<&str>,
    _refresh_client_version: Option<&str>,
    _refresh: bool,
    _ttl_seconds: i64,
    _ttr_seconds: i64,
    now: DateTime<Utc>,
  ) -> Result<Option<ResolvedCookieSession>, DbError> {
    let row = sqlx::query(
      r#"SELECT s.id, s.session_id, s.user_id, s.expires_at, s.sign_in_client_version, s.refresh_client_version, s.created_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.session_id = $1
           AND ($2::text IS NULL OR s.user_id = $2)
           AND (s.expires_at IS NULL OR s.expires_at > $3)
           AND u.disabled = false
         ORDER BY s.created_at DESC
         LIMIT 1"#,
    )
    .bind(session_id)
    .bind(requested_user_id)
    .bind(now)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.map(|r| ResolvedCookieSession {
      user_session_id: r.get("id"),
      session_id: r.get("session_id"),
      user_id: r.get("user_id"),
      expires_at: r.get("expires_at"),
      refreshed_expires_at: None,
      sign_in_client_version: r.get("sign_in_client_version"),
      refresh_client_version: r.get("refresh_client_version"),
      created_at: r.get("created_at"),
    }))
  }

  async fn revoke_cookie_session(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    user_id: Option<&str>,
  ) -> Result<u64, DbError> {
    let affected = if let Some(uid) = user_id {
      sqlx::query("DELETE FROM user_sessions WHERE session_id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(uid)
        .execute(&mut **tx)
        .await?
        .rows_affected()
    } else {
      sqlx::query("DELETE FROM multiple_users_sessions WHERE id = $1")
        .bind(session_id)
        .execute(&mut **tx)
        .await?
        .rows_affected()
    };
    Ok(affected)
  }

  async fn issue_auth_session(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _input: NewAuthSessionInput,
    _now: DateTime<Utc>,
  ) -> Result<IssuedAuthSession, DbError> {
    unreachable!("covered in server-db integration tests")
  }

  async fn find_auth_session(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _auth_session_id: &str,
  ) -> Result<Option<AuthSessionRecord>, DbError> {
    unreachable!("covered in server-db integration tests")
  }

  async fn revoke_auth_session(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _auth_session_id: &str,
    _expected_user_id: Option<&str>,
    _reason: &str,
    _now: DateTime<Utc>,
  ) -> Result<bool, DbError> {
    unreachable!("covered in server-db integration tests")
  }

  async fn list_active_auth_sessions(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _user_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<Vec<AuthSessionRecord>, DbError> {
    unreachable!("covered in server-db integration tests")
  }
}

struct RejectingSessionPolicy;

impl SessionPolicyHook for RejectingSessionPolicy {
  fn on_session_created<'a>(
    &'a self,
    _tx: &'a mut Transaction<'_, Postgres>,
    _user_id: &'a str,
    _session_id: &'a str,
    _now: DateTime<Utc>,
  ) -> Pin<Box<dyn Future<Output = Result<(), DomainError>> + Send + 'a>> {
    Box::pin(async { Err(DomainError::Forbidden("session_limit_exceeded".to_owned())) })
  }
}

struct TwoSeatQuotaGate;

#[async_trait::async_trait]
impl QuotaGate for TwoSeatQuotaGate {
  async fn resolve_workspace_grant(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    Ok(AccessGrant {
      tier: LicenseTier::SelfhostDefault,
      billing_subject: BillingSubject::Owner,
      seat_quantity: Some(2),
      expires_at: None,
      limits: Limits {
        blob_limit_bytes: 104_857_600,
        storage_quota_bytes: 107_374_182_400,
        seat_limit: 2,
        seat_quota_bytes: None,
        history_period_seconds: 2_592_000,
        copilot_action_limit: Some(10),
      },
      rights: Rights {
        commercial: false,
        copilot_byok: false,
        unlimited_copilot: false,
      },
      diagnostics: Vec::new(),
    })
  }

  async fn check_seat_admission(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    current_active_seats: i32,
    adding_seats: i32,
    now: DateTime<Utc>,
  ) -> Result<AccessGrant, DomainError> {
    let grant = self.resolve_workspace_grant(tx, workspace_id, now).await?;
    if current_active_seats + adding_seats > grant.limits.seat_limit {
      return Err(DomainError::QuotaExceeded {
        kind: "seat_limit",
        message: format!(
          "seat limit exceeded: {} + {} > {}",
          current_active_seats, adding_seats, grant.limits.seat_limit
        ),
      });
    }
    Ok(grant)
  }
}

#[test]
fn auth_rollback_workspace_parity_quota_gate_and_redis_invalidation() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 cluster");
  let redis_instance = TestRedis::from_env_or_docker().expect("Redis 7 instance");
  let empty = EmptyDbGuard::create(&cluster, "w2adomain");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url)).await.unwrap();
    db.ensure_schema_ready().await.unwrap();

    let redis_publisher = Arc::new(RedisEventPublisher::new(redis_instance.url(), "production").unwrap());

    // 1. Signing keyring initialization matches v0.27.5 format.
    let rejecting_auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(RejectingSessionPolicy),
      AuthConfig::default(),
    );
    let keys = rejecting_auth.ensure_signing_keys().await.unwrap();
    assert_eq!(keys.len(), 1);
    assert!(keys[0].id.starts_with("auth-"));
    assert_eq!(keys[0].secret.len(), 43);
    assert_eq!(keys[0].source, "auto");
    assert_eq!(keys[0].status, "active");

    // 2. SessionPolicyHook error MUST roll back the entire create_first_admin_user transaction.
    assert!(!rejecting_auth.is_server_initialized().await.unwrap());
    let err = rejecting_auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Parity Admin".to_owned()),
        email: "parity-admin@affine.test".to_owned(),
        password: "ParityPassword123!".to_owned(),
        client_version: None,
      })
      .await
      .expect_err("rejecting SessionPolicyHook must roll back setup");
    assert!(matches!(err, DomainError::Forbidden(_)));
    assert!(
      !rejecting_auth.is_server_initialized().await.unwrap(),
      "server must remain uninitialized after SessionPolicyHook rollback"
    );
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let counts: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM users),
           (SELECT count(*) FROM user_features),
           (SELECT count(*) FROM multiple_users_sessions),
           (SELECT count(*) FROM user_sessions)",
      )
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert_eq!(counts, (0, 0, 0, 0), "all 4 tables must roll back cleanly");
    }

    // 3. Normal first-admin setup + password sign-in + cookie principal + magic link.
    let auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      AuthConfig {
        private_key: "test-private-key-v1".to_owned(),
        ..AuthConfig::default()
      },
    );
    let admin = auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Parity Admin".to_owned()),
        email: "Parity-Admin@affine.test".to_owned(),
        password: "ParityPassword123!".to_owned(),
        client_version: None,
      })
      .await
      .unwrap();
    assert_eq!(admin.user.email, "Parity-Admin@affine.test");
    assert!(admin.user.is_admin());
    assert!(admin.user.has_password);
    assert!(!admin.user.email_verified);
    assert!(auth.is_server_initialized().await.unwrap());

    // Stored password hash uses v0.27.5 Argon2id PHC parameters and verifies cleanly.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let stored_pw: String = sqlx::query_scalar("SELECT password FROM users WHERE id = $1")
        .bind(&admin.user.id)
        .fetch_one(conn.as_conn())
        .await
        .unwrap();
      assert!(stored_pw.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"));
      assert!(verify_password("ParityPassword123!", &stored_pw).unwrap());
      let fresh = hash_password("AnotherPass123!").unwrap();
      assert!(verify_password("AnotherPass123!", &fresh).unwrap());
    }

    // Second first-admin attempt is rejected.
    let dup = auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Second".to_owned()),
        email: "second@affine.test".to_owned(),
        password: "ParityPassword123!".to_owned(),
        client_version: None,
      })
      .await
      .expect_err("second setup must fail");
    assert!(matches!(dup, DomainError::Forbidden(_)));

    // Cookie principal resolution & password login & sign-out.
    let principal = auth
      .resolve_cookie_principal(&admin.session_id, Some(&admin.user.id), None, false)
      .await
      .unwrap()
      .expect("cookie principal must resolve");
    assert_eq!(principal.user.id, admin.user.id);
    assert!(principal.user.is_admin());

    let signed_in = auth
      .sign_in_with_password(PasswordSignInInput {
        email: "parity-admin@affine.test".to_owned(),
        password: "ParityPassword123!".to_owned(),
        existing_session_id: None,
        client_version: None,
      })
      .await
      .unwrap();
    assert_eq!(signed_in.user.id, admin.user.id);
    assert_eq!(auth.sign_out_cookie(&signed_in.session_id, None).await.unwrap(), 1);
    assert!(
      auth
        .resolve_cookie_principal(&signed_in.session_id, None, None, false)
        .await
        .unwrap()
        .is_none()
    );

    // Magic-link OTP flow via runtime_states creates a second user, including symmetric clientNonce check.
    let prepared_no_nonce = auth
      .prepare_magic_link(PrepareMagicLinkInput {
        email: "member1@affine.test".to_owned(),
        callback_url: "http://affine.parity.test/magic-link".to_owned(),
        client_nonce: None,
        source: None,
      })
      .await
      .unwrap();
    let unexpected_nonce_err = auth
      .complete_magic_link(CompleteMagicLinkInput {
        email: "member1@affine.test".to_owned(),
        otp: prepared_no_nonce.otp,
        client_nonce: Some("unexpected-nonce".to_owned()),
        existing_session_id: None,
        client_version: None,
      })
      .await
      .expect_err("supplied nonce must be rejected when challenge had no nonce");
    assert!(matches!(unexpected_nonce_err, DomainError::Unauthorized(_)));

    let prepared = auth
      .prepare_magic_link(PrepareMagicLinkInput {
        email: "member1@affine.test".to_owned(),
        callback_url: "http://affine.parity.test/magic-link".to_owned(),
        client_nonce: Some("nonce-1".to_owned()),
        source: Some(AuthRequestSource {
          trusted: false,
          ip: Some("203.0.113.7".to_owned()),
          asn: Some(64512),
        }),
      })
      .await
      .unwrap();
    assert!(prepared.is_signup);
    assert_eq!(prepared.otp.len(), 6);
    let member1 = auth
      .complete_magic_link(CompleteMagicLinkInput {
        email: "member1@affine.test".to_owned(),
        otp: prepared.otp,
        client_nonce: Some("nonce-1".to_owned()),
        existing_session_id: None,
        client_version: None,
      })
      .await
      .unwrap();
    assert!(member1.created_user);
    assert!(member1.user.email_verified);

    // 4. create_workspace: verify all 5 tables + exact Redis invalidation message.
    let sub_client = redis::Client::open(redis_instance.url()).unwrap();
    let mut pubsub = sub_client.get_async_pubsub().await.unwrap();
    pubsub.subscribe(INVALIDATION_CHANNEL_V1).await.unwrap();
    pubsub.subscribe(EVENTBUS_CHANNEL_V1).await.unwrap();

    let ws_service = WorkspaceService::new(db.clone(), Arc::new(TwoSeatQuotaGate), redis_publisher.clone());
    let ws = ws_service.create_workspace(&admin.user.id, None).await.unwrap();
    assert!(!ws.public);
    assert!(ws.enable_ai);
    assert!(ws.enable_doc_embedding);
    assert!(!ws.indexed);
    assert_eq!(ws.last_check_embeddings, DateTime::<Utc>::UNIX_EPOCH);

    let msg = tokio::time::timeout(Duration::from_secs(3), pubsub.on_message().next())
      .await
      .expect("invalidation message timeout")
      .expect("invalidation stream ended");
    assert_eq!(msg.get_channel_name(), INVALIDATION_CHANNEL_V1);
    let payload_val: serde_json::Value = serde_json::from_str(&msg.get_payload::<String>().unwrap()).unwrap();
    assert_eq!(
      payload_val,
      InvalidationHintV1::WorkspaceInventoryChanged {
        workspace_id: ws.id.clone(),
        doc_id: None,
      }
      .to_json_value()
    );

    // Verify exact DB rows written by create_workspace.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let (vis, share, preview, default_role): (String, bool, bool, String) = sqlx::query_as(
        "SELECT visibility, sharing_enabled, url_preview_enabled, member_default_doc_role
         FROM workspace_access_policies WHERE workspace_id = $1",
      )
      .bind(&ws.id)
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert_eq!(
        (vis.as_str(), share, preview, default_role.as_str()),
        ("private", true, false, "manager")
      );

      let (perm_id, role, source, state): (String, String, String, String) = sqlx::query_as(
        "SELECT id, role, source, state FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
      )
      .bind(&ws.id)
      .bind(&admin.user.id)
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert!(
        perm_id.starts_with("perm_") && perm_id.len() == 37,
        "unexpected perm id: {perm_id}"
      );
      assert_eq!(
        (role.as_str(), source.as_str(), state.as_str()),
        ("owner", "legacy", "active")
      );

      let dirty_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspace_admin_stats_dirty WHERE workspace_id = $1)")
          .bind(&ws.id)
          .fetch_one(conn.as_conn())
          .await
          .unwrap();
      assert!(dirty_exists);

      let generation: i64 =
        sqlx::query_scalar("SELECT generation FROM workspace_sync_permission_generations WHERE workspace_id = $1")
          .bind(&ws.id)
          .fetch_one(conn.as_conn())
          .await
          .unwrap();
      assert_eq!(generation, 2, "policy insert (1) + owner member insert (2)");
    }

    // 5. QuotaGate seat admission enforcement (2-seat limit: owner + 1 invite ok, duplicate invite -> Conflict, 2nd distinct invite -> QuotaExceeded).
    let inv1 = ws_service
      .invite_member(&admin.user.id, &ws.id, "member1@affine.test", WorkspaceRole::Member)
      .await
      .unwrap();
    let dup_inv = ws_service
      .invite_member(&admin.user.id, &ws.id, "MEMBER1@affine.test", WorkspaceRole::Member)
      .await
      .expect_err("duplicate pending invitation must return Conflict");
    assert!(matches!(dup_inv, DomainError::Conflict(_)));
    let over = ws_service
      .invite_member(&admin.user.id, &ws.id, "member2@affine.test", WorkspaceRole::Member)
      .await
      .expect_err("3rd seat must be rejected by TwoSeatQuotaGate");
    assert!(matches!(over, DomainError::QuotaExceeded { kind: "seat_limit", .. }));

    let accepted = ws_service.accept_invitation(&member1.user.id, &inv1.id).await.unwrap();
    assert_eq!(accepted.role, WorkspaceRole::Member);
    assert_eq!(accepted.id, inv1.id, "accepted member must reuse invitation id");
    assert_eq!(
      accepted.source, "email",
      "accepted member must preserve invitation kind"
    );
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let inv_still_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspace_invitations WHERE id = $1)")
          .bind(&inv1.id)
          .fetch_one(conn.as_conn())
          .await
          .unwrap();
      assert!(!inv_still_exists, "accepted invitation row must be deleted");
    }

    // Verify expired invitation rejection, bound-uid impersonation rejection, and re-invite after rejected/expired.
    let ws2 = ws_service.create_workspace(&admin.user.id, None).await.unwrap();
    let expired_inv = ws_service
      .invite_member(&admin.user.id, &ws2.id, "member1@affine.test", WorkspaceRole::Member)
      .await
      .unwrap();
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::query("UPDATE workspace_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1")
        .bind(&expired_inv.id)
        .execute(conn.as_conn())
        .await
        .unwrap();
    }
    let exp_err = ws_service
      .accept_invitation(&member1.user.id, &expired_inv.id)
      .await
      .expect_err("expired invitation must be rejected");
    assert!(matches!(exp_err, DomainError::Forbidden(_)));

    // Bound-uid impersonation check: even if another user has matching email or attempts accept, bound uid is strictly enforced.
    let imposter_id = Uuid::new_v4().to_string();
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::query("UPDATE workspace_invitations SET expires_at = NULL WHERE id = $1")
        .bind(&expired_inv.id)
        .execute(conn.as_conn())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO users (id, name, email, registered, disabled, auth_epoch, created_at)
         VALUES ($1, 'Imposter', 'imposter@affine.test', true, false, 0, now())",
      )
      .bind(&imposter_id)
      .execute(conn.as_conn())
      .await
      .unwrap();
    }
    let imposter_err = ws_service
      .accept_invitation(&imposter_id, &expired_inv.id)
      .await
      .expect_err("bound-uid invitation must reject different user_id");
    assert!(matches!(imposter_err, DomainError::Forbidden(_)));

    // Marking old invitation as 'expired' allows re-inviting the same user cleanly without 23505 collision.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::query("UPDATE workspace_invitations SET status = 'expired' WHERE id = $1")
        .bind(&expired_inv.id)
        .execute(conn.as_conn())
        .await
        .unwrap();
    }
    let reinv = ws_service
      .invite_member(&admin.user.id, &ws2.id, "member1@affine.test", WorkspaceRole::Member)
      .await
      .expect("re-invite after expired invitation must succeed");
    assert_ne!(reinv.id, expired_inv.id);

    let promoted = ws_service
      .update_member_role(&admin.user.id, &ws.id, &member1.user.id, WorkspaceRole::Admin)
      .await
      .unwrap();
    assert_eq!(promoted.role, WorkspaceRole::Admin);

    // Usage query with active + deleted blobs.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      sqlx::query(
        "INSERT INTO blobs (workspace_id, key, size, mime, status) VALUES
           ($1, 'b1', 1024, 'image/png', 'completed'),
           ($1, 'b2', 2048, 'image/png', 'completed')",
      )
      .bind(&ws.id)
      .execute(conn.as_conn())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO blobs (workspace_id, key, size, mime, status, deleted_at)
         VALUES ($1, 'b3', 4096, 'image/png', 'completed', now())",
      )
      .bind(&ws.id)
      .execute(conn.as_conn())
      .await
      .unwrap();
    }
    let usage = ws_service.load_workspace_usage(&ws.id).await.unwrap();
    assert_eq!(usage.used_storage_quota, 3072);
    assert_eq!(usage.member_count, 2);

    // Update workspace & revoke member.
    let updated = ws_service
      .update_workspace(
        &admin.user.id,
        &ws.id,
        UpdateWorkspaceInput {
          name: Some(Some("Renamed".to_owned())),
          public: Some(true),
          ..Default::default()
        },
      )
      .await
      .unwrap();
    assert_eq!(updated.name.as_deref(), Some("Renamed"));
    assert!(updated.public);

    ws_service
      .revoke_member(&admin.user.id, &ws.id, &member1.user.id)
      .await
      .unwrap();
    let usage_after = ws_service.load_workspace_usage(&ws.id).await.unwrap();
    assert_eq!(usage_after.member_count, 1);

    // 6. AppConfigService redacts all 24 secret keys (including nested subpaths) and rejects signingKeys mutation.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
      for (key, val) in [
        (
          "oauth.providers.github",
          json!({"clientId": "id", "clientSecret": "top-secret"}),
        ),
        ("db.datasourceUrl", json!("postgres://user:pass@host/db")),
        ("payment.stripe", json!({"apiKey": "sk_live_secret"})),
        (
          "storages.blob.storage",
          json!({"provider": "s3", "secretAccessKey": "aws-secret"}),
        ),
        ("copilot.providers.profiles", json!([{"apiKey": "openai-secret"}])),
        ("redis.password", json!("redis-secret")),
      ] {
        sqlx::query(
          "INSERT INTO app_configs (id, value, created_at, updated_at) VALUES ($1, $2, now(), now())
           ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(val)
        .execute(conn.as_conn())
        .await
        .unwrap();
      }
    }
    let app_cfg = AppConfigService::new(
      db.clone(),
      RuntimeAppConfigBaseline {
        server: ServerRuntimeConfig {
          name: "AFFiNE Parity".to_owned(),
          external_url: "http://affine.parity.test".to_owned(),
          port: 40243,
          ..Default::default()
        },
        redis: RedisRuntimeConfig::from_redis_url(redis_instance.url()).unwrap(),
        smtp: SmtpRuntimeConfig {
          host: "127.0.0.1".to_owned(),
          port: 36523,
          name: "parity.affine.test".to_owned(),
          sender: "AFFiNE Parity <noreply@affine.test>".to_owned(),
          username: String::new(),
          ignore_tls: false,
        },
        fallback_smtp: SmtpRuntimeConfig::default(),
      },
      Arc::new(NoopEventPublisher::default()),
    );
    let effective = app_cfg.get_effective_app_config().await.unwrap();
    for secret_ptr in [
      "/auth/session/signingKeys",
      "/oauth/providers/github",
      "/db/datasourceUrl",
      "/payment/stripe",
      "/storages/blob/storage",
      "/copilot/providers/profiles",
      "/redis/password",
    ] {
      assert!(
        effective.pointer(secret_ptr).is_none(),
        "secret pointer {secret_ptr} must be redacted from effective appConfig"
      );
    }
    assert_eq!(effective.pointer("/server/name"), Some(&json!("AFFiNE Parity")));
    assert_eq!(effective.pointer("/auth/session/ttl"), Some(&json!(1296000)));

    let signing_key_err = app_cfg
      .update_app_config(
        Some(&admin.user.id),
        &[AppConfigUpdate {
          key: "auth.session.signingKeys".to_owned(),
          value: None,
        }],
      )
      .await
      .expect_err("modifying auth.session.signingKeys via appConfig must be forbidden");
    assert!(matches!(signing_key_err, DomainError::Forbidden(_)));

    let updated_cfg = app_cfg
      .update_app_config(
        Some(&admin.user.id),
        &[AppConfigUpdate {
          key: "flags.allowGuestDemoWorkspace".to_owned(),
          value: Some(json!(false)),
        }],
      )
      .await
      .unwrap();
    assert_eq!(
      updated_cfg.pointer("/flags/allowGuestDemoWorkspace"),
      Some(&json!(false))
    );
    assert!(updated_cfg.pointer("/oauth/providers/github").is_none());

    // Ensure CommunityQuotaGate compiles and works with WorkspaceService too.
    let community_ws = WorkspaceService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::new()),
      Arc::new(NoopEventPublisher::default()),
    );
    let list = community_ws.list_user_workspaces(&admin.user.id).await.unwrap();
    assert_eq!(list.len(), 2);

    // Verify prepare_magic_link atomically queued mail_deliveries rows.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let queued_mails: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM mail_deliveries WHERE recipient_email = 'member1@affine.test' AND status = 'queued'",
      )
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert!(
        queued_mails >= 1,
        "prepare_magic_link must atomically queue mail_deliveries"
      );
    }

    // 7. HMAC-SHA256 recipient_hash (independent vector), recipient_user_id=NULL,
    //    RateLimitPolicy rollback, EmailDomainVerifier (Missing / '+' / Unavailable /
    //    no DNS call on invalid complete_magic_link), and concurrent invite x accept.
    struct OneMailQuotaPolicy(AtomicUsize);
    #[async_trait::async_trait]
    impl RateLimitPolicy for OneMailQuotaPolicy {
      async fn check_auth_mail(
        &self,
        _tx: &mut Transaction<'_, Postgres>,
        _mail_name: &str,
        _normalized_email: &str,
        _recipient_user_id: Option<&str>,
        _source: Option<&AuthRequestSource>,
        _now: DateTime<Utc>,
      ) -> Result<(), DomainError> {
        if self.0.fetch_add(1, Ordering::SeqCst) >= 1 {
          return Err(DomainError::RateLimited("mail_quota_denied".to_owned()));
        }
        Ok(())
      }

      async fn check_workspace_invite(
        &self,
        _tx: &mut Transaction<'_, Postgres>,
        _workspace_id: &str,
        _inviter_id: &str,
        _target_emails: &[&str],
        _source: Option<&AuthRequestSource>,
        _now: DateTime<Utc>,
      ) -> Result<(), server_spi::RateLimitRejection> {
        Ok(())
      }
    }

    struct FixedDomainVerifier {
      verdict: EmailDomainVerification,
      calls: Arc<AtomicUsize>,
    }
    #[async_trait::async_trait]
    impl EmailDomainVerifier for FixedDomainVerifier {
      async fn verify_email_domain(&self, _email: &str) -> EmailDomainVerification {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.verdict
      }
    }

    let secret_key = "test-private-key-v1";
    let quota_cfg = AuthConfig {
      private_key: secret_key.to_owned(),
      ..AuthConfig::default()
    };
    let debug_cfg = format!("{quota_cfg:?}");
    assert!(debug_cfg.contains("[REDACTED]"));
    assert!(!debug_cfg.contains(secret_key));

    let quota_auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      quota_cfg,
    )
    .with_rate_limit_policy(Arc::new(OneMailQuotaPolicy(AtomicUsize::new(0))));

    let first_ml = quota_auth
      .prepare_magic_link(PrepareMagicLinkInput {
        email: "  Alice@Example.COM  ".to_owned(),
        callback_url: "http://affine.parity.test/magic-link".to_owned(),
        client_nonce: None,
        source: None,
      })
      .await
      .unwrap();
    assert_eq!(first_ml.email, "Alice@Example.COM");

    // Verify independent HMAC-SHA256 vector, trimmed original-case recipient_email, lowercase domain, and NULL recipient_user_id.
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let (rec_email, rec_hash, rec_domain, rec_uid): (String, String, String, Option<String>) = sqlx::query_as(
        "SELECT recipient_email, recipient_hash, recipient_domain, recipient_user_id
         FROM mail_deliveries
         WHERE lower(recipient_email) = 'alice@example.com'
         ORDER BY created_at DESC LIMIT 1",
      )
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert_eq!(rec_email, "Alice@Example.COM");
      assert_eq!(rec_domain, "example.com");
      assert!(
        rec_uid.is_none(),
        "magic-link mail_deliveries must set recipient_user_id = NULL"
      );
      // Independent Python vector:
      // hmac.new(hashlib.sha256(b"test-private-key-v1").digest(), b"alice@example.com", hashlib.sha256).hexdigest()
      assert_eq!(
        rec_hash,
        "22eecd069d10c8a52b5f07b62d07f995589671dc16d3ecd522abd6069f918363"
      );
    }

    // 2nd mail rejected by RateLimitPolicy: whole tx rolls back, no 2nd mail queued, 1st OTP still works!
    let second_err = quota_auth
      .prepare_magic_link(PrepareMagicLinkInput {
        email: "alice@example.com".to_owned(),
        callback_url: "http://affine.parity.test/magic-link".to_owned(),
        client_nonce: None,
        source: None,
      })
      .await
      .expect_err("2nd mail must be rejected by RateLimitPolicy");
    assert!(matches!(second_err, DomainError::RateLimited(_)));
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM mail_deliveries WHERE lower(recipient_email) = 'alice@example.com'")
          .fetch_one(conn.as_conn())
          .await
          .unwrap();
      assert_eq!(count, 1, "rejected 2nd mail must roll back without queuing");
    }
    let completed_first = quota_auth
      .complete_magic_link(CompleteMagicLinkInput {
        email: "Alice@Example.COM".to_owned(),
        otp: first_ml.otp,
        client_nonce: None,
        existing_session_id: None,
        client_version: None,
      })
      .await
      .expect("1st OTP challenge must remain intact after 2nd attempt rolled back");
    assert!(completed_first.created_user);
    assert_eq!(completed_first.user.email, "Alice@Example.COM");

    // EmailDomainVerifier: Missing, '+' subaddress, Unavailable, and zero DNS calls on invalid complete_magic_link.
    let domain_cfg = AuthConfig {
      require_email_domain_verification: true,
      private_key: "test-private-key-v1".to_owned(),
      ..AuthConfig::default()
    };
    let missing_auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      domain_cfg.clone(),
    )
    .with_email_domain_verifier(Arc::new(FixedDomainVerifier {
      verdict: EmailDomainVerification::Missing,
      calls: Arc::new(AtomicUsize::new(0)),
    }));
    assert!(matches!(
      missing_auth
        .prepare_magic_link(PrepareMagicLinkInput {
          email: "newuser@missing.invalid".to_owned(),
          callback_url: "http://affine.parity.test/magic-link".to_owned(),
          client_nonce: None,
          source: None,
        })
        .await,
      Err(DomainError::Forbidden(_))
    ));

    let plus_auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      domain_cfg.clone(),
    )
    .with_email_domain_verifier(Arc::new(FixedDomainVerifier {
      verdict: EmailDomainVerification::Allowed,
      calls: Arc::new(AtomicUsize::new(0)),
    }));
    assert!(matches!(
      plus_auth
        .prepare_magic_link(PrepareMagicLinkInput {
          email: "alias+tag@valid.test".to_owned(),
          callback_url: "http://affine.parity.test/magic-link".to_owned(),
          client_nonce: None,
          source: None,
        })
        .await,
      Err(DomainError::Forbidden(_))
    ));

    let unavail_calls = Arc::new(AtomicUsize::new(0));
    let unavail_auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      domain_cfg,
    )
    .with_email_domain_verifier(Arc::new(FixedDomainVerifier {
      verdict: EmailDomainVerification::Unavailable,
      calls: Arc::clone(&unavail_calls),
    }));

    // complete_magic_link on an email with NO challenge must return invalid_email_token
    // and make ZERO external DNS verification calls.
    let no_challenge_err = unavail_auth
      .complete_magic_link(CompleteMagicLinkInput {
        email: "forged@no-challenge.test".to_owned(),
        otp: "000000".to_owned(),
        client_nonce: None,
        existing_session_id: None,
        client_version: None,
      })
      .await
      .expect_err("complete_magic_link without challenge must fail with invalid_email_token");
    assert!(
      matches!(&no_challenge_err, DomainError::Unauthorized(code) if code == "invalid_email_token"),
      "expected Unauthorized(invalid_email_token), got {no_challenge_err:?}"
    );
    assert_eq!(
      unavail_calls.load(Ordering::SeqCst),
      0,
      "complete_magic_link must not trigger external DNS verification before validating challenge"
    );

    assert!(matches!(
      unavail_auth
        .prepare_magic_link(PrepareMagicLinkInput {
          email: "newuser@timeout.test".to_owned(),
          callback_url: "http://affine.parity.test/magic-link".to_owned(),
          client_nonce: None,
          source: None,
        })
        .await,
      Err(DomainError::Unavailable(_))
    ));
    assert_eq!(unavail_calls.load(Ordering::SeqCst), 1);

    // Concurrent invite_member x accept_invitation (deadlock-free lock order).
    let concurrent_ws = community_ws.create_workspace(&admin.user.id, None).await.unwrap();
    let inv_for_accept = community_ws
      .invite_member(
        &admin.user.id,
        &concurrent_ws.id,
        "member1@affine.test",
        WorkspaceRole::Member,
      )
      .await
      .unwrap();
    let ws_a = community_ws.clone();
    let ws_b = community_ws.clone();
    let wid = concurrent_ws.id.clone();
    let owner_uid = admin.user.id.clone();
    let accept_uid = member1.user.id.clone();
    let accept_inv_id = inv_for_accept.id.clone();
    let (res_invite, res_accept) = tokio::join!(
      tokio::spawn(async move {
        ws_a
          .invite_member(&owner_uid, &wid, "alice@example.com", WorkspaceRole::Member)
          .await
      }),
      tokio::spawn(async move { ws_b.accept_invitation(&accept_uid, &accept_inv_id).await }),
    );
    res_invite
      .unwrap()
      .expect("concurrent invite_member must succeed without deadlock");
    res_accept
      .unwrap()
      .expect("concurrent accept_invitation must succeed without deadlock");

    // Mixed-case invite for an unregistered email must store lowercase `normalized_email`
    // so v0.27.5 `strict_quota/seat.rs` literal equality queries match and block duplicate seats.
    let mixed_inv = community_ws
      .invite_member(
        &admin.user.id,
        &concurrent_ws.id,
        "MixedCase@Example.COM",
        WorkspaceRole::Member,
      )
      .await
      .unwrap();
    assert_eq!(mixed_inv.normalized_email.as_deref(), Some("mixedcase@example.com"));
    {
      let mut conn = db.acquire_tiered(WorkloadTier::InteractiveRead).await.unwrap();
      let literal_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM workspace_invitations WHERE workspace_id = $1 AND normalized_email = 'mixedcase@example.com'",
      )
      .bind(&concurrent_ws.id)
      .fetch_one(conn.as_conn())
      .await
      .unwrap();
      assert_eq!(literal_count, 1);
    }
    let dup_mixed = community_ws
      .invite_member(
        &admin.user.id,
        &concurrent_ws.id,
        "mixedcase@example.com",
        WorkspaceRole::Member,
      )
      .await
      .expect_err("re-inviting same email in lowercase must conflict");
    assert!(matches!(dup_mixed, DomainError::Conflict(_)));

    // Commercial gate for Admin effective role (`access_control/permission.rs`):
    // Under non-commercial grant (`commercial: false`), Admin degrades to Member -> 403.
    // Under commercial grant (`commercial: true`), Admin is permitted to update workspace & invite.
    struct CommercialQuotaGate;
    #[async_trait::async_trait]
    impl QuotaGate for CommercialQuotaGate {
      async fn resolve_workspace_grant(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        workspace_id: &str,
        now: DateTime<Utc>,
      ) -> Result<AccessGrant, DomainError> {
        let mut grant = CommunityQuotaGate::new()
          .resolve_workspace_grant(tx, workspace_id, now)
          .await?;
        grant.rights.commercial = true;
        Ok(grant)
      }
      async fn resolve_user_grant(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: &str,
        now: DateTime<Utc>,
      ) -> Result<AccessGrant, DomainError> {
        CommunityQuotaGate::new().resolve_user_grant(tx, user_id, now).await
      }
      async fn check_seat_admission(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        workspace_id: &str,
        current_active_members: i32,
        current_chargeable_invitations: i32,
        now: DateTime<Utc>,
      ) -> Result<AccessGrant, DomainError> {
        let mut grant = CommunityQuotaGate::new()
          .check_seat_admission(
            tx,
            workspace_id,
            current_active_members,
            current_chargeable_invitations,
            now,
          )
          .await?;
        grant.rights.commercial = true;
        Ok(grant)
      }
    }
    community_ws
      .update_member_role(&admin.user.id, &concurrent_ws.id, &member1.user.id, WorkspaceRole::Admin)
      .await
      .expect("owner promotes member1 to admin");
    assert!(matches!(
      community_ws
        .update_workspace(
          &member1.user.id,
          &concurrent_ws.id,
          UpdateWorkspaceInput {
            name: Some(Some("Blocked Non-Commercial Admin".to_owned())),
            ..Default::default()
          },
        )
        .await,
      Err(DomainError::Forbidden(_))
    ));
    assert!(matches!(
      community_ws
        .invite_member(
          &member1.user.id,
          &concurrent_ws.id,
          "noncommercial-admin-invite@affine.test",
          WorkspaceRole::Member,
        )
        .await,
      Err(DomainError::Forbidden(_))
    ));
    let commercial_ws = WorkspaceService::new(
      db.clone(),
      Arc::new(CommercialQuotaGate),
      Arc::new(NoopEventPublisher::default()),
    );
    let updated_by_admin = commercial_ws
      .update_workspace(
        &member1.user.id,
        &concurrent_ws.id,
        UpdateWorkspaceInput {
          name: Some(Some("Allowed Commercial Admin".to_owned())),
          ..Default::default()
        },
      )
      .await
      .expect("commercial admin can update workspace");
    assert_eq!(updated_by_admin.name.as_deref(), Some("Allowed Commercial Admin"));
    commercial_ws
      .invite_member(
        &member1.user.id,
        &concurrent_ws.id,
        "commercial-admin-invite@affine.test",
        WorkspaceRole::Member,
      )
      .await
      .expect("commercial admin can invite member");

    db.pool().close().await;
  });
}
struct RejectingRateLimitPolicy {
  db: ServerDb,
  post_rollback_verified: Arc<std::sync::atomic::AtomicBool>,
}

#[async_trait::async_trait]
impl RateLimitPolicy for RejectingRateLimitPolicy {
  async fn check_auth_mail(
    &self,
    _tx: &mut Transaction<'_, Postgres>,
    mail_name: &str,
    normalized_email: &str,
    recipient_user_id: Option<&str>,
    source: Option<&AuthRequestSource>,
    _now: DateTime<Utc>,
  ) -> Result<(), DomainError> {
    assert_eq!(mail_name, "SignUp");
    assert_eq!(normalized_email, "limited-user@affine.test");
    assert!(recipient_user_id.is_none());
    let src = source.expect("auth mail request source must be forwarded");
    assert!(src.trusted);
    assert_eq!(src.ip.as_deref(), Some("203.0.113.10"));
    Err(DomainError::RateLimited("auth mail rate limited".into()))
  }

  async fn check_workspace_invite(
    &self,
    tx: &mut Transaction<'_, Postgres>,
    _workspace_id: &str,
    _inviter_id: &str,
    target_emails: &[&str],
    source: Option<&AuthRequestSource>,
    _now: DateTime<Utc>,
  ) -> Result<(), server_spi::RateLimitRejection> {
    assert_eq!(target_emails, &["invitee-rl@affine.test"]);
    let src = source.expect("workspace invite request source must be forwarded");
    assert!(src.trusted);
    assert_eq!(src.ip.as_deref(), Some("198.51.100.42"));
    assert_eq!(src.asn, Some(13335));
    sqlx::query("SELECT pg_advisory_xact_lock(987654321)")
      .execute(&mut **tx)
      .await
      .expect("acquire xact sentinel lock inside invite tx");

    let db = self.db.clone();
    let verified = Arc::clone(&self.post_rollback_verified);
    Err(server_spi::RateLimitRejection::with_post_rollback(
      DomainError::RateLimited("workspace invite rate limited".into()),
      Box::pin(async move {
        let remaining_sentinel_locks: i64 = sqlx::query_scalar(
          "SELECT COUNT(*) FROM pg_locks \
           WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database()) \
             AND locktype = 'advisory' AND objid = 987654321 AND granted",
        )
        .fetch_one(db.pool())
        .await
        .expect("inspect sentinel lock after rollback");
        assert_eq!(
          remaining_sentinel_locks, 0,
          "post_rollback effect must run strictly after outer invite tx releases locks"
        );
        verified.store(true, Ordering::SeqCst);
        Ok(())
      }),
    ))
  }
}

#[test]
fn rate_limit_policy_rejects_and_rolls_back_auth_mail_and_workspace_invite() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 cluster");
  let empty = EmptyDbGuard::create(&cluster, "ratelimit");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url)).await.unwrap();
    db.ensure_schema_ready().await.unwrap();

    let post_rollback_verified = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let policy = Arc::new(RejectingRateLimitPolicy {
      db: db.clone(),
      post_rollback_verified: Arc::clone(&post_rollback_verified),
    });
    let auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      AuthConfig {
        private_key: "rate-limit-test-key".to_owned(),
        ..AuthConfig::default()
      },
    )
    .with_rate_limit_policy(policy.clone());

    let admin = auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Owner".to_owned()),
        email: "owner-rl@affine.test".to_owned(),
        password: "Password123!".to_owned(),
        client_version: None,
      })
      .await
      .expect("create owner");

    // 1. Auth mail rate limit must roll back both runtime_states and mail_deliveries.
    let target_email = "limited-user@affine.test";
    let mail_err = auth
      .prepare_magic_link(PrepareMagicLinkInput {
        email: target_email.to_owned(),
        callback_url: "https://affine.test/magic-link".to_owned(),
        client_nonce: None,
        source: Some(AuthRequestSource {
          trusted: true,
          ip: Some("203.0.113.10".to_owned()),
          asn: None,
        }),
      })
      .await
      .expect_err("rate limit policy must reject auth mail");
    assert!(matches!(mail_err, DomainError::RateLimited(_)));

    let mail_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM mail_deliveries")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(mail_count, 0, "rejected auth mail must not persist mail_deliveries");

    let state_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM runtime_states WHERE lookup_key = $1")
      .bind(target_email)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(state_count, 0, "rejected auth mail must roll back runtime_states");

    // 2. Workspace invite rate limit must roll back workspace_invitations and workspace_members.
    let workspaces = WorkspaceService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::new()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_rate_limit_policy(policy);
    let ws = workspaces
      .create_workspace(&admin.user.id, Some("RL Workspace"))
      .await
      .expect("create workspace");

    let invite_source = AuthRequestSource {
      trusted: true,
      ip: Some("198.51.100.42".to_owned()),
      asn: Some(13335),
    };
    let invite_err = workspaces
      .invite_member_with_source(
        &admin.user.id,
        &ws.id,
        "invitee-rl@affine.test",
        WorkspaceRole::Member,
        Some(&invite_source),
      )
      .await
      .expect_err("rate limit policy must reject workspace invite");
    assert!(matches!(invite_err, DomainError::RateLimited(_)));
    assert!(
      post_rollback_verified.load(Ordering::SeqCst),
      "post_rollback effect must execute after invite rollback"
    );

    let inv_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspace_invitations WHERE workspace_id = $1")
      .bind(&ws.id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(inv_count, 0, "rejected invite must not persist workspace_invitations");

    let member_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $1")
      .bind(&ws.id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(member_count, 1, "only owner must remain in workspace_members");

    // 3. Batch invite_members_with_source invokes check_workspace_invite ONCE with all 3 valid candidates.
    struct RecordingRateLimitPolicy {
      invite_batches: std::sync::Mutex<Vec<Vec<String>>>,
    }
    #[async_trait::async_trait]
    impl RateLimitPolicy for RecordingRateLimitPolicy {
      async fn check_auth_mail(
        &self,
        _tx: &mut Transaction<'_, Postgres>,
        _mail_name: &str,
        _normalized_email: &str,
        _recipient_user_id: Option<&str>,
        _source: Option<&AuthRequestSource>,
        _now: DateTime<Utc>,
      ) -> Result<(), DomainError> {
        Ok(())
      }

      async fn check_workspace_invite(
        &self,
        _tx: &mut Transaction<'_, Postgres>,
        _workspace_id: &str,
        _inviter_id: &str,
        target_emails: &[&str],
        source: Option<&AuthRequestSource>,
        _now: DateTime<Utc>,
      ) -> Result<(), server_spi::RateLimitRejection> {
        assert_eq!(source.and_then(|s| s.ip.as_deref()), Some("198.51.100.42"));
        self
          .invite_batches
          .lock()
          .unwrap()
          .push(target_emails.iter().map(|s| (*s).to_owned()).collect());
        Ok(())
      }
    }
    let recorder = Arc::new(RecordingRateLimitPolicy {
      invite_batches: std::sync::Mutex::new(Vec::new()),
    });
    let batch_workspaces = WorkspaceService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::new()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_rate_limit_policy(recorder.clone());
    let batch_inputs = vec![
      "batch-1@affine.test".to_owned(),
      "batch-2@affine.test".to_owned(),
      "batch-3@affine.test".to_owned(),
    ];
    let batch_res = batch_workspaces
      .invite_members_with_source(
        &admin.user.id,
        &ws.id,
        &batch_inputs,
        WorkspaceRole::Member,
        Some(&invite_source),
      )
      .await
      .expect("batch invite succeeds");
    assert_eq!(batch_res.len(), 3);
    assert!(batch_res.iter().all(|(_, r)| r.is_ok()));
    {
      let recorded = recorder.invite_batches.lock().unwrap();
      assert_eq!(
        recorded.len(),
        1,
        "check_workspace_invite must be called once per batch"
      );
      assert_eq!(
        recorded[0].len(),
        3,
        "target_emails must contain all 3 valid candidates"
      );
    }

    db.pool().close().await;
  });
}

#[test]
fn workspace_invite_rollback_error_skips_post_rollback_effect() {
  let cluster = PgCluster::from_env_or_docker().expect("PG16 cluster");
  let empty = EmptyDbGuard::create(&cluster, "rlrollback");

  let rt = test_runtime();
  rt.block_on(async {
    let db = ServerDb::connect(DbConfig::new(&empty.url)).await.unwrap();
    db.ensure_schema_ready().await.unwrap();

    let auth = AuthService::new(
      db.clone(),
      Arc::new(TestSqlSessionRepo),
      Arc::new(CommunitySessionPolicyHook),
      AuthConfig {
        private_key: "rate-limit-rollback-key".to_owned(),
        ..AuthConfig::default()
      },
    );
    let admin = auth
      .create_first_admin_user(CreateAdminUserInput {
        name: Some("Owner".to_owned()),
        email: "owner-rb@affine.test".to_owned(),
        password: "Password123!".to_owned(),
        client_version: None,
      })
      .await
      .expect("create owner");

    struct TerminatingRateLimitPolicy {
      post_rollback_called: Arc<std::sync::atomic::AtomicBool>,
    }

    #[async_trait::async_trait]
    impl RateLimitPolicy for TerminatingRateLimitPolicy {
      async fn check_auth_mail(
        &self,
        _tx: &mut Transaction<'_, Postgres>,
        _mail_name: &str,
        _normalized_email: &str,
        _recipient_user_id: Option<&str>,
        _source: Option<&AuthRequestSource>,
        _now: DateTime<Utc>,
      ) -> Result<(), DomainError> {
        Ok(())
      }

      async fn check_workspace_invite(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        _workspace_id: &str,
        _inviter_id: &str,
        _target_emails: &[&str],
        _source: Option<&AuthRequestSource>,
        _now: DateTime<Utc>,
      ) -> Result<(), server_spi::RateLimitRejection> {
        let _ = sqlx::query("SELECT pg_terminate_backend(pg_backend_pid())")
          .execute(&mut **tx)
          .await;
        let called = Arc::clone(&self.post_rollback_called);
        Err(server_spi::RateLimitRejection::with_post_rollback(
          DomainError::RateLimited("workspace invite rate limited".into()),
          Box::pin(async move {
            called.store(true, Ordering::SeqCst);
            Ok(())
          }),
        ))
      }
    }

    let post_rollback_called = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let policy = Arc::new(TerminatingRateLimitPolicy {
      post_rollback_called: Arc::clone(&post_rollback_called),
    });
    let workspaces = WorkspaceService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::new()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_rate_limit_policy(policy);
    let ws = workspaces
      .create_workspace(&admin.user.id, Some("Rollback Workspace"))
      .await
      .expect("create workspace");

    let err = workspaces
      .invite_member_with_source(
        &admin.user.id,
        &ws.id,
        "invitee-rb@affine.test",
        WorkspaceRole::Member,
        None,
      )
      .await
      .expect_err("terminated tx rollback must fail");
    assert!(
      matches!(err, DomainError::Internal(_)),
      "expected Internal rollback error, got {err:?}"
    );
    assert!(
      !post_rollback_called.load(Ordering::SeqCst),
      "post_rollback must not run when tx.rollback() fails"
    );

    db.pool().close().await;
  });
}
