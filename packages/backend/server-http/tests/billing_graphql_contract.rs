//! Billing GraphQL SDL contract, permission, and error-envelope integration tests.

use std::collections::BTreeMap;
use std::sync::{
  Arc, Mutex,
  atomic::{AtomicUsize, Ordering},
};

use async_graphql::parser::parse_schema;
use async_graphql::parser::types::{
  ConstDirective, FieldDefinition, InputValueDefinition, ServiceDocument, TypeDefinition, TypeKind,
  TypeSystemDefinition,
};
use async_graphql::{Request, Value};
use chrono::{DateTime, Utc};
use server_db::{DbConfig, ServerDb};
use server_http::graphql::{AuthenticatedUser, build_schema};
use server_http::{AppState, RuntimeConfig};
use server_spi::{
  AdminPaymentCaseRecord, AdminPaymentLookupSpiInput, AdminPaymentResolutionRecord, BillingCheckoutInput,
  BillingCheckoutResult, BillingPriceRecord, BillingSpi, BillingSubscriptionList, BillingSubscriptionRecord,
  CommunityCopilotPolicySpi, CommunityQuotaGate, CommunitySessionPolicyHook, CopilotPolicySpi, QuotaGate,
  ReconcileAdminPaymentSpiInput, ServerExtension, SessionPolicyHook,
};
use server_types::{DeploymentMode, DomainError, ServerRole};

#[derive(Default)]
struct RecordingBillingSpi {
  payment_enabled: bool,
  price_calls: AtomicUsize,
  last_checkout: Mutex<Option<BillingCheckoutInput>>,
  last_intent_id: Mutex<Option<String>>,
  last_reconcile: Mutex<Option<ReconcileAdminPaymentSpiInput>>,
  next_error: Mutex<Option<DomainError>>,
}

#[async_trait::async_trait]
impl BillingSpi for RecordingBillingSpi {
  fn payment_enabled(&self) -> bool {
    self.payment_enabled
  }

  async fn list_prices(&self, show_lifetime_price: bool) -> Result<Vec<BillingPriceRecord>, DomainError> {
    self.price_calls.fetch_add(1, Ordering::SeqCst);
    Ok(vec![BillingPriceRecord {
      price_type: "fixed".to_owned(),
      plan: "pro".to_owned(),
      currency: "usd".to_owned(),
      amount: Some(799),
      yearly_amount: Some(6999),
      lifetime_amount: show_lifetime_price.then_some(19900),
    }])
  }

  async fn list_subscriptions(
    &self,
    _target_type: &str,
    _target_id: &str,
  ) -> Result<BillingSubscriptionList, DomainError> {
    Ok(BillingSubscriptionList::default())
  }

  async fn create_checkout(&self, input: BillingCheckoutInput) -> Result<BillingCheckoutResult, DomainError> {
    if let Some(err) = self.next_error.lock().unwrap().take() {
      return Err(err);
    }
    *self.last_checkout.lock().unwrap() = Some(input);
    Ok(BillingCheckoutResult {
      url: "https://checkout.stripe.test/cs_123".to_owned(),
      session_id: "cs_123".to_owned(),
      target_id: "target_1".to_owned(),
    })
  }

  async fn mutate_subscription(
    &self,
    _actor_user_id: &str,
    _target_type: &str,
    _target_id: &str,
    plan: &str,
    _mutation: &str,
    intent_id: &str,
  ) -> Result<BillingSubscriptionRecord, DomainError> {
    *self.last_intent_id.lock().unwrap() = Some(intent_id.to_owned());
    if let Some(err) = self.next_error.lock().unwrap().take() {
      return Err(err);
    }
    let now = Utc::now();
    Ok(BillingSubscriptionRecord {
      stripe_subscription_id: Some("sub_123".to_owned()),
      stripe_schedule_id: None,
      status: "active".to_owned(),
      plan: plan.to_owned(),
      recurring: "monthly".to_owned(),
      variant: None,
      quantity: 1,
      start: now,
      end: None,
      trial_start: None,
      trial_end: None,
      next_bill_at: None,
      canceled_at: Some(now),
      created_at: now,
      updated_at: now,
      provider: Some("stripe".to_owned()),
      iap_store: None,
    })
  }

  async fn update_subscription_recurring(
    &self,
    _actor_user_id: &str,
    _target_type: &str,
    _target_id: &str,
    _plan: &str,
    _recurring: &str,
    intent_id: &str,
  ) -> Result<BillingSubscriptionRecord, DomainError> {
    *self.last_intent_id.lock().unwrap() = Some(intent_id.to_owned());
    if let Some(err) = self.next_error.lock().unwrap().take() {
      return Err(err);
    }
    Err(DomainError::Validation("same_subscription_recurring".to_owned()))
  }

  async fn request_apply_subscription(
    &self,
    _user_id: &str,
    _transaction_id: &str,
    _intent_id: &str,
  ) -> Result<Vec<BillingSubscriptionRecord>, DomainError> {
    Err(DomainError::Forbidden("transaction belongs to another user".to_owned()))
  }

  async fn create_customer_portal(&self, _user_id: &str) -> Result<String, DomainError> {
    if let Some(err) = self.next_error.lock().unwrap().take() {
      return Err(err);
    }
    Err(DomainError::Internal("stripe timeout".to_owned()))
  }

