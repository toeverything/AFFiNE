use std::sync::Arc;

use aes_gcm::{
  AesGcm, KeyInit as _,
  aead::{Aead as _, generic_array::typenum::U12},
  aes::Aes256,
};
use chrono::{DateTime, Duration, Utc};
use p256::ecdsa::{DerSignature, Signature, SigningKey, VerifyingKey, signature::Signer as _};
use p256::pkcs8::{EncodePublicKey as _, LineEnding};
use serde_json::json;
use server_db::{DbConfig, ServerDb, WorkloadTier};
use server_domain::events::NoopEventPublisher;
use server_domain::selfhost_license::{
  RemoteHealthOutcome, RemoteLicensePayload, ReqwestSelfhostLicenseClient, SelfhostLicenseClient,
  SelfhostLicenseService,
};
use server_spi::{CommunityQuotaGate, QuotaGate};
use server_types::DomainError;
use server_types::license::{
  DEFAULT_SELFHOST_LICENSE_BYTES, Keyring, LICENSE_AUDIENCE_SELFHOST, LicenseClaimsV1, LicenseClaimsV2,
  LicenseEnvelopeV1, LicenseEnvelopeV2, LicenseLimitsV2, LicenseRightsV2, LicenseScopeV2, PRO_KID,
};
use sha2::{Digest as _, Sha256};
use sqlx::{Postgres, Transaction};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpListener;
use tokio::sync::{Barrier, Notify};
use uuid::Uuid;

async fn lock_workspace_license_in_tx(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> Result<(), DomainError> {
  sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
    .bind(format!("affine:selfhost-license:{workspace_id}"))
    .execute(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock selfhost license advisory: {e}")))?;
  let ws_exists: Option<String> = sqlx::query_scalar("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
    .bind(workspace_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| DomainError::Internal(format!("lock workspace for license: {e}")))?;
  if ws_exists.is_none() {
    return Err(DomainError::NotFound("workspace_not_found".to_owned()));
  }
  Ok(())
}

fn test_keypair(seed: u8) -> (SigningKey, String) {
  let signing_key = SigningKey::from_slice(&[seed; 32]).unwrap();
  let pem = VerifyingKey::from(&signing_key)
    .to_public_key_pem(LineEnding::LF)
    .unwrap();
  (signing_key, pem)
}

fn sign_v2_license(signing_key: &SigningKey, license_id: &str, ws_id: &str, tier: &str, seats: i32) -> Vec<u8> {
  let claims = LicenseClaimsV2 {
    format_version: 2,
    kid: PRO_KID.to_owned(),
    license_id: license_id.to_owned(),
    audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
    scope: LicenseScopeV2 {
      kind: "workspace".to_owned(),
      workspace_id: Some(ws_id.to_owned()),
    },
    tier: tier.to_owned(),
    limits: LicenseLimitsV2 {
      blob_limit_bytes: 524_288_000,
      storage_quota_bytes: 1_099_511_627_776,
      seat_limit: seats,
      seat_quota_bytes: None,
      history_period_seconds: 31_536_000,
      copilot_action_limit: None,
    },
    rights: LicenseRightsV2 {
      commercial: true,
      copilot_byok: true,
      unlimited_copilot: true,
    },
    recurring: Some("yearly".to_owned()),
    issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
    not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
    expires_at: Some((Utc::now() + Duration::days(365)).to_rfc3339()),
  };
  let canonical = serde_json::to_vec(&claims).unwrap();
  let sig: DerSignature = signing_key.sign(&canonical);
  serde_json::to_vec(&LicenseEnvelopeV2 {
    claims,
    signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
  })
  .unwrap()
}

fn sign_v1_license(signing_key: &SigningKey, license_id: &str, ws_id: &str, seats: i32) -> Vec<u8> {
  let claims = LicenseClaimsV1 {
    format_version: 1,
    license_id: license_id.to_owned(),
    workspace_id: ws_id.to_owned(),
    audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
    plan: "selfhost_team".to_owned(),
    seat_quantity: seats,
    issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
    not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
    expires_at: (Utc::now() + Duration::days(90)).to_rfc3339(),
  };
  let canonical = serde_json::to_vec(&claims).unwrap();
  let canonical_str = std::str::from_utf8(&canonical).unwrap();
  assert!(!canonical_str.contains("\"recurring\""));
  assert!(canonical_str.find("\"workspaceId\"") < canonical_str.find("\"audience\""));
  let sig: DerSignature = signing_key.sign(&canonical);
  serde_json::to_vec(&LicenseEnvelopeV1 {
    claims,
    signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
  })
  .unwrap()
}

fn sign_legacy_aes_license(signing_key: &SigningKey, license_id: &str, ws_id: &str, seats: i32) -> Vec<u8> {
  let expires_at = Utc::now() + Duration::days(180);
  let payload = serde_json::to_string_pretty(&json!({
    "entity": "acme",
    "issuer": "Toeverything",
    "subject": "selfhostedteam",
    "issuedAt": (Utc::now() - Duration::days(1)).to_rfc3339(),
    "expiresAt": expires_at.to_rfc3339(),
    "data": {
      "id": license_id,
      "workspaceId": ws_id,
      "quantity": seats,
      "plan": "selfhostedteam",
      "recurring": "monthly",
      "endAt": (expires_at + Duration::days(1)).to_rfc3339(),
    }
  }))
  .unwrap();
  let iv = [9u8; 12];
  let mut message = iv.to_vec();
  message.extend_from_slice(payload.as_bytes());
  let sig: Signature = signing_key.sign(&message);
  let plaintext = serde_json::to_vec(&json!({
    "payload": payload,
    "signature": hex::encode(sig.to_der()),
  }))
  .unwrap();
  let aes_key: [u8; 32] = Sha256::digest(b"TEST_LICENSE_AES_KEY").into();
  let cipher = AesGcm::<Aes256, U12, U12>::new(&aes_key.into());
  let ciphertext = cipher.encrypt((&iv).into(), plaintext.as_ref()).unwrap();
  let split = ciphertext.len() - 12;
  let mut out = vec![12, 12];
  out.extend_from_slice(&iv);
  out.extend_from_slice(&ciphertext[split..]);
  out.extend_from_slice(&ciphertext[..split]);
  out
}

async fn spawn_http_stub(
  handler: impl Fn(String) -> (u16, Vec<(String, String)>, Vec<u8>) + Send + Sync + 'static,
) -> (String, tokio::task::JoinHandle<()>) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let addr = listener.local_addr().unwrap();
  let handler = Arc::new(handler);
  let task = tokio::spawn(async move {
    while let Ok((mut stream, _)) = listener.accept().await {
      let handler = Arc::clone(&handler);
      tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        let n = stream.read(&mut buf).await.unwrap_or(0);
        let req = String::from_utf8_lossy(&buf[..n]).into_owned();
        let (status, headers, body) = handler(req);
        let mut resp = format!("HTTP/1.1 {status} OK\r\nContent-Length: {}\r\n", body.len());
        for (k, v) in headers {
          resp.push_str(&format!("{k}: {v}\r\n"));
        }
        resp.push_str("Connection: close\r\n\r\n");
        let _ = stream.write_all(resp.as_bytes()).await;
        let _ = stream.write_all(&body).await;
      });
    }
  });
  (format!("http://{addr}"), task)
}

