use std::collections::BTreeSet;

use affine_doc_loader::{
  apply_favorites, apply_workspace_db, evaluate_collection, project_orm_records, project_workspace_root_facts,
};
use chrono::Utc;
use sqlx::{PgPool, Row};

use super::{RuntimeError, RuntimeResult, types};
use crate::{runtime::storage_runtime::load_current_doc, userdata_acl};

pub(super) struct ScopeCompiler {
  pool: PgPool,
}

impl ScopeCompiler {
  pub(super) fn new(pool: PgPool) -> Self {
    Self { pool }
  }

  pub(super) async fn compile(
    &self,
    input: types::CompileScopeInput,
  ) -> RuntimeResult<types::RuntimeTurnScopeSnapshot> {
    validate_selectors(&input.selectors)?;
    if input.selectors.is_empty() {
      return Ok(snapshot(
        input.selectors,
        Vec::new(),
        Vec::new(),
        input.preferred_source_ids.unwrap_or_default(),
      ));
    }
    let root = load_current_doc(&self.pool, &input.workspace_id, &input.workspace_id)
      .await?
      .ok_or_else(|| RuntimeError::invalid_state("workspace root doc is missing"))?;
    let mut facts = project_workspace_root_facts(&root.blob)
      .map_err(|error| RuntimeError::invalid_state(format!("workspace scope projection failed: {error}")))?;
    if !facts.complete {
      return Err(RuntimeError::invalid_state("workspace root projection is incomplete"));
    }

    let properties_id = format!("db${}$docProperties", input.workspace_id);
    if let Some(properties) = load_current_doc(&self.pool, &input.workspace_id, &properties_id).await? {
      let records = project_orm_records(&properties.blob)
        .map_err(|error| RuntimeError::invalid_state(format!("workspace properties projection failed: {error}")))?;
      apply_workspace_db(&mut facts.documents, &records);
    }
    let favorite_id = userdata_acl::doc_id(&input.user_id, &input.workspace_id, "favorite")
      .ok_or_else(|| RuntimeError::invalid_state("favorite userdata table is unsupported"))?;
    if !userdata_acl::authorize(&input.user_id, &input.workspace_id, &favorite_id) {
      return Err(RuntimeError::invalid_input("userdata_subject_denied"));
    }
    if let Some(favorite) = load_current_doc(&self.pool, &input.workspace_id, &favorite_id).await? {
      let records = project_orm_records(&favorite.blob)
        .map_err(|error| RuntimeError::invalid_state(format!("favorite projection failed: {error}")))?;
      apply_favorites(&mut facts.documents, &records);
    }
    self
      .enrich_product_facts(&input.workspace_id, &mut facts.documents)
      .await?;

    let readable = self
      .readable_doc_ids(
        &input.workspace_id,
        &input.user_id,
        facts.documents.iter().map(|doc| doc.id.as_str()),
      )
      .await?;
    let mut required_docs = BTreeSet::new();
    let mut required_artifacts = BTreeSet::new();
    for selector in &input.selectors {
      match selector.kind.as_str() {
        "document" => {
          if readable.contains(&selector.id) {
            required_docs.insert(selector.id.clone());
          }
        }
        "tag" => {
          let tag = facts
            .tags
            .iter()
            .find(|tag| tag.id == selector.id)
            .ok_or_else(|| RuntimeError::invalid_input("scope_selector_not_found"))?;
          required_docs.extend(tag.document_ids.iter().filter(|id| readable.contains(*id)).cloned());
        }
        "collection" => {
          let collection = facts
            .collections
            .iter()
            .find(|collection| collection.id == selector.id)
            .ok_or_else(|| RuntimeError::invalid_input("scope_selector_not_found"))?;
          let resolved = evaluate_collection(collection, &facts.documents, Utc::now())
            .map_err(|error| RuntimeError::invalid_input(format!("scope_selector_unsupported: {error}")))?;
          required_docs.extend(resolved.into_iter().filter(|id| readable.contains(id)));
        }
        "favorite" => {
          required_docs.extend(
            facts
              .documents
              .iter()
              .filter(|doc| doc.favorite && readable.contains(&doc.id))
              .map(|doc| doc.id.clone()),
          );
        }
        "artifact" => {
          if self
            .artifact_is_readable(&input.workspace_id, &input.user_id, &selector.id)
            .await?
          {
            required_artifacts.insert(selector.id.clone());
          }
        }
        _ => return Err(RuntimeError::invalid_input("scope_selector_unsupported")),
      }
    }
    Ok(snapshot(
      input.selectors,
      required_docs.into_iter().collect(),
      required_artifacts.into_iter().collect(),
      input.preferred_source_ids.unwrap_or_default(),
    ))
  }

