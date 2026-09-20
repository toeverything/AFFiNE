use std::sync::Arc;

use argon2::{
  Argon2,
  password_hash::{PasswordHash, PasswordVerifier},
};
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use zeroize::Zeroizing;

use super::{
  issuance, keyring, login, mail, oauth, oauth_http, principal, refresh, security, security_challenge, session,
  types::{PrincipalInput, SessionIssueInput},
};
use crate::runtime::{
  AuthRuntimeConfig, BackendRuntimeConfig, Deployment, InviteQuotaConfig, OAuthProviderRuntimeConfig,
  PaymentRuntimeConfig, RedisRuntimeConfig,
  config::{CopilotRuntimeConfig, SearchRuntimeConfig},
};

async fn pool() -> Option<PgPool> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  Some(
    PgPoolOptions::new()
      .max_connections(8)
      .connect(&database_url)
      .await
      .unwrap(),
  )
}

fn config(database_url: String) -> BackendRuntimeConfig {
  BackendRuntimeConfig {
    database_url,
    auth: AuthRuntimeConfig::default(),
    invite_quota: InviteQuotaConfig::default(),
    private_key: Arc::new(Zeroizing::new("rfc12-auth-test-private-key".to_string())),
    deployment: Deployment::Cloud,
    copilot: CopilotRuntimeConfig::default(),
    search: SearchRuntimeConfig::default(),
    redis: RedisRuntimeConfig::default(),
    payment: PaymentRuntimeConfig::default(),
  }
}

async fn create_user(pool: &PgPool, marker: &str) -> String {
  let id = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    "INSERT INTO users(id,name,email,password,registered,disabled,auth_epoch) VALUES($1,'Auth \
     test',$2,'hash',true,false,0)",
  )
  .bind(&id)
  .bind(format!("auth-{marker}@example.invalid"))
  .execute(pool)
  .await
  .unwrap();
  id
}

async fn create_exchange(pool: &PgPool, user_id: &str, marker: &str) -> String {
  let code = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO runtime_states(purpose,token_hash,lookup_key,payload,expires_at)
       VALUES('auth_challenge:auth_session_exchange',$1,NULL,$2,clock_timestamp()+INTERVAL '1 minute')"#,
  )
  .bind(super::super::token_hash(&code))
  .bind(json!({ "userId": user_id, "clientVersion": marker, "authEpoch": 0 }))
  .execute(pool)
  .await
  .unwrap();
  code
}

async fn oidc_server(nonce: Arc<tokio::sync::Mutex<String>>) -> String {
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let address = listener.local_addr().unwrap();
  let issuer = format!("http://{address}");
  let server_issuer = issuer.clone();
  tokio::spawn(async move {
    loop {
      let (mut stream, _) = listener.accept().await.unwrap();
      let mut request = vec![0_u8; 16 * 1024];
      let read = tokio::io::AsyncReadExt::read(&mut stream, &mut request).await.unwrap();
      let request = String::from_utf8_lossy(&request[..read]);
      let path = request
        .split_whitespace()
        .nth(1)
        .unwrap_or("/")
        .split('?')
        .next()
        .unwrap();
      if path == "/redirect" {
        tokio::io::AsyncWriteExt::write_all(
          &mut stream,
          b"HTTP/1.1 302 Found\r\nLocation: /userinfo\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )
        .await
        .unwrap();
        continue;
      }
      let body = match path {
        "/.well-known/openid-configuration" => json!({
          "authorization_endpoint": format!("{server_issuer}/authorize"),
          "token_endpoint": format!("{server_issuer}/token"),
          "userinfo_endpoint": format!("{server_issuer}/userinfo"),
          "issuer": server_issuer,
          "jwks_uri": format!("{server_issuer}/jwks"),
        }),
        "/token" => {
          let claims = json!({
            "iss": server_issuer,
            "aud": "oidc-client",
            "sub": "oidc-subject",
            "email": "oidc@example.invalid",
            "email_verified": true,
            "nonce": nonce.lock().await.clone(),
            "exp": chrono::Utc::now().timestamp() + 300,
          });
          let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::ES256);
          header.kid = Some("oidc-test".to_string());
          let token = jsonwebtoken::encode(
            &header,
            &claims,
            &jsonwebtoken::EncodingKey::from_ec_pem(crate::entitlement::tests::TEST_PRIVATE_KEY.as_bytes()).unwrap(),
          )
          .unwrap();
          json!({ "access_token": "access", "id_token": token })
        }
        "/jwks" => json!({ "keys": [{
          "kty": "EC", "crv": "P-256", "use": "sig", "alg": "ES256", "kid": "oidc-test",
          "x": "ObwJiTmbui7rkWfPJ7Lozvuy2Rclotcrb0V6dlS2ijI",
          "y": "hEoZu2bbU8EJ9PMc3rHY1_wMaaEeV_cn6B5GriAbrjE"
        }] }),
        "/userinfo" => json!({
          "sub": "oidc-subject", "email": "oidc@example.invalid", "email_verified": true, "name": "OIDC User"
        }),
        _ => json!({}),
      };
      let body = serde_json::to_vec(&body).unwrap();
      let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
      );
      tokio::io::AsyncWriteExt::write_all(&mut stream, response.as_bytes())
        .await
        .unwrap();
      tokio::io::AsyncWriteExt::write_all(&mut stream, &body).await.unwrap();
    }
  });
  issuer
}