#[test]
fn license_install_legacy_v1_v2_and_deactivate_dual_write_entitlements() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let owner_id = Uuid::new_v4().to_string();
    let ws_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'lic-owner@example.com')")
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (signing_key, pro_pem) = test_keypair(0x5A);
    let keyring = Keyring::with_pro_public_key(pro_pem);
    let gate = CommunityQuotaGate::with_keyring(keyring.clone());
    let svc = SelfhostLicenseService::new(
      db.clone(),
      Arc::new(gate.clone()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_keyring(keyring);

    // 1. Default bundled non-commercial license and commercial instance_default license
    //    must both be rejected on preview and install BEFORE any DB write.
    assert!(svc.preview_license(DEFAULT_SELFHOST_LICENSE_BYTES).is_err());
    assert!(svc.install_license(&owner_id, &ws_id, DEFAULT_SELFHOST_LICENSE_BYTES).await.is_err());
    let inst_default_claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: "inst-default-commercial".to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "instance_default".to_owned(),
        workspace_id: None,
      },
      tier: "selfhost_team".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 100,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: false,
      },
      recurring: Some("yearly".to_owned()),
      issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
      expires_at: Some((Utc::now() + Duration::days(365)).to_rfc3339()),
    };
    let inst_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&inst_default_claims).unwrap());
    let inst_default_bytes = serde_json::to_vec(&LicenseEnvelopeV2 {
      claims: inst_default_claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, inst_sig.as_bytes()),
    })
    .unwrap();
    assert!(svc.preview_license(&inst_default_bytes).is_err());
    assert!(svc.install_license(&owner_id, &ws_id, &inst_default_bytes).await.is_err());

    // 2. Legacy AES .license -> preview + install stores raw binary in installed_licenses
    //    and normalized JSON in entitlements with plan = 'selfhost_team' and lowercase recurring.
    let legacy_bin = sign_legacy_aes_license(&signing_key, &format!("legacy-{ws_id}"), &ws_id, 15);
    let preview_legacy = svc.preview_license(&legacy_bin).unwrap();
    assert_eq!(preview_legacy.plan, "SelfHostedTeam");
    assert_eq!(preview_legacy.quantity, 15);
    let installed_legacy = svc.install_license(&owner_id, &ws_id, &legacy_bin).await.unwrap();
    assert_eq!(installed_legacy.quantity, 15);
    assert_eq!(installed_legacy.recurring, "monthly");

    let (ent_plan, ent_payload, ent_recurring): (String, Vec<u8>, String) = sqlx::query_as(
      "SELECT plan, signed_payload, metadata->>'recurring' FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(ent_plan, "selfhost_team");
    assert_eq!(ent_recurring, "monthly");
    assert!(ent_payload.starts_with(b"{"), "entitlement signed_payload must be normalized JSON");
    {
      // Legacy-v0 has no `not_before` restriction: test `now < issued_at` cold + cached.
      let before_issued = Utc::now() - Duration::days(3);
      let mut tx = db.pool().begin().await.unwrap();
      let grant_cold = gate.resolve_workspace_grant(&mut tx, &ws_id, before_issued).await.unwrap();
      let grant_cached = gate.resolve_workspace_grant(&mut tx, &ws_id, before_issued).await.unwrap();
      assert_eq!(grant_cold, grant_cached);
      assert_eq!(grant_cold.limits.seat_limit, 15);
      assert_eq!(grant_cold.limits.blob_limit_bytes, 524_288_000);
      assert_eq!(grant_cold.limits.storage_quota_bytes, 429_496_729_600);
      assert_eq!(grant_cold.limits.seat_quota_bytes, Some(21_474_836_480));
      assert_eq!(grant_cold.limits.history_period_seconds, 2_592_000);
      assert_eq!(grant_cold.limits.copilot_action_limit, None);
      assert!(grant_cold.rights.commercial);
      assert!(grant_cold.rights.copilot_byok);
      assert!(!grant_cold.rights.unlimited_copilot);
      tx.rollback().await.unwrap();
    }

    // 3. V1 license preview & install (exact affine_core 9-field canonical claims).
    let v1_bytes = sign_v1_license(&signing_key, &format!("v1-{ws_id}"), &ws_id, 15);
    let preview_v1 = svc.preview_license(&v1_bytes).unwrap();
    assert_eq!(preview_v1.quantity, 15);
    let installed_v1 = svc.install_license(&owner_id, &ws_id, &v1_bytes).await.unwrap();
    assert_eq!(installed_v1.quantity, 15);
    assert_eq!(installed_v1.recurring, "lifetime");
    {
      let mut tx = db.pool().begin().await.unwrap();
      let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
      assert_eq!(grant.limits.seat_limit, 15);
      assert_eq!(grant.limits.blob_limit_bytes, 524_288_000);
      assert_eq!(grant.limits.storage_quota_bytes, 429_496_729_600);
      assert_eq!(grant.limits.seat_quota_bytes, Some(21_474_836_480));
      assert!(!grant.rights.unlimited_copilot);
      tx.rollback().await.unwrap();
    }

    // 4. V2 enterprise license writes DB compatibility plan = 'selfhost_team',
    //    lowercase recurring = 'yearly', while GraphQL preview keeps "Enterprise".
    let v2_ent = sign_v2_license(&signing_key, &format!("v2-{ws_id}"), &ws_id, "selfhost_enterprise", 50);
    assert_eq!(svc.preview_license(&v2_ent).unwrap().plan, "Enterprise");
    let installed_v2 = svc.install_license(&owner_id, &ws_id, &v2_ent).await.unwrap();
    assert_eq!(installed_v2.quantity, 50);
    assert_eq!(installed_v2.recurring, "yearly");
    let (ent_plan_v2, db_recurring_v2): (String, String) = sqlx::query_as(
      "SELECT e.plan, l.recurring
       FROM entitlements e
       JOIN installed_licenses l ON l.workspace_id = e.target_id
       WHERE e.source = 'selfhost_license' AND e.target_id = $1 AND e.status = 'active'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(ent_plan_v2, "selfhost_team");
    assert_eq!(db_recurring_v2, "yearly");
    {
      let mut tx = db.pool().begin().await.unwrap();
      let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
      assert_eq!(grant.limits.seat_limit, 50);
      tx.rollback().await.unwrap();
    }

    // 5. Destructive install attempts (tampered signature, cross-workspace, expired)
    //    must fail with v0.27.5 error messages and leave the active 50-seat license intact.
    let tampered = String::from_utf8(v2_ent.clone()).unwrap().replace("50", "99");
    let other_ws_lic = sign_v2_license(&signing_key, "v2-other-ws", "other-ws", "selfhost_team", 30);
    let expired_claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: format!("v2-expired-{ws_id}"),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(ws_id.clone()),
      },
      tier: "selfhost_team".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 30,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("monthly".to_owned()),
      issued_at: (Utc::now() - Duration::days(30)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(31)).to_rfc3339(),
      expires_at: Some((Utc::now() - Duration::days(1)).to_rfc3339()),
    };
    let expired_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&expired_claims).unwrap());
    let expired_lic = serde_json::to_vec(&LicenseEnvelopeV2 {
      claims: expired_claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, expired_sig.as_bytes()),
    })
    .unwrap();

    let bad_attempts: [(&str, Vec<u8>, Option<&str>); 3] = [
      ("tampered", tampered.into_bytes(), None),
      ("cross_workspace", other_ws_lic, Some("Workspace mismatched with license.")),
      ("expired", expired_lic, Some("license expired")),
    ];
    for (label, bad_bytes, expected_msg) in bad_attempts {
      let err = svc
        .install_license(&owner_id, &ws_id, &bad_bytes)
        .await
        .expect_err(&format!("{label} license must be rejected"));
      if let Some(substr) = expected_msg {
        assert!(
          err.to_string().contains(substr),
          "{label} error must contain {substr:?}, got: {err}"
        );
      }
      let still_installed = svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap();
      assert_eq!(still_installed.quantity, 50, "{label} must not overwrite installed license");
      let ent_qty: i32 = sqlx::query_scalar(
        "SELECT quantity FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
      )
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
      assert_eq!(ent_qty, 50, "{label} must not revoke or alter active entitlement");
      let mut tx = db.pool().begin().await.unwrap();
      let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
      assert_eq!(grant.limits.seat_limit, 50, "{label} must not degrade quota grant");
      tx.rollback().await.unwrap();
    }

    // 6. Deactivate revokes entitlements cleanly and restores default 10-seat grant.
    assert!(svc.deactivate_license(&owner_id, &ws_id).await.unwrap());
    let active_count: i64 = sqlx::query_scalar(
      "SELECT COUNT(*)::bigint FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(active_count, 0);
    {
      let mut tx = db.pool().begin().await.unwrap();
      let grant = gate.resolve_workspace_grant(&mut tx, &ws_id, Utc::now()).await.unwrap();
      assert_eq!(grant.limits.seat_limit, 10);
      tx.rollback().await.unwrap();
    }
  });
  drop(lease);
}

