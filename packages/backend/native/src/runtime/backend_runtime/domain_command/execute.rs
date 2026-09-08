use affine_core::invalidation::SubjectId;
use serde_json::Value;
use sqlx::PgPool;

use super::{
  DomainCommandInputV1, InvalidationHintV1, SourceIdentity, comments, history, lifecycle, members, publish, replies,
  roles,
};
use crate::runtime::{
  Deployment, RuntimeError, RuntimeResult,
  backend_runtime::permission::{PermissionAuthorizer, PermissionTelemetry},
};

pub(in crate::runtime::backend_runtime) struct DomainCommandOutcome {
  pub(in crate::runtime::backend_runtime) value: Value,
  pub(in crate::runtime::backend_runtime) invalidations: Vec<InvalidationHintV1>,
}

impl DomainCommandInputV1 {
  fn invalidations(&self) -> Vec<InvalidationHintV1> {
    if let Self::RevokeWorkspaceMember { workspace_id, .. } | Self::LeaveWorkspace { workspace_id, .. } = self {
      return vec![InvalidationHintV1::QuotaSeatUsage {
        workspace_id: workspace_id.clone(),
      }];
    }
    let source = match self {
      Self::ApplyDocLifecycle {
        workspace_id, doc_id, ..
      } => {
        return vec![
          InvalidationHintV1::BlobSource {
            source: SourceIdentity::CurrentDoc {
              workspace_id: workspace_id.clone(),
              doc_id: workspace_id.clone(),
            },
          },
          InvalidationHintV1::BlobSource {
            source: SourceIdentity::CurrentDoc {
              workspace_id: workspace_id.clone(),
              doc_id: doc_id.clone(),
            },
          },
        ];
      }
      Self::AppendRootUpdate { workspace_id, .. } => Some(SourceIdentity::CurrentDoc {
        workspace_id: workspace_id.clone(),
        doc_id: workspace_id.clone(),
      }),
      Self::RecoverDoc {
        workspace_id, doc_id, ..
      } => Some(SourceIdentity::CurrentDoc {
        workspace_id: workspace_id.clone(),
        doc_id: doc_id.clone(),
      }),
      _ => None,
    };
    source
      .map(|source| InvalidationHintV1::BlobSource { source })
      .into_iter()
      .collect()
  }
}

fn workspace_role_invalidations(
  actor_user_id: &str,
  workspace_id: &str,
  target_user_id: &str,
  hint: roles::WorkspaceRoleTransitionHint,
) -> Vec<InvalidationHintV1> {
  match hint {
    roles::WorkspaceRoleTransitionHint::OwnerTransferred => vec![
      InvalidationHintV1::QuotaOwnerMapping {
        workspace_id: workspace_id.to_string(),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: SubjectId::Workspace(workspace_id.to_string()),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: SubjectId::User(actor_user_id.to_string()),
      },
      InvalidationHintV1::QuotaStorageUsage {
        subject: SubjectId::User(target_user_id.to_string()),
      },
    ],
  }
}

