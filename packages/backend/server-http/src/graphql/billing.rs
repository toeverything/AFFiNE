//! Commercial billing and entitlement GraphQL types, queries, and mutations.

use std::sync::Arc;

use async_graphql::{Context, Enum, InputObject, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use server_spi::{
  AdminPaymentAttemptRecord, AdminPaymentCaseRecord, AdminPaymentLookupSpiInput, AdminPaymentResolutionRecord,
  AdminPaymentSourceRecord, BillingAppStorePurchaseInput, BillingAppStorePurchaseResult, BillingCheckoutInput,
  BillingGroupRecord, BillingInvoiceRecord, BillingPriceRecord, BillingSourceRecord, BillingSubscriptionList,
  BillingSubscriptionRecord, ReconcileAdminPaymentSpiInput,
};
use server_types::{DeploymentMode, DomainError};

use super::license::{SubscriptionPlan, SubscriptionRecurring, SubscriptionVariant};
use super::{
  JsonObjectScalar, current_authenticated_user, enforce_default_throttle_if_anonymous_graphql,
  enforce_strict_throttle_graphql, require_admin_user, require_authenticated_user,
};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::rest::validate_safe_link_callback_url_for_request;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionStatus")]
pub enum SubscriptionStatus {
  #[graphql(name = "Active")]
  Active,
  #[graphql(name = "Canceled")]
  Canceled,
  #[graphql(name = "Incomplete")]
  Incomplete,
  #[graphql(name = "IncompleteExpired")]
  IncompleteExpired,
  #[graphql(name = "PastDue")]
  PastDue,
  #[graphql(name = "Paused")]
  Paused,
  #[graphql(name = "Trialing")]
  Trialing,
  #[graphql(name = "Unpaid")]
  Unpaid,
}

impl SubscriptionStatus {
  fn parse(s: &str) -> Self {
    match s.to_ascii_lowercase().as_str() {
      "active" => Self::Active,
      "past_due" => Self::PastDue,
      "unpaid" => Self::Unpaid,
      "canceled" => Self::Canceled,
      "incomplete" => Self::Incomplete,
      "paused" => Self::Paused,
      "incomplete_expired" => Self::IncompleteExpired,
      "trialing" => Self::Trialing,
      _ => Self::Incomplete,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "InvoiceStatus")]
pub enum InvoiceStatus {
  #[graphql(name = "Draft")]
  Draft,
  #[graphql(name = "Open")]
  Open,
  #[graphql(name = "Paid")]
  Paid,
  #[graphql(name = "Uncollectible")]
  Uncollectible,
  #[graphql(name = "Void")]
  Void,
}

impl InvoiceStatus {
  fn parse(s: &str) -> Self {
    match s.to_ascii_lowercase().as_str() {
      "draft" => Self::Draft,
      "open" => Self::Open,
      "paid" => Self::Paid,
      "uncollectible" => Self::Uncollectible,
      "void" => Self::Void,
      _ => Self::Draft,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "AppStorePurchaseAction")]
pub enum AppStorePurchaseAction {
  #[graphql(name = "Cancel")]
  Cancel,
  #[graphql(name = "Claim")]
  Claim,
  #[graphql(name = "Prepare")]
  Prepare,
  #[graphql(name = "Restore")]
  Restore,
  #[graphql(name = "Submit")]
  Submit,
}

impl AppStorePurchaseAction {
  fn as_str(self) -> &'static str {
    match self {
      Self::Cancel => "cancel",
      Self::Claim => "claim",
      Self::Prepare => "prepare",
      Self::Restore => "restore",
      Self::Submit => "submit",
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "AdminPaymentPlanFamily")]
pub enum AdminPaymentPlanFamily {
  #[graphql(name = "AI")]
  Ai,
  #[graphql(name = "Pro")]
  Pro,
}

impl AdminPaymentPlanFamily {
  fn as_str(self) -> &'static str {
    match self {
      Self::Ai => "ai",
      Self::Pro => "pro",
    }
  }

  fn parse(s: &str) -> Self {
    if s.eq_ignore_ascii_case("ai") {
      Self::Ai
    } else {
      Self::Pro
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "AdminPaymentResolutionStatus")]
pub enum AdminPaymentResolutionStatus {
  #[graphql(name = "Pending")]
  Pending,
  #[graphql(name = "Resolved")]
  Resolved,
}

impl AdminPaymentResolutionStatus {
  fn parse(s: &str) -> Self {
    if s.eq_ignore_ascii_case("resolved") {
      Self::Resolved
    } else {
      Self::Pending
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionPrice")]
pub struct SubscriptionPrice {
  pub amount: Option<i32>,
  pub currency: String,
  pub lifetime_amount: Option<i32>,
  pub plan: SubscriptionPlan,
  #[graphql(name = "type")]
  pub price_type: String,
  pub yearly_amount: Option<i32>,
}

impl From<BillingPriceRecord> for SubscriptionPrice {
  fn from(r: BillingPriceRecord) -> Self {
    Self {
      amount: r.amount,
      currency: r.currency,
      lifetime_amount: r.lifetime_amount,
      plan: SubscriptionPlan::parse(&r.plan),
      price_type: r.price_type,
      yearly_amount: r.yearly_amount,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionType")]
pub struct SubscriptionType {
  pub canceled_at: Option<DateTime<Utc>>,
  pub created_at: DateTime<Utc>,
  pub end: Option<DateTime<Utc>>,
  /// If provider is revenuecat, indicates underlying store. Read-only. One of: app_store | play_store
  pub iap_store: Option<String>,
  #[graphql(deprecation = "removed")]
  pub id: Option<String>,
  pub next_bill_at: Option<DateTime<Utc>>,
  /// The 'Free' plan just exists to be a placeholder and for the type convenience of frontend.
  /// There won't actually be a subscription with plan 'Free'
  pub plan: SubscriptionPlan,
  /// Payment provider of this subscription. Read-only. One of: stripe | revenuecat
  pub provider: Option<String>,
  pub recurring: SubscriptionRecurring,
  pub start: DateTime<Utc>,
  pub status: SubscriptionStatus,
  pub trial_end: Option<DateTime<Utc>>,
  pub trial_start: Option<DateTime<Utc>>,
  pub updated_at: DateTime<Utc>,
  pub variant: Option<SubscriptionVariant>,
}

impl From<BillingSubscriptionRecord> for SubscriptionType {
  fn from(r: BillingSubscriptionRecord) -> Self {
    Self {
      canceled_at: r.canceled_at,
      created_at: r.created_at,
      end: r.end,
      iap_store: r.iap_store,
      id: r.stripe_subscription_id,
      next_bill_at: r.next_bill_at,
      plan: SubscriptionPlan::parse(&r.plan),
      provider: r.provider,
      recurring: SubscriptionRecurring::parse(&r.recurring),
      start: r.start,
      status: SubscriptionStatus::parse(&r.status),
      trial_end: r.trial_end,
      trial_start: r.trial_start,
      updated_at: r.updated_at,
      variant: r.variant.as_deref().and_then(SubscriptionVariant::parse),
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "InvoiceType")]
pub struct InvoiceType {
  pub amount: i32,
  pub created_at: DateTime<Utc>,
  pub currency: String,
  pub last_payment_error: Option<String>,
  pub link: Option<String>,
  #[graphql(deprecation = "removed")]
  pub plan: Option<SubscriptionPlan>,
  pub reason: String,
  #[graphql(deprecation = "removed")]
  pub recurring: Option<SubscriptionRecurring>,
  pub status: InvoiceStatus,
  pub updated_at: DateTime<Utc>,
}

impl From<BillingInvoiceRecord> for InvoiceType {
  fn from(r: BillingInvoiceRecord) -> Self {
    Self {
      amount: r.amount,
      created_at: r.created_at,
      currency: r.currency,
      last_payment_error: r.last_payment_error,
      link: r.link,
      plan: None,
      reason: r.reason,
      recurring: None,
      status: InvoiceStatus::parse(&r.status),
      updated_at: r.updated_at,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionBillingSource")]
pub struct SubscriptionBillingSource {
  pub iap_store: Option<String>,
  pub id: String,
  pub provider: String,
  pub recurring: Option<SubscriptionRecurring>,
}

impl From<BillingSourceRecord> for SubscriptionBillingSource {
  fn from(r: BillingSourceRecord) -> Self {
    Self {
      iap_store: r.iap_store,
      id: r.id,
      provider: r.provider,
      recurring: r.recurring.as_deref().map(SubscriptionRecurring::parse),
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionBillingGroup")]
pub struct SubscriptionBillingGroup {
  pub plan: SubscriptionPlan,
  pub sources: Vec<SubscriptionBillingSource>,
}

impl From<BillingGroupRecord> for SubscriptionBillingGroup {
  fn from(r: BillingGroupRecord) -> Self {
    Self {
      plan: SubscriptionPlan::parse(&r.plan),
      sources: r.sources.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "SubscriptionBillingInfo")]
pub struct SubscriptionBillingInfo {
  pub conflicts: Vec<SubscriptionBillingGroup>,
  pub manageable: Vec<SubscriptionBillingGroup>,
  pub subscriptions: Vec<SubscriptionType>,
}

impl From<BillingSubscriptionList> for SubscriptionBillingInfo {
  fn from(r: BillingSubscriptionList) -> Self {
    Self {
      conflicts: r.conflicts.into_iter().map(Into::into).collect(),
      manageable: r.manageable.into_iter().map(Into::into).collect(),
      subscriptions: r.subscriptions.into_iter().map(Into::into).collect(),
    }
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "CreateCheckoutSessionInput")]
pub struct CreateCheckoutSessionInput {
  pub args: Option<JsonObjectScalar>,
  pub coupon: Option<String>,
  #[graphql(deprecation = "not required anymore")]
  pub idempotency_key: Option<String>,
  #[graphql(default_with = "Some(SubscriptionPlan::Pro)")]
  pub plan: Option<SubscriptionPlan>,
  #[graphql(default_with = "Some(SubscriptionRecurring::Yearly)")]
  pub recurring: Option<SubscriptionRecurring>,
  pub success_callback_link: String,
  pub variant: Option<SubscriptionVariant>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AppStorePurchaseInput")]
pub struct AppStorePurchaseInput {
  pub attempt_id: Option<String>,
  pub expected_user_id: String,
  pub intent_id: Option<String>,
  pub product_id: String,
  pub purchase_action: AppStorePurchaseAction,
  pub transaction_id: Option<String>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AppStorePurchaseResult")]
pub struct AppStorePurchaseResult {
  pub attempt_id: Option<String>,
  pub provider: Option<String>,
  pub status: String,
}

impl From<BillingAppStorePurchaseResult> for AppStorePurchaseResult {
  fn from(r: BillingAppStorePurchaseResult) -> Self {
    Self {
      attempt_id: r.attempt_id,
      provider: r.provider,
      status: r.status,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminPaymentSource")]
pub struct AdminPaymentSource {
  pub external_customer_id: Option<String>,
  pub external_ref: Option<String>,
  pub external_subscription_id: Option<String>,
  pub id: String,
  pub provider: String,
  pub provider_namespace: Option<String>,
  pub source_identity: Option<String>,
  pub status: String,
}

impl From<AdminPaymentSourceRecord> for AdminPaymentSource {
  fn from(r: AdminPaymentSourceRecord) -> Self {
    Self {
      external_customer_id: r.external_customer_id,
      external_ref: r.external_ref,
      external_subscription_id: r.external_subscription_id,
      id: r.id,
      provider: r.provider,
      provider_namespace: r.provider_namespace,
      source_identity: r.source_identity,
      status: r.status,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminPaymentAttempt")]
pub struct AdminPaymentAttempt {
  pub id: String,
  pub product_id: Option<String>,
  pub provider: String,
  pub provider_namespace: String,
  pub session_id: Option<String>,
  pub status: String,
  pub transaction_id: Option<String>,
}

impl From<AdminPaymentAttemptRecord> for AdminPaymentAttempt {
  fn from(r: AdminPaymentAttemptRecord) -> Self {
    Self {
      id: r.id,
      product_id: r.product_id,
      provider: r.provider,
      provider_namespace: r.provider_namespace,
      session_id: r.session_id,
      status: r.status,
      transaction_id: r.transaction_id,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminPaymentCase")]
pub struct AdminPaymentCase {
  pub attempts: Vec<AdminPaymentAttempt>,
  pub bound_provider_namespace: Option<String>,
  pub bound_source_identity: Option<String>,
  pub conflicted: bool,
  pub plan_family: AdminPaymentPlanFamily,
  pub sources: Vec<AdminPaymentSource>,
  pub user_id: String,
}

impl From<AdminPaymentCaseRecord> for AdminPaymentCase {
  fn from(r: AdminPaymentCaseRecord) -> Self {
    Self {
      attempts: r.attempts.into_iter().map(Into::into).collect(),
      bound_provider_namespace: r.bound_provider_namespace,
      bound_source_identity: r.bound_source_identity,
      conflicted: r.conflicted,
      plan_family: AdminPaymentPlanFamily::parse(&r.plan_family),
      sources: r.sources.into_iter().map(Into::into).collect(),
      user_id: r.user_id,
    }
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminPaymentResolution")]
pub struct AdminPaymentResolution {
  pub attempt_id: Option<String>,
  pub attempt_status: Option<String>,
  pub bound_provider_namespace: Option<String>,
  pub bound_source_identity: Option<String>,
  pub conflicted: bool,
  pub plan_family: AdminPaymentPlanFamily,
  pub reason: Option<String>,
  pub request_id: String,
  pub status: AdminPaymentResolutionStatus,
  pub user_id: String,
}

impl From<AdminPaymentResolutionRecord> for AdminPaymentResolution {
  fn from(r: AdminPaymentResolutionRecord) -> Self {
    Self {
      attempt_id: r.attempt_id,
      attempt_status: r.attempt_status,
      bound_provider_namespace: r.bound_provider_namespace,
      bound_source_identity: r.bound_source_identity,
      conflicted: r.conflicted,
      plan_family: AdminPaymentPlanFamily::parse(&r.plan_family),
      reason: r.reason,
      request_id: r.request_id,
      status: AdminPaymentResolutionStatus::parse(&r.status),
      user_id: r.user_id,
    }
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AdminPaymentLookupInput")]
pub struct AdminPaymentLookupInput {
  pub plan_family: Option<AdminPaymentPlanFamily>,
  pub provider_identity: Option<String>,
  pub user_id: Option<String>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ReconcileAdminPaymentInput")]
pub struct ReconcileAdminPaymentInput {
  pub attempt_id: Option<String>,
  pub evidence: String,
  pub plan_family: AdminPaymentPlanFamily,
  pub request_id: String,
  pub transaction_id: Option<String>,
  pub user_id: String,
}

fn is_staff_email(email: &str) -> bool {
  let lower = email.to_ascii_lowercase();
  lower.ends_with("@toeverything.info") || lower.ends_with("@affine.pro")
}

fn request_idempotency_key(ctx: &Context<'_>) -> Option<String> {
  ctx
    .data_opt::<axum::http::HeaderMap>()
    .and_then(|h| h.get("idempotency-key"))
    .and_then(|v| v.to_str().ok())
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(str::to_owned)
}

fn map_billing_error(err: DomainError, plan: Option<&str>, recurring: Option<&str>) -> async_graphql::Error {
  let msg = match &err {
    DomainError::Unauthorized(m)
    | DomainError::Forbidden(m)
    | DomainError::NotFound(m)
    | DomainError::Conflict(m)
    | DomainError::Validation(m)
    | DomainError::PreconditionFailed(m)
    | DomainError::RateLimited(m)
    | DomainError::Unavailable(m)
    | DomainError::Internal(m) => m.as_str(),
    DomainError::QuotaExceeded { message, .. } => message.as_str(),
  };
  let plan_str = plan.unwrap_or("pro");
  let recurring_str = recurring.unwrap_or("monthly");
  let mapped = if msg.contains("workspace_payment_denied") {
    DomainError::Forbidden("access_denied".to_owned())
  } else if msg.contains("subscription_not_found") {
    DomainError::NotFound(format!("subscription_not_exists:{plan_str}"))
  } else if msg.contains("subscription_plan_not_found") {
    DomainError::NotFound(format!("subscription_plan_not_found:{plan_str}:{recurring_str}"))
  } else if msg.contains("managed_by_app_store") {
    DomainError::Forbidden("managed_by_app_store_or_play".to_owned())
  } else if msg.contains("cant_update_onetime_subscription") {
    DomainError::Forbidden("cant_update_onetime_payment_subscription".to_owned())
  } else if msg.contains("subscription_already_canceled") {
    DomainError::Forbidden("subscription_has_been_canceled".to_owned())
  } else if msg.contains("subscription_not_canceled") {
    DomainError::Forbidden("subscription_has_not_been_canceled".to_owned())
  } else if msg.contains("same_subscription_recurring") {
    DomainError::Validation(format!("same_subscription_recurring:{recurring_str}"))
  } else if msg.contains("purchase_in_progress") || msg.contains("payment_busy") {
    DomainError::Forbidden("purchase_in_progress".to_owned())
  } else if msg.contains("purchase_needs_verification") || msg.contains("payment_operation_blocked") {
    DomainError::Forbidden("purchase_needs_verification".to_owned())
  } else if msg.contains("subscription_already_exists") {
    DomainError::Conflict(format!("subscription_already_exists:{plan_str}"))
  } else if msg.contains("license_already_revealed") {
    DomainError::Forbidden("license_revealed".to_owned())
  } else if msg.contains("invalid_license_session") {
    DomainError::Validation("invalid_license_session_id".to_owned())
  } else if msg.contains("invalid checkout parameters") {
    DomainError::Validation("invalid_checkout_parameters".to_owned())
  } else {
    match err {
      DomainError::PreconditionFailed(m) => DomainError::Internal(m),
      other => other,
    }
  };
  domain_error_to_graphql(&mapped)
}

async fn assert_workspace_payment_manage(state: &AppState, user_id: &str, workspace_id: &str) -> Result<()> {
  let perms = state
    .workspaces
    .resolve_workspace_permissions(user_id, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if !perms.payment_manage {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "access_denied".to_owned(),
    )));
  }
  Ok(())
}

fn is_js_whitespace(c: char) -> bool {
  matches!(
    c,
    '\u{0009}'..='\u{000D}'
      | '\u{0020}'
      | '\u{00A0}'
      | '\u{1680}'
      | '\u{2000}'..='\u{200A}'
      | '\u{2028}'
      | '\u{2029}'
      | '\u{202F}'
      | '\u{205F}'
      | '\u{3000}'
      | '\u{FEFF}'
  )
}

fn js_trim(s: &str) -> &str {
  s.trim_matches(is_js_whitespace)
}

fn validate_opt_identifier(raw: Option<String>) -> std::result::Result<Option<String>, ()> {
  let Some(value) = raw else {
    return Ok(None);
  };
  let trimmed = js_trim(&value);
  if trimmed.is_empty() || trimmed.encode_utf16().count() > 256 {
    return Err(());
  }
  Ok(Some(trimmed.to_owned()))
}

fn validate_req_identifier(raw: String, max_len: usize) -> std::result::Result<String, ()> {
  let trimmed = js_trim(&raw);
  if trimmed.is_empty() || trimmed.encode_utf16().count() > max_len {
    return Err(());
  }
  Ok(trimmed.to_owned())
}

fn assert_cloud_only(state: &AppState) -> Result<()> {
  if state.config.load().deployment_mode == DeploymentMode::Selfhosted {
    return Err(domain_error_to_graphql(&DomainError::NotFound("Not Found".to_owned())));
  }
  Ok(())
}

fn assert_user_subscription_plan(plan: SubscriptionPlan) -> Result<()> {
  if !matches!(plan, SubscriptionPlan::Pro | SubscriptionPlan::Ai) {
    return Err(domain_error_to_graphql(&DomainError::NotFound(format!(
      "subscription_not_exists:{}",
      plan.as_str()
    ))));
  }
  Ok(())
}

#[derive(Default)]
pub struct BillingQuery;

#[Object]
impl BillingQuery {
  async fn prices(&self, ctx: &Context<'_>) -> Result<Vec<SubscriptionPrice>> {
    enforce_default_throttle_if_anonymous_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let effective = state
      .app_config
      .get_effective_app_config()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let show_lifetime = effective
      .pointer("/payment/showLifetimePrice")
      .and_then(|v| v.as_bool())
      .unwrap_or(false);
    let prices = state
      .extension
      .billing_spi()
      .list_prices(show_lifetime)
      .await
      .map_err(|e| map_billing_error(e, None, None))?;
    Ok(prices.into_iter().map(Into::into).collect())
  }

  async fn checkout_attempt(&self, ctx: &Context<'_>, plan: SubscriptionPlan) -> Result<Option<String>> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .extension
      .billing_spi()
      .checkout_attempt(&user.id, plan.as_str())
      .await
      .map_err(|e| map_billing_error(e, Some(plan.as_str()), None))
  }

  async fn admin_payment_reconciliation(
    &self,
    ctx: &Context<'_>,
    input: AdminPaymentLookupInput,
  ) -> Result<Vec<AdminPaymentCase>> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_cloud_only(state)?;
    let bad_req = || {
      domain_error_to_graphql(&DomainError::Validation(
        "Provide an account ID or provider identity.".to_owned(),
      ))
    };
    let user_id = validate_opt_identifier(input.user_id).map_err(|_| bad_req())?;
    let provider_identity = validate_opt_identifier(input.provider_identity).map_err(|_| bad_req())?;
    if user_id.is_none() && provider_identity.is_none() {
      return Err(bad_req());
    }
    let cases = state
      .extension
      .billing_spi()
      .inspect_payment_reconciliation(AdminPaymentLookupSpiInput {
        user_id,
        plan_family: input.plan_family.map(|p| p.as_str().to_owned()),
        provider_identity,
      })
      .await
      .map_err(|e| map_billing_error(e, None, None))?;
    Ok(cases.into_iter().map(Into::into).collect())
  }
}

#[derive(Default)]
pub struct BillingMutation;

#[Object]
impl BillingMutation {
  /// Create a subscription checkout link of stripe
  async fn create_checkout_session(&self, ctx: &Context<'_>, input: CreateCheckoutSessionInput) -> Result<String> {
    enforce_default_throttle_if_anonymous_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg = state.config.load();
    let user = match current_authenticated_user(ctx) {
      Some(_) => Some(require_authenticated_user(ctx).await?),
      None => None,
    };
    if cfg.channel == "canary"
      && !cfg.dev_mode
      && let Some(u) = &user
      && !is_staff_email(&u.email)
    {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Action forbidden".to_owned(),
      )));
    }

    let plan = input.plan.unwrap_or(SubscriptionPlan::Pro);
    let recurring = input.recurring.unwrap_or(SubscriptionRecurring::Yearly);
    let args_obj = input.args.as_ref().and_then(|v| v.0.as_object());
    let arg_workspace_id = args_obj
      .and_then(|o| o.get("workspaceId"))
      .and_then(|v| v.as_str())
      .map(str::to_owned);

    let (target_type, target_id, pending_qty) = if plan == SubscriptionPlan::SelfHostedTeam {
      let q = match args_obj.and_then(|o| o.get("quantity")) {
        None | Some(serde_json::Value::Null) => Ok(10_u32),
        Some(v) => {
          if let Some(u) = v.as_u64().filter(|&u| u >= 1) {
            u32::try_from(u).map_err(|_| ())
          } else if let Some(i) = v.as_i64().filter(|&i| i >= 1) {
            u32::try_from(i).map_err(|_| ())
          } else if let Some(f) = v.as_f64().filter(|f| f.is_finite() && f.fract() == 0.0 && *f >= 1.0) {
            if f <= f64::from(u32::MAX) {
              Ok(f as u32)
            } else {
              Err(())
            }
          } else {
            return Err(domain_error_to_graphql(&DomainError::Validation(
              "invalid_checkout_parameters".to_owned(),
            )));
          }
        }
      };
      ("instance".to_owned(), None, Some(q))
    } else {
      let Some(u) = &user else {
        return Err(domain_error_to_graphql(&DomainError::Unauthorized(
          "Authentication required".to_owned(),
        )));
      };
      if plan == SubscriptionPlan::Team {
        let Some(ws_id) = arg_workspace_id.filter(|s| !s.is_empty()) else {
          return Err(domain_error_to_graphql(&DomainError::Validation(
            "workspace_id_required_to_update_team_subscription".to_owned(),
          )));
        };
        assert_workspace_payment_manage(state, &u.id, &ws_id).await?;
        ("workspace".to_owned(), Some(ws_id), None)
      } else {
        ("user".to_owned(), Some(u.id.clone()), None)
      }
    };

    let raw_link = if input.success_callback_link.is_empty() {
      "/"
    } else {
      input.success_callback_link.as_str()
    };
    let success_url =
      validate_safe_link_callback_url_for_request(state, ctx.data_opt::<axum::http::HeaderMap>(), raw_link)
        .await
        .map_err(|e| domain_error_to_graphql(&e))?;

    let quantity = match pending_qty {
      Some(Ok(q)) => Some(q),
      Some(Err(())) => {
        return Err(domain_error_to_graphql(&DomainError::Internal(
          "checkout_quantity_u32_overflow".to_owned(),
        )));
      }
      None => None,
    };

    let intent_id = input
      .idempotency_key
      .filter(|s| !s.trim().is_empty())
      .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let result = state
      .extension
      .billing_spi()
      .create_checkout(BillingCheckoutInput {
        actor_user_id: user.as_ref().map(|u| u.id.clone()),
        user_email: user.as_ref().map(|u| u.email.clone()),
        target_type,
        target_id,
        plan: plan.as_str().to_owned(),
        recurring: recurring.as_str().to_owned(),
        variant: input.variant.map(|v| v.as_str().to_owned()),
        coupon: input.coupon,
        quantity,
        success_url,
        intent_id,
      })
      .await
      .map_err(|e| map_billing_error(e, Some(plan.as_str()), Some(recurring.as_str())))?;

    if result.url.is_empty() {
      return Err(domain_error_to_graphql(&DomainError::Internal(
        "failed_to_checkout".to_owned(),
      )));
    }
    Ok(result.url)
  }

  async fn expire_checkout(&self, ctx: &Context<'_>, plan: SubscriptionPlan, attempt_id: String) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .extension
      .billing_spi()
      .expire_checkout(&user.id, plan.as_str(), &attempt_id)
      .await
      .map_err(|e| map_billing_error(e, Some(plan.as_str()), None))
  }

  async fn app_store_purchase(
    &self,
    ctx: &Context<'_>,
    input: AppStorePurchaseInput,
  ) -> Result<AppStorePurchaseResult> {
    let user = require_authenticated_user(ctx).await?;
    if input.expected_user_id != user.id {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Action forbidden".to_owned(),
      )));
    }
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg = state.config.load();
    if cfg.channel == "canary"
      && !cfg.dev_mode
      && !is_staff_email(&user.email)
      && matches!(
        input.purchase_action,
        AppStorePurchaseAction::Prepare | AppStorePurchaseAction::Claim
      )
    {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Action forbidden".to_owned(),
      )));
    }
    let res = state
      .extension
      .billing_spi()
      .app_store_purchase(
        &user.id,
        BillingAppStorePurchaseInput {
          purchase_action: input.purchase_action.as_str().to_owned(),
          product_id: input.product_id,
          intent_id: input.intent_id,
          attempt_id: input.attempt_id,
          transaction_id: input.transaction_id,
        },
      )
      .await
      .map_err(|e| map_billing_error(e, None, None))?;
    Ok(res.into())
  }

  /// Create a stripe customer portal to manage payment methods
  async fn create_customer_portal(&self, ctx: &Context<'_>) -> Result<String> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .extension
      .billing_spi()
      .create_customer_portal(&user.id)
      .await
      .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("payment_customer_not_found") {
          domain_error_to_graphql(&DomainError::NotFound("user_not_found".to_owned()))
        } else {
          domain_error_to_graphql(&DomainError::Internal("customer_portal_create_failed".to_owned()))
        }
      })
  }

  async fn cancel_subscription(
    &self,
    ctx: &Context<'_>,
    #[graphql(default_with = "Some(SubscriptionPlan::Pro)")] plan: Option<SubscriptionPlan>,
    workspace_id: Option<String>,
    #[graphql(deprecation = "use header `Idempotency-Key`")] _idempotency_key: Option<String>,
  ) -> Result<SubscriptionType> {
    mutate_subscription_common(ctx, plan.unwrap_or(SubscriptionPlan::Pro), workspace_id, "cancel").await
  }

  async fn resume_subscription(
    &self,
    ctx: &Context<'_>,
    #[graphql(default_with = "Some(SubscriptionPlan::Pro)")] plan: Option<SubscriptionPlan>,
    workspace_id: Option<String>,
    #[graphql(deprecation = "use header `Idempotency-Key`")] _idempotency_key: Option<String>,
  ) -> Result<SubscriptionType> {
    mutate_subscription_common(ctx, plan.unwrap_or(SubscriptionPlan::Pro), workspace_id, "resume").await
  }

  async fn update_subscription_recurring(
    &self,
    ctx: &Context<'_>,
    #[graphql(default_with = "Some(SubscriptionPlan::Pro)")] plan: Option<SubscriptionPlan>,
    workspace_id: Option<String>,
    recurring: SubscriptionRecurring,
    #[graphql(deprecation = "use header `Idempotency-Key`")] _idempotency_key: Option<String>,
  ) -> Result<SubscriptionType> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let plan = plan.unwrap_or(SubscriptionPlan::Pro);
    let intent_id = request_idempotency_key(ctx).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let (target_type, target_id) = if plan == SubscriptionPlan::Team {
      let Some(ws_id) = workspace_id.filter(|s| !s.is_empty()) else {
        return Err(domain_error_to_graphql(&DomainError::Validation(
          "workspace_id_required_to_update_team_subscription".to_owned(),
        )));
      };
      assert_workspace_payment_manage(state, &user.id, &ws_id).await?;
      ("workspace", ws_id)
    } else {
      assert_user_subscription_plan(plan)?;
      ("user", user.id.clone())
    };
    let sub = state
      .extension
      .billing_spi()
      .update_subscription_recurring(
        &user.id,
        target_type,
        &target_id,
        plan.as_str(),
        recurring.as_str(),
        &intent_id,
      )
      .await
      .map_err(|e| map_billing_error(e, Some(plan.as_str()), Some(recurring.as_str())))?;
    Ok(sub.into())
  }

  async fn generate_license_key(&self, ctx: &Context<'_>, session_id: String) -> Result<String> {
    enforce_strict_throttle_graphql(ctx).await?;
    if session_id.is_empty() {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "invalid_license_session_id".to_owned(),
      )));
    }
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let intent_id = uuid::Uuid::new_v4().to_string();
    state
      .extension
      .billing_spi()
      .generate_license_key(&session_id, &intent_id)
      .await
      .map_err(|e| map_billing_error(e, None, None))
  }

  /// Request to apply the subscription in advance
  async fn request_apply_subscription(
    &self,
    ctx: &Context<'_>,
    transaction_id: String,
  ) -> Result<Vec<SubscriptionType>> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let intent_id = uuid::Uuid::new_v4().to_string();
    let subs = state
      .extension
      .billing_spi()
      .request_apply_subscription(&user.id, &transaction_id, &intent_id)
      .await
      .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("belongs to another user")
          || msg.contains("ambiguous ownership")
          || msg.contains("not canonical")
        {
          domain_error_to_graphql(&DomainError::Validation("invalid_subscription_parameters".to_owned()))
        } else {
          map_billing_error(e, None, None)
        }
      })?;
    Ok(subs.into_iter().map(Into::into).collect())
  }

  /// Refresh current user subscriptions and return latest.
  async fn refresh_user_subscriptions(&self, ctx: &Context<'_>) -> Result<Vec<SubscriptionType>> {
    let user = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let subs = state
      .extension
      .billing_spi()
      .refresh_user_subscriptions(&user.id)
      .await
      .map_err(|e| map_billing_error(e, None, None))?;
    Ok(subs.into_iter().map(Into::into).collect())
  }

  async fn reconcile_admin_payment(
    &self,
    ctx: &Context<'_>,
    input: ReconcileAdminPaymentInput,
  ) -> Result<AdminPaymentResolution> {
    let _authed = require_authenticated_user(ctx).await?;
    enforce_strict_throttle_graphql(ctx).await?;
    let actor = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    assert_cloud_only(state)?;
    let bad_req = || {
      domain_error_to_graphql(&DomainError::Validation(
        "Provide a valid payment case and evidence.".to_owned(),
      ))
    };
    let user_id = validate_req_identifier(input.user_id, 256).map_err(|_| bad_req())?;
    let request_id = validate_req_identifier(input.request_id, 256).map_err(|_| bad_req())?;
    let evidence = validate_req_identifier(input.evidence, 4000).map_err(|_| bad_req())?;
    let attempt_id = validate_opt_identifier(input.attempt_id).map_err(|_| bad_req())?;
    let transaction_id = validate_opt_identifier(input.transaction_id).map_err(|_| bad_req())?;
    if transaction_id.is_some() && attempt_id.is_none() {
      return Err(bad_req());
    }
    let res = state
      .extension
      .billing_spi()
      .reconcile_payment(ReconcileAdminPaymentSpiInput {
        actor_user_id: actor.id,
        user_id,
        plan_family: input.plan_family.as_str().to_owned(),
        request_id,
        evidence,
        attempt_id,
        transaction_id,
      })
      .await
      .map_err(|e| map_billing_error(e, None, None))?;
    Ok(res.into())
  }

  async fn grant_commercial_entitlement(
    &self,
    ctx: &Context<'_>,
    target_type: String,
    target_id: String,
    plan: String,
    quantity: Option<i32>,
  ) -> Result<bool> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .extension
      .billing_spi()
      .upsert_admin_grant(&target_type, &target_id, &plan, quantity)
      .await
      .map_err(|e| map_billing_error(e, Some(&plan), None))?;
    Ok(true)
  }

  async fn revoke_commercial_entitlement(
    &self,
    ctx: &Context<'_>,
    target_type: String,
    target_id: String,
  ) -> Result<bool> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    state
      .extension
      .billing_spi()
      .revoke_admin_grant(&target_type, &target_id)
      .await
      .map_err(|e| map_billing_error(e, None, None))?;
    Ok(true)
  }
}

async fn mutate_subscription_common(
  ctx: &Context<'_>,
  plan: SubscriptionPlan,
  workspace_id: Option<String>,
  mutation: &'static str,
) -> Result<SubscriptionType> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let intent_id = request_idempotency_key(ctx).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
  let (target_type, target_id) = if plan == SubscriptionPlan::Team {
    let Some(ws_id) = workspace_id.filter(|s| !s.is_empty()) else {
      return Err(domain_error_to_graphql(&DomainError::Validation(
        "workspace_id_required_to_update_team_subscription".to_owned(),
      )));
    };
    assert_workspace_payment_manage(state, &user.id, &ws_id).await?;
    ("workspace", ws_id)
  } else {
    assert_user_subscription_plan(plan)?;
    ("user", user.id.clone())
  };
  let sub = state
    .extension
    .billing_spi()
    .mutate_subscription(&user.id, target_type, &target_id, plan.as_str(), mutation, &intent_id)
    .await
    .map_err(|e| map_billing_error(e, Some(plan.as_str()), None))?;
  Ok(sub.into())
}

pub(crate) async fn resolve_user_subscriptions(ctx: &Context<'_>, user_id: &str) -> Result<Vec<SubscriptionType>> {
  let me = require_authenticated_user(ctx).await?;
  if me.id != user_id {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "access_denied".to_owned(),
    )));
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let read = state
    .extension
    .billing_spi()
    .list_subscriptions("user", user_id)
    .await
    .map_err(|e| map_billing_error(e, None, None))?;
  Ok(read.subscriptions.into_iter().map(Into::into).collect())
}

pub(crate) async fn resolve_user_subscription_billing(
  ctx: &Context<'_>,
  user_id: &str,
) -> Result<SubscriptionBillingInfo> {
  let me = require_authenticated_user(ctx).await?;
  if me.id != user_id {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "access_denied".to_owned(),
    )));
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let read = state
    .extension
    .billing_spi()
    .list_subscriptions("user", user_id)
    .await
    .map_err(|e| map_billing_error(e, None, None))?;
  Ok(read.into())
}

pub(crate) async fn resolve_user_invoice_count(ctx: &Context<'_>, user_id: &str) -> Result<i32> {
  let me = require_authenticated_user(ctx).await?;
  if me.id != user_id {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "access_denied".to_owned(),
    )));
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let count = server_domain::disposition::count_invoices_by_target(&state.db, user_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(i32::try_from(count).unwrap_or(i32::MAX))
}

pub(crate) async fn resolve_user_invoices(
  ctx: &Context<'_>,
  user_id: &str,
  take: Option<i32>,
  skip: Option<i32>,
) -> Result<Vec<InvoiceType>> {
  let me = require_authenticated_user(ctx).await?;
  if me.id != user_id {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "access_denied".to_owned(),
    )));
  }
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let rows = server_domain::disposition::list_invoices_by_target(
    &state.db,
    user_id,
    skip.map(i64::from),
    i64::from(take.unwrap_or(8)),
  )
  .await
  .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(rows.into_iter().map(Into::into).collect())
}

pub(crate) async fn resolve_workspace_subscription(
  ctx: &Context<'_>,
  workspace_id: &str,
) -> Result<Option<SubscriptionType>> {
  let me = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_workspace_payment_manage(state, &me.id, workspace_id).await?;
  let read = state
    .extension
    .billing_spi()
    .list_subscriptions("workspace", workspace_id)
    .await
    .map_err(|e| map_billing_error(e, None, None))?;
  Ok(read.subscriptions.into_iter().next().map(Into::into))
}

pub(crate) async fn resolve_workspace_invoice_count(ctx: &Context<'_>, workspace_id: &str) -> Result<i32> {
  let me = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_workspace_payment_manage(state, &me.id, workspace_id).await?;
  let count = server_domain::disposition::count_invoices_by_target(&state.db, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(i32::try_from(count).unwrap_or(i32::MAX))
}

pub(crate) async fn resolve_workspace_invoices(
  ctx: &Context<'_>,
  workspace_id: &str,
  take: Option<i32>,
  skip: Option<i32>,
) -> Result<Vec<InvoiceType>> {
  let me = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  assert_workspace_payment_manage(state, &me.id, workspace_id).await?;
  let rows = server_domain::disposition::list_invoices_by_target(
    &state.db,
    workspace_id,
    skip.map(i64::from),
    i64::from(take.unwrap_or(8)),
  )
  .await
  .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(rows.into_iter().map(Into::into).collect())
}
