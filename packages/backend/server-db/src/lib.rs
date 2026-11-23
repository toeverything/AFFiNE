//! Single-pool PostgreSQL layer with 4-tier bounded semaphore admission,
//! per-connection timeouts, task-local query counters, and dual-track `v0.27.5`
//! schema readiness.

pub mod error;
pub mod metrics;
pub mod phase_a_compat;
pub mod schema;
pub mod sessions;

use std::{
  future::Future,
  ops::{Deref, DerefMut},
  pin::Pin,
  str::FromStr,
  sync::Arc,
};

use futures_util::{future::BoxFuture, stream::BoxStream};
use server_types::ServerRole;
use sqlx::{
  Connection as _, Describe, Either, Execute, Executor as _, PgConnection, PgPool, Postgres, Transaction,
  pool::PoolConnection,
  postgres::{PgConnectOptions, PgPoolOptions, PgQueryResult, PgRow, PgStatement, PgTypeInfo},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub use crate::{
  error::DbError,
  metrics::{QueryCountersSnapshot, current_query_counters, record_query, with_query_scope},
  schema::{SchemaReadiness, bundled_0275_migration_manifest},
};

pub const DEFAULT_STATEMENT_TIMEOUT_MS: u64 = 5_000;
pub const IDLE_IN_TRANSACTION_SESSION_TIMEOUT: &str = "10s";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum WorkloadTier {
  InteractiveRead,
  InteractiveWrite,
  WebhookReceipt,
  LongQuery,
}

impl WorkloadTier {
  const fn index(self) -> usize {
    match self {
      Self::InteractiveRead => 0,
      Self::InteractiveWrite => 1,
      Self::WebhookReceipt => 2,
      Self::LongQuery => 3,
    }
  }
}

#[derive(Clone, Debug)]
pub struct DbConfig {
  pub database_url: String,
  pub channel: String,
  pub role: ServerRole,
  pub selfhosted: bool,
  pub max_connections: u32,
  pub statement_timeout_ms: u64,
  pub tier_permits: [usize; 4],
}

impl DbConfig {
  pub fn new(database_url: impl Into<String>) -> Self {
    Self {
      database_url: database_url.into(),
      channel: "stable".to_owned(),
      role: ServerRole::Allinone,
      selfhosted: true,
      max_connections: 20,
      statement_timeout_ms: DEFAULT_STATEMENT_TIMEOUT_MS,
      tier_permits: [12, 8, 4, 2],
    }
  }

  pub fn application_name(&self) -> String {
    format!("affine:{}:{}:v2", self.channel, self.role.as_str())
  }
}

struct ServerDbInner {
  pool: PgPool,
  connect_options: PgConnectOptions,
  tier_semaphores: [Arc<Semaphore>; 4],
  role: ServerRole,
  selfhosted: bool,
}

#[derive(Clone)]
pub struct ServerDb {
  inner: Arc<ServerDbInner>,
}

/// Pooled connection paired with its workload-tier admission permit.
///
/// Field order ensures the connection returns to the pool before the semaphore
/// permit is released.
#[derive(Debug)]
pub struct TieredConn {
  conn: PoolConnection<Postgres>,
  _permit: OwnedSemaphorePermit,
}

impl TieredConn {
  pub fn as_conn(&mut self) -> &mut PgConnection {
    &mut self.conn
  }
}

impl Deref for TieredConn {
  type Target = PgConnection;

  fn deref(&self) -> &Self::Target {
    &self.conn
  }
}

impl DerefMut for TieredConn {
  fn deref_mut(&mut self) -> &mut Self::Target {
    &mut self.conn
  }
}

impl<'c> sqlx::Executor<'c> for &'c mut TieredConn {
  type Database = Postgres;

  fn fetch_many<'e, 'q: 'e, E>(self, query: E) -> BoxStream<'e, Result<Either<PgQueryResult, PgRow>, sqlx::Error>>
  where
    'c: 'e,
    E: 'q + Execute<'q, Self::Database>,
  {
    metrics::record_query();
    (&mut *self.conn).fetch_many(query)
  }

  fn fetch_optional<'e, 'q: 'e, E>(self, query: E) -> BoxFuture<'e, Result<Option<PgRow>, sqlx::Error>>
  where
    'c: 'e,
    E: 'q + Execute<'q, Self::Database>,
  {
    metrics::record_query();
    (&mut *self.conn).fetch_optional(query)
  }

  fn prepare_with<'e, 'q: 'e>(
    self,
    sql: &'q str,
    parameters: &'e [PgTypeInfo],
  ) -> BoxFuture<'e, Result<PgStatement<'q>, sqlx::Error>>
  where
    'c: 'e,
  {
    (&mut *self.conn).prepare_with(sql, parameters)
  }

  fn describe<'e, 'q: 'e>(self, sql: &'q str) -> BoxFuture<'e, Result<Describe<Self::Database>, sqlx::Error>>
  where
    'c: 'e,
  {
    (&mut *self.conn).describe(sql)
  }
}

