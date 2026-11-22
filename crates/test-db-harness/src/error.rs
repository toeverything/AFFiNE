use std::fmt;

/// Harness failure with a message that says what to do about it.
#[derive(Debug)]
pub struct Error(String);

pub type Result<T, E = Error> = std::result::Result<T, E>;

impl Error {
  pub fn new(message: impl Into<String>) -> Self {
    Self(message.into())
  }
}

impl fmt::Display for Error {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.write_str(&self.0)
  }
}

impl std::error::Error for Error {}

impl From<std::io::Error> for Error {
  fn from(e: std::io::Error) -> Self {
    Self(format!("io: {e}"))
  }
}

impl From<postgres::Error> for Error {
  fn from(e: postgres::Error) -> Self {
    match e.as_db_error() {
      Some(db) => Self(format!("postgres: {}: {}", db.code().code(), db.message())),
      None => Self(format!("postgres: {e}")),
    }
  }
}

impl From<serde_json::Error> for Error {
  fn from(e: serde_json::Error) -> Self {
    Self(format!("json: {e}"))
  }
}
