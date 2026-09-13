use std::convert::TryFrom;

use affine_common::hashcash::Stamp;
use affine_core::auth::{AuthChallengePurpose, CAPTCHA_CHALLENGE_TTL_SECONDS, turnstile_allowed};
use serde::{Deserialize, Serialize};

use super::{
  Result, RuntimeError,
  dto::{RuntimeStateInsertPayload, RuntimeStateRows},
};

const PURPOSE: &str = AuthChallengePurpose::Captcha.as_str();
const TURNSTILE_SITEVERIFY_URL: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

#[napi_derive::napi(object)]
pub struct CaptchaChallenge {
  pub challenge: String,
  pub resource: String,
}

#[napi_derive::napi(object)]
pub struct CaptchaVerificationInput {
  pub provider: String,
  pub token: String,
  pub challenge: Option<String>,
  pub bits: Option<u32>,
  pub secret: Option<String>,
  pub action: Option<String>,
  pub ip: Option<String>,
  pub hosts: Option<Vec<String>>,
  pub dev: Option<bool>,
}

#[derive(Serialize, Deserialize)]
struct ChallengePayload {
  resource: String,
}

#[derive(Deserialize)]
struct TurnstileResponse {
  success: bool,
  hostname: Option<String>,
  action: Option<String>,
}

pub(super) async fn create(pool: sqlx::PgPool) -> Result<CaptchaChallenge> {
  let rows = RuntimeStateRows::new(pool);
  let challenge = uuid::Uuid::new_v4().to_string();
  let resource = uuid::Uuid::new_v4().to_string();
  let payload = serde_json::to_value(ChallengePayload {
    resource: resource.clone(),
  })
  .map_err(|error| RuntimeError::json("encode captcha challenge", error))?;
  let mut tx = rows.begin("create captcha challenge").await?;
  rows
    .insert_payload_returning_expires_in_tx(
      &mut tx,
      RuntimeStateInsertPayload {
        purpose: PURPOSE,
        token: &challenge,
        lookup_key: &challenge,
        payload: &payload,
        ttl_ms: CAPTCHA_CHALLENGE_TTL_SECONDS * 1000,
        context: "create captcha challenge",
      },
    )
    .await?;
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit captcha challenge", error))?;
  Ok(CaptchaChallenge { challenge, resource })
}

pub(super) async fn verify(pool: sqlx::PgPool, input: CaptchaVerificationInput) -> Result<bool> {
  match input.provider.as_str() {
    "hashcash" => verify_hashcash(pool, input).await,
    "turnstile" => verify_turnstile(input).await,
    _ => Err(RuntimeError::invalid_input("invalid captcha provider")),
  }
}

async fn verify_hashcash(pool: sqlx::PgPool, input: CaptchaVerificationInput) -> Result<bool> {
  let challenge = input
    .challenge
    .ok_or_else(|| RuntimeError::invalid_input("captcha challenge is required"))?;
  let bits = input
    .bits
    .ok_or_else(|| RuntimeError::invalid_input("captcha bits are required"))?;
  let rows = RuntimeStateRows::new(pool);
  let mut tx = rows.begin("consume captcha challenge").await?;
  let payload = rows
    .active_payload_with_expires_for_update_in_tx(&mut tx, PURPOSE, &challenge, "load captcha challenge")
    .await?;
  let Some(payload) = payload else {
    tx.rollback()
      .await
      .map_err(|error| RuntimeError::database("rollback missing captcha challenge", error))?;
    return Ok(false);
  };
  let payload: ChallengePayload =
    serde_json::from_value(payload.payload).map_err(|error| RuntimeError::json("decode captcha challenge", error))?;
  if !Stamp::try_from(input.token.as_str()).is_ok_and(|stamp| stamp.check(bits, &payload.resource)) {
    tx.rollback()
      .await
      .map_err(|error| RuntimeError::database("rollback invalid captcha challenge", error))?;
    return Ok(false);
  }
  let consumed = sqlx::query(
    "UPDATE runtime_states SET consumed_at=clock_timestamp() WHERE purpose=$1 AND token_hash=$2 AND consumed_at IS \
     NULL",
  )
  .bind(PURPOSE)
  .bind(super::token_hash(&challenge))
  .execute(&mut *tx)
  .await
  .map_err(|error| RuntimeError::database("consume captcha challenge", error))?
  .rows_affected();
  if consumed != 1 {
    return Err(RuntimeError::invalid_state("captcha challenge generation changed"));
  }
  tx.commit()
    .await
    .map_err(|error| RuntimeError::database("commit captcha challenge consumption", error))?;
  Ok(true)
}

