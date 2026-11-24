//! Self-hosted worker proxy REST route mount point.

use axum::Router;

use crate::RouterState;

pub(crate) fn router() -> Router<RouterState> {
  Router::new()
}
