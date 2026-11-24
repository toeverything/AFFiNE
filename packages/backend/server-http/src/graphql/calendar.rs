//! Calendar GraphQL root extensions.

use async_graphql::{EmptyMutation, MergedObject};

#[derive(MergedObject, Default)]
pub struct CalendarMutation(EmptyMutation);
