use std::collections::HashMap;

use napi::{
  Env, Error, Result, Status, Task,
  bindgen_prelude::{AsyncTask, Buffer},
};
use napi_derive::napi;

#[napi(string_enum = "snake_case")]
#[derive(Clone, Copy, Debug)]
pub enum SafeFetchMethod {
  Get,
  Head,
  Post,
  Put,
  Propfind,
  Report,
}

#[napi(object)]
pub struct SafeFetchRequest {
  pub url: String,
  pub method: Option<SafeFetchMethod>,
  pub headers: Option<HashMap<String, String>>,
  pub body: Option<Buffer>,
  pub timeout_ms: Option<u32>,
  pub max_redirects: Option<u32>,
  pub max_bytes: Option<u32>,
  pub allowed_headers: Option<Vec<String>>,
  pub allowed_hosts: Option<Vec<String>>,
  pub allow_http: Option<bool>,
  pub allow_private_target_origin: Option<bool>,
  pub enable_ech: Option<bool>,
  pub ech_config_list: Option<Buffer>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct AssertSafeUrlRequest {
  pub url: String,
}

#[napi(object)]
pub struct SafeFetchResponse {
  pub status: u16,
  pub final_url: String,
  pub headers: HashMap<String, String>,
  pub body: Buffer,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct ImageInspectionOptions {
  pub max_width: Option<u32>,
  pub max_height: Option<u32>,
  pub max_pixels: Option<u32>,
}

#[napi(object)]
pub struct ImageInspection {
  pub mime_type: String,
  pub width: u32,
  pub height: u32,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct RemoteAttachmentFetchRequest {
  pub url: String,
  pub timeout_ms: Option<u32>,
  pub max_bytes: u32,
  pub allow_private_target_origin: Option<bool>,
  pub expected_content_type_prefix: Option<String>,
  pub max_image_width: Option<u32>,
  pub max_image_height: Option<u32>,
  pub max_image_pixels: Option<u32>,
}

#[napi(object)]
pub struct RemoteAttachmentFetchResponse {
  pub final_url: String,
  pub mime_type: String,
  pub body: Buffer,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct RemoteMimeTypeRequest {
  pub url: String,
  pub timeout_ms: Option<u32>,
}

pub struct AsyncSafeFetchTask {
  request: SafeFetchRequest,
}

pub struct AsyncRemoteAttachmentFetchTask {
  request: RemoteAttachmentFetchRequest,
}

pub struct AsyncRemoteMimeTypeTask {
  request: RemoteMimeTypeRequest,
}

impl From<SafeFetchMethod> for safefetch::SafeFetchMethod {
  fn from(method: SafeFetchMethod) -> Self {
    match method {
      SafeFetchMethod::Get => safefetch::SafeFetchMethod::Get,
      SafeFetchMethod::Head => safefetch::SafeFetchMethod::Head,
      SafeFetchMethod::Post => safefetch::SafeFetchMethod::Post,
      SafeFetchMethod::Put => safefetch::SafeFetchMethod::Put,
      SafeFetchMethod::Propfind => safefetch::SafeFetchMethod::Propfind,
      SafeFetchMethod::Report => safefetch::SafeFetchMethod::Report,
    }
  }
}

#[napi]
impl Task for AsyncSafeFetchTask {
  type Output = safefetch::SafeFetchResponse;
  type JsValue = SafeFetchResponse;

  fn compute(&mut self) -> Result<Self::Output> {
    let request = safe_fetch_request(&self.request).map_err(invalid_arg)?;
    safefetch::safe_fetch(&request).map_err(invalid_arg)
  }

