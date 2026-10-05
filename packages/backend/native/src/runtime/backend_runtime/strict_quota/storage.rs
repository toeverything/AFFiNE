use affine_core::access_control::{
  DocAction, QuotaUsage, STORAGE_RESERVATION_MINUTES, StorageAuthorizationFacts, StorageLedgerFacts,
  StorageMutationIntent, StorageObjectFacts, StorageReservationDenial, StorageReservationError,
  StorageReservationFacts, StorageReservationPlan, StorageReservationRequest, StorageResource, WorkspaceAction,
  plan_storage_reservation,
};
use chrono::{DateTime, Utc};
use napi::Result;
use sqlx::{Connection, Postgres, Row, Transaction};
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, RuntimeResult, napi_error, permission::PermissionAuthorizer},
  ChargeSubject, StorageOperation, chargeable_invitation_statuses, invalidate_storage_usage, load_decision_time,
  promotion::final_storage_locator,
  resolve_quota_charge, storage_usage,
};
use crate::runtime::{
  Deployment,
  object_storage::types::ObjectMetadata,
  types::{RuntimeStorageReservationDecision, RuntimeStorageReservationInput},
};

pub(super) fn storage_resource(kind: &str) -> RuntimeResult<StorageResource> {
  match kind {
    "blob" => Ok(StorageResource::Blob),
    "comment_attachment" => Ok(StorageResource::CommentAttachment),
    _ => Err(RuntimeError::invalid_input("invalid storage reservation kind")),
  }
}

async fn storage_authorization_in(
  tx: &mut Transaction<'_, Postgres>,
  authorizer: &PermissionAuthorizer,
  workspace_id: &str,
  actor_user_id: &str,
  resource: StorageResource,
  doc_id: Option<&str>,
) -> RuntimeResult<StorageAuthorizationFacts> {
  match resource {
    StorageResource::Blob => Ok(StorageAuthorizationFacts {
      workspace_upload: authorizer
        .authorize_workspace_action_in(tx, workspace_id, Some(actor_user_id), WorkspaceAction::BlobsUpload)
        .await?
        .allowed,
      doc_read: false,
      doc_comment_create: false,
    }),
    StorageResource::CommentAttachment => {
      let doc_id =
        doc_id.ok_or_else(|| RuntimeError::invalid_input("comment attachment reservation requires docId"))?;
      let decisions = authorizer
        .authorize_doc_actions_in(
          tx,
          workspace_id,
          Some(actor_user_id),
          doc_id,
          &[DocAction::Read, DocAction::CommentsCreate],
        )
        .await?;
      Ok(StorageAuthorizationFacts {
        workspace_upload: false,
        doc_read: decisions
          .iter()
          .find(|(action, _)| *action == DocAction::Read)
          .is_some_and(|(_, decision)| decision.allowed),
        doc_comment_create: decisions
          .iter()
          .find(|(action, _)| *action == DocAction::CommentsCreate)
          .is_some_and(|(_, decision)| decision.allowed),
      })
    }
  }
}

