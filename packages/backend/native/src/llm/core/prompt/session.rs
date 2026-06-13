use llm_adapter::core::prompt_template::{parse_template, template_uses_key};
use serde_json::{Map, Value};

use super::{
  super::contracts::{PromptMessageContract, PromptSessionContract, PromptSessionResult},
  render::render_prompt_response,
};
use crate::tiktoken::{Tokenizer, from_model_name};

pub(super) fn render_session_prompt(
  request: &PromptSessionContract,
  template_params: &Map<String, Value>,
  params: &Map<String, Value>,
) -> std::result::Result<PromptSessionResult, String> {
  let tokenizer = session_tokenizer(request.prompt.model.as_deref());
  let mut selected_turns = take_session_turns(request, tokenizer.as_ref())?;
  let latest_turn = selected_turns.pop();

  if prompt_uses_content(&request.prompt.messages)?
    && !selected_turns.iter().any(message_is_assistant)
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

    let rendered = render_prompt_response(&request.prompt.messages, template_params, &merged_params)?;
    let mut messages = rendered.messages;
    let Some(first_user_message_index) = messages
      .iter()
      .position(|message| message_role(message) == Some("user"))
    else {
      return Ok(PromptSessionResult {
        messages,
        warnings: rendered.warnings,
        prompt_message_positions: (0..request.prompt.messages.len()).map(|index| index as u32).collect(),
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

    let prior_turn_count = selected_turns.len();
    messages.splice(first_user_message_index..first_user_message_index, selected_turns);
    let prompt_message_positions = (0..request.prompt.messages.len())
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
  let rendered = render_prompt_response(&request.prompt.messages, template_params, &final_params)?;

  let trailing_turns = selected_turns
    .into_iter()
    .chain(latest_turn)
    .filter(prompt_message_should_survive)
    .collect::<Vec<_>>();
  let mut messages = rendered.messages;
  messages.extend(trailing_turns);

  Ok(PromptSessionResult {
    messages,
    warnings: rendered.warnings,
    prompt_message_positions: (0..request.prompt.messages.len()).map(|index| index as u32).collect(),
  })
}

fn session_tokenizer(model: Option<&str>) -> Option<Tokenizer> {
  let model = model?;
  if model.starts_with("gpt") {
    return from_model_name(model.to_string());
  }
  if model.starts_with("dall") {
    return None;
  }

  from_model_name("gpt-4".to_string())
}

fn take_session_turns(
  request: &PromptSessionContract,
  tokenizer: Option<&Tokenizer>,
) -> std::result::Result<Vec<PromptMessageContract>, String> {
  if request.prompt.action.is_some() {
    return Ok(request.turns.last().cloned().into_iter().collect());
  }

  let mut picked = Vec::new();
  let mut size = request.prompt.prompt_tokens;

  for message in request.turns.iter().rev() {
    let content = message.content.as_str();
    size += tokenizer
      .map(|tokenizer| tokenizer.count(content.to_string(), None))
      .unwrap_or(0);
    if size > request.max_token_size {
      break;
    }
    picked.push(message.clone());
  }

  picked.reverse();
  Ok(picked)
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
