//! The 30 `v0.27.5` mail templates (`packages/backend/server/src/mails`),
//! rendered byte-for-byte like the reference React renderer, and an async
//! SMTP sender matching the reference `nodemailer` transport.
//!
//! Frozen snapshots of every template live in
//! `tests/oracle-contracts/v0.27.5/mails`; `tests/golden_mails.rs` compares
//! each of them byte-for-byte.

mod html;
mod smtp;
mod templates;
mod worker;

use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};

pub use crate::smtp::{InlineAttachment, MailSendResult, SmtpConfig, SmtpError, SmtpMailer, normalize_helo_hostname};
pub use crate::worker::{
  MailDeliveryOptions, MailWorkerError, ResolvedWorkspaceMailMeta, WorkspaceMailMetaResolver,
  process_ready_mail_deliveries, process_ready_mail_deliveries_with_options,
};

/// Subject and HTML body of a rendered mail.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenderedMail {
  pub subject: String,
  pub html: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProps {
  pub email: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProps {
  pub name: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub avatar: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub size: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocProps {
  pub title: String,
  pub url: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TestMailProps {}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlProps {
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtpProps {
  pub url: String,
  pub otp: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub server_name: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailChangedProps {
  pub to: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWorkspaceUrlProps {
  pub user: UserProps,
  pub workspace: WorkspaceProps,
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWorkspaceProps {
  pub user: UserProps,
  pub workspace: WorkspaceProps,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOnlyProps {
  pub workspace: WorkspaceProps,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUrlProps {
  pub workspace: WorkspaceProps,
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDocProps {
  pub user: UserProps,
  pub doc: DocProps,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWorkspaceUpgradedProps {
  pub workspace: WorkspaceProps,
  pub is_owner: bool,
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDeleteIn24HoursProps {
  pub workspace: WorkspaceProps,
  pub deletion_date: DateTime<Utc>,
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamDeleteInOneMonthProps {
  pub workspace: WorkspaceProps,
  pub expiration_date: DateTime<Utc>,
  pub deletion_date: DateTime<Utc>,
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamExpirationProps {
  pub workspace: WorkspaceProps,
  pub expiration_date: DateTime<Utc>,
  pub url: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamLicenseProps {
  pub license: String,
}

/// Every `v0.27.5` `Renderers` entry with its props, serialized like the
/// reference mail job payload: `{ "name": "<Renderer>", "props": { ... } }`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "name", content = "props")]
pub enum MailTemplate {
  TestMail(TestMailProps),
  SignIn(OtpProps),
  SignUp(OtpProps),
  SetPassword(UrlProps),
  ChangePassword(UrlProps),
  VerifyEmail(UrlProps),
  ChangeEmail(UrlProps),
  VerifyChangeEmail(UrlProps),
  EmailChanged(EmailChangedProps),
  MemberInvitation(UserWorkspaceUrlProps),
  MemberAccepted(UserWorkspaceUrlProps),
  MemberLeave(UserWorkspaceProps),
  LinkInvitationReviewRequest(UserWorkspaceUrlProps),
  LinkInvitationApprove(WorkspaceUrlProps),
  LinkInvitationDecline(WorkspaceOnlyProps),
  MemberRemoved(WorkspaceOnlyProps),
  OwnershipTransferred(WorkspaceOnlyProps),
  OwnershipReceived(WorkspaceOnlyProps),
  Mention(UserDocProps),
  Comment(UserDocProps),
  CommentMention(UserDocProps),
  TeamWorkspaceUpgraded(TeamWorkspaceUpgradedProps),
  TeamBecomeAdmin(WorkspaceUrlProps),
  TeamBecomeCollaborator(WorkspaceUrlProps),
  TeamDeleteIn24Hours(TeamDeleteIn24HoursProps),
  TeamDeleteInOneMonth(TeamDeleteInOneMonthProps),
  TeamWorkspaceDeleted(WorkspaceOnlyProps),
  TeamWorkspaceExpireSoon(TeamExpirationProps),
  TeamWorkspaceExpired(TeamExpirationProps),
  TeamLicense(TeamLicenseProps),
}

impl MailTemplate {
  /// The reference `Renderers` key (`MailName`).
  pub const fn name(&self) -> &'static str {
    match self {
      Self::TestMail(_) => "TestMail",
      Self::SignIn(_) => "SignIn",
      Self::SignUp(_) => "SignUp",
      Self::SetPassword(_) => "SetPassword",
      Self::ChangePassword(_) => "ChangePassword",
      Self::VerifyEmail(_) => "VerifyEmail",
      Self::ChangeEmail(_) => "ChangeEmail",
      Self::VerifyChangeEmail(_) => "VerifyChangeEmail",
      Self::EmailChanged(_) => "EmailChanged",
      Self::MemberInvitation(_) => "MemberInvitation",
      Self::MemberAccepted(_) => "MemberAccepted",
      Self::MemberLeave(_) => "MemberLeave",
      Self::LinkInvitationReviewRequest(_) => "LinkInvitationReviewRequest",
      Self::LinkInvitationApprove(_) => "LinkInvitationApprove",
      Self::LinkInvitationDecline(_) => "LinkInvitationDecline",
      Self::MemberRemoved(_) => "MemberRemoved",
      Self::OwnershipTransferred(_) => "OwnershipTransferred",
      Self::OwnershipReceived(_) => "OwnershipReceived",
      Self::Mention(_) => "Mention",
      Self::Comment(_) => "Comment",
      Self::CommentMention(_) => "CommentMention",
      Self::TeamWorkspaceUpgraded(_) => "TeamWorkspaceUpgraded",
      Self::TeamBecomeAdmin(_) => "TeamBecomeAdmin",
      Self::TeamBecomeCollaborator(_) => "TeamBecomeCollaborator",
      Self::TeamDeleteIn24Hours(_) => "TeamDeleteIn24Hours",
      Self::TeamDeleteInOneMonth(_) => "TeamDeleteInOneMonth",
      Self::TeamWorkspaceDeleted(_) => "TeamWorkspaceDeleted",
      Self::TeamWorkspaceExpireSoon(_) => "TeamWorkspaceExpireSoon",
      Self::TeamWorkspaceExpired(_) => "TeamWorkspaceExpired",
      Self::TeamLicense(_) => "TeamLicense",
    }
  }

  /// Renders with the footer copyright year taken from the current UTC
  /// clock, as the reference `new Date().getUTCFullYear()` does.
  pub fn render(&self) -> RenderedMail {
    self.render_with_year(Utc::now().year())
  }

  /// Renders with an explicit footer copyright year.
  pub fn render_with_year(&self, copyright_year: i32) -> RenderedMail {
    templates::render(self, copyright_year)
  }
}