  async fn inspect_payment_reconciliation(
    &self,
    _input: AdminPaymentLookupSpiInput,
  ) -> Result<Vec<AdminPaymentCaseRecord>, DomainError> {
    Ok(Vec::new())
  }

  async fn reconcile_payment(
    &self,
    input: ReconcileAdminPaymentSpiInput,
  ) -> Result<AdminPaymentResolutionRecord, DomainError> {
    *self.last_reconcile.lock().unwrap() = Some(input.clone());
    Ok(AdminPaymentResolutionRecord {
      user_id: input.user_id,
      plan_family: input.plan_family,
      conflicted: false,
      bound_provider_namespace: None,
      bound_source_identity: None,
      request_id: input.request_id,
      status: "resolved".to_owned(),
      reason: None,
      attempt_id: input.attempt_id,
      attempt_status: None,
    })
  }
}

struct TestBillingExtension {
  billing: Arc<RecordingBillingSpi>,
}

impl ServerExtension for TestBillingExtension {
  fn edition_name(&self) -> &'static str {
    "test-billing"
  }

  fn quota_gate(&self) -> Arc<dyn QuotaGate> {
    Arc::new(CommunityQuotaGate::new())
  }

  fn session_policy(&self) -> Arc<dyn SessionPolicyHook> {
    Arc::new(CommunitySessionPolicyHook)
  }

  fn copilot_policy(&self) -> Arc<dyn CopilotPolicySpi> {
    Arc::new(CommunityCopilotPolicySpi)
  }

  fn billing_spi(&self) -> Arc<dyn BillingSpi> {
    Arc::clone(&self.billing) as Arc<dyn BillingSpi>
  }
}

fn setup_test_db() -> (test_db_harness::pg::DbLease, tokio::runtime::Runtime, ServerDb) {
  let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("test postgres cluster");
  let migrations = test_db_harness::migrations::MigrationSet {
    migrations: vec![],
    digest: "5e200000000000b1".into(),
  };
  let template = cluster.ensure_template(&migrations).expect("ensure template");
  let lease = cluster
    .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
    .expect("lease test db");
  let db_url = lease.url().to_owned();
  let rt = tokio::runtime::Builder::new_multi_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");
  let db = rt.block_on(async move {
    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "stable".into(),
      role: ServerRole::Graphql,
      selfhosted: false,
      max_connections: 2,
      statement_timeout_ms: 5_000,
      tier_permits: [4, 2, 2, 1],
    })
    .await
    .expect("connect test db");
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
      .execute(db.pool())
      .await
      .expect("reset schema");
    db.ensure_schema_ready().await.expect("ensure schema ready");
    db
  });
  (lease, rt, db)
}

fn find_type<'a>(doc: &'a ServiceDocument, name: &str) -> &'a TypeDefinition {
  doc
    .definitions
    .iter()
    .find_map(|def| match def {
      TypeSystemDefinition::Type(ty) if ty.node.name.node.as_str() == name => Some(&ty.node),
      _ => None,
    })
    .unwrap_or_else(|| panic!("schema missing type `{name}`"))
}

fn deprecation_reason(directives: &[async_graphql::Positioned<ConstDirective>]) -> Option<String> {
  directives.iter().find_map(|dir| {
    if dir.node.name.node.as_str() != "deprecated" {
      return None;
    }
    let reason = dir
      .node
      .arguments
      .iter()
      .find_map(|(k, v)| {
        if k.node.as_str() == "reason" {
          match &v.node {
            Value::String(s) => Some(s.clone()),
            other => Some(other.to_string()),
          }
        } else {
          None
        }
      })
      .unwrap_or_else(|| "No longer supported".to_owned());
    Some(reason)
  })
}

type InputValueSig = (String, Option<String>, Option<String>);
type FieldSig = (String, Option<String>, BTreeMap<String, InputValueSig>);

fn input_value_sig(val: &InputValueDefinition) -> InputValueSig {
  (
    val.ty.node.to_string(),
    val.default_value.as_ref().map(|d| d.node.to_string()),
    deprecation_reason(&val.directives),
  )
}

fn field_sig(field: &FieldDefinition) -> FieldSig {
  let args = field
    .arguments
    .iter()
    .map(|arg| (arg.node.name.node.to_string(), input_value_sig(&arg.node)))
    .collect();
  (field.ty.node.to_string(), deprecation_reason(&field.directives), args)
}

fn object_fields(ty: &TypeDefinition) -> BTreeMap<String, &FieldDefinition> {
  let TypeKind::Object(obj) = &ty.kind else {
    panic!("expected Object type for `{}`", ty.name.node);
  };
  obj
    .fields
    .iter()
    .map(|f| (f.node.name.node.to_string(), &f.node))
    .collect()
}

