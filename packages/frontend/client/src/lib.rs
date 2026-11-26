//! L3 device-neutral AFFiNE client domain core.
//!
//! Shared across Mobile, Desktop, and Web hosts with zero `ui::Window` or view dependencies.

#![forbid(unsafe_code)]

pub mod accessibility;
pub mod auth;
pub mod bootstrap;
pub mod doc_directory;
pub mod domain;
pub mod host;
pub mod i18n;
pub mod links;
pub mod nav;
pub mod organize;
pub mod search;
pub mod server;

use thiserror::Error;

pub use accessibility::{
    AccessibilityBounds, AccessibilityNode, AccessibilityRole, AccessibilityState,
    AccessibilityTree, FirstFrameAccessibilityRoot, PlatformAccessibility,
};
pub use auth::{
    AuthController, AuthSessionState, NativeAuthPlatform, NativeTokenPair, StoredAuthTokenPair,
};
pub use bootstrap::{BootstrapDecision, WorkspaceBootstrapGate};
pub use doc_directory::{CreateIntentEntry, CreateIntentLedger, StoreBackedDocDirectory};
pub use domain::{
    CollectionModel, DocModel, FavoriteItem, FolderNode, JournalEntry, TagModel, TrashItem,
    WorkspaceDomainService, WorkspaceModel,
};
pub use host::{HostBridge, HostKind, MemoryHostBridge, WsHandle};
pub use i18n::{I18nCatalog, LanguageMeta, SUPPORTED_LANGUAGES, resolve_fallback_chain};
pub use links::{BacklinkCompleteness, BacklinkItem, BacklinksResult, CloudBacklinkHit, LinkGraph};
pub use nav::{
    BreadcrumbAction, BreadcrumbCrumb, BreadcrumbDerivation, ContextState, DirectKind,
    DocMetaSnapshot, LocationChoice, LocationOption, LocationRef, NAV_HISTORY_CAPACITY, NavEntry,
    NavHistory, NavTarget, Origin, Scope, TrailEntry, WEB_HISTORY_STATE_SCHEMA_VERSION,
    WorkspaceBreadcrumbSnapshot,
};
pub use organize::{
    FolderForest, FolderForestCache, FolderForestState, FolderPlacement, FolderSegment,
    MAX_FOLDER_DEPTH,
};
pub use search::{SearchDocument, SearchHit, SearchWeights, WeightedSearchEngine};
pub use server::{DEFAULT_CLOUD_SERVER_ID, ServerEntry, ServerRegistry};

/// Unified error type for the L3 client domain crate.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum ClientError {
    #[error("adding cross-origin self-hosted servers is forbidden on Web hosts")]
    SelfHostedForbiddenOnWeb,

    #[error("built-in official cloud server cannot be removed")]
    CannotRemoveBuiltInServer,

    #[error("server with ID `{0}` already exists")]
    DuplicateServerId(String),

    #[error("server with base URL `{0}` already exists")]
    DuplicateServerUrl(String),

    #[error("server `{0}` not found")]
    ServerNotFound(String),

    #[error("invalid server URL `{0}`")]
    InvalidServerUrl(String),

    #[error("document `{0}` not found")]
    DocNotFound(String),

    #[error("row `{0}` is tombstoned and cannot be revived")]
    RowTombstoned(String),

    #[error("operation requires a native host")]
    NativeHostRequired,

    #[error("invalid auth payload: {0}")]
    InvalidAuthPayload(String),

    #[error("host bridge error: {0}")]
    Host(String),

    #[error("store error: {0}")]
    Store(String),

    #[error("serialization error: {0}")]
    Serialization(String),
}

impl From<affine_store::StoreError> for ClientError {
    fn from(value: affine_store::StoreError) -> Self {
        Self::Store(value.to_string())
    }
}

impl From<serde_json::Error> for ClientError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serialization(value.to_string())
    }
}

pub type ClientResult<T> = Result<T, ClientError>;
