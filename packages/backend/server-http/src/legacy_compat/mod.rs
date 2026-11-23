//! Thin edge compatibility mappings for `v0.27.5` clients.
//!
//! All legacy GraphQL naming quirks (`WorkspaceQuota.name = "Pro"` for
//! `SelfhostDefault`, human-readable byte/duration strings) and Apollo/NestJS
//! error extensions live strictly in this module and nowhere in `server-types`
//! or `server-spi`.

pub mod errors;
pub mod quota;
