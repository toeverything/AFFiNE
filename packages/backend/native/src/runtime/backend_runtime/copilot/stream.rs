use std::{
  collections::HashMap,
  sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc,
  },
};

use llm_adapter::{
  backend::{BackendError, DefaultHttpClient},
  core::CoreMessage,
  router::ExecutableRequest,
};
use llm_runtime::{
  AccumulatedToolCall, RuntimeRouteEvent, ToolCallbackRequest, ToolCallbackResponse, ToolExecutionResult,
  ToolLoopEvent, dispatch_compiled_round, run_tool_loop,
};
use napi::{
  JsValue, Result, Status,
  bindgen_prelude::{CallbackContext, PromiseRaw, Unknown},
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use zeroize::Zeroizing;

use super::{BackendRuntime, RuntimeError, dispatch, to_napi_error};
use crate::{
  llm::{
    CopilotExecuteInput,
    route::{AuthorizedProfileRef, AuthorizedTargetRef, CatalogSlot},
  },
  runtime::BackendRuntimeConfig,
};

pub(super) type PreparedCopilotExecution = (
  Arc<BackendRuntimeConfig>,
  CatalogSlot,
  ExecutableRequest,
  Vec<AuthorizedProfileRef>,
  Vec<AuthorizedTargetRef>,
  HashMap<String, Zeroizing<String>>,
);

const STREAM_END: &str = "__AFFINE_COPILOT_STREAM_END__";

#[napi_derive::napi]
pub struct CopilotStreamHandle {
  aborted: Arc<AtomicBool>,
}

#[napi_derive::napi]
impl CopilotStreamHandle {
  #[napi]
  pub fn abort(&self) {
    self.aborted.store(true, Ordering::Relaxed);
  }
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn execute_copilot_stream(
    &self,
    input: CopilotExecuteInput,
    max_steps: u32,
    callback: ThreadsafeFunction<String, ()>,
    tool_callback: ThreadsafeFunction<String, PromiseRaw<'static, String>>,
  ) -> Result<CopilotStreamHandle> {
    let (config, slot, request, profiles, candidates, managed_credentials) =
      self.prepare_copilot(input).await.map_err(to_napi_error)?;
    let messages = match &request {
      ExecutableRequest::Chat(request) => request.messages.clone(),
      _ => {
        return Err(to_napi_error(RuntimeError::invalid_input(
          "copilot stream requires a chat slot",
        )));
      }
    };
    let mut execution =
      dispatch::compile_execution(&config, slot, request, &profiles, &candidates, &managed_credentials)
        .map_err(to_napi_error)?;
    let aborted = Arc::new(AtomicBool::new(false));
    let worker_aborted = aborted.clone();
    std::thread::spawn(move || {
      let result = run_stream(
        &mut execution,
        messages,
        max_steps.max(1) as usize,
        &callback,
        &tool_callback,
        &worker_aborted,
      );
      if let Err(message) = result
        && !worker_aborted.load(Ordering::Relaxed)
      {
        let _ = emit_json(
          &callback,
          &serde_json::json!({
            "type": "error",
            "errorKind": "dispatch",
            "message": message,
          }),
        );
      }
      let _ = callback.call(Ok(STREAM_END.to_string()), ThreadsafeFunctionCallMode::NonBlocking);
    });
    Ok(CopilotStreamHandle { aborted })
  }
}

fn run_stream(
  execution: &mut dispatch::CompiledExecution,
  mut messages: Vec<CoreMessage>,
  max_steps: usize,
  callback: &ThreadsafeFunction<String, ()>,
  tool_callback: &ThreadsafeFunction<String, PromiseRaw<'static, String>>,
  aborted: &AtomicBool,
) -> std::result::Result<(), String> {
  run_tool_loop(
    &mut messages,
    max_steps,
    |messages| {
      let mut route_events = Vec::new();
      let result = dispatch_compiled_round(
        &DefaultHttpClient::default(),
        &mut execution.plan,
        messages,
        || aborted.load(Ordering::Relaxed),
        |event| emit_json(callback, event).map_err(transport_error),
        |event: RuntimeRouteEvent| route_events.push(event),
      );
      for event in route_events {
        let event = execution.project(event).map_err(|error| error.to_string())?;
        emit_json(callback, &event)?;
      }
      result.map_err(|error| error.to_string())
    },
    |call: &AccumulatedToolCall| execute_tool(tool_callback, call),
    |event: &ToolLoopEvent| emit_json(callback, event),
    || "tool loop reached max steps".to_string(),
  )
}

fn emit_json(
  callback: &ThreadsafeFunction<String, ()>,
  value: &impl serde::Serialize,
) -> std::result::Result<(), String> {
  let value = serde_json::to_string(value).map_err(|error| error.to_string())?;
  let status = callback.call(Ok(value), ThreadsafeFunctionCallMode::NonBlocking);
  if status == Status::Ok {
    Ok(())
  } else {
    Err(format!("copilot stream callback failed: {status}"))
  }
}

fn transport_error(message: String) -> BackendError {
  BackendError::Transport { message }
}

fn execute_tool(
  callback: &ThreadsafeFunction<String, PromiseRaw<'static, String>>,
  call: &AccumulatedToolCall,
) -> std::result::Result<ToolExecutionResult, String> {
  let request = serde_json::to_string(&ToolCallbackRequest {
    call_id: call.id.clone(),
    name: call.name.clone(),
    args: call.args.clone(),
    raw_arguments_text: call.raw_arguments_text.clone(),
    argument_parse_error: call.argument_parse_error.clone(),
  })
  .map_err(|error| error.to_string())?;
  let (sender, receiver) = mpsc::sync_channel(1);
  let sender = Arc::new(Mutex::new(Some(sender)));
  let callback_sender = sender.clone();
  let status = callback.call_with_return_value(
    Ok(request),
    ThreadsafeFunctionCallMode::NonBlocking,
    move |promise, _env| {
      match promise {
        Ok(promise) => {
          let success_sender = callback_sender.clone();
          let failure_sender = callback_sender.clone();
          promise
            .then(move |ctx| {
              send_tool_result(
                &success_sender,
                serde_json::from_str::<ToolCallbackResponse>(&ctx.value).map_err(|error| error.to_string()),
              );
              Ok(())
            })?
            .catch(move |ctx: CallbackContext<Unknown>| {
              let message = ctx.value.coerce_to_string()?.into_utf8()?.as_str()?.to_string();
              send_tool_result(&failure_sender, Err(message));
              Ok(())
            })?;
        }
        Err(error) => send_tool_result(&callback_sender, Err(error.to_string())),
      }
      Ok(())
    },
  );
  if status != Status::Ok {
    return Err(format!("copilot tool callback failed: {status}"));
  }
  let response = receiver
    .recv()
    .map_err(|_| "copilot tool callback closed before completion".to_string())??;
  if !response.args.is_object() {
    return Err("copilot tool callback args must be an object".to_string());
  }
  Ok(ToolExecutionResult {
    call_id: response.call_id,
    name: response.name,
    arguments: response.args,
    arguments_text: response.raw_arguments_text,
    arguments_error: response.argument_parse_error,
    output: response.output,
    is_error: response.is_error,
  })
}

type ToolResultSender = Arc<Mutex<Option<mpsc::SyncSender<std::result::Result<ToolCallbackResponse, String>>>>>;

fn send_tool_result(sender: &ToolResultSender, result: std::result::Result<ToolCallbackResponse, String>) {
  if let Some(sender) = sender.lock().expect("tool callback sender poisoned").take() {
    let _ = sender.send(result);
  }
}
