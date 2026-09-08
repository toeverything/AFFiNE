use std::{collections::VecDeque, sync::Arc, time::Duration};

use affine_core::{
  access_control::Plan,
  payment::{
    FinancialFact, FinancialKind, FinancialStatus, Provider, ProviderEnvironment, ProviderLifecycle, ProviderNamespace,
    SubscriptionRecurring,
  },
};
use chrono::Utc;
use serde_json::json;
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  net::TcpListener,
  sync::mpsc,
};
use zeroize::Zeroizing;

use super::*;
use crate::runtime::{Deployment, RevenueCatRuntimeConfig, StripeRuntimeConfig};

async fn apply_payment_snapshot(
  connection: &mut PaymentConnection,
  snapshot: PaymentSnapshot,
  deployment: Deployment,
) -> Result<PaymentApplyResult, super::apply::PaymentApplyError> {
  super::apply_payment_snapshot(connection, snapshot, deployment, &[0; 32]).await
}

struct MockResponse {
  status: u16,
  body: String,
  delay: Duration,
}

async fn mock_http(responses: Vec<MockResponse>) -> (String, mpsc::UnboundedReceiver<String>) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let address = listener.local_addr().unwrap();
  let (requests, received) = mpsc::unbounded_channel();
  tokio::spawn(async move {
    let mut responses = VecDeque::from(responses);
    while let Some(response) = responses.pop_front() {
      let (mut stream, _) = listener.accept().await.unwrap();
      let mut request = Vec::new();
      let mut buffer = [0_u8; 4096];
      loop {
        let read = stream.read(&mut buffer).await.unwrap();
        if read == 0 {
          break;
        }
        request.extend_from_slice(&buffer[..read]);
        let Some(header_end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") else {
          continue;
        };
        let headers = String::from_utf8_lossy(&request[..header_end]);
        let content_length = headers
          .lines()
          .find_map(|line| {
            line
              .to_ascii_lowercase()
              .strip_prefix("content-length:")
              .map(str::trim)
              .map(str::to_string)
          })
          .and_then(|value| value.parse::<usize>().ok())
          .unwrap_or_default();
        if request.len() >= header_end + 4 + content_length {
          break;
        }
      }
      let _ = requests.send(String::from_utf8_lossy(&request).into_owned());
      tokio::time::sleep(response.delay).await;
      let reason = match response.status {
        200 => "OK",
        401 => "Unauthorized",
        429 => "Too Many Requests",
        _ => "Internal Server Error",
      };
      let reply = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nRequest-Id: req-test\r\nContent-Length: \
         {}\r\nConnection: close\r\n\r\n{}",
        response.status,
        reason,
        response.body.len(),
        response.body
      );
      let _ = stream.write_all(reply.as_bytes()).await;
    }
  });
  (format!("http://{address}/"), received)
}

async fn pool() -> Option<PgPool> {
  let database_url = std::env::var("DATABASE_URL").ok()?;
  Some(
    PgPoolOptions::new()
      .max_connections(3)
      .acquire_timeout(Duration::from_secs(5))
      .connect(&database_url)
      .await
      .unwrap(),
  )
}

fn namespace() -> &'static str {
  "payment:v1:stripe:test:4:acct"
}

fn provider_namespace(account: &str) -> ProviderNamespace {
  ProviderNamespace {
    provider: Provider::Stripe,
    environment: ProviderEnvironment::Test,
    account: account.to_string(),
  }
}

fn subscription(target_id: &str, customer_id: &str, source_id: &str) -> SubscriptionSnapshot {
  let now = Utc::now();
  SubscriptionSnapshot {
    source_id: source_id.to_string(),
    target_type: "user".to_string(),
    target_id: target_id.to_string(),
    plan: Plan::Pro,
    recurring: SubscriptionRecurring::Monthly,
    lifecycle: ProviderLifecycle::Active,
    gives_access: None,
    will_renew: Some(true),
    quantity: None,
    external_customer_id: Some(customer_id.to_string()),
    external_subscription_id: Some(source_id.to_string()),
    external_product_id: Some("product".to_string()),
    external_price_id: Some("price".to_string()),
    iap_store: None,
    external_ref: None,
    currency: Some("USD".to_string()),
    amount: Some(1000),
    period_start: Some(now - chrono::Duration::minutes(1)),
    period_end: Some(now + chrono::Duration::days(30)),
    trial_start: None,
    trial_end: None,
    canceled_at: None,
    metadata: json!({}),
  }
}

fn team_subscription(target_id: &str, customer_id: &str, source_id: &str) -> SubscriptionSnapshot {
  let mut subscription = subscription(target_id, customer_id, source_id);
  subscription.target_type = "workspace".to_string();
  subscription.plan = Plan::Team;
  subscription.quantity = Some(2.0);
  subscription
}

fn revenuecat_subscription(target_id: &str, customer_id: &str, source_id: &str) -> SubscriptionSnapshot {
  SubscriptionSnapshot {
    source_id: source_id.to_string(),
    target_type: "user".to_string(),
    target_id: target_id.to_string(),
    plan: Plan::Ai,
    recurring: SubscriptionRecurring::Yearly,
    lifecycle: ProviderLifecycle::Active,
    gives_access: Some(false),
    will_renew: Some(false),
    quantity: None,
    external_customer_id: Some(customer_id.to_string()),
    external_subscription_id: Some(source_id.to_string()),
    external_product_id: Some("rc-product".to_string()),
    external_price_id: None,
    iap_store: Some("app_store".to_string()),
    external_ref: Some(format!("store-{source_id}")),
    currency: Some("USD".to_string()),
    amount: Some(1000),
    period_start: Some(Utc::now()),
    period_end: Some(Utc::now() + chrono::Duration::days(365)),
    trial_start: None,
    trial_end: None,
    canceled_at: None,
    metadata: json!({}),
  }
}

fn revenuecat_item(customer_id: &str, source_id: &str, transaction_id: &str) -> serde_json::Value {
  json!({
    "id": source_id,
    "customer_id": customer_id,
    "product_id": "rc-product",
    "starts_at": Utc::now().timestamp_millis(),
    "current_period_ends_at": (Utc::now() + chrono::Duration::days(365)).timestamp_millis(),
    "store": "app_store",
    "store_subscription_identifier": transaction_id,
    "ownership": "purchased",
    "environment": "sandbox",
    "auto_renewal_status": "will_renew",
    "status": "active",
    "gives_access": true,
    "entitlements": {
      "items": [{
        "id": "rc-entitlement",
        "lookup_key": "pro",
        "products": {
          "items": [{
            "id": "rc-product",
            "display_name": "AFFiNE Pro",
            "store_identifier": "app.affine.pro.Annual",
            "subscription": { "duration": "P1Y" }
          }],
          "next_page": null
        }
      }],
      "next_page": null
    }
  })
}

fn snapshot(
  namespace: ProviderNamespace,
  coverage: SnapshotCoverage,
  customer_id: &str,
  subscriptions: Vec<SubscriptionSnapshot>,
) -> PaymentSnapshot {
  PaymentSnapshot {
    namespace,
    coverage,
    customer_id: Some(customer_id.to_string()),
    customers: Vec::new(),
    subscriptions,
    ownership_transfers: Vec::new(),
    financial_facts: Vec::new(),
    trials: Vec::new(),
    invoices: Vec::new(),
    licenses: Vec::new(),
    mails: Vec::new(),
    captured_event_ids: Vec::new(),
    operation: None,
  }
}

async fn insert_user(pool: &PgPool, marker: &str) -> String {
  let id = format!("rfc12-user-{marker}");
  sqlx::query("INSERT INTO users(id,name,email) VALUES($1,'RFC12 payment test',$2)")
    .bind(&id)
    .bind(format!("rfc12-{marker}@example.invalid"))
    .execute(pool)
    .await
    .unwrap();
  id
}

async fn insert_workspace(pool: &PgPool, marker: &str, owner_id: &str) -> String {
  let id = format!("rfc12-workspace-{marker}");
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&id)
    .execute(pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_members(id,workspace_id,user_id,role,state) VALUES($1,$2,$3,'owner','active')")
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&id)
    .bind(owner_id)
    .execute(pool)
    .await
    .unwrap();
  id
}

