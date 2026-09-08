use llm_adapter::core::prompt_template::{parse_template, template_uses_key};
use serde_json::{Map, Value};

use super::{
  super::contracts::{PromptMessageContract, PromptSessionResult},
  render::render_prompt_response,
};

const DEFAULT_HISTORY_INPUT_BYTES: usize = 128 * 1024;
const MESSAGE_FRAMING_BYTES: usize = 16;

pub(super) fn render_session_prompt(
  prompt_messages: &[PromptMessageContract],
  action: Option<&str>,
  turns: &[PromptMessageContract],
  template_params: &Map<String, Value>,
  params: &Map<String, Value>,
) -> std::result::Result<PromptSessionResult, String> {
  render_session_prompt_with_budget(
    prompt_messages,
    action,
    turns,
    template_params,
    params,
    DEFAULT_HISTORY_INPUT_BYTES,
  )
}

fn render_session_prompt_with_budget(
  prompt_messages: &[PromptMessageContract],
  action: Option<&str>,
  turns: &[PromptMessageContract],
  template_params: &Map<String, Value>,
  params: &Map<String, Value>,
  history_input_bytes: usize,
) -> std::result::Result<PromptSessionResult, String> {
  let (prior_turns, latest_turn) = turns
    .split_last()
    .map(|(latest, prior)| (prior, Some(latest.clone())))
    .unwrap_or((&[], None));

  if prompt_uses_content(prompt_messages)?
    && !prior_turns.iter().any(message_is_assistant)
    && let Some(last_message) = latest_turn
      .as_ref()
      .filter(|message| message_role(message) == Some("user"))
  {
    let mut merged_params = params.clone();
    let last_message_params = message_params(last_message);
    if !last_message_params.is_empty() {
      merged_params.extend(last_message_params);
    }
    merged_params.insert("content".to_string(), Value::String(last_message.content.clone()));

    let rendered = render_prompt_response(prompt_messages, template_params, &merged_params)?;
    let mut messages = rendered.messages;
    let Some(first_user_message_index) = messages
      .iter()
      .position(|message| message_role(message) == Some("user"))
    else {
      ensure_messages_fit(&messages, &[], history_input_bytes)?;
      return Ok(PromptSessionResult {
        messages,
        warnings: rendered.warnings,
        prompt_message_positions: (0..prompt_messages.len()).map(|index| index as u32).collect(),
      });
    };

    let merged_attachments = [
      messages
        .first()
        .and_then(|message| message.attachments.clone())
        .unwrap_or_default(),
      last_message.attachments.clone().unwrap_or_default(),
    ]
    .concat()
    .into_iter()
    .filter(attachment_has_source)
    .collect::<Vec<_>>();
    if !merged_attachments.is_empty() {
      messages[first_user_message_index].attachments = Some(merged_attachments);
    }

    let selected_turns = select_history_turns(&messages, prior_turns, history_input_bytes)?;
    let prior_turn_count = selected_turns.len();
    messages.splice(first_user_message_index..first_user_message_index, selected_turns);
    let prompt_message_positions = (0..prompt_messages.len())
      .map(|index| {
        if index < first_user_message_index {
          index as u32
        } else {
          (index + prior_turn_count) as u32
        }
      })
      .collect();

    return Ok(PromptSessionResult {
      messages,
      warnings: rendered.warnings,
      prompt_message_positions,
    });
  }

  let final_params = if !params.is_empty() {
    params.clone()
  } else {
    latest_turn.as_ref().map(message_params).unwrap_or_default()
  };
  let rendered = render_prompt_response(prompt_messages, template_params, &final_params)?;

  let latest_turns = latest_turn
    .into_iter()
    .filter(prompt_message_should_survive)
    .collect::<Vec<_>>();
  let mut messages = rendered.messages;
  let selected_turns = if action.is_some() {
    ensure_messages_fit(&messages, &latest_turns, history_input_bytes)?;
    Vec::new()
  } else {
    let mut fixed = messages.clone();
    fixed.extend(latest_turns.clone());
    select_history_turns(&fixed, prior_turns, history_input_bytes)?
  };
  messages.extend(selected_turns);
  messages.extend(latest_turns);

  Ok(PromptSessionResult {
    messages,
    warnings: rendered.warnings,
    prompt_message_positions: (0..prompt_messages.len()).map(|index| index as u32).collect(),
  })
}

