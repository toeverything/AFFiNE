use std::collections::{HashMap, HashSet};

use serde_json::Value;
use sqlx::{PgPool, Postgres, Row, Transaction};

use super::{ProjectionInput, SearchChange, SearchSnapshot, SearchTable, stream::allocate};
use crate::runtime::{RuntimeError, RuntimeResult};

pub(in crate::runtime::backend_runtime::search) struct SearchStore {
  pool: PgPool,
}

impl SearchStore {
  pub(in crate::runtime::backend_runtime::search) fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  pub(in crate::runtime::backend_runtime::search) async fn replace_document(
    &self,
    mut document: ProjectionInput,
    mut blocks: Vec<ProjectionInput>,
  ) -> RuntimeResult<()> {
    if blocks
      .iter()
      .any(|block| block.workspace_id != document.workspace_id || block.doc_id != document.doc_id)
    {
      return Err(RuntimeError::invalid_input("block identity does not match document"));
    }
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin search projection transaction", error))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("{}/{}", document.workspace_id, document.doc_id))
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("lock search document projection", error))?;

    let current_document = load_rows(
      &mut transaction,
      SearchTable::Doc,
      &document.workspace_id,
      &document.doc_id,
    )
    .await?;
    if let Some(existing) = current_document.get(&document.external_id)
      && existing != &document
      && existing.acl_revision < document.acl_revision
    {
      document.revision = existing.revision + 1;
      for block in &mut blocks {
        block.revision = document.revision;
      }
    }
    if let Some(existing) = current_document.get(&document.external_id) {
      if existing.revision > document.revision {
        transaction
          .commit()
          .await
          .map_err(|error| RuntimeError::database("commit stale search projection", error))?;
        return Ok(());
      }
      if existing.revision == document.revision {
        let current_blocks = load_rows(
          &mut transaction,
          SearchTable::Block,
          &document.workspace_id,
          &document.doc_id,
        )
        .await?;
        let incoming_blocks = blocks
          .iter()
          .map(|block| (block.external_id.clone(), block))
          .collect::<HashMap<_, _>>();
        let blocks_match = current_blocks.len() == incoming_blocks.len()
          && current_blocks
            .iter()
            .all(|(id, block)| incoming_blocks.get(id).is_some_and(|incoming| block == *incoming));
        if existing != &document || !blocks_match {
          return Err(RuntimeError::invalid_state("conflicting search projection revision"));
        }
        transaction
          .commit()
          .await
          .map_err(|error| RuntimeError::database("commit duplicate search projection", error))?;
        return Ok(());
      }
    }

