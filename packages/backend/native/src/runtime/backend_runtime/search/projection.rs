use serde_json::{Value, json};
use sqlx::{PgPool, Row};

use super::store::ProjectionInput;
use crate::{
  permission::doc_role_allows,
  runtime::{RuntimeError, RuntimeResult, storage_runtime::load_current_doc},
};

pub(super) async fn project_document(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<(ProjectionInput, Vec<ProjectionInput>)>> {
  let Some(current) = load_current_doc(pool, workspace_id, doc_id).await? else {
    return Ok(None);
  };
  let revision = current.updated_at.timestamp_millis();
  let projection =
    affine_doc_loader::project_document_search(current.blob, doc_id.to_string(), revision.to_string())
      .map_err(|error| RuntimeError::invalid_state(format!("search document projection failed: {error}")))?;
  let metadata = sqlx::query(
    r#"SELECT snapshot.created_at,snapshot.updated_at,snapshot.created_by,snapshot.updated_by,
       revision.revision AS acl_revision,
       coalesce(doc_policy.visibility,'private') AS visibility,
       doc_policy.public_role,
       coalesce(doc_policy.member_default_role,workspace_policy.member_default_doc_role,'manager') AS member_default_role
       FROM snapshots snapshot
       LEFT JOIN workspace_permission_revisions revision ON revision.workspace_id=snapshot.workspace_id
       LEFT JOIN workspace_access_policies workspace_policy ON workspace_policy.workspace_id=snapshot.workspace_id
       LEFT JOIN doc_access_policies doc_policy
         ON doc_policy.workspace_id=snapshot.workspace_id AND doc_policy.doc_id=snapshot.guid
       WHERE snapshot.workspace_id=$1 AND snapshot.guid=$2"#,
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_optional(pool)
  .await
  .map_err(|error| RuntimeError::database("load search projection metadata", error))?
  .ok_or_else(|| RuntimeError::invalid_state("search snapshot metadata unavailable"))?;
  let acl_revision = metadata
    .try_get::<Option<i64>, _>("acl_revision")
    .map_err(|error| RuntimeError::database("decode search ACL revision", error))?
    .ok_or_else(|| RuntimeError::invalid_state("permission_state_unavailable"))?;
  let visibility: String = metadata
    .try_get("visibility")
    .map_err(|error| RuntimeError::database("decode search doc visibility", error))?;
  let public_role: Option<String> = metadata
    .try_get("public_role")
    .map_err(|error| RuntimeError::database("decode search public role", error))?;
  let member_default_role: String = metadata
    .try_get("member_default_role")
    .map_err(|error| RuntimeError::database("decode search member default role", error))?;
  let acl_public_readable = visibility == "public"
    && public_role
      .as_deref()
      .is_some_and(|role| doc_role_allows(role, "Doc.Read").unwrap_or(false));
  let acl_member_default_readable = doc_role_allows(&member_default_role, "Doc.Read")
    .map_err(|_| RuntimeError::invalid_state("permission_state_unavailable"))?;
  let grants = sqlx::query(
    "SELECT principal_id,role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user'",
  )
  .bind(workspace_id)
  .bind(doc_id)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load search doc grants", error))?;
  let acl_read_user_ids = grants
    .into_iter()
    .map(|row| {
      let id: String = row
        .try_get("principal_id")
        .map_err(|error| RuntimeError::database("decode grant principal", error))?;
      let role: String = row
        .try_get("role")
        .map_err(|error| RuntimeError::database("decode grant role", error))?;
      Ok(doc_role_allows(&role, "Doc.Read").unwrap_or(false).then_some(id))
    })
    .collect::<RuntimeResult<Vec<_>>>()?
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
  let created_at: chrono::DateTime<chrono::Utc> = metadata
    .try_get("created_at")
    .map_err(|error| RuntimeError::database("decode search created time", error))?;
  let updated_at: chrono::DateTime<chrono::Utc> = metadata
    .try_get("updated_at")
    .map_err(|error| RuntimeError::database("decode search updated time", error))?;
  let created_by: Option<String> = metadata
    .try_get("created_by")
    .map_err(|error| RuntimeError::database("decode search creator", error))?;
  let updated_by: Option<String> = metadata
    .try_get("updated_by")
    .map_err(|error| RuntimeError::database("decode search updater", error))?;
  let acl = AclFields {
    public_readable: acl_public_readable,
    member_default_readable: acl_member_default_readable,
    read_user_ids: acl_read_user_ids,
    revision: acl_revision,
  };
  let document_payload = with_acl(
    json!({
      "workspace_id": workspace_id,
      "workspace_token": super::exact_token(workspace_id),
      "doc_id": doc_id,
      "doc_token": super::exact_token(doc_id),
      "title": projection.title,
      "summary": projection.units.iter().map(|unit| unit.text.as_str()).collect::<Vec<_>>().join("\n").chars().take(1000).collect::<String>(),
      "created_by_user_id": created_by.clone().unwrap_or_default(),
      "updated_by_user_id": updated_by.clone().unwrap_or_default(),
      "created_at": created_at.timestamp_millis(),
      "updated_at": updated_at.timestamp_millis(),
    }),
    &acl,
  );
  let document = input(
    workspace_id,
    doc_id,
    &format!("{workspace_id}/{doc_id}"),
    revision,
    document_payload,
    &acl,
  );
  let blocks = projection
    .units
    .into_iter()
    .map(|unit| {
      let block_id = unit.block_id.clone().unwrap_or_else(|| unit.unit_id.clone());
      let payload = with_acl(
        json!({
          "workspace_id":workspace_id,"workspace_token":super::exact_token(workspace_id),
          "doc_id":doc_id,"doc_token":super::exact_token(doc_id),
          "block_id":block_id,"block_token":super::exact_token(&block_id),
          "unit_id":unit.unit_id,"projection_version":projection.version,
          "source_hash":projection.source_hash,"visibility":serde_json::to_value(unit.visibility).unwrap_or(Value::Null),
          "element_id":unit.element_id,"frame_id":unit.frame_id,"source_block_id":unit.block_id,
          "blob":unit.blob_id,"ref_doc_id":unit.ref_doc_ids,"ref":unit.refs,"content":unit.text,
          "flavour":format!("affine:{}",unit.unit_type),"parent_flavour":unit.parent_flavour,
          "parent_block_id":unit.parent_block_id,"additional":unit.additional,
          "created_by_user_id":created_by.clone().unwrap_or_default(),"updated_by_user_id":updated_by.clone().unwrap_or_default(),
          "created_at":created_at.timestamp_millis(),"updated_at":updated_at.timestamp_millis(),
        }),
        &acl,
      );
      input(
        workspace_id,
        doc_id,
        &format!("{workspace_id}/{doc_id}/{block_id}"),
        revision,
        payload,
        &acl,
      )
    })
    .collect();
  Ok(Some((document, blocks)))
}

struct AclFields {
  public_readable: bool,
  member_default_readable: bool,
  read_user_ids: Vec<String>,
  revision: i64,
}

fn with_acl(mut payload: Value, acl: &AclFields) -> Value {
  let object = payload.as_object_mut().expect("search projection payload is an object");
  object.insert("acl_public_readable".to_string(), json!(acl.public_readable));
  object.insert(
    "acl_member_default_readable".to_string(),
    json!(acl.member_default_readable),
  );
  let mut tokens = acl
    .read_user_ids
    .iter()
    .map(|user_id| super::exact_token(user_id))
    .collect::<Vec<_>>();
  if acl.member_default_readable {
    tokens.push("member".to_string());
  }
  if acl.public_readable {
    tokens.push("public".to_string());
  }
  object.insert("acl_read_tokens".to_string(), json!(tokens));
  object.insert("acl_revision".to_string(), json!(acl.revision));
  payload
}

fn input(
  workspace_id: &str,
  doc_id: &str,
  external_id: &str,
  revision: i64,
  payload: Value,
  acl: &AclFields,
) -> ProjectionInput {
  ProjectionInput {
    external_id: external_id.to_string(),
    workspace_id: workspace_id.to_string(),
    doc_id: doc_id.to_string(),
    revision,
    payload,
    acl_public_readable: acl.public_readable,
    acl_member_default_readable: acl.member_default_readable,
    acl_read_user_ids: acl.read_user_ids.clone(),
    acl_revision: acl.revision,
  }
}
