//! Authentication GraphQL root extensions.

use async_graphql::{EmptyMutation, MergedObject};

#[derive(MergedObject, Default)]
pub struct AuthQuery(EmptyMutation);

#[derive(MergedObject, Default)]
pub struct AuthMutation(EmptyMutation);