async fn cleanup(pool: &PgPool, namespace: &str, marker: &str) {
  sqlx::query("DELETE FROM mail_deliveries WHERE dedupe_key LIKE $1 OR workspace_id LIKE $2")
    .bind(format!("rfc12-{marker}%"))
    .bind(format!("rfc12-workspace-{marker}%"))
    .execute(pool)
    .await
    .unwrap();
  for table in [
    "payment_financial_facts",
    "payment_operations",
    "payment_events",
    "provider_subscriptions",
  ] {
    sqlx::query(&format!("DELETE FROM {table} WHERE provider_namespace=$1"))
      .bind(namespace)
      .execute(pool)
      .await
      .unwrap();
  }
  sqlx::query("DELETE FROM runtime_states WHERE purpose LIKE 'payment_reconcile_cursor:%' AND lookup_key=$1")
    .bind(namespace)
    .execute(pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM entitlements WHERE subject_id LIKE $1")
    .bind(format!("{namespace}%"))
    .execute(pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM subscription_trial_usages WHERE target_id LIKE $1")
    .bind(format!("rfc12-user-{marker}%"))
    .execute(pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM invoices WHERE provider_namespace=$1")
    .bind(namespace)
    .execute(pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM licenses WHERE key LIKE $1")
    .bind(format!("rfc12-{marker}%"))
    .execute(pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id LIKE $1")
    .bind(format!("rfc12-user-{marker}%"))
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn payment_session_locks_are_sorted_nonblocking_and_connection_bound() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let source = PaymentScope::source(namespace(), "sub-lock-test").unwrap();
  let customer = PaymentScope::customer(namespace(), "cus-lock-test").unwrap();
  let mut first = PaymentConnection::try_acquire(&pool, vec![source.clone(), customer.clone()])
    .await
    .unwrap()
    .unwrap();
  assert_eq!(first.scopes(), &[customer.clone(), source.clone()]);
  let first_pid: i32 = sqlx::query("SELECT pg_backend_pid() AS pid")
    .fetch_one(first.connection())
    .await
    .unwrap()
    .get("pid");
  let mut tx = first.begin().await.unwrap();
  let transaction_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
    .fetch_one(&mut *tx)
    .await
    .unwrap();
  assert_eq!(transaction_pid, first_pid);
  tx.rollback().await.unwrap();

  assert!(
    PaymentConnection::try_acquire(&pool, vec![source.clone()])
      .await
      .unwrap()
      .is_none()
  );
  drop(first);

  let mut replacement = PaymentConnection::try_acquire(&pool, vec![source])
    .await
    .unwrap()
    .unwrap();
  let replacement_pid: i32 = sqlx::query("SELECT pg_backend_pid() AS pid")
    .fetch_one(replacement.connection())
    .await
    .unwrap()
    .get("pid");
  assert_ne!(first_pid, replacement_pid);
}

#[tokio::test]
async fn payment_connection_budget_and_task_cancellation_release_capacity() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Ok(database_url) = std::env::var("DATABASE_URL") else {
    return;
  };
  let pool = PgPoolOptions::new()
    .max_connections(2)
    .acquire_timeout(Duration::from_secs(2))
    .connect(&database_url)
    .await
    .unwrap();
  let first = PaymentScope::source(namespace(), "budget-a").unwrap();
  let second = PaymentScope::source(namespace(), "budget-b").unwrap();
  let third = PaymentScope::source(namespace(), "budget-c").unwrap();
  let first = PaymentConnection::try_acquire(&pool, vec![first])
    .await
    .unwrap()
    .unwrap();
  let second = PaymentConnection::try_acquire(&pool, vec![second])
    .await
    .unwrap()
    .unwrap();
  assert!(
    PaymentConnection::try_acquire(&pool, vec![third.clone()])
      .await
      .is_err()
  );
  drop(first);
  let recovered = PaymentConnection::try_acquire(&pool, vec![third])
    .await
    .unwrap()
    .unwrap();
  drop(second);
  drop(recovered);
  pool.close().await;

  let cancellation_pool = PgPoolOptions::new()
    .max_connections(1)
    .acquire_timeout(Duration::from_secs(5))
    .connect(&database_url)
    .await
    .unwrap();
  let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
  let task_pool = cancellation_pool.clone();
  let operation_id = uuid::Uuid::new_v4().to_string();
  let task_operation_id = operation_id.clone();
  let task = tokio::spawn(async move {
    let mut held = PaymentConnection::try_acquire(
      &task_pool,
      vec![PaymentScope::source(namespace(), "cancelled-task").unwrap()],
    )
    .await
    .unwrap()
    .unwrap();
    let mut tx = held.begin().await.unwrap();
    let resource = PaymentScope::source(namespace(), "cancelled-task").unwrap();
    sqlx::query(
      "INSERT INTO payment_operations(id,provider,provider_namespace,operation_type,intent_id,primary_resource_key) \
       VALUES($1,'stripe',$2,'cancel_test',$1,$3)",
    )
    .bind(&task_operation_id)
    .bind(namespace())
    .bind(resource.as_str())
    .execute(&mut *tx)
    .await
    .unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
      .fetch_one(&mut *tx)
      .await
      .unwrap();
    ready_tx.send(pid).unwrap();
    std::future::pending::<()>().await;
    tx.rollback().await.unwrap();
    drop(held);
  });
  let cancelled_pid = ready_rx.await.unwrap();
  task.abort();
  assert!(task.await.unwrap_err().is_cancelled());
  let mut replacement = PaymentConnection::try_acquire(
    &cancellation_pool,
    vec![PaymentScope::source(namespace(), "cancelled-task").unwrap()],
  )
  .await
  .unwrap()
  .unwrap();
  let replacement_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
    .fetch_one(replacement.connection())
    .await
    .unwrap();
  assert_ne!(cancelled_pid, replacement_pid);
  let operation_count: i64 = sqlx::query_scalar("SELECT count(*) FROM payment_operations WHERE id=$1")
    .bind(operation_id)
    .fetch_one(replacement.connection())
    .await
    .unwrap();
  assert_eq!(operation_count, 0);
}

#[tokio::test]
async fn lock_set_expansion_discards_old_snapshots() {
  let customer = PaymentScope::customer(namespace(), "cus-a").unwrap();
  let source = PaymentScope::source(namespace(), "sub-a").unwrap();
  let other = PaymentScope::source(namespace(), "sub-b").unwrap();
  assert_eq!(
    required_scope_expansion(&[customer, source.clone()], [other.clone(), source]),
    vec![other]
  );
  assert_eq!(
    PaymentScope::source(namespace(), "sub-lock-test")
      .unwrap()
      .advisory_key(),
    -2396923840413743975
  );
  assert!(PaymentScope::source(namespace(), " sub-with-space").is_err());
  assert!(PaymentScope::customer(namespace(), "customer-with-space ").is_err());

  for (customer, expected) in [
    (json!("cus_1"), ("cus_1", None)),
    (
      json!({"id":"cus_1","email":"owner@example.com","future_field":true}),
      ("cus_1", Some("owner@example.com")),
    ),
  ] {
    let session: super::stripe_client::StripeCheckoutSession = serde_json::from_value(json!({
      "id":"cs_1",
      "url":null,
      "customer":customer,
      "subscription":null,
      "status":null,
      "future_field":true
    }))
    .unwrap();
    let customer = session.customer.as_ref().unwrap();
    assert_eq!((customer.id(), customer.email()), expected);
  }
  assert!(
    serde_json::from_value::<super::stripe_client::StripeCheckoutSession>(json!({
      "customer":null
    }))
    .is_err()
  );
  let customer: super::stripe_client::StripeCustomer = serde_json::from_value(json!({
    "id": "cus_case",
    "email": "owner@example.invalid"
  }))
  .unwrap();
  assert!(customer.matches_email("Owner@Example.Invalid"));

  let response = |status, body: &str| MockResponse {
    status,
    body: body.to_string(),
    delay: Duration::ZERO,
  };
  let (stripe_endpoint, mut stripe_requests) = mock_http(vec![
    response(200, "{}"),
    response(200, r#"{"data":[{"id":"one"}],"has_more":true}"#),
    response(200, r#"{"data":[{"id":"two"}],"has_more":false}"#),
    response(401, "{}"),
    response(429, "{}"),
    response(500, "{}"),
    MockResponse {
      status: 200,
      body: "{}".to_string(),
      delay: Duration::from_secs(2),
    },
  ])
  .await;
  let stripe_config = StripeRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("stripe-secret".to_string())),
    webhook_key: Arc::new(Zeroizing::new("webhook-secret".to_string())),
    account_id: "acct-test".to_string(),
    live: false,
  };
  let stripe = StripeClient::with_endpoint(&stripe_config, &stripe_endpoint).unwrap();
  let mut form = super::stripe_client::StripeForm::default();
  form.push(
    "phases[0][items][0][price]",
    super::stripe_client::StripeFormValue::Text("price_1".to_string()),
  );
  form.push("metadata[next_coupon]", super::stripe_client::StripeFormValue::Clear);
  let _: serde_json::Value = stripe.post("v1/test", &form, "stable-key").await.unwrap();
  let values = stripe
    .list_all::<serde_json::Value>("v1/items", &[("customer", "cus_1")])
    .await
    .unwrap();
  assert_eq!(values, vec![json!({"id": "one"}), json!({"id": "two"})]);
  let post = stripe_requests.recv().await.unwrap();
  assert!(post.starts_with("POST /v1/test HTTP/1.1"));
  assert!(post.to_ascii_lowercase().contains("stripe-version: 2025-02-24.acacia"));
  assert!(post.to_ascii_lowercase().contains("idempotency-key: stable-key"));
  assert!(post.contains("phases%5B0%5D%5Bitems%5D%5B0%5D%5Bprice%5D=price_1"));
  assert!(post.contains("metadata%5Bnext_coupon%5D="));
  assert!(!post.contains("omitted"));
  let first_page = stripe_requests.recv().await.unwrap();
  let second_page = stripe_requests.recv().await.unwrap();
  assert!(first_page.contains("customer=cus_1&limit=100"));
  assert!(second_page.contains("starting_after=one"));
  for (status, retryable, uncertain) in [(401, false, false), (429, true, false), (500, true, false)] {
    let error = stripe.get::<serde_json::Value>("v1/failure", &[]).await.unwrap_err();
    assert_eq!(error.status, Some(status));
    assert_eq!(error.retryable, retryable);
    assert_eq!(error.uncertain, uncertain);
  }
  let timeout = stripe.get::<serde_json::Value>("v1/timeout", &[]).await.unwrap_err();
  assert_eq!(timeout.code, "stripe_transport");
  assert!(timeout.retryable);
  let raw_body = br#"{"id":"evt_1","type":"customer.updated","created":1788681600,"api_version":"2025-02-24.acacia","livemode":false,"account":"acct-test","data":{"object":{}}}"#;
  let timestamp = Utc::now();
  let mut signed = timestamp.timestamp().to_string().into_bytes();
  signed.push(b'.');
  signed.extend_from_slice(raw_body);
  let mut mac = <hmac::Hmac<sha2::Sha256> as hmac::digest::KeyInit>::new_from_slice(b"webhook-secret").unwrap();
  hmac::Mac::update(&mut mac, &signed);
  let signature = format!(
    "t={},v1={}",
    timestamp.timestamp(),
    hex::encode(hmac::Mac::finalize(mac).into_bytes())
  );
  stripe.verify_webhook(raw_body, &signature, timestamp).unwrap();
  assert!(
    stripe
      .verify_webhook(raw_body, &signature, timestamp + chrono::Duration::minutes(6))
      .is_err()
  );

  let (revenuecat_endpoint, mut revenuecat_requests) = mock_http(vec![
    response(
      200,
      r#"{"items":[{"id":"one"}],"next_page":"/v2/projects/project/items?cursor=one"}"#,
    ),
    response(200, r#"{"items":[{"id":"two"}],"next_page":null}"#),
    response(401, "{}"),
    response(429, "{}"),
    response(500, "{}"),
    MockResponse {
      status: 200,
      body: "{}".to_string(),
      delay: Duration::from_secs(2),
    },
  ])
  .await;
  let revenuecat_config = RevenueCatRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("revenuecat-secret".to_string())),
    webhook_auth: Arc::new(Zeroizing::new("webhook-auth".to_string())),
    project_id: "project".to_string(),
    production: false,
    product_map: Default::default(),
  };
  let revenuecat = RevenueCatClient::with_endpoint(&revenuecat_config, &revenuecat_endpoint).unwrap();
  let values = revenuecat
    .list_all::<serde_json::Value>("v2/projects/project/items")
    .await
    .unwrap();
  assert_eq!(values, vec![json!({"id": "one"}), json!({"id": "two"})]);
  assert!(revenuecat_requests.recv().await.unwrap().contains("limit=100"));
  assert!(revenuecat_requests.recv().await.unwrap().contains("cursor=one"));
  for (status, retryable) in [(401, false), (429, true), (500, true)] {
    let error = revenuecat
      .list_all::<serde_json::Value>("v2/projects/project/failure")
      .await
      .unwrap_err();
    assert_eq!(error.status, Some(status));
    assert_eq!(error.retryable, retryable);
  }
  let timeout = revenuecat
    .list_all::<serde_json::Value>("v2/projects/project/timeout")
    .await
    .unwrap_err();
  assert_eq!(timeout.code, "revenuecat_transport");
  revenuecat.verify_webhook_auth("webhook-auth").unwrap();
  assert!(revenuecat.verify_webhook_auth("wrong").is_err());

  let (cycle_endpoint, _) = mock_http(vec![
    response(
      200,
      r#"{"items":[],"next_page":"/v2/projects/project/items?cursor=one"}"#,
    ),
    response(
      200,
      r#"{"items":[],"next_page":"/v2/projects/project/items?cursor=one"}"#,
    ),
  ])
  .await;
  assert!(
    RevenueCatClient::with_endpoint(&revenuecat_config, &cycle_endpoint)
      .unwrap()
      .list_all::<serde_json::Value>("v2/projects/project/items")
      .await
      .is_err()
  );
  let (origin_endpoint, _) = mock_http(vec![response(
    200,
    r#"{"items":[],"next_page":"https://attacker.invalid/v2/projects/project/items"}"#,
  )])
  .await;
  assert!(
    RevenueCatClient::with_endpoint(&revenuecat_config, &origin_endpoint)
      .unwrap()
      .list_all::<serde_json::Value>("v2/projects/project/items")
      .await
      .is_err()
  );

  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let source_id = format!("sub-{marker}");
  let user = insert_user(&pool, &marker).await;
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
         external_customer_id,external_subscription_id,metadata)
       VALUES($1,'stripe',$2,$3,'user',$4,'pro','monthly','active',$5,$3,'{}')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&namespace)
  .bind(&source_id)
  .bind(&user)
  .bind(&customer_id)
  .execute(&pool)
  .await
  .unwrap();
  let competing_namespace = ProviderNamespace {
    provider: Provider::RevenueCat,
    environment: ProviderEnvironment::Sandbox,
    account: format!("{marker}-competing"),
  }
  .canonical_key()
  .unwrap();
  let competing_customer = format!("rc-customer-{marker}");
  let competing_source = format!("rc-source-{marker}");
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
         gives_access,external_customer_id,external_subscription_id,external_product_id,iap_store,external_ref,
         period_end,metadata)
       VALUES($1,'revenuecat',$2,$3,'user',$4,'pro','monthly','active',true,$5,$3,'product','app_store',$6,$7,'{}')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&competing_namespace)
  .bind(&competing_source)
  .bind(&user)
  .bind(&competing_customer)
  .bind(format!("store-{competing_source}"))
  .bind(Utc::now() + chrono::Duration::days(30))
  .execute(&pool)
  .await
  .unwrap();
  let customer_scope = PaymentScope::customer(&namespace, &customer_id).unwrap();
  let connection = PaymentConnection::try_acquire(&pool, vec![customer_scope])
    .await
    .unwrap()
    .unwrap();
  let complete = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: Default::default(),
    },
    &customer_id,
    Vec::new(),
  );
  let now = Utc::now().timestamp();
  let refreshed_subscription = json!({
    "id": source_id,
    "created": now - 3600,
    "customer": customer_id,
    "status": "active",
    "cancel_at_period_end": false,
    "current_period_start": now - 3600,
    "current_period_end": now + 86400,
    "trial_start": null,
    "trial_end": null,
    "canceled_at": null,
    "schedule": null,
    "items": { "data": [{
      "id": format!("si-{marker}"),
      "quantity": 1,
      "price": {
        "id": format!("price-{marker}"),
        "active": true,
        "lookup_key": "pro_monthly",
        "unit_amount": 1000,
        "currency": "usd",
        "recurring": { "interval": "month", "interval_count": 1 },
        "product": format!("prod-{marker}")
      }
    }], "has_more": false },
    "metadata": {}
  });
  let (refresh_endpoint, mut refresh_requests) = mock_http(vec![response(
    200,
    &json!({ "data": [refreshed_subscription], "has_more": false }).to_string(),
  )])
  .await;
  let refresh_config = StripeRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("stripe-secret".to_string())),
    webhook_key: Arc::new(Zeroizing::new("webhook-secret".to_string())),
    account_id: marker.clone(),
    live: false,
  };
  let runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: Some(Arc::new(
      StripeClient::with_endpoint(&refresh_config, &refresh_endpoint).unwrap(),
    )),
    revenuecat: None,
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: None,
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  runtime.apply_with_connection(connection, complete).await.unwrap();
  assert!(
    refresh_requests
      .recv()
      .await
      .unwrap()
      .contains(&format!("customer=cus-{marker}"))
  );
  let status: String =
    sqlx::query_scalar("SELECT status FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity=$2")
      .bind(&namespace)
      .bind(&source_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(status, "active");
  cleanup(&pool, &namespace, &marker).await;
  cleanup(&pool, &competing_namespace, &marker).await;
}

