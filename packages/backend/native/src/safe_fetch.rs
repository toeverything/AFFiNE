use std::{
  collections::HashMap,
  io::{Cursor, Read},
  net::{IpAddr, SocketAddr, ToSocketAddrs},
  time::Duration,
};

use ::image::{ImageFormat, ImageReader};
use anyhow::{Context, Result as AnyResult, bail};
use napi::{
  Env, Error, Result, Status, Task,
  bindgen_prelude::{AsyncTask, Buffer},
};
use napi_derive::napi;
use reqwest::{
  Method,
  blocking::{Client, Response},
  header::{HeaderMap, HeaderName, HeaderValue, LOCATION},
};
use url::Url;

const DEFAULT_TIMEOUT_MS: u32 = 10_000;
const DEFAULT_MAX_REDIRECTS: u32 = 3;
const DEFAULT_MAX_BYTES: u32 = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;

#[napi(string_enum = "snake_case")]
#[derive(Clone, Copy, Debug)]
pub enum SafeFetchMethod {
  Get,
  Head,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct SafeFetchRequest {
  pub url: String,
  pub method: Option<SafeFetchMethod>,
  pub headers: Option<HashMap<String, String>>,
  pub timeout_ms: Option<u32>,
  pub max_redirects: Option<u32>,
  pub max_bytes: Option<u32>,
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

pub struct SafeFetchOutput {
  status: u16,
  final_url: String,
  headers: HashMap<String, String>,
  body: Vec<u8>,
}

struct SafeFetchParams {
  url: String,
  method: Option<SafeFetchMethod>,
  headers: Option<HashMap<String, String>>,
  timeout_ms: Option<u32>,
  max_redirects: Option<u32>,
  max_bytes: Option<u32>,
  allow_private_origins: Option<Vec<String>>,
}

pub struct RemoteAttachmentFetchOutput {
  final_url: String,
  mime_type: String,
  body: Vec<u8>,
}

#[napi]
impl Task for AsyncSafeFetchTask {
  type Output = SafeFetchOutput;
  type JsValue = SafeFetchResponse;

  fn compute(&mut self) -> Result<Self::Output> {
    safe_fetch_inner(&self.request).map_err(|error| Error::new(Status::InvalidArg, error.to_string()))
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
  assert_safe_url_inner(&request).map_err(|error| Error::new(Status::InvalidArg, error.to_string()))
}

#[napi]
pub fn inspect_image_for_proxy(input: Buffer, options: Option<ImageInspectionOptions>) -> Result<ImageInspection> {
  inspect_image_for_proxy_inner(
    &input,
    options.unwrap_or(ImageInspectionOptions {
      max_width: None,
      max_height: None,
      max_pixels: None,
    }),
  )
  .map_err(|error| Error::new(Status::InvalidArg, error.to_string()))
}

#[napi]
impl Task for AsyncRemoteAttachmentFetchTask {
  type Output = RemoteAttachmentFetchOutput;
  type JsValue = RemoteAttachmentFetchResponse;

  fn compute(&mut self) -> Result<Self::Output> {
    fetch_remote_attachment_inner(&self.request).map_err(|error| Error::new(Status::InvalidArg, error.to_string()))
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
    Ok(infer_remote_mime_type_inner(&self.request))
  }

  fn resolve(&mut self, _: Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[napi]
pub fn infer_remote_mime_type(request: RemoteMimeTypeRequest) -> AsyncTask<AsyncRemoteMimeTypeTask> {
  AsyncTask::new(AsyncRemoteMimeTypeTask { request })
}

fn safe_fetch_inner(request: &SafeFetchRequest) -> AnyResult<SafeFetchOutput> {
  safe_fetch_params_inner(&SafeFetchParams {
    url: request.url.clone(),
    method: request.method,
    headers: request.headers.clone(),
    timeout_ms: request.timeout_ms,
    max_redirects: request.max_redirects,
    max_bytes: request.max_bytes,
    allow_private_origins: None,
  })
}

fn safe_fetch_params_inner(request: &SafeFetchParams) -> AnyResult<SafeFetchOutput> {
  let timeout = Duration::from_millis(u64::from(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)));
  let max_redirects = request.max_redirects.unwrap_or(DEFAULT_MAX_REDIRECTS);
  let max_bytes = usize::try_from(request.max_bytes.unwrap_or(DEFAULT_MAX_BYTES)).context("invalid maxBytes")?;
  let method = request.method.unwrap_or(SafeFetchMethod::Get);
  let mut current = parse_safe_url(&request.url)?;
  let headers = build_headers(request.headers.as_ref())?;

  for redirect_count in 0..=max_redirects {
    let addrs = resolve_safe_socket_addrs(&current, request.allow_private_origins.as_deref())?;
    let client = build_pinned_client(&current, &addrs, timeout)?;
    let response = send_request(&client, method, current.clone(), headers.clone())?;

    if response.status().is_redirection() {
      if redirect_count >= max_redirects {
        bail!("too_many_redirects");
      }
      let Some(location) = response.headers().get(LOCATION) else {
        return response_to_output(response, current, max_bytes, method);
      };
      let location = location.to_str().context("invalid redirect location")?;
      current = parse_safe_url(current.join(location).context("invalid redirect location")?.as_str())?;
      continue;
    }

    return response_to_output(response, current, max_bytes, method);
  }

  bail!("too_many_redirects")
}

fn fetch_remote_attachment_inner(request: &RemoteAttachmentFetchRequest) -> AnyResult<RemoteAttachmentFetchOutput> {
  let allow_private_origins =
    private_target_origin_allowlist(&request.url, request.allow_private_target_origin.unwrap_or(false))?;
  let response = safe_fetch_params_inner(&SafeFetchParams {
    url: request.url.clone(),
    method: Some(SafeFetchMethod::Get),
    headers: None,
    timeout_ms: request.timeout_ms,
    max_redirects: Some(DEFAULT_MAX_REDIRECTS),
    max_bytes: Some(request.max_bytes),
    allow_private_origins,
  })?;
  if !(200..300).contains(&response.status) {
    bail!("fetch_failed_status: {}", response.status);
  }
  let mime_type = normalize_mime_type(response.headers.get("content-type"));
  if let Some(expected) = request.expected_content_type_prefix.as_deref() {
    if !mime_type.starts_with(expected) {
      bail!("content_type_mismatch");
    }
    if expected.starts_with("image/") {
      inspect_image_for_proxy_inner(
        &response.body,
        ImageInspectionOptions {
          max_width: request.max_image_width,
          max_height: request.max_image_height,
          max_pixels: request.max_image_pixels,
        },
      )?;
    }
  }

  Ok(RemoteAttachmentFetchOutput {
    final_url: response.final_url,
    mime_type,
    body: response.body,
  })
}

fn infer_remote_mime_type_inner(request: &RemoteMimeTypeRequest) -> String {
  let Ok(url) = Url::parse(&request.url) else {
    return "application/octet-stream".to_string();
  };
  if let Some(mime_type) = infer_mime_type_from_extension(&url) {
    return mime_type.to_string();
  }
  let Ok(response) = safe_fetch_params_inner(&SafeFetchParams {
    url: request.url.clone(),
    method: Some(SafeFetchMethod::Head),
    headers: None,
    timeout_ms: request.timeout_ms,
    max_redirects: Some(DEFAULT_MAX_REDIRECTS),
    max_bytes: Some(0),
    allow_private_origins: None,
  }) else {
    return "application/octet-stream".to_string();
  };
  normalize_mime_type(response.headers.get("content-type"))
}

fn private_target_origin_allowlist(raw_url: &str, allow_private_target_origin: bool) -> AnyResult<Option<Vec<String>>> {
  if !allow_private_target_origin {
    return Ok(None);
  }
  Ok(Some(vec![parse_safe_url(raw_url)?.origin().ascii_serialization()]))
}

fn normalize_mime_type(value: Option<&String>) -> String {
  value
    .and_then(|value| value.split(';').next())
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("application/octet-stream")
    .to_string()
}

fn infer_mime_type_from_extension(url: &Url) -> Option<&'static str> {
  let extension = url.path_segments()?.next_back()?.rsplit_once('.')?.1;
  match extension.to_ascii_lowercase().as_str() {
    "pdf" => Some("application/pdf"),
    "mp3" => Some("audio/mpeg"),
    "opus" => Some("audio/opus"),
    "ogg" => Some("audio/ogg"),
    "aac" => Some("audio/aac"),
    "m4a" => Some("audio/aac"),
    "flac" => Some("audio/flac"),
    "ogv" => Some("video/ogg"),
    "wav" => Some("audio/wav"),
    "png" => Some("image/png"),
    "jpeg" | "jpg" => Some("image/jpeg"),
    "webp" => Some("image/webp"),
    "txt" | "md" => Some("text/plain"),
    "mov" => Some("video/mov"),
    "mpeg" => Some("video/mpeg"),
    "mp4" => Some("video/mp4"),
    "avi" => Some("video/avi"),
    "wmv" => Some("video/wmv"),
    "flv" => Some("video/flv"),
    _ => None,
  }
}

fn assert_safe_url_inner(request: &AssertSafeUrlRequest) -> AnyResult<()> {
  let url = parse_safe_url(&request.url)?;
  resolve_safe_socket_addrs(&url, None)?;
  Ok(())
}

fn parse_safe_url(raw: &str) -> AnyResult<Url> {
  let url = Url::parse(raw).context("invalid_url")?;
  match url.scheme() {
    "http" | "https" => {}
    _ => bail!("disallowed_protocol"),
  }
  if !url.username().is_empty() || url.password().is_some() {
    bail!("url_has_credentials");
  }
  if url.host_str().is_none() {
    bail!("blocked_hostname");
  }
  Ok(url)
}

fn resolve_safe_socket_addrs(url: &Url, allow_private_origins: Option<&[String]>) -> AnyResult<Vec<SocketAddr>> {
  let host = url.host_str().context("blocked_hostname")?;
  let port = url.port_or_known_default().context("blocked_hostname")?;
  let origin = url.origin().ascii_serialization();
  let allow_private = allow_private_origins
    .map(|origins| origins.iter().any(|allowed| allowed == &origin))
    .unwrap_or(false);
  let addrs: Vec<SocketAddr> = (host, port)
    .to_socket_addrs()
    .context("unresolvable_hostname")?
    .collect();
  if addrs.is_empty() {
    bail!("unresolvable_hostname");
  }
  for addr in &addrs {
    if is_blocked_ip(addr.ip()) && !allow_private {
      bail!("blocked_ip");
    }
  }
  Ok(addrs)
}

fn build_pinned_client(url: &Url, addrs: &[SocketAddr], timeout: Duration) -> AnyResult<Client> {
  let host = url.host_str().context("blocked_hostname")?;
  Client::builder()
    .timeout(timeout)
    .no_proxy()
    .redirect(reqwest::redirect::Policy::none())
    .tls_backend_preconfigured(webpki_tls_config()?)
    .resolve_to_addrs(host, addrs)
    .build()
    .context("failed to build http client")
}

fn webpki_tls_config() -> AnyResult<rustls::ClientConfig> {
  let root_store = rustls::RootCertStore {
    roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
  };
  Ok(
    rustls::ClientConfig::builder_with_provider(rustls::crypto::aws_lc_rs::default_provider().into())
      .with_safe_default_protocol_versions()
      .context("failed to build tls protocol config")?
      .with_root_certificates(root_store)
      .with_no_client_auth(),
  )
}

fn build_headers(headers: Option<&HashMap<String, String>>) -> AnyResult<HeaderMap> {
  let mut out = HeaderMap::new();
  let Some(headers) = headers else {
    return Ok(out);
  };
  for (name, value) in headers {
    let lower = name.to_ascii_lowercase();
    if !(lower.starts_with("sec-") || lower.starts_with("accept") || lower == "user-agent") {
      continue;
    }
    out.insert(
      HeaderName::from_bytes(name.as_bytes()).context("invalid header name")?,
      HeaderValue::from_str(value).context("invalid header value")?,
    );
  }
  Ok(out)
}

fn send_request(client: &Client, method: SafeFetchMethod, url: Url, headers: HeaderMap) -> AnyResult<Response> {
  let method = match method {
    SafeFetchMethod::Get => Method::GET,
    SafeFetchMethod::Head => Method::HEAD,
  };
  client
    .request(method, url)
    .headers(headers)
    .send()
    .context("failed to fetch url")
}

fn response_to_output(
  mut response: Response,
  url: Url,
  max_bytes: usize,
  method: SafeFetchMethod,
) -> AnyResult<SafeFetchOutput> {
  let status = response.status().as_u16();
  let headers = response_headers(response.headers());
  if matches!(method, SafeFetchMethod::Head) {
    return Ok(SafeFetchOutput {
      status,
      final_url: url.to_string(),
      headers,
      body: Vec::new(),
    });
  }
  let mut body = Vec::new();
  if let Some(len) = response.content_length()
    && len > max_bytes as u64
  {
    bail!("response_too_large");
  }
  response
    .by_ref()
    .take(u64::try_from(max_bytes).unwrap_or(u64::MAX) + 1)
    .read_to_end(&mut body)
    .context("failed to read response")?;
  if body.len() > max_bytes {
    bail!("response_too_large");
  }
  Ok(SafeFetchOutput {
    status,
    final_url: url.to_string(),
    headers,
    body,
  })
}

fn response_headers(headers: &HeaderMap) -> HashMap<String, String> {
  headers
    .iter()
    .filter_map(|(name, value)| {
      value
        .to_str()
        .ok()
        .map(|value| (name.as_str().to_string(), value.to_string()))
    })
    .collect()
}

fn is_blocked_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(ip) => {
      ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_multicast()
        || ip.is_documentation()
        || ip.octets()[0] == 0
        || ip.octets()[0] >= 224
        || ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1])
        || ip.octets()[0] == 169 && ip.octets()[1] == 254
        || ip.octets()[0] == 198 && (18..=19).contains(&ip.octets()[1])
        || ip.octets()[0] == 192 && ip.octets()[1] == 0 && ip.octets()[2] == 0
    }
    IpAddr::V6(ip) => {
      if let Some(v4) = ip.to_ipv4_mapped() {
        return is_blocked_ip(IpAddr::V4(v4));
      }
      if let Some(v4) = extract_6to4_ipv4(ip).or_else(|| extract_teredo_client_ipv4(ip)) {
        return is_blocked_ip(IpAddr::V4(v4));
      }
      (ip.segments()[0] & 0xe000 != 0x2000)
        || ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (ip.segments()[0] & 0xfe00 == 0xfc00)
        || (ip.segments()[0] & 0xffc0 == 0xfe80)
        || (ip.segments()[0] == 0x2001 && ip.segments()[1] == 0x0db8)
    }
  }
}