pub(in crate::runtime::backend_runtime) async fn execute(
  pool: PgPool,
  deployment: Deployment,
  telemetry: PermissionTelemetry,
  embedding_schema_ready: bool,
  input: DomainCommandInputV1,
) -> RuntimeResult<DomainCommandOutcome> {
  let mut invalidations = input.invalidations();
  let mut transaction = pool
    .begin()
    .await
    .map_err(|error| RuntimeError::database("begin domain command", error))?;
  let authorizer = PermissionAuthorizer::with_telemetry(pool, deployment, telemetry);
  let output = match input {
    DomainCommandInputV1::CreateComment {
      actor_user_id,
      workspace_id,
      doc_id,
      content,
      notification,
    } => {
      comments::create_comment(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        content,
        notification,
      )
      .await?
    }
    DomainCommandInputV1::UpdateComment {
      actor_user_id,
      id,
      content,
    } => comments::update_comment(&authorizer, &mut transaction, actor_user_id, id, content).await?,
    DomainCommandInputV1::ResolveComment {
      actor_user_id,
      id,
      resolved,
    } => comments::resolve_comment(&authorizer, &mut transaction, actor_user_id, id, resolved).await?,
    DomainCommandInputV1::DeleteComment { actor_user_id, id } => {
      comments::delete_comment(&authorizer, &mut transaction, actor_user_id, id).await?
    }
    DomainCommandInputV1::CreateReply {
      actor_user_id,
      comment_id,
      content,
      notification,
    } => {
      replies::create_reply(
        &authorizer,
        &mut transaction,
        actor_user_id,
        comment_id,
        content,
        notification,
      )
      .await?
    }
    DomainCommandInputV1::UpdateReply {
      actor_user_id,
      id,
      content,
    } => replies::update_reply(&authorizer, &mut transaction, actor_user_id, id, content).await?,
    DomainCommandInputV1::DeleteReply { actor_user_id, id } => {
      replies::delete_reply(&authorizer, &mut transaction, actor_user_id, id).await?
    }
    DomainCommandInputV1::PublishDoc {
      actor_user_id,
      workspace_id,
      doc_id,
      mode,
    } => {
      publish::set_published(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        mode,
        true,
      )
      .await?
    }
    DomainCommandInputV1::UnpublishDoc {
      actor_user_id,
      workspace_id,
      doc_id,
    } => {
      publish::set_published(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        0,
        false,
      )
      .await?
    }
    DomainCommandInputV1::ApplyDocLifecycle {
      actor_user_id,
      workspace_id,
      doc_id,
      lifecycle,
    } => {
      lifecycle::apply(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        lifecycle,
        embedding_schema_ready,
      )
      .await?
    }
    DomainCommandInputV1::AppendRootUpdate {
      actor_user_id,
      workspace_id,
      update,
      assert_permission,
      expected_permission_generation,
    } => {
      if !assert_permission {
        return Err(RuntimeError::invalid_input("permission_assertion_required"));
      }
      lifecycle::append_root_update(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        update,
        expected_permission_generation,
        embedding_schema_ready,
      )
      .await?
    }
    DomainCommandInputV1::RecoverDoc {
      actor_user_id,
      workspace_id,
      doc_id,
      timestamp,
    } => {
      history::recover(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        timestamp,
        embedding_schema_ready,
      )
      .await?
    }
    DomainCommandInputV1::TransitionWorkspaceRole {
      actor_user_id,
      workspace_id,
      target_user_id,
      new_role,
    } => {
      let transition = roles::transition_workspace(
        &authorizer,
        &mut transaction,
        actor_user_id.clone(),
        workspace_id.clone(),
        target_user_id.clone(),
        new_role,
      )
      .await?;
      if let Some(hint) = transition.hint {
        invalidations.extend(workspace_role_invalidations(
          &actor_user_id,
          &workspace_id,
          &target_user_id,
          hint,
        ));
      }
      transition.value
    }
    DomainCommandInputV1::TransitionDocRole {
      actor_user_id,
      workspace_id,
      doc_id,
      target_user_id,
      new_role,
    } => {
      roles::transition_doc(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        target_user_id,
        new_role,
      )
      .await?
    }
    DomainCommandInputV1::GrantDocRoles {
      actor_user_id,
      workspace_id,
      doc_id,
      target_user_ids,
      new_role,
    } => {
      roles::grant_docs(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        target_user_ids,
        new_role,
      )
      .await?
    }
    DomainCommandInputV1::SetDocDefaultRole {
      actor_user_id,
      workspace_id,
      doc_id,
      new_role,
    } => {
      roles::set_doc_default_role(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        doc_id,
        new_role,
      )
      .await?
    }
    DomainCommandInputV1::RevokeWorkspaceMember {
      actor_user_id,
      workspace_id,
      target_user_id,
    } => {
      members::revoke_workspace_member(
        &authorizer,
        &mut transaction,
        actor_user_id,
        workspace_id,
        target_user_id,
      )
      .await?
    }
    DomainCommandInputV1::LeaveWorkspace {
      actor_user_id,
      workspace_id,
    } => members::leave_workspace(&authorizer, &mut transaction, actor_user_id, workspace_id).await?,
  };
  transaction
    .commit()
    .await
    .map_err(|error| RuntimeError::database("commit domain command", error))?;
  Ok(DomainCommandOutcome {
    value: output,
    invalidations,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn command_wire_and_invalidation_contract_is_complete() {
    let timestamp = "2026-08-30T00:00:00Z";
    let cases = [
      serde_json::json!({"command":"create_comment","actorUserId":"actor","workspaceId":"workspace","docId":"doc","content":{},"docTitle":"title","docMode":"page"}),
      serde_json::json!({"command":"update_comment","actorUserId":"actor","id":"comment","content":{}}),
      serde_json::json!({"command":"resolve_comment","actorUserId":"actor","id":"comment","resolved":true}),
      serde_json::json!({"command":"delete_comment","actorUserId":"actor","id":"comment"}),
      serde_json::json!({"command":"create_reply","actorUserId":"actor","commentId":"comment","content":{},"docTitle":"title","docMode":"page"}),
      serde_json::json!({"command":"update_reply","actorUserId":"actor","id":"reply","content":{}}),
      serde_json::json!({"command":"delete_reply","actorUserId":"actor","id":"reply"}),
      serde_json::json!({"command":"publish_doc","actorUserId":"actor","workspaceId":"workspace","docId":"doc","mode":0}),
      serde_json::json!({"command":"unpublish_doc","actorUserId":"actor","workspaceId":"workspace","docId":"doc"}),
      serde_json::json!({"command":"apply_doc_lifecycle","actorUserId":"actor","workspaceId":"workspace","docId":"doc","lifecycle":"trash"}),
      serde_json::json!({"command":"append_root_update","actorUserId":"actor","workspaceId":"workspace","update":"AA==","assertPermission":true,"expectedPermissionGeneration":1}),
      serde_json::json!({"command":"recover_doc","actorUserId":"actor","workspaceId":"workspace","docId":"doc","timestamp":timestamp}),
      serde_json::json!({"command":"transition_workspace_role","actorUserId":"actor","workspaceId":"workspace","targetUserId":"target","newRole":"member"}),
      serde_json::json!({"command":"transition_doc_role","actorUserId":"actor","workspaceId":"workspace","docId":"doc","targetUserId":"target","newRole":"reader"}),
      serde_json::json!({"command":"grant_doc_roles","actorUserId":"actor","workspaceId":"workspace","docId":"doc","targetUserIds":["target"],"newRole":"reader"}),
      serde_json::json!({"command":"set_doc_default_role","actorUserId":"actor","workspaceId":"workspace","docId":"doc","newRole":"reader"}),
      serde_json::json!({"command":"revoke_workspace_member","actorUserId":"actor","workspaceId":"workspace","targetUserId":"target"}),
      serde_json::json!({"command":"leave_workspace","actorUserId":"actor","workspaceId":"workspace"}),
    ];
    for input in cases {
      serde_json::from_value::<DomainCommandInputV1>(input).unwrap();
    }

    assert_eq!(
      workspace_role_invalidations(
        "actor",
        "workspace",
        "target",
        roles::WorkspaceRoleTransitionHint::OwnerTransferred,
      ),
      vec![
        InvalidationHintV1::QuotaOwnerMapping {
          workspace_id: "workspace".to_string(),
        },
        InvalidationHintV1::QuotaStorageUsage {
          subject: SubjectId::Workspace("workspace".to_string()),
        },
        InvalidationHintV1::QuotaStorageUsage {
          subject: SubjectId::User("actor".to_string()),
        },
        InvalidationHintV1::QuotaStorageUsage {
          subject: SubjectId::User("target".to_string()),
        },
      ]
    );

    let cases = [
      (
        serde_json::json!({"command":"transition_workspace_role","actorUserId":"actor","workspaceId":"workspace","targetUserId":"target","newRole":"owner"}),
        Vec::new(),
      ),
      (
        serde_json::json!({"command":"revoke_workspace_member","actorUserId":"actor","workspaceId":"workspace","targetUserId":"target"}),
        vec![InvalidationHintV1::QuotaSeatUsage {
          workspace_id: "workspace".to_string(),
        }],
      ),
      (
        serde_json::json!({"command":"leave_workspace","actorUserId":"actor","workspaceId":"workspace"}),
        vec![InvalidationHintV1::QuotaSeatUsage {
          workspace_id: "workspace".to_string(),
        }],
      ),
      (
        serde_json::json!({"command":"apply_doc_lifecycle","actorUserId":"actor","workspaceId":"workspace","docId":"doc","lifecycle":"delete"}),
        vec![
          InvalidationHintV1::BlobSource {
            source: SourceIdentity::CurrentDoc {
              workspace_id: "workspace".to_string(),
              doc_id: "workspace".to_string(),
            },
          },
          InvalidationHintV1::BlobSource {
            source: SourceIdentity::CurrentDoc {
              workspace_id: "workspace".to_string(),
              doc_id: "doc".to_string(),
            },
          },
        ],
      ),
      (
        serde_json::json!({"command":"append_root_update","actorUserId":"actor","workspaceId":"workspace","update":"AA==","assertPermission":true}),
        vec![InvalidationHintV1::BlobSource {
          source: SourceIdentity::CurrentDoc {
            workspace_id: "workspace".to_string(),
            doc_id: "workspace".to_string(),
          },
        }],
      ),
      (
        serde_json::json!({"command":"recover_doc","actorUserId":"actor","workspaceId":"workspace","docId":"doc","timestamp":timestamp}),
        vec![InvalidationHintV1::BlobSource {
          source: SourceIdentity::CurrentDoc {
            workspace_id: "workspace".to_string(),
            doc_id: "doc".to_string(),
          },
        }],
      ),
    ];
    for (input, expected) in cases {
      let input = serde_json::from_value::<DomainCommandInputV1>(input).unwrap();
      assert_eq!(input.invalidations(), expected);
    }
  }

  #[tokio::test]
  async fn execute_commits_success_and_rolls_back_failed_dispatch() {
    let _guard = crate::runtime::migrations::DATABASE_TEST_LOCK.lock().await;
    let Some((pool, workspace_id, actor_user_id)) = super::super::test_support::owner_workspace().await else {
      return;
    };
    let doc_id = format!("domain-execute-rollback-{}", uuid::Uuid::new_v4().simple());
    let rejected = execute(
      pool.clone(),
      Deployment::Cloud,
      PermissionTelemetry::default(),
      true,
      DomainCommandInputV1::AppendRootUpdate {
        actor_user_id: actor_user_id.clone(),
        workspace_id: workspace_id.clone(),
        update: "AA==".into(),
        assert_permission: false,
        expected_permission_generation: None,
      },
    )
    .await;
    assert_eq!(rejected.err().unwrap().to_string(), "permission_assertion_required");
    sqlx::query("INSERT INTO snapshots(workspace_id,guid,blob,updated_at) VALUES($1,$2,$3,now())")
      .bind(&workspace_id)
      .bind(&doc_id)
      .bind([0_u8, 0_u8])
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      r#"CREATE OR REPLACE FUNCTION test_fail_domain_publish() RETURNS trigger AS $$
         BEGIN
           IF NEW.page_id LIKE 'domain-execute-rollback-%' THEN
             RAISE EXCEPTION 'injected domain publish failure';
           END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql"#,
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("DROP TRIGGER IF EXISTS test_fail_domain_publish ON workspace_pages")
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query(
      "CREATE TRIGGER test_fail_domain_publish BEFORE INSERT OR UPDATE ON workspace_pages FOR EACH ROW EXECUTE \
       FUNCTION test_fail_domain_publish()",
    )
    .execute(&pool)
    .await
    .unwrap();

    let input = || DomainCommandInputV1::PublishDoc {
      actor_user_id: actor_user_id.clone(),
      workspace_id: workspace_id.clone(),
      doc_id: doc_id.clone(),
      mode: 0,
    };
    let failed = execute(
      pool.clone(),
      Deployment::Cloud,
      PermissionTelemetry::default(),
      true,
      input(),
    )
    .await;
    assert!(failed.is_err());
    assert!(
      !sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2)",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_one(&pool)
      .await
      .unwrap()
    );

    sqlx::query("DROP TRIGGER test_fail_domain_publish ON workspace_pages")
      .execute(&pool)
      .await
      .unwrap();
    sqlx::query("DROP FUNCTION test_fail_domain_publish()")
      .execute(&pool)
      .await
      .unwrap();
    let outcome = execute(
      pool.clone(),
      Deployment::Cloud,
      PermissionTelemetry::default(),
      true,
      input(),
    )
    .await
    .unwrap();
    assert_eq!(outcome.value["public"], true);
    assert!(outcome.invalidations.is_empty());
    assert!(
      sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM doc_access_policies WHERE workspace_id=$1 AND doc_id=$2 AND visibility='public') \
         AND EXISTS(SELECT 1 FROM workspace_pages WHERE workspace_id=$1 AND page_id=$2 AND published_at IS NOT NULL)",
      )
      .bind(&workspace_id)
      .bind(&doc_id)
      .fetch_one(&pool)
      .await
      .unwrap()
    );
  }
}
