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
    DomainError::Forbidden(msg) => LegacyErrorEnvelope {
      status: StatusCode::FORBIDDEN.as_u16(),
      code: "Forbidden".into(),
      error_type: "ACTION_FORBIDDEN".into(),
      name: "ACTION_FORBIDDEN".into(),
      message: msg.clone(),
      data: None,
    },
    DomainError::NotFound(msg) => LegacyErrorEnvelope {
      status: StatusCode::NOT_FOUND.as_u16(),
      code: "Not Found".into(),
      error_type: "RESOURCE_NOT_FOUND".into(),
      name: "RESOURCE_NOT_FOUND".into(),
      message: msg.clone(),
      data: None,
    },
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
    DomainError::Validation(msg) => LegacyErrorEnvelope {
      status: StatusCode::BAD_REQUEST.as_u16(),
      code: "Bad Request".into(),
      error_type: "INVALID_INPUT".into(),
      name: "INVALID_INPUT".into(),
      message: msg.clone(),
      data: None,
    },
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
      name: "TOO_MANY_REQUESTS".into(),
      message: msg.clone(),
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
      // Never leak internal error details to clients (matches v0.27.5 def.ts).
      message: "Internal server error".into(),
      data: None,
    },
  }
}

/// Converts a canonical [`DomainError`] into an `async_graphql::Error` with
/// `extensions.{status, code, type, name, message, data}`.
pub fn domain_error_to_graphql(err: &DomainError) -> async_graphql::Error {
  let envelope = domain_error_to_envelope(err);
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

    let internal = DomainError::Internal("secret db stacktrace".into());
    let env = domain_error_to_envelope(&internal);
    assert_eq!(env.status, 500);
    assert_eq!(env.code, "Internal Server Error");
    assert!(!env.message.contains("secret"));
  }
}
