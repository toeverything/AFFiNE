//! Pure sans-I/O authentication state machine and `0.27.5` `StoredAuthTokenPair` codec.
//!
//! ## Single Refresh Owner Architecture
//! Native platform hosts (`hosts/ios` `LegacyAuthBridge` and `hosts/android` `AuthSessionStore`)
//! are the sole I/O owners for Keychain/Keystore persistence and single-flight network
//! `/api/auth/session/{exchange,refresh,revoke}` execution. [`AuthController`] performs zero
//! network I/O and zero credential writes; host coordinators feed outcomes into
//! [`AuthController::apply_native_tokens`], [`AuthController::clear_native_session`], and
//! [`AuthController::apply_session_response`].

use affine_store::{
    api_client::{
        ApiHttpRequest, ApiRequestContext, AuthSessionMeta, AuthSessionUser, AuthTokenPairResponse,
        build_get_auth_session_request, decode_auth_session_response,
    },
    auth::{
        MAX_EXPIRES_IN_SECS, parse_and_validate_token_pair_response, validate_token_pair_fields,
    },
    sync::SocketAuthMode,
};
use serde::{Deserialize, Serialize};

use crate::{
    ClientError, ClientResult,
    host::{HostBridge, HostKind},
};

/// Seconds between Unix epoch (`1970-01-01T00:00:00Z`) and Apple CoreFoundation / `Date`
/// reference epoch (`2001-01-01T00:00:00Z`).
pub const APPLE_CF_EPOCH_OFFSET_SECS: f64 = 978_307_200.0;

/// Native host storage format selector preventing iOS CF-epoch integer-second ambiguity.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeAuthPlatform {
    /// iOS Keychain JSON (`accessExpiresAt` encoded as 2001 CoreFoundation epoch seconds).
    Ios,
    /// Android DataStore JSON (`accessExpiresAt` encoded as 1970 Unix milliseconds).
    Android,
}

/// Canonical `0.27.5` persisted native token pair (`StoredAuthTokenPair`).
///
/// Stores `version = 1`, absolute `accessExpiresAt` (Unix ms in memory / Android DataStore,
/// convertible losslessly to/from iOS 2001 CF epoch seconds), and nested `session: { id, absoluteExpiresAt }`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAuthTokenPair {
    pub version: u32,
    pub token_type: String,
    pub access_token: String,
    pub access_expires_at: i64,
    pub refresh_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<AuthSessionMeta>,
}

/// Alias preserving compatibility for callers referring to `NativeTokenPair`.
pub type NativeTokenPair = StoredAuthTokenPair;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IosKeychainTokenPairWire {
    version: u32,
    token_type: String,
    access_token: String,
    access_expires_at: f64,
    refresh_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    refresh_expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    session: Option<AuthSessionMeta>,
}

impl StoredAuthTokenPair {
    /// Maximum `expires_in` accepted from a native token endpoint (`24h`, matching `0.27.5`
    /// `AuthPlugin.swift` / `AuthPlugin.kt`).
    pub const MAX_EXPIRES_IN_SECS: u64 = MAX_EXPIRES_IN_SECS;

    fn validate_invariant_fields(&self) -> ClientResult<()> {
        validate_token_pair_fields(
            self.version,
            &self.token_type,
            &self.access_token,
            &self.refresh_token,
            self.refresh_expires_at.as_deref(),
            self.session.as_ref(),
        )
        .map_err(|err| ClientError::InvalidAuthPayload(err.to_string()))
    }

    /// Validate and convert a server [`AuthTokenPairResponse`] into a [`StoredAuthTokenPair`]
    /// using an explicit deterministic `now_ms`.
    ///
    /// Rejects non-`Bearer` `token_type`, empty tokens, out-of-range `expires_in`
    /// (`1..=86_400`), and malformed RFC 3339 timestamps.
    pub fn from_wire(parsed: AuthTokenPairResponse, now_ms: i64) -> ClientResult<Self> {
        let validated = parse_and_validate_token_pair_response(parsed, now_ms)
            .map_err(|err| ClientError::InvalidAuthPayload(err.to_string()))?;
        Ok(Self {
            version: validated.version,
            token_type: validated.token_type,
            access_token: validated.access_token,
            access_expires_at: validated.access_expires_at_ms,
            refresh_token: validated.refresh_token,
            refresh_expires_at: validated.refresh_expires_at,
            session: validated.session,
        })
    }

