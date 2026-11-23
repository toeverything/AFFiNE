//! Async SMTP delivery matching the `v0.27.5` `MailSender`
//! (`packages/backend/server/src/core/mail/sender.ts`) and its `nodemailer`
//! transport options:
//! - port 465 uses implicit TLS, every other port upgrades with STARTTLS when
//!   the server offers it and stays plaintext otherwise (`secure` unset);
//! - `ignoreTLS` is the reference `tls.rejectUnauthorized = !ignoreTLS`, i.e. it
//!   accepts invalid certificates, it does not disable TLS;
//! - credentials are sent only when a username or password is configured;
//! - the HELO name is the normalized `name`, else the system hostname;
//! - every mail is one `text/html` quoted-printable part, so the HTML a
//!   receiving MIME parser decodes is the rendered HTML plus the final CRLF,
//!   exactly as for the reference.

use std::{str::FromStr, time::Duration};

use lettre::{
  AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
  message::{Mailbox, SinglePart, header::ContentTransferEncoding},
  transport::smtp::{
    authentication::Credentials,
    client::{Tls, TlsParameters},
    extension::ClientId,
  },
};
use serde::{Deserialize, Serialize};

use crate::RenderedMail;

/// Reference connection, greeting and socket timeout.
pub const DEFAULT_SMTP_TIMEOUT: Duration = Duration::from_secs(30);

/// `AppConfig['mailer']['SMTP']`, as stored in `app_configs` and passed to
/// `sendTestEmail`.
#[derive(Clone, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SmtpConfig {
  pub name: String,
  pub host: String,
  pub port: u16,
  pub username: String,
  pub password: String,
  #[serde(rename = "ignoreTLS")]
  pub ignore_tls: bool,
  pub sender: String,
}

impl std::fmt::Debug for SmtpConfig {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("SmtpConfig")
      .field("name", &self.name)
      .field("host", &self.host)
      .field("port", &self.port)
      .field("username", &self.username)
      .field("password", &"[REDACTED]")
      .field("ignore_tls", &self.ignore_tls)
      .field("sender", &self.sender)
      .finish()
  }
}

#[derive(Debug, thiserror::Error)]
pub enum SmtpError {
  #[error("SMTP host is not configured")]
  NotConfigured,
  #[error("invalid sender `{sender}`: {message}")]
  InvalidSender { sender: String, message: String },
  #[error("invalid recipient `{0}`")]
  InvalidRecipient(String),
  #[error("failed to build mail: {0}")]
  Message(#[from] lettre::error::Error),
  #[error("SMTP transport error: {0}")]
  Transport(#[from] lettre::transport::smtp::Error),
}

/// Outcome of one delivery attempt, mirroring the reference `MailSendResult`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MailSendResult {
  Accepted {
    message_id: String,
    provider_response: String,
  },
  Rejected {
    provider_response: Option<String>,
    error_code: &'static str,
  },
  Failed {
    retryable: bool,
    error_code: &'static str,
    error: String,
  },
}

/// Reference `normalizeSMTPHeloHostname`: trims, drops one trailing dot and
/// accepts an address literal (`[1.2.3.4]`, `[IPv6:...]`) or an RFC 1123
/// hostname of at most 253 bytes with 1–63 byte `[A-Za-z0-9-]` labels that do
/// not start or end with `-`.
pub fn normalize_helo_hostname(hostname: &str) -> Option<String> {
  let trimmed = hostname.trim();
  let normalized = trimmed.strip_suffix('.').unwrap_or(trimmed);
  if normalized.is_empty() {
    return None;
  }
  if let Some(literal) = normalized.strip_prefix('[').and_then(|rest| rest.strip_suffix(']')) {
    let valid = !literal.is_empty()
      && !literal.contains(' ')
      && (literal.parse::<std::net::Ipv4Addr>().is_ok()
        || literal
          .strip_prefix("IPv6:")
          .is_some_and(|v6| v6.parse::<std::net::Ipv6Addr>().is_ok()));
    return valid.then(|| normalized.to_owned());
  }
  if normalized.len() > 253 {
    return None;
  }
  let labels_valid = normalized.split('.').all(|label| {
    !label.is_empty()
      && label.len() <= 63
      && label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
      && !label.starts_with('-')
      && !label.ends_with('-')
  });
  labels_valid.then(|| normalized.to_owned())
}

/// One configured SMTP transport and its sender mailbox.
#[derive(Clone)]
pub struct SmtpMailer {
  transport: AsyncSmtpTransport<Tokio1Executor>,
  sender: Mailbox,
}

impl SmtpMailer {
  pub fn new(config: &SmtpConfig) -> Result<Self, SmtpError> {
    Self::with_timeout(config, DEFAULT_SMTP_TIMEOUT)
  }

  pub fn with_timeout(config: &SmtpConfig, timeout: Duration) -> Result<Self, SmtpError> {
    if config.host.is_empty() {
      return Err(SmtpError::NotConfigured);
    }
    let sender = Mailbox::from_str(config.sender.trim()).map_err(|err| SmtpError::InvalidSender {
      sender: config.sender.clone(),
      message: err.to_string(),
    })?;
    let tls_parameters = TlsParameters::builder(config.host.clone())
      .dangerous_accept_invalid_certs(config.ignore_tls)
      .build_rustls()?;
    let tls = if config.port == 465 {
      Tls::Wrapper(tls_parameters)
    } else {
      Tls::Opportunistic(tls_parameters)
    };
    let hello_name = normalize_helo_hostname(&config.name)
      .map(ClientId::Domain)
      .unwrap_or_default();
    let mut builder = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(config.host.clone())
      .port(config.port)
      .tls(tls)
      .hello_name(hello_name)
      .timeout(Some(timeout));
    if !config.username.is_empty() || !config.password.is_empty() {
      builder = builder.credentials(Credentials::new(config.username.clone(), config.password.clone()));
    }
    Ok(Self {
      transport: builder.build(),
      sender,
    })
  }

