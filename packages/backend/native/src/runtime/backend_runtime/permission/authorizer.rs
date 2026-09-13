use std::collections::{BTreeMap, BTreeSet};

use affine_core::access_control::{
  AuthorizationDecision, AuthorizationRequest, CommandAuthorizationDecision, CommandDenialReason, CommandFacts,
  CommandPermission, CommandQuotaFacts, Decision, DocAction, DocAuthorizationRequest, DomainCommand, WorkspaceAction,
  WorkspaceRole, authorize, authorize_command,
};
use sqlx::{PgPool, Postgres, Transaction};

use super::{
  store::PermissionStore,
  telemetry::PermissionTelemetry,
  types::{AclPredicate, AuthorizedSearchScope, DocReadScope, PermissionSnapshot, SearchActor},
};
use crate::{
  permission::{AuthorizePermissionInputV1, PermissionEvaluationOutputV1, permission_evaluation_output},
  runtime::{Deployment, RuntimeError, RuntimeResult},
};

pub(in crate::runtime::backend_runtime) struct PermissionAuthorizer {
  store: PermissionStore,
  pub(in crate::runtime::backend_runtime) deployment: Deployment,
  telemetry: PermissionTelemetry,
}

pub(in crate::runtime::backend_runtime) struct AuthorizedPermission {
  decision: AuthorizationDecision,
  pub(in crate::runtime::backend_runtime) output: PermissionEvaluationOutputV1,
  pub(in crate::runtime::backend_runtime) effective_workspace_role: Option<WorkspaceRole>,
}

impl PermissionAuthorizer {
  #[cfg(test)]
  pub(in crate::runtime::backend_runtime) fn new(pool: PgPool, deployment: Deployment) -> Self {
    Self::with_telemetry(pool, deployment, PermissionTelemetry::default())
  }

  pub(in crate::runtime::backend_runtime) fn with_telemetry(
    pool: PgPool,
    deployment: Deployment,
    telemetry: PermissionTelemetry,
  ) -> Self {
    Self {
      store: PermissionStore::with_telemetry(pool, deployment, telemetry.clone()),
      deployment,
      telemetry,
    }
  }

  #[cfg(test)]
  pub(super) fn with_license_public_key(
    pool: PgPool,
    deployment: Deployment,
    license_public_key: Option<String>,
  ) -> Self {
    Self {
      store: PermissionStore::with_license_public_key(pool, deployment, license_public_key),
      deployment,
      telemetry: PermissionTelemetry::default(),
    }
  }

  #[cfg(test)]
  pub(super) fn with_license_public_key_and_telemetry(
    pool: PgPool,
    deployment: Deployment,
    license_public_key: Option<String>,
    telemetry: PermissionTelemetry,
  ) -> Self {
    Self {
      store: PermissionStore::with_license_public_key_and_telemetry(
        pool,
        deployment,
        license_public_key,
        telemetry.clone(),
      ),
      deployment,
      telemetry,
    }
  }

