//! Dual-track schema readiness engine (`ensure_schema_ready`):
//!
//! 1. Fresh empty DB (or resuming an interrupted `server-db` fresh init):
//!    applies the bundled `v0.27.5` baseline migrations (each in an atomic
//!    transaction paired with its `_prisma_migrations` row, stripping top-level
//!    `BEGIN;`/`COMMIT;` so embedded transaction wrappers never commit early) +
//!    runtime tables, writes the `schema_baseline_0275` checkpoint, and creates
//!    `native_schema_migrations`.
//! 2. Existing non-empty DB: enforces the `v0.27.5` baseline gate without
//!    ever mutating `_prisma_migrations`, idempotently ensures runtime tables
//!    and `native_schema_migrations`.

use std::collections::{HashMap, HashSet};

use sqlx::{Connection as _, Executor as _};

use crate::{DbError, ServerDb, phase_a_compat};

include!(concat!(env!("OUT_DIR"), "/bundled_migrations.rs"));

const SCHEMA_READY_ADVISORY_LOCK: i64 = 0x4146_4649_4e45_0275;

const CREATE_PRISMA_MIGRATIONS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64) NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)
"#;

const CREATE_CHECKPOINTS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS storage_reconciliation_checkpoints (
  kind         TEXT NOT NULL,
  scope        TEXT NOT NULL,
  status       TEXT NOT NULL,
  cursor       JSONB NOT NULL DEFAULT '{}',
  last_key     TEXT,
  last_sid     INTEGER,
  completed_at TIMESTAMPTZ(3),
  updated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata     JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (kind, scope)
)
"#;

const CREATE_NATIVE_SCHEMA_MIGRATIONS_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS native_schema_migrations (
  component  TEXT NOT NULL,
  version    INTEGER NOT NULL,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (component, version)
)
"#;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SchemaReadiness {
  InitializedFresh0275 { applied_migrations: usize },
  ReadyExisting0275 { verified_migrations: usize },
}

/// Returns the ordered list of bundled `v0.27.5` Prisma `(migration_name, sha256_checksum)` pairs.
pub fn bundled_0275_migration_manifest() -> Vec<(&'static str, &'static str)> {
  BUNDLED_PRISMA_MIGRATIONS.iter().map(|m| (m.name, m.checksum)).collect()
}

/// Strips standalone top-level transaction control statements (`BEGIN`,
/// `BEGIN TRANSACTION`, `BEGIN WORK`, `COMMIT`, `COMMIT TRANSACTION`,
/// `COMMIT WORK`, `END`, `END TRANSACTION`, `END WORK`) while preserving
/// everything inside single-quoted strings, double-quoted identifiers,
/// dollar-quoted PL/pgSQL blocks (`$$ ... $$`, `$tag$ ... $tag$`), and comments.
pub fn strip_top_level_tx_control(sql: &str) -> String {
  let bytes = sql.as_bytes();
  let len = bytes.len();
  let mut out = String::with_capacity(len);
  let mut stmt_start = 0usize;
  let mut i = 0usize;

  while i < len {
    match bytes[i] {
      b'\'' => {
        i += 1;
        while i < len {
          if bytes[i] == b'\'' {
            i += 1;
            if i < len && bytes[i] == b'\'' {
              i += 1;
            } else {
              break;
            }
          } else {
            i += 1;
          }
        }
      }
      b'"' => {
        i += 1;
        while i < len {
          if bytes[i] == b'"' {
            i += 1;
            if i < len && bytes[i] == b'"' {
              i += 1;
            } else {
              break;
            }
          } else {
            i += 1;
          }
        }
      }
      b'-' if i + 1 < len && bytes[i + 1] == b'-' => {
        i += 2;
        while i < len && bytes[i] != b'\n' {
          i += 1;
        }
      }
      b'/' if i + 1 < len && bytes[i + 1] == b'*' => {
        i = skip_block_comment(bytes, i);
      }
      b'$' => {
        if let Some((tag_end, tag)) = parse_dollar_tag(bytes, i) {
          i = tag_end;
          while i < len {
            if bytes[i] == b'$' && bytes[i..].starts_with(tag) {
              i += tag.len();
              break;
            }
            i += 1;
          }
        } else {
          i += 1;
        }
      }
      b';' => {
        let stmt = &sql[stmt_start..=i];
        if !is_top_level_tx_control(stmt) {
          out.push_str(stmt);
        }
        i += 1;
        stmt_start = i;
      }
      _ => {
        i += 1;
      }
    }
  }

  if stmt_start < len {
    let tail = &sql[stmt_start..];
    if !is_top_level_tx_control(tail) {
      out.push_str(tail);
    }
  }

  out
}

