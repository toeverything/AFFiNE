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
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInPromptSpec {
  pub name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub action: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub config: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub params: Option<BTreeMap<String, PromptParamSpec>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub builtins: Option<Vec<PromptBuiltin>>,
  pub messages: Vec<PromptSpecMessage>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PromptCatalogSpec {
  name: String,
  #[serde(default)]
  action: Option<String>,
  #[serde(default)]
  managed_route: Option<BuiltInManagedRouteSpec>,
  #[serde(default)]
  config: Option<Value>,
  #[serde(default)]
  params: Option<BTreeMap<String, PromptParamSpec>>,
  #[serde(default)]
  builtins: Option<Vec<PromptBuiltin>>,
  messages: Vec<PromptSpecMessage>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BuiltInManagedRouteSpec {
  targets: Vec<String>,
  #[serde(default)]
  premium_targets: Option<Vec<String>>,
  #[serde(default)]
  selectable_targets: Vec<BuiltInManagedTargetSpec>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BuiltInManagedTargetSpec {
  id: String,
  model_id: String,
  display_name: String,
  minimum_tier: BuiltInManagedTargetTier,
}

#[napi(string_enum)]
#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BuiltInManagedTargetTier {
  Standard,
  Premium,
}

#[napi(object)]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInManagedTarget {
  pub id: String,
  pub display_name: String,
  pub minimum_tier: BuiltInManagedTargetTier,
}

#[napi(object)]
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInRouteOptions {
  pub route_id: String,
  pub standard_default_target_id: Option<String>,
  pub premium_default_target_id: Option<String>,
  pub choices: Vec<BuiltInManagedTarget>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltInPromptMessage {
  pub(crate) role: String,
  pub(crate) content: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) params: Option<Map<String, Value>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BuiltInPrompt {
  pub(crate) name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) action: Option<String>,
  pub(crate) managed_targets: Vec<String>,
  pub(crate) managed_premium_targets: Option<Vec<String>>,
  #[serde(skip)]
  pub(crate) managed_selectable_targets: Vec<BuiltInManagedTargetDefinition>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub(crate) config: Option<Value>,
  pub(crate) messages: Vec<BuiltInPromptMessage>,
}

#[derive(Clone)]
pub(crate) struct BuiltInManagedTargetDefinition {
  pub(crate) id: String,
  pub(crate) model_id: String,
  pub(crate) display_name: String,
  pub(crate) minimum_tier: BuiltInManagedTargetTier,
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

pub(crate) fn built_in_managed_targets(name: &str, premium: bool) -> Option<&'static [String]> {
  built_in_prompt(name).and_then(|prompt| {
    let targets = if premium {
      prompt
        .managed_premium_targets
        .as_deref()
        .unwrap_or(prompt.managed_targets.as_slice())
    } else {
      prompt.managed_targets.as_slice()
    };
    (!targets.is_empty()).then_some(targets)
  })
}

pub(crate) fn built_in_managed_target(
  name: &str,
  target_id: &str,
  premium: bool,
) -> Option<&'static BuiltInManagedTargetDefinition> {
  built_in_prompt(name)?
    .managed_selectable_targets
    .iter()
    .find(|target| target.id == target_id && (premium || target.minimum_tier == BuiltInManagedTargetTier::Standard))
}

#[napi(catch_unwind)]
pub fn llm_get_built_in_route_options(name: String) -> Option<BuiltInRouteOptions> {
  let prompt = built_in_prompt(&name)?;
  if prompt.managed_selectable_targets.is_empty() {
    return None;
  }
  let target_id_for_model = |model: Option<&String>| {
    model.and_then(|model| {
      prompt
        .managed_selectable_targets
        .iter()
        .find(|target| &target.model_id == model)
        .map(|target| target.id.clone())
    })
  };
  Some(BuiltInRouteOptions {
    route_id: prompt.name.clone(),
    standard_default_target_id: target_id_for_model(prompt.managed_targets.first()),
    premium_default_target_id: target_id_for_model(
      prompt
        .managed_premium_targets
        .as_ref()
        .and_then(|targets| targets.first())
        .or_else(|| prompt.managed_targets.first()),
    ),
    choices: prompt
      .managed_selectable_targets
      .iter()
      .map(|target| BuiltInManagedTarget {
        id: target.id.clone(),
        display_name: target.display_name.clone(),
        minimum_tier: target.minimum_tier,
      })
      .collect(),
  })
}