#[tokio::test]
async fn operation_intent_is_frozen_before_send_and_blocks_overlapping_work() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let source = PaymentScope::source(&namespace, &format!("sub-{marker}")).unwrap();
  let secondary = PaymentScope::source(&namespace, &format!("sub-{marker}-secondary")).unwrap();
  let third = PaymentScope::source(&namespace, &format!("sub-{marker}-third")).unwrap();
  let mut connection = PaymentConnection::try_acquire(&pool, vec![source.clone(), secondary.clone(), third.clone()])
    .await
    .unwrap()
    .unwrap();
  let intent = OperationIntent {
    namespace: provider_namespace.clone(),
    operation_type: "cancel_subscription".to_string(),
    intent_id: format!("intent-{marker}"),
    resources: vec![source, secondary.clone()],
    target_type: Some("user".to_string()),
    target_id: Some(format!("rfc12-user-{marker}")),
    steps: vec![
      PaymentStepState {
        key: "cancel".to_string(),
        request: PaymentStep::CancelSubscription {
          source_id: format!("sub-{marker}"),
        },
        first_sent_at: None,
        result: None,
      },
      PaymentStepState {
        key: "verify".to_string(),
        request: PaymentStep::VerifySource {
          source_id: format!("sub-{marker}-secondary"),
        },
        first_sent_at: None,
        result: None,
      },
    ],
  };
  let first: FrozenOperation = freeze_operation(&mut connection, &intent).await.unwrap();
  assert_eq!(freeze_operation(&mut connection, &intent).await.unwrap(), first);
  assert!(
    record_operation_step_result(&mut connection, &first.id, "cancel", json!({"ok": true}))
      .await
      .is_err()
  );
  assert!(
    mark_operation_step_sent(&mut connection, &first.id, "verify", chrono::Duration::hours(23))
      .await
      .is_err()
  );
  mark_operation_step_sent(&mut connection, &first.id, "cancel", chrono::Duration::hours(23))
    .await
    .unwrap();
  let sent = freeze_operation(&mut connection, &intent).await.unwrap();
  assert!(sent.steps[0].first_sent_at.is_some());
  record_operation_step_result(&mut connection, &first.id, "cancel", json!({"ok": true}))
    .await
    .unwrap();
  let recorded = freeze_operation(&mut connection, &intent).await.unwrap();
  assert_eq!(recorded.steps[0].result, Some(json!({"ok": true})));
  let changed_request = OperationIntent {
    steps: vec![
      PaymentStepState {
        request: PaymentStep::CancelSubscription {
          source_id: format!("sub-{marker}-changed"),
        },
        ..intent.steps[0].clone()
      },
      intent.steps[1].clone(),
    ],
    ..intent.clone()
  };
  assert!(freeze_operation(&mut connection, &changed_request).await.is_err());
  record_operation_step_result(&mut connection, &first.id, "cancel", json!({"ok": true}))
    .await
    .unwrap();
  assert!(
    record_operation_step_result(&mut connection, &first.id, "cancel", json!({"ok": false}))
      .await
      .is_err()
  );
  mark_operation_step_sent(&mut connection, &first.id, "verify", chrono::Duration::hours(23))
    .await
    .unwrap();
  record_operation_step_result(&mut connection, &first.id, "verify", json!({"ok": true}))
    .await
    .unwrap();
  let overlapping = OperationIntent {
    intent_id: format!("opposite-{marker}"),
    operation_type: "resume_subscription".to_string(),
    resources: vec![secondary, third],
    ..intent.clone()
  };
  assert!(freeze_operation(&mut connection, &overlapping).await.is_err());
  let (attempts, sent, replay_seconds): (i32, bool, i64) = sqlx::query_as(
    "SELECT attempt_count,first_sent_at IS NOT NULL,EXTRACT(EPOCH FROM replay_deadline-first_sent_at)::bigint FROM \
     payment_operations WHERE id=$1",
  )
  .bind(&first.id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!((attempts, sent, replay_seconds), (2, true, 23 * 60 * 60));
  drop(connection);
  cleanup(&pool, &namespace, &marker).await;

  let account_marker = format!("{marker}-account");
  let account_user = insert_user(&pool, &account_marker).await;
  let account_customer = format!("cus-{account_marker}");
  let account_source = format!("sub-{account_marker}");
  let account_ai_source = format!("sub-ai-{account_marker}");
  let account_namespace = ProviderNamespace {
    provider: Provider::Stripe,
    environment: ProviderEnvironment::Test,
    account: account_marker.clone(),
  };
  let account_namespace_key = account_namespace.canonical_key().unwrap();
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
         external_customer_id,external_subscription_id,period_end,metadata)
       VALUES
         ($1,'stripe',$2,$3,'user',$4,'pro','monthly','active',$5,$3,clock_timestamp()+INTERVAL '30 days','{}'),
         ($6,'stripe',$2,$7,'user',$4,'ai','yearly','active',$5,$7,clock_timestamp()+INTERVAL '30 days','{}')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&account_namespace_key)
  .bind(&account_source)
  .bind(&account_user)
  .bind(&account_customer)
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&account_ai_source)
  .execute(&pool)
  .await
  .unwrap();
  let account_body = |source: &str| {
    json!({
      "id": source,
      "created": Utc::now().timestamp(),
      "customer": account_customer,
      "status": "canceled",
      "cancel_at_period_end": false,
      "current_period_start": Utc::now().timestamp(),
      "current_period_end": (Utc::now() + chrono::Duration::days(30)).timestamp(),
      "trial_start": null,
      "trial_end": null,
      "canceled_at": Utc::now().timestamp(),
      "schedule": null,
      "items": { "data": [], "has_more": false },
      "metadata": {}
    })
    .to_string()
  };
  let account_responses = [&account_source, &account_ai_source]
    .into_iter()
    .map(|source| MockResponse {
      status: 200,
      body: account_body(source),
      delay: Duration::ZERO,
    })
    .collect();
  let (account_endpoint, mut account_requests) = mock_http(account_responses).await;
  let account_config = StripeRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("stripe-secret".to_string())),
    webhook_key: Arc::new(Zeroizing::new("webhook-secret".to_string())),
    account_id: account_marker.clone(),
    live: false,
  };
  let account_runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: Some(Arc::new(
      StripeClient::with_endpoint(&account_config, &account_endpoint).unwrap(),
    )),
    revenuecat: None,
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: None,
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  assert_eq!(
    account_runtime
      .execute(json!({ "action": "prepare_user_deletion", "userId": account_user }))
      .await
      .unwrap()
      .value,
    json!({ "prepared": 2 })
  );
  let frozen_steps: serde_json::Value = sqlx::query_scalar(
    "SELECT steps FROM payment_operations WHERE provider_namespace=$1 AND operation_type='account_delete_cancel'",
  )
  .bind(&account_namespace_key)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(frozen_steps.as_array().unwrap().len(), 2);
  for source in [&account_source, &account_ai_source] {
    assert!(frozen_steps.as_array().unwrap().iter().any(|step| {
      step["request"]["path"] == format!("v1/subscriptions/{}", super::stripe_client::encode_segment(source))
    }));
  }
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(&account_user)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    super::command::recover_one_stripe_operation(&account_runtime)
      .await
      .unwrap()
      .is_some()
  );
  let operation_status: String = sqlx::query_scalar(
    "SELECT status FROM payment_operations WHERE provider_namespace=$1 AND operation_type='account_delete_cancel'",
  )
  .bind(&account_namespace_key)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(operation_status, "completed");
  let account_requests = [
    account_requests.recv().await.unwrap(),
    account_requests.recv().await.unwrap(),
  ];
  for source in [&account_source, &account_ai_source] {
    assert!(account_requests.iter().any(|request| request.starts_with(&format!(
      "DELETE /v1/subscriptions/{} HTTP/1.1",
      super::stripe_client::encode_segment(source)
    ))));
  }

  let catalog_price = |lookup_key: &str, amount: i64, interval: Option<&str>| {
    json!({
      "id": format!("price-{lookup_key}"),
      "active": true,
      "lookup_key": lookup_key,
      "unit_amount": amount,
      "currency": "usd",
      "recurring": interval.map(|interval| json!({ "interval": interval, "interval_count": 1 })),
      "product": "product-test"
    })
  };
  let mut existing_catalog = vec![
    catalog_price("pro_yearly", 8100, Some("year")),
    catalog_price("pro_lifetime", 49900, None),
    catalog_price("ai_yearly", 10680, Some("year")),
    catalog_price("team_monthly", 1200, Some("month")),
    catalog_price("team_yearly", 12000, Some("year")),
    catalog_price("selfhostedteam_monthly", 1200, Some("month")),
    catalog_price("selfhostedteam_yearly", 12000, Some("year")),
  ];
  let created_price = catalog_price("pro_monthly", 799, Some("month"));
  let first_catalog_page = json!({ "data": existing_catalog, "has_more": false }).to_string();
  existing_catalog.push(created_price.clone());
  let complete_catalog_page = json!({ "data": existing_catalog, "has_more": false }).to_string();
  let (catalog_endpoint, mut catalog_requests) = mock_http(vec![
    MockResponse {
      status: 200,
      body: first_catalog_page,
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: created_price.to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: complete_catalog_page,
      delay: Duration::ZERO,
    },
  ])
  .await;
  let catalog_runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: Some(Arc::new(
      StripeClient::with_endpoint(&account_config, &catalog_endpoint).unwrap(),
    )),
    revenuecat: None,
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: None,
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  let provisioned = catalog_runtime
    .execute(json!({ "action": "provision_stripe_catalog" }))
    .await
    .unwrap()
    .value;
  assert_eq!(
    provisioned
      .get("prices")
      .and_then(serde_json::Value::as_array)
      .unwrap()
      .iter()
      .filter(|price| price.get("created") == Some(&json!(true)))
      .count(),
    1
  );
  let list_request = catalog_requests.recv().await.unwrap();
  assert!(list_request.starts_with("GET /v1/prices?"));
  let create_request = catalog_requests.recv().await.unwrap();
  assert!(create_request.starts_with("POST /v1/prices HTTP/1.1"));
  assert!(create_request.contains("lookup_key=pro_monthly"));
  assert!(create_request.contains("recurring%5Binterval%5D=month"));
  assert!(create_request.contains("product_data%5Bname%5D=AFFiNE+Pro"));
  let replayed = catalog_runtime
    .execute(json!({ "action": "provision_stripe_catalog" }))
    .await
    .unwrap()
    .value;
  assert!(
    replayed
      .get("prices")
      .and_then(serde_json::Value::as_array)
      .unwrap()
      .iter()
      .all(|price| price.get("created") == Some(&json!(false)))
  );
  assert!(catalog_requests.recv().await.unwrap().starts_with("GET /v1/prices?"));
  cleanup(&pool, &account_namespace_key, &account_marker).await;
}

