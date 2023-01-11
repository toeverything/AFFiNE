use jwst_storage::{CreateUser, User};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub enum IUserParameters {
  CreateUser(CreateUser),
  User(User),
}