fn extract_6to4_ipv4(ip: std::net::Ipv6Addr) -> Option<std::net::Ipv4Addr> {
  let segments = ip.segments();
  if segments[0] != 0x2002 {
    return None;
  }
  Some(std::net::Ipv4Addr::new(
    (segments[1] >> 8) as u8,
    segments[1] as u8,
    (segments[2] >> 8) as u8,
    segments[2] as u8,
  ))
}

fn extract_teredo_client_ipv4(ip: std::net::Ipv6Addr) -> Option<std::net::Ipv4Addr> {
  let segments = ip.segments();
  if segments[0] != 0x2001 || segments[1] != 0 {
    return None;
  }
  Some(std::net::Ipv4Addr::new(
    (!(segments[6] >> 8)) as u8,
    (!segments[6]) as u8,
    (!(segments[7] >> 8)) as u8,
    (!segments[7]) as u8,
  ))
}

fn inspect_image_for_proxy_inner(input: &[u8], options: ImageInspectionOptions) -> AnyResult<ImageInspection> {
  let inspection = parse_image_header(input).context("failed to decode image")?;
  validate_image_dimensions(&inspection, options)?;
  Ok(inspection)
}

fn validate_image_dimensions(image: &ImageInspection, options: ImageInspectionOptions) -> AnyResult<()> {
  let max_width = options.max_width.unwrap_or(MAX_IMAGE_DIMENSION);
  let max_height = options.max_height.unwrap_or(MAX_IMAGE_DIMENSION);
  let max_pixels = u64::from(options.max_pixels.unwrap_or(MAX_IMAGE_PIXELS as u32));
  if image.width == 0 || image.height == 0 {
    bail!("failed to decode image");
  }
  if image.width > max_width || image.height > max_height {
    bail!("image dimensions exceed limit");
  }
  if u64::from(image.width) * u64::from(image.height) > max_pixels {
    bail!("image pixel count exceeds limit");
  }
  Ok(())
}