#[tokio::test]
async fn session_kernel_serializes_refresh_replay_revocation_and_key_rotation() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  crate::runtime::migrations::migrate_runtime_tables(&pool).await.unwrap();
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let user_id = create_user(&pool, &marker).await;
  let mut config = config(std::env::var("DATABASE_URL").unwrap());
  config.auth.oauth.providers.insert(
    "google".to_string(),
    OAuthProviderRuntimeConfig {
      client_id: "google-client-id".to_string(),
      client_secret: Arc::new(Zeroizing::new("google-client-secret".to_string())),
      args: Default::default(),
      issuer: None,
      allow_private_network: false,
      apple_private_key: None,
      apple_key_id: None,
      apple_team_id: None,
    },
  );
  config.auth.oauth.providers.insert(
    "apple".to_string(),
    OAuthProviderRuntimeConfig {
      client_id: "apple-client-id".to_string(),
      client_secret: Arc::new(Zeroizing::new("apple-client-secret".to_string())),
      args: Default::default(),
      issuer: None,
      allow_private_network: false,
      apple_private_key: None,
      apple_key_id: None,
      apple_team_id: None,
    },
  );
  let oidc_nonce = Arc::new(tokio::sync::Mutex::new(String::new()));
  let oidc_issuer = oidc_server(oidc_nonce.clone()).await;
  assert!(
    oauth_http::OAuthHttp::oidc(Some(&oidc_issuer))
      .get_json::<serde_json::Value>(&format!("{oidc_issuer}/redirect"), Some("sensitive-token"))
      .await
      .is_err()
  );
  config.auth.oauth.providers.insert(
    "oidc".to_string(),
    OAuthProviderRuntimeConfig {
      client_id: "oidc-client".to_string(),
      client_secret: Arc::new(Zeroizing::new("oidc-secret".to_string())),
      args: Default::default(),
      issuer: Some(oidc_issuer),
      allow_private_network: true,
      apple_private_key: None,
      apple_key_id: None,
      apple_team_id: None,
    },
  );
  keyring::initialize(&pool, &config).await.unwrap();
  let refresh_limit_selector = format!("rust-test-{marker}");
  for _ in 0..affine_core::auth::AUTH_REFRESH_LIMIT {
    assert!(
      refresh::consume_refresh_rate_limit(&pool, &refresh_limit_selector)
        .await
        .unwrap()
    );
  }
  assert!(
    !refresh::consume_refresh_rate_limit(&pool, &refresh_limit_selector)
      .await
      .unwrap()
  );
  sqlx::query("DELETE FROM runtime_rolling_quota_counters WHERE scope_key=$1")
    .bind(format!("auth:session_refresh:{refresh_limit_selector}"))
    .execute(&pool)
    .await
    .unwrap();
  let unknown_refresh = crate::auth_session::create_auth_session_refresh_token();
  let unknown_result = refresh::refresh(&pool, &config, &unknown_refresh.token, None)
    .await
    .unwrap();
  assert_eq!(serde_json::to_value(unknown_result).unwrap()["status"], "invalid");
  let unknown_counter: i64 =
    sqlx::query_scalar("SELECT count(*) FROM runtime_rolling_quota_counters WHERE scope_key=$1")
      .bind(format!("auth:session_refresh:{}", unknown_refresh.id))
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(unknown_counter, 0);
  sqlx::query("UPDATE users SET password=$2 WHERE id=$1")
    .bind(&user_id)
    .bind("$argon2id$v=19$m=19456,t=2,p=1$/JC3Ue87NEBXtjra7TY9TQ$oysAbNozbP/Z6kdbyPXYDRcZFr4WJlFEHhx+88QRjoc")
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    login::password(
      &pool,
      &config,
      &format!("AUTH-{marker}@EXAMPLE.INVALID"),
      "wrong",
      SessionIssueInput::Cookie {
        session_id: None,
        client_version: None,
      },
    )
    .await
    .is_err()
  );
  let password_login = login::password(
    &pool,
    &config,
    &format!("AUTH-{marker}@EXAMPLE.INVALID"),
    "p4-password",
    SessionIssueInput::Cookie {
      session_id: None,
      client_version: Some("password-client".to_string()),
    },
  )
  .await
  .unwrap();
  assert!(password_login.session_id.is_some());
  assert_eq!(password_login.user.id, user_id);

  let magic_email = format!("magic-{marker}@example.invalid");
  let auth_source = mail::AuthRequestSource {
    trusted: true,
    ip: Some("203.0.113.77".to_string()),
    asn: None,
  };
  login::prepare_magic_link(
    &pool,
    &config,
    &magic_email,
    "https://app.affine.pro/magic-link?redirect_uri=https%3A%2F%2Fapp.affine.pro%2Fworkspace",
    Some("magic-nonce"),
    "AFFiNE Cloud",
    Some(&auth_source),
  )
  .await
  .unwrap();
  let (quota_decision, source_scope): (serde_json::Value, String) = sqlx::query_as(
    r#"SELECT d.quota_decision,c.scope_key FROM mail_deliveries d
       JOIN runtime_rolling_quota_counters c ON c.scope_key LIKE 'mail:source_prefix:%:class:auth'
       WHERE d.recipient_email=$1 ORDER BY c.updated_at DESC LIMIT 1"#,
  )
  .bind(&magic_email)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(quota_decision["allowed"], true);
  sqlx::query("UPDATE runtime_rolling_quota_counters SET count=50 WHERE scope_key=$1")
    .bind(&source_scope)
    .execute(&pool)
    .await
    .unwrap();
  let blocked_email = format!("blocked-{marker}@example.invalid");
  assert!(
    login::prepare_magic_link(
      &pool,
      &config,
      &blocked_email,
      "https://app.affine.pro/magic-link",
      None,
      "AFFiNE Cloud",
      Some(&auth_source),
    )
    .await
    .is_err()
  );
  let blocked_state: i64 = sqlx::query_scalar("SELECT count(*) FROM runtime_states WHERE purpose=$1 AND lookup_key=$2")
    .bind(login::MAGIC_PURPOSE)
    .bind(&blocked_email)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(blocked_state, 0);
  sqlx::query("DELETE FROM runtime_rolling_quota_counters WHERE scope_key=$1")
    .bind(source_scope)
    .execute(&pool)
    .await
    .unwrap();
  let magic_payload: serde_json::Value = sqlx::query_scalar(
    "SELECT payload FROM mail_deliveries WHERE dedupe_key LIKE 'auth:magic-link:%' AND recipient_email=$1 ORDER BY \
     created_at DESC LIMIT 1",
  )
  .bind(&magic_email)
  .fetch_one(&pool)
  .await
  .unwrap();
  let magic_otp = magic_payload["props"]["otp"].as_str().unwrap().to_string();
  assert!(
    login::complete_magic_link(
      &pool,
      &config,
      &magic_email,
      "000000",
      Some("magic-nonce"),
      SessionIssueInput::Native { client_version: None },
    )
    .await
    .is_err()
  );
  config.auth.allow_signup = false;
  assert!(
    login::complete_magic_link(
      &pool,
      &config,
      &magic_email,
      &magic_otp,
      Some("magic-nonce"),
      SessionIssueInput::Native { client_version: None },
    )
    .await
    .is_err()
  );
  config.auth.allow_signup = true;
  let magic_login = login::complete_magic_link(
    &pool,
    &config,
    &magic_email,
    &magic_otp,
    Some("magic-nonce"),
    SessionIssueInput::Native {
      client_version: Some("magic-client".to_string()),
    },
  )
  .await
  .unwrap();
  assert_eq!(magic_login.created, Some(true));
  assert!(magic_login.exchange_code.is_some());
  assert!(
    login::complete_magic_link(
      &pool,
      &config,
      &magic_email,
      &magic_otp,
      Some("magic-nonce"),
      SessionIssueInput::Native { client_version: None },
    )
    .await
    .is_err()
  );
  config.auth.allow_signup = false;
  config.auth.require_email_domain_verification = true;
  login::prepare_magic_link(
    &pool,
    &config,
    &magic_email,
    "https://app.affine.pro/magic-link",
    Some("existing-magic-nonce"),
    "AFFiNE Cloud",
    None,
  )
  .await
  .unwrap();
  let existing_magic_payload: serde_json::Value = sqlx::query_scalar(
    "SELECT payload FROM mail_deliveries WHERE dedupe_key LIKE 'auth:magic-link:%' AND recipient_email=$1 ORDER BY \
     created_at DESC LIMIT 1",
  )
  .bind(&magic_email)
  .fetch_one(&pool)
  .await
  .unwrap();
  let existing_magic_otp = existing_magic_payload["props"]["otp"].as_str().unwrap();
  let existing_magic_login = login::complete_magic_link(
    &pool,
    &config,
    &magic_email,
    existing_magic_otp,
    Some("existing-magic-nonce"),
    SessionIssueInput::Native { client_version: None },
  )
  .await
  .unwrap();
  assert_eq!(existing_magic_login.created, Some(false));
  config.auth.allow_signup = true;
  config.auth.require_email_domain_verification = false;
  let open_app_code = login::create_open_app_code(&pool, &user_id).await.unwrap();
  let open_app_login = login::complete_open_app(
    &pool,
    &config,
    &open_app_code,
    SessionIssueInput::Native { client_version: None },
  )
  .await
  .unwrap();
  assert_eq!(open_app_login.user.id, user_id);
  assert!(
    login::complete_open_app(
      &pool,
      &config,
      &open_app_code,
      SessionIssueInput::Native { client_version: None },
    )
    .await
    .is_err()
  );
  let code = create_exchange(&pool, &user_id, &marker).await;
  let issued = session::exchange(
    &pool,
    &config,
    &code,
    &format!("installation-{marker}"),
    "ios",
    Some("phone"),
    Some("1.0.0"),
  )
  .await
  .unwrap();
  assert!(issued.is_new_device.unwrap());
  assert!(
    session::exchange(
      &pool,
      &config,
      &code,
      &format!("installation-{marker}"),
      "ios",
      None,
      None,
    )
    .await
    .is_err()
  );
  let (first, second) = tokio::join!(
    refresh::refresh(&pool, &config, &issued.refresh_token, Some("1.1.0")),
    refresh::refresh(&pool, &config, &issued.refresh_token, Some("1.1.0"))
  );
  let (first, second) = (
    serde_json::to_value(first.unwrap()).unwrap(),
    serde_json::to_value(second.unwrap()).unwrap(),
  );
  assert_eq!(first["status"], "rotated");
  assert_eq!(second["status"], "rotated");
  assert_ne!(first["grace"], second["grace"]);
  assert_eq!(first["refreshToken"], second["refreshToken"]);
  let replay = refresh::refresh(&pool, &config, &issued.refresh_token, None)
    .await
    .unwrap();
  let replay = serde_json::to_value(replay).unwrap();
  assert_eq!(replay["status"], "reused");
  let principal = principal::resolve(
    &pool,
    &config,
    PrincipalInput::AccessToken {
      token: first["accessToken"].as_str().unwrap().to_string(),
    },
  )
  .await
  .unwrap();
  assert_eq!(
    serde_json::to_value(principal).unwrap()["status"],
    "auth_session_revoked"
  );

  let second_code = create_exchange(&pool, &user_id, &format!("{marker}-second")).await;
  let second_session = session::exchange(
    &pool,
    &config,
    &second_code,
    &format!("installation-{marker}-second"),
    "android",
    None,
    None,
  )
  .await
  .unwrap();
  let rotated = refresh::refresh(&pool, &config, &second_session.refresh_token, None)
    .await
    .unwrap();
  let rotated = serde_json::to_value(rotated).unwrap();
  let source_id = crate::auth_session::parse_auth_session_refresh_token(&second_session.refresh_token)
    .unwrap()
    .id;
  sqlx::query("UPDATE auth_refresh_tokens SET successor_ciphertext=NULL,successor_expires_at=NULL WHERE id=$1")
    .bind(&source_id)
    .execute(&pool)
    .await
    .unwrap();
  let token_count: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_refresh_tokens WHERE auth_session_id=$1")
    .bind(&second_session.session.id)
    .fetch_one(&pool)
    .await
    .unwrap();
  let unavailable = refresh::refresh(&pool, &config, &second_session.refresh_token, None)
    .await
    .unwrap();
  assert_eq!(
    serde_json::to_value(unavailable).unwrap()["status"],
    "temporarily_unavailable"
  );
  let unchanged_count: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_refresh_tokens WHERE auth_session_id=$1")
    .bind(&second_session.session.id)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(unchanged_count, token_count);

  sqlx::query("DROP TRIGGER IF EXISTS rfc12_auth_refresh_fault ON auth_refresh_tokens")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION IF EXISTS rfc12_auth_refresh_fault()")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    r#"CREATE FUNCTION rfc12_auth_refresh_fault() RETURNS trigger AS $$
       BEGIN
         IF TG_OP = 'INSERT' AND EXISTS(
           SELECT 1 FROM app_configs
           WHERE id='test.auth.refresh.fail_insert' AND value #>> '{}' = NEW.auth_session_id
         ) THEN
           RAISE EXCEPTION 'injected refresh successor insert failure';
         END IF;
         IF TG_OP = 'UPDATE' AND OLD.grace_used_at IS NULL AND NEW.grace_used_at IS NOT NULL AND EXISTS(
           SELECT 1 FROM app_configs
           WHERE id='test.auth.refresh.fail_grace' AND value #>> '{}' = NEW.auth_session_id
         ) THEN
           RAISE EXCEPTION 'injected refresh grace failure';
         END IF;
         RETURN NEW;
       END
       $$ LANGUAGE plpgsql"#,
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE TRIGGER rfc12_auth_refresh_fault BEFORE INSERT OR UPDATE ON auth_refresh_tokens FOR EACH ROW EXECUTE \
     FUNCTION rfc12_auth_refresh_fault()",
  )
  .execute(&pool)
  .await
  .unwrap();
  let rollback_refresh_code = create_exchange(&pool, &user_id, &format!("{marker}-refresh-rollback")).await;
  let rollback_refresh_session = session::exchange(
    &pool,
    &config,
    &rollback_refresh_code,
    &format!("installation-{marker}-refresh-rollback"),
    "ios",
    None,
    None,
  )
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO app_configs(id,value,created_at,updated_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()) ON \
     CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp()",
  )
  .bind("test.auth.refresh.fail_insert")
  .bind(json!(rollback_refresh_session.session.id))
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    refresh::refresh(&pool, &config, &rollback_refresh_session.refresh_token, None)
      .await
      .is_err()
  );
  sqlx::query("DELETE FROM app_configs WHERE id='test.auth.refresh.fail_insert'")
    .execute(&pool)
    .await
    .unwrap();
  let rollback_source_id =
    crate::auth_session::parse_auth_session_refresh_token(&rollback_refresh_session.refresh_token)
      .unwrap()
      .id;
  let rollback_source: (Option<chrono::DateTime<chrono::Utc>>, Option<String>, Option<String>) =
    sqlx::query_as("SELECT used_at,replaced_by_id,successor_ciphertext FROM auth_refresh_tokens WHERE id=$1")
      .bind(&rollback_source_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(rollback_source, (None, None, None));
  let rollback_token_count: i64 =
    sqlx::query_scalar("SELECT count(*) FROM auth_refresh_tokens WHERE auth_session_id=$1")
      .bind(&rollback_refresh_session.session.id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(rollback_token_count, 1);

  let rotated_after_rollback = refresh::refresh(&pool, &config, &rollback_refresh_session.refresh_token, None)
    .await
    .unwrap();
  assert_eq!(
    serde_json::to_value(&rotated_after_rollback).unwrap()["status"],
    "rotated"
  );
  sqlx::query(
    "INSERT INTO app_configs(id,value,created_at,updated_at) VALUES($1,$2,clock_timestamp(),clock_timestamp()) ON \
     CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp()",
  )
  .bind("test.auth.refresh.fail_grace")
  .bind(json!(rollback_refresh_session.session.id))
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    refresh::refresh(&pool, &config, &rollback_refresh_session.refresh_token, None)
      .await
      .is_err()
  );
  sqlx::query("DELETE FROM app_configs WHERE id='test.auth.refresh.fail_grace'")
    .execute(&pool)
    .await
    .unwrap();
  let grace_used_at: Option<chrono::DateTime<chrono::Utc>> =
    sqlx::query_scalar("SELECT grace_used_at FROM auth_refresh_tokens WHERE id=$1")
      .bind(&rollback_source_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert!(grace_used_at.is_none());
  let grace_after_rollback = refresh::refresh(&pool, &config, &rollback_refresh_session.refresh_token, None)
    .await
    .unwrap();
  let grace_after_rollback = serde_json::to_value(grace_after_rollback).unwrap();
  assert_eq!(grace_after_rollback["status"], "rotated");
  assert_eq!(grace_after_rollback["grace"], true);
  assert_eq!(
    grace_after_rollback["refreshToken"],
    serde_json::to_value(rotated_after_rollback).unwrap()["refreshToken"]
  );

  let before_keys = keyring::metadata(&pool, &config).await.unwrap();
  let before_keys = serde_json::to_value(&before_keys).unwrap();
  let old_key = before_keys
    .as_array()
    .unwrap()
    .iter()
    .find(|key| key["status"] == "active")
    .unwrap()["id"]
    .as_str()
    .unwrap()
    .to_string();
  keyring::rotate(&pool, &config, &user_id, &old_key).await.unwrap();
  let old_access = rotated["accessToken"].as_str().unwrap();
  let old_principal = principal::resolve(
    &pool,
    &config,
    PrincipalInput::AccessToken {
      token: old_access.to_string(),
    },
  )
  .await
  .unwrap();
  assert_eq!(serde_json::to_value(old_principal).unwrap()["status"], "valid");
  let mut expiring_keys: serde_json::Value =
    sqlx::query_scalar("SELECT value FROM app_configs WHERE id='auth.session.signingKeys'")
      .fetch_one(&pool)
      .await
      .unwrap();
  let old = expiring_keys
    .as_array_mut()
    .unwrap()
    .iter_mut()
    .find(|key| key["id"] == old_key)
    .unwrap();
  let short_retired_at = chrono::Utc::now() - chrono::Duration::seconds(2);
  old["retiredAt"] = serde_json::Value::String(short_retired_at.to_rfc3339());
  old["verifyUntil"] = serde_json::Value::String((short_retired_at + chrono::Duration::seconds(1)).to_rfc3339());
  sqlx::query("UPDATE app_configs SET value=$1 WHERE id='auth.session.signingKeys'")
    .bind(&expiring_keys)
    .execute(&pool)
    .await
    .unwrap();
  assert!(keyring::metadata(&pool, &config).await.is_err());
  let old = expiring_keys
    .as_array_mut()
    .unwrap()
    .iter_mut()
    .find(|key| key["id"] == old_key)
    .unwrap();
  old["retiredAt"] = serde_json::Value::String(
    (chrono::Utc::now() - chrono::Duration::seconds(config.auth.access_token_ttl_seconds + 32)).to_rfc3339(),
  );
  old["verifyUntil"] = serde_json::Value::String((chrono::Utc::now() - chrono::Duration::seconds(1)).to_rfc3339());
  sqlx::query("UPDATE app_configs SET value=$1 WHERE id='auth.session.signingKeys'")
    .bind(expiring_keys)
    .execute(&pool)
    .await
    .unwrap();
  let after_delete = keyring::delete(&pool, &config, &user_id, &old_key).await.unwrap();
  assert!(
    !serde_json::to_value(after_delete)
      .unwrap()
      .as_array()
      .unwrap()
      .iter()
      .any(|key| key["id"] == old_key)
  );

  let second_user_id = create_user(&pool, &format!("{marker}-cookie")).await;
  let shared_session_id = uuid::Uuid::new_v4().to_string();
  sqlx::query("INSERT INTO multiple_users_sessions(id) VALUES($1)")
    .bind(&shared_session_id)
    .execute(&pool)
    .await
    .unwrap();
  for (position, owner) in [&user_id, &second_user_id].into_iter().enumerate() {
    sqlx::query(
      "INSERT INTO user_sessions(id,session_id,user_id,expires_at,created_at) \
       VALUES($1,$2,$3,clock_timestamp()+INTERVAL '1 day',clock_timestamp()+($4*INTERVAL '1 second'))",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&shared_session_id)
    .bind(owner)
    .bind(i32::try_from(position).unwrap())
    .execute(&pool)
    .await
    .unwrap();
  }
  let selected = principal::resolve(
    &pool,
    &config,
    PrincipalInput::Cookie {
      session_id: shared_session_id.clone(),
      user_id: Some(user_id.clone()),
      refresh_client_version: None,
      refresh: false,
    },
  )
  .await
  .unwrap();
  assert_eq!(serde_json::to_value(selected).unwrap()["principal"]["userId"], user_id);
  let fallback = principal::resolve(
    &pool,
    &config,
    PrincipalInput::Cookie {
      session_id: shared_session_id,
      user_id: Some("missing-user".to_string()),
      refresh_client_version: None,
      refresh: false,
    },
  )
  .await
  .unwrap();
  assert_eq!(
    serde_json::to_value(fallback).unwrap()["principal"]["userId"],
    second_user_id
  );
  let existing_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id=$1")
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert!(
    security::set_user_email(
      &pool,
      &second_user_id,
      &existing_email.to_ascii_uppercase(),
      "security_action"
    )
    .await
    .is_err()
  );
  let unchanged_epoch: i32 = sqlx::query_scalar("SELECT auth_epoch FROM users WHERE id=$1")
    .bind(&second_user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(unchanged_epoch, 0);
  let third_user_id = create_user(&pool, &format!("{marker}-email-race-a")).await;
  let fourth_user_id = create_user(&pool, &format!("{marker}-email-race-b")).await;
  let race_email = format!("race-{marker}@example.invalid");
  let uppercase_race_email = race_email.to_ascii_uppercase();
  let first_change = security::set_user_email(&pool, &third_user_id, &race_email, "security_action");
  let second_change = security::set_user_email(&pool, &fourth_user_id, &uppercase_race_email, "security_action");
  let (first_change, second_change) = tokio::join!(first_change, second_change);
  assert_ne!(first_change.is_ok(), second_change.is_ok());
  let duplicate_count: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE lower(email)=lower($1)")
    .bind(&race_email)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(duplicate_count, 1);
  let stored_keys: serde_json::Value =
    sqlx::query_scalar("SELECT value FROM app_configs WHERE id='auth.session.signingKeys'")
      .fetch_one(&pool)
      .await
      .unwrap();
  sqlx::query(
    r#"UPDATE app_configs SET value=jsonb_set(value,'{0,secret}',to_jsonb('invalid'::text))
       WHERE id='auth.session.signingKeys'"#,
  )
  .execute(&pool)
  .await
  .unwrap();
  let rollback_code = create_exchange(&pool, &user_id, &format!("{marker}-rollback")).await;
  assert!(
    session::exchange(
      &pool,
      &config,
      &rollback_code,
      &format!("installation-{marker}-rollback"),
      "ios",
      None,
      None,
    )
    .await
    .is_err()
  );
  let consumed: Option<chrono::DateTime<chrono::Utc>> =
    sqlx::query_scalar("SELECT consumed_at FROM runtime_states WHERE token_hash=$1")
      .bind(super::super::token_hash(&rollback_code))
      .fetch_one(&pool)
      .await
      .unwrap();
  assert!(consumed.is_none());
  let rolled_back: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_sessions WHERE installation_id=$1")
    .bind(format!("installation-{marker}-rollback"))
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(rolled_back, 0);
  sqlx::query("UPDATE app_configs SET value=$1 WHERE id='auth.session.signingKeys'")
    .bind(stored_keys)
    .execute(&pool)
    .await
    .unwrap();

  let third_code = create_exchange(&pool, &user_id, &format!("{marker}-third")).await;
  let third = session::exchange(
    &pool,
    &config,
    &third_code,
    &format!("installation-{marker}-third"),
    "electron",
    None,
    None,
  )
  .await
  .unwrap();
  let stale_exchange = issuance::issue_existing(
    &pool,
    &config,
    &user_id,
    SessionIssueInput::Native { client_version: None },
  )
  .await
  .unwrap()
  .exchange_code
  .unwrap();
  let refresh_future = refresh::refresh(&pool, &config, &third.refresh_token, None);
  let revoke_future = security::revoke_user(&pool, &user_id, "security_action");
  let (_refresh_outcome, revoked) = tokio::join!(refresh_future, revoke_future);
  assert!(revoked.unwrap() >= 1);
  let epoch: i32 = sqlx::query_scalar("SELECT auth_epoch FROM users WHERE id=$1")
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(epoch, 1);
  assert!(
    session::exchange(
      &pool,
      &config,
      &stale_exchange,
      &format!("installation-{marker}-stale"),
      "ios",
      None,
      None,
    )
    .await
    .is_err()
  );
  let live_sessions: i64 = sqlx::query_scalar(
    "SELECT count(*) FROM auth_sessions a JOIN user_sessions u ON u.id=a.user_session_id WHERE u.user_id=$1",
  )
  .bind(&user_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(live_sessions, 0);

  assert!(
    oauth::preflight(
      &pool,
      &config,
      "Google",
      Some("https://evil.example/steal"),
      "web",
      "rejected-oauth-nonce",
      Some("0.27.5"),
      "https://app.affine.pro/oauth/callback",
      "https://app.affine.pro",
      &["https://app.affine.pro".to_string()],
      &[],
    )
    .await
    .is_err()
  );
  let oauth_preflight = oauth::preflight(
    &pool,
    &config,
    "Google",
    Some("https://app.affine.pro/redirect"),
    "web",
    "oauth-nonce",
    Some("0.27.5"),
    "https://app.affine.pro/oauth/callback",
    "https://app.affine.pro",
    &["https://app.affine.pro".to_string()],
    &[],
  )
  .await
  .unwrap();
  let authorization = url::Url::parse(&oauth_preflight.url).unwrap();
  assert_eq!(authorization.host_str(), Some("accounts.google.com"));
  assert_eq!(
    authorization
      .query_pairs()
      .find(|(key, _)| key == "client_id")
      .unwrap()
      .1,
    "google-client-id"
  );
  let state_parameter = authorization
    .query_pairs()
    .find(|(key, _)| key == "state")
    .unwrap()
    .1
    .into_owned();
  let state_token = serde_json::from_str::<serde_json::Value>(&state_parameter).unwrap()["state"]
    .as_str()
    .unwrap()
    .to_string();
  let state_hash = super::super::token_hash(&state_token);
  oauth::claim_state(&pool, &state_hash).await.unwrap();
  assert!(oauth::claim_state(&pool, &state_hash).await.is_err());

  let apple_preflight = oauth::preflight(
    &pool,
    &config,
    "Apple",
    None,
    "affine",
    "apple-nonce",
    None,
    "https://app.affine.pro/api/oauth/callback",
    "https://app.affine.pro",
    &["https://app.affine.pro".to_string()],
    &[],
  )
  .await
  .unwrap();
  let apple_state = url::Url::parse(&apple_preflight.url)
    .unwrap()
    .query_pairs()
    .find(|(key, _)| key == "state")
    .unwrap()
    .1
    .into_owned();
  let handoff = oauth::callback(
    &pool,
    &config,
    "apple-code",
    &apple_state,
    None,
    SessionIssueInput::Native { client_version: None },
  )
  .await
  .unwrap();
  assert_eq!(serde_json::to_value(handoff).unwrap()["type"], "handoff");
  let apple_token = serde_json::from_str::<serde_json::Value>(&apple_state).unwrap()["state"]
    .as_str()
    .unwrap()
    .to_string();
  let apple_consumed: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
    "SELECT consumed_at FROM runtime_states WHERE purpose='auth_challenge:oauth_state' AND token_hash=$1",
  )
  .bind(super::super::token_hash(&apple_token))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert!(apple_consumed.is_none());

  let oidc_preflight = oauth::preflight(
    &pool,
    &config,
    "OIDC",
    None,
    "web",
    "oidc-client-nonce",
    Some("0.27.5"),
    "https://app.affine.pro/oauth/callback",
    "https://app.affine.pro",
    &["https://app.affine.pro".to_string()],
    &[],
  )
  .await
  .unwrap();
  let oidc_authorization = url::Url::parse(&oidc_preflight.url).unwrap();
  assert_eq!(
    oidc_authorization
      .query_pairs()
      .find(|(key, _)| key == "code_challenge_method")
      .unwrap()
      .1,
    "S256"
  );
  let oidc_state = oidc_authorization
    .query_pairs()
    .find(|(key, _)| key == "state")
    .unwrap()
    .1
    .into_owned();
  let oidc_state_token = serde_json::from_str::<serde_json::Value>(&oidc_state).unwrap()["state"]
    .as_str()
    .unwrap()
    .to_string();
  *oidc_nonce.lock().await = oidc_state_token;
  let oidc_login = oauth::callback(
    &pool,
    &config,
    "oidc-code",
    &oidc_state,
    Some("oidc-client-nonce"),
    SessionIssueInput::Cookie {
      session_id: None,
      client_version: None,
    },
  )
  .await
  .unwrap();
  assert_eq!(
    serde_json::to_value(oidc_login).unwrap()["user"]["email"],
    "oidc@example.invalid"
  );
  assert!(
    oauth::callback(
      &pool,
      &config,
      "oidc-code",
      &oidc_state,
      Some("oidc-client-nonce"),
      SessionIssueInput::Cookie {
        session_id: None,
        client_version: None,
      },
    )
    .await
    .is_err()
  );

  let oauth_email = format!("oauth-{marker}@example.invalid");
  let github_subject = |id, login| {
    serde_json::from_value::<oauth_http::GitHubUser>(json!({
      "id": id,
      "login": login,
      "email": null,
      "name": null,
      "avatar_url": null
    }))
    .unwrap()
    .subject()
  };
  assert_eq!(github_subject(4242, "old-name"), github_subject(4242, "new-name"));
  assert_ne!(github_subject(4242, "reused-name"), github_subject(4243, "reused-name"));
  let oauth_state = oauth::OAuthState {
    provider: "google".to_string(),
    provider_label: "Google".to_string(),
    redirect_uri: None,
    client: "web".to_string(),
    client_nonce: "nonce".to_string(),
    client_version: Some("0.27.5".to_string()),
    callback_url: "https://app.affine.pro/oauth/callback".to_string(),
    pkce_verifier: None,
  };
  let oauth_namespace =
    oauth_http::provider_namespace("google", config.auth.oauth.providers.get("google").unwrap(), None);
  config.auth.allow_signup_for_oauth = false;
  let existing_oauth = oauth::bind_and_issue(
    &pool,
    &config,
    &oauth_state,
    &oauth_namespace,
    oauth_http::OAuthAccount {
      subject: format!("existing-subject-{marker}"),
      email: format!("auth-{marker}@example.invalid"),
      name: Some("Existing OAuth User".to_string()),
      avatar_url: None,
    },
    SessionIssueInput::Native { client_version: None },
  )
  .await
  .unwrap();
  assert_eq!(existing_oauth.user.id, user_id);
  assert_eq!(existing_oauth.created, Some(false));
  config.auth.allow_signup_for_oauth = true;
  let oauth_subject = format!("subject-{marker}");
  let account = oauth_http::OAuthAccount {
    subject: oauth_subject.clone(),
    email: oauth_email.clone(),
    name: Some("OAuth User".to_string()),
    avatar_url: Some("https://example.invalid/avatar".to_string()),
  };
  let first_oauth = oauth::bind_and_issue(
    &pool,
    &config,
    &oauth_state,
    &oauth_namespace,
    account.clone(),
    SessionIssueInput::Cookie {
      session_id: None,
      client_version: Some("0.27.5".to_string()),
    },
  );
  let second_oauth = oauth::bind_and_issue(
    &pool,
    &config,
    &oauth_state,
    &oauth_namespace,
    account,
    SessionIssueInput::Native { client_version: None },
  );
  let (first_oauth, second_oauth) = tokio::join!(first_oauth, second_oauth);
  let first_oauth = first_oauth.unwrap();
  let second_oauth = second_oauth.unwrap();
  assert_eq!(first_oauth.user.id, second_oauth.user.id);
  assert_eq!(
    [first_oauth.created, second_oauth.created]
      .into_iter()
      .filter(|created| *created == Some(true))
      .count(),
    1
  );
  let connected: (i64, i64) = sqlx::query_as(
    "SELECT count(*),count(*) FILTER (WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR scope IS NOT \
     NULL OR expires_at IS NOT NULL) FROM user_connected_accounts WHERE provider_namespace=$1 AND \
     provider_account_id=$2",
  )
  .bind(&oauth_namespace)
  .bind(&oauth_subject)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(connected, (1, 0));

  sqlx::query("UPDATE users SET email_verified=clock_timestamp() WHERE id=$1")
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  security_challenge::prepare(
    &pool,
    &config,
    security_challenge::SecurityChallengeKind::ChangePassword,
    &user_id,
    "https://app.affine.pro/change-password",
    None,
  )
  .await
  .unwrap();
  let password_mail: serde_json::Value = sqlx::query_scalar(
    "SELECT payload FROM mail_deliveries WHERE mail_name='ChangePassword' AND recipient_user_id=$1 ORDER BY \
     created_at DESC LIMIT 1",
  )
  .bind(&user_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  let password_url = url::Url::parse(password_mail["props"]["url"].as_str().unwrap()).unwrap();
  let password_token = password_url
    .query_pairs()
    .find(|(key, _)| key == "token")
    .unwrap()
    .1
    .into_owned();
  security_challenge::complete_password(&pool, &user_id, &password_token, "replacement-password")
    .await
    .unwrap();
  assert!(
    security_challenge::complete_password(&pool, &user_id, &password_token, "replayed-password")
      .await
      .is_err()
  );
  let changed_password: (String, i32) = sqlx::query_as("SELECT password,auth_epoch FROM users WHERE id=$1")
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(changed_password.1, 2);
  assert!(
    Argon2::default()
      .verify_password(
        b"replacement-password",
        &PasswordHash::new(&changed_password.0).unwrap(),
      )
      .is_ok()
  );

  security_challenge::prepare(
    &pool,
    &config,
    security_challenge::SecurityChallengeKind::ChangePassword,
    &user_id,
    "https://app.affine.pro/change-password",
    None,
  )
  .await
  .unwrap();
  let rollback_mail: serde_json::Value = sqlx::query_scalar(
    "SELECT payload FROM mail_deliveries WHERE mail_name='ChangePassword' AND recipient_user_id=$1 ORDER BY \
     created_at DESC LIMIT 1",
  )
  .bind(&user_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  let rollback_token = url::Url::parse(rollback_mail["props"]["url"].as_str().unwrap())
    .unwrap()
    .query_pairs()
    .find(|(key, _)| key == "token")
    .unwrap()
    .1
    .into_owned();
  sqlx::query("DROP TRIGGER IF EXISTS rfc12_auth_security_fault ON users")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION IF EXISTS rfc12_auth_security_fault()")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    r#"CREATE FUNCTION rfc12_auth_security_fault() RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'injected credential update failure';
       END
       $$ LANGUAGE plpgsql"#,
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE TRIGGER rfc12_auth_security_fault BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION \
     rfc12_auth_security_fault()",
  )
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    security_challenge::complete_password(&pool, &user_id, &rollback_token, "rollback-password")
      .await
      .is_err()
  );
  let rollback_consumed: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
    "SELECT consumed_at FROM runtime_states WHERE purpose='auth_challenge:change_password' AND token_hash=$1",
  )
  .bind(super::super::token_hash(&rollback_token))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert!(rollback_consumed.is_none());
  sqlx::query("DROP TRIGGER rfc12_auth_security_fault ON users")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rfc12_auth_security_fault()")
    .execute(&pool)
    .await
    .unwrap();
  security_challenge::complete_password(&pool, &user_id, &rollback_token, "after-rollback-password")
    .await
    .unwrap();

  security_challenge::prepare(
    &pool,
    &config,
    security_challenge::SecurityChallengeKind::ChangeEmail,
    &user_id,
    "https://app.affine.pro/change-email",
    None,
  )
  .await
  .unwrap();
  let change_mail: serde_json::Value = sqlx::query_scalar(
    "SELECT payload FROM mail_deliveries WHERE mail_name='ChangeEmail' AND recipient_user_id=$1 ORDER BY created_at \
     DESC LIMIT 1",
  )
  .bind(&user_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  let change_token = url::Url::parse(change_mail["props"]["url"].as_str().unwrap())
    .unwrap()
    .query_pairs()
    .find(|(key, _)| key == "token")
    .unwrap()
    .1
    .into_owned();
  let changed_email = format!("changed-{marker}@example.invalid");
  security_challenge::prepare_verify_change_email(
    &pool,
    &config,
    &user_id,
    &change_token,
    &changed_email,
    "https://app.affine.pro/verify-email",
    None,
  )
  .await
  .unwrap();
  let verify_mail: serde_json::Value = sqlx::query_scalar(
    "SELECT payload FROM mail_deliveries WHERE mail_name='VerifyChangeEmail' AND recipient_user_id=$1 ORDER BY \
     created_at DESC LIMIT 1",
  )
  .bind(&user_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  let verify_token = url::Url::parse(verify_mail["props"]["url"].as_str().unwrap())
    .unwrap()
    .query_pairs()
    .find(|(key, _)| key == "token")
    .unwrap()
    .1
    .into_owned();
  security_challenge::complete_email(&pool, &config, &user_id, &verify_token, &changed_email)
    .await
    .unwrap();
  let changed: (String, i32, i64) = sqlx::query_as(
    "SELECT email,auth_epoch,(SELECT count(*) FROM mail_deliveries WHERE mail_name='EmailChanged' AND \
     recipient_user_id=$1) FROM users WHERE id=$1",
  )
  .bind(&user_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(changed, (changed_email, 4, 1));
  assert!(
    security::set_user_disabled(&pool, &user_id, true, "administrator_disabled")
      .await
      .unwrap()
  );
  assert!(
    !security::set_user_disabled(&pool, &user_id, false, "administrator_enabled")
      .await
      .unwrap()
  );
  let status: (bool, i32) = sqlx::query_as("SELECT disabled,auth_epoch FROM users WHERE id=$1")
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(status, (false, 6));
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(first_oauth.user.id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(&user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(magic_login.user.id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(&second_user_id)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE email='oidc@example.invalid'")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP TRIGGER IF EXISTS rfc12_auth_refresh_fault ON auth_refresh_tokens")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION IF EXISTS rfc12_auth_refresh_fault()")
    .execute(&pool)
    .await
    .unwrap();
}
