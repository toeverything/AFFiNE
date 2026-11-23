use sqlx::{PgPool, Row};

use super::{RuntimeError, RuntimeResult, types::CurrentUser};

pub(super) async fn sign_out(pool: &PgPool, session_id: &str, user_id: Option<&str>) -> RuntimeResult<i64> {
  let mut user_ids: Vec<String> = if let Some(user_id) = user_id {
    vec![user_id.to_string()]
  } else {
    sqlx::query_scalar("SELECT user_id FROM user_sessions WHERE session_id=$1 ORDER BY user_id")
      .bind(session_id)
      .fetch_all(pool)
      .await
      .map_err(|error| RuntimeError::database("discover cookie session users", error))?
  };
  user_ids.sort();
  user_ids.dedup();
  let mut tx = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin cookie session sign out", error))?;
  if !user_ids.is_empty() {
    sqlx::query("SELECT id FROM users WHERE id=ANY($1) ORDER BY id FOR UPDATE")
      .bind(&user_ids)
      .fetch_all(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock cookie session users", error))?;
  }
  sqlx::query("SELECT id FROM user_sessions WHERE session_id=$1 ORDER BY id FOR UPDATE")
    .bind(session_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("lock cookie user sessions", error))?;
  let affected = if let Some(user_id) = user_id {
    sqlx::query("DELETE FROM user_sessions WHERE session_id=$1 AND user_id=$2")
      .bind(session_id)
      .bind(user_id)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("delete cookie user session", error))?
      .rows_affected()
  } else {
    sqlx::query("DELETE FROM multiple_users_sessions WHERE id=$1")
      .bind(session_id)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("delete cookie session", error))?
      .rows_affected()
  };
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit cookie session sign out", error))?;
  Ok(i64::try_from(affected).unwrap_or(i64::MAX))
}

pub(super) async fn users(pool: &PgPool, session_id: &str) -> RuntimeResult<Vec<CurrentUser>> {
  let rows = sqlx::query(
    r#"SELECT u.id,u.email,u.avatar_url,u.name,u.disabled,
              (u.password IS NOT NULL) AS has_password,(u.email_verified IS NOT NULL) AS email_verified
       FROM user_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.session_id=$1 AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp())
       ORDER BY s.created_at ASC"#,
  )
  .bind(session_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("list cookie session users", error))?;
  Ok(
    rows
      .into_iter()
      .map(|row| CurrentUser {
        id: row.get("id"),
        email: row.get("email"),
        avatar_url: row.get("avatar_url"),
        name: row.get("name"),
        disabled: row.get("disabled"),
        has_password: row.get("has_password"),
        email_verified: row.get("email_verified"),
      })
      .collect(),
  )
}