#[tokio::test]
async fn snapshot_commit_is_atomic_and_transfer_moves_the_entitlement() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let source_id = format!("sub-{marker}");
  let user_a = insert_user(&pool, &marker).await;
  let user_b = insert_user(&pool, &format!("{marker}-b")).await;
  let source_scope = PaymentScope::source(&namespace, &source_id).unwrap();
  let other_source_id = format!("sub-{marker}-other");
  let other_source_scope = PaymentScope::source(&namespace, &other_source_id).unwrap();
  let customer_scope = PaymentScope::customer(&namespace, &customer_id).unwrap();
  let event_id = format!("event-{marker}");
  let lock_scopes = vec![
    customer_scope.clone(),
    source_scope.clone(),
    other_source_scope,
    PaymentScope::receipt(&namespace, &event_id).unwrap(),
    PaymentScope::cloud_target("user", &user_a, Plan::Pro).unwrap(),
    PaymentScope::cloud_target("user", &user_b, Plan::Pro).unwrap(),
    PaymentScope::cloud_target("user", &user_a, Plan::Ai).unwrap(),
  ];
  let mut connection = PaymentConnection::try_acquire(&pool, lock_scopes.clone())
    .await
    .unwrap()
    .unwrap();
  let first_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
    .fetch_one(connection.connection())
    .await
    .unwrap();
  let operation = OperationIntent {
    namespace: provider_namespace.clone(),
    operation_type: "sync_subscription".to_string(),
    intent_id: format!("intent-{marker}"),
    resources: vec![source_scope.clone()],
    target_type: Some("user".to_string()),
    target_id: Some(user_a.clone()),
    steps: vec![PaymentStepState {
      key: "verify".to_string(),
      request: PaymentStep::VerifySource {
        source_id: source_id.clone(),
      },
      first_sent_at: None,
      result: None,
    }],
  };
  let operation = freeze_operation(&mut connection, &operation).await.unwrap();
  mark_operation_step_sent(&mut connection, &operation.id, "verify", chrono::Duration::hours(23))
    .await
    .unwrap();
  record_operation_step_result(&mut connection, &operation.id, "verify", json!({"verified": true}))
    .await
    .unwrap();
  let webhook_config = StripeRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("stripe-secret".to_string())),
    webhook_key: Arc::new(Zeroizing::new("webhook-secret".to_string())),
    account_id: marker.clone(),
    live: false,
  };
  let webhook_client = Arc::new(StripeClient::with_endpoint(&webhook_config, "http://127.0.0.1:1/").unwrap());
  let webhook_runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: Some(Arc::clone(&webhook_client)),
    revenuecat: None,
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: None,
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  let raw_event = json!({
    "id": event_id,
    "type": "customer.updated",
    "created": Utc::now().timestamp(),
    "api_version": super::stripe_client::STRIPE_API_VERSION,
    "livemode": false,
    "account": marker,
    "data": { "object": { "object": "customer", "id": customer_id } }
  })
  .to_string();
  let timestamp = Utc::now().timestamp();
  let mut signed = format!("{timestamp}.").into_bytes();
  signed.extend_from_slice(raw_event.as_bytes());
  let mut signature = <hmac::Hmac<sha2::Sha256> as hmac::KeyInit>::new_from_slice(b"webhook-secret").unwrap();
  hmac::Mac::update(&mut signature, &signed);
  let signature = format!(
    "t={timestamp},v1={}",
    hex::encode(hmac::Mac::finalize(signature).into_bytes())
  );
  let first_receipt = super::webhook::capture_stripe(&pool, &webhook_client, raw_event.as_bytes(), &signature)
    .await
    .unwrap();
  let duplicate_receipt = super::webhook::capture_stripe(&pool, &webhook_client, raw_event.as_bytes(), &signature)
    .await
    .unwrap();
  assert_eq!(first_receipt, duplicate_receipt);
  assert!(super::worker::claim_receipt(&webhook_runtime).await.unwrap().is_some());
  sqlx::query(
    "UPDATE payment_events SET processing_status='failed',next_attempt_at=clock_timestamp()-INTERVAL '1 second' WHERE \
     provider_namespace=$1 AND external_event_id=$2",
  )
  .bind(&namespace)
  .bind(&event_id)
  .execute(&pool)
  .await
  .unwrap();
  assert!(super::worker::claim_receipt(&webhook_runtime).await.unwrap().is_some());
  let receipt_attempts: i32 = sqlx::query_scalar(
    "SELECT processing_attempts FROM payment_events WHERE provider_namespace=$1 AND external_event_id=$2",
  )
  .bind(&namespace)
  .bind(&event_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(receipt_attempts, 2);
  let mut first = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&user_a, &customer_id, &source_id)],
  );
  first.trials.push(TrialSnapshot {
    target_type: "user".to_string(),
    target_id: user_a.clone(),
    plan: Plan::Ai,
    external_ref: Some(source_id.clone()),
    metadata: json!({}),
  });
  first.financial_facts.push(FinancialSnapshot {
    fact: FinancialFact {
      kind: FinancialKind::Refund,
      status: FinancialStatus::Pending,
    },
    external_id: format!("refund-{marker}"),
    source_id: Some(source_id.clone()),
    external_invoice_id: Some(format!("invoice-{marker}")),
    external_payment_id: None,
    amount: Some(1000),
    currency: Some("USD".to_string()),
    occurred_at: Some(Utc::now()),
    metadata: json!({}),
  });
  first.invoices.push(InvoiceSnapshot {
    external_id: format!("invoice-{marker}"),
    target_id: user_a.clone(),
    currency: "USD".to_string(),
    amount: 1000,
    status: "paid".to_string(),
    reason: None,
    last_payment_error: None,
    link: None,
  });
  first.licenses.push(LicenseSnapshot {
    key: format!("rfc12-{marker}-license"),
    workspace_id: None,
    revealed_at: None,
    validate_key: Some("validate".to_string()),
  });
  first.mails.push(MailSnapshot {
    mail_name: "PaymentSuccess".to_string(),
    mail_class: "payment".to_string(),
    dedupe_key: format!("rfc12-{marker}-mail"),
    recipient_email: format!("rfc12-{marker}@example.invalid"),
    recipient_user_id: Some(user_a.clone()),
    workspace_id: None,
    payload: json!({"source": source_id}),
  });
  first.captured_event_ids.push(event_id.clone());
  first.operation = Some(OperationCompletion {
    operation_id: operation.id.clone(),
    result: json!({"source": source_id}),
  });
  let replay = first.clone();
  let applied: PaymentApplyResult = apply_payment_snapshot(&mut connection, first, Deployment::Cloud)
    .await
    .unwrap();
  assert_eq!(applied.targets.len(), 1);
  assert!(applied.owner_ids.is_empty());
  drop(connection);
  let processed_receipt = super::webhook::capture_stripe(&pool, &webhook_client, raw_event.as_bytes(), &signature)
    .await
    .unwrap();
  assert_eq!(processed_receipt.get("status"), Some(&json!("processed")));
  assert!(super::worker::claim_receipt(&webhook_runtime).await.unwrap().is_none());
  let mut connection = PaymentConnection::try_acquire(&pool, lock_scopes)
    .await
    .unwrap()
    .unwrap();
  let replay_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
    .fetch_one(connection.connection())
    .await
    .unwrap();
  assert_ne!(first_pid, replay_pid);
  apply_payment_snapshot(&mut connection, replay.clone(), Deployment::Cloud)
    .await
    .unwrap();
  let mut conflicting_replay = replay;
  conflicting_replay.operation.as_mut().unwrap().result = json!({"source": source_id, "changed": true});
  let conflicting_replay = match apply_payment_snapshot(&mut connection, conflicting_replay, Deployment::Cloud).await {
    Ok(_) => panic!("conflicting completed operation result was accepted"),
    Err(error) => error,
  };
  assert!(
    conflicting_replay
      .to_string()
      .contains("operation completion does not match")
  );
  let state: (String, String, String, i64, i64, i64, i64, i64) = sqlx::query_as(
    r#"SELECT
      (SELECT target_id FROM provider_subscriptions WHERE provider_namespace=$1),
      (SELECT status FROM entitlements WHERE subject_id LIKE $2),
      (SELECT processing_status FROM payment_events WHERE provider_namespace=$1),
      (SELECT count(*) FROM subscription_trial_usages WHERE target_id=$3),
      (SELECT count(*) FROM invoices WHERE provider_namespace=$1),
      (SELECT count(*) FROM licenses WHERE key LIKE $4),
      (SELECT count(*) FROM mail_deliveries WHERE dedupe_key LIKE $4),
      (SELECT count(*) FROM payment_operations WHERE provider_namespace=$1 AND status='completed')"#,
  )
  .bind(&namespace)
  .bind(format!("{namespace}%"))
  .bind(&user_a)
  .bind(format!("rfc12-{marker}%"))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(
    (state.0, state.1, state.2),
    (user_a.clone(), "active".into(), "processed".into())
  );
  assert_eq!((state.3, state.4, state.5, state.6, state.7), (1, 1, 1, 1, 1));

  let poison_event = format!("evt-{marker}-poison");
  let healthy_event = format!("evt-{marker}-healthy");
  for (event_id, created_at) in [
    (&poison_event, Utc::now() - chrono::Duration::seconds(1)),
    (&healthy_event, Utc::now()),
  ] {
    sqlx::query(
      r#"INSERT INTO payment_events(
           id,provider,provider_namespace,event_type,external_event_id,occurred_at,metadata,created_at,updated_at)
         VALUES($1,'stripe',$2,'unsupported.event',$3,$4,'{}',$4,$4)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&namespace)
    .bind(event_id)
    .bind(created_at)
    .execute(&pool)
    .await
    .unwrap();
  }
  assert!(super::worker::claim_receipt(&webhook_runtime).await.unwrap().is_some());
  sqlx::query("UPDATE payment_events SET processing_attempts=5 WHERE provider_namespace=$1 AND external_event_id=$2")
    .bind(&namespace)
    .bind(&poison_event)
    .execute(&pool)
    .await
    .unwrap();
  super::worker::fail_receipt(
    &webhook_runtime,
    &poison_event,
    &namespace,
    &crate::runtime::RuntimeError::invalid_state("unsupported payment event"),
  )
  .await;
  assert!(super::worker::claim_receipt(&webhook_runtime).await.unwrap().is_some());
  let receipt_states: (String, String) = sqlx::query_as(
    "SELECT (SELECT processing_status FROM payment_events WHERE provider_namespace=$1 AND \
     external_event_id=$2),(SELECT processing_status FROM payment_events WHERE provider_namespace=$1 AND \
     external_event_id=$3)",
  )
  .bind(&namespace)
  .bind(&poison_event)
  .bind(&healthy_event)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(receipt_states, ("blocked".to_string(), "processing".to_string()));

  let dispute_time = Utc::now();
  let financial_snapshot = |status, occurred_at| {
    let mut next = snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![subscription(&user_a, &customer_id, &source_id)],
    );
    next.financial_facts.push(FinancialSnapshot {
      fact: FinancialFact {
        kind: FinancialKind::Dispute,
        status,
      },
      external_id: format!("dispute-{marker}"),
      source_id: Some(source_id.clone()),
      external_invoice_id: None,
      external_payment_id: None,
      amount: Some(1000),
      currency: Some("USD".to_string()),
      occurred_at: Some(occurred_at),
      metadata: json!({}),
    });
    next
  };
  apply_payment_snapshot(
    &mut connection,
    financial_snapshot(FinancialStatus::Open, dispute_time),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let restricted: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id LIKE $1")
    .bind(format!("{namespace}%"))
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(restricted, "expired");
  apply_payment_snapshot(
    &mut connection,
    financial_snapshot(FinancialStatus::Won, dispute_time + chrono::Duration::seconds(2)),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  apply_payment_snapshot(
    &mut connection,
    financial_snapshot(FinancialStatus::Open, dispute_time + chrono::Duration::seconds(1)),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let cleared: (String, String) = sqlx::query_as(
    "SELECT (SELECT status FROM entitlements WHERE subject_id LIKE $1),(SELECT status FROM payment_financial_facts \
     WHERE provider_namespace=$2 AND external_id=$3)",
  )
  .bind(format!("{namespace}%"))
  .bind(&namespace)
  .bind(format!("dispute-{marker}"))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(cleared, ("active".to_string(), "won".to_string()));
  let equal_time_regression = apply_payment_snapshot(
    &mut connection,
    financial_snapshot(FinancialStatus::Open, dispute_time + chrono::Duration::seconds(2)),
    Deployment::Cloud,
  )
  .await
  .unwrap_err();
  assert!(equal_time_regression.to_string().contains("equal timestamp"));

  let financial_identity_snapshot = |financial_source: Option<String>, occurred_at| {
    let mut next = snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![subscription(&user_a, &customer_id, &source_id)],
    );
    next.financial_facts.push(FinancialSnapshot {
      fact: FinancialFact {
        kind: FinancialKind::Dispute,
        status: FinancialStatus::Won,
      },
      external_id: format!("dispute-{marker}"),
      source_id: financial_source,
      external_invoice_id: None,
      external_payment_id: None,
      amount: Some(1000),
      currency: Some("USD".to_string()),
      occurred_at: Some(occurred_at),
      metadata: json!({}),
    });
    next
  };
  apply_payment_snapshot(
    &mut connection,
    financial_identity_snapshot(None, dispute_time + chrono::Duration::seconds(3)),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let conflicting_financial_source = match apply_payment_snapshot(
    &mut connection,
    financial_identity_snapshot(Some(other_source_id), dispute_time + chrono::Duration::seconds(4)),
    Deployment::Cloud,
  )
  .await
  {
    Ok(_) => panic!("financial fact source identity was reassigned"),
    Err(error) => error,
  };
  assert!(
    conflicting_financial_source
      .to_string()
      .contains("conflicting payment financial source identity")
  );
  let financial_source: String = sqlx::query_scalar(
    "SELECT source_identity FROM payment_financial_facts WHERE provider_namespace=$1 AND object_kind='dispute' AND \
     external_id=$2",
  )
  .bind(&namespace)
  .bind(format!("dispute-{marker}"))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(financial_source, source_id);

  let refund_time = dispute_time + chrono::Duration::seconds(5);
  let refund_snapshot = |status| {
    let mut next = snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![subscription(&user_a, &customer_id, &source_id)],
    );
    next.financial_facts.push(FinancialSnapshot {
      fact: FinancialFact {
        kind: FinancialKind::Refund,
        status,
      },
      external_id: format!("equal-refund-{marker}"),
      source_id: Some(source_id.clone()),
      external_invoice_id: None,
      external_payment_id: None,
      amount: Some(1000),
      currency: Some("USD".to_string()),
      occurred_at: Some(refund_time),
      metadata: json!({}),
    });
    next
  };
  apply_payment_snapshot(
    &mut connection,
    refund_snapshot(FinancialStatus::Succeeded),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  assert!(
    apply_payment_snapshot(
      &mut connection,
      refund_snapshot(FinancialStatus::Failed),
      Deployment::Cloud,
    )
    .await
    .unwrap_err()
    .to_string()
    .contains("equal timestamp")
  );

  let transferred = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&user_b, &customer_id, &source_id)],
  );
  let transfer_error = apply_payment_snapshot(&mut connection, transferred, Deployment::Cloud)
    .await
    .unwrap_err();
  assert!(transfer_error.to_string().contains("ownership transfer evidence"));
  let targets: (String, String) = sqlx::query_as(
    "SELECT (SELECT target_id FROM provider_subscriptions WHERE provider_namespace=$1),(SELECT target_id FROM \
     entitlements WHERE subject_id LIKE $2)",
  )
  .bind(&namespace)
  .bind(format!("{namespace}%"))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(targets, (user_a.clone(), user_a.clone()));
  drop(connection);

  let mut incomplete_lock_set = PaymentConnection::try_acquire(&pool, vec![customer_scope.clone()])
    .await
    .unwrap()
    .unwrap();
  let complete = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: Default::default(),
    },
    &customer_id,
    Vec::new(),
  );
  assert!(
    apply_payment_snapshot(&mut incomplete_lock_set, complete, Deployment::Cloud)
      .await
      .is_err()
  );
  drop(incomplete_lock_set);
  let mut complete_lock_set = PaymentConnection::try_acquire(
    &pool,
    vec![
      customer_scope,
      source_scope,
      PaymentScope::cloud_target("user", &user_a, Plan::Pro).unwrap(),
    ],
  )
  .await
  .unwrap()
  .unwrap();
  apply_payment_snapshot(
    &mut complete_lock_set,
    snapshot(
      provider_namespace,
      SnapshotCoverage::Complete {
        verified_missing_revenuecat_sources: Default::default(),
      },
      &customer_id,
      Vec::new(),
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id LIKE $1")
    .bind(format!("{namespace}%"))
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(status, "revoked");
  drop(complete_lock_set);

  let now = Utc::now().timestamp();
  let stripe_subscription = json!({
    "id": source_id,
    "created": now - 3600,
    "customer": customer_id,
    "status": "active",
    "cancel_at_period_end": false,
    "current_period_start": now - 3600,
    "current_period_end": now + 86400,
    "trial_start": null,
    "trial_end": null,
    "canceled_at": null,
    "schedule": null,
    "items": {
      "data": [{
        "id": format!("si-{marker}"),
        "quantity": 1,
        "price": {
          "id": format!("price-{marker}"),
          "active": true,
          "lookup_key": "pro_monthly",
          "unit_amount": 1000,
          "currency": "usd",
          "recurring": { "interval": "month", "interval_count": 1 },
          "product": format!("prod-{marker}")
        }
      }],
      "has_more": false
    },
    "metadata": {}
  });
  let invoice_id = format!("open-invoice-{marker}");
  let stripe_invoice = json!({
    "id": invoice_id,
    "customer": customer_id,
    "status": "open",
    "currency": "usd",
    "total": 1000,
    "billing_reason": "subscription_cycle",
    "hosted_invoice_url": null,
    "created": now,
    "lines": { "data": [], "has_more": false },
    "parent": null,
    "subscription": source_id,
    "payment_intent": null,
    "last_finalization_error": null,
    "status_transitions": { "finalized_at": now }
  });
  let (reconcile_endpoint, mut reconcile_requests) = mock_http(vec![
    MockResponse {
      status: 200,
      body: json!({ "data": [stripe_subscription.clone()], "has_more": false }).to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: json!({ "data": [stripe_subscription.clone()], "has_more": false }).to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: stripe_invoice.to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: stripe_subscription.to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: stripe_invoice.to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: stripe_subscription.to_string(),
      delay: Duration::ZERO,
    },
  ])
  .await;
  let reconcile_config = StripeRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("stripe-secret".to_string())),
    webhook_key: Arc::new(Zeroizing::new("webhook-secret".to_string())),
    account_id: marker.clone(),
    live: false,
  };
  let reconcile_runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: Some(Arc::new(
      StripeClient::with_endpoint(&reconcile_config, &reconcile_endpoint).unwrap(),
    )),
    revenuecat: None,
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: None,
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  assert!(
    super::reconcile::reconcile_one_source(&reconcile_runtime)
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    super::reconcile::reconcile_one_source(&reconcile_runtime)
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    super::reconcile::reconcile_one_source(&reconcile_runtime)
      .await
      .unwrap()
      .is_none()
  );
  sqlx::query(
    "UPDATE payment_financial_facts SET status='succeeded' WHERE provider_namespace=$1 AND object_kind='refund' AND \
     status='pending'",
  )
  .bind(&namespace)
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    r#"INSERT INTO payment_financial_facts(
         id,provider,provider_namespace,object_kind,external_id,source_identity,status,occurred_at,metadata)
       VALUES($1,'stripe',$2,'invoice',$3,$4,'open',clock_timestamp(),'{}')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&namespace)
  .bind(&invoice_id)
  .bind(&source_id)
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    super::financial_reconcile::reconcile_one_financial(&reconcile_runtime)
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    super::financial_reconcile::reconcile_one_financial(&reconcile_runtime)
      .await
      .unwrap()
      .is_some()
  );
  assert!(
    super::financial_reconcile::reconcile_one_financial(&reconcile_runtime)
      .await
      .unwrap()
      .is_none()
  );
  let reconcile_operations: Vec<(String, i64)> = sqlx::query_as(
    "SELECT operation_type,count(*) FROM payment_operations WHERE provider_namespace=$1 AND operation_type LIKE \
     'reconcile_%' GROUP BY operation_type ORDER BY operation_type",
  )
  .bind(&namespace)
  .fetch_all(&pool)
  .await
  .unwrap();
  assert_eq!(
    reconcile_operations,
    vec![
      ("reconcile_financial".to_string(), 2),
      ("reconcile_source".to_string(), 2)
    ]
  );
  let cursor_generations: Vec<i64> = sqlx::query_scalar(
    "SELECT (payload->>'generation')::bigint FROM runtime_states WHERE purpose LIKE 'payment_reconcile_cursor:%' AND \
     lookup_key=$1 ORDER BY purpose",
  )
  .bind(&namespace)
  .fetch_all(&pool)
  .await
  .unwrap();
  assert_eq!(cursor_generations, vec![1, 1]);
  let requests = (0..6)
    .map(|_| reconcile_requests.try_recv().unwrap())
    .collect::<Vec<_>>();
  assert_eq!(
    requests
      .iter()
      .filter(|request| request.starts_with("GET /v1/subscriptions?"))
      .count(),
    2
  );
  assert_eq!(
    requests
      .iter()
      .filter(|request| request.starts_with(&format!("GET /v1/invoices/{invoice_id}?")))
      .count(),
    2
  );
  assert_eq!(
    requests
      .iter()
      .filter(|request| request.starts_with(&format!("GET /v1/subscriptions/{source_id}?")))
      .count(),
    2
  );
  let stale_namespace = ProviderNamespace {
    provider: Provider::Stripe,
    environment: ProviderEnvironment::Test,
    account: format!("{marker}-previous"),
  }
  .canonical_key()
  .unwrap();
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
         external_customer_id,external_subscription_id,period_end,metadata,updated_at)
       VALUES($1,'stripe',$2,$3,'user',$4,'pro','lifetime','active',$5,$3,
              clock_timestamp()+INTERVAL '30 days','{}',clock_timestamp()+INTERVAL '1 minute')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&stale_namespace)
  .bind(format!("stale-{source_id}"))
  .bind(&user_a)
  .bind(format!("stale-{customer_id}"))
  .execute(&pool)
  .await
  .unwrap();
  let namespace_selection = match reconcile_runtime
    .execute(json!({
      "action": "mutate_subscription",
      "actorUserId": user_a,
      "targetType": "user",
      "targetId": user_a,
      "plan": "pro",
      "mutation": "invalid",
      "intentId": uuid::Uuid::new_v4().to_string(),
    }))
    .await
  {
    Ok(_) => panic!("subscription mutation selected the stale provider namespace"),
    Err(error) => error,
  };
  assert!(
    namespace_selection
      .to_string()
      .contains("unknown payment subscription mutation")
  );
  sqlx::query(
    "UPDATE provider_subscriptions SET recurring='lifetime' WHERE provider_namespace=$1 AND source_identity=$2",
  )
  .bind(&namespace)
  .bind(&source_id)
  .execute(&pool)
  .await
  .unwrap();
  let lifetime_mutation = match reconcile_runtime
    .execute(json!({
      "action": "mutate_subscription",
      "actorUserId": user_a,
      "targetType": "user",
      "targetId": user_a,
      "plan": "pro",
      "mutation": "cancel",
      "intentId": uuid::Uuid::new_v4().to_string(),
    }))
    .await
  {
    Ok(_) => panic!("lifetime subscription mutation was accepted"),
    Err(error) => error,
  };
  assert!(
    lifetime_mutation
      .to_string()
      .contains("cant_update_onetime_subscription")
  );
  cleanup(&pool, &stale_namespace, &marker).await;
  cleanup(&pool, &namespace, &marker).await;

  let license_marker = format!("{marker}-license");
  let license_namespace = ProviderNamespace {
    provider: Provider::Stripe,
    environment: ProviderEnvironment::Test,
    account: license_marker.clone(),
  };
  let license_namespace_key = license_namespace.canonical_key().unwrap();
  let license_config = StripeRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("stripe-secret".to_string())),
    webhook_key: Arc::new(Zeroizing::new("webhook-secret".to_string())),
    account_id: license_marker.clone(),
    live: false,
  };
  let (portal_endpoint, mut portal_requests) = mock_http(
    (0..3)
      .map(|_| MockResponse {
        status: 200,
        body: r#"{"id":"bps_license","url":"https://billing.example/renew"}"#.into(),
        delay: Duration::ZERO,
      })
      .collect(),
  )
  .await;
  let license_runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: Some(Arc::new(
      StripeClient::with_endpoint(&license_config, &portal_endpoint).unwrap(),
    )),
    revenuecat: None,
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: None,
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  let previous_private_key = std::env::var_os("AFFINE_PRO_LICENSE_PRIVATE_KEY");
  unsafe {
    std::env::set_var(
      "AFFINE_PRO_LICENSE_PRIVATE_KEY",
      crate::entitlement::tests::TEST_PRIVATE_KEY,
    );
  }
  for legacy in [true, false] {
    let license_key = format!("rfc12-{license_marker}-{legacy}");
    let license_source = format!("sub-{license_marker}-{legacy}");
    let license_customer = format!("cus-{license_marker}-{legacy}");
    sqlx::query("INSERT INTO licenses(key) VALUES($1)")
      .bind(&license_key)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO provider_subscriptions(
           id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
           quantity,external_customer_id,external_subscription_id,period_end,metadata)
         VALUES($1,'stripe',$2,$3,'instance',$4,'selfhost_team','yearly','active',5,$5,$3,
                clock_timestamp()+INTERVAL '30 days','{}')"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&license_namespace_key)
    .bind(&license_source)
    .bind(&license_key)
    .bind(&license_customer)
    .execute(&pool)
    .await
    .unwrap();
    let operation_id = uuid::Uuid::new_v4().to_string();
    let activated = license_runtime.execute(if legacy {
      json!({"action":"activate_legacy_license","licenseKey":license_key})
    } else {
      json!({"action":"activate_license","licenseKey":license_key,"workspaceId":"remote-workspace","operationId":operation_id})
    }).await.unwrap().value;
    let generation = activated["validateKey"].as_str().unwrap().to_string();
    if legacy {
      assert_eq!(activated["license"]["plan"], "selfhostedteam");
      assert_eq!(activated["license"]["quantity"], 5);
      assert!(activated["license"]["endAt"].as_i64().unwrap() > Utc::now().timestamp_millis());
      for _ in 0..2 {
        let health = license_runtime
          .execute(json!({
            "action":"check_legacy_license_health","licenseKey":license_key,"validateKey":generation,
          }))
          .await
          .unwrap()
          .value;
        assert_eq!(health["validateKey"], generation);
      }
      assert_eq!(
        license_runtime
          .license_customer_portal_url(&license_key, None)
          .await
          .unwrap(),
        "https://billing.example/renew"
      );
      assert!(portal_requests.recv().await.unwrap().contains(&license_customer));
      assert!(license_runtime.execute(json!({
        "action":"activate_license","licenseKey":license_key,"workspaceId":"remote-workspace","operationId":operation_id,
      })).await.is_err());
      assert!(license_runtime.execute(json!({
        "action":"check_license_health","licenseKey":license_key,"validateKey":operation_id,"workspaceId":"remote-workspace",
      })).await.is_err());
      let unbound: Option<String> = sqlx::query_scalar("SELECT workspace_id FROM licenses WHERE key=$1")
        .bind(&license_key)
        .fetch_one(&pool)
        .await
        .unwrap();
      assert!(unbound.is_none());
      let upgrade_lock = PaymentConnection::try_acquire(
        &pool,
        vec![PaymentScope::billing_target(&license_namespace_key, "instance", &license_key).unwrap()],
      )
      .await
      .unwrap()
      .unwrap();
      for command in [
        json!({"action":"check_license_health","licenseKey":license_key,"validateKey":generation,"workspaceId":"remote-workspace"}),
        json!({"action":"update_quantity","targetType":"instance","targetId":license_key,"plan":"selfhost_team","quantity":5,"intentId":uuid::Uuid::new_v4().to_string()}),
      ] {
        assert_eq!(
          license_runtime.execute(command).await.err().unwrap().to_string(),
          "payment_busy"
        );
      }
      drop(upgrade_lock);
      let constraint = format!("license_upgrade_{}", uuid::Uuid::new_v4().simple());
      sqlx::query(&format!(
        "ALTER TABLE licenses ADD CONSTRAINT {constraint} CHECK (key <> '{license_key}' OR workspace_id IS NULL) NOT \
         VALID"
      ))
      .execute(&pool)
      .await
      .unwrap();
      let failed = license_runtime.execute(json!({
        "action":"check_license_health","licenseKey":license_key,"validateKey":generation,"workspaceId":"remote-workspace",
      })).await;
      sqlx::query(&format!("ALTER TABLE licenses DROP CONSTRAINT {constraint}"))
        .execute(&pool)
        .await
        .unwrap();
      assert!(failed.is_err());
      let binding: (Option<String>, Option<String>) =
        sqlx::query_as("SELECT workspace_id,validate_key FROM licenses WHERE key=$1")
          .bind(&license_key)
          .fetch_one(&pool)
          .await
          .unwrap();
      assert_eq!(binding, (None, Some(generation.clone())));
    } else {
      assert_eq!(generation, operation_id);
    }
    for _ in 0..2 {
      let health = license_runtime.execute(json!({
        "action":"check_license_health","licenseKey":license_key,"validateKey":generation,"workspaceId":"remote-workspace",
      })).await.unwrap().value;
      assert_eq!(health["validateKey"], generation);
      assert!(health["license"].as_str().is_some_and(|value| !value.is_empty()));
    }
    let binding: (Option<String>, Option<String>) =
      sqlx::query_as("SELECT workspace_id,validate_key FROM licenses WHERE key=$1")
        .bind(&license_key)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(binding, (Some("remote-workspace".into()), Some(generation.clone())));
    for command in [
      json!({"action":"deactivate_legacy_license","licenseKey":license_key}),
      json!({"action":"check_legacy_license_health","licenseKey":license_key,"validateKey":generation}),
      json!({"action":"check_license_health","licenseKey":license_key,"validateKey":generation,"workspaceId":"other-workspace"}),
      json!({"action":"update_quantity","targetType":"instance","targetId":license_key,"plan":"selfhost_team","quantity":5,"intentId":uuid::Uuid::new_v4().to_string()}),
      json!({"action":"update_recurring","targetType":"instance","targetId":license_key,"plan":"selfhost_team","recurring":"monthly","intentId":uuid::Uuid::new_v4().to_string()}),
      json!({"action":"deactivate_license","licenseKey":license_key,"validateKey":uuid::Uuid::new_v4().to_string()}),
    ] {
      assert!(license_runtime.execute(command).await.is_err());
    }
    assert!(
      license_runtime
        .license_customer_portal_url(&license_key, None)
        .await
        .is_err()
    );
    sqlx::query(
      "UPDATE provider_subscriptions SET period_end=clock_timestamp()-INTERVAL '1 day' WHERE source_identity=$1",
    )
    .bind(&license_source)
    .execute(&pool)
    .await
    .unwrap();
    let expired = license_runtime.execute(json!({
      "action":"check_license_health","licenseKey":license_key,"validateKey":generation,"workspaceId":"remote-workspace",
    })).await.err().unwrap();
    assert_eq!(expired.to_string(), "license_expired");
    assert_eq!(
      license_runtime
        .license_customer_portal_url(&license_key, Some(&generation))
        .await
        .unwrap(),
      "https://billing.example/renew"
    );
    assert!(portal_requests.recv().await.unwrap().contains(&license_customer));
    sqlx::query(
      "UPDATE provider_subscriptions SET period_end=clock_timestamp()+INTERVAL '30 days' WHERE source_identity=$1",
    )
    .bind(&license_source)
    .execute(&pool)
    .await
    .unwrap();
    let renewed = license_runtime.execute(json!({
      "action":"check_license_health","licenseKey":license_key,"validateKey":generation,"workspaceId":"remote-workspace",
    })).await.unwrap().value;
    assert_eq!(renewed["validateKey"], generation);
    assert_eq!(
      license_runtime
        .execute(json!({
          "action":"deactivate_license","licenseKey":license_key,"validateKey":generation,
        }))
        .await
        .unwrap()
        .value,
      json!({"status":"deactivated"})
    );
    let new_generation = uuid::Uuid::new_v4().to_string();
    license_runtime
      .execute(json!({
        "action":"activate_license","licenseKey":license_key,"workspaceId":"new-workspace","operationId":new_generation,
      }))
      .await
      .unwrap();
    assert!(
      license_runtime
        .execute(json!({
          "action":"deactivate_license","licenseKey":license_key,"validateKey":generation,
        }))
        .await
        .is_err()
    );
    let binding: (Option<String>, Option<String>) =
      sqlx::query_as("SELECT workspace_id,validate_key FROM licenses WHERE key=$1")
        .bind(&license_key)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(binding, (Some("new-workspace".into()), Some(new_generation)));
  }
  unsafe {
    if let Some(previous_private_key) = previous_private_key {
      std::env::set_var("AFFINE_PRO_LICENSE_PRIVATE_KEY", previous_private_key);
    } else {
      std::env::remove_var("AFFINE_PRO_LICENSE_PRIVATE_KEY");
    }
  }
  cleanup(&pool, &license_namespace_key, &license_marker).await;
}