fn estimated_message_bytes(message: &PromptMessageContract) -> usize {
  let mut size = MESSAGE_FRAMING_BYTES
    .saturating_add(message.role.len())
    .saturating_add(message.content.len());
  if let Some(attachments) = &message.attachments {
    size = attachments.iter().fold(size, |size, attachment| {
      size.saturating_add(
        serde_json::to_vec(&attachment_metadata(attachment))
          .map(|bytes| bytes.len())
          .unwrap_or(usize::MAX),
      )
    });
  }
  for value in [message.response_format.as_ref().map(serde_json::to_vec)]
    .into_iter()
    .flatten()
  {
    size = size.saturating_add(value.map(|bytes| bytes.len()).unwrap_or(usize::MAX));
  }
  size
}

fn attachment_metadata(attachment: &Value) -> Value {
  if attachment.as_str().is_some_and(|value| value.starts_with("data:")) {
    return Value::String("data:".to_string());
  }
  let Some(object) = attachment.as_object() else {
    return attachment.clone();
  };
  let inline = matches!(object.get("kind").and_then(Value::as_str), Some("data" | "bytes"));
  let metadata = object
    .iter()
    .map(|(key, value)| {
      let value = if inline && key == "data" {
        Value::Null
      } else if matches!(key.as_str(), "url" | "attachment")
        && value.as_str().is_some_and(|value| value.starts_with("data:"))
      {
        Value::String("data:".to_string())
      } else {
        value.clone()
      };
      (key.clone(), value)
    })
    .collect::<Map<_, _>>();
  Value::Object(metadata)
}

fn select_history_turns(
  fixed_messages: &[PromptMessageContract],
  history: &[PromptMessageContract],
  history_input_bytes: usize,
) -> std::result::Result<Vec<PromptMessageContract>, String> {
  let mut size = fixed_messages.iter().fold(0usize, |size, message| {
    size.saturating_add(estimated_message_bytes(message))
  });
  if size > history_input_bytes {
    return Err("session prompt and latest turn exceed input byte budget".to_string());
  }
  let mut picked = Vec::new();
  for message in history.iter().rev() {
    size = size.saturating_add(estimated_message_bytes(message));
    if size > history_input_bytes {
      break;
    }
    picked.push(message.clone());
  }

  picked.reverse();
  Ok(picked)
}

fn ensure_messages_fit(
  prompt_messages: &[PromptMessageContract],
  latest_turns: &[PromptMessageContract],
  history_input_bytes: usize,
) -> std::result::Result<(), String> {
  let mut messages = prompt_messages.to_vec();
  messages.extend_from_slice(latest_turns);
  select_history_turns(&messages, &[], history_input_bytes).map(|_| ())
}

fn prompt_uses_content(messages: &[PromptMessageContract]) -> std::result::Result<bool, String> {
  for message in messages {
    if template_uses_key(&parse_template(&message.content)?, "content") {
      return Ok(true);
    }
  }

  Ok(false)
}

fn message_params(message: &PromptMessageContract) -> Map<String, Value> {
  message
    .params
    .as_ref()
    .and_then(|value| value.as_object())
    .cloned()
    .unwrap_or_default()
}

fn prompt_message_should_survive(message: &PromptMessageContract) -> bool {
  let content = !message.content.trim().is_empty();
  let attachments = message
    .attachments
    .as_ref()
    .is_some_and(|attachments| !attachments.is_empty());

  content || attachments
}

fn message_role(message: &PromptMessageContract) -> Option<&str> {
  Some(message.role.as_str())
}

fn message_is_assistant(message: &PromptMessageContract) -> bool {
  message_role(message) == Some("assistant")
}

fn attachment_has_source(attachment: &Value) -> bool {
  if let Some(text) = attachment.as_str() {
    return !text.trim().is_empty();
  }

  let Some(object) = attachment.as_object() else {
    return false;
  };

  if let Some(url) = object.get("attachment").and_then(Value::as_str) {
    return !url.is_empty();
  }

  match object.get("kind").and_then(Value::as_str) {
    Some("url") => object
      .get("url")
      .and_then(Value::as_str)
      .is_some_and(|value| !value.is_empty()),
    Some("data") | Some("bytes") => object
      .get("data")
      .and_then(Value::as_str)
      .is_some_and(|value| !value.is_empty()),
    Some("file_handle") => object
      .get("fileHandle")
      .and_then(Value::as_str)
      .is_some_and(|value| !value.is_empty()),
    _ => false,
  }
}

#[cfg(test)]
mod tests {
  use serde_json::{Map, json};

  use super::*;

  fn message(role: &str, content: &str) -> PromptMessageContract {
    serde_json::from_value(json!({ "role": role, "content": content })).unwrap()
  }