    self
      .replace_table(
        &mut transaction,
        SearchTable::Doc,
        vec![document.clone()],
        Some(document.revision),
      )
      .await?;
    self
      .replace_table(&mut transaction, SearchTable::Block, blocks, Some(document.revision))
      .await?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit search projection transaction", error))
  }

  pub(in crate::runtime::backend_runtime::search) async fn delete_document(
    &self,
    workspace_id: &str,
    doc_id: &str,
    revision: i64,
  ) -> RuntimeResult<()> {
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin search delete transaction", error))?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
      .bind(format!("{workspace_id}/{doc_id}"))
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("lock search document deletion", error))?;
    for table in SearchTable::ORDERED {
      let rows = load_rows(&mut transaction, table, workspace_id, doc_id).await?;
      let deletions = rows
        .into_values()
        .filter(|row| row.revision <= revision)
        .collect::<Vec<_>>();
      self
        .apply(&mut transaction, table, Vec::new(), deletions, revision)
        .await?;
    }
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit search delete transaction", error))
  }

  async fn replace_table(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    table: SearchTable,
    inputs: Vec<ProjectionInput>,
    delete_revision: Option<i64>,
  ) -> RuntimeResult<()> {
    let Some(first) = inputs.first() else {
      return Ok(());
    };
    let current = load_rows(transaction, table, &first.workspace_id, &first.doc_id).await?;
    let input_ids = inputs
      .iter()
      .map(|input| input.external_id.clone())
      .collect::<HashSet<_>>();
    let mut upserts = Vec::new();
    for input in inputs {
      match current.get(&input.external_id) {
        Some(existing) if existing.revision > input.revision => continue,
        Some(existing) if existing.revision == input.revision => {
          if existing != &input {
            return Err(RuntimeError::invalid_state("conflicting search projection revision"));
          }
        }
        Some(existing) if existing == &input => {}
        _ => upserts.push(input),
      }
    }
    let deletions = current
      .into_values()
      .filter(|row| {
        !input_ids.contains(row.external_id.as_str())
          && delete_revision.is_some_and(|revision| row.revision <= revision)
      })
      .collect();
    self
      .apply(
        transaction,
        table,
        upserts,
        deletions,
        delete_revision.unwrap_or_default(),
      )
      .await
  }

  async fn apply(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    table: SearchTable,
    upserts: Vec<ProjectionInput>,
    deletions: Vec<ProjectionInput>,
    delete_revision: i64,
  ) -> RuntimeResult<()> {
    let first_sequence = allocate(transaction, table, upserts.len() + deletions.len()).await?;
    let mut sequence = first_sequence;
    for input in upserts {
      insert_change(
        transaction,
        table,
        sequence,
        "upsert",
        &input,
        Some(&input.payload),
        input.revision,
      )
      .await?;
      sqlx::query(
        r#"INSERT INTO search_runtime_projections
          (table_key, external_id, workspace_id, doc_id, revision, payload,
           acl_public_readable, acl_member_default_readable, acl_read_user_ids, acl_revision)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (table_key, external_id) DO UPDATE SET
            workspace_id=EXCLUDED.workspace_id, doc_id=EXCLUDED.doc_id,
            revision=EXCLUDED.revision, payload=EXCLUDED.payload,
            acl_public_readable=EXCLUDED.acl_public_readable,
            acl_member_default_readable=EXCLUDED.acl_member_default_readable,
            acl_read_user_ids=EXCLUDED.acl_read_user_ids,
            acl_revision=EXCLUDED.acl_revision, updated_at=now()
          WHERE search_runtime_projections.revision < EXCLUDED.revision"#,
      )
      .bind(table.as_str())
      .bind(&input.external_id)
      .bind(&input.workspace_id)
      .bind(&input.doc_id)
      .bind(input.revision)
      .bind(&input.payload)
      .bind(input.acl_public_readable)
      .bind(input.acl_member_default_readable)
      .bind(&input.acl_read_user_ids)
      .bind(input.acl_revision)
      .execute(&mut **transaction)
      .await
      .map_err(|error| RuntimeError::database("upsert search projection", error))?;
      sequence += 1;
    }
    for input in deletions {
      insert_change(
        transaction,
        table,
        sequence,
        "delete",
        &input,
        Some(&input.payload),
        delete_revision,
      )
      .await?;
      sqlx::query("DELETE FROM search_runtime_projections WHERE table_key=$1 AND external_id=$2 AND revision <= $3")
        .bind(table.as_str())
        .bind(&input.external_id)
        .bind(delete_revision)
        .execute(&mut **transaction)
        .await
        .map_err(|error| RuntimeError::database("delete search projection", error))?;
      sequence += 1;
    }
    Ok(())
  }

  pub(in crate::runtime::backend_runtime::search) async fn snapshot(
    &self,
    table: SearchTable,
  ) -> RuntimeResult<SearchSnapshot> {
    let mut transaction = self
      .pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("begin search snapshot", error))?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
      .execute(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("configure search snapshot", error))?;
    let head = sqlx::query_scalar("SELECT head FROM search_runtime_streams WHERE table_key=$1")
      .bind(table.as_str())
      .fetch_one(&mut *transaction)
      .await
      .map_err(|error| RuntimeError::database("read search snapshot head", error))?;
    let rows = sqlx::query(
      r#"SELECT external_id, workspace_id, doc_id, revision, payload,
         acl_public_readable, acl_member_default_readable, acl_read_user_ids, acl_revision
         FROM search_runtime_projections WHERE table_key=$1 ORDER BY external_id"#,
    )
    .bind(table.as_str())
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| RuntimeError::database("read search projection snapshot", error))?;
    let projections = rows.iter().map(decode_projection).collect::<RuntimeResult<Vec<_>>>()?;
    transaction
      .commit()
      .await
      .map_err(|error| RuntimeError::database("commit search snapshot", error))?;
    Ok(SearchSnapshot { head, projections })
  }

  pub(in crate::runtime::backend_runtime::search) async fn changes(
    &self,
    table: SearchTable,
    after: i64,
    limit: i64,
  ) -> RuntimeResult<(i64, Vec<SearchChange>)> {
    if after < 0 || limit <= 0 {
      return Err(RuntimeError::invalid_input("invalid search replay cursor"));
    }
    let state = sqlx::query("SELECT head, retained_from FROM search_runtime_streams WHERE table_key=$1")
      .bind(table.as_str())
      .fetch_one(&self.pool)
      .await
      .map_err(|error| RuntimeError::database("read search stream state", error))?;
    let head: i64 = state
      .try_get("head")
      .map_err(|error| RuntimeError::database("decode stream head", error))?;
    let retained_from: i64 = state
      .try_get("retained_from")
      .map_err(|error| RuntimeError::database("decode retained cursor", error))?;
    if after < retained_from {
      return Err(RuntimeError::SearchReplayGap);
    }
    let rows = sqlx::query(
      r#"SELECT stream_sequence, external_id, workspace_id, doc_id, revision, operation, payload
         FROM search_runtime_changes WHERE table_key=$1 AND stream_sequence>$2
         ORDER BY stream_sequence LIMIT $3"#,
    )
    .bind(table.as_str())
    .bind(after)
    .bind(limit)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("read search stream changes", error))?;
    if after < head
      && rows
        .first()
        .and_then(|row| row.try_get::<i64, _>("stream_sequence").ok())
        != Some(after + 1)
    {
      return Err(RuntimeError::SearchReplayGap);
    }
    let changes = rows
      .into_iter()
      .map(|row| {
        Ok(SearchChange {
          sequence: row
            .try_get("stream_sequence")
            .map_err(|error| RuntimeError::database("decode change sequence", error))?,
          external_id: row
            .try_get("external_id")
            .map_err(|error| RuntimeError::database("decode change external id", error))?,
          workspace_id: row
            .try_get("workspace_id")
            .map_err(|error| RuntimeError::database("decode change workspace", error))?,
          doc_id: row
            .try_get("doc_id")
            .map_err(|error| RuntimeError::database("decode change doc", error))?,
          revision: row
            .try_get("revision")
            .map_err(|error| RuntimeError::database("decode change revision", error))?,
          operation: row
            .try_get("operation")
            .map_err(|error| RuntimeError::database("decode change operation", error))?,
          payload: row
            .try_get("payload")
            .map_err(|error| RuntimeError::database("decode change payload", error))?,
        })
      })
      .collect::<RuntimeResult<Vec<_>>>()?;
    Ok((head, changes))
  }
}