#[tokio::test]
async fn failed_atomic_batch_rolls_back_and_incomplete_snapshot_writes_nothing() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let source_id = format!("sub-{marker}");
  let user = insert_user(&pool, &marker).await;
  let missing_user = format!("missing-rfc12-user-{marker}");
  let ownerless_workspace = format!("rfc12-ownerless-{marker}");
  let scopes = vec![
    PaymentScope::customer(&namespace, &customer_id).unwrap(),
    PaymentScope::source(&namespace, &source_id).unwrap(),
    PaymentScope::cloud_target("user", &user, Plan::Pro).unwrap(),
    PaymentScope::cloud_target("user", &missing_user, Plan::Pro).unwrap(),
    PaymentScope::cloud_target("workspace", &ownerless_workspace, Plan::Team).unwrap(),
    PaymentScope::receipt(&namespace, &format!("missing-event-{marker}")).unwrap(),
    PaymentScope::receipt(&namespace, &format!("blocked-event-{marker}")).unwrap(),
    PaymentScope::receipt(&namespace, &format!("processed-event-{marker}")).unwrap(),
  ];
  let mut connection = PaymentConnection::try_acquire(&pool, scopes).await.unwrap().unwrap();
  let incomplete = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Incomplete,
    &customer_id,
    vec![subscription(&user, &customer_id, &source_id)],
  );
  assert!(
    apply_payment_snapshot(&mut connection, incomplete, Deployment::Cloud)
      .await
      .is_err()
  );
  let mut missing_receipt = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&user, &customer_id, &source_id)],
  );
  missing_receipt
    .captured_event_ids
    .push(format!("missing-event-{marker}"));
  let missing_receipt = match apply_payment_snapshot(&mut connection, missing_receipt, Deployment::Cloud).await {
    Ok(_) => panic!("payment snapshot without its inbox receipt was accepted"),
    Err(error) => error,
  };
  assert!(missing_receipt.to_string().contains("payment inbox receipt not found"));
  for (suffix, processing_status) in [("blocked", "blocked"), ("processed", "processed")] {
    sqlx::query(
      r#"INSERT INTO payment_events(id,provider,provider_namespace,event_type,external_event_id,processing_status)
         VALUES($1,'stripe',$2,'subscription.updated',$3,$4)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&namespace)
    .bind(format!("{suffix}-event-{marker}"))
    .bind(processing_status)
    .execute(&pool)
    .await
    .unwrap();
  }
  let mut blocked = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&user, &customer_id, &source_id)],
  );
  blocked.captured_event_ids.push(format!("blocked-event-{marker}"));
  assert!(
    apply_payment_snapshot(&mut connection, blocked, Deployment::Cloud)
      .await
      .unwrap_err()
      .to_string()
      .contains("cannot be applied")
  );
  let mut stale = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&user, &customer_id, &source_id)],
  );
  stale.captured_event_ids.push(format!("processed-event-{marker}"));
  let ignored = apply_payment_snapshot(&mut connection, stale, Deployment::Cloud)
    .await
    .unwrap();
  assert!(ignored.targets.is_empty());
  let missing_target = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&missing_user, &customer_id, &source_id)],
  );
  assert!(
    apply_payment_snapshot(&mut connection, missing_target, Deployment::Cloud)
      .await
      .unwrap_err()
      .to_string()
      .contains("user not found")
  );
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&ownerless_workspace)
    .execute(&pool)
    .await
    .unwrap();
  let ownerless_target = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![team_subscription(&ownerless_workspace, &customer_id, &source_id)],
  );
  assert!(
    apply_payment_snapshot(&mut connection, ownerless_target, Deployment::Cloud)
      .await
      .unwrap_err()
      .to_string()
      .contains("no active owner")
  );
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(&ownerless_workspace)
    .execute(&pool)
    .await
    .unwrap();
  let mut failing = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![subscription(&user, &customer_id, &source_id)],
  );
  failing.trials.push(TrialSnapshot {
    target_type: "user".to_string(),
    target_id: user.clone(),
    plan: Plan::Ai,
    external_ref: None,
    metadata: json!({}),
  });
  failing.invoices.push(InvoiceSnapshot {
    external_id: format!("invoice-{marker}"),
    target_id: user.clone(),
    currency: "INVALID".to_string(),
    amount: 1000,
    status: "paid".to_string(),
    reason: None,
    last_payment_error: None,
    link: None,
  });
  assert!(
    apply_payment_snapshot(&mut connection, failing, Deployment::Cloud)
      .await
      .is_err()
  );
  let counts: (i64, i64, i64) = sqlx::query_as(
    "SELECT (SELECT count(*) FROM provider_subscriptions WHERE provider_namespace=$1),(SELECT count(*) FROM \
     entitlements WHERE subject_id LIKE $2),(SELECT count(*) FROM subscription_trial_usages WHERE target_id=$3)",
  )
  .bind(&namespace)
  .bind(format!("{namespace}%"))
  .bind(&user)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(counts, (0, 0, 0));

  let canonical_subject = entitlement_subject(&namespace, &source_id);
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,subject_id,plan,status,metadata) \
     VALUES($1,'user',$2,'cloud_subscription',$3,'pro','active',$4)",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&user)
  .bind(&source_id)
  .bind(json!({"providerNamespace": "payment:v1:revenuecat:sandbox:5:other"}))
  .execute(&pool)
  .await
  .unwrap();
  let cross_provider_legacy = apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![subscription(&user, &customer_id, &source_id)],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap_err();
  assert!(cross_provider_legacy.to_string().contains("ambiguous legacy"));
  sqlx::query("DELETE FROM entitlements WHERE source='cloud_subscription' AND subject_id=$1")
    .bind(&source_id)
    .execute(&pool)
    .await
    .unwrap();
  for subject in [&source_id, &canonical_subject] {
    sqlx::query(
      "INSERT INTO entitlements(id,target_type,target_id,source,subject_id,plan,status,metadata) \
       VALUES($1,'user',$2,'cloud_subscription',$3,'pro','active','{}')",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&user)
    .bind(subject)
    .execute(&pool)
    .await
    .unwrap();
  }
  let duplicate_entitlement = match apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace,
      SnapshotCoverage::Single,
      &customer_id,
      vec![subscription(&user, &customer_id, &source_id)],
    ),
    Deployment::Cloud,
  )
  .await
  {
    Ok(_) => panic!("duplicate legacy and canonical entitlements were accepted"),
    Err(error) => error,
  };
  assert!(
    duplicate_entitlement
      .to_string()
      .contains("conflicting payment entitlement subject")
  );
  drop(connection);
  sqlx::query("DELETE FROM entitlements WHERE source='cloud_subscription' AND subject_id=ANY($1)")
    .bind([source_id.as_str(), canonical_subject.as_str()])
    .execute(&pool)
    .await
    .unwrap();
  cleanup(&pool, &namespace, &marker).await;
}