/// Active transaction paired with its workload-tier admission permit.
///
/// Field order ensures the transaction finishes before the semaphore permit is
/// released.
#[derive(Debug)]
pub struct TieredTx<'a> {
  tx: Transaction<'a, Postgres>,
  _permit: OwnedSemaphorePermit,
}

impl<'a> TieredTx<'a> {
  pub fn tx_mut(&mut self) -> &mut Transaction<'a, Postgres> {
    &mut self.tx
  }

  pub async fn commit(self) -> Result<(), DbError> {
    self.tx.commit().await?;
    Ok(())
  }

  pub async fn rollback(self) -> Result<(), DbError> {
    self.tx.rollback().await?;
    Ok(())
  }
}

impl Deref for TieredTx<'_> {
  type Target = PgConnection;

  fn deref(&self) -> &Self::Target {
    &self.tx
  }
}

impl DerefMut for TieredTx<'_> {
  fn deref_mut(&mut self) -> &mut Self::Target {
    &mut self.tx
  }
}

impl<'c> sqlx::Executor<'c> for &'c mut TieredTx<'_> {
  type Database = Postgres;

  fn fetch_many<'e, 'q: 'e, E>(self, query: E) -> BoxStream<'e, Result<Either<PgQueryResult, PgRow>, sqlx::Error>>
  where
    'c: 'e,
    E: 'q + Execute<'q, Self::Database>,
  {
    metrics::record_query();
    (&mut *self.tx).fetch_many(query)
  }

  fn fetch_optional<'e, 'q: 'e, E>(self, query: E) -> BoxFuture<'e, Result<Option<PgRow>, sqlx::Error>>
  where
    'c: 'e,
    E: 'q + Execute<'q, Self::Database>,
  {
    metrics::record_query();
    (&mut *self.tx).fetch_optional(query)
  }

  fn prepare_with<'e, 'q: 'e>(
    self,
    sql: &'q str,
    parameters: &'e [PgTypeInfo],
  ) -> BoxFuture<'e, Result<PgStatement<'q>, sqlx::Error>>
  where
    'c: 'e,
  {
    (&mut *self.tx).prepare_with(sql, parameters)
  }

  fn describe<'e, 'q: 'e>(self, sql: &'q str) -> BoxFuture<'e, Result<Describe<Self::Database>, sqlx::Error>>
  where
    'c: 'e,
  {
    (&mut *self.tx).describe(sql)
  }
}

