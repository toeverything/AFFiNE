use std::{
  cell::Cell,
  sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc::Sender,
  },
  time::Instant,
};

use llm_runtime::{
  RecipeDefinition, RecipeRuntimeEvent, RecipeRuntimeOutput, RecipeRuntimeStatus, RecipeStepExecution,
  RecipeStepExecutor, StepExecutionError, execute_transform_step, execute_validate_json_step, resolve_state_ref,
  run_recipe_runtime, validate_json_schema,
};
use napi::{Error, Result, Status};
use serde_json::{Map, Value, json};

use super::{
  ActionEvent, ActionEventType, ActionRecipe, ActionRunStatus, ActionRuntimeInput, ActionRuntimeOutput,
  ActionStepError, ActionStepKind, ActionStepRuntimeState, ActionTrace, catalog::find_recipe,
  slides_outline::project_slides_outline_markdown,
};
use crate::llm::{
  LlmPreparedImageDispatchRoutePayload, dispatch_prepared_image_route_payloads, dispatch_prepared_structured_routes,
};

pub const ACTION_ABORTED_ERROR_CODE: &str = "action_aborted";
pub const ACTION_INVALID_STEP_ERROR_CODE: &str = "action_invalid_step";

#[derive(Clone, Debug, Default)]
pub struct ActionRuntimeControl {
  pub abort_signal: Option<Arc<AtomicBool>>,
  pub event_sender: Option<Sender<ActionEvent>>,
  #[cfg(test)]
  pub abort_after_events: Option<usize>,
  #[cfg(test)]
  pub mock_output: Option<Value>,
}

#[derive(Clone, Debug)]
pub struct ActionRuntimeState {
  pub status: ActionRunStatus,
  pub result: Value,
  pub action_state: Value,
  pub steps: Vec<ActionStepRuntimeState>,
  pub events: Vec<ActionEvent>,
  pub trace: ActionTrace,
  pub error_code: Option<String>,
}

fn invalid_input(message: impl Into<String>) -> Error {
  Error::new(Status::InvalidArg, message.into())
}

pub fn run_action_recipe_prepared_with_control(
  input: ActionRuntimeInput,
  control: ActionRuntimeControl,
) -> Result<ActionRuntimeOutput> {
  let recipe = find_recipe(&input.recipe_id, input.recipe_version.as_deref())?;
  validate_value("input", &recipe.input_schema, &input.input)?;

  run_recipe(recipe, input, control)
}

#[cfg(test)]
pub(crate) fn run_action_recipe_for_test(
  recipe: ActionRecipe,
  input: ActionRuntimeInput,
) -> Result<ActionRuntimeOutput> {
  validate_value("input", &recipe.input_schema, &input.input)?;
  run_recipe(recipe, input, ActionRuntimeControl::default())
}

#[cfg(test)]
pub(crate) fn run_action_recipe_for_test_with_control(
  recipe: ActionRecipe,
  input: ActionRuntimeInput,
  control: ActionRuntimeControl,
) -> Result<ActionRuntimeOutput> {
  validate_value("input", &recipe.input_schema, &input.input)?;
  run_recipe(recipe, input, control)
}

fn run_recipe(
  recipe: ActionRecipe,
  input: ActionRuntimeInput,
  control: ActionRuntimeControl,
) -> Result<ActionRuntimeOutput> {
  let mut runtime = Runtime::new(recipe, input, control);
  runtime.run()
}

struct Runtime {
  recipe: ActionRecipe,
  state: ActionRuntimeState,
  started_at: Instant,
  control: ActionRuntimeControl,
}

impl Runtime {
  fn new(recipe: ActionRecipe, input: ActionRuntimeInput, control: ActionRuntimeControl) -> Self {
    let trace = ActionTrace {
      action_id: recipe.id.clone(),
      action_version: recipe.version.clone(),
      status: ActionRunStatus::Created,
      lightweight: Vec::new(),
      error_code: None,
    };

    Self {
      recipe,
      state: ActionRuntimeState {
        status: ActionRunStatus::Created,
        result: input.input.clone(),
        action_state: input.input,
        steps: Vec::new(),
        events: Vec::new(),
        trace,
        error_code: None,
      },
      started_at: Instant::now(),
      control,
    }
  }