#[test]
fn check_licenses_holds_zero_pool_connections_during_http_and_cas_prevents_resurrection() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    // Single-connection pool proves check_licenses holds ZERO PgPool connections while awaiting HTTP.
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 1,
      statement_timeout_ms: 5_000,
      tier_permits: [1, 1, 1, 1],
    })
    .await
    .unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let owner_id = Uuid::new_v4().to_string();
    let ws_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'cas-owner@example.com')")
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (signing_key, pro_pem) = test_keypair(0x6B);
    let key_a = "KEY-A-10";
    let vk_a = Uuid::new_v4().to_string();
    let env_a = sign_v2_license(&signing_key, key_a, &ws_id, "selfhost_team", 10);
    let env_a_refreshed = sign_v2_license(&signing_key, key_a, &ws_id, "selfhost_team", 12);
    let key_b = "KEY-B-25";
    let env_b = sign_v2_license(&signing_key, key_b, &ws_id, "selfhost_team", 25);

    struct BarrierClient {
      entered: Arc<Notify>,
      release: Arc<Barrier>,
      health_envelope: Vec<u8>,
      activate_envelope: Vec<u8>,
      vk: String,
    }
    #[async_trait::async_trait]
    impl SelfhostLicenseClient for BarrierClient {
      async fn activate(&self, _k: &str, _w: &str, _op: &str) -> Result<RemoteLicensePayload, DomainError> {
        Ok(RemoteLicensePayload {
          recurring: "yearly".into(),
          validate_key: self.vk.clone(),
          envelope: self.activate_envelope.clone(),
        })
      }
      async fn deactivate(&self, _k: &str, _vk: &str) -> Result<(), DomainError> {
        self.entered.notify_one();
        self.release.wait().await;
        Ok(())
      }
      async fn health(&self, _k: &str, vk: &str, _w: &str) -> Result<RemoteHealthOutcome, DomainError> {
        self.entered.notify_one();
        self.release.wait().await;
        Ok(RemoteHealthOutcome::Active(RemoteLicensePayload {
          recurring: "yearly".into(),
          validate_key: vk.to_owned(),
          envelope: self.health_envelope.clone(),
        }))
      }
      async fn update_seats(&self, _k: &str, _vk: &str, _s: u32) -> Result<(), DomainError> {
        Ok(())
      }
      async fn create_customer_portal(&self, _k: &str, _vk: &str) -> Result<String, DomainError> {
        Ok("https://portal.test".into())
      }
    }

    // 1. Mismatched license_id on activate is rejected with license_identity_changed.
    let mismatch_client = Arc::new(BarrierClient {
      entered: Arc::new(Notify::new()),
      release: Arc::new(Barrier::new(1)),
      health_envelope: env_a.clone(),
      activate_envelope: env_b.clone(),
      vk: vk_a.clone(),
    });
    let svc_mismatch = SelfhostLicenseService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::new()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_keyring(Keyring::with_pro_public_key(pro_pem.clone()))
    .with_client(mismatch_client);
    let err = svc_mismatch.activate_license(&owner_id, &ws_id, key_a).await.unwrap_err();
    assert!(err.to_string().contains("license_identity_changed"), "got {err}");

    // 2. Seed stale license A; suspend health HTTP on barrier; while suspended,
    //    verify a normal DB query succeeds on the 1-connection pool!
    let entered = Arc::new(Notify::new());
    let release = Arc::new(Barrier::new(2));
    let client = Arc::new(BarrierClient {
      entered: Arc::clone(&entered),
      release: Arc::clone(&release),
      health_envelope: env_a_refreshed.clone(),
      activate_envelope: env_a.clone(),
      vk: vk_a.clone(),
    });
    let svc = SelfhostLicenseService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::new()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_keyring(Keyring::with_pro_public_key(pro_pem.clone()))
    .with_client(client);
    svc.activate_license(&owner_id, &ws_id, key_a).await.unwrap();
    sqlx::query("UPDATE installed_licenses SET validated_at = clock_timestamp() - interval '2 hours' WHERE workspace_id = $1")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();

    let svc_scan = svc.clone();
    let scan_handle = tokio::spawn(async move { svc_scan.check_licenses().await });
    entered.notified().await;

    // Pool has max_connections = 1; this query would deadlock if check_licenses held a pool conn!
    let ping: i32 = sqlx::query_scalar("SELECT 1").fetch_one(db.pool()).await.unwrap();
    assert_eq!(ping, 1);

    release.wait().await;
    assert_eq!(scan_handle.await.unwrap().unwrap(), 1);
    assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity, 12);

    // 3. CAS race: suspend health for A, replace with offline license B mid-flight,
    //    release A -> B and its entitlement remain intact, A does NOT resurrect!
    sqlx::query("UPDATE installed_licenses SET validated_at = clock_timestamp() - interval '2 hours' WHERE workspace_id = $1")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
    let svc_scan2 = svc.clone();
    let scan_handle2 = tokio::spawn(async move { svc_scan2.check_licenses().await });
    entered.notified().await;

    svc.install_license(&owner_id, &ws_id, &env_b).await.unwrap();
    release.wait().await;
    assert_eq!(scan_handle2.await.unwrap().unwrap(), 0);
    let current = svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap();
    assert_eq!(current.key, key_b);
    assert_eq!(current.quantity, 25);

    let active_subject: String = sqlx::query_scalar(
      "SELECT subject_id FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(active_subject, key_b);

    // 4. CAS race on deactivate: re-activate A, suspend deactivate(A) mid-flight,
    //    replace with B -> deactivate(A) returns license_not_found and B stays active!
    assert!(svc.deactivate_license(&owner_id, &ws_id).await.unwrap());
    svc.activate_license(&owner_id, &ws_id, key_a).await.unwrap();
    let svc_deact = svc.clone();
    let owner_clone = owner_id.clone();
    let ws_clone = ws_id.clone();
    let deact_handle = tokio::spawn(async move { svc_deact.deactivate_license(&owner_clone, &ws_clone).await });
    entered.notified().await;

    svc.install_license(&owner_id, &ws_id, &env_b).await.unwrap();
    release.wait().await;
    assert!(matches!(
      deact_handle.await.unwrap(),
      Err(DomainError::NotFound(_))
    ));
    assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().key, key_b);
    let active_subject_after: String = sqlx::query_scalar(
      "SELECT subject_id FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND status = 'active'",
    )
    .bind(&ws_id)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(active_subject_after, key_b);
  });
  drop(lease);
}

