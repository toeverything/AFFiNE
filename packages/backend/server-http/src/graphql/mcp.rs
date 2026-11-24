//! MCP GraphQL root extensions.

use async_graphql::{EmptyMutation, MergedObject};

#[derive(MergedObject, Default)]
pub struct McpQuery(EmptyMutation);

#[derive(MergedObject, Default)]
pub struct McpMutation(EmptyMutation);