  fn run(&mut self) -> Result<ActionRuntimeOutput> {
    let recipe = self.recipe_definition();
    let action_id = self.recipe.id.clone();
    let action_version = self.recipe.version.clone();
    let output_schema = self.recipe.output_schema.clone();
    let step_patches = self
      .recipe
      .steps
      .iter()
      .map(|step| (step.id.clone(), step.state_patch.clone()))
      .collect::<std::collections::HashMap<_, _>>();
    let attachments = Arc::new(Mutex::new(Vec::new()));
    let mut executor = AffineActionStepExecutor::new(&self.control, attachments.clone());
    let mut events = Vec::new();
    let mut lightweight = Vec::new();
    let event_sender = self.control.event_sender.clone();
    let abort_signal = self.control.abort_signal.clone();
    let event_count = Cell::new(0usize);
    #[cfg(test)]
    let abort_after_events = self.control.abort_after_events;

    let mut record = |event: ActionEvent| {
      lightweight.push(json!({
        "type": event.event_type,
        "stepId": event.step_id,
        "status": event.status
      }));
      if let Some(sender) = &event_sender {
        let _ = sender.send(event.clone());
      }
      events.push(event);
      event_count.set(events.len());
    };

    let runtime_output = run_recipe_runtime(
      recipe,
      self.state.action_state.clone(),
      &mut executor,
      |event| {
        for action_event in map_recipe_event(&action_id, &action_version, event, &attachments) {
          record(action_event);
        }
      },
      || {
        abort_signal
          .as_ref()
          .is_some_and(|signal| signal.load(Ordering::SeqCst))
          || {
            #[cfg(test)]
            {
              abort_after_events.is_some_and(|max_events| event_count.get() >= max_events)
            }
            #[cfg(not(test))]
            {
              false
            }
          }
      },
    );

    if matches!(runtime_output.status, RecipeRuntimeStatus::Succeeded) {
      validate_value("output", &output_schema, &runtime_output.result)?;
    }

    self.state = self.action_state_from_runtime_output(runtime_output, events, lightweight, step_patches);
    self.finalize_trace();
    if let Some(event) = self
      .state
      .events
      .iter_mut()
      .rev()
      .find(|event| matches!(event.event_type, ActionEventType::ActionDone))
    {
      event.trace = Some(self.state.trace.clone());
    }
    Ok(self.output())
  }

  fn recipe_definition(&self) -> RecipeDefinition {
    RecipeDefinition {
      id: self.recipe.id.clone(),
      version: self.recipe.version.clone(),
      steps: self
        .recipe
        .steps
        .iter()
        .map(|step| RecipeStepExecution {
          id: step.id.clone(),
          kind: action_step_kind_name(step.kind).to_string(),
          input: step.input.clone(),
          state_patch: step.state_patch.clone(),
        })
        .collect(),
    }
  }

  fn action_state_from_runtime_output(
    &self,
    output: RecipeRuntimeOutput,
    events: Vec<ActionEvent>,
    lightweight: Vec<Value>,
    step_patches: std::collections::HashMap<String, Option<Value>>,
  ) -> ActionRuntimeState {
    let status = recipe_status_to_action_status(&output.status);
    let error_code = output
      .trace
      .error_code
      .as_deref()
      .map(map_recipe_error_code)
      .map(ToString::to_string);
    ActionRuntimeState {
      status,
      result: output.result,
      action_state: output.state,
      steps: output
        .steps
        .into_iter()
        .map(|step| ActionStepRuntimeState {
          id: step.id.clone(),
          input: step.input.unwrap_or(Value::Null),
          output: step.output,
          state_patch: step_patches.get(&step.id).cloned().flatten(),
          error: step.error.map(ActionStepError::from),
        })
        .collect(),
      events,
      trace: ActionTrace {
        action_id: self.recipe.id.clone(),
        action_version: self.recipe.version.clone(),
        status,
        lightweight,
        error_code: error_code.clone(),
      },
      error_code,
    }
  }

  fn output(&mut self) -> ActionRuntimeOutput {
    self.finalize_trace();

    ActionRuntimeOutput {
      result: self.state.result.clone(),
      status: self.state.status,
      error_code: self.state.error_code.clone(),
      state: self.state.action_state.clone(),
      steps: self.state.steps.clone(),
      trace: self.state.trace.clone(),
      events: self.state.events.clone(),
    }
  }

  fn finalize_trace(&mut self) {
    self.state.trace.status = self.state.status;
    if self
      .state
      .trace
      .lightweight
      .last()
      .and_then(|event| event.get("type"))
      .is_some_and(|event_type| event_type == "action_trace")
    {
      return;
    }
    self.state.trace.lightweight.push(json!({
      "type": "action_trace",
      "actionId": self.recipe.id.clone(),
      "actionVersion": self.recipe.version.clone(),
      "status": self.state.status,
      "durationMs": self.started_at.elapsed().as_millis()
    }));
  }
}