  pub(in crate::runtime::backend_runtime) async fn authorize(
    &self,
    request: AuthorizePermissionInputV1,
  ) -> RuntimeResult<PermissionEvaluationOutputV1> {
    if request.version != 1 {
      return Err(RuntimeError::invalid_input(
        "unsupported permission authorization version",
      ));
    }
    let snapshot = self.store.permission_snapshot(request).await?;
    let permission = evaluate_snapshot(snapshot)?;
    self.telemetry.evaluations(self.deployment, &permission.output);
    Ok(permission.output)
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_workspace_action_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    action: WorkspaceAction,
  ) -> RuntimeResult<Decision> {
    let decision = self
      .authorize_typed_request_in(transaction, workspace_id, actor_user_id, workspace_request(action))
      .await?;
    Ok(
      decision
        .workspace
        .into_iter()
        .next()
        .expect("workspace action has a decision"),
    )
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_doc_action_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_id: &str,
    action: DocAction,
  ) -> RuntimeResult<Decision> {
    let mut docs = self
      .authorize_doc_action_batch_in(transaction, workspace_id, actor_user_id, &[doc_id.to_string()], action)
      .await?;
    Ok(docs.remove(doc_id).expect("document action has a decision"))
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_doc_actions_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_id: &str,
    actions: &[DocAction],
  ) -> RuntimeResult<Vec<(DocAction, Decision)>> {
    let decision = self
      .authorize_typed_request_in(
        transaction,
        workspace_id,
        actor_user_id,
        doc_actions_request(doc_id, actions),
      )
      .await?;
    let decisions = decision
      .docs
      .into_iter()
      .next()
      .expect("document actions have a decision")
      .decisions;
    Ok(actions.iter().copied().zip(decisions).collect())
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_doc_action_batch(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_ids: &[String],
    action: DocAction,
  ) -> RuntimeResult<BTreeMap<String, Decision>> {
    let decision = self
      .authorize_typed(workspace_id, actor_user_id, doc_request(doc_ids, action))
      .await?;
    Ok(doc_decisions(decision))
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_doc_action_batch_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    doc_ids: &[String],
    action: DocAction,
  ) -> RuntimeResult<BTreeMap<String, Decision>> {
    let decision = self
      .authorize_typed_request_in(transaction, workspace_id, actor_user_id, doc_request(doc_ids, action))
      .await?;
    Ok(doc_decisions(decision))
  }

  async fn authorize_typed(
    &self,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    request: AuthorizationRequest,
  ) -> RuntimeResult<AuthorizationDecision> {
    let snapshot = self
      .store
      .typed_permission_snapshot(workspace_id, actor_user_id, request)
      .await?;
    self.evaluate_typed(snapshot)
  }

  async fn authorize_typed_request_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
    actor_user_id: Option<&str>,
    request: AuthorizationRequest,
  ) -> RuntimeResult<AuthorizationDecision> {
    let snapshot = self
      .store
      .typed_permission_snapshot_in(transaction, workspace_id, actor_user_id, request)
      .await?;
    self.evaluate_typed(snapshot)
  }