#[tokio::test]
async fn payment_decision_clock_is_loaded_after_waiting_for_target_lock() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let source_id = format!("sub-{marker}");
  let user = insert_user(&pool, &marker).await;
  let mut subscription = subscription(&user, &customer_id, &source_id);
  subscription.lifecycle = ProviderLifecycle::PastDue;
  let period_end = subscription.period_end.unwrap();
  let scopes = vec![
    PaymentScope::customer(&namespace, &customer_id).unwrap(),
    PaymentScope::source(&namespace, &source_id).unwrap(),
    PaymentScope::cloud_target("user", &user, Plan::Pro).unwrap(),
  ];
  let mut connection = PaymentConnection::try_acquire(&pool, scopes.clone())
    .await
    .unwrap()
    .unwrap();
  let mut blocker = pool.begin().await.unwrap();
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(&user)
    .fetch_one(&mut *blocker)
    .await
    .unwrap();
  let released = {
    let apply = apply_payment_snapshot(
      &mut connection,
      snapshot(
        provider_namespace,
        SnapshotCoverage::Single,
        &customer_id,
        vec![subscription],
      ),
      Deployment::Cloud,
    );
    tokio::pin!(apply);
    tokio::select! {
      _ = &mut apply => panic!("payment apply bypassed target lock"),
      _ = tokio::time::sleep(Duration::from_millis(150)) => {}
    }
    let released: chrono::DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
      .fetch_one(&mut *blocker)
      .await
      .unwrap();
    blocker.commit().await.unwrap();
    apply.as_mut().await.unwrap();
    released
  };
  let (validated_at, grace_until): (chrono::DateTime<Utc>, chrono::DateTime<Utc>) =
    sqlx::query_as("SELECT validated_at,grace_until FROM entitlements WHERE subject_id=$1")
      .bind(entitlement_subject(&namespace, &source_id))
      .fetch_one(&pool)
      .await
      .unwrap();
  assert!(validated_at >= released);
  assert!(grace_until.signed_duration_since(period_end).num_milliseconds().abs() <= 1);
  drop(connection);
  cleanup(&pool, &namespace, &marker).await;
}

