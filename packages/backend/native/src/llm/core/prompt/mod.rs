use napi::{Error, Result, Status};
use serde_json::{Map, Value};

use crate::{
  llm::{
    core::contracts::{
      BuiltInPromptRenderContract, BuiltInPromptSessionContract, PromptMessageContract, PromptMetadataContract,
      PromptMetadataResult, PromptRenderContract, PromptRenderResult, PromptSessionContract, PromptSessionPrompt,
      PromptSessionResult, PromptTokenCountContract, PromptTokenCountResult,
    },
    prompt_catalog::{BuiltInPrompt, BuiltInPromptSpec, built_in_prompt, built_in_prompt_spec, built_in_prompt_specs},
  },
  tiktoken::{Tokenizer, from_model_name},
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

fn count_prompt_tokens(model: Option<&str>, messages: &[PromptMessageContract]) -> u32 {
  let content = messages
    .iter()
    .map(|message| message.content.as_str())
    .collect::<String>();
  prompt_tokenizer(model)
    .map(|tokenizer| tokenizer.count(content, None))
    .unwrap_or(0)
}

fn prompt_tokenizer(model: Option<&str>) -> Option<Tokenizer> {
  let model = model?;
  if model.starts_with("gpt") {
    return from_model_name(model.to_string());
  }
  if model.starts_with("dall") {
    return None;
  }

  from_model_name("gpt-4".to_string())
}

#[napi(catch_unwind)]
pub fn llm_render_prompt(request: PromptRenderContract) -> Result<PromptRenderResult> {
  let response = render_prompt_response(
    &request.messages,
    &value_to_map(request.template_params, "templateParams")?,
    &value_to_map(request.render_params, "renderParams")?,
  )
  .map_err(|error| invalid_arg(format!("Failed to render prompt: {error}")))?;

  Ok(response)
}

#[napi(catch_unwind)]
pub fn llm_count_prompt_tokens(request: PromptTokenCountContract) -> Result<PromptTokenCountResult> {
  let content = request
    .messages
    .iter()
    .map(|message| message.content.as_str())
    .collect::<String>();
  let tokens = request
    .model
    .as_deref()
    .and_then(|model| prompt_tokenizer(Some(model)))
    .map(|tokenizer| tokenizer.count(content, None))
    .unwrap_or(0);

  Ok(PromptTokenCountResult { tokens })
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
pub fn llm_collect_prompt_metadata(request: PromptMetadataContract) -> Result<PromptMetadataResult> {
  let response = collect_prompt_metadata(&request.messages)
    .map_err(|error| invalid_arg(format!("Failed to collect prompt metadata: {error}")))?;

  Ok(response)
}

#[napi(catch_unwind)]
pub fn llm_render_session_prompt(request: PromptSessionContract) -> Result<PromptSessionResult> {
  let template_params = value_to_map(request.prompt.template_params.clone(), "prompt.templateParams")?;
  let render_params = value_to_map(request.render_params.clone(), "renderParams")?;
  let response = render_session_prompt(&request, &template_params, &render_params)
    .map_err(|error| invalid_arg(format!("Failed to render session prompt: {error}")))?;

  Ok(response)
}

#[napi(catch_unwind)]
pub fn llm_render_built_in_session_prompt(request: BuiltInPromptSessionContract) -> Result<PromptSessionResult> {
  let prompt = built_in_prompt(&request.name)
    .ok_or_else(|| invalid_arg(format!("Built-in prompt not found: {}", request.name)))?;
  let messages = built_in_prompt_messages(prompt);
  let metadata = built_in_prompt_metadata(prompt)?;
  let session_contract = PromptSessionContract {
    prompt: PromptSessionPrompt {
      action: prompt.action.clone(),
      model: Some(prompt.model.clone()),
      prompt_tokens: count_prompt_tokens(Some(prompt.model.as_str()), &messages),
      template_params: metadata.template_params,
      messages,
    },
    turns: request.turns,
    render_params: request.render_params,
    max_token_size: request.max_token_size,
  };
  let template_params = value_to_map(session_contract.prompt.template_params.clone(), "prompt.templateParams")?;
  let render_params = value_to_map(session_contract.render_params.clone(), "renderParams")?;
  let response = render_session_prompt(&session_contract, &template_params, &render_params)
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

#[cfg(test)]
mod tests {
  use llm_adapter::core::prompt_template::{is_truthy_number, parse_template, render_tokens};
  use serde_json::json;

  use super::{llm_collect_prompt_metadata, llm_count_prompt_tokens, llm_render_prompt, llm_render_session_prompt};
  use crate::llm::core::contracts::{
    PromptMetadataContract, PromptRenderContract, PromptSessionContract, PromptTokenCountContract,
  };

  #[test]
  fn should_render_sections_and_current_item() {
    let tokens = parse_template("{{#links}}- {{.}}\n{{/links}}").unwrap();
    let rendered = render_tokens(
      &tokens,
      &[&json!({
        "links": ["https://affine.pro", "https://github.com/toeverything/affine"]
      })],
    );

    assert_eq!(
      rendered,
      "- https://affine.pro\n- https://github.com/toeverything/affine\n"
    );
  }

  #[test]
  fn should_render_prompt_with_normalized_params_and_attachments() {
    let response = llm_render_prompt(
      serde_json::from_value::<PromptRenderContract>(json!({
        "messages": [
          {
            "role": "system",
            "content": "tone={{tone}}"
          },
          {
            "role": "user",
            "content": "{{content}}"
          }
        ],
        "templateParams": { "tone": ["formal", "casual"] },
        "renderParams": {
          "attachments": ["https://affine.pro/example.jpg"],
          "content": "hello world"
        }
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "messages": [
          {
            "role": "system",
            "content": "tone=formal",
            "params": {
              "attachments": ["https://affine.pro/example.jpg"],
              "content": "hello world",
              "tone": "formal"
            }
          },
          {
            "role": "user",
            "content": "hello world",
            "attachments": ["https://affine.pro/example.jpg"],
            "params": {
              "attachments": ["https://affine.pro/example.jpg"],
              "content": "hello world",
              "tone": "formal"
            }
          }
        ],
        "warnings": ["Missing param value: tone, use default options: formal"]
      }),
    );
  }

  #[test]
  fn should_render_host_builtins_and_js_like_variable_strings() {
    let response = llm_render_prompt(
      serde_json::from_value::<PromptRenderContract>(json!({
        "messages": [
          {
            "role": "system",
            "content": "{{affine::language}}|{{tags}}|{{obj}}|{{#links}}- {{.}}\n{{/links}}"
          }
        ],
        "templateParams": {},
        "renderParams": {
          "language": "French",
          "affine::language": "ignored",
          "links": ["https://affine.pro", "https://github.com/toeverything/affine"],
          "obj": { "hello": "world" },
          "tags": ["a", "b"]
        }
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "messages": [
          {
            "role": "system",
            "content": "French|a,b|[object Object]|- https://affine.pro\n- https://github.com/toeverything/affine\n",
            "params": {
              "language": "French",
              "affine::language": "ignored",
              "links": ["https://affine.pro", "https://github.com/toeverything/affine"],
              "obj": { "hello": "world" },
              "tags": ["a", "b"]
            }
          }
        ],
        "warnings": []
      }),
    );
  }

  #[test]
  fn should_count_prompt_tokens_for_unknown_models_as_zero() {
    let response = llm_count_prompt_tokens(
      serde_json::from_value::<PromptTokenCountContract>(json!({
        "model": null,
        "messages": [{ "content": "hello" }]
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(response, json!({ "tokens": 0 }));
  }

  #[test]
  fn should_count_prompt_tokens_for_non_gpt_models_with_fallback_tokenizer() {
    let response = llm_count_prompt_tokens(
      serde_json::from_value::<PromptTokenCountContract>(json!({
        "model": "claude-3-5-sonnet",
        "messages": [{ "content": "hello" }]
      }))
      .unwrap(),
    )
    .unwrap();

    assert!(response.tokens > 0);
  }

  #[test]
  fn should_follow_js_truthiness_for_numbers() {
    assert!(!is_truthy_number(&serde_json::Number::from(0)));
    assert!(is_truthy_number(&serde_json::Number::from(1)));
    assert!(is_truthy_number(&serde_json::Number::from_f64(0.5).unwrap()));
  }

  #[test]
  fn should_render_session_prompt_by_merging_latest_user_content() {
    let response = llm_render_session_prompt(
      serde_json::from_value::<PromptSessionContract>(json!({
        "prompt": {
          "model": "test",
          "promptTokens": 0,
          "templateParams": {},
          "messages": [
            { "role": "system", "content": "answer briefly" },
            { "role": "user", "content": "{{content}}" }
          ]
        },
        "turns": [
          { "role": "user", "content": "hello", "attachments": ["https://affine.pro/hello.png"] }
        ],
        "renderParams": {},
        "maxTokenSize": 1000
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "messages": [
          { "role": "system", "content": "answer briefly", "params": { "content": "hello" } },
          {
            "role": "user",
            "content": "hello",
            "attachments": ["https://affine.pro/hello.png"],
            "params": { "content": "hello" }
          }
        ],
        "warnings": [],
        "promptMessagePositions": [0, 1]
      }),
    );
  }

  #[test]
  fn should_render_session_prompt_by_picking_recent_turns_under_budget() {
    let response = llm_render_session_prompt(
      serde_json::from_value::<PromptSessionContract>(json!({
        "prompt": {
          "model": "test",
          "promptTokens": 0,
          "templateParams": {},
          "messages": [
            { "role": "system", "content": "hello {{word}}" }
          ]
        },
        "turns": [
          { "role": "user", "content": "older turn" }
        ],
        "renderParams": { "word": "world" },
        "maxTokenSize": 0
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "messages": [
          { "role": "system", "content": "hello world", "params": { "word": "world" } }
        ],
        "warnings": [],
        "promptMessagePositions": [0]
      }),
    );
  }

  #[test]
  fn should_collect_prompt_metadata_from_templates_and_params() {
    let response = llm_collect_prompt_metadata(
      serde_json::from_value::<PromptMetadataContract>(json!({
        "messages": [
          {
            "role": "system",
            "content": "tone={{tone}}"
          },
          {
            "role": "user",
            "content": "{{content}}",
            "params": { "tone": ["formal", "casual"] }
          }
        ]
      }))
      .unwrap(),
    )
    .unwrap();
    let response = serde_json::to_value(response).unwrap();

    assert_eq!(
      response,
      json!({
        "paramKeys": ["tone", "content"],
        "templateParams": {
          "tone": ["formal", "casual"]
        }
      }),
    );
  }
}
