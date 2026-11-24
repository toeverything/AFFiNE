//! Calendar OAuth state storage backed by `SessionRedis`.
//!
//! Uses Redis key `CALENDAR_OAUTH_STATE:<UUID>` with a 3-hour TTL in
//! `session_redis_db_index`, matching `v0.27.5` `plugins/calendar/oauth.ts`.
use super::CalendarProviderName;
use serde::{Deserialize, Serialize};
use server_types::DomainError;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use uuid::Uuid;
pub const CALENDAR_OAUTH_STATE_PREFIX: &str = "CALENDAR_OAUTH_STATE";
pub const CALENDAR_OAUTH_STATE_TTL_MS: u64 = 3 * 3600 * 1000;
const REDIS_CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarOAuthState {
  pub provider: CalendarProviderName,
  pub user_id: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub redirect_uri: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub token: Option<String>,
}
/// Validates that a state string is 36 UTF-16 code units long,
/// matching `v0.27.5` `plugins/calendar/oauth.ts:21`.
pub fn is_valid_oauth_state(state: &str) -> bool {
  state.encode_utf16().count() == 36
}
/// SessionRedis-backed store for short-lived calendar OAuth state entries.
#[derive(Clone)]
pub struct CalendarOAuthStore {
  client: Option<redis::Client>,
  conn: Arc<Mutex<Option<redis::aio::MultiplexedConnection>>>,
}
impl CalendarOAuthStore {
  /// Creates a store targeting `session_redis_db_index` on the given Redis client.
  pub fn new(base_client: Option<redis::Client>, session_redis_db_index: u8) -> Result<Self, DomainError> {
    let client = match base_client {
      Some(base) => {
        let mut info = base.get_connection_info().clone();
        info.redis.db = i64::from(session_redis_db_index);
        Some(
          redis::Client::open(info)
            .map_err(|err| DomainError::Internal(format!("open session redis client: {err}")))?,
        )
      }
      None => None,
    };
    Ok(Self {
      client,
      conn: Arc::new(Mutex::new(None)),
    })
  }
  fn redis_key(token: &str) -> String {
    format!("{CALENDAR_OAUTH_STATE_PREFIX}:{token}")
  }
  async fn connection(&self) -> Result<redis::aio::MultiplexedConnection, DomainError> {
    if let Some(existing) = self.conn.lock().await.clone() {
      return Ok(existing);
    }
    let client = self
      .client
      .as_ref()
      .ok_or_else(|| DomainError::Unavailable("session redis is not configured".to_owned()))?;
    let fresh = tokio::time::timeout(REDIS_CONNECT_TIMEOUT, client.get_multiplexed_async_connection())
      .await
      .map_err(|_| DomainError::Unavailable("connect session redis timed out".to_owned()))?
      .map_err(|err| DomainError::Unavailable(format!("connect session redis: {err}")))?;
    *self.conn.lock().await = Some(fresh.clone());
    Ok(fresh)
  }
  async fn reset_connection(&self) {
    *self.conn.lock().await = None;
  }
  /// Persists a new OAuth state entry and returns its UUID token.
  pub async fn save_oauth_state(&self, mut state: CalendarOAuthState) -> Result<String, DomainError> {
    let token = Uuid::new_v4().to_string();
    state.token = Some(token.clone());
    let serialized = serde_json::to_string(&state)
      .map_err(|err| DomainError::Internal(format!("serialize calendar oauth state: {err}")))?;
    let mut conn = self.connection().await?;
    let key = Self::redis_key(&token);
    if let Err(err) = redis::cmd("SET")
      .arg(&key)
      .arg(&serialized)
      .arg("PX")
      .arg(CALENDAR_OAUTH_STATE_TTL_MS)
      .query_async::<String>(&mut conn)
      .await
    {
      self.reset_connection().await;
      return Err(DomainError::Unavailable(format!("write calendar oauth state: {err}")));
    }
    Ok(token)
  }
  /// Reads an OAuth state entry without deleting it.
  pub async fn get_oauth_state(&self, token: &str) -> Result<Option<CalendarOAuthState>, DomainError> {
    let mut conn = self.connection().await?;
    let key = Self::redis_key(token);
    let raw: Option<String> = match redis::cmd("GET").arg(&key).query_async(&mut conn).await {
      Ok(v) => v,
      Err(err) => {
        self.reset_connection().await;
        return Err(DomainError::Unavailable(format!("read calendar oauth state: {err}")));
      }
    };
    match raw {
      Some(value) => serde_json::from_str(&value)
        .map(Some)
        .map_err(|err| DomainError::Internal(format!("decode calendar oauth state: {err}"))),
      None => Ok(None),
    }
  }
  /// Deletes an OAuth state entry after successful callback redemption.
  pub async fn delete_oauth_state(&self, token: &str) -> Result<(), DomainError> {
    let mut conn = self.connection().await?;
    let key = Self::redis_key(token);
    if let Err(err) = redis::cmd("DEL").arg(&key).query_async::<i64>(&mut conn).await {
      self.reset_connection().await;
      return Err(DomainError::Unavailable(format!("delete calendar oauth state: {err}")));
    }
    Ok(())
  }
  /// Atomically reads and deletes an OAuth state entry so each callback state
  /// can be redeemed at most once.
  pub async fn consume_oauth_state(&self, token: &str) -> Result<Option<CalendarOAuthState>, DomainError> {
    const GET_AND_DEL_LUA: &str = r#"
local value = redis.call("GET", KEYS[1])
if value then
  redis.call("DEL", KEYS[1])
end
return value
"#;
    let mut conn = self.connection().await?;
    let key = Self::redis_key(token);
    let raw: Option<String> = match redis::Script::new(GET_AND_DEL_LUA)
      .key(&key)
      .invoke_async(&mut conn)
      .await
    {
      Ok(v) => v,
      Err(err) => {
        self.reset_connection().await;
        return Err(DomainError::Unavailable(format!("consume calendar oauth state: {err}")));
      }
    };
    match raw {
      Some(value) => serde_json::from_str(&value)
        .map(Some)
        .map_err(|err| DomainError::Internal(format!("decode calendar oauth state: {err}"))),
      None => Ok(None),
    }
  }
}
