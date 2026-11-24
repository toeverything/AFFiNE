//! Billing GraphQL root extensions.

use async_graphql::{EmptyMutation, MergedObject};

#[derive(MergedObject, Default)]
pub struct BillingQuery(EmptyMutation);

#[derive(MergedObject, Default)]
pub struct BillingMutation(EmptyMutation);
