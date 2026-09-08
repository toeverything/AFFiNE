use std::time::Duration;

use sqlx::{PgConnection, PgPool, Postgres, Transaction, pool::PoolConnection};

use super::{RuntimeError, RuntimeResult};

const LOCK_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) async fn lock_workspace_storage_shared_transaction(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
) -> RuntimeResult<()> {
  let key = format!("storage-workspace:{workspace_id}");
  tokio::time::timeout(LOCK_TIMEOUT, async {
    loop {
      let locked: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1, 0))")
        .bind(&key)
        .fetch_one(&mut **transaction)
        .await
        .map_err(|error| RuntimeError::database("lock workspace storage source", error))?;
      if locked {
        return Ok(());
      }
      tokio::time::sleep(Duration::from_millis(25)).await;
    }
  })
  .await
  .map_err(|_| RuntimeError::invalid_state("storage_lifecycle_lock_timeout"))?
}

// Object operations take a shared workspace lock, then an exclusive object
// lock. Workspace prefix deletion takes the exclusive workspace lock. Quota row
// locks are acquired afterward and are released before object-storage I/O.
pub(super) struct StorageOperation {
  connection: Option<PoolConnection<Postgres>>,
  workspace_key: String,
  object_key: Option<String>,
}

impl StorageOperation {
  pub(super) async fn acquire(pool: &PgPool, workspace_id: &str, object_key: Option<&str>) -> RuntimeResult<Self> {
    tokio::time::timeout(LOCK_TIMEOUT, async {
      let connection = pool
        .acquire()
        .await
        .map_err(|error| RuntimeError::database("acquire storage lifecycle connection", error))?;
      let mut operation = Self {
        connection: Some(connection),
        workspace_key: format!("storage-workspace:{workspace_id}"),
        object_key: object_key.map(|key| format!("storage-object:{key}")),
      };
      let statement = if object_key.is_some() {
        "SELECT pg_try_advisory_lock_shared(hashtextextended($1,0))"
      } else {
        "SELECT pg_try_advisory_lock(hashtextextended($1,0))"
      };
      while !sqlx::query_scalar::<_, bool>(statement)
        .bind(&operation.workspace_key)
        .fetch_one(&mut **operation.connection.as_mut().unwrap())
        .await
        .map_err(|error| RuntimeError::database("lock workspace storage lifecycle", error))?
      {
        tokio::time::sleep(Duration::from_millis(25)).await;
      }
      if let Some(key) = &operation.object_key {
        while !sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_lock(hashtextextended($1,0))")
          .bind(key)
          .fetch_one(&mut **operation.connection.as_mut().unwrap())
          .await
          .map_err(|error| RuntimeError::database("lock storage object lifecycle", error))?
        {
          tokio::time::sleep(Duration::from_millis(25)).await;
        }
      }
      Ok(operation)
    })
    .await
    .map_err(|_| RuntimeError::invalid_state("storage_lifecycle_lock_timeout"))?
  }

  pub(super) fn connection(&mut self) -> &mut PgConnection {
    self.connection.as_mut().unwrap()
  }

  pub(super) async fn release(mut self) -> RuntimeResult<()> {
    if let Some(key) = &self.object_key {
      sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1,0))")
        .bind(key)
        .execute(&mut **self.connection.as_mut().unwrap())
        .await
        .map_err(|error| RuntimeError::database("unlock storage object lifecycle", error))?;
    }
    let statement = if self.object_key.is_some() {
      "SELECT pg_advisory_unlock_shared(hashtextextended($1,0))"
    } else {
      "SELECT pg_advisory_unlock(hashtextextended($1,0))"
    };
    sqlx::query(statement)
      .bind(&self.workspace_key)
      .execute(&mut **self.connection.as_mut().unwrap())
      .await
      .map_err(|error| RuntimeError::database("unlock workspace storage lifecycle", error))?;
    self.connection.take();
    Ok(())
  }
}

impl Drop for StorageOperation {
  fn drop(&mut self) {
    // Cancellation must never return a locked session to the pool.
    if let Some(connection) = self.connection.as_mut() {
      connection.close_on_drop();
    }
  }
}