#[test]
fn quota_gate_enforces_entitlement_time_windows_and_multi_candidate_arbitration() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let ws_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();

    let (signing_key, pro_pem) = test_keypair(0x7C);
    let gate = CommunityQuotaGate::with_keyring(Keyring::with_pro_public_key(pro_pem));
    // Align to millisecond precision matching PG `timestamptz(3)` so exact boundary equality is deterministic.
    let now = DateTime::from_timestamp_millis(Utc::now().timestamp_millis()).unwrap();
    let payload_30 = sign_v2_license(&signing_key, "lic-30", &ws_id, "selfhost_team", 30);
    let payload_40 = sign_v2_license(&signing_key, "lic-40", &ws_id, "selfhost_team", 40);

    // (a) starts_at > now rejected; now == starts_at allowed.
    let starts_future = now + Duration::minutes(10);
    let ent_a = Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, starts_at, expires_at, updated_at)
       VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-30', 'selfhost_team', 'active', 30, $3, $4, $5, $6)",
    )
    .bind(&ent_a)
    .bind(&ws_id)
    .bind(&payload_30)
    .bind(starts_future)
    .bind(now + Duration::days(30))
    .bind(now)
    .execute(db.pool())
    .await
    .unwrap();

    let mut tx = db.pool().begin().await.unwrap();
    assert_eq!(gate.resolve_workspace_grant(&mut tx, &ws_id, now).await.unwrap().limits.seat_limit, 10);
    assert_eq!(
      gate.resolve_workspace_grant(&mut tx, &ws_id, starts_future).await.unwrap().limits.seat_limit,
      30
    );
    tx.rollback().await.unwrap();

    // (b) grace: now < grace_until allowed; now == grace_until rejected even if signed_payload not expired.
    let grace_until = now + Duration::minutes(5);
    sqlx::query("UPDATE entitlements SET status = 'grace', starts_at = NULL, grace_until = $2 WHERE id = $1")
      .bind(&ent_a)
      .bind(grace_until)
      .execute(db.pool())
      .await
      .unwrap();
    let mut tx = db.pool().begin().await.unwrap();
    assert_eq!(gate.resolve_workspace_grant(&mut tx, &ws_id, now).await.unwrap().limits.seat_limit, 30);
    assert_eq!(
      gate.resolve_workspace_grant(&mut tx, &ws_id, grace_until).await.unwrap().limits.seat_limit,
      10
    );
    tx.rollback().await.unwrap();

    // (c) active: now == expires_at rejected.
    let row_exp = now + Duration::minutes(2);
    sqlx::query("UPDATE entitlements SET status = 'active', grace_until = NULL, expires_at = $2 WHERE id = $1")
      .bind(&ent_a)
      .bind(row_exp)
      .execute(db.pool())
      .await
      .unwrap();
    let mut tx = db.pool().begin().await.unwrap();
    assert_eq!(
      gate.resolve_workspace_grant(&mut tx, &ws_id, row_exp).await.unwrap().limits.seat_limit,
      10
    );
    tx.rollback().await.unwrap();

    // (d) Latest row is past grace_until, older row is valid active -> picks the valid active candidate!
    let ent_b = Uuid::new_v4().to_string();
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, starts_at, expires_at, grace_until, updated_at)
       VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-40', 'selfhost_team', 'grace', 40, $3, NULL, $4, $5, $6)",
    )
    .bind(&ent_b)
    .bind(&ws_id)
    .bind(&payload_40)
    .bind(now + Duration::days(30))
    .bind(now - Duration::seconds(1))
    .bind(now + Duration::seconds(10))
    .execute(db.pool())
    .await
    .unwrap();
    let mut tx = db.pool().begin().await.unwrap();
    assert_eq!(gate.resolve_workspace_grant(&mut tx, &ws_id, now).await.unwrap().limits.seat_limit, 30);
    tx.rollback().await.unwrap();
  });
  drop(lease);
}

