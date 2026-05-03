mod catalog;
mod contract;
mod runtime;
mod slides_outline;

use std::sync::{Arc, atomic::AtomicBool, mpsc};

#[cfg(test)]
use catalog::{load_catalog, validate_catalog, validate_recipe};
use contract::{
  ActionEvent, ActionEventType, ActionRecipe, ActionRecipeStep, ActionRunStatus, ActionRuntimeInput,
  ActionRuntimeOutput, ActionStepError, ActionStepKind, ActionStepRuntimeState, ActionTrace,
};
pub(crate) use contract::{TranscriptGeneratedResult, TranscriptInputContract, TranscriptResult};
use napi::{
  Result,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
#[cfg(test)]
use runtime::{ACTION_ABORTED_ERROR_CODE, run_action_recipe_for_test, run_action_recipe_for_test_with_control};
use runtime::{ActionRuntimeControl, run_action_recipe_prepared_with_control};

use crate::llm::{LlmStreamHandle, STREAM_END_MARKER};

#[napi(catch_unwind)]
pub fn run_native_action_recipe_prepared_stream(
  input: ActionRuntimeInput,
  callback: ThreadsafeFunction<String, ()>,
) -> Result<LlmStreamHandle> {
  let action_id = input.recipe_id.clone();
  let action_version = input.recipe_version.clone().unwrap_or_default();
  let aborted = Arc::new(AtomicBool::new(false));
  let aborted_in_worker = aborted.clone();
  let (event_sender, event_receiver) = mpsc::channel::<ActionEvent>();
  let error_sender = event_sender.clone();

  std::thread::spawn(move || {
    if let Err(error) = run_action_recipe_prepared_with_control(
      input,
      ActionRuntimeControl {
        abort_signal: Some(aborted_in_worker.clone()),
        event_sender: Some(event_sender),
        #[cfg(test)]
        abort_after_events: None,
        #[cfg(test)]
        mock_output: None,
      },
    ) {
      let _ = error_sender.send(ActionEvent {
        event_type: ActionEventType::Error,
        action_id,
        action_version,
        step_id: None,
        status: Some(ActionRunStatus::Failed),
        attachment: None,
        result: None,
        error_code: Some("action_runtime_error".to_string()),
        error_message: Some(error.reason.clone()),
        trace: None,
      });
    }
  });

  std::thread::spawn(move || {
    for event in event_receiver {
      match serde_json::to_string(&event) {
        Ok(event) => {
          let _ = callback.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
        }
        Err(error) => {
          let _ = callback.call(
            Ok(
              serde_json::json!({
                "type": "error",
                "actionId": event.action_id,
                "actionVersion": event.action_version,
                "errorCode": "action_event_encode_failed",
                "errorMessage": error.to_string()
              })
              .to_string(),
            ),
            ThreadsafeFunctionCallMode::NonBlocking,
          );
          break;
        }
      }
    }

    let _ = callback.call(
      Ok(STREAM_END_MARKER.to_string()),
      ThreadsafeFunctionCallMode::NonBlocking,
    );
  });

  Ok(LlmStreamHandle { aborted })
}

#[cfg(test)]
mod tests;
