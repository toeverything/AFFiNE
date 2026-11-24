use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};

use crate::acl::readable_doc_role;
use crate::doc_extract::{LegacyWorkspace, extract_legacy_workspace, project_document_search};
use crate::error::{SearchError, SearchResult};

#[derive(Clone, Debug, PartialEq)]
pub struct ProjectionInput {
  pub workspace_id: String,
  pub doc_id: String,
  pub payload: Value,
}

pub struct CurrentDoc {
  pub blob: Vec<u8>,
  pub updated_at: DateTime<Utc>,
}

pub async fn load_current_doc_in(
  connection: &mut PgConnection,
  workspace_id: &str,
  doc_id: &str,
) -> SearchResult<Option<CurrentDoc>> {
  let rows = sqlx::query_as::<_, (Vec<u8>, DateTime<Utc>, bool)>(
    "SELECT blob, updated_at AS timestamp, true AS snapshot FROM snapshots WHERE workspace_id = $1 AND guid = $2
     UNION ALL
     SELECT blob, created_at AS timestamp, false AS snapshot FROM updates WHERE workspace_id = $1 AND guid = $2
     ORDER BY snapshot DESC, timestamp ASC",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(connection)
  .await
  .map_err(|error| SearchError::database("load current document parts", error))?;

  if rows.is_empty() {
    return Ok(None);
  }
  let updated_at = rows
    .iter()
    .map(|(_, ts, _)| *ts)
    .max()
    .expect("non-empty rows have a max timestamp");
  let blobs: Vec<&[u8]> = rows.iter().map(|(blob, _, _)| blob.as_slice()).collect();
  let merged = if blobs.len() == 1 {
    blobs[0].to_vec()
  } else {
    y_octo::merge_updates_v1(blobs)
      .and_then(|u| u.encode_v1())
      .map_err(|error| SearchError::SourceInvalid(format!("current doc merge failed: {error}")))?
  };
  Ok(Some(CurrentDoc {
    blob: merged,
    updated_at,
  }))
}

pub async fn load_legacy_workspace_in(
  connection: &mut PgConnection,
  workspace_id: &str,
) -> SearchResult<LegacyWorkspace> {
  let current = load_current_doc_in(connection, workspace_id, workspace_id).await?;
  let (blob, revision) = match current {
    Some(doc) => (Some(doc.blob), doc.updated_at.timestamp_millis().to_string()),
    None => (None, "0".to_owned()),
  };
  extract_legacy_workspace(workspace_id, blob, revision)
}

pub async fn project_document(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> SearchResult<Option<(ProjectionInput, Vec<ProjectionInput>)>> {
  let mut conn = pool
    .acquire()
    .await
    .map_err(|error| SearchError::database("acquire connection for document projection", error))?;
  let Some(current) = load_current_doc_in(&mut conn, workspace_id, doc_id).await? else {
    return Ok(None);
  };
  drop(conn);

  let doc_id_owned = doc_id.to_owned();
  let projection = tokio::task::spawn_blocking(move || project_document_search(current.blob, doc_id_owned))
    .await
    .map_err(|error| SearchError::invalid_state(format!("search projection task failed: {error}")))??;

  let Some(metadata) = sqlx::query(
    r#"WITH records AS (
         SELECT created_at, updated_at, created_by, updated_by FROM snapshots WHERE workspace_id = $1 AND guid = $2
         UNION ALL SELECT created_at, created_at, created_by, created_by FROM updates WHERE workspace_id = $1 AND guid = $2
       ), source AS (
         SELECT min(created_at) AS created_at, max(updated_at) AS updated_at,
           (array_agg(created_by ORDER BY created_at))[1] AS created_by,
           (array_agg(updated_by ORDER BY updated_at DESC))[1] AS updated_by
         FROM records HAVING count(*) > 0
       )
       SELECT source.*, coalesce(doc_policy.visibility, 'private') AS visibility, doc_policy.public_role,
         coalesce(doc_policy.member_default_role, workspace_policy.member_default_doc_role, 'manager') AS member_default_role
       FROM source
       LEFT JOIN workspace_access_policies workspace_policy ON workspace_policy.workspace_id = $1
       LEFT JOIN doc_access_policies doc_policy ON doc_policy.workspace_id = $1 AND doc_policy.doc_id = $2"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| SearchError::database("load search projection metadata", error))?
  else {
    return Ok(None);
  };

  let visibility: String = metadata
    .try_get("visibility")
    .map_err(|error| SearchError::database("decode search doc visibility", error))?;
  let public_role: Option<String> = metadata
    .try_get("public_role")
    .map_err(|error| SearchError::database("decode search public role", error))?;
  let member_default_role: String = metadata
    .try_get("member_default_role")
    .map_err(|error| SearchError::database("decode search member default role", error))?;

  let acl_public_readable = if visibility == "public" {
    match public_role.as_deref() {
      Some(role) => readable_doc_role(role, "public")?,
      None => false,
    }
  } else {
    false
  };
  let acl_member_default_readable = readable_doc_role(&member_default_role, "member default")?;

  let grants = sqlx::query(
    "SELECT principal_id, role FROM doc_grants WHERE workspace_id = $1 AND doc_id = $2 AND principal_type = 'user' ORDER BY principal_id, role",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(pool)
  .await
  .map_err(|error| SearchError::database("load search doc grants", error))?;

  let mut acl_read_user_ids = Vec::new();
  for row in grants {
    let id: String = row
      .try_get("principal_id")
      .map_err(|error| SearchError::database("decode grant principal", error))?;
    let role: String = row
      .try_get("role")
      .map_err(|error| SearchError::database("decode grant role", error))?;
    if readable_doc_role(&role, "grant")? {
      acl_read_user_ids.push(id);
    }
  }

  let created_at: DateTime<Utc> = metadata
    .try_get("created_at")
    .map_err(|error| SearchError::database("decode search created time", error))?;
  let updated_at: DateTime<Utc> = metadata
    .try_get("updated_at")
    .map_err(|error| SearchError::database("decode search updated time", error))?;
  let created_by: Option<String> = metadata
    .try_get("created_by")
    .map_err(|error| SearchError::database("decode search creator", error))?;
  let updated_by: Option<String> = metadata
    .try_get("updated_by")
    .map_err(|error| SearchError::database("decode search updater", error))?;

  let acl = AclFields {
    public_readable: acl_public_readable,
    member_default_readable: acl_member_default_readable,
    read_user_ids: acl_read_user_ids,
  };

  let summary = projection
    .units
    .iter()
    .map(|unit| unit.text.as_str())
    .collect::<Vec<_>>()
    .join("\n")
    .chars()
    .take(1000)
    .collect::<String>();

  let document_payload = with_acl(
    json!({
      "workspace_id": workspace_id,
      "workspace_token": crate::exact_token(workspace_id),
      "doc_id": doc_id,
      "doc_token": crate::exact_token(doc_id),
      "title": projection.title,
      "summary": summary,
      "created_by_user_id": created_by.clone().unwrap_or_default(),
      "updated_by_user_id": updated_by.clone().unwrap_or_default(),
      "created_at": created_at.timestamp_millis(),
      "updated_at": updated_at.timestamp_millis(),
    }),
    &acl,
  );
  let document = ProjectionInput {
    workspace_id: workspace_id.to_owned(),
    doc_id: doc_id.to_owned(),
    payload: document_payload,
  };

  let blocks = projection
    .units
    .into_iter()
    .map(|unit| {
      let block_id = unit.block_id.clone().unwrap_or_else(|| unit.unit_id.clone());
      let payload = with_acl(
        json!({
          "workspace_id": workspace_id,
          "workspace_token": crate::exact_token(workspace_id),
          "doc_id": doc_id,
          "doc_token": crate::exact_token(doc_id),
          "block_id": block_id,
          "block_token": crate::exact_token(&block_id),
          "unit_id": unit.unit_id,
          "projection_version": projection.version,
          "source_hash": projection.source_hash,
          "visibility": serde_json::to_value(unit.visibility).unwrap_or(Value::Null),
          "element_id": unit.element_id,
          "frame_id": unit.frame_id,
          "source_block_id": unit.block_id,
          "blob": unit.blob_id,
          "ref_doc_id": unit.ref_doc_ids,
          "ref": unit.refs,
          "content": unit.text,
          "flavour": format!("affine:{}", unit.unit_type),
          "parent_flavour": unit.parent_flavour,
          "parent_block_id": unit.parent_block_id,
          "additional": unit.additional,
          "created_by_user_id": created_by.clone().unwrap_or_default(),
          "updated_by_user_id": updated_by.clone().unwrap_or_default(),
          "created_at": created_at.timestamp_millis(),
          "updated_at": updated_at.timestamp_millis(),
        }),
        &acl,
      );
      ProjectionInput {
        workspace_id: workspace_id.to_owned(),
        doc_id: doc_id.to_owned(),
        payload,
      }
    })
    .collect();

  Ok(Some((document, blocks)))
}

struct AclFields {
  public_readable: bool,
  member_default_readable: bool,
  read_user_ids: Vec<String>,
}

fn with_acl(mut payload: Value, acl: &AclFields) -> Value {
  let object = payload.as_object_mut().expect("search projection payload is an object");
  object.insert("acl_public_readable".to_owned(), json!(acl.public_readable));
  object.insert(
    "acl_member_default_readable".to_owned(),
    json!(acl.member_default_readable),
  );
  let mut tokens = acl
    .read_user_ids
    .iter()
    .map(|user_id| crate::exact_token(user_id))
    .collect::<Vec<_>>();
  if acl.member_default_readable {
    tokens.push("member".to_owned());
  }
  if acl.public_readable {
    tokens.push("public".to_owned());
  }
  object.insert("acl_read_tokens".to_owned(), json!(tokens));
  payload
}
