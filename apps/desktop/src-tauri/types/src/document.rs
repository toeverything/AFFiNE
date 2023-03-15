use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct YDocumentUpdate {
  pub update: Vec<u8>,
  pub id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct GetDocumentParameter {
  pub id: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct CreateDocumentParameter {
  pub workspace_id: String,
  pub workspace_name: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct GetDocumentResponse {
  pub updates: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub enum IDocumentParameters {
  YDocumentUpdate(YDocumentUpdate),
  CreateDocumentParameter(CreateDocumentParameter),
  GetDocumentParameter(GetDocumentParameter),
  GetDocumentResponse(GetDocumentResponse),
}
