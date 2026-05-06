use std::{
  collections::{BTreeMap, BTreeSet, HashMap},
  sync::LazyLock,
};

use llm_adapter::core::prompt_template::{TemplateToken, parse_template};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

static PROMPT_PARTIALS_SOURCE: &str = include_str!("assets/partials/common.json");
static PROMPT_SPECS_SOURCE: &str = include_str!("assets/prompts/built-in.json");

static BUILTIN_PROMPT_CATALOG: LazyLock<PromptCatalog> = LazyLock::new(|| {
  PromptCatalog::load().unwrap_or_else(|error| panic!("Failed to load built-in prompt catalog: {error}"))
});

#[napi(string_enum)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptBuiltin {
  Date,
  Language,
  Timezone,
  HasDocs,
  HasFiles,
  HasSelected,
  HasCurrentDoc,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PromptParamSpec {
  #[serde(default)]
  pub default: Option<String>,
  #[serde(default, rename = "enum")]
  pub enum_values: Option<Vec<String>>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PromptSpecMessage {
  #[napi(ts_type = "'system' | 'assistant' | 'user'")]
  pub role: String,
  pub template: String,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInPromptSpec {
  pub name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub action: Option<String>,
  pub model: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub optional_models: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub config: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub params: Option<BTreeMap<String, PromptParamSpec>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub builtins: Option<Vec<PromptBuiltin>>,
  pub messages: Vec<PromptSpecMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltInPromptMessage {
  pub(crate) role: String,
  pub(crate) content: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) params: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltInPrompt {
  pub(crate) name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) action: Option<String>,
  pub(crate) model: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) optional_models: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) config: Option<Value>,
  pub(crate) messages: Vec<BuiltInPromptMessage>,
}

struct PromptCatalog {
  specs: Vec<BuiltInPromptSpec>,
  prompts: Vec<BuiltInPrompt>,
  specs_by_name: HashMap<String, usize>,
  prompts_by_name: HashMap<String, usize>,
}

pub(crate) fn built_in_prompt_specs() -> &'static [BuiltInPromptSpec] {
  &BUILTIN_PROMPT_CATALOG.specs
}

pub(crate) fn built_in_prompt_spec(name: &str) -> Option<&'static BuiltInPromptSpec> {
  BUILTIN_PROMPT_CATALOG
    .specs_by_name
    .get(name)
    .and_then(|index| BUILTIN_PROMPT_CATALOG.specs.get(*index))
}

pub(crate) fn built_in_prompt(name: &str) -> Option<&'static BuiltInPrompt> {
  BUILTIN_PROMPT_CATALOG
    .prompts_by_name
    .get(name)
    .and_then(|index| BUILTIN_PROMPT_CATALOG.prompts.get(*index))
}

impl PromptCatalog {
  fn load() -> Result<Self, String> {
    let partials: BTreeMap<String, String> =
      serde_json::from_str(PROMPT_PARTIALS_SOURCE).map_err(|error| format!("invalid prompt partials JSON: {error}"))?;
    let specs: Vec<BuiltInPromptSpec> =
      serde_json::from_str(PROMPT_SPECS_SOURCE).map_err(|error| format!("invalid prompt spec JSON: {error}"))?;
    let prompts = specs
      .iter()
      .map(|spec| compile_prompt_spec(spec, &partials))
      .collect::<Result<Vec<_>, _>>()?;

    Ok(Self {
      specs_by_name: specs
        .iter()
        .enumerate()
        .map(|(index, spec)| (spec.name.clone(), index))
        .collect(),
      prompts_by_name: prompts
        .iter()
        .enumerate()
        .map(|(index, prompt)| (prompt.name.clone(), index))
        .collect(),
      specs,
      prompts,
    })
  }
}

fn compile_prompt_spec(spec: &BuiltInPromptSpec, partials: &BTreeMap<String, String>) -> Result<BuiltInPrompt, String> {
  let resolved_templates = spec
    .messages
    .iter()
    .map(|message| resolve_prompt_template(&message.template, partials))
    .collect::<Result<Vec<_>, _>>()?;

  validate_builtins(spec, &resolved_templates)?;

  let normalized_params = spec
    .params
    .clone()
    .unwrap_or_default()
    .into_iter()
    .map(|(key, value)| (key, normalize_prompt_param(&value)))
    .collect::<Map<_, _>>();

  let messages = spec
    .messages
    .iter()
    .enumerate()
    .map(|(index, message)| {
      let content = resolved_templates[index].clone();
      let tokens = parse_template(&content)?;
      let template_keys = collect_template_keys(&tokens)
        .into_iter()
        .filter(|key| normalized_params.contains_key(key))
        .collect::<Vec<_>>();
      let params = (!template_keys.is_empty()).then(|| {
        template_keys
          .into_iter()
          .filter_map(|key| normalized_params.get(&key).cloned().map(|value| (key, value)))
          .collect::<Map<_, _>>()
      });

      Ok(BuiltInPromptMessage {
        role: message.role.clone(),
        content,
        params,
      })
    })
    .collect::<Result<Vec<_>, String>>()?;

  Ok(BuiltInPrompt {
    name: spec.name.clone(),
    action: spec.action.clone(),
    model: spec.model.clone(),
    optional_models: spec.optional_models.clone(),
    config: spec.config.clone().filter(|value| !value.is_null()),
    messages,
  })
}

