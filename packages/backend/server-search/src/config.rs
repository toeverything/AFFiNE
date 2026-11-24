use std::time::Duration;

#[derive(Clone, Eq, PartialEq)]
pub struct SearchConfig {
  pub enabled: bool,
  pub provider: String,
  pub endpoint: String,
  pub api_key: String,
  pub username: String,
  pub password: String,
  pub worker_poll_interval: Duration,
  pub worker_batch_limit: i32,
}

impl Default for SearchConfig {
  fn default() -> Self {
    Self {
      enabled: false,
      provider: "embedded".to_owned(),
      endpoint: String::new(),
      api_key: String::new(),
      username: String::new(),
      password: String::new(),
      worker_poll_interval: Duration::from_secs(1),
      worker_batch_limit: 50,
    }
  }
}

impl std::fmt::Debug for SearchConfig {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    f.debug_struct("SearchConfig")
      .field("enabled", &self.enabled)
      .field("provider", &self.provider)
      .field("endpoint", &self.endpoint)
      .field("api_key", &if self.api_key.is_empty() { "" } else { "[REDACTED]" })
      .field("username", &self.username)
      .field("password", &if self.password.is_empty() { "" } else { "[REDACTED]" })
      .field("worker_poll_interval", &self.worker_poll_interval)
      .field("worker_batch_limit", &self.worker_batch_limit)
      .finish()
  }
}
