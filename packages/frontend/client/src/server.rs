//! Multi-server registry (official cloud + self-hosted) enforcing iron rule `F3`.

use std::collections::BTreeMap;

use affine_legacy_import::{LegacyLocalStorageSnapshot, LegacyServerMetadata};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ClientError, ClientResult, host::HostKind};

/// Built-in official AFFiNE Cloud server identifier matching `BUILD_IN_SERVERS`.
pub const DEFAULT_CLOUD_SERVER_ID: &str = "affine-cloud";

/// Registered server entry managed by [`ServerRegistry`].
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerEntry {
    pub id: String,
    pub base_url: String,
    pub is_self_hosted: bool,
    pub built_in: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
}

/// Device-neutral server registry enforcing `F3` (no cross-origin self-hosted server addition on Web).
#[derive(Clone, Debug)]
pub struct ServerRegistry {
    host_kind: HostKind,
    servers: Vec<ServerEntry>,
}

impl ServerRegistry {
    /// Create a registry seeded with the built-in official server.
    pub fn new(host_kind: HostKind, official_base_url: impl Into<String>) -> Self {
        let base_url = normalize_base_url(&official_base_url.into());
        Self {
            host_kind,
            servers: vec![ServerEntry {
                id: DEFAULT_CLOUD_SERVER_ID.to_string(),
                base_url,
                is_self_hosted: false,
                built_in: true,
                config: None,
            }],
        }
    }

    /// Hydrate self-hosted servers from an imported legacy `localStorage` snapshot.
    ///
    /// On `HostKind::Web`, cross-origin self-hosted entries are ignored in compliance with `F3`.
    pub fn hydrate_from_legacy(&mut self, snapshot: &LegacyLocalStorageSnapshot) {
        if let Some(cloud_cfg) = snapshot.server_configs.get(DEFAULT_CLOUD_SERVER_ID)
            && let Some(cloud) = self
                .servers
                .iter_mut()
                .find(|s| s.id == DEFAULT_CLOUD_SERVER_ID)
        {
            cloud.config = Some(cloud_cfg.clone());
        }
        if !self.can_add_self_hosted() {
            return;
        }
        for meta in &snapshot.server_list {
            let cfg = snapshot.server_configs.get(&meta.id).cloned();
            let _ = self.add_self_hosted_server(&meta.id, &meta.base_url, cfg);
        }
    }

    /// Return `true` only on `HostKind::Native` (`F3`: Web hosts never expose cross-origin server add).
    pub const fn can_add_self_hosted(&self) -> bool {
        matches!(self.host_kind, HostKind::Native)
    }

    pub fn list(&self) -> &[ServerEntry] {
        &self.servers
    }

    pub fn get(&self, server_id: &str) -> Option<&ServerEntry> {
        self.servers.iter().find(|s| s.id == server_id)
    }

    /// Add a self-hosted server on native hosts; returns [`ClientError::SelfHostedForbiddenOnWeb`] on Web.
    pub fn add_self_hosted_server(
        &mut self,
        id: impl Into<String>,
        base_url: &str,
        config: Option<Value>,
    ) -> ClientResult<&ServerEntry> {
        if !self.can_add_self_hosted() {
            return Err(ClientError::SelfHostedForbiddenOnWeb);
        }
        let id = id.into();
        if self.servers.iter().any(|s| s.id == id) {
            return Err(ClientError::DuplicateServerId(id));
        }
        let normalized = normalize_base_url(base_url);
        if !normalized.starts_with("http://") && !normalized.starts_with("https://") {
            return Err(ClientError::InvalidServerUrl(base_url.to_string()));
        }
        if self
            .servers
            .iter()
            .any(|s| s.base_url.eq_ignore_ascii_case(&normalized))
        {
            return Err(ClientError::DuplicateServerUrl(normalized));
        }
        self.servers.push(ServerEntry {
            id,
            base_url: normalized,
            is_self_hosted: true,
            built_in: false,
            config,
        });
        Ok(self.servers.last().expect("pushed entry"))
    }

    /// Remove a user-added self-hosted server; built-in official cloud cannot be removed.
    pub fn remove_server(&mut self, server_id: &str) -> ClientResult<()> {
        let Some(pos) = self.servers.iter().position(|s| s.id == server_id) else {
            return Err(ClientError::ServerNotFound(server_id.to_string()));
        };
        if self.servers[pos].built_in {
            return Err(ClientError::CannotRemoveBuiltInServer);
        }
        self.servers.remove(pos);
        Ok(())
    }

    pub fn update_server_config(&mut self, server_id: &str, config: Value) -> ClientResult<()> {
        let Some(entry) = self.servers.iter_mut().find(|s| s.id == server_id) else {
            return Err(ClientError::ServerNotFound(server_id.to_string()));
        };
        entry.config = Some(config);
        Ok(())
    }

    /// Export non-built-in self-hosted servers and configs for rollback writeback.
    pub fn export_legacy_servers(&self) -> (Vec<LegacyServerMetadata>, BTreeMap<String, Value>) {
        let mut list = Vec::new();
        let mut configs = BTreeMap::new();
        for server in &self.servers {
            if !server.built_in {
                list.push(LegacyServerMetadata {
                    id: server.id.clone(),
                    base_url: server.base_url.clone(),
                });
            }
            if let Some(ref cfg) = server.config {
                configs.insert(server.id.clone(), cfg.clone());
            }
        }
        (list, configs)
    }
}

fn normalize_base_url(raw: &str) -> String {
    raw.trim().trim_end_matches('/').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f3_web_host_forbids_adding_cross_origin_self_hosted_servers() {
        let mut web = ServerRegistry::new(HostKind::Web, "https://app.affine.pro");
        assert!(!web.can_add_self_hosted());
        assert_eq!(
            web.add_self_hosted_server("self-1", "https://notes.example.com", None),
            Err(ClientError::SelfHostedForbiddenOnWeb)
        );
        assert_eq!(web.list().len(), 1);

        let mut native = ServerRegistry::new(HostKind::Native, "https://app.affine.pro/");
        assert!(native.can_add_self_hosted());
        let added = native
            .add_self_hosted_server("self-1", "https://notes.example.com/", None)
            .unwrap();
        assert_eq!(added.base_url, "https://notes.example.com");
        assert_eq!(
            native.add_self_hosted_server("self-1", "https://other.example.com", None),
            Err(ClientError::DuplicateServerId("self-1".into()))
        );
        assert_eq!(
            native.add_self_hosted_server("self-2", "https://notes.example.com", None),
            Err(ClientError::DuplicateServerUrl(
                "https://notes.example.com".into()
            ))
        );
        assert_eq!(
            native.remove_server(DEFAULT_CLOUD_SERVER_ID),
            Err(ClientError::CannotRemoveBuiltInServer)
        );
        native.remove_server("self-1").unwrap();
        assert_eq!(native.list().len(), 1);
    }
}
