mod authorizer;
mod store;
mod telemetry;
mod types;

pub(super) use authorizer::PermissionAuthorizer;
pub(super) use telemetry::PermissionTelemetry;
#[cfg(test)]
pub(super) use telemetry::PermissionTelemetryEvent;
pub(super) use types::{AuthorizedSearchScope, DocReadScope, SearchActor};

#[cfg(test)]
mod tests;