fn parse_image_header(input: &[u8]) -> AnyResult<ImageInspection> {
  let format = ::image::guess_format(input).context("unsupported image format")?;
  let mime_type = image_mime_type(format).context("unsupported image format")?;
  let (width, height) = ImageReader::with_format(Cursor::new(input), format)
    .into_dimensions()
    .context("failed to decode image")?;
  Ok(ImageInspection {
    mime_type: mime_type.to_string(),
    width,
    height,
  })
}

fn image_mime_type(format: ImageFormat) -> Option<&'static str> {
  match format {
    ImageFormat::Png => Some("image/png"),
    ImageFormat::Jpeg => Some("image/jpeg"),
    ImageFormat::Gif => Some("image/gif"),
    ImageFormat::WebP => Some("image/webp"),
    ImageFormat::Bmp => Some("image/bmp"),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn blocks_private_ips() {
    assert!(is_blocked_ip("127.0.0.1".parse().unwrap()));
    assert!(is_blocked_ip("10.0.0.1".parse().unwrap()));
    assert!(is_blocked_ip("169.254.169.254".parse().unwrap()));
    assert!(is_blocked_ip("::1".parse().unwrap()));
    assert!(is_blocked_ip("::ffff:127.0.0.1".parse().unwrap()));
    assert!(is_blocked_ip("2002:7f00:0001::1".parse().unwrap()));
    assert!(is_blocked_ip("2002:c0a8:0001::1".parse().unwrap()));
    assert!(is_blocked_ip(
      "2001:0000:4136:e378:8000:63bf:807f:fffe".parse().unwrap()
    ));
    assert!(!is_blocked_ip("8.8.8.8".parse().unwrap()));
    assert!(!is_blocked_ip("2002:0808:0808::1".parse().unwrap()));
  }

  #[test]
  fn builds_https_client_with_embedded_roots() {
    let url = Url::parse("https://example.com/").unwrap();
    let addrs = ["93.184.216.34:443".parse().unwrap()];
    build_pinned_client(&url, &addrs, Duration::from_secs(1)).unwrap();
  }

  #[test]
  fn inspects_png_dimensions_without_decode() {
    let png = base64_simd::STANDARD
      .decode_to_vec(b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfJ8AAAAASUVORK5CYII=")
      .unwrap();
    let inspected = inspect_image_for_proxy_inner(
      &png,
      ImageInspectionOptions {
        max_width: None,
        max_height: None,
        max_pixels: None,
      },
    )
    .unwrap();
    assert_eq!(inspected.mime_type, "image/png");
    assert_eq!(inspected.width, 1);
    assert_eq!(inspected.height, 1);
  }

  #[test]
  fn rejects_oversized_dimensions() {
    let png = [
      b"\x89PNG\r\n\x1a\n".as_slice(),
      &[0, 0, 0, 13],
      b"IHDR".as_slice(),
      &100_000u32.to_be_bytes(),
      &100_000u32.to_be_bytes(),
      &[8, 6, 0, 0, 0],
    ]
    .concat();
    assert!(
      inspect_image_for_proxy_inner(
        &png,
        ImageInspectionOptions {
          max_width: None,
          max_height: None,
          max_pixels: None,
        }
      )
      .is_err()
    );
  }
}