  fn evaluate_typed(&self, snapshot: PermissionSnapshot) -> RuntimeResult<AuthorizationDecision> {
    let permission = evaluate_snapshot(snapshot)?;
    self.telemetry.evaluations(self.deployment, &permission.output);
    Ok(permission.decision)
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_command_in(
    &self,
    transaction: &mut Transaction<'_, Postgres>,
    actor_user_id: &str,
    workspace_id: &str,
    doc_id: Option<&str>,
    command: &DomainCommand,
    quota: Option<CommandQuotaFacts<'_>>,
  ) -> RuntimeResult<CommandAuthorizationDecision> {
    let snapshot = self
      .store
      .command_snapshot_in(transaction, workspace_id, actor_user_id, doc_id)
      .await?;
    let decision = authorize_command(
      command,
      CommandFacts {
        acl: &snapshot.facts,
        access_grant: &snapshot.grant,
        quota,
      },
    );
    if decision.allowed {
      Ok(decision)
    } else {
      Err(RuntimeError::invalid_input(match (decision.denial_reason, command) {
        (Some(CommandDenialReason::WorkspaceOwnerCannotLeave), _) => "workspace_owner_cannot_leave".to_string(),
        (Some(CommandDenialReason::CannotRevokeSelf), _) => "cannot_revoke_self".to_string(),
        (Some(CommandDenialReason::OwnerMustTransfer), DomainCommand::TransitionDocRole { .. }) => {
          "doc_owner_must_transfer".to_string()
        }
        (Some(CommandDenialReason::OwnerMustTransfer), _) => "workspace_owner_must_transfer".to_string(),
        (Some(CommandDenialReason::TargetMemberMustBeActive), _) => "target_member_not_active".to_string(),
        (Some(CommandDenialReason::ActiveMemberRequired), _) => "active_member_required".to_string(),
        (Some(CommandDenialReason::WorkspaceNotFound), _) => "workspace_not_found".to_string(),
        (Some(CommandDenialReason::WorkspaceReadonly), _) => "workspace_readonly".to_string(),
        (Some(CommandDenialReason::QuotaFactsUnavailable), _) => "command_quota_unavailable".to_string(),
        (
          Some(CommandDenialReason::Permission(_)),
          DomainCommand::MutateComment { .. } | DomainCommand::MutateReply { .. },
        ) => "comment_mutation_denied".to_string(),
        (Some(CommandDenialReason::Permission(permission)), _) => {
          format!(
            "domain_permission_denied:{}",
            match permission {
              CommandPermission::Workspace(action) => action.as_str(),
              CommandPermission::Doc(action) => action.as_str(),
            }
          )
        }
        (None, _) => "domain_permission_denied".to_string(),
      }))
    }
  }

  pub(in crate::runtime::backend_runtime) async fn authorize_search(
    &self,
    actor: &SearchActor,
    workspace_id: &str,
  ) -> RuntimeResult<AuthorizedSearchScope> {
    let SearchActor::User { user_id } = actor;
    let snapshot = self
      .store
      .typed_permission_snapshot(workspace_id, Some(user_id), workspace_request(WorkspaceAction::Read))
      .await?;
    let active_member = snapshot.active_member;
    let sharing_enabled = snapshot.sharing_enabled;
    let permission = evaluate_snapshot(snapshot).map_err(|_| RuntimeError::SearchPermissionUnavailable)?;
    self.telemetry.evaluations(self.deployment, &permission.output);
    if !permission
      .decision
      .workspace
      .first()
      .is_some_and(|decision| decision.allowed)
    {
      return Err(RuntimeError::SearchWorkspaceDenied);
    }
    let privileged = matches!(
      permission.effective_workspace_role,
      Some(WorkspaceRole::Owner | WorkspaceRole::Admin)
    );
    let docs = if privileged {
      DocReadScope::All
    } else {
      DocReadScope::ProjectedAcl(AclPredicate {
        actor_user_id: user_id.clone(),
        active_member,
        sharing_enabled,
      })
    };
    Ok(AuthorizedSearchScope {
      workspace_id: workspace_id.to_string(),
      docs,
    })
  }

  pub(in crate::runtime::backend_runtime) async fn filter_readable_docs(
    &self,
    workspace_id: &str,
    user_id: &str,
    doc_ids: Vec<String>,
  ) -> RuntimeResult<BTreeSet<String>> {
    let output = self
      .authorize_doc_action_batch(workspace_id, Some(user_id), &doc_ids, DocAction::Read)
      .await?;
    Ok(
      output
        .into_iter()
        .filter(|(_, decision)| decision.allowed)
        .map(|(doc_id, _)| doc_id)
        .collect(),
    )
  }
}

fn evaluate_snapshot(snapshot: PermissionSnapshot) -> RuntimeResult<AuthorizedPermission> {
  let decision = authorize(&snapshot.request, &snapshot.facts, &snapshot.grant);
  let effective_workspace_role = decision.effective_workspace_role;
  let output = permission_evaluation_output(decision.clone());
  Ok(AuthorizedPermission {
    decision,
    output,
    effective_workspace_role,
  })
}

fn workspace_request(action: WorkspaceAction) -> AuthorizationRequest {
  AuthorizationRequest {
    workspace_actions: vec![action.into()],
    doc_actions: Vec::new(),
  }
}

fn doc_request(doc_ids: &[String], action: DocAction) -> AuthorizationRequest {
  AuthorizationRequest {
    workspace_actions: Vec::new(),
    doc_actions: doc_ids
      .iter()
      .map(|doc_id| DocAuthorizationRequest {
        doc_id: doc_id.clone(),
        actions: vec![action.into()],
      })
      .collect(),
  }
}

fn doc_actions_request(doc_id: &str, actions: &[DocAction]) -> AuthorizationRequest {
  AuthorizationRequest {
    workspace_actions: Vec::new(),
    doc_actions: vec![DocAuthorizationRequest {
      doc_id: doc_id.to_string(),
      actions: actions.iter().copied().map(Into::into).collect(),
    }],
  }
}

fn doc_decisions(decision: AuthorizationDecision) -> BTreeMap<String, Decision> {
  decision
    .docs
    .into_iter()
    .map(|mut doc| (doc.doc_id, doc.decisions.pop().expect("document action has a decision")))
    .collect()
}