fn normalize_prompt_param(spec: &PromptParamSpec) -> Value {
  match spec.enum_values.as_ref() {
    Some(values) if !values.is_empty() => {
      let values = values
        .iter()
        .filter(|value| !value.is_empty())
        .cloned()
        .collect::<Vec<_>>();
      if let Some(default) = spec.default.as_ref() {
        let ordered = std::iter::once(default.clone())
          .chain(values.into_iter().filter(|value| value != default))
          .collect::<Vec<_>>();
        Value::Array(ordered.into_iter().map(Value::String).collect())
      } else {
        Value::Array(values.into_iter().map(Value::String).collect())
      }
    }
    _ => Value::String(spec.default.clone().unwrap_or_default()),
  }
}

fn resolve_prompt_template(template: &str, partials: &BTreeMap<String, String>) -> Result<String, String> {
  let mut next = template.to_string();

  for _ in 0..10 {
    let mut cursor = 0usize;
    let mut resolved = String::new();
    let mut replaced = false;

    while let Some(open_offset) = next[cursor..].find("{{>") {
      let start = cursor + open_offset;
      resolved.push_str(&next[cursor..start]);
      let tag_start = start + 3;
      let Some(close_offset) = next[tag_start..].find("}}") else {
        return Err("Unclosed prompt partial tag".to_string());
      };
      let close = tag_start + close_offset;
      let partial_name = next[tag_start..close].trim();
      let partial = partials
        .get(partial_name)
        .ok_or_else(|| format!("Unknown prompt partial \"{partial_name}\""))?;
      resolved.push_str(partial);
      cursor = close + 2;
      replaced = true;
    }

    if !replaced {
      return Ok(next);
    }

    resolved.push_str(&next[cursor..]);
    next = resolved;
  }

  Err("Prompt partial expansion exceeded maximum depth".to_string())
}

fn validate_builtins(spec: &BuiltInPromptSpec, templates: &[String]) -> Result<(), String> {
  let declared = spec
    .builtins
    .clone()
    .unwrap_or_default()
    .into_iter()
    .collect::<BTreeSet<_>>();
  let mut used = BTreeSet::new();

  for template in templates {
    let tokens = parse_template(template)?;
    collect_builtins(&tokens, &mut used);
  }

  for builtin in used {
    if !declared.contains(&builtin) {
      return Err(format!(
        "Prompt \"{}\" uses builtin \"{:?}\" without declaring it",
        spec.name, builtin
      ));
    }
  }

  Ok(())
}

fn collect_template_keys(tokens: &[TemplateToken]) -> BTreeSet<String> {
  let mut keys = BTreeSet::new();
  collect_template_keys_into(tokens, &mut keys);
  keys
}

fn collect_template_keys_into(tokens: &[TemplateToken], keys: &mut BTreeSet<String>) {
  for token in tokens {
    match token {
      TemplateToken::Variable(name) => {
        if name != "." {
          keys.insert(name.clone());
        }
      }
      TemplateToken::Section { name, children } => {
        if name != "." {
          keys.insert(name.clone());
        }
        collect_template_keys_into(children, keys);
      }
      TemplateToken::Text(_) => {}
    }
  }
}

fn collect_builtins(tokens: &[TemplateToken], builtins: &mut BTreeSet<PromptBuiltin>) {
  for token in tokens {
    match token {
      TemplateToken::Variable(name) | TemplateToken::Section { name, .. } => {
        if let Some(builtin) = builtin_from_token(name) {
          builtins.insert(builtin);
        }
        if let TemplateToken::Section { children, .. } = token {
          collect_builtins(children, builtins);
        }
      }
      TemplateToken::Text(_) => {}
    }
  }
}

fn builtin_from_token(name: &str) -> Option<PromptBuiltin> {
  match name {
    "affine::date" => Some(PromptBuiltin::Date),
    "affine::language" => Some(PromptBuiltin::Language),
    "affine::timezone" => Some(PromptBuiltin::Timezone),
    "affine::hasDocsRef" => Some(PromptBuiltin::HasDocs),
    "affine::hasFilesRef" => Some(PromptBuiltin::HasFiles),
    "affine::hasSelected" => Some(PromptBuiltin::HasSelected),
    "affine::hasCurrentDoc" => Some(PromptBuiltin::HasCurrentDoc),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn should_expand_partials_and_collect_prompt_params() {
    let prompt = built_in_prompt("Translate to").expect("translate prompt");
    let user_message = prompt
      .messages
      .iter()
      .find(|message| message.role == "user")
      .expect("translate user message");

    assert!(user_message.content.contains("Translate"));
    assert_eq!(
      user_message
        .params
        .as_ref()
        .and_then(|params| params.get("language"))
        .and_then(Value::as_array)
        .map(|values| values.len()),
      Some(11)
    );
  }
}
