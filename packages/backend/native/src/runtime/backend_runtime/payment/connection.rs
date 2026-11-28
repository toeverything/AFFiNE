use std::collections::BTreeSet;

use affine_core::{access_control::Plan, payment::cloud_plan_family};
use sha2::{Digest, Sha256};
use sqlx::{Connection, PgPool, Postgres, Transaction, pool::PoolConnection};

use super::super::{RuntimeError, RuntimeResult};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(super) struct PaymentScope(String);

impl PaymentScope {
  pub(super) fn from_stored(value: String, namespace: &str) -> RuntimeResult<Self> {
    if value.trim() != value
      || !(value.starts_with(&format!("{namespace}:lock:")) || value.starts_with("payment:v1:cloud:lock:"))
    {
      return Err(RuntimeError::invalid_state("invalid stored payment lock scope"));
    }
    Ok(Self(value))
  }

  pub(super) fn customer(namespace: &str, customer_id: &str) -> RuntimeResult<Self> {
    Self::new(namespace, "customer", customer_id)
  }

  pub(super) fn source(namespace: &str, source_id: &str) -> RuntimeResult<Self> {
    Self::new(namespace, "source", source_id)
  }

  pub(super) fn receipt(namespace: &str, event_id: &str) -> RuntimeResult<Self> {
    Self::new(namespace, "receipt", event_id)
  }

  pub(super) fn financial(namespace: &str, object_kind: &str, external_id: &str) -> RuntimeResult<Self> {
    if !matches!(object_kind, "invoice" | "refund" | "dispute") {
      return Err(RuntimeError::invalid_input("invalid payment financial scope"));
    }
    Self::new(namespace, &format!("financial:{object_kind}"), external_id)
  }

  pub(super) fn billing_target(namespace: &str, target_type: &str, target_id: &str) -> RuntimeResult<Self> {
    Self::new(namespace, &format!("billing-target:{target_type}"), target_id)
  }

  pub(super) fn cloud_target(target_type: &str, target_id: &str, plan: Plan) -> RuntimeResult<Self> {
    let family = cloud_plan_family(plan).ok_or_else(|| RuntimeError::invalid_input("invalid cloud payment plan"))?;
    if !matches!((target_type, family), ("user", "pro" | "ai") | ("workspace", "team")) {
      return Err(RuntimeError::invalid_input("payment target does not match plan family"));
    }
    Self::new(
      "payment:v1:cloud",
      &format!("billing-target:{target_type}:{family}"),
      target_id,
    )
  }

  fn new(namespace: &str, kind: &str, identity: &str) -> RuntimeResult<Self> {
    if !namespace.starts_with("payment:v1:") || identity.is_empty() || identity != identity.trim() {
      return Err(RuntimeError::invalid_input("invalid payment lock scope"));
    }
    Ok(Self(format!("{namespace}:lock:{kind}:{}:{identity}", identity.len())))
  }

  pub(super) fn as_str(&self) -> &str {
    &self.0
  }

  pub(super) fn belongs_to(&self, namespace: &str) -> bool {
    self.0.starts_with(&format!("{namespace}:lock:")) || self.0.starts_with("payment:v1:cloud:lock:")
  }

  pub(super) fn advisory_key(&self) -> i64 {
    let digest = Sha256::digest(self.0.as_bytes());
    i64::from_be_bytes(digest[..8].try_into().expect("SHA-256 prefix has fixed width"))
  }
}

pub(super) fn required_scope_expansion(
  held: &[PaymentScope],
  required: impl IntoIterator<Item = PaymentScope>,
) -> Vec<PaymentScope> {
  let held = held.iter().collect::<BTreeSet<_>>();
  required
    .into_iter()
    .collect::<BTreeSet<_>>()
    .into_iter()
    .filter(|scope| !held.contains(scope))
    .collect()
}

pub(super) struct PaymentConnection {
  connection: Option<PoolConnection<Postgres>>,
  scopes: Vec<PaymentScope>,
}

impl PaymentConnection {
  pub(super) async fn try_acquire(pool: &PgPool, scopes: Vec<PaymentScope>) -> RuntimeResult<Option<Self>> {
    let scopes = scopes
      .into_iter()
      .collect::<BTreeSet<_>>()
      .into_iter()
      .collect::<Vec<_>>();
    if scopes.is_empty() {
      return Err(RuntimeError::invalid_input("payment lock set is empty"));
    }
    let mut connection = pool
      .acquire()
      .await
      .map_err(|error| RuntimeError::database("acquire dedicated payment connection", error))?;
    connection.close_on_drop();
    let mut acquired_any = false;
    for scope in &scopes {
      let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock($1)")
        .bind(scope.advisory_key())
        .fetch_one(&mut *connection)
        .await
        .map_err(|error| RuntimeError::database("acquire payment session lock", error))?;
      if !acquired {
        if acquired_any {
          let _ = sqlx::query("SELECT pg_advisory_unlock_all()")
            .execute(&mut *connection)
            .await;
        }
        let _ = connection.close().await;
        return Ok(None);
      }
      acquired_any = true;
    }
    Ok(Some(Self {
      connection: Some(connection),
      scopes,
    }))
  }

  pub(super) fn scopes(&self) -> &[PaymentScope] {
    &self.scopes
  }

  pub(super) async fn with_release<T>(
    mut self,
    work: impl AsyncFnOnce(&mut PaymentConnection) -> RuntimeResult<T>,
  ) -> RuntimeResult<T> {
    let result = work(&mut self).await;
    let _ = self.release().await;
    result
  }

  pub(super) async fn release_locks(&mut self) -> RuntimeResult<()> {
    let Some(mut connection) = self.connection.take() else {
      return Ok(());
    };
    let unlock_res = sqlx::query("SELECT pg_advisory_unlock_all()")
      .execute(&mut *connection)
      .await;
    let _ = connection.close().await;
    unlock_res
      .map(|_| ())
      .map_err(|error| RuntimeError::database("release payment session locks", error))
  }

  pub(super) async fn release(mut self) -> RuntimeResult<()> {
    self.release_locks().await
  }

  pub(super) async fn reacquire_with(&mut self, pool: &PgPool, required: Vec<PaymentScope>) -> RuntimeResult<bool> {
    let scopes = self.scopes.iter().cloned().chain(required).collect::<Vec<_>>();
    self.release_locks().await?;
    if let Some(reacquired) = Self::try_acquire(pool, scopes).await? {
      self.connection = reacquired.connection;
      self.scopes = reacquired.scopes;
      Ok(true)
    } else {
      Ok(false)
    }
  }

  pub(super) fn connection(&mut self) -> &mut sqlx::PgConnection {
    self.connection.as_deref_mut().expect("payment connection is active")
  }

  pub(super) async fn begin(&mut self) -> RuntimeResult<Transaction<'_, Postgres>> {
    self
      .connection()
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin payment transaction", error))
  }
}
