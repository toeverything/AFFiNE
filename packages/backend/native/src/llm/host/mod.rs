mod error;
mod stream;
mod stream_handle;
mod tool_loop;

pub(crate) use error::{
  STREAM_ABORTED_REASON, STREAM_CALLBACK_DISPATCH_FAILED_REASON, STREAM_END_MARKER, callback_dispatch_failed_reason,
  invalid_arg,
};
pub(crate) use stream::{emit_error_event, emit_provider_selected_event};
pub use stream::{
  llm_dispatch_prepared_stream, llm_dispatch_tool_loop_stream, llm_dispatch_tool_loop_stream_prepared,
  llm_dispatch_tool_loop_stream_routed,
};
pub(crate) use stream_handle::LlmStreamHandle;
