//! Static asset REST route mount points for self-hosted and front roles.

use axum::Router;

use crate::RouterState;

pub(crate) fn selfhost_router() -> Router<RouterState> {
  Router::new()
}

pub(crate) fn front_router() -> Router<RouterState> {
  Router::new()
}