    pub fn session_id(&self) -> Option<&str> {
        self.session.as_ref().map(|s| s.id.as_str())
    }

    pub fn access_expires_at_unix_ms(&self) -> i64 {
        self.access_expires_at
    }

    /// Convert `access_expires_at` (Unix ms) to iOS `Date` / CF 2001 epoch seconds.
    pub fn access_expires_at_ios_cf_secs(&self) -> f64 {
        (self.access_expires_at as f64 / 1_000.0) - APPLE_CF_EPOCH_OFFSET_SECS
    }

    /// Convert iOS `Date` / CF 2001 epoch seconds back to Unix milliseconds.
    pub fn unix_ms_from_ios_cf_secs(cf_secs: f64) -> i64 {
        ((cf_secs + APPLE_CF_EPOCH_OFFSET_SECS) * 1_000.0).round() as i64
    }

    /// Serialize to the exact `0.27.5` Android DataStore JSON format (Unix ms `accessExpiresAt`).
    pub fn to_android_datastore_json(&self) -> ClientResult<String> {
        Ok(serde_json::to_string(self)?)
    }

    /// Deserialize from the exact `0.27.5` Android DataStore JSON format.
    pub fn from_android_datastore_json(raw: &str) -> ClientResult<Self> {
        let pair: Self = serde_json::from_str(raw)?;
        pair.validate_invariant_fields()?;
        Ok(pair)
    }

    /// Serialize to the exact `0.27.5` iOS Keychain JSON format (2001 CF epoch seconds `accessExpiresAt`).
    pub fn to_ios_keychain_json(&self) -> ClientResult<String> {
        let wire = IosKeychainTokenPairWire {
            version: self.version,
            token_type: self.token_type.clone(),
            access_token: self.access_token.clone(),
            access_expires_at: self.access_expires_at_ios_cf_secs(),
            refresh_token: self.refresh_token.clone(),
            refresh_expires_at: self.refresh_expires_at.clone(),
            session: self.session.clone(),
        };
        Ok(serde_json::to_string(&wire)?)
    }

    /// Deserialize from the exact `0.27.5` iOS Keychain JSON format.
    pub fn from_ios_keychain_json(raw: &str) -> ClientResult<Self> {
        let wire: IosKeychainTokenPairWire = serde_json::from_str(raw)?;
        if !wire.access_expires_at.is_finite() {
            return Err(ClientError::InvalidAuthPayload(
                "iOS accessExpiresAt must be finite".into(),
            ));
        }
        let pair = Self {
            version: wire.version,
            token_type: wire.token_type,
            access_token: wire.access_token,
            access_expires_at: Self::unix_ms_from_ios_cf_secs(wire.access_expires_at),
            refresh_token: wire.refresh_token,
            refresh_expires_at: wire.refresh_expires_at,
            session: wire.session,
        };
        pair.validate_invariant_fields()?;
        Ok(pair)
    }
}

/// Active session state for a single server.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuthSessionState {
    SignedOut,
    Authenticated { user: AuthSessionUser },
}

/// Pure sans-I/O per-server authentication state machine.
#[derive(Clone, Debug)]
pub struct AuthController {
    server_id: String,
    base_url: String,
    host_kind: HostKind,
    state: AuthSessionState,
    native_tokens: Option<StoredAuthTokenPair>,
    mutation_epoch: u64,
}

impl AuthController {
    pub fn new(
        server_id: impl Into<String>,
        base_url: impl Into<String>,
        host_kind: HostKind,
    ) -> Self {
        Self {
            server_id: server_id.into(),
            base_url: base_url.into().trim().trim_end_matches('/').to_string(),
            host_kind,
            state: AuthSessionState::SignedOut,
            native_tokens: None,
            mutation_epoch: 0,
        }
    }

