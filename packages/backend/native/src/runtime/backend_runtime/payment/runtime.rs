use std::sync::Arc;

use napi::bindgen_prelude::Buffer;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::{Mutex, Semaphore};

use super::{
  super::{BackendRuntime, to_napi_error},
  PaymentApplyResult, PaymentConnection, PaymentSnapshot, RevenueCatClient, StripeClient,
  apply::{PaymentApplyError, snapshot_scopes},
  apply_payment_snapshot,
};
use crate::runtime::{Deployment, PaymentRuntimeConfig, RuntimeError, RuntimeResult};

pub(in crate::runtime::backend_runtime) struct PaymentRuntime {
  pub(super) pool: PgPool,
  pub(super) stripe: Option<Arc<StripeClient>>,
  pub(super) revenuecat: Option<Arc<RevenueCatClient>>,
  pub(super) permits: Arc<Semaphore>,
  pub(super) deployment: Deployment,
  pub(super) revenuecat_config: Option<crate::runtime::RevenueCatRuntimeConfig>,
  pub(super) mail_hash_key: [u8; 32],
  pub(super) worker: Mutex<Option<super::PaymentWorker>>,
}

impl PaymentRuntime {
  pub(in crate::runtime::backend_runtime) async fn new(
    database_url: &str,
    config: &PaymentRuntimeConfig,
    deployment: Deployment,
    private_key: &str,
  ) -> RuntimeResult<Self> {
    let pool = PgPoolOptions::new()
      .max_connections(8)
      .acquire_timeout(std::time::Duration::from_secs(5))
      .connect(database_url)
      .await
      .map_err(|error| RuntimeError::database("payment runtime failed to connect postgres", error))?;
    Ok(Self {
      pool,
      stripe: config.stripe.as_ref().map(StripeClient::new).transpose()?.map(Arc::new),
      revenuecat: config
        .revenuecat
        .as_ref()
        .map(RevenueCatClient::new)
        .transpose()?
        .map(Arc::new),
      permits: Arc::new(Semaphore::new(8)),
      deployment,
      revenuecat_config: config.revenuecat.clone(),
      mail_hash_key: Sha256::digest(private_key.as_bytes()).into(),
      worker: Mutex::new(None),
    })
  }

  pub(in crate::runtime::backend_runtime) async fn start_worker(
    self: &Arc<Self>,
    invalidation: Arc<super::super::invalidation::InvalidationRuntime>,
  ) {
    *self.worker.lock().await = Some(super::PaymentWorker::start(Arc::clone(self), invalidation));
  }

  pub(in crate::runtime::backend_runtime) async fn stop(&self) {
    self.permits.close();
    if let Some(worker) = self.worker.lock().await.take() {
      worker.stop().await;
    }
    self.pool.close().await;
  }

  pub(super) async fn capture_webhook(
    &self,
    provider: &str,
    raw_body: Buffer,
    authorization: &str,
  ) -> RuntimeResult<Value> {
    if raw_body.len() > 1024 * 1024 {
      return Err(RuntimeError::invalid_input("payment webhook body is too large"));
    }
    let _permit = self
      .permits
      .acquire()
      .await
      .map_err(|_| RuntimeError::invalid_state("payment runtime stopped"))?;
    match provider {
      "stripe" => {
        let client = self
          .stripe
          .as_ref()
          .ok_or_else(|| RuntimeError::invalid_state("Stripe payment provider is not configured"))?;
        super::webhook::capture_stripe(&self.pool, client, &raw_body, authorization).await
      }
      "revenuecat" => {
        let client = self
          .revenuecat
          .as_ref()
          .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
        super::webhook::capture_revenuecat(&self.pool, client, &raw_body, authorization).await
      }
      _ => Err(RuntimeError::invalid_input("unknown payment webhook provider")),
    }
  }

  pub(super) fn configured_namespaces(&self) -> RuntimeResult<Value> {
    Ok(serde_json::json!({
      "stripe": self
        .stripe
        .as_ref()
        .map(|client| client.namespace().canonical_key())
        .transpose()
        .map_err(|_| RuntimeError::invalid_state("invalid Stripe provider namespace"))?,
      "revenuecat": self
        .revenuecat
        .as_ref()
        .map(|client| client.namespace().canonical_key())
        .transpose()
        .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?,
    }))
  }

  pub(super) async fn apply_snapshot(&self, snapshot: PaymentSnapshot) -> RuntimeResult<PaymentApplyResult> {
    let namespace = snapshot
      .namespace
      .canonical_key()
      .map_err(|_| RuntimeError::invalid_input("invalid payment provider namespace"))?;
    let scopes = snapshot_scopes(&snapshot, &namespace)?;
    let connection = PaymentConnection::try_acquire(&self.pool, scopes)
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
    self.apply_with_connection(connection, snapshot).await
  }