async fn load_rows(
  transaction: &mut Transaction<'_, Postgres>,
  table: SearchTable,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<HashMap<String, ProjectionInput>> {
  let rows = sqlx::query(
    r#"SELECT external_id, workspace_id, doc_id, revision, payload,
       acl_public_readable, acl_member_default_readable, acl_read_user_ids, acl_revision
       FROM search_runtime_projections
       WHERE table_key=$1 AND workspace_id=$2 AND doc_id=$3 FOR UPDATE"#,
  )
  .bind(table.as_str())
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("load search projections", error))?;
  rows
    .iter()
    .map(|row| decode_projection(row).map(|projection| (projection.external_id.clone(), projection)))
    .collect()
}

fn decode_projection(row: &sqlx::postgres::PgRow) -> RuntimeResult<ProjectionInput> {
  Ok(ProjectionInput {
    external_id: row
      .try_get("external_id")
      .map_err(|error| RuntimeError::database("decode projection id", error))?,
    workspace_id: row
      .try_get("workspace_id")
      .map_err(|error| RuntimeError::database("decode projection workspace", error))?,
    doc_id: row
      .try_get("doc_id")
      .map_err(|error| RuntimeError::database("decode projection doc", error))?,
    revision: row
      .try_get("revision")
      .map_err(|error| RuntimeError::database("decode projection revision", error))?,
    payload: row
      .try_get("payload")
      .map_err(|error| RuntimeError::database("decode projection payload", error))?,
    acl_public_readable: row
      .try_get("acl_public_readable")
      .map_err(|error| RuntimeError::database("decode projection public ACL", error))?,
    acl_member_default_readable: row
      .try_get("acl_member_default_readable")
      .map_err(|error| RuntimeError::database("decode projection member ACL", error))?,
    acl_read_user_ids: row
      .try_get("acl_read_user_ids")
      .map_err(|error| RuntimeError::database("decode projection ACL users", error))?,
    acl_revision: row
      .try_get("acl_revision")
      .map_err(|error| RuntimeError::database("decode projection ACL revision", error))?,
  })
}

async fn insert_change(
  transaction: &mut Transaction<'_, Postgres>,
  table: SearchTable,
  sequence: i64,
  operation: &str,
  input: &ProjectionInput,
  payload: Option<&Value>,
  revision: i64,
) -> RuntimeResult<()> {
  sqlx::query(
    r#"INSERT INTO search_runtime_changes
       (table_key,stream_sequence,external_id,workspace_id,doc_id,revision,operation,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)"#,
  )
  .bind(table.as_str())
  .bind(sequence)
  .bind(&input.external_id)
  .bind(&input.workspace_id)
  .bind(&input.doc_id)
  .bind(revision)
  .bind(operation)
  .bind(payload)
  .execute(&mut **transaction)
  .await
  .map_err(|error| RuntimeError::database("insert search stream change", error))?;
  Ok(())
}
