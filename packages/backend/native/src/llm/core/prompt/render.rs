use chrono::Local;
use llm_adapter::core::prompt_template::{is_truthy_number, parse_template, render_tokens, value_to_warning_text};
use serde_json::{Map, Value};

use super::super::contracts::{PromptMessageContract, PromptRenderResult};

pub(super) fn render_prompt_response(
  messages: &[PromptMessageContract],
  template_params: &Map<String, Value>,
  params: &Map<String, Value>,
) -> std::result::Result<PromptRenderResult, String> {
  let (params, warnings) = normalize_prompt_params(template_params, params);
  let messages = render_prompt_messages(messages, &params)?;

  Ok(PromptRenderResult { messages, warnings })
}

fn normalize_prompt_params(
  template_params: &Map<String, Value>,
  params: &Map<String, Value>,
) -> (Map<String, Value>, Vec<String>) {
  let mut normalized = params.clone();
  let mut warnings = Vec::new();

  for (key, options) in template_params {
    let income = normalized.get(key);
    let valid = matches!(income, Some(Value::String(value)) if !matches!(options, Value::Array(items) if !items.iter().any(|item| item.as_str() == Some(value))));
    if valid {
      continue;
    }

    let default_value = match options {
      Value::Array(items) => items.first().cloned().unwrap_or(Value::Null),
      other => other.clone(),
    };
    let default_text = value_to_warning_text(&default_value);
    let prefix = match income {
      Some(Value::String(value)) if !value.is_empty() => format!("Invalid param value: {key}={value}"),
      Some(value) if !value.is_null() => format!("Invalid param value: {key}={}", value_to_warning_text(value)),
      _ => format!("Missing param value: {key}"),
    };
    warnings.push(format!("{prefix}, use default options: {default_text}"));
    normalized.insert(key.clone(), default_value);
  }

  (normalized, warnings)
}

fn render_prompt_messages(
  messages: &[PromptMessageContract],
  params: &Map<String, Value>,
) -> std::result::Result<Vec<PromptMessageContract>, String> {
  let mut render_context = params.clone();
  render_context.remove("attachments");
  render_context.retain(|key, _| !key.starts_with("affine::"));
  render_context.extend(create_prompt_builtins(params));

  let input_attachments = params
    .get("attachments")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  let render_context = Value::Object(render_context);

  messages
    .iter()
    .map(|message| render_prompt_message(message, &render_context, params, &input_attachments))
    .collect()
}

pub(super) fn create_prompt_builtins(params: &Map<String, Value>) -> Map<String, Value> {
  let has_docs = params
    .get("docs")
    .and_then(Value::as_array)
    .map(|items| !items.is_empty())
    .unwrap_or(false);
  let has_files = params
    .get("contextFiles")
    .and_then(Value::as_array)
    .map(|items| !items.is_empty())
    .unwrap_or(false);
  let has_selected = ["selectedMarkdown", "selectedSnapshot", "html"]
    .iter()
    .any(|key| params.get(*key).is_some_and(value_has_content));
  let has_current_doc = params
    .get("currentDocId")
    .and_then(Value::as_str)
    .map(|value| !value.trim().is_empty())
    .unwrap_or(false);

  Map::from_iter([
    (
      "affine::date".to_string(),
      Value::String(Local::now().format("%-m/%-d/%Y").to_string()),
    ),
    (
      "affine::language".to_string(),
      Value::String(
        params
          .get("language")
          .and_then(Value::as_str)
          .filter(|value| !value.is_empty())
          .unwrap_or("same language as the user query")
          .to_string(),
      ),
    ),
    (
      "affine::timezone".to_string(),
      Value::String(
        params
          .get("timezone")
          .and_then(Value::as_str)
          .filter(|value| !value.is_empty())
          .unwrap_or("no preference")
          .to_string(),
      ),
    ),
    ("affine::hasDocsRef".to_string(), Value::Bool(has_docs)),
    ("affine::hasFilesRef".to_string(), Value::Bool(has_files)),
    ("affine::hasSelected".to_string(), Value::Bool(has_selected)),
    ("affine::hasCurrentDoc".to_string(), Value::Bool(has_current_doc)),
  ])
}

pub(super) fn value_has_content(value: &Value) -> bool {
  match value {
    Value::String(text) => !text.is_empty(),
    Value::Array(items) => !items.is_empty(),
    Value::Object(map) => !map.is_empty(),
    Value::Bool(boolean) => *boolean,
    Value::Number(number) => is_truthy_number(number),
    Value::Null => false,
  }
}

fn render_prompt_message(
  message: &PromptMessageContract,
  render_context: &Value,
  params: &Map<String, Value>,
  input_attachments: &[Value],
) -> std::result::Result<PromptMessageContract, String> {
  let tokens = parse_template(&message.content)?;
  let rendered_content = render_tokens(&tokens, &[render_context]);

  let mut next = message.clone();
  next.content = rendered_content;
  next.params = Some(Value::Object(params.clone()));

  if message.role == "user" {
    let mut resolved_attachments = message.attachments.clone().unwrap_or_default();
    resolved_attachments.extend(input_attachments.iter().cloned());
    if !resolved_attachments.is_empty() {
      next.attachments = Some(resolved_attachments);
    }
  }

  Ok(next)
}
