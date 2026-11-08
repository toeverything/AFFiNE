use serde_json::{Value, json};
use sqlx::{PgPool, Row};
use tokio::sync::Semaphore;

use crate::{
  permission::doc_role_allows,
  runtime::{
    RuntimeError, RuntimeResult,
    storage_runtime::{CurrentDoc, load_current_doc_parts, merge_current_doc},
  },
};

#[derive(Clone, Debug, PartialEq)]
pub(super) struct ProjectionInput {
  pub(super) workspace_id: String,
  pub(super) doc_id: String,
  pub(super) payload: Value,
}

static SEARCH_PROJECTION_SLOT: Semaphore = Semaphore::const_new(1);

pub(in crate::runtime::backend_runtime) async fn project_current_doc<T: Send + 'static>(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
  project: impl FnOnce(CurrentDoc) -> RuntimeResult<T> + Send + 'static,
) -> RuntimeResult<Option<T>> {
  let (snapshot, updates) = load_current_doc_parts(pool, workspace_id, doc_id).await?;
  let permit = SEARCH_PROJECTION_SLOT
    .acquire()
    .await
    .map_err(|error| RuntimeError::invalid_state(format!("search projection admission failed: {error}")))?;
  tokio::task::spawn_blocking(move || {
    let _permit = permit;
    let current = merge_current_doc(snapshot, updates).map_err(|error| match error {
      RuntimeError::InvalidState(message) => RuntimeError::SearchSourceInvalid(message),
      error => error,
    })?;
    current.map(project).transpose()
  })
  .await
  .map_err(|error| RuntimeError::invalid_state(format!("search projection task failed: {error}")))?
}

pub(super) async fn project_document(
  pool: &PgPool,
  workspace_id: &str,
  doc_id: &str,
) -> RuntimeResult<Option<(ProjectionInput, Vec<ProjectionInput>)>> {
  let projection_doc_id = doc_id.to_string();
  let Some(projection) = project_current_doc(pool, workspace_id, doc_id, move |current| {
    let revision = current.updated_at.timestamp_millis();
    affine_doc_loader::project_document_search(current.blob, projection_doc_id, revision.to_string())
      .map_err(|error| RuntimeError::SearchSourceInvalid(format!("document projection failed: {error}")))
  })
  .await?
  else {
    return Ok(None);
  };
  let Some(metadata) = sqlx::query(
    r#"SELECT snapshot.created_at,snapshot.updated_at,snapshot.created_by,snapshot.updated_by,
       coalesce(doc_policy.visibility,'private') AS visibility,
       doc_policy.public_role,
       coalesce(doc_policy.member_default_role,workspace_policy.member_default_doc_role,'manager') AS member_default_role
       FROM snapshots snapshot
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
  else {
    return Ok(None);
  };
  let visibility: String = metadata
    .try_get("visibility")
    .map_err(|error| RuntimeError::database("decode search doc visibility", error))?;
  let public_role: Option<String> = metadata
    .try_get("public_role")
    .map_err(|error| RuntimeError::database("decode search public role", error))?;
  let member_default_role: String = metadata
    .try_get("member_default_role")
    .map_err(|error| RuntimeError::database("decode search member default role", error))?;
  let acl_public_readable = if visibility == "public" {
    match public_role.as_deref() {
      Some(role) => readable_role(role, "public")?,
      None => false,
    }
  } else {
    false
  };
  let acl_member_default_readable = readable_role(&member_default_role, "member default")?;
  let grants = sqlx::query(
    "SELECT principal_id,role FROM doc_grants WHERE workspace_id=$1 AND doc_id=$2 AND principal_type='user' ORDER BY \
     principal_id,role",
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
      Ok(readable_role(&role, "grant")?.then_some(id))
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
  let document = input(workspace_id, doc_id, document_payload);
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
      input(workspace_id, doc_id, payload)
    })
    .collect();
  Ok(Some((document, blocks)))
}

fn readable_role(role: &str, source: &str) -> RuntimeResult<bool> {
  doc_role_allows(role, "Doc.Read")
    .map_err(|_| RuntimeError::SearchSourceInvalid(format!("invalid {source} document role")))
}

struct AclFields {
  public_readable: bool,
  member_default_readable: bool,
  read_user_ids: Vec<String>,
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
  payload
}

fn input(workspace_id: &str, doc_id: &str, payload: Value) -> ProjectionInput {
  ProjectionInput {
    workspace_id: workspace_id.to_string(),
    doc_id: doc_id.to_string(),
    payload,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn canceled_caller_keeps_projection_slot_until_computation_finishes() {
    let _guard = super::super::SEARCH_TEST_LOCK.lock().await;
    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let pool = PgPool::connect(&database_url).await.unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$1,$2,now())")
      .bind(&id)
      .bind(affine_doc_loader::build_full_doc("test", "body", &id).unwrap())
      .execute(&pool)
      .await
      .unwrap();

    let (started, started_rx) = tokio::sync::oneshot::channel();
    let (release, release_rx) = std::sync::mpsc::channel::<()>();
    let first_pool = pool.clone();
    let first_id = id.clone();
    let first = tokio::spawn(async move {
      project_current_doc(&first_pool, &first_id, &first_id, move |_| {
        started.send(()).unwrap();
        release_rx.recv_timeout(std::time::Duration::from_secs(10)).unwrap();
        Ok(())
      })
      .await
    });
    started_rx.await.unwrap();
    first.abort();
    assert!(first.await.unwrap_err().is_cancelled());

    let (next_started, mut next_started_rx) = tokio::sync::oneshot::channel();
    let next_pool = pool.clone();
    let next_id = id.clone();
    let next = tokio::spawn(async move {
      project_current_doc(&next_pool, &next_id, &next_id, move |_| {
        next_started.send(()).unwrap();
        Ok(())
      })
      .await
    });
    assert!(
      tokio::time::timeout(std::time::Duration::from_millis(200), &mut next_started_rx)
        .await
        .is_err()
    );
    release.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), next_started_rx)
      .await
      .unwrap()
      .unwrap();
    assert_eq!(next.await.unwrap().unwrap(), Some(()));
    sqlx::query("DELETE FROM snapshots WHERE workspace_id=$1 AND guid=$1")
      .bind(&id)
      .execute(&pool)
      .await
      .unwrap();
  }

  #[test]
  fn invalid_acl_role_is_a_permanent_search_source_error() {
    let error = readable_role("future-role", "grant").unwrap_err();
    assert!(matches!(error, RuntimeError::SearchSourceInvalid(_)));
    assert!(error.is_permanent_search_source());
  }
}
