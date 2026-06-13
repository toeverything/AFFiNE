use llm_adapter::core::{CoreContent, CoreMessage};
use llm_runtime::{ToolResultMessage, append_tool_turns};
use serde_json::json;

use super::contract::NativeToolCall;

#[test]
fn append_tool_turns_should_replay_assistant_and_tool_messages() {
  let mut messages = vec![CoreMessage {
    role: llm_adapter::core::CoreRole::User,
    content: vec![CoreContent::Text {
      text: "read doc".to_string(),
    }],
  }];

  append_tool_turns(
    &mut messages,
    &[NativeToolCall {
      id: "call_1".to_string(),
      name: "doc_read".to_string(),
      args: json!({ "doc_id": "a1" }),
      raw_arguments_text: Some("{\"doc_id\":\"a1\"}".to_string()),
      argument_parse_error: None,
      thought: Some("need context".to_string()),
    }],
    &[ToolResultMessage {
      call_id: "call_1".to_string(),
      output: json!({ "markdown": "# doc" }),
      is_error: Some(false),
    }],
  );

  assert_eq!(messages.len(), 3);
  assert!(matches!(messages[1].role, llm_adapter::core::CoreRole::Assistant));
  assert!(matches!(messages[2].role, llm_adapter::core::CoreRole::Tool));
}