#[tokio::test]
async fn payment_and_account_security_arrivals_follow_payment_then_user_order() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let source_id = format!("sub-{marker}");
  let user = insert_user(&pool, &marker).await;
  let scopes = || {
    vec![
      PaymentScope::customer(&namespace, &customer_id).unwrap(),
      PaymentScope::source(&namespace, &source_id).unwrap(),
      PaymentScope::cloud_target("user", &user, Plan::Pro).unwrap(),
    ]
  };

  let mut security_tx = pool.begin().await.unwrap();
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(&user)
    .fetch_one(&mut *security_tx)
    .await
    .unwrap();
  let mut payment = PaymentConnection::try_acquire(&pool, scopes()).await.unwrap().unwrap();
  {
    let payment_apply = apply_payment_snapshot(
      &mut payment,
      snapshot(
        provider_namespace.clone(),
        SnapshotCoverage::Single,
        &customer_id,
        vec![subscription(&user, &customer_id, &source_id)],
      ),
      Deployment::Cloud,
    );
    tokio::pin!(payment_apply);
    tokio::select! {
      _ = &mut payment_apply => panic!("payment bypassed the user security lock"),
      _ = tokio::time::sleep(Duration::from_millis(150)) => {}
    }
    security_tx.commit().await.unwrap();
    payment_apply.await.unwrap();
  }
  drop(payment);

  let mut payment = PaymentConnection::try_acquire(&pool, scopes()).await.unwrap().unwrap();
  let mut payment_tx = payment.begin().await.unwrap();
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(&user)
    .fetch_one(&mut *payment_tx)
    .await
    .unwrap();
  let security = async {
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
      .bind(&user)
      .fetch_one(&mut *tx)
      .await
      .unwrap();
    tx.commit().await.unwrap();
  };
  tokio::pin!(security);
  tokio::select! {
    _ = &mut security => panic!("user security mutation bypassed the payment user lock"),
    _ = tokio::time::sleep(Duration::from_millis(150)) => {}
  }
  payment_tx.commit().await.unwrap();
  security.await;
  drop(payment);
  cleanup(&pool, &namespace, &marker).await;
}

#[tokio::test]
async fn workspace_subscription_downgrade_applies_seat_transition_atomically() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let provider_namespace = provider_namespace(&marker);
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let source_id = format!("sub-{marker}");
  let owner = insert_user(&pool, &marker).await;
  let admin = insert_user(&pool, &format!("{marker}-admin")).await;
  let workspace = insert_workspace(&pool, &marker, &owner).await;
  sqlx::query("INSERT INTO workspace_members(id,workspace_id,user_id,role,state) VALUES($1,$2,$3,'admin','active')")
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&workspace)
    .bind(&admin)
    .execute(&pool)
    .await
    .unwrap();
  let mut entitlement_tx = pool.begin().await.unwrap();
  assert_eq!(
    super::super::entitlement::resolve_workspace_entitlement(
      &mut entitlement_tx,
      Deployment::Cloud,
      &workspace,
      Utc::now(),
    )
    .await
    .unwrap()
    .plan,
    Plan::Free
  );
  entitlement_tx.rollback().await.unwrap();
  let scopes = vec![
    PaymentScope::customer(&namespace, &customer_id).unwrap(),
    PaymentScope::source(&namespace, &source_id).unwrap(),
    PaymentScope::cloud_target("workspace", &workspace, Plan::Team).unwrap(),
  ];
  let mut connection = PaymentConnection::try_acquire(&pool, scopes.clone())
    .await
    .unwrap()
    .unwrap();
  apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![team_subscription(&workspace, &customer_id, &source_id)],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let mut entitlement_tx = pool.begin().await.unwrap();
  assert_eq!(
    super::super::entitlement::resolve_workspace_entitlement(
      &mut entitlement_tx,
      Deployment::Cloud,
      &workspace,
      Utc::now(),
    )
    .await
    .unwrap()
    .plan,
    Plan::Team
  );
  entitlement_tx.rollback().await.unwrap();
  let upgrade_mails: Vec<(String, String, String, serde_json::Value)> = sqlx::query_as(
    "SELECT recipient_user_id,mail_class,recipient_hash,payload FROM mail_deliveries WHERE workspace_id=$1 ORDER BY \
     recipient_user_id",
  )
  .bind(&workspace)
  .fetch_all(&pool)
  .await
  .unwrap();
  assert_eq!(upgrade_mails.len(), 2);
  for (recipient_id, mail_class, recipient_hash, payload) in &upgrade_mails {
    assert_eq!(mail_class, "workspace_lifecycle");
    assert_eq!(
      payload
        .pointer("/props/url/$$workspaceUrl")
        .and_then(serde_json::Value::as_str),
      Some(workspace.as_str())
    );
    assert_eq!(
      payload.pointer("/props/isOwner").and_then(serde_json::Value::as_bool),
      Some(recipient_id == &owner)
    );
    let email = if recipient_id == &owner {
      format!("rfc12-{marker}@example.invalid")
    } else {
      format!("rfc12-{marker}-admin@example.invalid")
    };
    let mut hash = <hmac::Hmac<sha2::Sha256> as hmac::KeyInit>::new_from_slice(&[0; 32]).unwrap();
    hmac::Mac::update(&mut hash, email.as_bytes());
    assert_eq!(recipient_hash, &hex::encode(hmac::Mac::finalize(hash).into_bytes()));
  }
  apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![team_subscription(&workspace, &customer_id, &source_id)],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let upgrade_mail_count: i64 = sqlx::query_scalar("SELECT count(*) FROM mail_deliveries WHERE workspace_id=$1")
    .bind(&workspace)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(upgrade_mail_count, 2);
  sqlx::query(
    "INSERT INTO workspace_invitations(id,workspace_id,normalized_email,status) VALUES($1,$2,$3,'waiting_seat')",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&workspace)
  .bind(format!("rfc12-{marker}-invite@example.invalid"))
  .execute(&pool)
  .await
  .unwrap();
  let mut canceled = team_subscription(&workspace, &customer_id, &source_id);
  canceled.lifecycle = ProviderLifecycle::Canceled;
  sqlx::query(
    "CREATE OR REPLACE FUNCTION rfc12_fail_payment_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE \
     EXCEPTION 'injected payment transition failure'; END $$",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query("DROP TRIGGER IF EXISTS rfc12_fail_payment_transition ON workspace_members")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "CREATE TRIGGER rfc12_fail_payment_transition BEFORE UPDATE OF role ON workspace_members FOR EACH ROW WHEN \
     (OLD.role='admin') EXECUTE FUNCTION rfc12_fail_payment_transition()",
  )
  .execute(&pool)
  .await
  .unwrap();
  let rejected = match apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![canceled.clone()],
    ),
    Deployment::Cloud,
  )
  .await
  {
    Ok(_) => panic!("payment transition failure did not roll back the batch"),
    Err(error) => error,
  };
  assert!(rejected.to_string().contains("injected payment transition failure"));
  drop(connection);
  sqlx::query("DROP TRIGGER rfc12_fail_payment_transition ON workspace_members")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rfc12_fail_payment_transition()")
    .execute(&pool)
    .await
    .unwrap();
  let rolled_back: (String, String, i64, String) = sqlx::query_as(
    "SELECT (SELECT status FROM provider_subscriptions WHERE provider_namespace=$1),(SELECT status FROM entitlements \
     WHERE subject_id=$2),(SELECT count(*) FROM workspace_invitations WHERE workspace_id=$3),(SELECT role FROM \
     workspace_members WHERE workspace_id=$3 AND user_id=$4 AND state='active')",
  )
  .bind(&namespace)
  .bind(entitlement_subject(&namespace, &source_id))
  .bind(&workspace)
  .bind(&admin)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(
    rolled_back,
    ("active".to_string(), "active".to_string(), 1, "admin".to_string())
  );
  let mut connection = PaymentConnection::try_acquire(&pool, scopes).await.unwrap().unwrap();
  apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace,
      SnapshotCoverage::Single,
      &customer_id,
      vec![canceled],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let state: (String, i64, String) = sqlx::query_as(
    "SELECT (SELECT status FROM entitlements WHERE subject_id=$1),(SELECT count(*) FROM workspace_invitations WHERE \
     workspace_id=$2),(SELECT role FROM workspace_members WHERE workspace_id=$2 AND user_id=$3 AND state='active')",
  )
  .bind(entitlement_subject(&namespace, &source_id))
  .bind(&workspace)
  .bind(&admin)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(state, ("revoked".to_string(), 0, "member".to_string()));
  drop(connection);
  cleanup(&pool, &namespace, &marker).await;
  sqlx::query("DELETE FROM workspaces WHERE id=$1")
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DELETE FROM users WHERE id=$1")
    .bind(&admin)
    .execute(&pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn canonical_source_identity_conflict_cannot_be_adopted_across_namespaces() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let primary_namespace = provider_namespace(&marker);
  let namespace = primary_namespace.canonical_key().unwrap();
  let conflicting_namespace = provider_namespace(&format!("{marker}-other")).canonical_key().unwrap();
  let customer_id = format!("cus-{marker}");
  let conflicting_customer = format!("cus-{marker}-other");
  let source_id = format!("sub-{marker}");
  let user = insert_user(&pool, &marker).await;
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,
         external_customer_id,external_subscription_id,external_product_id,external_price_id,metadata)
       VALUES($1,'stripe',$2,$3,'user',$4,'pro','monthly','active',$5,$3,'product','price','{}')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&conflicting_namespace)
  .bind(&source_id)
  .bind(&user)
  .bind(&conflicting_customer)
  .execute(&pool)
  .await
  .unwrap();
  let mut connection = PaymentConnection::try_acquire(
    &pool,
    vec![
      PaymentScope::customer(&namespace, &customer_id).unwrap(),
      PaymentScope::customer(&conflicting_namespace, &conflicting_customer).unwrap(),
      PaymentScope::source(&namespace, &source_id).unwrap(),
      PaymentScope::source(&conflicting_namespace, &source_id).unwrap(),
      PaymentScope::cloud_target("user", &user, Plan::Pro).unwrap(),
    ],
  )
  .await
  .unwrap()
  .unwrap();
  let error = match apply_payment_snapshot(
    &mut connection,
    snapshot(
      primary_namespace,
      SnapshotCoverage::Single,
      &customer_id,
      vec![subscription(&user, &customer_id, &source_id)],
    ),
    Deployment::Cloud,
  )
  .await
  {
    Ok(_) => panic!("conflicting canonical source identity was adopted"),
    Err(error) => error,
  };
  assert!(
    error.to_string().contains("conflicting payment source identity"),
    "{error}"
  );
  let stored: (String, String) = sqlx::query_as(
    "SELECT provider_namespace,external_customer_id FROM provider_subscriptions WHERE provider='stripe' AND \
     external_subscription_id=$1",
  )
  .bind(&source_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(stored, (conflicting_namespace.clone(), conflicting_customer));
  drop(connection);
  cleanup(&pool, &namespace, &marker).await;
  cleanup(&pool, &conflicting_namespace, &marker).await;
}

