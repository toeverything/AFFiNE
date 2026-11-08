use napi::Result;

use super::{AppConfigChange, BackendRuntime, napi_error, save_app_config_changes, to_napi_error};

#[napi_derive::napi(object)]
pub struct AppConfigCommand {
  pub key: String,
  pub owner: String,
  pub operation: String,
  pub value_json: Option<String>,
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn save_app_config(&self, actor: Option<String>, commands: Vec<AppConfigCommand>) -> Result<Vec<String>> {
    let changes = commands
      .into_iter()
      .map(|command| {
        let native = match command.owner.as_str() {
          "native" => true,
          "node" => false,
          _ => return Err(napi_error("app config owner must be native or node")),
        };
        let value = match command.operation.as_str() {
          "set" => Some(
            serde_json::from_str(
              command
                .value_json
                .as_deref()
                .ok_or_else(|| napi_error("app config set requires a value"))?,
            )
            .map_err(|_| napi_error("invalid app config JSON value"))?,
          ),
          "clear" if command.value_json.is_none() => None,
          "clear" => return Err(napi_error("app config clear must not include a value")),
          _ => return Err(napi_error("app config operation must be set or clear")),
        };
        Ok(AppConfigChange {
          key: command.key,
          value,
          native,
        })
      })
      .collect::<Result<Vec<_>>>()?;
    save_app_config_changes(
      &self.pool().await.map_err(to_napi_error)?,
      &self.server_config,
      self.bootstrap_private_key.as_ref().map(|key| key.to_string()),
      actor.as_deref(),
      &changes,
    )
    .await
    .map_err(to_napi_error)
  }
}
