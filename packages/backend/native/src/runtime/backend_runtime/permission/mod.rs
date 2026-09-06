mod authorizer;
mod store;
mod types;

pub(super) use authorizer::PermissionAuthorizer;
pub(super) use types::{AuthorizedSearchScope, DocReadScope, SearchActor};

#[cfg(test)]
mod tests;