#[test]
fn write_transactions_recheck_permission_and_expiry_after_acquiring_lock() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_multi_thread()
    .worker_threads(2)
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let owner_id = Uuid::new_v4().to_string();
    let ws_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'lock-owner@example.com')")
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(&ws_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ws_id)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();

    let (signing_key, pro_pem) = test_keypair(0x8D);
    let keyring = Keyring::with_pro_public_key(pro_pem);
    let svc = SelfhostLicenseService::new(
      db.clone(),
      Arc::new(CommunityQuotaGate::with_keyring(keyring.clone())),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_keyring(keyring);

    let valid_lic = sign_v2_license(&signing_key, "lic-valid-20", &ws_id, "selfhost_team", 20);

    // Deterministic PG lock-queue waiter scoped to current_database() and the lock holder PID.
    let wait_for_blocked_lock = |pool: sqlx::PgPool, holder_pid: i32| async move {
      let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
      loop {
        let blocked: bool = sqlx::query_scalar(
          "SELECT EXISTS(
             SELECT 1
             FROM pg_locks
             WHERE NOT granted
               AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
               AND $1 = ANY(pg_blocking_pids(pid))
           )",
        )
        .bind(holder_pid)
        .fetch_one(&pool)
        .await
        .unwrap();
        if blocked {
          return;
        }
        assert!(
          std::time::Instant::now() < deadline,
          "timed out waiting for concurrent write transaction to block on pg_locks"
        );
        tokio::task::yield_now().await;
      }
    };

    // (a) Tx1 holds lock, demotes actor to member, commits -> blocked install_license rejects with Forbidden and 0 writes.
    let mut lock_tx = db.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
    let holder_pid_1: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
      .fetch_one(&mut **lock_tx.tx_mut())
      .await
      .unwrap();
    lock_workspace_license_in_tx(lock_tx.tx_mut(), &ws_id).await.unwrap();

    let svc_inst = svc.clone();
    let owner_c = owner_id.clone();
    let ws_c = ws_id.clone();
    let lic_c = valid_lic.clone();
    let inst_handle = tokio::spawn(async move { svc_inst.install_license(&owner_c, &ws_c, &lic_c).await });
    wait_for_blocked_lock(db.pool().clone(), holder_pid_1).await;
    assert!(!inst_handle.is_finished(), "install_license must wait on workspace license lock");

    sqlx::query("UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(&mut **lock_tx.tx_mut())
      .await
      .unwrap();
    lock_tx.commit().await.unwrap();

    let err = inst_handle.await.unwrap().expect_err("demoted actor must be rejected");
    assert!(matches!(err, DomainError::Forbidden(_)), "expected Forbidden, got {err:?}");
    let lic_count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM installed_licenses WHERE workspace_id = $1")
      .bind(&ws_id)
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(lic_count, 0);

    // Restore owner & install valid license, then test deactivate_license blocked while actor is demoted.
    sqlx::query("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    svc.install_license(&owner_id, &ws_id, &valid_lic).await.unwrap();

    let mut lock_tx2 = db.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
    let holder_pid_2: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
      .fetch_one(&mut **lock_tx2.tx_mut())
      .await
      .unwrap();
    lock_workspace_license_in_tx(lock_tx2.tx_mut(), &ws_id).await.unwrap();
    let svc_deact = svc.clone();
    let owner_c2 = owner_id.clone();
    let ws_c2 = ws_id.clone();
    let deact_handle = tokio::spawn(async move { svc_deact.deactivate_license(&owner_c2, &ws_c2).await });
    wait_for_blocked_lock(db.pool().clone(), holder_pid_2).await;
    assert!(!deact_handle.is_finished(), "deactivate_license must wait on workspace license lock");
    sqlx::query("UPDATE workspace_members SET role = 'member' WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(&mut **lock_tx2.tx_mut())
      .await
      .unwrap();
    lock_tx2.commit().await.unwrap();
    let deact_err = deact_handle.await.unwrap().expect_err("demoted actor deactivate must fail");
    assert!(matches!(deact_err, DomainError::Forbidden(_)));

    // Restore owner and confirm license + entitlement were untouched.
    sqlx::query("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2")
      .bind(&ws_id)
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity, 20);

    // (b) License expires while install_license is blocked waiting for the workspace lock -> rejected with 0 writes.
    let db_now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(db.pool())
      .await
      .unwrap();
    let exp_soon = db_now + Duration::milliseconds(150);
    let short_claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: "lic-expiring-mid-lock".to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(ws_id.clone()),
      },
      tier: "selfhost_team".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 99,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      recurring: Some("monthly".to_owned()),
      issued_at: (db_now - Duration::minutes(1)).to_rfc3339(),
      not_before: (db_now - Duration::minutes(2)).to_rfc3339(),
      expires_at: Some(exp_soon.to_rfc3339()),
    };
    let short_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&short_claims).unwrap());
    let short_lic = serde_json::to_vec(&LicenseEnvelopeV2 {
      claims: short_claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, short_sig.as_bytes()),
    })
    .unwrap();

    let mut lock_tx3 = db.begin_tiered(WorkloadTier::InteractiveWrite).await.unwrap();
    let holder_pid_3: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
      .fetch_one(&mut **lock_tx3.tx_mut())
      .await
      .unwrap();
    lock_workspace_license_in_tx(lock_tx3.tx_mut(), &ws_id).await.unwrap();
    let svc_exp = svc.clone();
    let owner_c3 = owner_id.clone();
    let ws_c3 = ws_id.clone();
    let exp_handle = tokio::spawn(async move { svc_exp.install_license(&owner_c3, &ws_c3, &short_lic).await });
    wait_for_blocked_lock(db.pool().clone(), holder_pid_3).await;
    let clock_deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
      let past: bool = sqlx::query_scalar("SELECT clock_timestamp() >= $1")
        .bind(exp_soon)
        .fetch_one(&mut **lock_tx3.tx_mut())
        .await
        .unwrap();
      if past {
        break;
      }
      assert!(
        std::time::Instant::now() < clock_deadline,
        "timed out waiting for DB clock_timestamp() to pass exp_soon"
      );
      tokio::task::yield_now().await;
    }
    lock_tx3.commit().await.unwrap();

    let exp_err = exp_handle.await.unwrap().expect_err("expired-in-wait license must be rejected");
    assert!(exp_err.to_string().contains("license expired"), "got {exp_err}");
    assert_eq!(svc.get_license(&owner_id, &ws_id).await.unwrap().unwrap().quantity, 20);
  });
  drop(lease);
}