fn skip_block_comment(bytes: &[u8], start: usize) -> usize {
  let len = bytes.len();
  let mut i = start + 2;
  let mut depth = 1usize;
  while i < len && depth > 0 {
    if bytes[i] == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
      depth += 1;
      i += 2;
    } else if bytes[i] == b'*' && i + 1 < len && bytes[i + 1] == b'/' {
      depth -= 1;
      i += 2;
    } else {
      i += 1;
    }
  }
  i
}

fn parse_dollar_tag(bytes: &[u8], start: usize) -> Option<(usize, &[u8])> {
  let len = bytes.len();
  if start >= len || bytes[start] != b'$' {
    return None;
  }
  let mut j = start + 1;
  if j < len && bytes[j] == b'$' {
    return Some((j + 1, &bytes[start..=j]));
  }
  if j < len && (bytes[j].is_ascii_alphabetic() || bytes[j] == b'_') {
    j += 1;
    while j < len && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_') {
      j += 1;
    }
    if j < len && bytes[j] == b'$' {
      return Some((j + 1, &bytes[start..=j]));
    }
  }
  None
}

fn is_top_level_tx_control(stmt: &str) -> bool {
  let bytes = stmt.as_bytes();
  let len = bytes.len();
  let mut i = 0usize;
  let mut tokens: Vec<String> = Vec::new();

  while i < len {
    match bytes[i] {
      b if b.is_ascii_whitespace() || b == b';' => i += 1,
      b'-' if i + 1 < len && bytes[i + 1] == b'-' => {
        i += 2;
        while i < len && bytes[i] != b'\n' {
          i += 1;
        }
      }
      b'/' if i + 1 < len && bytes[i + 1] == b'*' => {
        i = skip_block_comment(bytes, i);
      }
      b if b.is_ascii_alphabetic() => {
        let start = i;
        while i < len && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
          i += 1;
        }
        tokens.push(stmt[start..i].to_ascii_uppercase());
        if tokens.len() > 2 {
          return false;
        }
      }
      _ => return false,
    }
  }

  match tokens.as_slice() {
    [a] => matches!(a.as_str(), "BEGIN" | "COMMIT" | "END"),
    [a, b] => matches!(a.as_str(), "BEGIN" | "COMMIT" | "END") && matches!(b.as_str(), "TRANSACTION" | "WORK"),
    _ => false,
  }
}

/// Executes a single migration script inside an existing PostgreSQL transaction
/// after stripping standalone top-level `BEGIN;`/`COMMIT;` wrappers, then
/// inserts its exact `_prisma_migrations` row using the unmodified `checksum`.
pub async fn apply_migration_sql_and_record_in_tx(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  migration_name: &str,
  checksum: &str,
  raw_sql: &str,
) -> Result<(), DbError> {
  let sanitized = strip_top_level_tx_control(raw_sql);
  if !sanitized.trim().is_empty() {
    sqlx::raw_sql(&sanitized)
      .execute(&mut **tx)
      .await
      .map_err(|e| DbError::SchemaCheck(format!("failed applying bundled migration {migration_name}: {e}")))?;
  }
  sqlx::query(
    r#"INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, $1, now(), $2, now(), 1)"#,
  )
  .bind(checksum)
  .bind(migration_name)
  .execute(&mut **tx)
  .await?;
  Ok(())
}

pub(crate) async fn ensure_schema_ready_impl(db: &ServerDb) -> Result<SchemaReadiness, DbError> {
  let mut conn = db.dedicated_session_conn().await?;
  // Allow enough time for full fresh-DB baseline DDL on slower hosts.
  sqlx::query("SET statement_timeout = '120s'").execute(&mut conn).await?;
  sqlx::query("SELECT pg_advisory_lock($1)")
    .bind(SCHEMA_READY_ADVISORY_LOCK)
    .execute(&mut conn)
    .await?;

  let outcome = ensure_schema_ready_locked(&mut conn).await;

  let _ = sqlx::query("SELECT pg_advisory_unlock($1)")
    .bind(SCHEMA_READY_ADVISORY_LOCK)
    .execute(&mut conn)
    .await;

  outcome
}