  /// Opens a connection and greets the server (reference `transport.verify()`).
  pub async fn verify(&self) -> Result<bool, SmtpError> {
    Ok(self.transport.test_connection().await?)
  }

  /// Builds the single-part HTML message the reference `sendMail` produces
  /// along with its RFC 5322 `Message-ID` header value.
  pub fn build_message_with_id(&self, to: &str, mail: &RenderedMail) -> Result<(Message, String), SmtpError> {
    let recipient = Mailbox::from_str(to).map_err(|_| SmtpError::InvalidRecipient(to.to_owned()))?;
    let domain = self.sender.email.domain();
    let message_id = format!("<{}@{}>", uuid::Uuid::new_v4(), domain);
    let part = SinglePart::builder()
      .header(lettre::message::header::ContentType::TEXT_HTML)
      .header(ContentTransferEncoding::QuotedPrintable)
      .body(mail.html.clone());
    let msg = Message::builder()
      .from(self.sender.clone())
      .to(recipient)
      .subject(mail.subject.clone())
      .message_id(Some(message_id.clone()))
      .singlepart(part)?;
    Ok((msg, message_id))
  }

  /// Builds the single-part HTML message the reference `sendMail` produces.
  pub fn build_message(&self, to: &str, mail: &RenderedMail) -> Result<Message, SmtpError> {
    self.build_message_with_id(to, mail).map(|(msg, _)| msg)
  }

  /// Sends one mail and classifies the outcome like `MailSender.send`.
  pub async fn send(&self, to: &str, mail: &RenderedMail) -> MailSendResult {
    let mut parts = to.split('@');
    let domain_ok = parts.next().is_some() && parts.next().is_some_and(|domain| !domain.is_empty());
    if !domain_ok || parts.next().is_some() {
      return MailSendResult::Rejected {
        provider_response: None,
        error_code: "invalid_recipient",
      };
    }
    let (message, message_id) = match self.build_message_with_id(to, mail) {
      Ok(pair) => pair,
      Err(_) => {
        return MailSendResult::Rejected {
          provider_response: None,
          error_code: "invalid_recipient",
        };
      }
    };
    match self.transport.send(message).await {
      Ok(response) => MailSendResult::Accepted {
        message_id,
        provider_response: format!(
          "{} {}",
          response.code(),
          response.message().collect::<Vec<_>>().join(" ")
        ),
      },
      Err(err) if err.is_permanent() => MailSendResult::Rejected {
        provider_response: Some(err.to_string()),
        error_code: "provider_rejected",
      },
      Err(err) => MailSendResult::Failed {
        retryable: true,
        error_code: "transport_failed",
        error: err.to_string(),
      },
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn helo_hostname_normalization_matches_reference() {
    for (input, expected) in [
      ("", None),
      ("   ", None),
      ("mail.example.com", Some("mail.example.com")),
      (" mail.example.com. ", Some("mail.example.com")),
      ("[127.0.0.1]", Some("[127.0.0.1]")),
      ("[IPv6:::1]", Some("[IPv6:::1]")),
      ("[::1]", None),
      ("[300.0.0.1]", None),
      ("-bad.example.com", None),
      ("bad-.example.com", None),
      ("a..b", None),
      ("under_score.example", None),
    ] {
      assert_eq!(normalize_helo_hostname(input).as_deref(), expected, "{input:?}");
    }
    assert!(normalize_helo_hostname(&format!("{}.com", "a".repeat(64))).is_none());
  }

  #[test]
  fn smtp_config_reads_reference_json_redacts_debug_and_rejects_bad_senders() {
    let config: SmtpConfig = serde_json::from_value(serde_json::json!({
      "host": "127.0.0.1",
      "port": 2525,
      "ignoreTLS": true,
      "sender": "AFFiNE Parity <noreply@affine.test>",
    }))
    .unwrap();
    assert!(config.ignore_tls);
    assert_eq!(config.username, "");
    let with_password = SmtpConfig {
      password: "smtp-password-value".into(),
      ..config.clone()
    };
    let debug = format!("{with_password:?}");
    assert!(
      debug.contains("[REDACTED]") && !debug.contains("smtp-password-value"),
      "{debug}"
    );
    let mailer = SmtpMailer::new(&config).unwrap();
    assert_eq!(mailer.sender.email.to_string(), "noreply@affine.test");
    assert_eq!(mailer.sender.name.as_deref(), Some("AFFiNE Parity"));

    for (host, sender) in [("", "noreply@affine.test"), ("127.0.0.1", "not an address")] {
      let config = SmtpConfig {
        host: host.into(),
        port: 25,
        sender: sender.into(),
        ..SmtpConfig::default()
      };
      assert!(SmtpMailer::new(&config).is_err(), "{host:?} {sender:?}");
    }
  }
}