  #[test]
  fn byte_estimate_is_model_independent_and_utf8_aware() {
    let ascii = estimated_message_bytes(&message("user", "abc"));
    let cjk = estimated_message_bytes(&message("user", "中文文"));
    let emoji = estimated_message_bytes(&message("user", "😀😀😀"));
    assert!(ascii < cjk);
    assert!(cjk < emoji);

    let small = serde_json::from_value(json!({
      "role": "user",
      "content": "describe",
      "attachments": [{ "kind": "bytes", "data": "aW1n", "mimeType": "image/png" }]
    }))
    .unwrap();
    let large = serde_json::from_value(json!({
      "role": "user",
      "content": "describe",
      "attachments": [{ "kind": "bytes", "data": "aW1n".repeat(100_000), "mimeType": "image/png" }]
    }))
    .unwrap();
    assert_eq!(estimated_message_bytes(&small), estimated_message_bytes(&large));

    let legacy_small = serde_json::from_value(json!({
      "role": "user",
      "content": "describe",
      "attachments": ["data:image/png;base64,aW1n"]
    }))
    .unwrap();
    let legacy_large = serde_json::from_value(json!({
      "role": "user",
      "content": "describe",
      "attachments": [format!("data:image/png;base64,{}", "aW1n".repeat(100_000))]
    }))
    .unwrap();
    assert_eq!(
      estimated_message_bytes(&legacy_small),
      estimated_message_bytes(&legacy_large)
    );

    let params_small = serde_json::from_value(json!({
      "role": "user",
      "content": "describe",
      "params": {
        "attachments": [{
          "attachment": "data:image/png;base64,aW1n",
          "mimeType": "image/png"
        }]
      }
    }))
    .unwrap();
    let params_large = serde_json::from_value(json!({
      "role": "user",
      "content": "describe",
      "params": {
        "attachments": [{
          "attachment": format!("data:image/png;base64,{}", "aW1n".repeat(100_000)),
          "mimeType": "image/png"
        }]
      }
    }))
    .unwrap();
    assert_eq!(
      estimated_message_bytes(&params_small),
      estimated_message_bytes(&params_large)
    );
    let without_params = message("system", "system");
    let mut with_large_params = without_params.clone();
    with_large_params.params = Some(json!({ "document": "x".repeat(200_000) }));
    assert_eq!(
      estimated_message_bytes(&with_large_params),
      estimated_message_bytes(&without_params)
    );
  }

  #[test]
  fn keeps_latest_turn_and_only_a_contiguous_history_suffix() {
    let prompt = vec![message("system", "system")];
    let turns = vec![
      message("user", "old"),
      message("assistant", "recent"),
      message("user", "latest"),
    ];
    let fixed_bytes = estimated_message_bytes(&prompt[0]) + estimated_message_bytes(&turns[2]);
    let budget = fixed_bytes + estimated_message_bytes(&turns[1]) + 8;
    let result = render_session_prompt_with_budget(&prompt, None, &turns, &Map::new(), &Map::new(), budget).unwrap();
    assert_eq!(
      result
        .messages
        .iter()
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>(),
      ["system", "recent", "latest"]
    );
  }

  #[test]
  fn rejects_oversized_rendered_prompt_or_latest_turn() {
    let prompt = vec![message("system", "{{content}}")];
    let turns = vec![message("user", "large input")];
    let error = render_session_prompt_with_budget(&prompt, None, &turns, &Map::new(), &Map::new(), 1).unwrap_err();
    assert_eq!(error, "session prompt and latest turn exceed input byte budget");
  }

  #[test]
  fn merges_latest_user_content_params_and_file_handles_into_prompt() {
    let prompt = vec![message("user", "{{content}} {{tone}}")];
    let latest = serde_json::from_value(json!({
      "role": "user",
      "content": "Summarize this file",
      "attachments": [{
        "kind": "file_handle",
        "fileHandle": "file-1",
        "mimeType": "application/pdf"
      }],
      "params": { "tone": "brief" }
    }))
    .unwrap();

    let result = render_session_prompt(&prompt, None, &[latest], &Map::new(), &Map::new()).unwrap();

    assert_eq!(result.messages.len(), 1);
    assert_eq!(result.messages[0].content, "Summarize this file brief");
    assert_eq!(
      result.messages[0].attachments,
      Some(vec![json!({
        "kind": "file_handle",
        "fileHandle": "file-1",
        "mimeType": "application/pdf"
      })])
    );
  }

  #[test]
  fn action_prompt_drops_prior_history_but_keeps_latest_turn() {
    let prompt = vec![message("system", "action")];
    let turns = vec![
      message("user", "old"),
      message("assistant", "old answer"),
      message("user", "latest"),
    ];

    let result = render_session_prompt(&prompt, Some("edit"), &turns, &Map::new(), &Map::new()).unwrap();

    assert_eq!(
      result
        .messages
        .iter()
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>(),
      ["action", "latest"]
    );
  }
}
