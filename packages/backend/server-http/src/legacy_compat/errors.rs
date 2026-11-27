//! Apollo / NestJS `UserFriendlyError` error envelope compatibility mapping.

use async_graphql::{ErrorExtensions, Value};
use http::StatusCode;
use serde::{Deserialize, Serialize};
use server_types::DomainError;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyErrorEnvelope {
  pub status: u16,
  pub code: String,
  #[serde(rename = "type")]
  pub error_type: String,
  pub name: String,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<serde_json::Value>,
}

fn parse_two_part(raw: &str) -> Option<(&str, &str)> {
  let (a, b) = raw.split_once(':')?;
  if a.is_empty() || b.is_empty() {
    None
  } else {
    Some((a, b))
  }
}

fn parse_three_part(raw: &str) -> Option<(&str, &str, &str)> {
  let (a, rest) = raw.split_once(':')?;
  let (b, c) = rest.split_once(':')?;
  if a.is_empty() || b.is_empty() || c.is_empty() {
    None
  } else {
    Some((a, b, c))
  }
}

/// Maps a canonical [`DomainError`] to the `v0.27.5` `UserFriendlyError.toJSON()`
/// envelope (`status`, `code`, `type`, `name`, `message`, optional `data`).
pub fn domain_error_to_envelope(err: &DomainError) -> LegacyErrorEnvelope {
  match err {
    DomainError::Unauthorized(msg) => LegacyErrorEnvelope {
      status: StatusCode::UNAUTHORIZED.as_u16(),
      code: "Unauthorized".into(),
      error_type: "AUTHENTICATION_REQUIRED".into(),
      name: "AUTHENTICATION_REQUIRED".into(),
      message: msg.clone(),
      data: None,
    },
    DomainError::Forbidden(msg) => {
      if let Some(rest) = msg.strip_prefix("doc_action_denied:") {
        if let Some((space_id, doc_id, action)) = parse_three_part(rest) {
          return LegacyErrorEnvelope {
            status: StatusCode::FORBIDDEN.as_u16(),
            code: "Forbidden".into(),
            error_type: "NO_PERMISSION".into(),
            name: "DOC_ACTION_DENIED".into(),
            message: format!("You do not have permission to perform {action} action on doc {doc_id}."),
            data: Some(serde_json::json!({
              "spaceId": space_id,
              "docId": doc_id,
              "action": action,
            })),
          };
        }
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "NO_PERMISSION".into(),
          name: "DOC_ACTION_DENIED".into(),
          message: format!("You do not have permission to perform {rest} action on doc ."),
          data: Some(serde_json::json!({
            "spaceId": "",
            "docId": "",
            "action": rest,
          })),
        };
      }
      if let Some(space_id) = msg.strip_prefix("space_access_denied:") {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "NO_PERMISSION".into(),
          name: "SPACE_ACCESS_DENIED".into(),
          message: format!("You do not have permission to access Space {space_id}."),
          data: Some(serde_json::json!({ "spaceId": space_id })),
        };
      }
      if let Some(space_id) = msg.strip_prefix("member_not_found_in_space:") {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "MEMBER_NOT_FOUND_IN_SPACE".into(),
          message: format!("Member not found in Space {space_id}."),
          data: Some(serde_json::json!({ "spaceId": space_id })),
        };
      }
      if let Some(space_id) = msg.strip_prefix("no_more_seat:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "NO_MORE_SEAT".into(),
          message: format!("No more seat available in the Space {space_id}."),
          data: Some(serde_json::json!({ "spaceId": space_id })),
        };
      }
      if let Some(doc_id) = msg.strip_prefix("mention_user_doc_access_denied:") {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "NO_PERMISSION".into(),
          name: "MENTION_USER_DOC_ACCESS_DENIED".into(),
          message: format!("Mentioned user can not access doc {doc_id}."),
          data: Some(serde_json::json!({ "docId": doc_id })),
        };
      }
      if msg == "workspace_license_already_exists" {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "WORKSPACE_LICENSE_ALREADY_EXISTS".into(),
          message: "Workspace already has a license applied.".into(),
          data: None,
        };
      }
      if msg == "access_denied" {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "NO_PERMISSION".into(),
          name: "ACCESS_DENIED".into(),
          message: "You do not have permission to access this resource.".into(),
          data: None,
        };
      }
      if let Some((name, message)) = match msg.as_str() {
        "workspace_owner_cannot_leave" | "owner_can_not_leave_workspace" => {
          Some(("OWNER_CAN_NOT_LEAVE_WORKSPACE", "Owner can not leave the workspace."))
        }
        "cannot_revoke_self" | "can_not_revoke_yourself" => {
          Some(("CAN_NOT_REVOKE_YOURSELF", "You can not revoke your own permission."))
        }
        "invitation_account_mismatch" => Some((
          "INVITATION_ACCOUNT_MISMATCH",
          "This invitation belongs to another account.",
        )),
        "managed_by_app_store_or_play" => Some((
          "MANAGED_BY_APP_STORE_OR_PLAY",
          "This subscription is managed by App Store or Google Play. Please manage it in the corresponding store.",
        )),
        "cant_update_onetime_payment_subscription" => Some((
          "CANT_UPDATE_ONETIME_PAYMENT_SUBSCRIPTION",
          "You cannot update an onetime payment subscription.",
        )),
        "subscription_has_been_canceled" => Some((
          "SUBSCRIPTION_HAS_BEEN_CANCELED",
          "Your subscription has already been canceled.",
        )),
        "subscription_has_not_been_canceled" => Some((
          "SUBSCRIPTION_HAS_NOT_BEEN_CANCELED",
          "Your subscription has not been canceled.",
        )),
        "purchase_in_progress" => Some(("PURCHASE_IN_PROGRESS", "A purchase for this plan is still in progress.")),
        "purchase_needs_verification" => Some((
          "PURCHASE_NEEDS_VERIFICATION",
          "This plan has a purchase that needs verification. Review your subscriptions before trying again.",
        )),
        "license_revealed" => Some((
          "LICENSE_REVEALED",
          "License key has been revealed. Please check your mail box of the one provided during checkout.",
        )),
        "copilot_session_deleted" => Some(("COPILOT_SESSION_DELETED", "Copilot session has been deleted.")),
        "copilot_action_taken" => Some((
          "COPILOT_ACTION_TAKEN",
          "Action has been taken, no more messages allowed.",
        )),
        "copilot_disabled" => Some(("COPILOT_DISABLED", "Copilot is disabled.")),
        "copilot_embedding_disabled" => Some((
          "COPILOT_EMBEDDING_DISABLED",
          "Embedding feature is disabled, please contact the administrator to enable it in the workspace settings.",
        )),
        "copilot_embedding_unavailable" => Some((
          "COPILOT_EMBEDDING_UNAVAILABLE",
          "Embedding feature not available, you may need to install pgvector extension to your database",
        )),
        _ => None,
      } {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: name.into(),
          message: message.into(),
          data: None,
        };
      }
      LegacyErrorEnvelope {
        status: StatusCode::FORBIDDEN.as_u16(),
        code: "Forbidden".into(),
        error_type: "ACTION_FORBIDDEN".into(),
        name: "ACTION_FORBIDDEN".into(),
        message: msg.clone(),
        data: None,
      }
    }
    DomainError::NotFound(msg) => {
      if let Some(rest) = msg.strip_prefix("blob_not_found:")
        && let Some((space_id, blob_id)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "BLOB_NOT_FOUND".into(),
          message: format!("Blob {blob_id} under Space {space_id} not found."),
          data: Some(serde_json::json!({ "spaceId": space_id, "blobId": blob_id })),
        };
      }
      if let Some(rest) = msg.strip_prefix("doc_not_found:")
        && let Some((space_id, doc_id)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "DOC_NOT_FOUND".into(),
          message: format!("Doc {doc_id} under Space {space_id} not found."),
          data: Some(serde_json::json!({ "spaceId": space_id, "docId": doc_id })),
        };
      }
      if let Some(rest) = msg.strip_prefix("doc_history_not_found:")
        && let Some((space_id, doc_id, ts_str)) = parse_three_part(rest)
      {
        let ts_num = ts_str.parse::<i64>().unwrap_or(0);
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "DOC_HISTORY_NOT_FOUND".into(),
          message: format!("History of {doc_id} at {ts_num} under Space {space_id}."),
          data: Some(serde_json::json!({
            "spaceId": space_id,
            "docId": doc_id,
            "timestamp": ts_num,
          })),
        };
      }
      if let Some(plan) = msg.strip_prefix("subscription_not_exists:") {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "SUBSCRIPTION_NOT_EXISTS".into(),
          message: format!("You didn't subscribe to the {plan} plan."),
          data: Some(serde_json::json!({ "plan": plan })),
        };
      }
      if let Some(rest) = msg.strip_prefix("subscription_plan_not_found:")
        && let Some((plan, recurring)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "SUBSCRIPTION_PLAN_NOT_FOUND".into(),
          message: "You are trying to access a unknown subscription plan.".into(),
          data: Some(serde_json::json!({ "plan": plan, "recurring": recurring })),
        };
      }
      if let Some(doc_id) = msg.strip_prefix("copilot_doc_not_found:") {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "COPILOT_DOC_NOT_FOUND".into(),
          message: format!("Doc {doc_id} not found."),
          data: Some(serde_json::json!({ "docId": doc_id })),
        };
      }
      if let Some(msg_id) = msg.strip_prefix("copilot_message_not_found:") {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "COPILOT_MESSAGE_NOT_FOUND".into(),
          message: format!("Copilot message {msg_id} not found."),
          data: Some(serde_json::json!({ "messageId": msg_id })),
        };
      }
      if let Some(prompt_name) = msg.strip_prefix("copilot_prompt_not_found:") {
        return LegacyErrorEnvelope {
          status: StatusCode::NOT_FOUND.as_u16(),
          code: "Not Found".into(),
          error_type: "RESOURCE_NOT_FOUND".into(),
          name: "COPILOT_PROMPT_NOT_FOUND".into(),
          message: format!("Copilot prompt {prompt_name} not found."),
          data: Some(serde_json::json!({ "name": prompt_name })),
        };
      }
      if msg == "invalid_invitation" || msg == "Invitation not found" {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "INVALID_INVITATION".into(),
          message: "Invalid invitation provided.".into(),
          data: None,
        };
      }
      if msg == "workspace_member_not_found" {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "MEMBER_NOT_FOUND_IN_SPACE".into(),
          message: "Member not found in Space.".into(),
          data: None,
        };
      }
      let (name, message) = match msg.as_str() {
        "doc_not_found" => ("DOC_NOT_FOUND", "Doc not found."),
        "doc_history_not_found" => ("DOC_HISTORY_NOT_FOUND", "Doc history not found."),
        "comment_not_found" => ("COMMENT_NOT_FOUND", "Comment not found."),
        "reply_not_found" => ("REPLY_NOT_FOUND", "Reply not found."),
        "license_not_found" => ("LICENSE_NOT_FOUND", "License not found."),
        "user_not_found" => ("USER_NOT_FOUND", "User not found."),
        "notification_not_found" => ("NOTIFICATION_NOT_FOUND", "Notification not found."),
        "copilot_session_not_found" => ("COPILOT_SESSION_NOT_FOUND", "Copilot session not found."),
        "copilot_docs_not_found" => ("COPILOT_DOCS_NOT_FOUND", "Some docs not found."),
        _ => ("RESOURCE_NOT_FOUND", msg.as_str()),
      };
      LegacyErrorEnvelope {
        status: StatusCode::NOT_FOUND.as_u16(),
        code: "Not Found".into(),
        error_type: "RESOURCE_NOT_FOUND".into(),
        name: name.into(),
        message: message.into(),
        data: None,
      }
    }
    DomainError::Conflict(msg) => {
      if msg == "email_already_used" || msg.starts_with("email_already_used:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "RESOURCE_ALREADY_EXISTS".into(),
          name: "EMAIL_ALREADY_USED".into(),
          message: "This email has already been registered.".into(),
          data: None,
        };
      }
      if msg == "already_in_space" || msg.starts_with("already_in_space:") {
        let space_id = msg.strip_prefix("already_in_space:").unwrap_or("");
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "ALREADY_IN_SPACE".into(),
          message: if space_id.is_empty() {
            "You have already joined in Space.".into()
          } else {
            format!("You have already joined in Space {space_id}.")
          },
          data: (!space_id.is_empty()).then(|| serde_json::json!({ "spaceId": space_id })),
        };
      }
      if let Some(plan) = msg.strip_prefix("subscription_already_exists:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "RESOURCE_ALREADY_EXISTS".into(),
          name: "SUBSCRIPTION_ALREADY_EXISTS".into(),
          message: format!("You have already subscribed to the {plan} plan."),
          data: Some(serde_json::json!({ "plan": plan })),
        };
      }
      LegacyErrorEnvelope {
        status: StatusCode::BAD_REQUEST.as_u16(),
        code: "Bad Request".into(),
        error_type: "RESOURCE_ALREADY_EXISTS".into(),
        name: "RESOURCE_ALREADY_EXISTS".into(),
        message: msg.clone(),
        data: None,
      }
    }
    DomainError::QuotaExceeded { kind, message } => {
      if matches!(
        *kind,
        "copilot_quota" | "copilot_action_limit" | "copilot_quota_exceeded"
      ) {
        return LegacyErrorEnvelope {
          status: StatusCode::PAYMENT_REQUIRED.as_u16(),
          code: "Payment Required".into(),
          error_type: "QUOTA_EXCEEDED".into(),
          name: "COPILOT_QUOTA_EXCEEDED".into(),
          message: "You have reached the limit of actions in this workspace, please upgrade your plan.".into(),
          data: None,
        };
      }
      let (name, error_type, data) = match *kind {
        "blob_limit" => ("BLOB_QUOTA_EXCEEDED", "QUOTA_EXCEEDED", None),
        "storage_quota" => ("STORAGE_QUOTA_EXCEEDED", "QUOTA_EXCEEDED", None),
        "seat_limit" | "member_quota_exceeded" => ("MEMBER_QUOTA_EXCEEDED", "QUOTA_EXCEEDED", None),
        "comment_attachment_quota_exceeded" => ("COMMENT_ATTACHMENT_QUOTA_EXCEEDED", "QUOTA_EXCEEDED", None),
        _ => (
          "QUOTA_EXCEEDED",
          "QUOTA_EXCEEDED",
          Some(serde_json::json!({ "kind": kind })),
        ),
      };
      LegacyErrorEnvelope {
        status: StatusCode::PAYMENT_REQUIRED.as_u16(),
        code: "Payment Required".into(),
        error_type: error_type.into(),
        name: name.into(),
        message: message.clone(),
        data,
      }
    }
    DomainError::Validation(msg) => {
      if msg == "password_required" {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "PASSWORD_REQUIRED".into(),
          message: "Password is required.".into(),
          data: None,
        };
      }
      if let Some(rest) = msg.strip_prefix("invalid_password_length:") {
        let (min, max) = rest
          .split_once(':')
          .map(|(a, b)| (a.parse::<usize>().unwrap_or(8), b.parse::<usize>().unwrap_or(32)))
          .unwrap_or((8, 32));
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "INVALID_PASSWORD_LENGTH".into(),
          message: format!("Password length must be between {min} and {max} characters."),
          data: Some(serde_json::json!({ "min": min, "max": max })),
        };
      }
      if msg == "invalid_email" || msg.eq_ignore_ascii_case("invalid email format") || msg.contains("invalid email") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "INVALID_EMAIL".into(),
          message: "Invalid email format.".into(),
          data: None,
        };
      }
      if let Some(detail) = msg.strip_prefix("blob_invalid:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "BLOB_INVALID".into(),
          message: detail.to_owned(),
          data: None,
        };
      }
      if msg == "cannot_delete_account_with_owned_team_workspace" {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "CANNOT_DELETE_ACCOUNT_WITH_OWNED_TEAM_WORKSPACE".into(),
          message: "Cannot delete account. You are the owner of one or more team workspaces. Please transfer ownership or delete them first.".into(),
          data: None,
        };
      }
      if msg == "cannot_delete_own_account" {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "CANNOT_DELETE_OWN_ACCOUNT".into(),
          message: "Cannot delete own account.".into(),
          data: None,
        };
      }
      if msg == "mention_user_oneself_denied" {
        return LegacyErrorEnvelope {
          status: StatusCode::FORBIDDEN.as_u16(),
          code: "Forbidden".into(),
          error_type: "ACTION_FORBIDDEN".into(),
          name: "MENTION_USER_ONESELF_DENIED".into(),
          message: "You can not mention yourself.".into(),
          data: None,
        };
      }
      if let Some(max_raw) = msg.strip_prefix("query_too_long:") {
        let max_num = max_raw.parse::<i64>().unwrap_or(255);
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "QUERY_TOO_LONG".into(),
          message: format!("Query is too long, max length is {max_num}."),
          data: Some(serde_json::json!({ "max": max_num })),
        };
      }
      if msg == "new_owner_is_not_active_member" || msg == "new workspace owner must be an active member" {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "NEW_OWNER_IS_NOT_ACTIVE_MEMBER".into(),
          message: "Can not set a non-active member as owner.".into(),
          data: None,
        };
      }
      if msg == "invalid_invitation" {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "INVALID_INVITATION".into(),
          message: "Invalid invitation provided.".into(),
          data: None,
        };
      }
      if let Some(space_id) = msg.strip_prefix("no_more_seat:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "NO_MORE_SEAT".into(),
          message: format!("No more seat available in the Space {space_id}."),
          data: Some(serde_json::json!({ "spaceId": space_id })),
        };
      }
      if msg == "doc_is_not_public" {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "DOC_IS_NOT_PUBLIC".into(),
          message: "Doc is not public.".into(),
          data: None,
        };
      }
      if msg == "license_expired" {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "LICENSE_EXPIRED".into(),
          message: "License has expired.".into(),
          data: None,
        };
      }
      if let Some((name, message)) = match msg.as_str() {
        "copilot_transcription_audio_not_provided" => Some((
          "COPILOT_TRANSCRIPTION_AUDIO_NOT_PROVIDED",
          "Audio file is required for transcription.",
        )),
        "copilot_transcription_job_exists" => {
          Some(("COPILOT_TRANSCRIPTION_JOB_EXISTS", "Transcription job already exists."))
        }
        "copilot_transcription_job_not_found" => {
          Some(("COPILOT_TRANSCRIPTION_JOB_NOT_FOUND", "Transcription job not found."))
        }
        _ => None,
      } {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: name.into(),
          message: message.into(),
          data: None,
        };
      }
      if let Some(reason) = msg.strip_prefix("invalid_license_to_activate:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "INVALID_LICENSE_TO_ACTIVATE".into(),
          message: format!("Invalid license to activate. {reason}"),
          data: Some(serde_json::json!({ "reason": reason })),
        };
      }
      if let Some(rest) = msg.strip_prefix("expect_to_grant_doc_user_roles:")
        && let Some((space_id, doc_id)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "EXPECT_TO_GRANT_DOC_USER_ROLES".into(),
          message: format!("Expect grant roles on doc {doc_id} under Space {space_id}, not a Space."),
          data: Some(serde_json::json!({ "spaceId": space_id, "docId": doc_id })),
        };
      }
      if let Some(rest) = msg.strip_prefix("expect_to_revoke_doc_user_roles:")
        && let Some((space_id, doc_id)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "EXPECT_TO_REVOKE_DOC_USER_ROLES".into(),
          message: format!("Expect revoke roles on doc {doc_id} under Space {space_id}, not a Space."),
          data: Some(serde_json::json!({ "spaceId": space_id, "docId": doc_id })),
        };
      }
      if let Some(rest) = msg.strip_prefix("expect_to_update_doc_user_role:")
        && let Some((space_id, doc_id)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "EXPECT_TO_UPDATE_DOC_USER_ROLE".into(),
          message: format!("Expect update roles on doc {doc_id} under Space {space_id}, not a Space."),
          data: Some(serde_json::json!({ "spaceId": space_id, "docId": doc_id })),
        };
      }
      if let Some(recurring) = msg.strip_prefix("same_subscription_recurring:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "SAME_SUBSCRIPTION_RECURRING".into(),
          message: format!("Your subscription has already been in {recurring} recurring state."),
          data: Some(serde_json::json!({ "recurring": recurring })),
        };
      }
      if let Some(detail) = msg.strip_prefix("bad_request:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "BAD_REQUEST".into(),
          name: "BAD_REQUEST".into(),
          message: detail.to_owned(),
          data: None,
        };
      }
      if let Some(format_name) = msg.strip_prefix("image_format_not_supported:") {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "IMAGE_FORMAT_NOT_SUPPORTED".into(),
          message: format!("Image format not supported: {format_name}"),
          data: Some(serde_json::json!({ "format": format_name })),
        };
      }
      if let Some(rest) = msg.strip_prefix("copilot_provider_not_supported:")
        && let Some((provider, kind)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::BAD_REQUEST.as_u16(),
          code: "Bad Request".into(),
          error_type: "INVALID_INPUT".into(),
          name: "COPILOT_PROVIDER_NOT_SUPPORTED".into(),
          message: format!("Copilot provider {provider} does not support output type {kind}"),
          data: Some(serde_json::json!({ "provider": provider, "kind": kind })),
        };
      }
      let (name, message) = match msg.as_str() {
        "expect_to_publish_doc" => ("EXPECT_TO_PUBLISH_DOC", "Expected to publish a doc, not a Space."),
        "expect_to_revoke_public_doc" => (
          "EXPECT_TO_REVOKE_PUBLIC_DOC",
          "Expected to revoke a public doc, not a Space.",
        ),
        "doc_default_role_can_not_be_owner" => (
          "DOC_DEFAULT_ROLE_CAN_NOT_BE_OWNER",
          "Doc default role can not be owner.",
        ),
        "workspace_id_required_to_update_team_subscription" => (
          "WORKSPACE_ID_REQUIRED_TO_UPDATE_TEAM_SUBSCRIPTION",
          "Workspace id is required to update team subscription.",
        ),
        "invalid_checkout_parameters" => ("INVALID_CHECKOUT_PARAMETERS", "Invalid checkout parameters provided."),
        "invalid_license_session_id" => (
          "INVALID_LICENSE_SESSION_ID",
          "Invalid session id to generate license key.",
        ),
        "invalid_subscription_parameters" => (
          "INVALID_SUBSCRIPTION_PARAMETERS",
          "Invalid subscription parameters provided.",
        ),
        "copilot_prompt_invalid" => ("COPILOT_PROMPT_INVALID", "Copilot prompt is invalid."),
        "copilot_session_invalid_input" => ("COPILOT_SESSION_INVALID_INPUT", "Copilot session input is invalid."),
        "copilot_selected_sources_limit_exceeded" => (
          "COPILOT_SELECTED_SOURCES_LIMIT_EXCEEDED",
          "Too many or too much content was selected. Select fewer sources and try again.",
        ),
        _ => ("INVALID_INPUT", msg.as_str()),
      };
      LegacyErrorEnvelope {
        status: StatusCode::BAD_REQUEST.as_u16(),
        code: "Bad Request".into(),
        error_type: "INVALID_INPUT".into(),
        name: name.into(),
        message: message.into(),
        data: None,
      }
    }
    DomainError::PreconditionFailed(msg) => LegacyErrorEnvelope {
      status: StatusCode::PRECONDITION_FAILED.as_u16(),
      code: "Precondition Failed".into(),
      error_type: "BAD_REQUEST".into(),
      name: "BAD_REQUEST".into(),
      message: msg.clone(),
      data: None,
    },
    DomainError::RateLimited(msg) => LegacyErrorEnvelope {
      status: StatusCode::TOO_MANY_REQUESTS.as_u16(),
      code: "Too Many Requests".into(),
      error_type: "TOO_MANY_REQUESTS".into(),
      name: "TOO_MANY_REQUEST".into(),
      message: if msg.is_empty() {
        "Too many requests.".into()
      } else {
        msg.clone()
      },
      data: None,
    },
    DomainError::Unavailable(msg) => LegacyErrorEnvelope {
      status: StatusCode::SERVICE_UNAVAILABLE.as_u16(),
      code: "Service Unavailable".into(),
      error_type: "SERVICE_UNAVAILABLE".into(),
      name: "SERVICE_UNAVAILABLE".into(),
      message: msg.clone(),
      data: None,
    },
    DomainError::Internal(msg) => {
      if let Some(model_id) = msg.strip_prefix("no_copilot_provider_available:") {
        return LegacyErrorEnvelope {
          status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
          code: "Internal Server Error".into(),
          error_type: "INTERNAL_SERVER_ERROR".into(),
          name: "NO_COPILOT_PROVIDER_AVAILABLE".into(),
          message: format!("No copilot provider available: {model_id}"),
          data: Some(serde_json::json!({ "modelId": model_id })),
        };
      }
      if let Some(rest) = msg.strip_prefix("copilot_provider_side_error:")
        && let Some((provider, kind, detail)) = parse_three_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
          code: "Internal Server Error".into(),
          error_type: "INTERNAL_SERVER_ERROR".into(),
          name: "COPILOT_PROVIDER_SIDE_ERROR".into(),
          message: format!("Provider {provider} failed with {kind} error: {detail}"),
          data: Some(serde_json::json!({ "provider": provider, "kind": kind, "message": detail })),
        };
      }
      if let Some(space_id) = msg.strip_prefix("space_owner_not_found:") {
        return LegacyErrorEnvelope {
          status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
          code: "Internal Server Error".into(),
          error_type: "INTERNAL_SERVER_ERROR".into(),
          name: "SPACE_OWNER_NOT_FOUND".into(),
          message: format!("Owner of Space {space_id} not found."),
          data: Some(serde_json::json!({ "spaceId": space_id })),
        };
      }
      if let Some(detail) = msg.strip_prefix("copilot_failed_to_add_workspace_artifact:") {
        return LegacyErrorEnvelope {
          status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
          code: "Internal Server Error".into(),
          error_type: "INTERNAL_SERVER_ERROR".into(),
          name: "COPILOT_FAILED_TO_ADD_WORKSPACE_ARTIFACT".into(),
          message: format!("Failed to add workspace artifact: {detail}"),
          data: Some(serde_json::json!({ "message": detail })),
        };
      }
      if let Some(rest) = msg.strip_prefix("copilot_failed_to_generate_embedding:")
        && let Some((provider, detail)) = parse_two_part(rest)
      {
        return LegacyErrorEnvelope {
          status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
          code: "Internal Server Error".into(),
          error_type: "INTERNAL_SERVER_ERROR".into(),
          name: "COPILOT_FAILED_TO_GENERATE_EMBEDDING".into(),
          message: format!("Failed to generate embedding with {provider}: {detail}"),
          data: Some(serde_json::json!({ "provider": provider, "message": detail })),
        };
      }
      let (name, message) = match msg.as_str() {
        "failed_to_checkout" => ("FAILED_TO_CHECKOUT", "Failed to create checkout session."),
        "customer_portal_create_failed" => (
          "CUSTOMER_PORTAL_CREATE_FAILED",
          "Failed to create customer portal session.",
        ),
        "copilot_failed_to_create_message" => ("COPILOT_FAILED_TO_CREATE_MESSAGE", "Failed to create chat message."),
        "copilot_failed_to_generate_text" => ("COPILOT_FAILED_TO_GENERATE_TEXT", "Failed to generate text."),
        "unsplash_is_not_configured" => ("UNSPLASH_IS_NOT_CONFIGURED", "Unsplash is not configured."),
        // Never leak internal error details to clients (matches v0.27.5 def.ts:248-251).
        _ => ("INTERNAL_SERVER_ERROR", "An internal error occurred."),
      };
      LegacyErrorEnvelope {
        status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
        code: "Internal Server Error".into(),
        error_type: "INTERNAL_SERVER_ERROR".into(),
        name: name.into(),
        message: message.into(),
        data: None,
      }
    }
  }
}

