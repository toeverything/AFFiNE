use super::{
  InviteQuotaConfig, QuotaViolation, RuntimeMailDeliveryQuotaDecision, RuntimeMailDeliveryQuotaInput, ScopeLimit,
  high_risk_domain, normalize_domain, scope, short_hash, source_prefix,
};
#[cfg(test)]
use super::{RuntimeMailDeliveryQuotaMetadataInput, RuntimeMailDeliveryQuotaRecipientInput, RuntimeQuotaSourceInput};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum MailClass {
  Auth,
  WorkspaceInvitation,
  CollaborationNotice,
  WorkspaceLifecycle,
  BillingLicense,
}

impl MailClass {
  pub(super) fn as_str(self) -> &'static str {
    match self {
      Self::Auth => "auth",
      Self::WorkspaceInvitation => "workspace_invitation",
      Self::CollaborationNotice => "collaboration_notice",
      Self::WorkspaceLifecycle => "workspace_lifecycle",
      Self::BillingLicense => "billing_license",
    }
  }
}

pub(super) fn mail_class(mail_name: &str, config: &InviteQuotaConfig) -> Option<MailClass> {
  match config.mail_class_mapping.get(mail_name).map(String::as_str) {
    Some("auth") => Some(MailClass::Auth),
    Some("workspace_invitation") => Some(MailClass::WorkspaceInvitation),
    Some("collaboration_notice") => Some(MailClass::CollaborationNotice),
    Some("workspace_lifecycle") => Some(MailClass::WorkspaceLifecycle),
    Some("billing_license") => Some(MailClass::BillingLicense),
    _ => None,
  }
}

pub(super) fn build_mail_scopes(
  input: &RuntimeMailDeliveryQuotaInput,
  class: MailClass,
  config: &InviteQuotaConfig,
) -> Vec<ScopeLimit> {
  let recipient_hash = short_hash(&input.recipient.email.trim().to_ascii_lowercase());
  let domain = normalize_domain(&input.recipient.domain);
  let class_name = class.as_str();
  let mut scopes = vec![
    scope(
      format!("mail:recipient:{recipient_hash}:class:{class_name}"),
      3600,
      20,
      1,
    ),
    scope(
      format!("mail:recipient_domain:{domain}:class:{class_name}"),
      3600,
      250,
      1,
    ),
    scope("mail:provider_global:default".to_string(), 60, 500, 1),
  ];

  match class {
    MailClass::Auth => {
      if let Some(prefix) = source_prefix(input.source.as_ref()) {
        scopes.push(scope(format!("mail:source_prefix:{prefix}:class:auth"), 3600, 50, 1));
      }
    }
    MailClass::WorkspaceInvitation => {
      if let Some(prefix) = source_prefix(input.source.as_ref()) {
        scopes.push(scope(
          format!("mail:source_prefix_domain:{prefix}:{domain}:class:{class_name}"),
          3600,
          if high_risk_domain(&domain, config) { 10 } else { 50 },
          1,
        ));
      }
      if let Some(subject) = input.metadata.abuse_subject_key.as_deref() {
        scopes.push(scope(
          format!("mail:abuse_subject:{subject}:class:{class_name}"),
          86_400,
          0,
          1,
        ));
      }
    }
    MailClass::CollaborationNotice | MailClass::WorkspaceLifecycle => {
      if let Some(actor) = input.metadata.actor_user_id.as_deref() {
        scopes.push(scope(format!("mail:actor:{actor}:class:{class_name}"), 3600, 200, 1));
      }
      if let Some(workspace) = input.metadata.workspace_id.as_deref() {
        scopes.push(scope(
          format!("mail:workspace:{workspace}:class:{class_name}"),
          3600,
          1000,
          1,
        ));
      }
    }
    MailClass::BillingLicense => {}
  }

  scopes
}

pub(super) fn decision_from_violation(
  violation: QuotaViolation,
  class: MailClass,
  reason: &str,
) -> RuntimeMailDeliveryQuotaDecision {
  RuntimeMailDeliveryQuotaDecision {
    allowed: false,
    reservation_id: None,
    mail_class: class.as_str().to_string(),
    retry_after_seconds: Some(60),
    reason: Some(reason.to_string()),
    scope_key: Some(violation.scope_key),
    window_seconds: Some(violation.window_seconds),
    limit: Some(violation.limit),
    current: Some(violation.current),
    requested: Some(violation.requested),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn invite_config() -> InviteQuotaConfig {
    InviteQuotaConfig::default()
  }

  #[test]
  fn mail_class_mapping_covers_known_renderers_and_fails_closed() {
    let config = invite_config();
    for (name, class) in [
      ("SignIn", MailClass::Auth),
      ("MemberInvitation", MailClass::WorkspaceInvitation),
      ("CommentMention", MailClass::CollaborationNotice),
      ("TeamWorkspaceExpired", MailClass::WorkspaceLifecycle),
      ("TeamLicense", MailClass::BillingLicense),
    ] {
      assert_eq!(mail_class(name, &config), Some(class), "{name}");
    }
    assert_eq!(mail_class("TestMail", &config), None);
    assert_eq!(mail_class("UnexpectedMail", &config), None);
  }

  #[test]
  fn auth_mail_does_not_expand_actor_or_workspace_scopes() {
    let input = RuntimeMailDeliveryQuotaInput {
      request_id: None,
      mail_name: "SignIn".to_string(),
      recipient: RuntimeMailDeliveryQuotaRecipientInput {
        email: "user@example.com".to_string(),
        domain: "example.com".to_string(),
        user_id: Some("u1".to_string()),
      },
      metadata: RuntimeMailDeliveryQuotaMetadataInput {
        actor_user_id: Some("actor".to_string()),
        workspace_id: Some("workspace".to_string()),
        notification_id: None,
        abuse_subject_key: None,
      },
      source: None::<RuntimeQuotaSourceInput>,
    };
    let scopes = build_mail_scopes(&input, MailClass::Auth, &invite_config());
    assert!(scopes.iter().all(|scope| !scope.scope_key.contains("actor")));
    assert!(scopes.iter().all(|scope| !scope.scope_key.contains("workspace")));
  }
}
