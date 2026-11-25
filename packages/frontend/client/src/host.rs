//! Host boundary port (`HostBridge`) decoupling L3 domain logic from platform shells.
//!
//! Native auth I/O (`exchange`/`refresh`/`revoke` and Keychain/Keystore writes and deletes) is
//! owned exclusively by the platform host (`hosts/ios` `LegacyAuthBridge` / `hosts/android`
//! `AuthSessionStore`). `HostBridge` therefore exposes read-only credential access, WebSocket
//! handles, installation ID, local KV, and accessibility announcements.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::ClientResult;

/// Host runtime class governing security and transport policies (such as `F3` and auth mode).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HostKind {
    /// Browser / Web Mobile host (same-origin cookies/CSRF, no cross-origin self-hosted add).
    Web,
    /// Native iOS / Android / Desktop host (Bearer JWT, self-hosted server registry allowed).
    Native,
}

/// Opaque handle to a host-managed WebSocket connection.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct WsHandle(pub u64);

/// Device-neutral host port implemented by Web, iOS, Android, and Desktop shells.
pub trait HostBridge {
    fn host_kind(&self) -> HostKind;

    fn ws_connect(&mut self, url: &str, headers: &[(String, String)]) -> ClientResult<WsHandle>;

    fn ws_send(&mut self, handle: WsHandle, text: &str) -> ClientResult<()>;

    fn ws_close(&mut self, handle: WsHandle) -> ClientResult<()>;

    fn read_credential(&self, key: &str) -> ClientResult<Option<String>>;

    fn installation_id(&self) -> String;

    fn kv_get(&self, key: &str) -> Option<String>;

    fn kv_set(&mut self, key: &str, value: &str);

    fn kv_remove(&mut self, key: &str);

    fn announce_accessibility(&mut self, message: &str);
}

/// Deterministic in-memory [`HostBridge`] for unit tests and headless simulations.
#[derive(Clone, Debug)]
pub struct MemoryHostBridge {
    host_kind: HostKind,
    installation_id: String,
    credentials: BTreeMap<String, String>,
    kv: BTreeMap<String, String>,
    announcements: Vec<String>,
    next_ws: u64,
    ws_messages: BTreeMap<WsHandle, Vec<String>>,
}

impl MemoryHostBridge {
    pub fn new(host_kind: HostKind, installation_id: impl Into<String>) -> Self {
        Self {
            host_kind,
            installation_id: installation_id.into(),
            credentials: BTreeMap::new(),
            kv: BTreeMap::new(),
            announcements: Vec::new(),
            next_ws: 1,
            ws_messages: BTreeMap::new(),
        }
    }

    /// Seed a credential entry in the simulated host vault (simulating host-owned persistence).
    pub fn seed_credential(&mut self, key: impl Into<String>, secret: impl Into<String>) {
        self.credentials.insert(key.into(), secret.into());
    }

    pub fn announcements(&self) -> &[String] {
        &self.announcements
    }

    pub fn ws_sent(&self, handle: WsHandle) -> Option<&[String]> {
        self.ws_messages.get(&handle).map(Vec::as_slice)
    }
}

impl HostBridge for MemoryHostBridge {
    fn host_kind(&self) -> HostKind {
        self.host_kind
    }

    fn ws_connect(&mut self, _url: &str, _headers: &[(String, String)]) -> ClientResult<WsHandle> {
        let handle = WsHandle(self.next_ws);
        self.next_ws = self.next_ws.saturating_add(1);
        self.ws_messages.insert(handle, Vec::new());
        Ok(handle)
    }

    fn ws_send(&mut self, handle: WsHandle, text: &str) -> ClientResult<()> {
        self.ws_messages
            .entry(handle)
            .or_default()
            .push(text.to_string());
        Ok(())
    }

    fn ws_close(&mut self, handle: WsHandle) -> ClientResult<()> {
        self.ws_messages.remove(&handle);
        Ok(())
    }

    fn read_credential(&self, key: &str) -> ClientResult<Option<String>> {
        Ok(self.credentials.get(key).cloned())
    }

    fn installation_id(&self) -> String {
        self.installation_id.clone()
    }

    fn kv_get(&self, key: &str) -> Option<String> {
        self.kv.get(key).cloned()
    }

    fn kv_set(&mut self, key: &str, value: &str) {
        self.kv.insert(key.to_string(), value.to_string());
    }

    fn kv_remove(&mut self, key: &str) {
        self.kv.remove(key);
    }

    fn announce_accessibility(&mut self, message: &str) {
        self.announcements.push(message.to_string());
    }
}