fn recipe_status_to_action_status(status: &RecipeRuntimeStatus) -> ActionRunStatus {
  match status {
    RecipeRuntimeStatus::Created => ActionRunStatus::Created,
    RecipeRuntimeStatus::Running => ActionRunStatus::Running,
    RecipeRuntimeStatus::Succeeded => ActionRunStatus::Succeeded,
    RecipeRuntimeStatus::Failed => ActionRunStatus::Failed,
    RecipeRuntimeStatus::Aborted => ActionRunStatus::Aborted,
  }
}

fn map_recipe_error_code(code: &str) -> &str {
  match code {
    "aborted" => ACTION_ABORTED_ERROR_CODE,
    "invalid_step" | "invalid_schema" | "invalid_value" => ACTION_INVALID_STEP_ERROR_CODE,
    other => other,
  }
}

fn map_recipe_event(
  action_id: &str,
  action_version: &str,
  event: &RecipeRuntimeEvent,
  attachments: &Arc<Mutex<Vec<Value>>>,
) -> Vec<ActionEvent> {
  let status = recipe_status_to_action_status(&event.status);
  let mut events = Vec::new();
  if event.event_type == "step_end" {
    let mut pending = attachments.lock().expect("attachment queue lock");
    events.extend(pending.drain(..).map(|attachment| ActionEvent {
      event_type: ActionEventType::Attachment,
      action_id: action_id.to_string(),
      action_version: action_version.to_string(),
      step_id: None,
      status: Some(ActionRunStatus::Running),
      attachment: Some(attachment),
      result: None,
      error_code: None,
      error_message: None,
      trace: None,
    }));
  }

  let event_type = match event.event_type.as_str() {
    "recipe_start" => ActionEventType::ActionStart,
    "step_start" => ActionEventType::StepStart,
    "step_end" => ActionEventType::StepEnd,
    "recipe_done" => ActionEventType::ActionDone,
    "error" => ActionEventType::Error,
    _ => return events,
  };
  let error = event.error.as_ref();
  events.push(ActionEvent {
    event_type,
    action_id: action_id.to_string(),
    action_version: action_version.to_string(),
    step_id: event.step_id.clone(),
    status: Some(status),
    attachment: None,
    result: event.result.clone(),
    error_code: error.map(|error| map_recipe_error_code(&error.code).to_string()),
    error_message: error.map(|error| error.message.clone()),
    trace: None,
  });
  events
}

impl From<StepExecutionError> for ActionStepError {
  fn from(error: StepExecutionError) -> Self {
    let code = if error.code == "invalid_step" || error.code == "invalid_schema" || error.code == "invalid_value" {
      ACTION_INVALID_STEP_ERROR_CODE.to_string()
    } else {
      error.code
    };
    Self {
      code,
      message: error.message,
    }
  }
}

fn action_step_kind_name(kind: ActionStepKind) -> &'static str {
  match kind {
    ActionStepKind::PromptStructured => "promptStructured",
    ActionStepKind::PromptImage => "promptImage",
    ActionStepKind::ValidateJson => "validateJson",
    ActionStepKind::Transform => "transform",
    ActionStepKind::Final => "final",
  }
}

struct AffineActionStepExecutor<'a> {
  #[cfg(test)]
  control: &'a ActionRuntimeControl,
  #[cfg(not(test))]
  _marker: std::marker::PhantomData<&'a ()>,
  attachments: Arc<Mutex<Vec<Value>>>,
}

impl<'a> AffineActionStepExecutor<'a> {
  fn new(_control: &'a ActionRuntimeControl, attachments: Arc<Mutex<Vec<Value>>>) -> Self {
    Self {
      #[cfg(test)]
      control: _control,
      #[cfg(not(test))]
      _marker: std::marker::PhantomData,
      attachments,
    }
  }

  fn test_mock_output(&self, _step_id: &str) -> Option<&Value> {
    #[cfg(test)]
    {
      self
        .control
        .mock_output
        .as_ref()
        .and_then(|mock_output| mock_output.get(_step_id))
        .filter(|value| !value.is_null())
    }
    #[cfg(not(test))]
    {
      None
    }
  }

