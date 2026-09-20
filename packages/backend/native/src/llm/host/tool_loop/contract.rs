use llm_runtime::{AccumulatedToolCall, ToolLoopEvent};

pub(super) type NativeToolCall = AccumulatedToolCall;
pub(super) type ToolLoopStreamEvent = ToolLoopEvent;
