use cloud_database::{CreateUser, User};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct GetUserParameters {
  pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum IUserParameters {
  CreateUser(CreateUser),
  User(User),
  GetUserParameters(GetUserParameters),
}
