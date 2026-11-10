mod report;
mod source;
mod worker;

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use report::{Report, inspect, install, prepare_report, summary};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use source::{Material, RootSource, load_source, merge_candidate, revision, source_revision};
use sqlx::{PgConnection, PgPool, Postgres, Transaction};
use worker::{record_observation, tick};
use y_octo::Doc;

use super::{
  BackendRuntime, CurrentDoc, CurrentDocUpdate, InvalidationHintV1, RuntimeError, RuntimeResult,
  invalidate_doc_blob_projection, load_current_doc_parts_in, load_root_parts, next_workspace_doc_update_timestamp,
  root_was_initialized,
};

const KIND: &str = "workspace_root_source";
const BATCH: i64 = 100;

#[derive(Deserialize)]
#[serde(tag = "command", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum Command {
  Tick,
  Register {
    workspace_id: String,
    source_revision: Option<String>,
  },
  Inspect {
    workspace_id: String,
    #[serde(default)]
    history_timestamps: Vec<DateTime<Utc>>,
    #[serde(default)]
    backups: Vec<Backup>,
  },
  Apply {
    report: Report,
  },
  Notify {
    workspace_id: String,
  },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
  id: String,
  workspace_id: String,
  blob: String,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn workspace_root_maintenance_v1(&self, input: Value) -> napi::Result<Value> {
    let command = serde_json::from_value(input)
      .map_err(|error| RuntimeError::invalid_input(format!("invalid root maintenance request: {error}")))?;
    let pool = self.pool().await?;
    let output = match command {
      Command::Tick => tick(self, &pool).await?,
      Command::Register {
        workspace_id,
        source_revision,
      } => {
        json!({"registered": record_observation(&pool, &workspace_id, source_revision.as_deref()).await?})
      }
      Command::Inspect {
        workspace_id,
        history_timestamps,
        backups,
      } => serde_json::to_value(inspect(&pool, &workspace_id, &history_timestamps, backups).await?)
        .map_err(|error| RuntimeError::json("serialize root inspection", error))?,
      Command::Apply { report } => install(self, &pool, report).await?,
      Command::Notify { workspace_id } => {
        let mut transaction = pool
          .begin()
          .await
          .map_err(|error| RuntimeError::database("begin root notification", error))?;
        lock_root(&mut transaction, &workspace_id, false).await?;
        let source = load_source(&mut transaction, &workspace_id).await?;
        if source.reason != "healthy" {
          return Err(RuntimeError::invalid_state("doc_root_source_invalid").into());
        }
        transaction
          .commit()
          .await
          .map_err(|error| RuntimeError::database("commit root notification read", error))?;
        self
          .notify_root_source(&workspace_id, source.timestamp_ms().unwrap())
          .await;
        json!({"workspaceId": workspace_id, "installedRevision": source.revision, "notification": "attempted"})
      }
    };
    Ok(output)
  }
}

impl BackendRuntime {
  async fn notify_root_source(&self, workspace_id: &str, timestamp_ms: i64) {
    if let Some(invalidation) = self.invalidation.lock().await.as_ref().cloned() {
      invalidation
        .publish(InvalidationHintV1::WorkspaceRootChanged {
          workspace_id: workspace_id.to_string(),
          timestamp_ms,
        })
        .await;
    }
  }
}

async fn lock_root(
  transaction: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  try_only: bool,
) -> RuntimeResult<bool> {
  if try_only {
    super::try_lock_current_doc_read(transaction, workspace_id, workspace_id).await
  } else {
    super::lock_current_doc_read(transaction, workspace_id, workspace_id).await?;
    Ok(true)
  }
}

fn digest(bytes: &[u8]) -> String {
  hex::encode(Sha256::digest(bytes))
}

fn json_digest<T: Serialize>(value: &T) -> RuntimeResult<String> {
  serde_json::to_vec(value)
    .map(|bytes| digest(&bytes))
    .map_err(|error| RuntimeError::json("hash root report", error))
}

async fn checkpoint(
  connection: &mut PgConnection,
  workspace_id: &str,
  status: &str,
  metadata: Value,
) -> RuntimeResult<()> {
  sqlx::query(
    "INSERT INTO storage_reconciliation_checkpoints(kind,scope,status,metadata,completed_at) VALUES($1,$2,$3,$4,CASE \
     WHEN $3='healthy' THEN clock_timestamp() ELSE NULL END) ON CONFLICT(kind,scope) DO UPDATE SET \
     status=excluded.status,metadata=excluded.metadata, \
     completed_at=excluded.completed_at,updated_at=clock_timestamp()",
  )
  .bind(KIND)
  .bind(workspace_id)
  .bind(status)
  .bind(metadata)
  .execute(connection)
  .await
  .map_err(|error| RuntimeError::database("save root source inspection", error))?;
  Ok(())
}

async fn read_checkpoint(connection: &mut PgConnection, workspace_id: &str) -> RuntimeResult<Option<(String, Value)>> {
  sqlx::query_as::<_, (String, Value)>(
    "SELECT status,metadata FROM storage_reconciliation_checkpoints WHERE kind=$1 AND scope=$2 FOR UPDATE",
  )
  .bind(KIND)
  .bind(workspace_id)
  .fetch_optional(connection)
  .await
  .map_err(|error| RuntimeError::database("read root source inspection", error))
}