    pub fn server_id(&self) -> &str {
        &self.server_id
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Endpoint-scoped credential key (`auth:<canonical_base_url>`) isolating credentials by URL.
    pub fn credential_key(&self) -> String {
        format!("auth:{}", self.base_url)
    }

    pub fn mutation_epoch(&self) -> u64 {
        self.mutation_epoch
    }

    pub fn state(&self) -> &AuthSessionState {
        &self.state
    }

    pub fn native_tokens(&self) -> Option<&StoredAuthTokenPair> {
        self.native_tokens.as_ref()
    }

    /// Hydrate offline cached user profile (for example from `global-state:<serverId>-auth`)
    /// so transient `5xx`/`429`/network failures preserve the cached signed-in UI state.
    pub fn set_cached_user(&mut self, user: AuthSessionUser) {
        self.state = AuthSessionState::Authenticated { user };
    }

    /// Sync newly exchanged or refreshed tokens produced by the native host coordinator.
    pub fn apply_native_tokens(&mut self, pair: StoredAuthTokenPair) {
        self.mutation_epoch = self.mutation_epoch.saturating_add(1);
        self.native_tokens = Some(pair);
    }

    /// Clear in-memory tokens and transition to `SignedOut` after host-owned revoke/sign-out.
    pub fn clear_native_session(&mut self) {
        self.mutation_epoch = self.mutation_epoch.saturating_add(1);
        self.native_tokens = None;
        self.state = AuthSessionState::SignedOut;
    }

    /// Build the frozen [`ApiRequestContext`] for this host kind and current credential state.
    pub fn api_context(&self) -> ApiRequestContext {
        match self.host_kind {
            HostKind::Web => ApiRequestContext::web(),
            HostKind::Native => ApiRequestContext::native(
                self.native_tokens.as_ref().map(|t| t.access_token.clone()),
            ),
        }
    }

    /// Build the Socket.IO `40` CONNECT [`SocketAuthMode`] for `SpaceSyncEngine`.
    ///
    /// Native hosts without stored tokens return [`SocketAuthMode::Unauthenticated`] and never
    /// fall back to [`SocketAuthMode::WebCookie`].
    pub fn socket_auth_mode(&self) -> SocketAuthMode {
        match self.host_kind {
            HostKind::Web => SocketAuthMode::WebCookie,
            HostKind::Native => match &self.native_tokens {
                Some(tokens) => SocketAuthMode::NativeJwt {
                    token: tokens.access_token.clone(),
                },
                None => SocketAuthMode::Unauthenticated,
            },
        }
    }

    /// Build a transport-agnostic `GET /api/auth/session` request for the host to execute.
    pub fn build_session_request(&self) -> ApiHttpRequest {
        build_get_auth_session_request(&self.api_context())
    }

    /// Build a `GET /api/auth/session` request paired with the current `mutation_epoch` so
    /// late responses arriving after sign-out or token rotation can be discarded safely.
    pub fn build_fenced_session_request(&self) -> (u64, ApiHttpRequest) {
        (self.mutation_epoch, self.build_session_request())
    }

    /// Apply a fenced `GET /api/auth/session` response only when `request_epoch` still matches
    /// [`Self::mutation_epoch`]. Returns `Ok(None)` without mutating state on stale epochs.
    pub fn apply_fenced_session_response(
        &mut self,
        request_epoch: u64,
        status: u16,
        body: &[u8],
    ) -> ClientResult<Option<AuthSessionState>> {
        if request_epoch != self.mutation_epoch {
            return Ok(None);
        }
        self.apply_session_response(status, body).map(Some)
    }

    /// Apply a `GET /api/auth/session` HTTP response to [`AuthSessionState`].
    ///
    /// Transitions to `SignedOut` ONLY on `401`/`403` or `200 { user: null }`. Any other error
    /// status (`>= 400`, including `429` and `5xx`) returns `Err` and preserves `self.state`.
    pub fn apply_session_response(
        &mut self,
        status: u16,
        body: &[u8],
    ) -> ClientResult<AuthSessionState> {
        if status == 401 || status == 403 {
            self.state = AuthSessionState::SignedOut;
            return Ok(self.state.clone());
        }
        if status >= 400 {
            return Err(ClientError::Host(format!(
                "fetch session failed with transient HTTP {status}"
            )));
        }
        let decoded = decode_auth_session_response(body)?;
        self.state = match decoded.user {
            Some(user) => AuthSessionState::Authenticated { user },
            None => AuthSessionState::SignedOut,
        };
        Ok(self.state.clone())
    }

    /// Load stored native credentials from [`HostBridge`] using the explicit [`NativeAuthPlatform`]
    /// codec.
    ///
    /// - Performs strictly read-only vault access (`&dyn HostBridge`): platform hosts remain the
    ///   sole owners of Keychain / DataStore writes and deletes.
    /// - When the host vault returns `None` or unparseable JSON, clears in-memory `native_tokens`
    ///   and transitions to `SignedOut` without mutating host storage.
    pub fn load_stored_credentials(
        &mut self,
        host: &dyn HostBridge,
        platform: NativeAuthPlatform,
    ) -> ClientResult<bool> {
        if self.host_kind != HostKind::Native {
            return Ok(false);
        }
        let key = self.credential_key();
        let Some(raw) = host.read_credential(&key)? else {
            self.clear_native_session();
            return Ok(false);
        };
        let parsed = match platform {
            NativeAuthPlatform::Ios => StoredAuthTokenPair::from_ios_keychain_json(&raw),
            NativeAuthPlatform::Android => StoredAuthTokenPair::from_android_datastore_json(&raw),
        };
        match parsed {
            Ok(pair) => {
                self.apply_native_tokens(pair);
                Ok(true)
            }
            Err(_) => {
                self.clear_native_session();
                Ok(false)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::MemoryHostBridge;

    #[test]
    fn ios_integer_and_fractional_cf_epoch_seconds_decode_explicitly_without_android_ambiguity() {
        let mut host = MemoryHostBridge::new(HostKind::Native, "inst-ios");
        let mut auth =
            AuthController::new("affine-cloud", "https://app.affine.pro", HostKind::Native);

        // Integer CF epoch seconds (Swift JSONEncoder emits `800000000` without `.0`).
        let ios_int = r#"{"version":1,"tokenType":"Bearer","accessToken":"at-int","accessExpiresAt":800000000,"refreshToken":"rt-int","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"s-int","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#;
        host.seed_credential(auth.credential_key(), ios_int);
        assert!(
            auth.load_stored_credentials(&mut host, NativeAuthPlatform::Ios)
                .unwrap()
        );
        assert_eq!(
            auth.native_tokens().unwrap().access_expires_at_unix_ms(),
            1_778_307_200_000
        );

        // Fractional CF epoch seconds `800000000.5` -> `1778307200500` ms.
        let ios_frac = r#"{"version":1,"tokenType":"Bearer","accessToken":"at-frac","accessExpiresAt":800000000.5,"refreshToken":"rt-frac","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"s-frac","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#;
        host.seed_credential(auth.credential_key(), ios_frac);
        assert!(
            auth.load_stored_credentials(&mut host, NativeAuthPlatform::Ios)
                .unwrap()
        );
        assert_eq!(
            auth.native_tokens().unwrap().access_expires_at_unix_ms(),
            1_778_307_200_500
        );

        // Android DataStore fixture (`1970` Unix ms) roundtrips cleanly with Android selector.
        let android_json = r#"{"version":1,"tokenType":"Bearer","accessToken":"at-and","accessExpiresAt":1795622400000,"refreshToken":"rt-and","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"s-and","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#;
        host.seed_credential(auth.credential_key(), android_json);
        assert!(
            auth.load_stored_credentials(&mut host, NativeAuthPlatform::Android)
                .unwrap()
        );
        assert_eq!(
            auth.native_tokens().unwrap().access_expires_at_unix_ms(),
            1_795_622_400_000
        );
    }

    #[test]
    fn deleted_host_credential_clears_stale_jwt_and_from_wire_validates_fields() {
        let mut host = MemoryHostBridge::new(HostKind::Native, "inst-1");
        let mut auth =
            AuthController::new("affine-cloud", "https://app.affine.pro", HostKind::Native);

        let valid_wire = AuthTokenPairResponse {
            token_type: Some("Bearer".into()),
            access_token: "at-1".into(),
            refresh_token: "rt-1".into(),
            expires_in: Some(3600),
            refresh_expires_at: Some("2026-12-01T00:00:00Z".into()),
            session: Some(AuthSessionMeta {
                id: "sess-1".into(),
                absolute_expires_at: Some("2027-01-01T00:00:00Z".into()),
            }),
            session_id: None,
        };
        let pair = StoredAuthTokenPair::from_wire(valid_wire.clone(), 1_700_000_000_000).unwrap();
        auth.apply_native_tokens(pair);
        assert_eq!(
            auth.socket_auth_mode(),
            SocketAuthMode::NativeJwt {
                token: "at-1".into()
            }
        );

        // Host vault has no credential (deleted by host coordinator) -> clears in-memory JWT.
        assert!(
            !auth
                .load_stored_credentials(&mut host, NativeAuthPlatform::Android)
                .unwrap()
        );
        assert_eq!(auth.socket_auth_mode(), SocketAuthMode::Unauthenticated);
        assert_eq!(auth.state(), &AuthSessionState::SignedOut);

        // `from_wire` rejects non-Bearer, zero expiresIn, and malformed RFC3339 timestamps.
        let mut bad_type = valid_wire.clone();
        bad_type.token_type = Some("Basic".into());
        assert!(StoredAuthTokenPair::from_wire(bad_type, 1_000).is_err());

        let mut zero_exp = valid_wire.clone();
        zero_exp.expires_in = Some(0);
        assert!(StoredAuthTokenPair::from_wire(zero_exp, 1_000).is_err());

        let mut bad_refresh_ts = valid_wire.clone();
        bad_refresh_ts.refresh_expires_at = Some("not-a-date".into());
        assert!(StoredAuthTokenPair::from_wire(bad_refresh_ts, 1_000).is_err());

        let mut bad_abs_ts = valid_wire.clone();
        bad_abs_ts.session.as_mut().unwrap().absolute_expires_at = Some("2027-99-99".into());
        assert!(StoredAuthTokenPair::from_wire(bad_abs_ts, 1_000).is_err());

        // Non-ASCII UTF-8 boundary and impossible calendar dates never panic and return Err.
        let mut non_ascii_ts = valid_wire.clone();
        non_ascii_ts.refresh_expires_at = Some("2026-12-01T00:00:0é0Z".into());
        assert!(StoredAuthTokenPair::from_wire(non_ascii_ts, 1_000).is_err());

        let mut feb_31_ts = valid_wire.clone();
        feb_31_ts.refresh_expires_at = Some("2026-02-31T00:00:00Z".into());
        assert!(StoredAuthTokenPair::from_wire(feb_31_ts, 1_000).is_err());

        // Excess `expiresIn` (> 86_400) and empty tokens are rejected.
        let mut huge_exp = valid_wire.clone();
        huge_exp.expires_in = Some(86_401);
        assert!(StoredAuthTokenPair::from_wire(huge_exp, 1_000).is_err());

        let mut empty_tok = valid_wire;
        empty_tok.access_token = String::new();
        assert!(StoredAuthTokenPair::from_wire(empty_tok, 1_000).is_err());

        // Corrupt JSON in host vault leaves vault untouched while clearing in-memory state.
        host.seed_credential(auth.credential_key(), "{corrupt");
        assert!(
            !auth
                .load_stored_credentials(&host, NativeAuthPlatform::Android)
                .unwrap()
        );
        assert_eq!(
            host.read_credential(&auth.credential_key())
                .unwrap()
                .as_deref(),
            Some("{corrupt")
        );

        // Epoch-fenced session responses ignore stale in-flight completions after sign-out/rotation.
        let (stale_epoch, _req) = auth.build_fenced_session_request();
        auth.clear_native_session();
        assert_eq!(
            auth.apply_fenced_session_response(
                stale_epoch,
                200,
                br#"{"user":{"id":"u-stale","name":"Stale"}}"#,
            )
            .unwrap(),
            None
        );
        assert_eq!(auth.state(), &AuthSessionState::SignedOut);

        // Sans-I/O session response: 503/429 preserves cached user; 401/403 signs out.
        auth.set_cached_user(AuthSessionUser {
            id: "u1".into(),
            email: None,
            name: Some("Alice".into()),
            avatar_url: None,
        });
        let req = auth.build_session_request();
        assert_eq!(req.path, "/api/auth/session");
        assert!(auth.apply_session_response(503, b"unavailable").is_err());
        assert!(matches!(
            auth.state(),
            AuthSessionState::Authenticated { .. }
        ));
        assert_eq!(
            auth.apply_session_response(401, b"{}").unwrap(),
            AuthSessionState::SignedOut
        );
    }
}