  async fn enrich_product_facts(
    &self,
    workspace_id: &str,
    documents: &mut [affine_doc_loader::DocumentFacts],
  ) -> RuntimeResult<()> {
    let rows = sqlx::query(
      r#"SELECT page.page_id,page.title,policy.visibility
      FROM workspace_pages page LEFT JOIN doc_access_policies policy
        ON policy.workspace_id=page.workspace_id AND policy.doc_id=page.page_id
      WHERE page.workspace_id=$1"#,
    )
    .bind(workspace_id)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load scope product facts failed", error))?;
    for row in rows {
      let id: String = row.get("page_id");
      if let Some(document) = documents.iter_mut().find(|document| document.id == id) {
        if let Some(title) = row.get::<Option<String>, _>("title") {
          document.title = title;
        }
        document.shared = row.get::<Option<String>, _>("visibility").as_deref() == Some("public");
      }
    }
    Ok(())
  }

  async fn readable_doc_ids<'a>(
    &self,
    workspace_id: &str,
    user_id: &str,
    doc_ids: impl Iterator<Item = &'a str>,
  ) -> RuntimeResult<BTreeSet<String>> {
    let doc_ids = doc_ids.map(str::to_string).collect::<Vec<_>>();
    let rows = sqlx::query(
      r#"SELECT candidate.doc_id FROM unnest($3::text[]) candidate(doc_id)
      WHERE EXISTS (
        SELECT 1 FROM workspace_access_policies workspace_policy
        LEFT JOIN doc_access_policies doc_policy
          ON doc_policy.workspace_id=workspace_policy.workspace_id AND doc_policy.doc_id=candidate.doc_id
        LEFT JOIN workspace_members member
          ON member.workspace_id=workspace_policy.workspace_id AND member.user_id=$2 AND member.state='active'
        LEFT JOIN doc_grants grant_fact
          ON grant_fact.workspace_id=workspace_policy.workspace_id AND grant_fact.doc_id=candidate.doc_id
            AND grant_fact.principal_type='user' AND grant_fact.principal_id=$2
        WHERE workspace_policy.workspace_id=$1 AND (
          member.id IS NOT NULL AND grant_fact.role=ANY(ARRAY['owner','manager','editor','commenter','reader']::text[])
          OR member.id IS NULL AND workspace_policy.sharing_enabled
            AND grant_fact.role=ANY(ARRAY['owner','manager','editor','commenter','reader']::text[])
          OR member.role=ANY(ARRAY['owner','admin']::text[])
          OR member.id IS NOT NULL AND grant_fact.principal_id IS NULL
            AND coalesce(doc_policy.member_default_role,workspace_policy.member_default_doc_role)
              =ANY(ARRAY['owner','manager','editor','commenter','reader']::text[])
          OR workspace_policy.sharing_enabled AND doc_policy.visibility='public'
            AND doc_policy.public_role=ANY(ARRAY['owner','manager','editor','commenter','reader','external']::text[])
        )
      )"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(doc_ids)
    .fetch_all(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("filter scope document permissions failed", error))?;
    Ok(rows.into_iter().map(|row| row.get("doc_id")).collect())
  }

  async fn artifact_is_readable(&self, workspace_id: &str, user_id: &str, artifact_id: &str) -> RuntimeResult<bool> {
    let id = artifact_id
      .parse::<uuid::Uuid>()
      .map_err(|_| RuntimeError::invalid_input("artifact_id_invalid"))?;
    sqlx::query_scalar::<_, bool>(
      r#"SELECT EXISTS(
        SELECT 1 FROM workspace_artifacts artifact
        JOIN workspace_members member ON member.workspace_id=artifact.workspace_id
          AND member.user_id=$2 AND member.state='active'
        WHERE artifact.workspace_id=$1 AND artifact.id=$3 AND artifact.status='ready'
      )"#,
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(id)
    .fetch_one(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("filter scope artifact permissions failed", error))
  }
}

