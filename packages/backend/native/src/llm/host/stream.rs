use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};

use llm_adapter::{
  backend::{BackendConfig, BackendError, BackendHttpClient, DefaultHttpClient},
  core::StreamEvent,
  router::{PreparedChatRoute, RoutedBackend, dispatch_prepared_stream_with_pipeline},
};
use napi::{
  Result, Status,
  bindgen_prelude::PromiseRaw,
  threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};

use super::{STREAM_CALLBACK_DISPATCH_FAILED_REASON, STREAM_END_MARKER, callback_dispatch_failed_reason, tool_loop};
use crate::llm::{
  LlmDispatchPayload, LlmRoutedBackendPayload, LlmStreamHandle, STREAM_ABORTED_REASON, StreamPipeline,
  backend_transport_error, map_json_error, parse_prepared_chat_routes_with_middleware,
  parse_prepared_chat_routes_without_middleware, parse_protocol, resolve_stream_chain,
};

type PreparedDispatchRoute = (PreparedChatRoute, crate::llm::LlmMiddlewarePayload);

#[napi(catch_unwind)]
pub fn llm_dispatch_prepared_stream(
  routes_json: String,
  callback: ThreadsafeFunction<String, ()>,
) -> Result<LlmStreamHandle> {
  let routes = parse_prepared_chat_routes_with_middleware(&routes_json)?;
  Ok(spawn_prepared_stream(routes, callback))
}

#[napi(catch_unwind)]
pub fn llm_dispatch_tool_loop_stream(
  protocol: String,
  backend_config_json: String,
  request_json: String,
  max_steps: u32,
  callback: ThreadsafeFunction<String, ()>,
  tool_callback: ThreadsafeFunction<String, PromiseRaw<'static, String>>,
) -> Result<LlmStreamHandle> {
  let protocol = parse_protocol(&protocol)?;
  let config: BackendConfig = serde_json::from_str(&backend_config_json).map_err(map_json_error)?;
  let payload: LlmDispatchPayload = serde_json::from_str(&request_json).map_err(map_json_error)?;

  Ok(tool_loop::spawn_tool_loop_stream(
    protocol,
    config,
    payload,
    max_steps as usize,
    callback,
    tool_callback,
  ))
}

#[napi(catch_unwind)]
pub fn llm_dispatch_tool_loop_stream_routed(
  routes_json: String,
  request_json: String,
  max_steps: u32,
  callback: ThreadsafeFunction<String, ()>,
  tool_callback: ThreadsafeFunction<String, PromiseRaw<'static, String>>,
) -> Result<LlmStreamHandle> {
  let routes = parse_routed_backends(&routes_json)?;
  let payload: LlmDispatchPayload = serde_json::from_str(&request_json).map_err(map_json_error)?;

  Ok(tool_loop::spawn_routed_tool_loop_stream(
    routes,
    payload,
    max_steps as usize,
    callback,
    tool_callback,
  ))
}

#[napi(catch_unwind)]
pub fn llm_dispatch_tool_loop_stream_prepared(
  routes_json: String,
  max_steps: u32,
  callback: ThreadsafeFunction<String, ()>,
  tool_callback: ThreadsafeFunction<String, PromiseRaw<'static, String>>,
) -> Result<LlmStreamHandle> {
  let routes = parse_prepared_chat_routes_without_middleware(&routes_json)?;
  Ok(tool_loop::spawn_prepared_tool_loop_stream(
    routes,
    max_steps as usize,
    callback,
    tool_callback,
  ))
}

fn spawn_prepared_stream(
  routes: Vec<PreparedDispatchRoute>,
  callback: ThreadsafeFunction<String, ()>,
) -> LlmStreamHandle {
  let aborted = Arc::new(AtomicBool::new(false));
  let aborted_in_worker = aborted.clone();

  std::thread::spawn(move || {
    let result = dispatch_prepared_stream_with_fallback(&routes, &callback, &aborted_in_worker);
    let callback_dispatch_failed = matches!(
      &result,
      Err(BackendError::Transport { message: reason })
        if reason.starts_with(STREAM_CALLBACK_DISPATCH_FAILED_REASON)
    );

    if let Err(error) = &result
      && !aborted_in_worker.load(Ordering::Relaxed)
      && !callback_dispatch_failed
      && !is_abort_error(error)
    {
      emit_error_event(&callback, error.to_string(), "dispatch_error");
    }

    if let Ok(provider_id) = result {
      emit_provider_selected_event(&callback, provider_id);
    }

    if !callback_dispatch_failed {
      let _ = callback.call(
        Ok(STREAM_END_MARKER.to_string()),
        ThreadsafeFunctionCallMode::NonBlocking,
      );
    }
  });

  LlmStreamHandle { aborted }
}

