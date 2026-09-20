use napi::{Error, Status};

pub(crate) const STREAM_END_MARKER: &str = "__AFFINE_LLM_STREAM_END__";
pub(crate) const STREAM_ABORTED_REASON: &str = "__AFFINE_LLM_STREAM_ABORTED__";
pub(crate) const STREAM_CALLBACK_DISPATCH_FAILED_REASON: &str = "__AFFINE_LLM_STREAM_CALLBACK_DISPATCH_FAILED__";

pub(crate) fn callback_dispatch_failed_reason(status: Status) -> String {
  format!("{STREAM_CALLBACK_DISPATCH_FAILED_REASON}:{status}")
}

pub(crate) fn invalid_arg(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}
