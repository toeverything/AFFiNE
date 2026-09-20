use napi::{Error, Result, Status};
use serde_json::{Map, Value};

use crate::llm::{
  core::contracts::{
    BuiltInPromptRenderContract, BuiltInPromptSessionContract, PromptMessageContract, PromptMetadataResult,
    PromptRenderResult, PromptSessionResult,
  },
  prompt_catalog::{BuiltInPrompt, BuiltInPromptSpec, built_in_prompt, built_in_prompt_spec, built_in_prompt_specs},
};

mod metadata;
mod render;
mod session;

use metadata::collect_prompt_metadata;
use render::render_prompt_response;
use session::render_session_prompt;

fn invalid_arg(message: String) -> Error {
  Error::new(Status::InvalidArg, message)
}

fn value_to_map(value: Value, field: &str) -> Result<Map<String, Value>> {
  match value {
    Value::Object(map) => Ok(map),
    other => Err(invalid_arg(format!("Expected {field} to be an object, got {other}"))),
  }
}

fn built_in_prompt_messages(prompt: &BuiltInPrompt) -> Vec<PromptMessageContract> {
  prompt
    .messages
    .iter()
    .map(|message| PromptMessageContract {
      role: message.role.clone(),
      content: message.content.clone(),
      attachments: None,
      params: message.params.clone().map(Value::Object),
      response_format: None,
    })
    .collect()
}

fn built_in_prompt_metadata(prompt: &BuiltInPrompt) -> Result<PromptMetadataResult> {
  collect_prompt_metadata(&built_in_prompt_messages(prompt))
    .map_err(|error| invalid_arg(format!("Failed to collect built-in prompt metadata: {error}")))
}

#[napi(catch_unwind)]
pub fn llm_render_built_in_prompt(request: BuiltInPromptRenderContract) -> Result<PromptRenderResult> {
  let prompt = built_in_prompt(&request.name)
    .ok_or_else(|| invalid_arg(format!("Built-in prompt not found: {}", request.name)))?;
  let messages = built_in_prompt_messages(prompt);
  let metadata = built_in_prompt_metadata(prompt)?;
  let response = render_prompt_response(
    &messages,
    &value_to_map(metadata.template_params, "templateParams")?,
    &value_to_map(request.render_params, "renderParams")?,
  )
  .map_err(|error| invalid_arg(format!("Failed to render built-in prompt: {error}")))?;

  Ok(response)
}

#[napi(catch_unwind)]
pub fn llm_render_built_in_session_prompt(request: BuiltInPromptSessionContract) -> Result<PromptSessionResult> {
  let prompt = built_in_prompt(&request.name)
    .ok_or_else(|| invalid_arg(format!("Built-in prompt not found: {}", request.name)))?;
  let messages = built_in_prompt_messages(prompt);
  let metadata = built_in_prompt_metadata(prompt)?;
  let template_params = value_to_map(metadata.template_params, "prompt.templateParams")?;
  let render_params = value_to_map(request.render_params, "renderParams")?;
  let response = render_session_prompt(
    &messages,
    prompt.action.as_deref(),
    &request.turns,
    &template_params,
    &render_params,
  )
  .map_err(|error| invalid_arg(format!("Failed to render built-in session prompt: {error}")))?;

  Ok(response)
}

#[napi(catch_unwind)]
pub fn llm_list_built_in_prompt_specs() -> Result<Vec<BuiltInPromptSpec>> {
  Ok(built_in_prompt_specs().to_vec())
}

#[napi(catch_unwind)]
pub fn llm_get_built_in_prompt_spec(name: String) -> Result<Option<BuiltInPromptSpec>> {
  Ok(built_in_prompt_spec(&name).cloned())
}