pub(super) async fn lock_subject(
  tx: &mut Transaction<'_, Postgres>,
  workspace_id: &str,
  actor_user_id: &str,
  resource: StorageResource,
  doc_id: Option<&str>,
  deployment: Deployment,
  authorizer: &PermissionAuthorizer,
) -> RuntimeResult<(ChargeSubject, DateTime<Utc>, StorageAuthorizationFacts)> {
  let owner_id: String = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_optional(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("load workspace quota owner", error))?
  .ok_or_else(|| RuntimeError::invalid_input("workspace owner not found"))?;
  sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
    .bind(&owner_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock quota owner", error))?;
  sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
    .bind(workspace_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| RuntimeError::database("lock quota workspace", error))?;
  let locked_owner_id: String = sqlx::query_scalar(
    "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
  )
  .bind(workspace_id)
  .fetch_one(&mut **tx)
  .await
  .map_err(|error| RuntimeError::database("verify storage quota owner", error))?;
  if locked_owner_id != owner_id {
    return Err(RuntimeError::invalid_input("storage_quota_subject_changed"));
  }
  let authorization = storage_authorization_in(tx, authorizer, workspace_id, actor_user_id, resource, doc_id).await?;
  let now = load_decision_time(tx, "load strict storage decision clock").await?;
  let subject = resolve_quota_charge(tx, deployment, workspace_id, owner_id, now).await?;
  Ok((subject, now, authorization))
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn reserve_storage_quota_v1(
    &self,
    input: RuntimeStorageReservationInput,
  ) -> Result<RuntimeStorageReservationDecision> {
    let resource = storage_resource(&input.kind)?;
    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, self.permission_telemetry.clone());
    let final_locator = final_storage_locator(&input.kind, &input.workspace_id, input.doc_id.as_deref(), &input.key)?;
    let mut operation = StorageOperation::acquire(&pool, &input.workspace_id, Some(final_locator.key.as_str())).await?;
    let outcome = async {
      let mut completed_metadata: Option<ObjectMetadata> = None;
      let mut completed_rechecked = false;
      loop {
        let mut tx = operation
          .connection()
          .begin()
          .await
          .map_err(|error| RuntimeError::database("start strict storage transaction", error))?;
        let (subject, now, authorization) = lock_subject(
          &mut tx,
          &input.workspace_id,
          &input.user_id,
          resource,
          input.doc_id.as_deref(),
          deployment,
          &authorizer,
        )
        .await?;
        let existing = if resource == StorageResource::Blob {
          sqlx::query(
            "SELECT size,mime,status::text AS status,reservation_id,reservation_expires_at,deleted_at FROM blobs \
             WHERE workspace_id=$1 AND key=$2",
          )
          .bind(&input.workspace_id)
          .bind(&input.key)
          .fetch_optional(&mut *tx)
          .await
        } else {
          sqlx::query(
            "SELECT size,mime,status::text AS status,reservation_id,reservation_expires_at,deleted_at,created_by FROM \
             comment_attachments WHERE workspace_id=$1 AND doc_id=$2 AND key=$3",
          )
          .bind(&input.workspace_id)
          .bind(input.doc_id.as_deref())
          .bind(&input.key)
          .fetch_optional(&mut *tx)
          .await
        }
        .map_err(|error| RuntimeError::database("load storage reservation", error))?;
        let used = storage_usage(&mut tx, &input.workspace_id, &subject, deployment, now).await?;
        let chargeable_statuses = chargeable_invitation_statuses();
        let charged_seats: i64 = sqlx::query_scalar(
          r#"SELECT
          (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
          + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
            AND status::text = ANY($2))"#,
        )
        .bind(&input.workspace_id)
        .bind(chargeable_statuses.as_slice())
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("load strict storage seat usage", error))?;
        let mut resume_id = None;
        let ledger = if let Some(existing) = existing.as_ref() {
          if existing.get::<Option<DateTime<Utc>>, _>("deleted_at").is_some() {
            StorageLedgerFacts::Deleted
          } else {
            let status: String = existing.get("status");
            let ledger_mime: String = existing.get("mime");
            let size_matches = i64::from(existing.get::<i32, _>("size")) == input.size;
            let mime_matches = ledger_mime == input.mime;
            let owner_matches = resource != StorageResource::CommentAttachment
              || existing.get::<Option<String>, _>("created_by").as_deref() == Some(input.user_id.as_str());
            match status.as_str() {
              "pending" => {
                resume_id = Some(existing.get::<Uuid, _>("reservation_id"));
                StorageLedgerFacts::Pending {
                  live: existing
                    .try_get::<Option<DateTime<Utc>>, _>("reservation_expires_at")
                    .ok()
                    .flatten()
                    .is_some_and(|expires_at| expires_at > now),
                  size_matches,
                  mime_matches,
                  owner_matches,
                }
              }
              "completed" => StorageLedgerFacts::Completed {
                size_matches,
                mime_matches,
                owner_matches,
                object: if !completed_rechecked {
                  StorageObjectFacts::NotChecked
                } else if let Some(metadata) = &completed_metadata {
                  if metadata.content_length == input.size && metadata.content_type == ledger_mime {
                    StorageObjectFacts::Matching
                  } else {
                    StorageObjectFacts::MetadataMismatch
                  }
                } else {
                  StorageObjectFacts::Missing
                },
              },
              _ => StorageLedgerFacts::InvalidStatus,
            }
          }
        } else {
          StorageLedgerFacts::Missing
        };
        let plan = plan_storage_reservation(
          StorageReservationRequest {
            resource,
            size: input.size,
            has_key: !input.key.is_empty(),
            has_doc_id: input.doc_id.is_some(),
            has_name: input.name.is_some(),
          },
          StorageReservationFacts {
            authorization,
            grant: subject.grant.clone(),
            usage: QuotaUsage {
              storage_bytes: used,
              charged_seats,
            },
            ledger,
          },
        );
        let intent = match plan {
          Ok(StorageReservationPlan::Mutate {
            intent: StorageMutationIntent::InspectCompletedObject,
            ..
          }) => {
            tx.commit()
              .await
              .map_err(|error| RuntimeError::database("commit completed reservation observation", error))?;
            completed_metadata = self.object_storage()?.head(&final_locator).await?;
            completed_rechecked = true;
            continue;
          }
          Ok(StorageReservationPlan::Mutate {
            intent: StorageMutationIntent::AlreadyUploaded,
            ..
          }) => {
            tx.commit()
              .await
              .map_err(|error| RuntimeError::database("commit storage duplicate", error))?;
            self
              .permission_telemetry
              .quota_guard("storage", "reserve", "allow", "completed");
            return Ok(RuntimeStorageReservationDecision {
              allowed: true,
              reservation_id: None,
              already_uploaded: true,
              reason: None,
              limit: Some(subject.grant.limits.storage_quota),
              current: None,
              requested: input.size,
            });
          }
          Ok(StorageReservationPlan::Mutate {
            intent: StorageMutationIntent::Resume,
            ..
          }) => {
            tx.commit()
              .await
              .map_err(|error| RuntimeError::database("commit storage resume", error))?;
            self
              .permission_telemetry
              .quota_guard("storage", "reserve", "allow", "resume");
            return Ok(RuntimeStorageReservationDecision {
              allowed: true,
              reservation_id: resume_id.map(|value| value.to_string()),
              already_uploaded: false,
              reason: None,
              limit: Some(subject.grant.limits.storage_quota),
              current: None,
              requested: input.size,
            });
          }
          Ok(StorageReservationPlan::Mutate { intent, .. }) => intent,
          Ok(StorageReservationPlan::Deny(reason)) => {
            let (reason, limit, current, metric) = match reason {
              StorageReservationDenial::Forbidden => return Err(napi_error("workspace_upload_forbidden")),
              StorageReservationDenial::WorkspaceReadonly => (
                "storage_limit",
                Some(subject.grant.limits.storage_quota),
                Some(used),
                "workspace_readonly",
              ),
              StorageReservationDenial::BlobLimitExceeded { limit } => ("blob_limit", Some(limit), None, "blob_limit"),
              StorageReservationDenial::StorageLimitExceeded { limit } => {
                ("storage_limit", Some(limit), Some(used), "storage_limit")
              }
              StorageReservationDenial::ArithmeticOverflow => (
                "storage_limit",
                Some(subject.grant.limits.storage_quota),
                Some(used),
                "arithmetic_overflow",
              ),
            };
            self
              .permission_telemetry
              .quota_guard("storage", "reserve", "deny", metric);
            return Ok(RuntimeStorageReservationDecision {
              allowed: false,
              reservation_id: None,
              already_uploaded: false,
              reason: Some(reason.to_string()),
              limit,
              current,
              requested: input.size,
            });
          }
          Err(StorageReservationError::ObjectMetadataMismatch) => {
            let deleted = if resource == StorageResource::Blob {
              sqlx::query(
                "UPDATE blobs SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE workspace_id=$1 AND key=$2 \
                 AND status='completed'",
              )
              .bind(&input.workspace_id)
              .bind(&input.key)
              .execute(&mut *tx)
              .await
            } else {
              sqlx::query(
                "UPDATE comment_attachments SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE \
                 workspace_id=$1 AND doc_id=$2 AND key=$3 AND status='completed'",
              )
              .bind(&input.workspace_id)
              .bind(input.doc_id.as_deref())
              .bind(&input.key)
              .execute(&mut *tx)
              .await
            }
            .map_err(|error| RuntimeError::database("deny mismatched completed storage object", error))?;
            if deleted.rows_affected() != 1 {
              return Err(napi_error("storage reservation changed"));
            }
            tx.commit()
              .await
              .map_err(|error| RuntimeError::database("commit mismatched storage object denial", error))?;
            self.object_storage()?.delete(&final_locator).await?;
            return Err(napi_error("storage final object metadata mismatch"));
          }
          Err(error) => {
            return Err(napi_error(match error {
              StorageReservationError::InvalidRequest => "invalid storage reservation",
              StorageReservationError::MissingAttachmentFields => {
                "comment attachment reservation requires docId and name"
              }
              StorageReservationError::Deleted => "storage key is deleted",
              StorageReservationError::SizeMismatch => "blob size mismatch",
              StorageReservationError::MimeMismatch => "blob mime mismatch",
              StorageReservationError::OwnerMismatch => "attachment reservation owner mismatch",
              StorageReservationError::InvalidLedgerStatus => "storage key is not reusable",
              StorageReservationError::ObjectMetadataMismatch => unreachable!(),
            }));
          }
        };
        let reservation_id = Uuid::new_v4();
        if resource == StorageResource::Blob && intent == StorageMutationIntent::RepairMissingObject {
          let updated = sqlx::query(
            r#"UPDATE blobs SET status='pending',reservation_id=$3,
          reservation_expires_at=clock_timestamp()+make_interval(mins=>$4),upload_id=$5
          WHERE workspace_id=$1 AND key=$2 AND status='completed' AND deleted_at IS NULL AND size=$6 AND mime=$7"#,
          )
          .bind(&input.workspace_id)
          .bind(&input.key)
          .bind(reservation_id)
          .bind(STORAGE_RESERVATION_MINUTES)
          .bind(&input.upload_id)
          .bind(i32::try_from(input.size).map_err(|_| napi_error("blob size exceeds database range"))?)
          .bind(&input.mime)
          .execute(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("repair missing completed blob", error))?;
          if updated.rows_affected() != 1 {
            return Err(napi_error("storage reservation changed"));
          }
        } else if resource == StorageResource::Blob && intent == StorageMutationIntent::ReplaceExpired {
          let updated = sqlx::query(
            r#"UPDATE blobs SET mime=$3,size=$4,status='pending',reservation_id=$5,
          reservation_expires_at=clock_timestamp()+make_interval(mins=>$6),upload_id=$7,deleted_at=NULL
          WHERE workspace_id=$1 AND key=$2 AND status='pending' AND reservation_expires_at <= $8"#,
          )
          .bind(&input.workspace_id)
          .bind(&input.key)
          .bind(&input.mime)
          .bind(i32::try_from(input.size).map_err(|_| napi_error("blob size exceeds database range"))?)
          .bind(reservation_id)
          .bind(STORAGE_RESERVATION_MINUTES)
          .bind(&input.upload_id)
          .bind(now)
          .execute(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("replace expired blob reservation", error))?;
          if updated.rows_affected() != 1 {
            return Err(napi_error("storage reservation changed"));
          }
        } else if resource == StorageResource::Blob {
          sqlx::query(
            r#"INSERT INTO blobs
          (workspace_id,key,size,mime,status,reservation_id,reservation_expires_at,upload_id)
          VALUES ($1,$2,$3,$4,'pending',$5,clock_timestamp()+make_interval(mins=>$6),$7)"#,
          )
          .bind(&input.workspace_id)
          .bind(&input.key)
          .bind(i32::try_from(input.size).map_err(|_| napi_error("blob size exceeds database range"))?)
          .bind(&input.mime)
          .bind(reservation_id)
          .bind(STORAGE_RESERVATION_MINUTES)
          .bind(&input.upload_id)
          .execute(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("insert blob reservation", error))?;
        } else if intent == StorageMutationIntent::RepairMissingObject {
          let updated = sqlx::query(
            r#"UPDATE comment_attachments SET status='pending',reservation_id=$4,
          reservation_expires_at=clock_timestamp()+make_interval(mins=>$5)
          WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND status='completed' AND deleted_at IS NULL
            AND size=$6 AND mime=$7 AND created_by=$8"#,
          )
          .bind(&input.workspace_id)
          .bind(input.doc_id.as_deref())
          .bind(&input.key)
          .bind(reservation_id)
          .bind(STORAGE_RESERVATION_MINUTES)
          .bind(i32::try_from(input.size).map_err(|_| napi_error("attachment size exceeds database range"))?)
          .bind(&input.mime)
          .bind(&input.user_id)
          .execute(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("repair missing completed attachment", error))?;
          if updated.rows_affected() != 1 {
            return Err(napi_error("storage reservation changed"));
          }
        } else if intent == StorageMutationIntent::ReplaceExpired {
          let updated = sqlx::query(
            r#"UPDATE comment_attachments SET size=$4,mime=$5,name=$6,status='pending',reservation_id=$7,
          reservation_expires_at=clock_timestamp()+make_interval(mins=>$8),deleted_at=NULL,created_by=$9
          WHERE workspace_id=$1 AND doc_id=$2 AND key=$3 AND status='pending' AND reservation_expires_at <= $10"#,
          )
          .bind(&input.workspace_id)
          .bind(input.doc_id.as_deref())
          .bind(&input.key)
          .bind(i32::try_from(input.size).map_err(|_| napi_error("attachment size exceeds database range"))?)
          .bind(&input.mime)
          .bind(input.name.as_deref())
          .bind(reservation_id)
          .bind(STORAGE_RESERVATION_MINUTES)
          .bind(&input.user_id)
          .bind(now)
          .execute(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("replace expired attachment reservation", error))?;
          if updated.rows_affected() != 1 {
            return Err(napi_error("storage reservation changed"));
          }
        } else {
          sqlx::query(
            r#"INSERT INTO comment_attachments
          (workspace_id,doc_id,key,size,mime,name,status,reservation_id,reservation_expires_at,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,clock_timestamp()+make_interval(mins=>$8),$9)"#,
          )
          .bind(&input.workspace_id)
          .bind(input.doc_id.as_deref())
          .bind(&input.key)
          .bind(i32::try_from(input.size).map_err(|_| napi_error("attachment size exceeds database range"))?)
          .bind(&input.mime)
          .bind(input.name.as_deref())
          .bind(reservation_id)
          .bind(STORAGE_RESERVATION_MINUTES)
          .bind(&input.user_id)
          .execute(&mut *tx)
          .await
          .map_err(|error| RuntimeError::database("insert attachment reservation", error))?;
        }
        tx.commit()
          .await
          .map_err(|error| RuntimeError::database("commit storage reservation", error))?;
        invalidate_storage_usage(self, &input.workspace_id, Some(&subject.owner_id)).await;
        self
          .permission_telemetry
          .quota_guard("storage", "reserve", "allow", "reserved");
        return Ok(RuntimeStorageReservationDecision {
          allowed: true,
          reservation_id: Some(reservation_id.to_string()),
          already_uploaded: false,
          reason: None,
          limit: Some(subject.grant.limits.storage_quota),
          current: Some(used),
          requested: input.size,
        });
      }
    }
    .await;
    operation.release().await?;
    outcome
  }
}