fn snapshot(
  selectors: Vec<types::ScopeSelectorInput>,
  required_doc_ids: Vec<String>,
  required_artifact_ids: Vec<String>,
  preferred_source_ids: Vec<String>,
) -> types::RuntimeTurnScopeSnapshot {
  let mode = if selectors.is_empty() { "workspace" } else { "required" }.to_string();
  types::RuntimeTurnScopeSnapshot {
    version: 1,
    resolved_at: Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    selectors,
    required_doc_ids: required_doc_ids.clone(),
    required_artifact_ids: required_artifact_ids.clone(),
    preferred_source_ids: preferred_source_ids.clone(),
    retrieval: types::RuntimeRetrievalScope {
      mode,
      required_doc_ids,
      required_artifact_ids,
      preferred_source_ids,
    },
  }
}

fn validate_selectors(selectors: &[types::ScopeSelectorInput]) -> RuntimeResult<()> {
  for selector in selectors {
    if selector.id.is_empty()
      || selector.id.starts_with("userdata$")
      || !matches!(selector.source.as_str(), "draft" | "focus" | "message")
    {
      return Err(RuntimeError::invalid_input("scope_selector_invalid"));
    }
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use y_octo::{DocOptions, Value};

  use super::*;

  #[tokio::test]
  async fn selector_contract_rejects_invalid_inputs_and_compiles_current_facts() {
    assert!(
      validate_selectors(&[types::ScopeSelectorInput {
        kind: "favorite".to_string(),
        id: "userdata$user$workspace$favorite".to_string(),
        name: None,
        source: "draft".to_string(),
      }])
      .is_err()
    );
    assert!(
      validate_selectors(&[types::ScopeSelectorInput {
        kind: "favorite".to_string(),
        id: "favorite".to_string(),
        name: None,
        source: "client-expanded".to_string(),
      }])
      .is_err()
    );

    let Ok(database_url) = std::env::var("DATABASE_URL") else {
      return;
    };
    let _guard = crate::runtime::migrations::EMBEDDING_TEST_LOCK.lock().await;
    let pool = PgPool::connect(&database_url).await.unwrap();
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let user_id = format!("scope-user-{suffix}");
    let collaborator_id = format!("scope-collaborator-{suffix}");
    let workspace_id = format!("scope-workspace-{suffix}");
    let doc_id = format!("scope-doc-{suffix}");
    let favorite_doc_id = userdata_acl::doc_id(&user_id, &workspace_id, "favorite").unwrap();
    let root = affine_doc_loader::add_doc_to_root_doc(Vec::new(), &doc_id, None).unwrap();
    let favorite = DocOptions::new().build();
    let mut record = favorite.get_or_create_map("favorite-record").unwrap();
    record
      .insert("key".to_string(), Value::from(format!("doc:{doc_id}")))
      .unwrap();

    sqlx::query(
      r#"INSERT INTO users (id,name,email,registered,email_verified,disabled)
      VALUES($1,'Scope User',$2,true,clock_timestamp(),false)"#,
    )
    .bind(&user_id)
    .bind(format!("{suffix}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
      r#"INSERT INTO users (id,name,email,registered,email_verified,disabled)
      VALUES($1,'Scope Collaborator',$2,true,clock_timestamp(),false)"#,
    )
    .bind(&collaborator_id)
    .bind(format!("collaborator-{suffix}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_access_policies(workspace_id) VALUES($1) ON CONFLICT DO NOTHING")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')")
      .bind(&workspace_id)
      .bind(&user_id)
      .execute(&pool)
      .await
      .unwrap();
    for (guid, blob) in [
      (workspace_id.as_str(), root),
      (favorite_doc_id.as_str(), favorite.encode_update_v1().unwrap()),
    ] {
      sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,clock_timestamp())")
        .bind(&workspace_id)
        .bind(guid)
        .bind(blob)
        .execute(&pool)
        .await
        .unwrap();
    }

    let compiler = ScopeCompiler::new(pool.clone());
    let input = types::CompileScopeInput {
      workspace_id: workspace_id.clone(),
      user_id: user_id.clone(),
      selectors: vec![types::ScopeSelectorInput {
        kind: "favorite".to_string(),
        id: "favorite".to_string(),
        name: None,
        source: "draft".to_string(),
      }],
      preferred_source_ids: None,
    };
    let compiled = compiler.compile(input).await.unwrap();
    assert_eq!(compiled.required_doc_ids.as_slice(), std::slice::from_ref(&doc_id));

    sqlx::query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'member')")
      .bind(&workspace_id)
      .bind(&collaborator_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO doc_grants(workspace_id,doc_id,principal_type,principal_id,role)
      VALUES($1,$2,'user',$3,'commenter')"#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .bind(&collaborator_id)
    .execute(&pool)
    .await
    .unwrap();
    let explicitly_granted = compiler
      .compile(types::CompileScopeInput {
        workspace_id: workspace_id.clone(),
        user_id: collaborator_id.clone(),
        selectors: vec![types::ScopeSelectorInput {
          kind: "document".to_string(),
          id: doc_id.clone(),
          name: None,
          source: "draft".to_string(),
        }],
        preferred_source_ids: None,
      })
      .await
      .unwrap();
    assert_eq!(
      explicitly_granted.required_doc_ids.as_slice(),
      std::slice::from_ref(&doc_id)
    );

    sqlx::query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2")
      .bind(&workspace_id)
      .bind(&collaborator_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("UPDATE workspace_access_policies SET sharing_enabled=false WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let non_member_grant_disabled = compiler
      .compile(types::CompileScopeInput {
        workspace_id: workspace_id.clone(),
        user_id: collaborator_id.clone(),
        selectors: vec![types::ScopeSelectorInput {
          kind: "document".to_string(),
          id: doc_id.clone(),
          name: None,
          source: "draft".to_string(),
        }],
        preferred_source_ids: None,
      })
      .await
      .unwrap();
    assert!(non_member_grant_disabled.required_doc_ids.is_empty());

    sqlx::query("DELETE FROM doc_grants WHERE workspace_id=$1 AND principal_id=$2")
      .bind(&workspace_id)
      .bind(&collaborator_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"INSERT INTO doc_access_policies(workspace_id,doc_id,visibility,public_role)
      VALUES($1,$2,'public','external')"#,
    )
    .bind(&workspace_id)
    .bind(&doc_id)
    .execute(&pool)
    .await
    .unwrap();
    let sharing_disabled = compiler
      .compile(types::CompileScopeInput {
        workspace_id: workspace_id.clone(),
        user_id: collaborator_id.clone(),
        selectors: vec![types::ScopeSelectorInput {
          kind: "document".to_string(),
          id: doc_id.clone(),
          name: None,
          source: "draft".to_string(),
        }],
        preferred_source_ids: None,
      })
      .await
      .unwrap();
    assert!(sharing_disabled.required_doc_ids.is_empty());

    sqlx::query("DELETE FROM workspace_members WHERE workspace_id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    let revoked = compiler
      .compile(types::CompileScopeInput {
        workspace_id: workspace_id.clone(),
        user_id: user_id.clone(),
        selectors: vec![types::ScopeSelectorInput {
          kind: "favorite".to_string(),
          id: "favorite".to_string(),
          name: None,
          source: "draft".to_string(),
        }],
        preferred_source_ids: None,
      })
      .await
      .unwrap();
    assert!(revoked.required_doc_ids.is_empty());

    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM users WHERE id=$1")
      .bind(&user_id)
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DELETE FROM users WHERE id=$1")
      .bind(&collaborator_id)
      .execute(&pool)
      .await
      .unwrap();
  }
}