fn dispatch_prepared_stream_with_fallback(
  routes: &[PreparedDispatchRoute],
  callback: &ThreadsafeFunction<String, ()>,
  aborted: &AtomicBool,
) -> std::result::Result<String, BackendError> {
  dispatch_prepared_stream_with_fallback_using_client(&DefaultHttpClient::default(), routes, aborted, |event| {
    emit_stream_event(callback, event)
  })
}

fn dispatch_prepared_stream_with_fallback_using_client<F>(
  client: &dyn BackendHttpClient,
  routes: &[PreparedDispatchRoute],
  aborted: &AtomicBool,
  mut emit_event: F,
) -> std::result::Result<String, BackendError>
where
  F: FnMut(&StreamEvent) -> Status,
{
  let mut adapter_routes = routes
    .iter()
    .map(|(route, middleware)| {
      let chain =
        resolve_stream_chain(&middleware.stream).map_err(|error| backend_transport_error(error.reason.clone()))?;
      Ok((route.clone(), StreamPipeline::new(chain, middleware.config.clone())))
    })
    .collect::<std::result::Result<Vec<_>, BackendError>>()?;
  let mut callback_dispatch_failed = false;

  let provider_id = dispatch_prepared_stream_with_pipeline(
    client,
    &mut adapter_routes,
    || aborted.load(Ordering::Relaxed),
    || backend_transport_error(STREAM_ABORTED_REASON),
    |event| {
      let status = emit_event(event);
      if status != Status::Ok {
        callback_dispatch_failed = true;
        return Err(backend_transport_error(callback_dispatch_failed_reason(status)));
      }
      Ok(())
    },
  )?;

  if callback_dispatch_failed {
    Err(backend_transport_error(format!(
      "{STREAM_CALLBACK_DISPATCH_FAILED_REASON}:unknown"
    )))
  } else {
    Ok(provider_id)
  }
}

pub(crate) fn emit_error_event(callback: &ThreadsafeFunction<String, ()>, message: String, code: &str) {
  let error_event = serde_json::to_string(&StreamEvent::Error {
    message: message.clone(),
    code: Some(code.to_string()),
  })
  .unwrap_or_else(|_| {
    serde_json::json!({
      "type": "error",
      "message": message,
      "code": code,
    })
    .to_string()
  });

  let _ = callback.call(Ok(error_event), ThreadsafeFunctionCallMode::NonBlocking);
}

pub(crate) fn emit_provider_selected_event(callback: &ThreadsafeFunction<String, ()>, provider_id: String) {
  let event = serde_json::json!({
    "type": "provider_selected",
    "provider_id": provider_id,
  })
  .to_string();

  let _ = callback.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}

fn emit_stream_event(callback: &ThreadsafeFunction<String, ()>, event: &StreamEvent) -> Status {
  let value = serde_json::to_string(event).unwrap_or_else(|error| {
    serde_json::json!({
      "type": "error",
      "message": format!("failed to serialize stream event: {error}"),
    })
    .to_string()
  });

  callback.call(Ok(value), ThreadsafeFunctionCallMode::NonBlocking)
}

fn parse_routed_backends(routes_json: &str) -> Result<Vec<RoutedBackend>> {
  let payload: Vec<LlmRoutedBackendPayload> = serde_json::from_str(routes_json).map_err(map_json_error)?;
  payload
    .into_iter()
    .map(|route| {
      Ok(RoutedBackend {
        provider_id: route.provider_id,
        protocol: parse_protocol(&route.protocol)?,
        model: route.model,
        config: route.config,
      })
    })
    .collect()
}

fn is_abort_error(error: &BackendError) -> bool {
  matches!(
    error,
    BackendError::Transport { message: reason } if reason == STREAM_ABORTED_REASON
  )
}