/// Converts a [`LegacyErrorEnvelope`] into an `async_graphql::Error` with
/// `extensions.{status, code, type, name, message, data}`.
pub fn envelope_to_graphql(envelope: LegacyErrorEnvelope) -> async_graphql::Error {
  async_graphql::Error::new(envelope.message.clone()).extend_with(|_, ext| {
    ext.set("status", envelope.status);
    ext.set("code", envelope.code.clone());
    ext.set("type", envelope.error_type.clone());
    ext.set("name", envelope.name.clone());
    ext.set("message", envelope.message.clone());
    if let Some(data) = &envelope.data
      && let Ok(val) = Value::from_json(data.clone())
    {
      ext.set("data", val);
    }
  })
}

/// Converts a canonical [`DomainError`] into an `async_graphql::Error` with
/// `extensions.{status, code, type, name, message, data}`.
pub fn domain_error_to_graphql(err: &DomainError) -> async_graphql::Error {
  envelope_to_graphql(domain_error_to_envelope(err))
}

/// Maps a [`server_domain::safe_fetch::SafeFetchError`] to the exact `v0.27.5`
/// `SSRF_BLOCKED_ERROR` or `RESPONSE_TOO_LARGE_ERROR` envelope (`def.ts:279-310`)
/// without ever echoing resolved private IP addresses.
pub fn safe_fetch_error_to_envelope(err: &server_domain::safe_fetch::SafeFetchError) -> LegacyErrorEnvelope {
  use server_domain::safe_fetch::SafeFetchError;
  if let Some(reason) = err.ssrf_reason() {
    let message = match reason {
      "invalid_url" => "Invalid URL".to_owned(),
      "disallowed_protocol" => "URL protocol is not allowed".to_owned(),
      "url_has_credentials" => "URL must not contain credentials".to_owned(),
      "blocked_hostname" => "URL hostname is not allowed".to_owned(),
      "host_not_allowed" => "URL hostname is outside the allowed hosts".to_owned(),
      "unresolvable_hostname" => "Failed to resolve hostname".to_owned(),
      "blocked_ip" => "URL resolves to a private or reserved IP address".to_owned(),
      "too_many_redirects" => "Too many redirects".to_owned(),
      other => format!("URL blocked by SSRF protection: {other}"),
    };
    return LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "SSRF_BLOCKED_ERROR".into(),
      message,
      data: Some(serde_json::json!({ "reason": reason })),
    };
  }
  match err {
    SafeFetchError::ResponseTooLarge {
      limit_bytes,
      received_bytes,
    } => LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "RESPONSE_TOO_LARGE_ERROR".into(),
      message: format!("Response too large ({received_bytes} bytes), limit is {limit_bytes} bytes"),
      data: Some(serde_json::json!({
        "limitBytes": limit_bytes,
        "receivedBytes": received_bytes,
      })),
    },
    SafeFetchError::Timeout | SafeFetchError::RequestFailed(_) => LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "BAD_REQUEST".into(),
      name: "HTTP_REQUEST_ERROR".into(),
      message: format!("HTTP request error, message: {err}"),
      data: Some(serde_json::json!({ "message": err.to_string() })),
    },
    _ => LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "SSRF_BLOCKED_ERROR".into(),
      message: "URL blocked by SSRF protection".into(),
      data: None,
    },
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn maps_domain_errors_to_v0275_apollo_extensions() {
    let quota_err = DomainError::QuotaExceeded {
      kind: "seat_limit",
      message: "seat limit exceeded".into(),
    };
    let gql_err = domain_error_to_graphql(&quota_err);
    let ext = gql_err.extensions.expect("extensions present");
    assert_eq!(ext.get("status"), Some(&Value::from(402)));
    assert_eq!(ext.get("code"), Some(&Value::from("Payment Required")));
    assert_eq!(ext.get("type"), Some(&Value::from("QUOTA_EXCEEDED")));
    assert_eq!(ext.get("name"), Some(&Value::from("MEMBER_QUOTA_EXCEEDED")));

    let doc_denied = domain_error_to_envelope(&DomainError::Forbidden("doc_action_denied:ws1:doc1:Doc.Read".into()));
    assert_eq!(doc_denied.status, 403);
    assert_eq!(doc_denied.error_type, "NO_PERMISSION");
    assert_eq!(doc_denied.name, "DOC_ACTION_DENIED");
    assert_eq!(
      doc_denied.message,
      "You do not have permission to perform Doc.Read action on doc doc1."
    );
    assert_eq!(
      doc_denied.data,
      Some(serde_json::json!({ "spaceId": "ws1", "docId": "doc1", "action": "Doc.Read" }))
    );

    let hist_missing = domain_error_to_envelope(&DomainError::NotFound(
      "doc_history_not_found:ws1:doc1:1700000000000".into(),
    ));
    assert_eq!(hist_missing.status, 404);
    assert_eq!(hist_missing.name, "DOC_HISTORY_NOT_FOUND");
    assert_eq!(
      hist_missing.message,
      "History of doc1 at 1700000000000 under Space ws1."
    );
    assert_eq!(
      hist_missing.data,
      Some(serde_json::json!({ "spaceId": "ws1", "docId": "doc1", "timestamp": 1700000000000_i64 }))
    );

    let mention_self = domain_error_to_envelope(&DomainError::Validation("mention_user_oneself_denied".into()));
    assert_eq!(mention_self.status, 403);
    assert_eq!(mention_self.error_type, "ACTION_FORBIDDEN");
    assert_eq!(mention_self.message, "You can not mention yourself.");

    let internal = DomainError::Internal("secret db stacktrace".into());
    let env = domain_error_to_envelope(&internal);
    assert_eq!(env.status, 500);
    assert_eq!(env.code, "Internal Server Error");
    assert_eq!(env.message, "An internal error occurred.");
    assert!(!env.message.contains("secret"));

    let ssrf_env = safe_fetch_error_to_envelope(&server_domain::safe_fetch::SafeFetchError::BlockedIp {
      host: "internal.corp".into(),
      ip: "10.0.0.42".parse().unwrap(),
    });
    assert_eq!(ssrf_env.status, 400);
    assert_eq!(ssrf_env.error_type, "INVALID_INPUT");
    assert_eq!(ssrf_env.name, "SSRF_BLOCKED_ERROR");
    assert_eq!(ssrf_env.message, "URL resolves to a private or reserved IP address");
    assert!(!ssrf_env.message.contains("10.0.0.42"));
    assert_eq!(ssrf_env.data, Some(serde_json::json!({ "reason": "blocked_ip" })));

    let large_env = safe_fetch_error_to_envelope(&server_domain::safe_fetch::SafeFetchError::ResponseTooLarge {
      limit_bytes: 1024,
      received_bytes: 2048,
    });
    assert_eq!(large_env.status, 400);
    assert_eq!(large_env.error_type, "INVALID_INPUT");
    assert_eq!(large_env.name, "RESPONSE_TOO_LARGE_ERROR");
    assert_eq!(
      large_env.message,
      "Response too large (2048 bytes), limit is 1024 bytes"
    );
    assert_eq!(
      large_env.data,
      Some(serde_json::json!({ "limitBytes": 1024, "receivedBytes": 2048 }))
    );

    let copilot_quota = domain_error_to_envelope(&DomainError::QuotaExceeded {
      kind: "copilot_quota",
      message: "limit".into(),
    });
    assert_eq!(copilot_quota.status, 402);
    assert_eq!(copilot_quota.name, "COPILOT_QUOTA_EXCEEDED");
    assert!(copilot_quota.data.is_none());

    let copilot_msg = domain_error_to_envelope(&DomainError::NotFound("copilot_message_not_found:m-42".into()));
    assert_eq!(copilot_msg.status, 404);
    assert_eq!(copilot_msg.name, "COPILOT_MESSAGE_NOT_FOUND");
    assert_eq!(copilot_msg.data, Some(serde_json::json!({ "messageId": "m-42" })));

    let unsplash = domain_error_to_envelope(&DomainError::Internal("unsplash_is_not_configured".into()));
    assert_eq!(unsplash.status, 500);
    assert_eq!(unsplash.name, "UNSPLASH_IS_NOT_CONFIGURED");
  }
}