  fn prompt_structured_step(
    &self,
    step: &RecipeStepExecution,
    input: Option<Value>,
  ) -> std::result::Result<Value, StepExecutionError> {
    let value = if let Some(routes) = input
      .as_ref()
      .and_then(|input| input.get("preparedRoutes"))
      .filter(|routes| !routes.is_null())
    {
      let (_provider_id, response) =
        dispatch_prepared_structured_routes(&serde_json::to_string(routes).map_err(|error| {
          StepExecutionError::new(
            "invalid_step",
            format!("Invalid promptStructured prepared routes: {error}"),
          )
        })?)
        .map_err(|error| StepExecutionError::new("invalid_step", error.reason.clone()))?;
      response.output_json.unwrap_or(Value::Null)
    } else if let Some(mock_output) = self.test_mock_output(&step.id) {
      mock_output.clone()
    } else {
      return Err(StepExecutionError::new(
        "invalid_step",
        "promptStructured requires preparedRoutes",
      ));
    };
    Ok(
      input
        .as_ref()
        .and_then(|input| input.get("unwrapKey"))
        .and_then(Value::as_str)
        .and_then(|key| value.get(key).cloned())
        .unwrap_or(value),
    )
  }

  fn prompt_image_step(
    &mut self,
    step: &RecipeStepExecution,
    input: Option<Value>,
  ) -> std::result::Result<Value, StepExecutionError> {
    let attachment = if let Some(routes) = input
      .as_ref()
      .and_then(|input| input.get("preparedRoutes"))
      .filter(|routes| !routes.is_null())
    {
      let payload =
        serde_json::from_value::<Vec<LlmPreparedImageDispatchRoutePayload>>(routes.clone()).map_err(|error| {
          StepExecutionError::new("invalid_step", format!("Invalid promptImage prepared routes: {error}"))
        })?;
      let (_provider_id, response) = dispatch_prepared_image_route_payloads(payload)
        .map_err(|error| StepExecutionError::new("invalid_step", error.reason.clone()))?;
      image_response_attachment(response.provider_metadata, response.images)
        .ok_or_else(|| StepExecutionError::new("invalid_step", "promptImage native dispatch produced no image"))?
    } else if let Some(mock_output) = self.test_mock_output(&step.id) {
      mock_output.clone()
    } else {
      return Err(StepExecutionError::new(
        "invalid_step",
        "promptImage requires preparedRoutes",
      ));
    };
    self
      .attachments
      .lock()
      .expect("attachment queue lock")
      .push(attachment.clone());
    Ok(attachment)
  }

  fn transform_step(&self, input: Option<Value>, state: &Value) -> std::result::Result<Value, StepExecutionError> {
    if let Some(value) = execute_transform_step(input.clone(), state)? {
      return Ok(value);
    }

    let Some(input) = input else {
      return Ok(state.clone());
    };
    if let Some(slides_outline) = input.get("slidesOutlineMarkdown") {
      let value = resolve_state_ref(slides_outline, state);
      return project_slides_outline_markdown(&value)
        .map(Value::String)
        .map_err(|message| StepExecutionError::new("invalid_step", message));
    }

    Ok(input)
  }
}

impl RecipeStepExecutor for AffineActionStepExecutor<'_> {
  fn execute_step(
    &mut self,
    step: &RecipeStepExecution,
    input: Option<Value>,
    state: &Value,
  ) -> std::result::Result<Value, StepExecutionError> {
    match step.kind.as_str() {
      "promptStructured" => self.prompt_structured_step(step, input),
      "promptImage" => self.prompt_image_step(step, input),
      "validateJson" => execute_validate_json_step(input.or_else(|| Some(state.clone()))),
      "transform" | "final" => self.transform_step(input, state),
      other => Err(StepExecutionError::new(
        "invalid_step",
        format!("Unsupported action step kind: {other}"),
      )),
    }
  }
}

fn image_response_attachment(provider_metadata: Value, images: Vec<llm_adapter::core::ImageArtifact>) -> Option<Value> {
  let image = images.into_iter().next()?;
  let mut attachment = Map::new();
  if let Some(url) = image.url {
    attachment.insert("url".to_string(), Value::String(url));
  }
  if let Some(data_base64) = image.data_base64 {
    attachment.insert("data_base64".to_string(), Value::String(data_base64));
  }
  attachment.insert("media_type".to_string(), Value::String(image.media_type));
  if let Some(width) = image.width {
    attachment.insert("width".to_string(), json!(width));
  }
  if let Some(height) = image.height {
    attachment.insert("height".to_string(), json!(height));
  }
  if !image.provider_metadata.is_null() {
    attachment.insert("providerMetadata".to_string(), image.provider_metadata);
  } else if !provider_metadata.is_null() {
    attachment.insert("providerMetadata".to_string(), provider_metadata);
  }
  if !attachment.contains_key("url") && !attachment.contains_key("data_base64") {
    return None;
  }
  Some(Value::Object(attachment))
}

fn validate_value(label: &str, schema: &Value, value: &Value) -> Result<()> {
  validate_json_schema(label, schema, value).map_err(|error| invalid_input(error.message))
}
