//! Static asset hosting for `Selfhost` and `Front` roles.

use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use chrono::{DateTime, Utc};
use server_types::DeploymentMode;

use crate::RouterState;
use crate::rest::{extract_cookie, parse_cookies};

const CACHE_CONTROL_NO_STORE: &str = "private, no-cache, no-store, max-age=0, must-revalidate";
const SHELL_COOKIE_NAME: &str = "affine_shell";
const STRICT_ASSET_PREFIXES: &[&str] = &["/_plugin/", "/assets/", "/imgs/", "/js/", "/plugins/", "/static/"];
const MOBILE_AUTH_PATHS: &[&str] = &["/sign-in", "/magic-link", "/oauth", "/redirect-proxy", "/open-app"];
fn parse_shell(raw: &str) -> Option<&'static str> {
  ["desktop", "native", "legacy"]
    .into_iter()
    .find(|&s| raw.trim().eq_ignore_ascii_case(s))
}
pub(crate) fn resolve_canary_shell(
  uri: &Uri,
  headers: &HeaderMap,
  channel: &str,
) -> (&'static str, Option<&'static str>) {
  if channel != "canary" {
    return ("desktop", None);
  }
  let q_shell = uri.query().and_then(|q| {
    q.split('&').find_map(|p| {
      p.split_once('=')
        .and_then(|(k, v)| (k == "shell").then(|| parse_shell(v)).flatten())
    })
  });
  if let Some(ex) = q_shell {
    (ex, Some(ex))
  } else {
    let def = if is_mobile_request(headers) {
      "native"
    } else {
      "desktop"
    };
    (
      extract_cookie(&parse_cookies(headers), SHELL_COOKIE_NAME)
        .and_then(parse_shell)
        .unwrap_or(def),
      None,
    )
  }
}
pub(crate) fn append_shell_cookie(headers: &mut HeaderMap, shell: &str, https: bool) {
  if let Ok(v) = HeaderValue::from_str(&format!(
    "{SHELL_COOKIE_NAME}={shell}; Path=/; SameSite=Lax{}",
    if https { "; Secure" } else { "" }
  )) {
    headers.append(header::SET_COOKIE, v);
  }
}
fn found_redirect(state: &RouterState, target: &str) -> Response {
  let cfg = state.app.config.load();
  let base = cfg.app_config_baseline.server.path.trim().trim_end_matches('/');
  let loc = if base.is_empty() || base == "/" {
    target.to_owned()
  } else {
    format!("{base}{target}")
  };
  (StatusCode::FOUND, [(header::LOCATION, loc)]).into_response()
}
pub(crate) fn static_router(is_front: bool) -> Router<RouterState> {
  Router::new()
    .route(
      "/admin/index.html",
      get(|State(s): State<RouterState>| async move { found_redirect(&s, "/admin") }),
    )
    .route(
      "/index.html",
      get(|State(s): State<RouterState>| async move { found_redirect(&s, "/") }),
    )
    .fallback(
      move |State(s): State<RouterState>, m: Method, u: Uri, h: HeaderMap| async move {
        handle_static(s, m, u, h, is_front).await
      },
    )
}
fn clean_hdr(headers: &HeaderMap, name: &str) -> Option<String> {
  let s = headers
    .get(name)?
    .to_str()
    .ok()?
    .trim()
    .trim_matches('"')
    .to_ascii_lowercase();
  (!s.is_empty()).then_some(s)
}
pub(crate) fn is_mobile_request(headers: &HeaderMap) -> bool {
  if let Some(m) = clean_hdr(headers, "sec-ch-ua-mobile") {
    return matches!(m.as_str(), "?1" | "1" | "true");
  }
  if clean_hdr(headers, "sec-ch-ua-platform").is_some_and(|p| matches!(p.as_str(), "android" | "ios" | "ipados")) {
    return true;
  }
  clean_hdr(headers, "user-agent").is_some_and(|ua| {
    let ua: String = ua.chars().take(512).collect();
    ["mobile", "android", "iphone", "ipad", "ipod"]
      .iter()
      .any(|k| ua.contains(k))
  })
}
async fn is_file_async(path: &Path) -> bool {
  tokio::fs::metadata(path).await.is_ok_and(|m| m.is_file())
}
fn safe_join(base: &Path, rel_path: &str) -> Option<PathBuf> {
  let trimmed = rel_path.trim_start_matches('/');
  if rel_path.contains(['\0', '\\']) || trimmed.is_empty() {
    return None;
  }
  let mut out = base.to_path_buf();
  for comp in Path::new(trimmed).components() {
    match comp {
      Component::Normal(seg) if !seg.to_string_lossy().starts_with('.') => out.push(seg),
      Component::CurDir => {}
      _ => return None,
    }
  }
  Some(out)
}
const CONTENT_TYPES: &str = "html=text/html; charset=utf-8|htm=text/html; charset=utf-8|\
js=application/javascript; charset=utf-8|mjs=application/javascript; charset=utf-8|\
css=text/css; charset=utf-8|json=application/json; charset=utf-8|wasm=application/wasm|\
svg=image/svg+xml|png=image/png|jpg=image/jpeg|jpeg=image/jpeg|gif=image/gif|\
webp=image/webp|ico=image/x-icon|woff2=font/woff2|woff=font/woff|ttf=font/ttf|\
txt=text/plain; charset=utf-8";
fn content_type_for_path(path: &Path) -> &'static str {
  let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
    return "application/octet-stream";
  };
  CONTENT_TYPES
    .split('|')
    .find_map(|p| {
      p.split_once('=')
        .filter(|(k, _)| k.eq_ignore_ascii_case(ext))
        .map(|(_, v)| v)
    })
    .unwrap_or("application/octet-stream")
}
async fn serve_file(
  r: &Path,
  rel: &str,
  m: &Method,
  h: &HeaderMap,
  ns: bool,
  sh: Option<&str>,
  https: bool,
) -> Option<Response> {
  let path = safe_join(r, rel)?;
  let meta = tokio::fs::metadata(&path).await.ok()?;
  if !meta.is_file() || meta.len() > 64 * 1024 * 1024 {
    return None;
  }
  let mtime = meta.modified().ok().unwrap_or(UNIX_EPOCH);
  let etag = format!(
    "W/\"{}-{}\"",
    meta.len(),
    mtime.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
  );
  let last_mod = DateTime::<Utc>::from(mtime)
    .format("%a, %d %b %Y %H:%M:%S GMT")
    .to_string();
  let hs = |n| h.get(n).and_then(|v| v.to_str().ok());
  let not_mod = hs(header::IF_NONE_MATCH).is_some_and(|v| v.split(',').any(|t| t.trim() == etag || t.trim() == "*"))
    || hs(header::IF_MODIFIED_SINCE).is_some_and(|s| s.trim() == last_mod);
  let mut resp = if not_mod {
    StatusCode::NOT_MODIFIED.into_response()
  } else if *m == Method::HEAD {
    StatusCode::OK.into_response()
  } else {
    (StatusCode::OK, tokio::fs::read(&path).await.ok()?).into_response()
  };
  let rh = resp.headers_mut();
  for (name, val) in [
    (header::CONTENT_TYPE, content_type_for_path(&path).to_owned()),
    (header::ETAG, etag),
    (header::LAST_MODIFIED, last_mod),
    (header::CONTENT_LENGTH, meta.len().to_string()),
  ] {
    if let Ok(v) = HeaderValue::from_str(&val) {
      rh.insert(name, v);
    }
  }
  if ns {
    rh.insert(header::CACHE_CONTROL, HeaderValue::from_static(CACHE_CONTROL_NO_STORE));
  }
  if let Some(sh) = sh {
    append_shell_cookie(rh, sh, https);
  }
  Some(resp)
}
async fn handle_static(state: RouterState, method: Method, uri: Uri, headers: HeaderMap, is_front: bool) -> Response {
  let path = uri.path();
  let cfg = state.app.config.load();
  let or_404 = |r: Option<Response>| r.unwrap_or_else(|| StatusCode::NOT_FOUND.into_response());
  if !matches!(method, Method::GET | Method::HEAD) || path == "/api" || path.starts_with("/api/") {
    return or_404(None);
  }
  let Some(static_root) = cfg.static_dir.as_deref() else {
    return or_404(None);
  };
  let html_entry = if !is_front && cfg.deployment_mode == DeploymentMode::Selfhosted {
    "selfhost.html"
  } else {
    "index.html"
  };
  let (m, h, https) = (&method, &headers, cfg.https);
  if path == "/admin" || path.starts_with("/admin/") {
    let admin_root = static_root.join("admin");
    if let Some(rel) = path.strip_prefix("/admin/").filter(|r| !r.is_empty())
      && let Some(resp) = serve_file(&admin_root, rel, m, h, false, None, https).await
    {
      return resp;
    }
    return or_404(serve_file(&admin_root, html_entry, m, h, true, None, https).await);
  }
  if !is_front {
    let mobile = cfg.channel == "canary" && is_mobile_request(h);
    let mobile_root = static_root.join("mobile");
    for root in [mobile.then_some(mobile_root.as_path()), Some(static_root)]
      .into_iter()
      .flatten()
    {
      if let Some(resp) = serve_file(root, path, m, h, false, None, https).await {
        return resp;
      }
    }
    let fb = if mobile && is_file_async(&mobile_root.join(html_entry)).await {
      &mobile_root
    } else {
      static_root
    };
    return or_404(serve_file(fb, html_entry, m, h, true, None, https).await);
  }
  for (prefix, sub) in [
    ("/wasm/", "mobile/wasm"),
    ("/pkg/", "mobile/pkg"),
    ("/mobile/", "mobile"),
    ("/mobile-legacy/", "mobile-legacy"),
  ] {
    if let Some(rel) = path.strip_prefix(prefix) {
      return or_404(serve_file(&static_root.join(sub), rel, m, h, false, None, https).await);
    }
  }
  let (shell, explicit) = resolve_canary_shell(&uri, h, &cfg.channel);
  let (mut shell_root, mut is_mobile_shell) = (static_root.to_path_buf(), false);
  for (cond, sub) in [
    (shell == "legacy", "mobile-legacy"),
    (matches!(shell, "legacy" | "native"), "mobile"),
  ] {
    let dir = static_root.join(sub);
    if cond && is_file_async(&dir.join("index.html")).await {
      (shell_root, is_mobile_shell) = (dir, true);
      break;
    }
  }
  if STRICT_ASSET_PREFIXES.iter().any(|prefix| path.starts_with(prefix)) {
    return or_404(serve_file(&shell_root, path, m, h, false, explicit, https).await);
  }
  if let Some(resp) = serve_file(&shell_root, path, m, h, true, explicit, https).await {
    return resp;
  }
  let is_auth = MOBILE_AUTH_PATHS
    .iter()
    .any(|p| path == *p || path.strip_prefix(p).is_some_and(|r| r.starts_with('/')));
  let fb =
    if cfg.channel == "canary" && is_mobile_shell && is_auth && is_file_async(&shell_root.join("sign-in.html")).await {
      "sign-in.html"
    } else {
      "index.html"
    };
  or_404(serve_file(&shell_root, fb, m, h, true, explicit, https).await)
}