#[tokio::test]
async fn revenuecat_access_and_missing_source_rules_fail_closed() {
  let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
  let Some(pool) = pool().await else {
    return;
  };
  let marker = uuid::Uuid::new_v4().simple().to_string();
  let stripe_namespace = provider_namespace(&format!("{marker}-stripe"));
  let provider_namespace = ProviderNamespace {
    provider: Provider::RevenueCat,
    environment: ProviderEnvironment::Sandbox,
    account: marker.clone(),
  };
  let namespace = provider_namespace.canonical_key().unwrap();
  let customer_id = format!("rc-customer-{marker}");
  let source_id = format!("rc-subscription-{marker}");
  let stripe_namespace_key = stripe_namespace.canonical_key().unwrap();
  let stripe_customer_id = format!("stripe-customer-{marker}");
  let stripe_source_id = format!("stripe-subscription-{marker}");
  let user = insert_user(&pool, &marker).await;
  let transferred_user = insert_user(&pool, &format!("{marker}-transferred")).await;
  let customer_scope = PaymentScope::customer(&namespace, &customer_id).unwrap();
  let source_scope = PaymentScope::source(&namespace, &source_id).unwrap();
  let mut connection = PaymentConnection::try_acquire(
    &pool,
    vec![
      customer_scope.clone(),
      source_scope.clone(),
      PaymentScope::customer(&stripe_namespace_key, &stripe_customer_id).unwrap(),
      PaymentScope::source(&stripe_namespace_key, &stripe_source_id).unwrap(),
      PaymentScope::cloud_target("user", &user, Plan::Ai).unwrap(),
      PaymentScope::cloud_target("user", &transferred_user, Plan::Ai).unwrap(),
    ],
  )
  .await
  .unwrap()
  .unwrap();
  let legacy_id = uuid::Uuid::new_v4().to_string();
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,target_type,target_id,plan,recurring,status,external_customer_id,
         external_product_id,iap_store,external_ref,metadata)
       VALUES($1,'revenuecat','user',$2,'ai','yearly','active',$3,'rc-product','app_store',$4,$5)"#,
  )
  .bind(&legacy_id)
  .bind(&user)
  .bind(&customer_id)
  .bind(format!("store-{source_id}"))
  .bind(json!({"providerNamespace": namespace}))
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,subject_id,plan,status,metadata) \
     VALUES($1,'user',$2,'cloud_subscription',$3,'ai','active',$4)",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&user)
  .bind(&source_id)
  .bind(json!({"providerNamespace": namespace}))
  .execute(&pool)
  .await
  .unwrap();
  apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![revenuecat_subscription(&user, &customer_id, &source_id)],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let identities: (String, String, String, String, i64) = sqlx::query_as(
    "SELECT id,source_identity,external_ref,(SELECT status FROM entitlements WHERE subject_id LIKE $2),(SELECT \
     count(*) FROM entitlements WHERE subject_id=$3) FROM provider_subscriptions WHERE provider_namespace=$1",
  )
  .bind(&namespace)
  .bind(format!("{namespace}%"))
  .bind(&source_id)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(identities.0, legacy_id);
  assert_eq!(identities.1, source_id);
  assert_ne!(identities.1, identities.2);
  assert_eq!(identities.3, "expired");
  assert_eq!(identities.4, 0);

  let mut stripe_ai = subscription(&user, &stripe_customer_id, &stripe_source_id);
  stripe_ai.plan = Plan::Ai;
  stripe_ai.recurring = SubscriptionRecurring::Yearly;
  apply_payment_snapshot(
    &mut connection,
    snapshot(
      stripe_namespace.clone(),
      SnapshotCoverage::Single,
      &stripe_customer_id,
      vec![stripe_ai.clone()],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let mut accessible_rc = revenuecat_subscription(&user, &customer_id, &source_id);
  accessible_rc.gives_access = Some(true);
  apply_payment_snapshot(
    &mut connection,
    snapshot(
      provider_namespace.clone(),
      SnapshotCoverage::Single,
      &customer_id,
      vec![accessible_rc],
    ),
    Deployment::Cloud,
  )
  .await
  .unwrap();
  let initial_winner: Vec<(String, String)> = sqlx::query_as(
    "SELECT metadata->>'providerNamespace',status FROM entitlements WHERE target_id=$1 AND \
     source='cloud_subscription' ORDER BY metadata->>'providerNamespace'",
  )
  .bind(&user)
  .fetch_all(&pool)
  .await
  .unwrap();
  assert_eq!(
    initial_winner,
    vec![
      (namespace.clone(), "expired".to_string()),
      (stripe_namespace_key.clone(), "active".to_string()),
    ]
  );
  let mut restricted_stripe = snapshot(
    stripe_namespace.clone(),
    SnapshotCoverage::Single,
    &stripe_customer_id,
    vec![stripe_ai],
  );
  restricted_stripe.financial_facts.push(FinancialSnapshot {
    fact: FinancialFact {
      kind: FinancialKind::Refund,
      status: FinancialStatus::Succeeded,
    },
    external_id: format!("stripe-refund-{marker}"),
    source_id: Some(stripe_source_id.clone()),
    external_invoice_id: None,
    external_payment_id: None,
    amount: Some(1000),
    currency: Some("USD".to_string()),
    occurred_at: Some(Utc::now()),
    metadata: json!({}),
  });
  apply_payment_snapshot(&mut connection, restricted_stripe, Deployment::Cloud)
    .await
    .unwrap();
  let restricted_winner: Vec<(String, String)> = sqlx::query_as(
    "SELECT metadata->>'providerNamespace',status FROM entitlements WHERE target_id=$1 AND \
     source='cloud_subscription' ORDER BY metadata->>'providerNamespace'",
  )
  .bind(&user)
  .fetch_all(&pool)
  .await
  .unwrap();
  assert_eq!(
    restricted_winner,
    vec![
      (namespace.clone(), "active".to_string()),
      (stripe_namespace_key.clone(), "revoked".to_string()),
    ]
  );

  let mut transfer = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Single,
    &customer_id,
    vec![revenuecat_subscription(&transferred_user, &customer_id, &source_id)],
  );
  transfer.ownership_transfers.push(RevenueCatOwnershipTransfer {
    source_id: source_id.clone(),
    customer_id: customer_id.clone(),
    old_target_type: "user".to_string(),
    old_target_id: user.clone(),
    new_target_type: "user".to_string(),
    new_target_id: transferred_user.clone(),
  });
  apply_payment_snapshot(&mut connection, transfer, Deployment::Cloud)
    .await
    .unwrap();
  let transferred_targets: (String, String) = sqlx::query_as(
    "SELECT (SELECT target_id FROM provider_subscriptions WHERE provider_namespace=$1),(SELECT target_id FROM \
     entitlements WHERE subject_id=$2)",
  )
  .bind(&namespace)
  .bind(entitlement_subject(&namespace, &source_id))
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(transferred_targets, (transferred_user.clone(), transferred_user));

  let unverified = snapshot(
    provider_namespace.clone(),
    SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: Default::default(),
    },
    &customer_id,
    Vec::new(),
  );
  assert!(
    apply_payment_snapshot(&mut connection, unverified, Deployment::Cloud)
      .await
      .is_err()
  );
  let verified = snapshot(
    provider_namespace,
    SnapshotCoverage::Complete {
      verified_missing_revenuecat_sources: [source_id.clone()].into(),
    },
    &customer_id,
    Vec::new(),
  );
  apply_payment_snapshot(&mut connection, verified, Deployment::Cloud)
    .await
    .unwrap();
  let status: String =
    sqlx::query_scalar("SELECT status FROM provider_subscriptions WHERE provider_namespace=$1 AND source_identity=$2")
      .bind(&namespace)
      .bind(&source_id)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert_eq!(status, "expired");
  drop(connection);
  cleanup(&pool, &namespace, &marker).await;
  cleanup(&pool, &stripe_namespace_key, &marker).await;

  let provisional_marker = format!("{marker}-provisional");
  let provisional_user = insert_user(&pool, &provisional_marker).await;
  let provisional_source = format!("rc-source-{provisional_marker}");
  let transaction_id = format!("store-{provisional_marker}");
  let anonymous_customer = format!("$RCAnonymousID:{provisional_marker}");
  let anonymous_item = revenuecat_item(&anonymous_customer, &provisional_source, &transaction_id);
  let confirmed_item = revenuecat_item(&provisional_user, &provisional_source, &transaction_id);
  let page = |items: Vec<serde_json::Value>| json!({ "items": items, "next_page": null }).to_string();
  let (endpoint, mut requests) = mock_http(vec![
    MockResponse {
      status: 200,
      body: page(vec![anonymous_item]),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: page(Vec::new()),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: json!({ "was_created": false }).to_string(),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: page(Vec::new()),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: page(Vec::new()),
      delay: Duration::ZERO,
    },
    MockResponse {
      status: 200,
      body: page(vec![confirmed_item]),
      delay: Duration::ZERO,
    },
  ])
  .await;
  let config = RevenueCatRuntimeConfig {
    api_key: Arc::new(Zeroizing::new("revenuecat-secret".to_string())),
    webhook_auth: Arc::new(Zeroizing::new("webhook-auth".to_string())),
    project_id: provisional_marker.clone(),
    production: false,
    product_map: [(
      "app.affine.pro.Annual".to_string(),
      crate::runtime::PaymentProductConfig {
        plan: "pro".to_string(),
        recurring: "yearly".to_string(),
      },
    )]
    .into(),
  };
  let revenuecat_client = Arc::new(RevenueCatClient::with_endpoint(&config, &endpoint).unwrap());
  let provisional_namespace = revenuecat_client.namespace().canonical_key().unwrap();
  let collision_marker = format!("{provisional_marker}-collision");
  let collision_user = insert_user(&pool, &collision_marker).await;
  let collision_namespace = ProviderNamespace {
    provider: Provider::RevenueCat,
    environment: ProviderEnvironment::Sandbox,
    account: format!("{provisional_marker}-previous"),
  }
  .canonical_key()
  .unwrap();
  sqlx::query(
    r#"INSERT INTO provider_subscriptions(
         id,provider,provider_namespace,source_identity,target_type,target_id,plan,recurring,status,gives_access,
         external_customer_id,external_subscription_id,external_product_id,iap_store,external_ref,period_end,metadata)
       VALUES($1,'revenuecat',$2,$3,'user',$4,'pro','yearly','active',true,$5,$3,'legacy-product','app_store',$6,
              clock_timestamp()+INTERVAL '30 days','{}')"#,
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&collision_namespace)
  .bind(format!("legacy-{provisional_source}"))
  .bind(&collision_user)
  .bind(format!("legacy-{anonymous_customer}"))
  .bind(&transaction_id)
  .execute(&pool)
  .await
  .unwrap();
  let runtime = PaymentRuntime {
    pool: pool.clone(),
    stripe: None,
    revenuecat: Some(Arc::clone(&revenuecat_client)),
    permits: Arc::new(tokio::sync::Semaphore::new(1)),
    deployment: Deployment::Cloud,
    revenuecat_config: Some(config),
    mail_hash_key: [0; 32],
    worker: tokio::sync::Mutex::new(None),
  };
  let revenuecat_event = json!({
    "event": {
      "id": format!("rc-event-{provisional_marker}"),
      "type": "INITIAL_PURCHASE",
      "environment": "SANDBOX",
      "event_timestamp_ms": Utc::now().timestamp_millis()
    }
  })
  .to_string();
  assert!(
    super::webhook::capture_revenuecat(&pool, &revenuecat_client, revenuecat_event.as_bytes(), "wrong",)
      .await
      .is_err()
  );
  let revenuecat_receipt =
    super::webhook::capture_revenuecat(&pool, &revenuecat_client, revenuecat_event.as_bytes(), "webhook-auth")
      .await
      .unwrap();
  assert_eq!(revenuecat_receipt.get("status"), Some(&json!("pending")));
  runtime
    .execute(json!({
      "action": "request_apply_revenuecat",
      "userId": provisional_user,
      "transactionId": transaction_id,
      "intentId": format!("rc-identify-{provisional_marker}")
    }))
    .await
    .unwrap();
  let provisional_state: (chrono::DateTime<Utc>, String) = sqlx::query_as(
    "SELECT period_end,(SELECT status FROM payment_operations WHERE provider_namespace=$1 AND \
     operation_type='revenuecat_identify') FROM provider_subscriptions WHERE provider_namespace=$1 AND \
     source_identity=$2",
  )
  .bind(&provisional_namespace)
  .bind(&provisional_source)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert!(provisional_state.0 <= Utc::now() + chrono::Duration::minutes(10));
  assert_eq!(provisional_state.1, "pending");
  assert!(
    super::command::recover_one_revenuecat_identify(&runtime)
      .await
      .unwrap()
      .is_none()
  );
  sqlx::query(
    "UPDATE payment_operations SET next_attempt_at=clock_timestamp()-INTERVAL '1 second' WHERE provider_namespace=$1 \
     AND operation_type='revenuecat_identify'",
  )
  .bind(&provisional_namespace)
  .execute(&pool)
  .await
  .unwrap();
  assert!(
    super::command::recover_one_revenuecat_identify(&runtime)
      .await
      .unwrap()
      .is_some()
  );
  let confirmed_state: (chrono::DateTime<Utc>, String, String) = sqlx::query_as(
    "SELECT period_end,target_id,(SELECT status FROM payment_operations WHERE provider_namespace=$1 AND \
     operation_type='revenuecat_identify') FROM provider_subscriptions WHERE provider_namespace=$1 AND \
     source_identity=$2",
  )
  .bind(&provisional_namespace)
  .bind(&provisional_source)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert!(confirmed_state.0 > Utc::now() + chrono::Duration::days(300));
  assert_eq!(confirmed_state.1, provisional_user);
  assert_eq!(confirmed_state.2, "completed");
  let mut sent = Vec::new();
  for _ in 0..6 {
    sent.push(requests.recv().await.unwrap());
  }
  assert_eq!(
    sent
      .iter()
      .filter(|request| request.starts_with("POST /v1/subscribers/identify HTTP/1.1"))
      .count(),
    1
  );
  cleanup(&pool, &collision_namespace, &collision_marker).await;
  cleanup(&pool, &provisional_namespace, &provisional_marker).await;
}