impl PromptCatalog {
  fn load() -> Result<Self, String> {
    let partials: BTreeMap<String, String> =
      serde_json::from_str(PROMPT_PARTIALS_SOURCE).map_err(|error| format!("invalid prompt partials JSON: {error}"))?;
    let catalog_specs: Vec<PromptCatalogSpec> =
      serde_json::from_str(PROMPT_SPECS_SOURCE).map_err(|error| format!("invalid prompt spec JSON: {error}"))?;
    let prompts = catalog_specs
      .iter()
      .map(|spec| compile_prompt_spec(spec, &partials))
      .collect::<Result<Vec<_>, _>>()?;
    let specs = catalog_specs
      .into_iter()
      .map(|spec| BuiltInPromptSpec {
        name: spec.name,
        action: spec.action,
        config: spec.config.filter(|value| !value.is_null()),
        params: spec.params,
        builtins: spec.builtins,
        messages: spec.messages,
      })
      .collect::<Vec<_>>();

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

fn compile_prompt_spec(spec: &PromptCatalogSpec, partials: &BTreeMap<String, String>) -> Result<BuiltInPrompt, String> {
  if spec
    .managed_route
    .as_ref()
    .is_some_and(|route| !valid_managed_route(route))
  {
    return Err(format!("Prompt \"{}\" has an invalid managed route", spec.name));
  }
  if !spec.messages.is_empty() && spec.managed_route.is_none() {
    return Err(format!("Executable prompt \"{}\" requires a managed route", spec.name));
  }
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
    managed_targets: spec
      .managed_route
      .as_ref()
      .map(|route| route.targets.clone())
      .unwrap_or_default(),
    managed_premium_targets: spec
      .managed_route
      .as_ref()
      .and_then(|route| route.premium_targets.clone()),
    managed_selectable_targets: spec
      .managed_route
      .as_ref()
      .map(|route| {
        route
          .selectable_targets
          .iter()
          .map(|target| BuiltInManagedTargetDefinition {
            id: target.id.clone(),
            model_id: target.model_id.clone(),
            display_name: target.display_name.clone(),
            minimum_tier: target.minimum_tier,
          })
          .collect()
      })
      .unwrap_or_default(),
    config: spec.config.clone().filter(|value| !value.is_null()),
    messages,
  })
}

fn valid_managed_route(route: &BuiltInManagedRouteSpec) -> bool {
  if route.targets.is_empty()
    || route.targets.iter().any(|target| target.trim().is_empty())
    || route
      .premium_targets
      .as_ref()
      .is_some_and(|targets| targets.is_empty() || targets.iter().any(|target| target.trim().is_empty()))
  {
    return false;
  }
  let ids = route
    .selectable_targets
    .iter()
    .map(|target| target.id.as_str())
    .collect::<BTreeSet<_>>();
  let models = route
    .selectable_targets
    .iter()
    .map(|target| target.model_id.as_str())
    .collect::<BTreeSet<_>>();
  if route.selectable_targets.iter().any(|target| {
    target.id.trim().is_empty() || target.model_id.trim().is_empty() || target.display_name.trim().is_empty()
  }) || ids.len() != route.selectable_targets.len()
    || models.len() != route.selectable_targets.len()
  {
    return false;
  }
  route.selectable_targets.is_empty()
    || route
      .targets
      .iter()
      .chain(route.premium_targets.iter().flatten())
      .all(|model| models.contains(model.as_str()))
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

fn validate_builtins(spec: &PromptCatalogSpec, templates: &[String]) -> Result<(), String> {
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
  fn should_load_prompt_catalog() {
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

    let chat = built_in_prompt("Chat With AFFiNE AI").expect("chat prompt");
    let chat_tools = chat
      .config
      .as_ref()
      .and_then(|config| config.get("tools"))
      .and_then(Value::as_array)
      .expect("chat tools");
    assert!(chat_tools.iter().any(|tool| tool == "artifactRead"));
    assert!(chat_tools.iter().any(|tool| tool == "artifactSearch"));
    assert!(!chat_tools.iter().any(|tool| tool == "contextSearch"));
    assert!(!chat_tools.iter().any(|tool| tool == "blobRead"));
    assert_eq!(chat.managed_targets, ["gpt-5.6-luna"]);
    assert_eq!(
      chat
        .managed_premium_targets
        .as_deref()
        .map(|targets| targets.iter().map(String::as_str).collect::<Vec<_>>()),
      Some(vec!["gpt-5.6-luna"])
    );
    let options = llm_get_built_in_route_options(chat.name.clone()).expect("chat route options");
    assert_eq!(options.standard_default_target_id.as_deref(), Some("luna"));
    assert_eq!(options.premium_default_target_id.as_deref(), Some("luna"));
    assert_eq!(options.choices.len(), 4);
    assert_eq!(
      built_in_managed_target(&chat.name, "terra", false).map(|target| target.model_id.as_str()),
      None
    );
    assert_eq!(
      built_in_managed_target(&chat.name, "terra", true).map(|target| target.model_id.as_str()),
      Some("gpt-5.6-terra")
    );

    let transcript = built_in_prompt("Transcript audio structured").expect("transcript prompt");
    assert_eq!(transcript.managed_targets, ["gemini-3.7-flash"]);
    assert_eq!(
      transcript
        .managed_premium_targets
        .as_deref()
        .map(|targets| targets.iter().map(String::as_str).collect::<Vec<_>>()),
      Some(vec!["gemini-3.7-flash"])
    );
  }
}