async fn ensure_schema_ready_locked(conn: &mut sqlx::PgConnection) -> Result<SchemaReadiness, DbError> {
  let prisma_table_exists: bool = sqlx::query_scalar("SELECT to_regclass('public._prisma_migrations') IS NOT NULL")
    .fetch_one(&mut *conn)
    .await?;
  let public_table_count: i64 =
    sqlx::query_scalar("SELECT count(*)::bigint FROM pg_tables WHERE schemaname = 'public'")
      .fetch_one(&mut *conn)
      .await?;
  let is_fresh_empty = !prisma_table_exists && public_table_count == 0;
  let resuming_fresh_init = !is_fresh_empty && phase_a_compat::is_schema_baseline_0275_initializing(&mut *conn).await?;

  // Fresh empty database or strictly verified resume of an interrupted
  // `server-db` fresh bootstrap.
  if is_fresh_empty || resuming_fresh_init {
    let prefix_len = if is_fresh_empty {
      let mut bootstrap_tx = conn.begin().await?;
      bootstrap_tx.execute(CREATE_PRISMA_MIGRATIONS_TABLE_SQL).await?;
      bootstrap_tx.execute(CREATE_CHECKPOINTS_TABLE_SQL).await?;
      sqlx::query(
        r#"INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, metadata, updated_at)
           VALUES (
             'schema_baseline_0275',
             'global',
             'initializing',
             jsonb_build_object('bootstrapOrigin', $1::text),
             now()
           )
           ON CONFLICT (kind, scope) DO NOTHING"#,
      )
      .bind(phase_a_compat::FRESH_BOOTSTRAP_ORIGIN)
      .execute(&mut *bootstrap_tx)
      .await?;
      bootstrap_tx.commit().await?;
      0usize
    } else {
      verify_resumable_prefix(&mut *conn).await?
    };

    for migration in &BUNDLED_PRISMA_MIGRATIONS[prefix_len..] {
      let mut tx = conn.begin().await?;
      apply_migration_sql_and_record_in_tx(&mut tx, migration.name, migration.checksum, migration.sql).await?;
      tx.commit().await?;
    }

    let mut finalize_tx = conn.begin().await?;
    sqlx::raw_sql(BUNDLED_RUNTIME_MIGRATIONS_SQL)
      .execute(&mut *finalize_tx)
      .await
      .map_err(|e| DbError::SchemaCheck(format!("failed applying runtime migrations: {e}")))?;

    sqlx::query(
      r#"INSERT INTO storage_reconciliation_checkpoints (kind, scope, status, completed_at, updated_at)
         VALUES ('schema_baseline_0275', 'global', 'completed', now(), now())
         ON CONFLICT (kind, scope) DO UPDATE
           SET status = EXCLUDED.status,
               completed_at = COALESCE(storage_reconciliation_checkpoints.completed_at, EXCLUDED.completed_at),
               updated_at = now()"#,
    )
    .execute(&mut *finalize_tx)
    .await?;

    finalize_tx.execute(CREATE_NATIVE_SCHEMA_MIGRATIONS_TABLE_SQL).await?;
    finalize_tx.commit().await?;

    return Ok(SchemaReadiness::InitializedFresh0275 {
      applied_migrations: BUNDLED_PRISMA_MIGRATIONS.len(),
    });
  }

  // Existing non-empty database: enforce the v0.27.5 baseline gate
  // without modifying `_prisma_migrations`.
  let has_baseline_checkpoint = phase_a_compat::has_schema_baseline_0275_checkpoint(&mut *conn).await?;

  let missing_migrations = if prisma_table_exists {
    let applied: Vec<String> = sqlx::query_scalar(
      r#"SELECT migration_name
         FROM "_prisma_migrations"
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"#,
    )
    .fetch_all(&mut *conn)
    .await?;
    let applied_set: HashSet<&str> = applied.iter().map(String::as_str).collect();
    BUNDLED_PRISMA_MIGRATIONS
      .iter()
      .filter(|m| !applied_set.contains(m.name))
      .map(|m| m.name.to_owned())
      .collect::<Vec<_>>()
  } else {
    BUNDLED_PRISMA_MIGRATIONS
      .iter()
      .map(|m| m.name.to_owned())
      .collect::<Vec<_>>()
  };

  let stepping_stone_failed = !prisma_table_exists || !missing_migrations.is_empty() || !has_baseline_checkpoint;

  if stepping_stone_failed {
    let reason = if !prisma_table_exists || !missing_migrations.is_empty() {
      let sample = missing_migrations
        .iter()
        .take(5)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
      format!("{} migration(s) missing, e.g. {sample}", missing_migrations.len())
    } else {
      "missing completed schema_baseline_0275 cutover checkpoint".to_owned()
    };
    let message = format!(
      "database is not at the required v0.27.5 schema baseline ({reason}). \
       Upgrade this database through AFFiNE v0.27.5 (run v0.27.5 predeploy migrations and cutover) before starting the native server."
    );
    return Err(DbError::SteppingStoneRequired {
      missing_migrations,
      message,
    });
  }

  let mut tx = conn.begin().await?;
  sqlx::raw_sql(BUNDLED_RUNTIME_MIGRATIONS_SQL)
    .execute(&mut *tx)
    .await
    .map_err(|e| DbError::SchemaCheck(format!("failed ensuring runtime migrations on existing DB: {e}")))?;
  tx.execute(CREATE_NATIVE_SCHEMA_MIGRATIONS_TABLE_SQL).await?;
  tx.commit().await?;

  Ok(SchemaReadiness::ReadyExisting0275 {
    verified_migrations: BUNDLED_PRISMA_MIGRATIONS.len(),
  })
}

