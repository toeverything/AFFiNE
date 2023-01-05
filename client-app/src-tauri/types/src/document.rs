use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct YDocumentUpdate {
  pub update: Vec<u8>,
  pub id: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct GetDocumentParameter {
  pub id: i64,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct GetDocumentResponse {
  pub update: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum IDocumentParameters {
  YDocumentUpdate(YDocumentUpdate),
  GetDocumentParameter(GetDocumentParameter),
  GetDocumentResponse(GetDocumentResponse),
}