  pub(super) async fn apply_with_connection(
    &self,
    mut connection: PaymentConnection,
    mut snapshot: PaymentSnapshot,
  ) -> RuntimeResult<PaymentApplyResult> {
    const MAX_LOCK_EXPANSIONS: usize = 4;
    for attempt in 0..=MAX_LOCK_EXPANSIONS {
      match apply_payment_snapshot(&mut connection, snapshot.clone(), self.deployment, &self.mail_hash_key).await {
        Ok(result) => return Ok(result),
        Err(PaymentApplyError::Runtime(error)) => return Err(error),
        Err(PaymentApplyError::LockSetExpanded(expansion)) => {
          if attempt == MAX_LOCK_EXPANSIONS {
            return Err(RuntimeError::invalid_state("payment_busy"));
          }
          connection = connection
            .reacquire_with(&self.pool, expansion)
            .await?
            .ok_or_else(|| RuntimeError::invalid_state("payment_busy"))?;
          if matches!(snapshot.coverage, super::SnapshotCoverage::Complete { .. }) {
            snapshot = self.refresh_complete_snapshot(&snapshot).await?;
          }
        }
      }
    }
    unreachable!()
  }

  async fn refresh_complete_snapshot(&self, stale: &PaymentSnapshot) -> RuntimeResult<PaymentSnapshot> {
    let customer_id = stale
      .customer_id
      .as_deref()
      .ok_or_else(|| RuntimeError::invalid_state("complete payment snapshot has no customer identity"))?;
    let mut refreshed = match stale.namespace.provider {
      affine_core::payment::Provider::Stripe => {
        let client = self
          .stripe
          .as_ref()
          .filter(|client| client.namespace() == &stale.namespace)
          .ok_or_else(|| RuntimeError::invalid_state("Stripe payment provider namespace changed"))?;
        let subscriptions = client
          .customer_subscriptions(customer_id)
          .await
          .map_err(|error| RuntimeError::invalid_state(error.code))?;
        super::snapshot::stripe_customer_snapshot(
          &self.pool,
          client,
          customer_id,
          subscriptions,
          stale.operation.clone(),
        )
        .await?
      }
      affine_core::payment::Provider::RevenueCat => {
        let client = self
          .revenuecat
          .as_ref()
          .filter(|client| client.namespace() == &stale.namespace)
          .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider namespace changed"))?;
        let config = self
          .revenuecat_config
          .as_ref()
          .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
        let subscriptions = client
          .customer_subscriptions(customer_id)
          .await
          .map_err(|error| RuntimeError::invalid_state(error.code))?;
        let verified =
          super::worker::verified_missing_revenuecat_sources(self, client, customer_id, &subscriptions).await?;
        let mut snapshot = super::snapshot::revenuecat_customer_snapshot(
          &self.pool,
          client,
          config,
          customer_id,
          subscriptions,
          super::SnapshotCoverage::Complete {
            verified_missing_revenuecat_sources: verified,
          },
          stale.captured_event_ids.clone(),
        )
        .await?;
        snapshot.operation = stale.operation.clone();
        snapshot
      }
    };
    refreshed.captured_event_ids = stale.captured_event_ids.clone();
    Ok(refreshed)
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn execute_payment_command_v1(&self, input: Value) -> napi::Result<Value> {
    let outcome = self
      .payment_runtime()
      .await?
      .execute(input)
      .await
      .map_err(to_napi_error)?;
    super::super::entitlement::publish_changes(self, &outcome.changes.targets, &outcome.changes.owner_ids).await;
    Ok(outcome.value)
  }

  #[napi]
  pub async fn create_payment_customer_portal_v1(&self, actor_user_id: String) -> napi::Result<String> {
    let runtime = self.payment_runtime().await?;
    let _permit = runtime
      .permits
      .acquire()
      .await
      .map_err(|_| to_napi_error(RuntimeError::invalid_state("payment runtime stopped")))?;
    runtime.customer_portal_url(&actor_user_id).await.map_err(to_napi_error)
  }

  #[napi]
  pub async fn create_license_customer_portal_v1(
    &self,
    license_key: String,
    validate_key: Option<String>,
  ) -> napi::Result<String> {
    let runtime = self.payment_runtime().await?;
    let _permit = runtime
      .permits
      .acquire()
      .await
      .map_err(|_| to_napi_error(RuntimeError::invalid_state("payment runtime stopped")))?;
    runtime
      .license_customer_portal_url(&license_key, validate_key.as_deref())
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn capture_payment_webhook_v1(
    &self,
    provider: String,
    raw_body: Buffer,
    authorization: String,
  ) -> napi::Result<Value> {
    self
      .payment_runtime()
      .await?
      .capture_webhook(&provider, raw_body, &authorization)
      .await
      .map_err(to_napi_error)
  }

  #[napi]
  pub async fn payment_provider_namespaces_v1(&self) -> napi::Result<Value> {
    self
      .payment_runtime()
      .await?
      .configured_namespaces()
      .map_err(to_napi_error)
  }
}
