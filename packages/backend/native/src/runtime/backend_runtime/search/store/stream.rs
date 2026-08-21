use sqlx::{Postgres, Row, Transaction};

use super::SearchTable;
use crate::runtime::{RuntimeError, RuntimeResult};

pub(in crate::runtime::backend_runtime::search) async fn allocate(
  transaction: &mut Transaction<'_, Postgres>,
  table: SearchTable,
  count: usize,
) -> RuntimeResult<i64> {
  if count == 0 {
    return Ok(0);
  }
  let row = sqlx::query(
    "UPDATE search_runtime_streams SET head = head + $2, updated_at = now() WHERE table_key = $1 RETURNING head",
  )
  .bind(table.as_str())
  .bind(count as i64)
  .fetch_one(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("allocate search stream sequence", error))?;
  let head: i64 = row
    .try_get("head")
    .map_err(|error| RuntimeError::database("decode search stream head", error))?;
  Ok(head - count as i64 + 1)
}