impl ServerDb {
  pub async fn connect(config: DbConfig) -> Result<Self, DbError> {
    if config.max_connections == 0 {
      return Err(DbError::InvalidConfig("max_connections must be > 0".to_owned()));
    }
    if config.statement_timeout_ms == 0 {
      return Err(DbError::InvalidConfig("statement_timeout_ms must be > 0".to_owned()));
    }
    if config.tier_permits.contains(&0) {
      return Err(DbError::InvalidConfig(
        "every WorkloadTier permit budget must be > 0".to_owned(),
      ));
    }

    let app_name = config.application_name();
    let connect_options = PgConnectOptions::from_str(&config.database_url)?.application_name(&app_name);
    let statement_timeout_ms = config.statement_timeout_ms;

    let pool = PgPoolOptions::new()
      .min_connections(0)
      .max_connections(config.max_connections)
      .after_connect(move |conn, _meta| {
        Box::pin(async move {
          let setup = format!(
            "SET statement_timeout = '{statement_timeout_ms}ms'; \
             SET idle_in_transaction_session_timeout = '{IDLE_IN_TRANSACTION_SESSION_TIMEOUT}';"
          );
          conn.execute(setup.as_str()).await?;
          Ok(())
        })
      })
      .connect_with(connect_options.clone())
      .await?;

    let tier_semaphores = config.tier_permits.map(|permits| Arc::new(Semaphore::new(permits)));

    Ok(Self {
      inner: Arc::new(ServerDbInner {
        pool,
        connect_options,
        tier_semaphores,
        role: config.role,
        selfhosted: config.selfhosted,
      }),
    })
  }

  pub fn pool(&self) -> &PgPool {
    &self.inner.pool
  }

  pub fn role(&self) -> ServerRole {
    self.inner.role
  }

  pub fn selfhosted(&self) -> bool {
    self.inner.selfhosted
  }

  pub async fn acquire_tiered(&self, tier: WorkloadTier) -> Result<TieredConn, DbError> {
    let permit = Arc::clone(&self.inner.tier_semaphores[tier.index()])
      .acquire_owned()
      .await
      .map_err(|_| DbError::PoolClosed)?;
    let conn = self.inner.pool.acquire().await?;
    metrics::record_pool_acquire();
    Ok(TieredConn { conn, _permit: permit })
  }

  pub async fn begin_tiered(&self, tier: WorkloadTier) -> Result<TieredTx<'_>, DbError> {
    let permit = Arc::clone(&self.inner.tier_semaphores[tier.index()])
      .acquire_owned()
      .await
      .map_err(|_| DbError::PoolClosed)?;
    let tx = self.inner.pool.begin().await?;
    metrics::record_pool_acquire();
    metrics::record_transaction();
    Ok(TieredTx { tx, _permit: permit })
  }

  /// Acquires a [`WorkloadTier::LongQuery`] permit, opens a transaction, sets
  /// `LOCAL statement_timeout = '<timeout_ms>ms'`, and runs `f` with a
  /// [`TieredTx`] whose `sqlx::Executor` automatically increments
  /// [`QueryCountersSnapshot::queries`]. The internal `set_config` call does
  /// not increment the business query counter. Commits when `f` returns `Ok`,
  /// or rolls back on error.
  pub async fn with_long_query_timeout<F, T>(&self, timeout_ms: u64, f: F) -> Result<T, DbError>
  where
    F: for<'a, 'b> FnOnce(&'a mut TieredTx<'b>) -> Pin<Box<dyn Future<Output = Result<T, DbError>> + Send + 'a>>,
  {
    if timeout_ms == 0 {
      return Err(DbError::InvalidConfig("long query timeout_ms must be > 0".to_owned()));
    }
    let mut tiered = self.begin_tiered(WorkloadTier::LongQuery).await?;
    let timeout_value = format!("{timeout_ms}ms");
    sqlx::query("SELECT set_config('statement_timeout', $1, true)")
      .bind(&timeout_value)
      .execute(&mut **tiered.tx_mut())
      .await?;
    let result = f(&mut tiered).await;
    match result {
      Ok(value) => {
        tiered.commit().await?;
        Ok(value)
      }
      Err(err) => {
        let _ = tiered.rollback().await;
        Err(err)
      }
    }
  }

  /// Opens an unpooled PostgreSQL connection suitable for session-level
  /// advisory locks or `LISTEN`/`NOTIFY`.
  pub async fn dedicated_session_conn(&self) -> Result<PgConnection, DbError> {
    let conn = PgConnection::connect_with(&self.inner.connect_options).await?;
    Ok(conn)
  }

  /// Ensures the database is at the required `v0.27.5` schema baseline and
  /// creates `native_schema_migrations`.
  pub async fn ensure_schema_ready(&self) -> Result<SchemaReadiness, DbError> {
    schema::ensure_schema_ready_impl(self).await
  }
}