#[test]
fn check_licenses_rotates_cursor_past_100_failures_expires_onetime_and_syncs_chargeable_seats() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let (signing_key, pro_pem) = test_keypair(0x9E);
    let keyring = Keyring::with_pro_public_key(pro_pem);
    let gate = CommunityQuotaGate::with_keyring(keyring.clone());

    let stale_at = Utc::now() - Duration::hours(2);
    // Seed 100 failing recurring workspaces (ws-000 .. ws-099) + 101st healthy (ws-100) + expired onetime (ws-101).
    for i in 0..=101 {
      let ws = format!("ws-{i:03}");
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(&ws)
        .execute(db.pool())
        .await
        .unwrap();
      let vk = Uuid::new_v4().to_string();
      if i <= 100 {
        let key = format!("key-{i:03}");
        let env = sign_v2_license(&signing_key, &key, &ws, "selfhost_team", 10);
        sqlx::query(
          "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
           VALUES ($1, $2, 10, 'monthly', NULL, $3, $4, $3, $5, $6)",
        )
        .bind(&key)
        .bind(&ws)
        .bind(stale_at)
        .bind(&vk)
        .bind(Utc::now() + Duration::days(30))
        .bind(&env)
        .execute(db.pool())
        .await
        .unwrap();
      } else {
        // ws-101: expired offline onetime license with previously active entitlement.
        let key = "key-onetime-expired";
        let exp_claims = LicenseClaimsV2 {
          format_version: 2,
          kid: PRO_KID.to_owned(),
          license_id: key.to_owned(),
          audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
          scope: LicenseScopeV2 {
            kind: "workspace".to_owned(),
            workspace_id: Some(ws.clone()),
          },
          tier: "selfhost_team".to_owned(),
          limits: LicenseLimitsV2 {
            blob_limit_bytes: 524_288_000,
            storage_quota_bytes: 1_099_511_627_776,
            seat_limit: 25,
            seat_quota_bytes: None,
            history_period_seconds: 31_536_000,
            copilot_action_limit: None,
          },
          rights: LicenseRightsV2 {
            commercial: true,
            copilot_byok: true,
            unlimited_copilot: true,
          },
          recurring: Some("lifetime".to_owned()),
          issued_at: (Utc::now() - Duration::days(60)).to_rfc3339(),
          not_before: (Utc::now() - Duration::days(61)).to_rfc3339(),
          expires_at: Some((Utc::now() - Duration::hours(1)).to_rfc3339()),
        };
        let sig: DerSignature = signing_key.sign(&serde_json::to_vec(&exp_claims).unwrap());
        let exp_bytes = serde_json::to_vec(&LicenseEnvelopeV2 {
          claims: exp_claims,
          signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.as_bytes()),
        })
        .unwrap();
        sqlx::query(
          "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
           VALUES ($1, $2, 25, 'lifetime', 'onetime', $3, $4, $3, $5, $6)",
        )
        .bind(key)
        .bind(&ws)
        .bind(stale_at)
        .bind(&vk)
        .bind(Utc::now() - Duration::hours(1))
        .bind(&exp_bytes)
        .execute(db.pool())
        .await
        .unwrap();
        sqlx::query(
          "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
           VALUES ($1, 'workspace', $2, 'selfhost_license', $3, 'selfhost_team', 'active', 25, $4, $5, $6, $6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&ws)
        .bind(key)
        .bind(&exp_bytes)
        .bind(Utc::now() - Duration::hours(1))
        .bind(stale_at)
        .execute(db.pool())
        .await
        .unwrap();
      }
    }

    let synced_seats = Arc::new(std::sync::Mutex::new(Vec::<u32>::new()));
    struct CursorClient {
      signing_key: SigningKey,
      synced_seats: Arc<std::sync::Mutex<Vec<u32>>>,
    }
    #[async_trait::async_trait]
    impl SelfhostLicenseClient for CursorClient {
      async fn activate(&self, _k: &str, _w: &str, _op: &str) -> Result<RemoteLicensePayload, DomainError> {
        Err(DomainError::Unavailable("unused".into()))
      }
      async fn deactivate(&self, _k: &str, _vk: &str) -> Result<(), DomainError> {
        Ok(())
      }
      async fn health(&self, key: &str, vk: &str, ws: &str) -> Result<RemoteHealthOutcome, DomainError> {
        if ws == "ws-100" {
          Ok(RemoteHealthOutcome::Active(RemoteLicensePayload {
            recurring: "monthly".into(),
            validate_key: vk.to_owned(),
            envelope: sign_v2_license(&self.signing_key, key, ws, "selfhost_team", 33),
          }))
        } else {
          Err(DomainError::Unavailable("simulated remote outage".into()))
        }
      }
      async fn update_seats(&self, _k: &str, _vk: &str, seats: u32) -> Result<(), DomainError> {
        self.synced_seats.lock().unwrap().push(seats);
        Ok(())
      }
      async fn create_customer_portal(&self, _k: &str, _vk: &str) -> Result<String, DomainError> {
        Ok("https://portal.test".into())
      }
    }

    let svc = SelfhostLicenseService::new(
      db.clone(),
      Arc::new(gate.clone()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_keyring(keyring)
    .with_client(Arc::new(CursorClient {
      signing_key,
      synced_seats: Arc::clone(&synced_seats),
    }));

    // Tick 1 processes ws-000..ws-099 (all fail); Tick 2 rotates cursor to ws-100 & ws-101!
    assert_eq!(svc.check_licenses().await.unwrap(), 0);
    assert_eq!(svc.check_licenses().await.unwrap(), 2);

    let ws100_qty: i32 = sqlx::query_scalar("SELECT quantity FROM installed_licenses WHERE workspace_id = 'ws-100'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(ws100_qty, 33, "101st healthy license must not starve behind 100 failing licenses");

    let (ws101_status, ws101_err): (String, String) = sqlx::query_as(
      "SELECT status, metadata->>'errorCode' FROM entitlements WHERE source = 'selfhost_license' AND target_id = 'ws-101'",
    )
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(ws101_status, "expired");
    assert_eq!(ws101_err, "license_expired");
    let ws101_validated: DateTime<Utc> =
      sqlx::query_scalar("SELECT validated_at FROM installed_licenses WHERE workspace_id = 'ws-101'")
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert!(ws101_validated > stale_at);
    {
      let mut tx = db.pool().begin().await.unwrap();
      let grant = gate.resolve_workspace_grant(&mut tx, "ws-101", Utc::now()).await.unwrap();
      assert_eq!(grant.limits.seat_limit, 10);
      tx.rollback().await.unwrap();
    }

    // Verify sync_workspace_seats counts active members + CHARGEABLE_INVITATION_STATUSES (excluding revoked).
    let owner_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'S', 'seat-owner@example.com')")
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, 'ws-100', $2, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();
    for (idx, status) in ["pending", "waiting_review", "waiting_seat", "revoked"].into_iter().enumerate() {
      let inv_uid = Uuid::new_v4().to_string();
      sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)")
        .bind(&inv_uid)
        .bind(format!("Inv {idx}"))
        .bind(format!("inv-{idx}@example.com"))
        .execute(db.pool())
        .await
        .unwrap();
      sqlx::query(
        "INSERT INTO workspace_invitations
           (id, workspace_id, invitee_user_id, normalized_email, inviter_user_id, requested_role, status, kind, created_at, updated_at)
         VALUES ($1, 'ws-100', $2, $3, $4, 'member', $5, 'email', clock_timestamp(), clock_timestamp())",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(&inv_uid)
      .bind(format!("inv-{idx}@example.com"))
      .bind(&owner_id)
      .bind(status)
      .execute(db.pool())
      .await
      .unwrap();
    }
    svc.sync_workspace_seats("ws-100").await.unwrap();
    assert_eq!(synced_seats.lock().unwrap().as_slice(), &[4]);
  });
  drop(lease);
}

