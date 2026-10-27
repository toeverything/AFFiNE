use affine_core::rate_limit::{
  InviteInput, InviteOperation, InvitePolicyConfig, MailInput, MailMetadata, SourceFacts, TargetDomain,
};

use super::{
  InviteQuotaConfig, RuntimeMailDeliveryQuotaInput, RuntimeQuotaSourceInput, RuntimeQuotaTargetDomainInput,
  RuntimeWorkspaceInviteQuotaInput,
};

pub(super) fn invite_policy_config<'a>(
  config: &InviteQuotaConfig,
  subject_hash_salt: &'a str,
) -> InvitePolicyConfig<'a> {
  InvitePolicyConfig {
    new_account_action_delay_seconds: config.new_account_action_delay_seconds,
    subject_hash_salt,
  }
}

pub(super) fn source_facts(source: &RuntimeQuotaSourceInput) -> SourceFacts {
  SourceFacts {
    trusted: source.trusted,
    ip: source.ip.clone(),
    asn: source.asn,
  }
}

pub(super) fn target_domains(domains: &[RuntimeQuotaTargetDomainInput]) -> Vec<TargetDomain> {
  domains
    .iter()
    .map(|target| TargetDomain {
      domain: target.domain.clone(),
      count: target.count,
    })
    .collect()
}

pub(super) fn invite_input(input: &RuntimeWorkspaceInviteQuotaInput) -> InviteInput {
  InviteInput {
    operation: InviteOperation::InviteMembers,
    actor_user_id: input.actor_user_id.clone(),
    workspace_id: input.workspace_id.clone(),
    target_count: input.target_count,
    target_domains: target_domains(&input.target_domains),
    source: input.source.as_ref().map(source_facts),
  }
}

pub(super) fn mail_input(input: &RuntimeMailDeliveryQuotaInput) -> MailInput {
  MailInput {
    mail_name: input.mail_name.clone(),
    recipient_email: input.recipient.email.clone(),
    metadata: MailMetadata {
      actor_user_id: input.metadata.actor_user_id.clone(),
      workspace_id: input.metadata.workspace_id.clone(),
      abuse_subject_key: input.metadata.abuse_subject_key.clone(),
    },
    source: input.source.as_ref().map(source_facts),
  }
}