fn assert_object_fields_match(
  gen_doc: &ServiceDocument,
  ref_doc: &ServiceDocument,
  type_name: &str,
  only_fields: Option<&[&str]>,
) {
  let gen_fields = object_fields(find_type(gen_doc, type_name));
  let ref_fields = object_fields(find_type(ref_doc, type_name));
  let names: Vec<String> = match only_fields {
    Some(list) => list.iter().map(|s| (*s).to_owned()).collect(),
    None => {
      assert_eq!(
        gen_fields.keys().collect::<Vec<_>>(),
        ref_fields.keys().collect::<Vec<_>>(),
        "field set mismatch on `{type_name}`"
      );
      ref_fields.keys().cloned().collect()
    }
  };
  for field_name in names {
    let gen_f = gen_fields
      .get(&field_name)
      .unwrap_or_else(|| panic!("generated `{type_name}` missing field `{field_name}`"));
    let ref_f = ref_fields
      .get(&field_name)
      .unwrap_or_else(|| panic!("oracle `{type_name}` missing field `{field_name}`"));
    assert_eq!(
      field_sig(gen_f),
      field_sig(ref_f),
      "AST signature mismatch on `{type_name}.{field_name}`"
    );
  }
}

fn assert_type_matches(gen_doc: &ServiceDocument, ref_doc: &ServiceDocument, type_name: &str) {
  let gen_ty = find_type(gen_doc, type_name);
  let ref_ty = find_type(ref_doc, type_name);
  match (&gen_ty.kind, &ref_ty.kind) {
    (TypeKind::Object(_), TypeKind::Object(_)) => assert_object_fields_match(gen_doc, ref_doc, type_name, None),
    (TypeKind::InputObject(g), TypeKind::InputObject(r)) => {
      let gm: BTreeMap<_, _> = g
        .fields
        .iter()
        .map(|f| (f.node.name.node.to_string(), input_value_sig(&f.node)))
        .collect();
      let rm: BTreeMap<_, _> = r
        .fields
        .iter()
        .map(|f| (f.node.name.node.to_string(), input_value_sig(&f.node)))
        .collect();
      assert_eq!(gm, rm, "input object mismatch on `{type_name}`");
    }
    (TypeKind::Enum(g), TypeKind::Enum(r)) => {
      let gv: BTreeMap<_, _> = g
        .values
        .iter()
        .map(|v| (v.node.value.node.to_string(), deprecation_reason(&v.node.directives)))
        .collect();
      let rv: BTreeMap<_, _> = r
        .values
        .iter()
        .map(|v| (v.node.value.node.to_string(), deprecation_reason(&v.node.directives)))
        .collect();
      assert_eq!(gv, rv, "enum mismatch on `{type_name}`");
    }
    _ => panic!("type kind mismatch on `{type_name}`"),
  }
}

#[test]
fn billing_graphql_sdl_matches_frozen_v0275_contract() {
  let (_lease, rt, db) = setup_test_db();
  rt.block_on(async move {
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig::default(),
      Arc::new(server_spi::CommunityExtension::new()),
    );
    let gen_sdl = server_http::graphql::export_valid_sdl(&build_schema(state));
    let oracle_path =
      std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/oracle-contracts/v0.27.5/schema.gql");
    let ref_sdl = std::fs::read_to_string(&oracle_path).expect("read frozen v0.27.5 schema.gql");
    let gen_doc = parse_schema(&gen_sdl).expect("parse generated SDL");
    let ref_doc = parse_schema(&ref_sdl).expect("parse oracle SDL");

    assert_object_fields_match(
      &gen_doc,
      &ref_doc,
      "Query",
      Some(&["prices", "checkoutAttempt", "adminPaymentReconciliation"]),
    );
    assert_object_fields_match(
      &gen_doc,
      &ref_doc,
      "Mutation",
      Some(&[
        "createCheckoutSession",
        "expireCheckout",
        "appStorePurchase",
        "createCustomerPortal",
        "cancelSubscription",
        "resumeSubscription",
        "updateSubscriptionRecurring",
        "generateLicenseKey",
        "requestApplySubscription",
        "refreshUserSubscriptions",
        "reconcileAdminPayment",
        "grantCommercialEntitlement",
        "revokeCommercialEntitlement",
      ]),
    );
    assert_object_fields_match(
      &gen_doc,
      &ref_doc,
      "UserType",
      Some(&["subscriptions", "subscriptionBilling", "invoiceCount", "invoices"]),
    );
    assert_object_fields_match(
      &gen_doc,
      &ref_doc,
      "WorkspaceType",
      Some(&["subscription", "invoiceCount", "invoices"]),
    );
    for type_name in [
      "SubscriptionPrice",
      "SubscriptionType",
      "InvoiceType",
      "SubscriptionBillingSource",
      "SubscriptionBillingGroup",
      "SubscriptionBillingInfo",
      "CreateCheckoutSessionInput",
      "AppStorePurchaseInput",
      "AppStorePurchaseResult",
      "AdminPaymentSource",
      "AdminPaymentAttempt",
      "AdminPaymentCase",
      "AdminPaymentResolution",
      "AdminPaymentLookupInput",
      "ReconcileAdminPaymentInput",
      "SubscriptionStatus",
      "InvoiceStatus",
      "AppStorePurchaseAction",
      "AdminPaymentPlanFamily",
      "AdminPaymentResolutionStatus",
    ] {
      assert_type_matches(&gen_doc, &ref_doc, type_name);
    }
    db.pool().close().await;
  });
}

