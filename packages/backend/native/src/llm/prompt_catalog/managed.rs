use super::{BTreeMap, BTreeSet, Deserialize, LazyLock, Serialize, built_in_prompt, napi};

static MANAGED_MODELS: LazyLock<BTreeMap<String, ManagedTarget>> = LazyLock::new(|| {
  serde_json::from_str(include_str!("../assets/prompts/managed-models.json"))
    .expect("built-in managed model routes must be valid JSON")
});
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct BuiltInManagedRouteSpec {
  pub(super) targets: Vec<String>,
  pub(super) operations: Vec<crate::llm::route::RouteOperation>,
  #[serde(default)]
  pub(super) premium_targets: Option<Vec<String>>,
  #[serde(default)]
  pub(super) selectable_targets: Vec<BuiltInManagedTargetSpec<String>>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuiltInManagedTargetSpec<T> {
  pub(crate) id: String,
  pub(crate) target: T,
  pub(crate) display_name: String,
  pub(crate) minimum_tier: BuiltInManagedTargetTier,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ManagedTarget {
  pub(crate) api_shapes: Vec<llm_adapter::backend::ApiShape>,
  pub(crate) model_id: String,
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

pub(crate) fn managed_model(reference: &str) -> Option<&'static ManagedTarget> {
  MANAGED_MODELS.get(reference)
}

pub(crate) fn llm_get_built_in_route_options(name: String) -> Option<BuiltInRouteOptions> {
  let prompt = built_in_prompt(&name)?;
  if prompt.managed_selectable_targets.is_empty() {
    return None;
  }
  let target_id_for_model = |model: Option<&ManagedTarget>| {
    model.and_then(|model| {
      prompt
        .managed_selectable_targets
        .iter()
        .find(|target| &target.target == model)
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

pub(super) fn resolve_managed_models(references: &[String]) -> Result<Vec<ManagedTarget>, String> {
  references
    .iter()
    .map(|reference| {
      managed_model(reference)
        .cloned()
        .ok_or_else(|| format!("Unknown managed model route: {reference}"))
    })
    .collect()
}

pub(super) fn valid_managed_route(route: &BuiltInManagedRouteSpec) -> bool {
  if route.targets.len() != 1
    || route.operations.is_empty()
    || route
      .targets
      .iter()
      .chain(route.premium_targets.iter().flatten())
      .any(|reference| managed_model(reference).is_none())
    || route.premium_targets.as_ref().is_some_and(|targets| targets.len() != 1)
  {
    return false;
  }
  let ids = route
    .selectable_targets
    .iter()
    .map(|choice| &choice.id)
    .collect::<BTreeSet<_>>();
  let models = route
    .selectable_targets
    .iter()
    .map(|choice| &choice.target)
    .collect::<BTreeSet<_>>();
  if ids.len() != route.selectable_targets.len()
    || models.len() != route.selectable_targets.len()
    || route.selectable_targets.iter().any(|choice| {
      choice.id.trim().is_empty() || choice.display_name.trim().is_empty() || managed_model(&choice.target).is_none()
    })
  {
    return false;
  }
  route.selectable_targets.is_empty()
    || route
      .targets
      .iter()
      .chain(route.premium_targets.iter().flatten())
      .all(|target| models.contains(target))
}
