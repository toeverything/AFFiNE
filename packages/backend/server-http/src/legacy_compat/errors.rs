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
      let (name, message) = match msg.as_str() {
        "doc_not_found" => ("DOC_NOT_FOUND", "Doc not found."),
        "doc_history_not_found" => ("DOC_HISTORY_NOT_FOUND", "Doc history not found."),
        "comment_not_found" => ("COMMENT_NOT_FOUND", "Comment not found."),
        "reply_not_found" => ("REPLY_NOT_FOUND", "Reply not found."),
        "license_not_found" => ("LICENSE_NOT_FOUND", "License not found."),
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
    DomainError::Conflict(msg) => LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "RESOURCE_ALREADY_EXISTS".into(),
      name: "RESOURCE_ALREADY_EXISTS".into(),
      message: msg.clone(),
      data: None,
    },
    DomainError::QuotaExceeded { kind, message } => LegacyErrorEnvelope {
      status: StatusCode::PAYMENT_REQUIRED.as_u16(),
      code: "Payment Required".into(),
      error_type: "QUOTA_EXCEEDED".into(),
      name: "QUOTA_EXCEEDED".into(),
      message: message.clone(),
      data: Some(serde_json::json!({ "kind": kind })),
    },
    DomainError::Validation(msg) => {
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
    DomainError::Internal(_) => LegacyErrorEnvelope {
      status: StatusCode::INTERNAL_SERVER_ERROR.as_u16(),
      code: "Internal Server Error".into(),
      error_type: "INTERNAL_SERVER_ERROR".into(),
      name: "INTERNAL_SERVER_ERROR".into(),
      // Never leak internal error details to clients (matches v0.27.5 def.ts:248-251).
      message: "An internal error occurred.".into(),
      data: None,
    },
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
    assert_eq!(ext.get("name"), Some(&Value::from("QUOTA_EXCEEDED")));

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
  }
}