#[test]
fn billing_graphql_enforces_payment_feature_permissions_and_error_envelopes() {
  let (_lease, rt, db) = setup_test_db();
  rt.block_on(async move {
    let now: DateTime<Utc> = Utc::now();
    sqlx::query("INSERT INTO users (id, name, email, registered, disabled, email_verified, created_at) VALUES ($1, 'Alice', 'alice@example.com', true, false, $2, $2), ($3, 'Bob', 'bob@example.com', true, false, $2, $2)")
      .bind("u_alice")
      .bind(now)
      .bind("u_bob")
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO user_features (user_id, name, reason, type, expired_at, activated) VALUES ('u_alice', 'administrator', 'test', 0, NULL, true)")
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspaces (id, name) VALUES ('ws_1', 'Team')")
      .execute(db.pool())
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_members (workspace_id, user_id, role, state, source) VALUES ('ws_1', 'u_alice', 'owner', 'active', 'legacy'), ('ws_1', 'u_bob', 'member', 'active', 'legacy')")
      .execute(db.pool())
      .await
      .unwrap();

    // 1. CommunityExtension in Cloud mode does NOT advertise ServerFeature::Payment.
    let community_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        deployment_mode: DeploymentMode::Cloud,
        ..RuntimeConfig::default()
      },
      Arc::new(server_spi::CommunityExtension::new()),
    );
    let community_schema = build_schema(community_state);
    let cfg_resp = community_schema.execute("{ serverConfig { features } }").await;
    assert!(cfg_resp.errors.is_empty(), "{:?}", cfg_resp.errors);
    let features = cfg_resp.data.into_json().unwrap()["serverConfig"]["features"]
      .as_array()
      .unwrap()
      .iter()
      .map(|v| v.as_str().unwrap().to_owned())
      .collect::<Vec<_>>();
    assert!(!features.contains(&"Payment".to_owned()), "community should omit Payment");

    // CommunityExtension returns empty subscriptions/subscriptionBilling and reads public.invoices (including take: 0).
    let community_alice = community_schema
      .execute(
        Request::new(
          r#"{ currentUser { subscriptions { plan } subscriptionBilling { subscriptions { plan } } invoiceCount invoices(take: 0) { amount } } }"#,
        )
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert!(community_alice.errors.is_empty(), "{:?}", community_alice.errors);
    let cu = community_alice.data.into_json().unwrap()["currentUser"].clone();
    assert_eq!(cu["subscriptions"], serde_json::json!([]));
    assert_eq!(cu["invoiceCount"], 0);
    assert_eq!(cu["invoices"], serde_json::json!([]));

    // Disabled-payment error envelopes match v0.27.5 exactly.
    let disabled_prices = community_schema.execute("{ prices { plan } }").await;
    let ext = disabled_prices.errors[0].extensions.as_ref().unwrap();
    assert_eq!(ext.get("status"), Some(&Value::from(500)));
    assert_eq!(ext.get("type"), Some(&Value::from("INTERNAL_SERVER_ERROR")));
    assert_eq!(ext.get("name"), Some(&Value::from("INTERNAL_SERVER_ERROR")));

    let disabled_portal = community_schema
      .execute(
        Request::new("mutation { createCustomerPortal }").data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    let ext = disabled_portal.errors[0].extensions.as_ref().unwrap();
    assert_eq!(ext.get("status"), Some(&Value::from(500)));
    assert_eq!(ext.get("type"), Some(&Value::from("INTERNAL_SERVER_ERROR")));
    assert_eq!(ext.get("name"), Some(&Value::from("CUSTOMER_PORTAL_CREATE_FAILED")));

    let disabled_refresh = community_schema
      .execute(
        Request::new("mutation { refreshUserSubscriptions { plan } }").data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert!(disabled_refresh.errors.is_empty(), "{:?}", disabled_refresh.errors);
    assert_eq!(
      disabled_refresh.data.into_json().unwrap()["refreshUserSubscriptions"],
      serde_json::json!([])
    );

    // 2. Enabled BillingSpi advertises Payment and enforces checkout/auth/error envelopes.
    let billing = Arc::new(RecordingBillingSpi {
      payment_enabled: true,
      ..Default::default()
    });
    let state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        deployment_mode: DeploymentMode::Cloud,
        ..RuntimeConfig::default()
      },
      Arc::new(TestBillingExtension {
        billing: Arc::clone(&billing),
      }),
    );
    let schema = build_schema(Arc::clone(&state));

    let cfg_resp = schema.execute("{ serverConfig { features } }").await;
    let features = cfg_resp.data.into_json().unwrap()["serverConfig"]["features"]
      .as_array()
      .unwrap()
      .iter()
      .map(|v| v.as_str().unwrap().to_owned())
      .collect::<Vec<_>>();
    assert!(features.contains(&"Payment".to_owned()));

    // Anonymous SelfHostedTeam checkout defaults to quantity 10.
    let resp = schema
      .execute(
        r#"mutation { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, successCallbackLink: "/done" }) }"#,
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    assert_eq!(
      billing.last_checkout.lock().unwrap().as_ref().unwrap().quantity,
      Some(10)
    );

    // Anonymous Pro checkout with invalid args.quantity still fails with AUTHENTICATION_REQUIRED.
    let resp = schema
      .execute(
        r#"mutation { createCheckoutSession(input: { plan: Pro, args: { quantity: -1 }, successCallbackLink: "/done" }) }"#,
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("AUTHENTICATION_REQUIRED"))
    );

    // Team checkout ignores args.quantity (quantity is scoped strictly to SelfHostedTeam).
    let resp = schema
      .execute(
        Request::new(
          r#"mutation { createCheckoutSession(input: { plan: Team, args: { workspaceId: "ws_1", quantity: 99 }, successCallbackLink: "/done" }) }"#,
        )
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    assert_eq!(billing.last_checkout.lock().unwrap().as_ref().unwrap().quantity, None);

    // Anonymous prices default throttle: 121 aliases fail on 121st with 429 BEFORE calling list_prices.
    let aliases = (0..121)
      .map(|i| format!("a{i}: prices {{ plan }}"))
      .collect::<Vec<_>>()
      .join(" ");
    let mut throttle_headers = axum::http::HeaderMap::new();
    throttle_headers.insert("x-forwarded-for", "203.0.113.77".parse().unwrap());
    let resp = schema
      .execute(Request::new(format!("{{ {aliases} }}")).data(throttle_headers.clone()))
      .await;
    assert_eq!(resp.errors.len(), 1, "expected 1 throttled alias: {:?}", resp.errors);
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("status"),
      Some(&Value::from(429))
    );
    assert_eq!(billing.price_calls.load(Ordering::SeqCst), 120);

    // Exhausted default bucket also throttles anonymous createCheckoutSession(plan: Pro) with 429 (not 401).
    let resp = schema
      .execute(
        Request::new(r#"mutation { createCheckoutSession(input: { plan: Pro, successCallbackLink: "/done" }) }"#)
          .data(throttle_headers.clone()),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("status"),
      Some(&Value::from(429))
    );
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("TOO_MANY_REQUEST"))
    );

    // Authenticated caller bypasses default throttle completely.
    let resp = schema
      .execute(
        Request::new("{ prices { plan } }")
          .data(AuthenticatedUser {
            user_id: "u_alice".to_owned(),
            user: None,
          })
          .data(throttle_headers),
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);

    // @Auth() guard precedes @Throttle('strict'): 25 anonymous calls all return AUTHENTICATION_REQUIRED.
    let mut strict_headers = axum::http::HeaderMap::new();
    strict_headers.insert("x-forwarded-for", "203.0.113.88".parse().unwrap());
    for _ in 0..25 {
      let resp = schema
        .execute(
          Request::new(r#"mutation { requestApplySubscription(transactionId: "tx_anon") { plan } }"#)
            .data(strict_headers.clone()),
        )
        .await;
      assert_eq!(
        resp.errors[0].extensions.as_ref().unwrap().get("name"),
        Some(&Value::from("AUTHENTICATION_REQUIRED"))
      );
    }

    // UTF-16 length validation rejects 200 astral emoji (= 400 UTF-16 code units > 256).
    let long_emoji = "😀".repeat(200);
    let resp = schema
      .execute(
        Request::new(format!(
          r#"{{ adminPaymentReconciliation(input: {{ userId: "{long_emoji}" }}) {{ userId }} }}"#
        ))
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("status"),
      Some(&Value::from(400))
    );

    // Team checkout without workspaceId fails with WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION.
    let resp = schema
      .execute(
        Request::new(r#"mutation { createCheckoutSession(input: { plan: Team, successCallbackLink: "/done" }) }"#)
          .data(AuthenticatedUser {
            user_id: "u_alice".to_owned(),
            user: None,
          }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION"))
    );

    // Non-owner Bob cannot read WorkspaceType.subscription (ACCESS_DENIED).
    let bob_view = state.users.get_current_user("u_bob").await.unwrap().unwrap();
    let resp = schema
      .execute(
        Request::new(r#"{ workspace(id: "ws_1") { subscription { plan } } }"#).data(AuthenticatedUser {
          user_id: "u_bob".to_owned(),
          user: Some(bob_view),
        }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("ACCESS_DENIED"))
    );

    // Owner Alice can read WorkspaceType.{subscription, invoiceCount, invoices}.
    let alice_view = state.users.get_current_user("u_alice").await.unwrap().unwrap();
    let resp = schema
      .execute(
        Request::new(r#"{ workspace(id: "ws_1") { subscription { plan } invoiceCount invoices { amount } } }"#).data(
          AuthenticatedUser {
            user_id: "u_alice".to_owned(),
            user: Some(alice_view),
          },
        ),
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);

    // cancelSubscription reads Idempotency-Key HTTP header and maps billing errors.
    let mut headers = axum::http::HeaderMap::new();
    headers.insert("idempotency-key", "idem-header-1".parse().unwrap());
    *billing.next_error.lock().unwrap() = Some(DomainError::Forbidden("managed_by_app_store".to_owned()));
    let resp = schema
      .execute(
        Request::new(r#"mutation { cancelSubscription(plan: Pro) { status } }"#)
          .data(AuthenticatedUser {
            user_id: "u_alice".to_owned(),
            user: None,
          })
          .data(headers),
      )
      .await;
    assert_eq!(
      billing.last_intent_id.lock().unwrap().as_deref(),
      Some("idem-header-1")
    );
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("MANAGED_BY_APP_STORE_OR_PLAY"))
    );

    // appStorePurchase rejects mismatched expectedUserId.
    let resp = schema
      .execute(
        Request::new(
          r#"mutation { appStorePurchase(input: { purchaseAction: Prepare, expectedUserId: "u_bob", productId: "pro_m" }) { status } }"#,
        )
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("ACTION_FORBIDDEN"))
    );

    // requestApplySubscription maps ownership conflict to INVALID_SUBSCRIPTION_PARAMETERS.
    let resp = schema
      .execute(
        Request::new(r#"mutation { requestApplySubscription(transactionId: "tx_1") { plan } }"#)
          .data(AuthenticatedUser {
            user_id: "u_alice".to_owned(),
            user: None,
          }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("INVALID_SUBSCRIPTION_PARAMETERS"))
    );

    // Multi-host safeLink uses Host header only (ignores spoofed X-Forwarded-Host),
    // supports protocol-relative allowlisted hosts and whitespace relative URLs, and uses ActionForbidden default message.
    let mut multi_cfg = RuntimeConfig {
      deployment_mode: DeploymentMode::Cloud,
      external_url: "https://primary.affine.test".to_owned(),
      ..RuntimeConfig::default()
    };
    multi_cfg.app_config_baseline.server.hosts = vec!["alt.affine.test".to_owned()];
    multi_cfg.app_config_baseline.server.port = 443;
    let multi_state = AppState::new(
      db.clone(),
      None,
      multi_cfg,
      Arc::new(TestBillingExtension {
        billing: Arc::clone(&billing),
      }),
    );
    let multi_schema = build_schema(multi_state);
    let mut alt_headers = axum::http::HeaderMap::new();
    alt_headers.insert("host", "alt.affine.test".parse().unwrap());
    let resp = multi_schema
      .execute(
        Request::new(
          r#"mutation { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, successCallbackLink: "/done" }) }"#,
        )
        .data(alt_headers),
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    assert_eq!(
      billing.last_checkout.lock().unwrap().as_ref().unwrap().success_url,
      "https://alt.affine.test/done"
    );

    let mut spoof_headers = axum::http::HeaderMap::new();
    spoof_headers.insert("host", "primary.affine.test".parse().unwrap());
    spoof_headers.insert("x-forwarded-host", "alt.affine.test".parse().unwrap());
    let resp = multi_schema
      .execute(
        Request::new(
          r#"mutation { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, successCallbackLink: "/done" }) }"#,
        )
        .data(spoof_headers),
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    assert_eq!(
      billing.last_checkout.lock().unwrap().as_ref().unwrap().success_url,
      "https://primary.affine.test/done"
    );

    // Protocol-relative allowlisted host & whitespace relative URL succeed; external origins fail with ActionForbidden message.
    let resp = multi_schema
      .execute(
        r#"mutation { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, successCallbackLink: "//alt.affine.test/done" }) }"#,
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    assert_eq!(
      billing.last_checkout.lock().unwrap().as_ref().unwrap().success_url,
      "https://alt.affine.test/done"
    );
    let resp = multi_schema
      .execute(
        r#"mutation { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, successCallbackLink: " " }) }"#,
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    assert_eq!(
      billing.last_checkout.lock().unwrap().as_ref().unwrap().success_url,
      "https://primary.affine.test/"
    );
    for bad_link in ["//evil.example/done", "https://evil.example/done"] {
      let resp = multi_schema
        .execute(format!(
          r#"mutation {{ createCheckoutSession(input: {{ plan: SelfHostedTeam, recurring: Yearly, successCallbackLink: "{bad_link}" }}) }}"#
        ))
        .await;
      assert_eq!(
        resp.errors[0].extensions.as_ref().unwrap().get("name"),
        Some(&Value::from("ACTION_FORBIDDEN"))
      );
      assert_eq!(resp.errors[0].message, "You are not allowed to perform this action.");
    }

    // Shared auth callback entry (`createChangePasswordUrl`) also enforces safeLink allowlist & ActionForbidden message.
    let resp = multi_schema
      .execute(
        Request::new(
          r#"mutation { createChangePasswordUrl(callbackUrl: "//alt.affine.test/reset", userId: "u_bob") }"#,
        )
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert!(resp.errors.is_empty(), "{:?}", resp.errors);
    let reset_url = resp.data.into_json().unwrap()["createChangePasswordUrl"]
      .as_str()
      .unwrap()
      .to_owned();
    assert!(
      reset_url.starts_with("https://alt.affine.test/reset"),
      "unexpected reset_url: {reset_url}"
    );
    let resp = multi_schema
      .execute(
        Request::new(
          r#"mutation { createChangePasswordUrl(callbackUrl: "https://evil.example/reset", userId: "u_bob") }"#,
        )
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("ACTION_FORBIDDEN"))
    );
    assert_eq!(resp.errors[0].message, "You are not allowed to perform this action.");

    // SelfHostedTeam quantity accepts integer, integer-valued float (10.0), and u32::MAX (4294967295 / 4294967295.0),
    // and rejects non-integers / out-of-range values.
    for (qty_var, expected) in [
      (serde_json::json!(10), 10_u32),
      (serde_json::json!(10.0), 10_u32),
      (serde_json::json!(u32::MAX), u32::MAX),
      (serde_json::json!(4294967295.0_f64), u32::MAX),
    ] {
      let resp = multi_schema
        .execute(
          Request::new(
            r#"mutation($args: JSONObject) { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, args: $args, successCallbackLink: "/done" }) }"#,
          )
          .variables(async_graphql::Variables::from_json(serde_json::json!({
            "args": { "quantity": qty_var }
          }))),
        )
        .await;
      assert!(resp.errors.is_empty(), "qty={qty_var} failed: {:?}", resp.errors);
      assert_eq!(
        billing.last_checkout.lock().unwrap().as_ref().unwrap().quantity,
        Some(expected)
      );
    }
    for bad_qty in [serde_json::json!(10.5), serde_json::json!(0), serde_json::json!(-1)] {
      let resp = multi_schema
        .execute(
          Request::new(
            r#"mutation($args: JSONObject) { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, args: $args, successCallbackLink: "/done" }) }"#,
          )
          .variables(async_graphql::Variables::from_json(serde_json::json!({
            "args": { "quantity": bad_qty }
          }))),
        )
        .await;
      let ext = resp.errors[0].extensions.as_ref().unwrap();
      assert_eq!(resp.errors[0].message, "Invalid checkout parameters provided.");
      assert_eq!(ext.get("status"), Some(&Value::from(400)));
      assert_eq!(ext.get("type"), Some(&Value::from("INVALID_INPUT")));
      assert_eq!(
        ext.get("name"),
        Some(&Value::from("INVALID_CHECKOUT_PARAMETERS")),
        "bad_qty={bad_qty} resp={:?}",
        resp.errors
      );
    }
    for overflow_qty in [serde_json::json!(4294967296_u64), serde_json::json!(4294967296.0_f64)] {
      let resp = multi_schema
        .execute(
          Request::new(
            r#"mutation($args: JSONObject) { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, args: $args, successCallbackLink: "/done" }) }"#,
          )
          .variables(async_graphql::Variables::from_json(serde_json::json!({
            "args": { "quantity": overflow_qty }
          }))),
        )
        .await;
      let ext = resp.errors[0].extensions.as_ref().unwrap();
      assert_eq!(resp.errors[0].message, "An internal error occurred.");
      assert_eq!(ext.get("status"), Some(&Value::from(500)));
      assert_eq!(ext.get("type"), Some(&Value::from("INTERNAL_SERVER_ERROR")));
      assert_eq!(
        ext.get("name"),
        Some(&Value::from("INTERNAL_SERVER_ERROR")),
        "overflow_qty={overflow_qty} resp={:?}",
        resp.errors
      );
    }
    // Validation order: Zod positive-int (400) -> safeLink (403) -> native u32 decode (500).
    let resp = multi_schema
      .execute(
        Request::new(
          r#"mutation($args: JSONObject) { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, args: $args, successCallbackLink: "https://evil.example/done" }) }"#,
        )
        .variables(async_graphql::Variables::from_json(serde_json::json!({
          "args": { "quantity": 10.5 }
        }))),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("name"),
      Some(&Value::from("INVALID_CHECKOUT_PARAMETERS"))
    );
    let resp = multi_schema
      .execute(
        Request::new(
          r#"mutation($args: JSONObject) { createCheckoutSession(input: { plan: SelfHostedTeam, recurring: Yearly, args: $args, successCallbackLink: "https://evil.example/done" }) }"#,
        )
        .variables(async_graphql::Variables::from_json(serde_json::json!({
          "args": { "quantity": 4294967296_u64 }
        }))),
      )
      .await;
    let ext = resp.errors[0].extensions.as_ref().unwrap();
    assert_eq!(resp.errors[0].message, "You are not allowed to perform this action.");
    assert_eq!(ext.get("status"), Some(&Value::from(403)));
    assert_eq!(ext.get("name"), Some(&Value::from("ACTION_FORBIDDEN")));

    // reconcileAdminPayment guard order: Auth -> Strict Throttle -> Admin.
    let mut rec_headers = axum::http::HeaderMap::new();
    rec_headers.insert("x-forwarded-for", "203.0.113.89".parse().unwrap());
    let rec_query = r#"mutation { reconcileAdminPayment(input: { userId: "u_bob", planFamily: Pro, requestId: "req-g", evidence: "ok" }) { status } }"#;
    for _ in 0..25 {
      let resp = schema
        .execute(Request::new(rec_query).data(rec_headers.clone()))
        .await;
      assert_eq!(
        resp.errors[0].extensions.as_ref().unwrap().get("name"),
        Some(&Value::from("AUTHENTICATION_REQUIRED"))
      );
    }
    for i in 0..21 {
      let resp = schema
        .execute(
          Request::new(rec_query)
            .data(AuthenticatedUser {
              user_id: "u_bob".to_owned(),
              user: None,
            })
            .data(rec_headers.clone()),
        )
        .await;
      let ext = resp.errors[0].extensions.as_ref().unwrap();
      if i < 20 {
        assert_eq!(resp.errors[0].message, "You are not allowed to perform this action.");
        assert_eq!(ext.get("status"), Some(&Value::from(403)));
        assert_eq!(ext.get("type"), Some(&Value::from("ACTION_FORBIDDEN")));
        assert_eq!(ext.get("name"), Some(&Value::from("ACTION_FORBIDDEN")));
      } else {
        assert_eq!(ext.get("status"), Some(&Value::from(429)));
        assert_eq!(ext.get("name"), Some(&Value::from("TOO_MANY_REQUEST")));
      }
    }

    // Invoices pagination: 105 rows for both u_alice and ws_1 -> default 8, explicit take: 101 -> 101.
    for idx in 0..105_i32 {
      let ts = now - chrono::Duration::seconds(i64::from(idx));
      sqlx::query(
        "INSERT INTO invoices (stripe_invoice_id, target_id, currency, amount, status, created_at, updated_at, reason) \
         VALUES ($1, 'u_alice', 'usd', $2, 'paid', $3, $3, 'subscription_cycle'), \
                ($4, 'ws_1', 'usd', $2, 'paid', $3, $3, 'subscription_cycle')",
      )
      .bind(format!("inv_u_{idx}"))
      .bind(100 + idx)
      .bind(ts)
      .bind(format!("inv_w_{idx}"))
      .execute(db.pool())
      .await
      .unwrap();
    }
    let alice_view = state.users.get_current_user("u_alice").await.unwrap().unwrap();
    let inv_resp = schema
      .execute(
        Request::new(
          r#"{
            currentUser { invoiceCount defInv: invoices { amount } bigInv: invoices(take: 101) { amount } }
            workspace(id: "ws_1") { invoiceCount defInv: invoices { amount } bigInv: invoices(take: 101) { amount } }
          }"#,
        )
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: Some(alice_view),
        }),
      )
      .await;
    assert!(inv_resp.errors.is_empty(), "{:?}", inv_resp.errors);
    let inv_json = inv_resp.data.into_json().unwrap();
    for root in ["currentUser", "workspace"] {
      assert_eq!(inv_json[root]["invoiceCount"], 105, "{root} invoiceCount");
      assert_eq!(inv_json[root]["defInv"].as_array().unwrap().len(), 8, "{root} default take");
      assert_eq!(inv_json[root]["bigInv"].as_array().unwrap().len(), 100, "{root} take clamped at 100");
    }

    // reconcileAdminPayment evidence: 2000 CJK chars (6000 UTF-8 bytes, 2000 UTF-16 units) succeeds;
    // BOM-only ("\u{FEFF} \u{FEFF}") rejected with 400; NEL ("\u{0085}") preserved per JS trim().
    let mut ev_headers = axum::http::HeaderMap::new();
    ev_headers.insert("x-forwarded-for", "203.0.113.90".parse().unwrap());
    let cjk_2000 = "证".repeat(2000);
    let resp = schema
      .execute(
        Request::new(
          r#"mutation($ev: String!) { reconcileAdminPayment(input: { userId: "u_bob", planFamily: Pro, requestId: "req-cjk", evidence: $ev }) { status } }"#,
        )
        .variables(async_graphql::Variables::from_json(serde_json::json!({ "ev": cjk_2000 })))
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        })
        .data(ev_headers.clone()),
      )
      .await;
    assert!(resp.errors.is_empty(), "2000 CJK chars must pass: {:?}", resp.errors);
    assert_eq!(
      billing.last_reconcile.lock().unwrap().as_ref().unwrap().evidence.chars().count(),
      2000
    );

    let resp = schema
      .execute(
        Request::new(
          r#"mutation($ev: String!) { reconcileAdminPayment(input: { userId: "u_bob", planFamily: Pro, requestId: "req-bom", evidence: $ev }) { status } }"#,
        )
        .variables(async_graphql::Variables::from_json(serde_json::json!({ "ev": "\u{FEFF} \u{FEFF}" })))
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        })
        .data(ev_headers.clone()),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("status"),
      Some(&Value::from(400))
    );

    let resp = schema
      .execute(
        Request::new(
          r#"mutation($ev: String!) { reconcileAdminPayment(input: { userId: "u_bob", planFamily: Pro, requestId: "req-nel", evidence: $ev }) { status } }"#,
        )
        .variables(async_graphql::Variables::from_json(serde_json::json!({ "ev": "\u{0085}" })))
        .data(AuthenticatedUser {
          user_id: "u_alice".to_owned(),
          user: None,
        })
        .data(ev_headers),
      )
      .await;
    assert!(resp.errors.is_empty(), "NEL must not be trimmed by JS trim(): {:?}", resp.errors);
    assert_eq!(
      billing.last_reconcile.lock().unwrap().as_ref().unwrap().evidence,
      "\u{0085}"
    );

    // Selfhosted mode returns 404 for adminPaymentReconciliation.
    let selfhost_state = AppState::new(
      db.clone(),
      None,
      RuntimeConfig {
        deployment_mode: DeploymentMode::Selfhosted,
        ..RuntimeConfig::default()
      },
      Arc::new(TestBillingExtension {
        billing: Arc::clone(&billing),
      }),
    );
    let selfhost_schema = build_schema(selfhost_state);
    let resp = selfhost_schema
      .execute(
        Request::new(r#"{ adminPaymentReconciliation(input: { userId: "u_alice" }) { userId } }"#)
          .data(AuthenticatedUser {
            user_id: "u_alice".to_owned(),
            user: None,
          }),
      )
      .await;
    assert_eq!(
      resp.errors[0].extensions.as_ref().unwrap().get("status"),
      Some(&Value::from(404))
    );

    db.pool().close().await;
  });
}