async fn verify_turnstile(input: CaptchaVerificationInput) -> Result<bool> {
  verify_turnstile_at(input, TURNSTILE_SITEVERIFY_URL).await
}

async fn verify_turnstile_at(input: CaptchaVerificationInput, endpoint: &str) -> Result<bool> {
  if input.challenge.is_some() {
    return Err(RuntimeError::invalid_input("unexpected captcha challenge"));
  }
  let secret = input
    .secret
    .ok_or_else(|| RuntimeError::invalid_input("Turnstile secret is required"))?;
  let expected_action = input
    .action
    .ok_or_else(|| RuntimeError::invalid_input("Turnstile action is required"))?;
  let mut form = vec![("secret", secret), ("response", input.token)];
  if let Some(ip) = input.ip {
    form.push(("remoteip", ip));
  }
  form.push(("idempotency_key", uuid::Uuid::new_v4().to_string()));
  let response = reqwest::Client::new()
    .post(endpoint)
    .timeout(std::time::Duration::from_secs(5))
    .form(&form)
    .send()
    .await
    .map_err(|_| RuntimeError::invalid_state("captcha_provider_unavailable"))?;
  if !response.status().is_success() {
    return Err(RuntimeError::invalid_state("captcha_provider_unavailable"));
  }
  let result: TurnstileResponse = response
    .json()
    .await
    .map_err(|_| RuntimeError::invalid_state("captcha_provider_unavailable"))?;
  let hostname_allowed = result.hostname.as_ref().is_some_and(|hostname| {
    input
      .hosts
      .as_ref()
      .is_some_and(|hosts| hosts.iter().any(|allowed| allowed == hostname))
  });
  Ok(turnstile_allowed(
    result.success,
    result.action.as_deref() == Some(expected_action.as_str()),
    hostname_allowed,
    input.dev.unwrap_or(false),
  ))
}

#[cfg(test)]
mod tests {
  use tokio::io::{AsyncReadExt, AsyncWriteExt};

  use super::{CaptchaVerificationInput, verify_turnstile_at};

  #[tokio::test]
  async fn turnstile_siteverify_contract_is_owned_by_native() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/siteverify", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
      let (mut stream, _) = listener.accept().await.unwrap();
      let mut request = vec![0; 16 * 1024];
      let mut read = 0;
      loop {
        let count = stream.read(&mut request[read..]).await.unwrap();
        if count == 0 {
          break;
        }
        read += count;
        let received = &request[..read];
        if let Some(header_end) = received.windows(4).position(|window| window == b"\r\n\r\n") {
          let header_end = header_end + 4;
          let headers = String::from_utf8_lossy(&received[..header_end]);
          let content_length = headers
            .lines()
            .find_map(|line| line.strip_prefix("content-length: "))
            .and_then(|value| value.trim().parse::<usize>().ok())
            .unwrap_or(0);
          if read >= header_end + content_length {
            break;
          }
        }
      }
      let request = String::from_utf8_lossy(&request[..read]).into_owned();
      let body = r#"{"success":true,"hostname":"app.affine.pro","action":"auth-sign-in"}"#;
      let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
      );
      stream.write_all(response.as_bytes()).await.unwrap();
      request
    });
    let allowed = verify_turnstile_at(
      CaptchaVerificationInput {
        provider: "turnstile".into(),
        token: "token".into(),
        challenge: None,
        bits: None,
        secret: Some("secret".into()),
        action: Some("auth-sign-in".into()),
        ip: Some("127.0.0.1".into()),
        hosts: Some(vec!["app.affine.pro".into()]),
        dev: Some(false),
      },
      &endpoint,
    )
    .await
    .unwrap();
    assert!(allowed);
    let request = server.await.unwrap();
    assert!(request.starts_with("POST /siteverify HTTP/1.1"));
    assert!(request.contains("secret=secret"));
    assert!(request.contains("response=token"));
    assert!(request.contains("remoteip=127.0.0.1"));
    assert!(request.contains("idempotency_key="));
  }
}
