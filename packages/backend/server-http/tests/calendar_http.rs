use std::sync::Arc;

use axum::body::Body;
use http::{Request, StatusCode};
use serde_json::Value;
use server_db::{DbConfig, ServerDb};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::{DeploymentMode, ServerRole};
use test_db_harness::{pg::PgCluster, redis::TestRedis};
use tower::ServiceExt as _;
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

async fn setup_http_state(db_url: &str, redis_url: &str) -> (Arc<AppState>, axum::Router) {
  let mut db_cfg = DbConfig::new(db_url);
  db_cfg.max_connections = 4;
  let db = ServerDb::connect(db_cfg).await.expect("connect db");
  let redis = redis::Client::open(redis_url).expect("open redis");
  let cfg = RuntimeConfig {
    deployment_mode: DeploymentMode::Selfhosted,
    role: ServerRole::Allinone,
    dev_mode: false,
    ..RuntimeConfig::default()
  };
  let state = AppState::new(db, Some(redis), cfg, Arc::new(CommunityExtension::new()));
  let router = build_router(Arc::clone(&state));
  (state, router)
}

async fn read_json(resp: axum::response::Response) -> Value {
  let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
    .await
    .expect("read body");
  serde_json::from_slice(&bytes).expect("parse json")
}

#[test]
fn calendar_rest_webhook_and_oauth_callback_validation() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let (state, router) = setup_http_state(&db_url, &redis_url).await;

    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at)
         VALUES (
           'calendar.google',
           '{"enabled":true,"clientId":"cid","clientSecret":"csec","externalWebhookUrl":"https://hook.example.com","webhookVerificationToken":"expected-secret"}'::jsonb,
           clock_timestamp(),
           clock_timestamp()
         )"#,
    )
    .execute(state.db.pool())
    .await
    .expect("seed google calendar config");

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri("/api/calendar/oauth/callback")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let missing_body = read_json(resp).await;
    assert_eq!(missing_body["name"], "MISSING_OAUTH_QUERY_PARAMETER");
    assert_eq!(missing_body["type"], "BAD_REQUEST");
    assert_eq!(missing_body["message"], "Missing query parameter `code`.");
    assert_eq!(missing_body["data"]["name"], "code");

    let unknown_state = Uuid::new_v4().to_string();
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=abc&state={unknown_state}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let expired_body = read_json(resp).await;
    assert_eq!(expired_body["name"], "OAUTH_STATE_EXPIRED");
    assert_eq!(expired_body["type"], "BAD_REQUEST");
    assert_eq!(expired_body["message"], "OAuth state expired, please try again.");

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/webhook/google")
          .header("x-goog-channel-id", "chan-1")
          .header("x-goog-channel-token", "wrong-secret")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/webhook/google")
          .header("x-goog-channel-id", "chan-1")
          .header("x-goog-channel-token", "expected-secret")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // When webhookVerificationToken is not configured, AppState shares one generated token across requests.
    sqlx::query(
      r#"UPDATE app_configs
         SET value = '{"enabled":true,"clientId":"cid","clientSecret":"csec","externalWebhookUrl":"https://hook.example.com"}'::jsonb
         WHERE id = 'calendar.google'"#,
    )
    .execute(state.db.pool())
    .await
    .expect("clear explicit webhook token");
    let generated_token = state
      .calendar
      .webhook_token_from_config(&server_domain::calendar::google::CalendarGoogleConfig::default())
      .await;
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/webhook/google")
          .header("x-goog-channel-id", "chan-1")
          .header("x-goog-channel-token", &generated_token)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // @Public() callback and webhook with an unsupported client version session cookie
    // must clear auth cookies and continue anonymously instead of returning 403.
    let user_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO users (id, name, email, registered, disabled, email_verified, created_at)
         VALUES ($1, 'Cal User', 'cal-ver@example.com', true, false, clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&user_id)
    .execute(state.db.pool())
    .await
    .expect("insert user");
    let session_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO multiple_users_sessions (id, created_at) VALUES ($1, clock_timestamp())")
      .bind(&session_id)
      .execute(state.db.pool())
      .await
      .expect("insert multiple_users_session");
    sqlx::query(
      r#"INSERT INTO user_sessions (id, session_id, user_id, expires_at, created_at)
         VALUES ($1, $2, $3, clock_timestamp() + interval '1 day', clock_timestamp())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&session_id)
    .bind(&user_id)
    .execute(state.db.pool())
    .await
    .expect("insert user_session");
    sqlx::query(
      r#"INSERT INTO app_configs (id, value, created_at, updated_at)
         VALUES ('client.versionControl', '{"enabled":true,"requiredVersion":"99.0.0"}'::jsonb, clock_timestamp(), clock_timestamp())
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = clock_timestamp()"#,
    )
    .execute(state.db.pool())
    .await
    .expect("seed versionControl");
    state.app_config.invalidate_cache();

    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/webhook/google")
          .header("cookie", format!("affine_session={session_id}"))
          .header("x-affine-version", "0.1.0")
          .header("x-goog-channel-id", "chan-1")
          .header("x-goog-channel-token", &generated_token)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let set_cookies: Vec<String> = resp
      .headers()
      .get_all(axum::http::header::SET_COOKIE)
      .iter()
      .filter_map(|v| v.to_str().ok().map(str::to_owned))
      .collect();
    assert!(set_cookies.iter().any(|c| c.starts_with("affine_session=;")));
    assert!(set_cookies.iter().any(|c| c.starts_with("affine_user_id=;")));
    assert!(set_cookies.iter().any(|c| c.starts_with("affine_csrf_token=;")));

    // Disallowed redirect_uri on provider failure returns 403 ACTION_FORBIDDEN (not 302).
    let oauth_store = state.calendar_oauth.as_ref().expect("oauth store");
    let bad_redir_token = oauth_store
      .save_oauth_state(server_domain::calendar::oauth::CalendarOAuthState {
        provider: server_domain::calendar::CalendarProviderName::Google,
        user_id: user_id.clone(),
        redirect_uri: Some("https://evil.example.net/steal".to_owned()),
        token: None,
      })
      .await
      .expect("save state");
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={bad_redir_token}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    let forbidden_body = read_json(resp).await;
    assert_eq!(forbidden_body["name"], "ACTION_FORBIDDEN");
    assert_eq!(forbidden_body["type"], "ACTION_FORBIDDEN");

    // Relative redirect_uri with existing query params (?keep=1&error=old) replaces old error and preserves keep=1.
    let rel_redir_token = oauth_store
      .save_oauth_state(server_domain::calendar::oauth::CalendarOAuthState {
        provider: server_domain::calendar::CalendarProviderName::Google,
        user_id: user_id.clone(),
        redirect_uri: Some("/calendar?keep=1&error=old".to_owned()),
        token: None,
      })
      .await
      .expect("save rel state");
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={rel_redir_token}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    let rel_loc = resp.headers().get(axum::http::header::LOCATION).unwrap().to_str().unwrap();
    let parsed_rel = url::Url::parse(rel_loc).expect("parse rel location");
    let rel_pairs: Vec<(String, String)> = parsed_rel
      .query_pairs()
      .map(|(k, v)| (k.into_owned(), v.into_owned()))
      .collect();
    assert_eq!(parsed_rel.path(), "/calendar");
    assert_eq!(rel_pairs.iter().filter(|(k, _)| k == "keep").count(), 1);
    assert_eq!(
      rel_pairs.iter().find(|(k, _)| k == "keep").map(|(_, v)| v.as_str()),
      Some("1")
    );
    let err_vals: Vec<&str> = rel_pairs
      .iter()
      .filter(|(k, _)| k == "error")
      .map(|(_, v)| v.as_str())
      .collect();
    assert_eq!(err_vals.len(), 1, "expected single error param, got {rel_loc}");
    assert_ne!(err_vals[0], "old");

    // Trusted external domain (affine.pro) passes canonical check and downgrades via safe_redirect_response to baseUrl.
    let trusted_ext_token = oauth_store
      .save_oauth_state(server_domain::calendar::oauth::CalendarOAuthState {
        provider: server_domain::calendar::CalendarProviderName::Google,
        user_id: user_id.clone(),
        redirect_uri: Some("https://affine.pro/cb".to_owned()),
        token: None,
      })
      .await
      .expect("save trusted ext state");
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={trusted_ext_token}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    assert_eq!(
      resp.headers().get(axum::http::header::LOCATION).unwrap(),
      "http://localhost:3010"
    );

    // Subpath deployment (/app): same-origin path outside /app falls back to full external_url (/app).
    let mut subpath_cfg = (**state.config.load()).clone();
    subpath_cfg.external_url = "https://app.example.com/app".to_owned();
    state.config.store(Arc::new(subpath_cfg));

    let outside_token = oauth_store
      .save_oauth_state(server_domain::calendar::oauth::CalendarOAuthState {
        provider: server_domain::calendar::CalendarProviderName::Google,
        user_id: user_id.clone(),
        redirect_uri: Some("https://app.example.com/outside".to_owned()),
        token: None,
      })
      .await
      .expect("save outside state");
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={outside_token}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    assert_eq!(
      resp.headers().get(axum::http::header::LOCATION).unwrap(),
      "https://app.example.com/app"
    );

    let inside_token = oauth_store
      .save_oauth_state(server_domain::calendar::oauth::CalendarOAuthState {
        provider: server_domain::calendar::CalendarProviderName::Google,
        user_id: user_id.clone(),
        redirect_uri: Some("https://app.example.com/app/calendar".to_owned()),
        token: None,
      })
      .await
      .expect("save inside state");
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={inside_token}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    let inside_loc = resp.headers().get(axum::http::header::LOCATION).unwrap().to_str().unwrap();
    assert!(
      inside_loc.starts_with("https://app.example.com/app/calendar?error="),
      "unexpected subpath redirect location: {inside_loc}"
    );

    // Round 6: subpath deployment (http://localhost:3010/app) resolves ?view=calendar against origin (not /app),
    // allows same-origin protocol-relative //localhost:3010/app/cb, and rejects //evil.example/cb with 403.
    let mut local_subpath_cfg = (**state.config.load()).clone();
    local_subpath_cfg.external_url = "http://localhost:3010/app".to_owned();
    state.config.store(Arc::new(local_subpath_cfg));
    let session = state
      .auth
      .issue_cookie_session_for_user(&user_id)
      .await
      .expect("issue cookie session");
    let cookie_hdr = format!("affine_session={}", session.session_id);

    // 1) REST preflight with ?view=calendar stores http://localhost:3010/?view=calendar, callback failure falls back to /app.
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/oauth/preflight")
          .header(axum::http::header::CONTENT_TYPE, "application/json")
          .header(axum::http::header::COOKIE, &cookie_hdr)
          .header("x-affine-version", "99.0.0")
          .body(Body::from(r#"{"provider":"google","redirect_uri":"?view=calendar"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    let pf_status = resp.status();
    let pf_body = read_json(resp).await;
    assert_eq!(pf_status, StatusCode::OK, "preflight failed: {pf_body}");
    let auth_url = url::Url::parse(pf_body["url"].as_str().unwrap()).expect("parse auth url");
    let state_tok = auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .map(|(_, v)| v.into_owned())
      .expect("state query param");
    let saved_state = oauth_store
      .get_oauth_state(&state_tok)
      .await
      .expect("get saved oauth state")
      .expect("saved oauth state exists");
    assert_eq!(
      saved_state.redirect_uri.as_deref(),
      Some("http://localhost:3010/?view=calendar")
    );
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={state_tok}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    assert_eq!(
      resp.headers().get(axum::http::header::LOCATION).unwrap(),
      "http://localhost:3010/app"
    );

    // 2) GraphQL linkCalendarAccount with ?view=calendar stores identical origin-resolved canonical URI.
    let gql_schema = server_http::graphql::build_schema(Arc::clone(&state));
    let gql_resp = gql_schema
      .execute(
        async_graphql::Request::new(
          r#"mutation { linkCalendarAccount(input: { provider: Google, redirectUri: "?view=calendar" }) }"#,
        )
        .data(server_http::graphql::AuthenticatedUser {
          user_id: user_id.clone(),
          user: None,
        }),
      )
      .await;
    assert!(gql_resp.errors.is_empty(), "gql errors: {:?}", gql_resp.errors);
    let gql_json = serde_json::to_value(&gql_resp.data).unwrap();
    let gql_auth_url = url::Url::parse(gql_json["linkCalendarAccount"].as_str().unwrap()).unwrap();
    let gql_state_tok = gql_auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .map(|(_, v)| v.into_owned())
      .unwrap();
    let gql_saved = oauth_store.get_oauth_state(&gql_state_tok).await.unwrap().unwrap();
    assert_eq!(
      gql_saved.redirect_uri.as_deref(),
      Some("http://localhost:3010/?view=calendar")
    );

    // 3) Same-origin protocol-relative //localhost:3010/app/cb passes preflight and redirects with ?error=.
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/oauth/preflight")
          .header(axum::http::header::CONTENT_TYPE, "application/json")
          .header(axum::http::header::COOKIE, &cookie_hdr)
          .header("x-affine-version", "99.0.0")
          .body(Body::from(
            r#"{"provider":"google","redirect_uri":"//localhost:3010/app/cb"}"#,
          ))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let pf_rel = read_json(resp).await;
    let rel_state_tok = url::Url::parse(pf_rel["url"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "state")
      .map(|(_, v)| v.into_owned())
      .unwrap();
    let rel_saved = oauth_store.get_oauth_state(&rel_state_tok).await.unwrap().unwrap();
    assert_eq!(rel_saved.redirect_uri.as_deref(), Some("http://localhost:3010/app/cb"));
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={rel_state_tok}"))
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    let proto_rel_loc = resp.headers().get(axum::http::header::LOCATION).unwrap().to_str().unwrap();
    assert!(
      proto_rel_loc.starts_with("http://localhost:3010/app/cb?error="),
      "unexpected protocol-relative location: {proto_rel_loc}"
    );

    // 4) Untrusted protocol-relative //evil.example/cb returns 403 ACTION_FORBIDDEN.
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/oauth/preflight")
          .header(axum::http::header::CONTENT_TYPE, "application/json")
          .header(axum::http::header::COOKIE, &cookie_hdr)
          .header("x-affine-version", "99.0.0")
          .body(Body::from(r#"{"provider":"google","redirect_uri":"//evil.example/cb"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    assert_eq!(read_json(resp).await["name"], "ACTION_FORBIDDEN");

    // 5) Multi-host Host: app2.affine.local:3010 strips :port to match server.hosts, stores http://app2.affine.local/cb,
    //    and callback safe_redirect_response falls back 302 to primary baseUrl (http://localhost:3010/app).
    let mut multi_host_cfg = (**state.config.load()).clone();
    multi_host_cfg.app_config_baseline.server.hosts = vec!["app2.affine.local".to_owned()];
    multi_host_cfg.app_config_baseline.server.port = 3010;
    state.config.store(Arc::new(multi_host_cfg));
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/oauth/preflight")
          .header(axum::http::header::CONTENT_TYPE, "application/json")
          .header(axum::http::header::COOKIE, &cookie_hdr)
          .header(axum::http::header::HOST, "app2.affine.local:3010")
          .header("x-affine-version", "99.0.0")
          .body(Body::from(r#"{"provider":"google","redirect_uri":"/cb"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let mh_body = read_json(resp).await;
    let mh_auth_url = url::Url::parse(mh_body["url"].as_str().unwrap()).unwrap();
    let mh_cb_uri = mh_auth_url
      .query_pairs()
      .find(|(k, _)| k == "redirect_uri")
      .map(|(_, v)| v.into_owned())
      .unwrap();
    assert_eq!(mh_cb_uri, "http://app2.affine.local/api/calendar/oauth/callback");
    let mh_state_tok = mh_auth_url
      .query_pairs()
      .find(|(k, _)| k == "state")
      .map(|(_, v)| v.into_owned())
      .unwrap();
    let mh_saved = oauth_store.get_oauth_state(&mh_state_tok).await.unwrap().unwrap();
    assert_eq!(mh_saved.redirect_uri.as_deref(), Some("http://app2.affine.local/cb"));
    let mut gql_headers = axum::http::HeaderMap::new();
    gql_headers.insert(
      axum::http::header::HOST,
      axum::http::HeaderValue::from_static("app2.affine.local:3010"),
    );
    let gql_mh = gql_schema
      .execute(
        async_graphql::Request::new(r#"mutation { linkCalendarAccount(input: { provider: Google }) }"#)
          .data(server_http::graphql::AuthenticatedUser {
            user_id: user_id.clone(),
            user: None,
          })
          .data(gql_headers),
      )
      .await;
    assert!(gql_mh.errors.is_empty(), "gql mh errors: {:?}", gql_mh.errors);
    let gql_mh_url = url::Url::parse(
      serde_json::to_value(&gql_mh.data).unwrap()["linkCalendarAccount"]
        .as_str()
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
      gql_mh_url
        .query_pairs()
        .find(|(k, _)| k == "redirect_uri")
        .map(|(_, v)| v.into_owned())
        .as_deref(),
      Some("http://app2.affine.local/api/calendar/oauth/callback")
    );
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=bad&state={mh_state_tok}"))
          .header(axum::http::header::HOST, "app2.affine.local:3010")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::FOUND);
    assert_eq!(
      resp.headers().get(axum::http::header::LOCATION).unwrap(),
      "http://localhost:3010/app"
    );

    // 6) Omitted and empty redirect_uri store None (JSON response on callback), while single-space " "
    //    is truthy like JS and resolves to requestOrigin + "/" (302 redirect on callback).
    let mut root_cfg = (**state.config.load()).clone();
    root_cfg.external_url = "http://localhost:3010".to_owned();
    root_cfg.app_config_baseline.server.hosts.clear();
    state.config.store(Arc::new(root_cfg));
    for (body_json, expected_uri, expect_redirect) in [
      (r#"{"provider":"google"}"#, None, false),
      (r#"{"provider":"google","redirect_uri":""}"#, None, false),
      (
        r#"{"provider":"google","redirect_uri":" "}"#,
        Some("http://localhost:3010/"),
        true,
      ),
    ] {
      let resp = router
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/calendar/oauth/preflight")
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &cookie_hdr)
            .header("x-affine-version", "99.0.0")
            .body(Body::from(body_json))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(resp.status(), StatusCode::OK);
      let tok = url::Url::parse(read_json(resp).await["url"].as_str().unwrap())
        .unwrap()
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.into_owned())
        .unwrap();
      let st = oauth_store.get_oauth_state(&tok).await.unwrap().unwrap();
      assert_eq!(st.redirect_uri.as_deref(), expected_uri);
      let cb = router
        .clone()
        .oneshot(
          Request::builder()
            .method("GET")
            .uri(format!("/api/calendar/oauth/callback?code=bad&state={tok}"))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      if expect_redirect {
        assert_eq!(cb.status(), StatusCode::FOUND);
        let loc = cb.headers().get(axum::http::header::LOCATION).unwrap().to_str().unwrap();
        assert!(loc.starts_with("http://localhost:3010/?error="), "loc: {loc}");
      } else {
        assert_ne!(cb.status(), StatusCode::FOUND);
      }
    }

    state.db.pool().close().await;
  });
}

#[test]
fn calendar_oauth_success_callback_redirect_and_token_exchange() {
  let cluster = PgCluster::from_env_or_docker().expect("pg cluster");
  let lease = lease_test_db(&cluster);
  let db_url = lease.url().to_owned();
  let redis = TestRedis::from_env_or_docker().expect("test redis");
  let redis_url = redis.url().to_owned();
  let rt = test_runtime();
  rt.block_on(async {
    let seen_redirect_uris: Arc<std::sync::Mutex<Vec<String>>> = Arc::new(std::sync::Mutex::new(Vec::new()));
    let seen_for_srv = Arc::clone(&seen_redirect_uris);
    let mock_google = axum::Router::new()
      .route(
        "/token",
        axum::routing::post(move |body: String| {
          let seen = Arc::clone(&seen_for_srv);
          async move {
            if let Some(uri) = url::Url::parse(&format!("http://x/?{body}")).ok().and_then(|u| {
              u.query_pairs()
                .find(|(k, _)| k == "redirect_uri")
                .map(|(_, v)| v.into_owned())
            }) {
              seen.lock().unwrap().push(uri);
            }
            axum::Json(serde_json::json!({
              "access_token": "at-ok",
              "refresh_token": "rt-ok",
              "expires_in": 3600,
              "token_type": "Bearer",
              "scope": "https://www.googleapis.com/auth/calendar.readonly"
            }))
          }
        }),
      )
      .route(
        "/userinfo",
        axum::routing::get(|| async {
          axum::Json(serde_json::json!({
            "id": "goog-user-1",
            "email": "goog@example.com",
            "name": "Google User"
          }))
        }),
      )
      .route(
        "/users/me/calendarList",
        axum::routing::get(|| async { axum::Json(serde_json::json!({ "items": [] })) }),
      );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
      .await
      .expect("bind mock google");
    let mock_addr = listener.local_addr().expect("mock google addr");
    let mock_srv = tokio::spawn(async move {
      let _ = axum::serve(listener, mock_google).await;
    });

    let mut db_cfg = DbConfig::new(&db_url);
    db_cfg.max_connections = 4;
    let db = ServerDb::connect(db_cfg).await.expect("connect db");
    let redis_client = redis::Client::open(redis_url.as_str()).expect("open redis");
    let mut cfg = RuntimeConfig {
      deployment_mode: DeploymentMode::Selfhosted,
      role: ServerRole::Allinone,
      dev_mode: false,
      external_url: "http://localhost:3010/app".to_owned(),
      ..RuntimeConfig::default()
    };
    cfg.app_config_baseline.server.hosts = vec!["app2.affine.local".to_owned()];
    cfg.app_config_baseline.server.port = 3010;
    let mut state = AppState::new(db.clone(), Some(redis_client), cfg, Arc::new(CommunityExtension::new()));
    let google_override = server_domain::calendar::google::CalendarGoogleConfig {
      enabled: true,
      allow_new_accounts: Some(true),
      client_id: "cid".to_owned(),
      client_secret: "csec".to_owned(),
      token_endpoint_override: Some(format!("http://{mock_addr}/token")),
      userinfo_endpoint_override: Some(format!("http://{mock_addr}/userinfo")),
      api_base_override: Some(format!("http://{mock_addr}")),
      ..Default::default()
    };
    Arc::get_mut(&mut state).expect("unique app state").calendar = server_domain::calendar::CalendarService::new(
      db,
      "ephemeral-test-calendar-key".to_owned(),
      "http://localhost:3010/app".to_owned(),
    )
    .with_config_override(server_domain::calendar::EffectiveCalendarConfigs {
      google: google_override,
      caldav: Default::default(),
    });
    let router = build_router(Arc::clone(&state));
    let oauth_store = state.calendar_oauth.as_ref().expect("calendar oauth store");

    let user_id = Uuid::new_v4().to_string();
    sqlx::query(
      r#"INSERT INTO users (id, name, email, registered, disabled, email_verified, created_at)
         VALUES ($1, 'Cal Ok', 'cal-ok@example.com', true, false, clock_timestamp(), clock_timestamp())"#,
    )
    .bind(&user_id)
    .execute(state.db.pool())
    .await
    .expect("insert user");
    let session = state
      .auth
      .issue_cookie_session_for_user(&user_id)
      .await
      .expect("issue session");
    let cookie_hdr = format!("affine_session={}", session.session_id);

    // 1) Multi-host subpath callback exchanges token using http://app2.affine.local/api/calendar/oauth/callback.
    let resp = router
      .clone()
      .oneshot(
        Request::builder()
          .method("POST")
          .uri("/api/calendar/oauth/preflight")
          .header(axum::http::header::CONTENT_TYPE, "application/json")
          .header(axum::http::header::COOKIE, &cookie_hdr)
          .header(axum::http::header::HOST, "app2.affine.local:3010")
          .body(Body::from(r#"{"provider":"google"}"#))
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let mh_tok = url::Url::parse(read_json(resp).await["url"].as_str().unwrap())
      .unwrap()
      .query_pairs()
      .find(|(k, _)| k == "state")
      .map(|(_, v)| v.into_owned())
      .unwrap();
    let cb = router
      .clone()
      .oneshot(
        Request::builder()
          .method("GET")
          .uri(format!("/api/calendar/oauth/callback?code=good-1&state={mh_tok}"))
          .header(axum::http::header::HOST, "app2.affine.local:3010")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(cb.status(), StatusCode::OK);
    assert_eq!(read_json(cb).await, serde_json::json!({ "ok": true }));
    assert_eq!(
      seen_redirect_uris.lock().unwrap().as_slice(),
      &["http://app2.affine.local/api/calendar/oauth/callback"]
    );

    // 2) Root deployment: omitted & "" -> 200 {"ok":true}; " " & "\t" -> stored Some("http://localhost:3010/") and 302 Location: http://localhost:3010/ (no error).
    let mut root_cfg = (**state.config.load()).clone();
    root_cfg.external_url = "http://localhost:3010".to_owned();
    root_cfg.app_config_baseline.server.hosts.clear();
    state.config.store(Arc::new(root_cfg));
    for (body_json, expected_uri, expect_302) in [
      (r#"{"provider":"google"}"#, None, false),
      (r#"{"provider":"google","redirect_uri":""}"#, None, false),
      (
        r#"{"provider":"google","redirect_uri":" "}"#,
        Some("http://localhost:3010/"),
        true,
      ),
      (
        r#"{"provider":"google","redirect_uri":"\t"}"#,
        Some("http://localhost:3010/"),
        true,
      ),
    ] {
      let pf = router
        .clone()
        .oneshot(
          Request::builder()
            .method("POST")
            .uri("/api/calendar/oauth/preflight")
            .header(axum::http::header::CONTENT_TYPE, "application/json")
            .header(axum::http::header::COOKIE, &cookie_hdr)
            .body(Body::from(body_json))
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(pf.status(), StatusCode::OK, "preflight failed for {body_json}");
      let tok = url::Url::parse(read_json(pf).await["url"].as_str().unwrap())
        .unwrap()
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.into_owned())
        .unwrap();
      let st = oauth_store.get_oauth_state(&tok).await.unwrap().unwrap();
      assert_eq!(st.redirect_uri.as_deref(), expected_uri, "for {body_json}");
      let cb = router
        .clone()
        .oneshot(
          Request::builder()
            .method("GET")
            .uri(format!("/api/calendar/oauth/callback?code=good&state={tok}"))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      if expect_302 {
        assert_eq!(cb.status(), StatusCode::FOUND, "for {body_json}");
        assert_eq!(
          cb.headers().get(axum::http::header::LOCATION).unwrap(),
          "http://localhost:3010/",
          "for {body_json}"
        );
      } else {
        assert_eq!(cb.status(), StatusCode::OK, "for {body_json}");
        assert_eq!(read_json(cb).await, serde_json::json!({ "ok": true }));
      }
    }

    mock_srv.abort();
    state.db.pool().close().await;
  });
}
