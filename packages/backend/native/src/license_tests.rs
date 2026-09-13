use std::{
  collections::VecDeque,
  sync::{Arc, Mutex, OnceLock},
};

use safefetch::{SafeFetchRequest, SafeFetchResponse};

use super::*;

#[derive(Default)]
struct Exchange {
  responses: VecDeque<SafeFetchResponse>,
  requests: Vec<SafeFetchRequest>,
}

static EXCHANGES: OnceLock<Mutex<HashMap<String, Arc<Mutex<Exchange>>>>> = OnceLock::new();

pub(crate) struct LicenseServer {
  key: String,
  exchange: Arc<Mutex<Exchange>>,
}

impl LicenseServer {
  pub(crate) fn new(key: &str) -> Self {
    let exchange = Arc::new(Mutex::new(Exchange::default()));
    EXCHANGES
      .get_or_init(Default::default)
      .lock()
      .unwrap()
      .insert(key.to_string(), exchange.clone());
    Self {
      key: key.to_string(),
      exchange,
    }
  }

  pub(crate) fn push(&self, status: u16, body: Vec<u8>, validate_key: &str) {
    self.exchange.lock().unwrap().responses.push_back(SafeFetchResponse {
      status,
      final_url: AFFINE_PRO_ENDPOINT.to_string(),
      headers: HashMap::from([
        ("x-next-validate-key".into(), validate_key.into()),
        ("x-license-recurring".into(), "monthly".into()),
      ]),
      body,
    });
  }

  pub(crate) fn requests(&self) -> Vec<SafeFetchRequest> {
    self.exchange.lock().unwrap().requests.clone()
  }
}

impl Drop for LicenseServer {
  fn drop(&mut self) {
    EXCHANGES.get().unwrap().lock().unwrap().remove(&self.key);
  }
}

pub(super) fn respond(request: SafeFetchRequest) -> AnyResult<SafeFetchResponse> {
  let url = Url::parse(&request.url)?;
  let key = url
    .path()
    .strip_prefix("/api/team/v1/licenses/")
    .and_then(|path| path.split('/').next())
    .context("unexpected license protocol")?;
  let exchange = EXCHANGES
    .get_or_init(Default::default)
    .lock()
    .unwrap()
    .get(key)
    .cloned()
    .context("license network is not configured in this test")?;
  let mut exchange = exchange.lock().unwrap();
  exchange.requests.push(request);
  exchange
    .responses
    .pop_front()
    .context("license response is not configured in this test")
}

#[test]
fn signed_protocol_serializes_requests_and_classifies_responses() {
  let key = "license-transport-test";
  let generation = uuid::Uuid::new_v4().to_string();
  let server = LicenseServer::new(key);
  let envelope = br#"{"claims":{},"signature":"opaque-signature"}"#.to_vec();
  server.push(200, envelope.clone(), &generation);
  let response = check_license_health_request(&LicenseHealthRequest {
    license_key: key.into(),
    workspace_id: "workspace".into(),
    validate_key: generation.clone(),
  })
  .unwrap();
  assert_eq!(response.license.unwrap().envelope.as_ref(), envelope.as_slice());
  let request = &server.requests()[0];
  assert_eq!(
    request.url,
    format!("{AFFINE_PRO_ENDPOINT}/api/team/v1/licenses/{key}/health")
  );
  assert!(matches!(request.method, Some(safefetch::SafeFetchMethod::Post)));
  assert_eq!(
    serde_json::from_slice::<serde_json::Value>(request.body.as_ref().unwrap()).unwrap(),
    serde_json::json!({"workspaceId":"workspace"})
  );
  assert_eq!(request.headers.as_ref().unwrap()["x-validate-key"], generation);

  for endpoint in ["recurring", "seats", "create-customer-portal", "deactivate"] {
    server.push(
      200,
      br#"{"url":"https://billing.example/portal"}"#.to_vec(),
      &generation,
    );
    match endpoint {
      "recurring" => {
        update_license_recurring_request(&LicenseRecurringRequest {
          license_key: key.into(),
          validate_key: generation.clone(),
          recurring: "yearly".into(),
        })
        .unwrap();
      }
      "seats" => {
        update_license_seats_request(&LicenseSeatsRequest {
          license_key: key.into(),
          validate_key: generation.clone(),
          seats: 12,
        })
        .unwrap();
      }
      "create-customer-portal" => {
        create_license_customer_portal_request(&LicenseKeyRequest {
          license_key: key.into(),
          validate_key: Some(generation.clone()),
          workspace_id: None,
        })
        .unwrap();
      }
      _ => {
        deactivate_license_request(&LicenseKeyRequest {
          license_key: key.into(),
          validate_key: Some(generation.clone()),
          workspace_id: None,
        })
        .unwrap();
      }
    }
    let requests = server.requests();
    let request = requests.last().unwrap();
    assert!(request.url.ends_with(&format!("/{endpoint}")));
    assert_eq!(request.headers.as_ref().unwrap()["x-validate-key"], generation);
  }
  for (status, body, expected) in [
    (200, br#"{"plan":"selfhostedteam","quantity":10}"#.as_slice(), 500),
    (200, b"invalid JSON".as_slice(), 500),
    (429, br#"{"name":"rate_limited"}"#.as_slice(), 429),
    (503, b"unavailable".as_slice(), 500),
  ] {
    server.push(status, body.to_vec(), &generation);
    let response = check_license_health_request(&LicenseHealthRequest {
      license_key: key.into(),
      workspace_id: "workspace".into(),
      validate_key: generation.clone(),
    })
    .unwrap();
    assert_eq!(response.error.unwrap().status, expected);
    assert!(response.license.is_none());
  }
}
