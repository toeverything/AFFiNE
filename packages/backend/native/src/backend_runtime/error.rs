use napi::{Error, Status};

pub(super) fn napi_error(message: impl Into<String>) -> Error {
  Error::new(Status::GenericFailure, message.into())
}
