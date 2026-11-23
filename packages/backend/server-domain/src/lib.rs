//! Pure canonical domain core for the AFFiNE server.
//!
//! Contains authentication, user views, workspace & member management,
//! runtime application configuration, and invalidation/eventbus publishing.
//! Depends on no HTTP/GraphQL transport frameworks and no storage/protocol
//! compatibility layers.

pub mod app_config;
pub mod auth;
pub mod events;
pub mod users;
pub mod workspaces;