  fn resolve(&mut self, _: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(SafeFetchResponse {
      status: output.status,
      final_url: output.final_url,
      headers: output.headers,
      body: output.body.into(),
    })
  }
}

#[napi]
pub fn safe_fetch(request: SafeFetchRequest) -> AsyncTask<AsyncSafeFetchTask> {
  AsyncTask::new(AsyncSafeFetchTask { request })
}

#[napi]
pub fn assert_safe_url(request: AssertSafeUrlRequest) -> Result<()> {
  safefetch::assert_safe_url(&request.url).map_err(invalid_arg)
}

#[napi]
pub fn inspect_image_for_proxy(input: Buffer, options: Option<ImageInspectionOptions>) -> Result<ImageInspection> {
  let output = safefetch::inspect_image(
    &input,
    image_inspection_options(options.unwrap_or(ImageInspectionOptions {
      max_width: None,
      max_height: None,
      max_pixels: None,
    })),
  )
  .map_err(invalid_arg)?;
  Ok(ImageInspection {
    mime_type: output.mime_type,
    width: output.width,
    height: output.height,
  })
}

#[napi]
impl Task for AsyncRemoteAttachmentFetchTask {
  type Output = safefetch::RemoteAttachmentFetchResponse;
  type JsValue = RemoteAttachmentFetchResponse;

  fn compute(&mut self) -> Result<Self::Output> {
    safefetch::fetch_remote_attachment(&safefetch::RemoteAttachmentFetchRequest {
      url: self.request.url.clone(),
      timeout_ms: self.request.timeout_ms,
      max_bytes: self.request.max_bytes,
      allow_private_target_origin: self.request.allow_private_target_origin,
      expected_content_type_prefix: self.request.expected_content_type_prefix.clone(),
      max_image_width: self.request.max_image_width,
      max_image_height: self.request.max_image_height,
      max_image_pixels: self.request.max_image_pixels,
    })
    .map_err(invalid_arg)
  }

  fn resolve(&mut self, _: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(RemoteAttachmentFetchResponse {
      final_url: output.final_url,
      mime_type: output.mime_type,
      body: output.body.into(),
    })
  }
}

#[napi]
pub fn fetch_remote_attachment(request: RemoteAttachmentFetchRequest) -> AsyncTask<AsyncRemoteAttachmentFetchTask> {
  AsyncTask::new(AsyncRemoteAttachmentFetchTask { request })
}

#[napi]
impl Task for AsyncRemoteMimeTypeTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    Ok(safefetch::infer_remote_mime_type(&safefetch::RemoteMimeTypeRequest {
      url: self.request.url.clone(),
      timeout_ms: self.request.timeout_ms,
    }))
  }

  fn resolve(&mut self, _: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn infer_remote_mime_type(request: RemoteMimeTypeRequest) -> AsyncTask<AsyncRemoteMimeTypeTask> {
  AsyncTask::new(AsyncRemoteMimeTypeTask { request })
}

pub(crate) fn safe_fetch_request(request: &SafeFetchRequest) -> anyhow::Result<safefetch::SafeFetchRequest> {
  Ok(safefetch::SafeFetchRequest {
    url: request.url.clone(),
    method: request.method.map(Into::into),
    headers: request.headers.clone(),
    body: request.body.as_ref().map(|body| body.to_vec()),
    timeout_ms: request.timeout_ms,
    max_redirects: request.max_redirects,
    max_bytes: request.max_bytes,
    allowed_headers: request.allowed_headers.clone(),
    allowed_hosts: request.allowed_hosts.clone(),
    allow_http: request.allow_http,
    allow_private_target_origin: request.allow_private_target_origin,
    ech_config_list: ech_config_list(request)?,
  })
}

fn image_inspection_options(options: ImageInspectionOptions) -> safefetch::ImageInspectionOptions {
  safefetch::ImageInspectionOptions {
    max_width: options.max_width,
    max_height: options.max_height,
    max_pixels: options.max_pixels,
  }
}

fn ech_config_list(request: &SafeFetchRequest) -> anyhow::Result<Option<Vec<u8>>> {
  if !request.enable_ech.unwrap_or(false) {
    return Ok(None);
  }
  let Some(config_list) = request.ech_config_list.as_ref() else {
    anyhow::bail!("ech_config_required");
  };
  Ok(Some(config_list.to_vec()))
}

fn invalid_arg(error: impl ToString) -> Error {
  Error::new(Status::InvalidArg, error.to_string())
}