/// Validates that `_prisma_migrations` on a resuming fresh-bootstrap database
/// contains an exact, contiguous prefix of `BUNDLED_PRISMA_MIGRATIONS` with
/// 100% matching names and SHA-256 checksums, returning the prefix length.
async fn verify_resumable_prefix(conn: &mut sqlx::PgConnection) -> Result<usize, DbError> {
  let prisma_table_exists: bool = sqlx::query_scalar("SELECT to_regclass('public._prisma_migrations') IS NOT NULL")
    .fetch_one(&mut *conn)
    .await?;
  if !prisma_table_exists {
    return Err(DbError::SchemaCheck(
      "resumable fresh bootstrap checkpoint found, but _prisma_migrations table is missing".to_owned(),
    ));
  }

  let rows: Vec<(String, String, bool, bool)> = sqlx::query_as(
    r#"SELECT migration_name, checksum, finished_at IS NOT NULL, rolled_back_at IS NOT NULL
       FROM "_prisma_migrations""#,
  )
  .fetch_all(&mut *conn)
  .await?;

  let mut seen: HashMap<String, String> = HashMap::with_capacity(rows.len());
  for (name, checksum, finished, rolled_back) in rows {
    if !finished || rolled_back {
      return Err(DbError::SchemaCheck(format!(
        "cannot resume fresh bootstrap: migration {name} is unfinished or rolled back"
      )));
    }
    if seen.insert(name.clone(), checksum).is_some() {
      return Err(DbError::SchemaCheck(format!(
        "cannot resume fresh bootstrap: duplicate _prisma_migrations entry for {name}"
      )));
    }
  }

  if seen.len() > BUNDLED_PRISMA_MIGRATIONS.len() {
    return Err(DbError::SchemaCheck(format!(
      "cannot resume fresh bootstrap: found {} migrations, more than bundled {}",
      seen.len(),
      BUNDLED_PRISMA_MIGRATIONS.len()
    )));
  }

  let prefix_len = seen.len();
  for expected in &BUNDLED_PRISMA_MIGRATIONS[..prefix_len] {
    match seen.get(expected.name) {
      Some(actual_checksum) if actual_checksum == expected.checksum => {}
      Some(actual_checksum) => {
        return Err(DbError::SchemaCheck(format!(
          "cannot resume fresh bootstrap: checksum mismatch for {} (expected {}, got {actual_checksum})",
          expected.name, expected.checksum
        )));
      }
      None => {
        return Err(DbError::SchemaCheck(format!(
          "cannot resume fresh bootstrap: _prisma_migrations is not a contiguous prefix (missing {})",
          expected.name
        )));
      }
    }
  }

  Ok(prefix_len)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn strip_top_level_tx_control_removes_wrappers_and_preserves_plpgsql() {
    let input = "\
-- header comment
BEGIN;
CREATE TABLE demo (id INT);
DO $$
BEGIN
  IF TRUE THEN
    PERFORM 1;
  END IF;
END
$$;
CREATE FUNCTION demo_fn() RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN;
END;
$fn$;
/* trailing comment */ COMMIT TRANSACTION;
END;
";
    let stripped = strip_top_level_tx_control(input);
    assert!(!stripped.contains("COMMIT TRANSACTION"));
    assert!(stripped.contains("CREATE TABLE demo (id INT);"));
    assert!(stripped.contains("DO $$\nBEGIN"));
    assert!(stripped.contains("END\n$$;"));
    assert!(stripped.contains("AS $fn$\nBEGIN\n  RETURN;\nEND;\n$fn$;"));
  }
}
