use std::fmt::{Debug, Display};

use napi::{Error, Result, Status};

pub fn to_napi_error<E: Display + Debug>(err: E, status: Status) -> Error {
  Error::new(status, err.to_string())
}

pub fn map_napi_err<T, E: Display + Debug>(value: std::result::Result<T, E>, status: Status) -> Result<T> {
  value.map_err(|err| to_napi_error(err, status))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn map_napi_err_keeps_message() {
    let err = map_napi_err::<(), _>(Err("boom"), Status::GenericFailure).unwrap_err();
    assert!(err.to_string().contains("boom"));
  }
}