#[test]
fn offline_repair_conflict_skip_and_strict_remote_denial_whitelist() {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../server/migrations");
  let migrations = test_db_harness::migrations::MigrationSet::load(&migrations_dir).expect("load migrations");
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .unwrap();
  rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "canary".into(),
      role: server_types::ServerRole::Allinone,
      selfhosted: true,
      max_connections: 4,
      statement_timeout_ms: 5_000,
      tier_permits: [8, 4, 2, 2],
    })
    .await
    .unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .unwrap();
    db.ensure_schema_ready().await.unwrap();

    let (signing_key, pro_pem) = test_keypair(0xAF);
    let keyring = Keyring::with_pro_public_key(pro_pem);
    let gate = CommunityQuotaGate::with_keyring(keyring.clone());
    let stale_at = Utc::now() - Duration::hours(2);

    // State 1: valid onetime license A (30 seats) in installed_licenses (with stale quantity = 15),
    //          existing entitlement row for A has signed_payload = NULL -> check_licenses repairs both!
    let owner_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO users (id, name, email) VALUES ($1, 'Repair Owner', 'repair-owner@example.com')")
      .bind(&owner_id)
      .execute(db.pool())
      .await
      .unwrap();
    let ws_repair = "ws-repair";
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(ws_repair)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(ws_repair)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();
    let lic_a_30 = sign_v2_license(&signing_key, "lic-a-30", ws_repair, "selfhost_team", 30);
    sqlx::query(
      "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
       VALUES ('lic-a-30', $1, 15, 'monthly', 'onetime', $2, $3, $2, $4, $5)",
    )
    .bind(ws_repair)
    .bind(stale_at)
    .bind(Uuid::new_v4().to_string())
    .bind(Utc::now() + Duration::days(30))
    .bind(&lic_a_30)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
       VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-a-30', 'selfhost_team', 'active', 15, NULL, $3, $4, $4)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(ws_repair)
    .bind(Utc::now() + Duration::days(30))
    .bind(stale_at)
    .execute(db.pool())
    .await
    .unwrap();

    // State 2: stale onetime A (15 seats) in installed_licenses while entitlements has active B (40 seats) ->
    //          check_licenses must NOT revoke B!
    let ws_conflict = "ws-conflict";
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(ws_conflict)
      .execute(db.pool())
      .await
      .unwrap();
    let lic_a_15 = sign_v2_license(&signing_key, "lic-stale-a", ws_conflict, "selfhost_team", 15);
    let lic_b_40 = sign_v2_license(&signing_key, "lic-active-b", ws_conflict, "selfhost_team", 40);
    sqlx::query(
      "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
       VALUES ('lic-stale-a', $1, 15, 'lifetime', 'onetime', $2, $3, $2, $4, $5)",
    )
    .bind(ws_conflict)
    .bind(stale_at)
    .bind(Uuid::new_v4().to_string())
    .bind(Utc::now() + Duration::days(30))
    .bind(&lic_a_15)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
       VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-active-b', 'selfhost_team', 'active', 40, $3, $4, $5, $5)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(ws_conflict)
    .bind(&lic_b_40)
    .bind(Utc::now() + Duration::days(30))
    .bind(Utc::now())
    .execute(db.pool())
    .await
    .unwrap();

    // State 3: typed RemoteHealthOutcome strictly checks (name, data.reason) without string-prefix collision.
    let (base_url, http_handle) = spawn_http_stub(|req| {
      let line = req.lines().next().unwrap_or("");
      if line.contains("/lic-unknown-name/health") {
        (
          400,
          vec![("content-type".into(), "application/json".into())],
          b"{\"name\":\"UNKNOWN_ERROR\",\"data\":{\"reason\":\"remote_denial:license_unbound\"}}".to_vec(),
        )
      } else if line.contains("/lic-msg-only/health") {
        (
          400,
          vec![("content-type".into(), "application/json".into())],
          b"{\"name\":\"INVALID_LICENSE_TO_ACTIVATE\",\"message\":\"remote_denial:license_unbound\"}".to_vec(),
        )
      } else {
        (
          400,
          vec![("content-type".into(), "application/json".into())],
          b"{\"name\":\"INVALID_LICENSE_TO_ACTIVATE\",\"message\":\"bad\",\"data\":{\"reason\":\"license_unbound\"}}".to_vec(),
        )
      }
    })
    .await;

    let http_client = Arc::new(ReqwestSelfhostLicenseClient::new(base_url));
    assert!(http_client.health("lic-unknown-name", "vk", "ws").await.is_err());
    assert!(http_client.health("lic-msg-only", "vk", "ws").await.is_err());
    let exact_outcome = http_client.health("lic-exact-denial", "vk", "ws").await.unwrap();
    assert!(matches!(
      exact_outcome,
      RemoteHealthOutcome::Denied {
        status: "revoked",
        ref reason,
        ..
      } if reason == "license_unbound"
    ));

    for (ws, key) in [
      ("ws-deny-1", "lic-unknown-name"),
      ("ws-deny-2", "lic-msg-only"),
      ("ws-deny-3", "lic-exact-denial"),
    ] {
      sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
        .bind(ws)
        .execute(db.pool())
        .await
        .unwrap();
      let env = sign_v2_license(&signing_key, key, ws, "selfhost_team", 25);
      sqlx::query(
        "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
         VALUES ($1, $2, 25, 'monthly', NULL, $3, $4, $3, $5, $6)",
      )
      .bind(key)
      .bind(ws)
      .bind(stale_at)
      .bind(Uuid::new_v4().to_string())
      .bind(Utc::now() + Duration::days(30))
      .bind(&env)
      .execute(db.pool())
      .await
      .unwrap();
      sqlx::query(
        "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
         VALUES ($1, 'workspace', $2, 'selfhost_license', $3, 'selfhost_team', 'active', 25, $4, $5, $6, $6)",
      )
      .bind(Uuid::new_v4().to_string())
      .bind(ws)
      .bind(key)
      .bind(&env)
      .bind(Utc::now() + Duration::days(30))
      .bind(stale_at)
      .execute(db.pool())
      .await
      .unwrap();
    }

    let svc = SelfhostLicenseService::new(
      db.clone(),
      Arc::new(gate.clone()),
      Arc::new(NoopEventPublisher::default()),
    )
    .with_keyring(keyring)
    .with_client(http_client);

    svc.check_licenses().await.unwrap();

    // Verify State 1: signed_payload repaired, installed_licenses.quantity synced to 30, and gate resolves 30 seats.
    let repaired_payload: Option<Vec<u8>> = sqlx::query_scalar(
      "SELECT signed_payload FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND subject_id = 'lic-a-30'",
    )
    .bind(ws_repair)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert!(repaired_payload.as_deref().is_some_and(|b| b.starts_with(b"{")));
    let repaired_installed = svc.get_license(&owner_id, ws_repair).await.unwrap().unwrap();
    assert_eq!(repaired_installed.quantity, 30);
    assert_eq!(repaired_installed.recurring, "yearly");
    {
      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(gate.resolve_workspace_grant(&mut tx, ws_repair, Utc::now()).await.unwrap().limits.seat_limit, 30);
      tx.rollback().await.unwrap();
    }

    // Verify State 2: active B was NOT revoked and gate still resolves 40 seats.
    let b_status: String = sqlx::query_scalar(
      "SELECT status FROM entitlements WHERE source = 'selfhost_license' AND target_id = $1 AND subject_id = 'lic-active-b'",
    )
    .bind(ws_conflict)
    .fetch_one(db.pool())
    .await
    .unwrap();
    assert_eq!(b_status, "active");
    {
      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(gate.resolve_workspace_grant(&mut tx, ws_conflict, Utc::now()).await.unwrap().limits.seat_limit, 40);
      tx.rollback().await.unwrap();
    }

    // Verify State 3: unknown name & message-only stay active; exact (INVALID_LICENSE_TO_ACTIVATE, data.reason) revoked!
    let s1: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE target_id = 'ws-deny-1'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    let s2: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE target_id = 'ws-deny-2'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    let s3: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE target_id = 'ws-deny-3'")
      .fetch_one(db.pool())
      .await
      .unwrap();
    assert_eq!(s1, "active");
    assert_eq!(s2, "active");
    assert_eq!(s3, "revoked");

    // State 4: commercial workspace V2 license with `expires_at: None` must preserve
    //          existing DB row `expired_at` / `expires_at` deadlines on offline scan (COALESCE).
    let ws_no_sig_exp = "ws-no-sig-exp";
    let row_deadline =
      DateTime::from_timestamp_millis((Utc::now() + Duration::days(10)).timestamp_millis()).unwrap();
    sqlx::query("INSERT INTO workspaces (id) VALUES ($1)")
      .bind(ws_no_sig_exp)
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query(
      "INSERT INTO workspace_members (id, workspace_id, user_id, role, state, source) VALUES ($1, $2, $3, 'owner', 'active', 'legacy')",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(ws_no_sig_exp)
    .bind(&owner_id)
    .execute(db.pool())
    .await
    .unwrap();
    let no_exp_claims = LicenseClaimsV2 {
      format_version: 2,
      kid: PRO_KID.to_owned(),
      license_id: "lic-no-sig-exp".to_owned(),
      audience: LICENSE_AUDIENCE_SELFHOST.to_owned(),
      scope: LicenseScopeV2 {
        kind: "workspace".to_owned(),
        workspace_id: Some(ws_no_sig_exp.to_owned()),
      },
      tier: "selfhost_team".to_owned(),
      limits: LicenseLimitsV2 {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 30,
        seat_quota_bytes: None,
        history_period_seconds: 31_536_000,
        copilot_action_limit: None,
      },
      rights: LicenseRightsV2 {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: false,
      },
      recurring: Some("lifetime".to_owned()),
      issued_at: (Utc::now() - Duration::days(1)).to_rfc3339(),
      not_before: (Utc::now() - Duration::days(2)).to_rfc3339(),
      expires_at: None,
    };
    let no_exp_sig: DerSignature = signing_key.sign(&serde_json::to_vec(&no_exp_claims).unwrap());
    let no_exp_bytes = serde_json::to_vec(&LicenseEnvelopeV2 {
      claims: no_exp_claims,
      signature: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, no_exp_sig.as_bytes()),
    })
    .unwrap();
    sqlx::query(
      "INSERT INTO installed_licenses (key, workspace_id, quantity, recurring, variant, installed_at, validate_key, validated_at, expired_at, license)
       VALUES ('lic-no-sig-exp', $1, 30, 'lifetime', 'onetime', $2, $3, $2, $4, $5)",
    )
    .bind(ws_no_sig_exp)
    .bind(stale_at)
    .bind(Uuid::new_v4().to_string())
    .bind(row_deadline)
    .bind(&no_exp_bytes)
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
      "INSERT INTO entitlements (id, target_type, target_id, source, subject_id, plan, status, quantity, signed_payload, expires_at, validated_at, updated_at)
       VALUES ($1, 'workspace', $2, 'selfhost_license', 'lic-no-sig-exp', 'selfhost_team', 'active', 30, $3, $4, $5, $5)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(ws_no_sig_exp)
    .bind(&no_exp_bytes)
    .bind(row_deadline)
    .bind(stale_at)
    .execute(db.pool())
    .await
    .unwrap();

    svc.check_licenses().await.unwrap();
    assert_eq!(
      svc.get_license(&owner_id, ws_no_sig_exp).await.unwrap().unwrap().expired_at,
      Some(row_deadline)
    );
    {
      let mut tx = db.pool().begin().await.unwrap();
      assert_eq!(
        gate
          .resolve_workspace_grant(&mut tx, ws_no_sig_exp, row_deadline - Duration::seconds(1))
          .await
          .unwrap()
          .limits
          .seat_limit,
        30
      );
      assert_eq!(
        gate
          .resolve_workspace_grant(&mut tx, ws_no_sig_exp, row_deadline)
          .await
          .unwrap()
          .limits
          .seat_limit,
        10
      );
      tx.rollback().await.unwrap();
    }

    http_handle.abort();
  });
  drop(lease);
}
