//! Pure canonical domain core for the AFFiNE server.
//!
//! Contains authentication, user views, workspace & member management,
//! runtime application configuration, and invalidation/eventbus publishing.
//! Depends on no HTTP/GraphQL transport frameworks and no storage/protocol
//! compatibility layers.

pub use y_octo;

pub mod acl;
pub mod admin;
pub mod app_config;
pub mod auth;
pub mod calendar;
pub mod comments;
pub mod content_policy;
pub mod disposition;
pub mod doc_meta;
pub mod doc_sharing;
pub mod events;
pub mod histories;
pub mod mcp;
pub mod notifications;
pub mod safe_fetch;
pub mod selfhost_license;
pub mod users;
pub mod workspaces;
