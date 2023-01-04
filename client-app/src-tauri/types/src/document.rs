use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct YDocumentUpdate<'a> {
  update: Vec<u8>,
  room: &'a str,
}
