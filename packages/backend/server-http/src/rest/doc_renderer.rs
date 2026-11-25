//! Document renderer REST route (`GET /workspace/{*path}`).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use axum::Router;
use axum::extract::{Path as AxumPath, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use chrono::Utc;
use serde_json::Value;
use server_db::WorkloadTier;
use server_types::DeploymentMode;
use sha2::{Digest as _, Sha256};
use sqlx::Row as _;
use v_htmlescape::escape as esc;
use y_octo::{Any, Doc, Value as YValue};

use crate::RouterState;
use crate::rest::resolve_request_principal_with_policy;

const STATIC_SUBPATHS: &[&str] = &["all", "home", "search", "collection", "tag", "trash"];
const MARKDOWN_TYPES: &[&str] = &["text/markdown", "application/markdown", "text/x-markdown"];
const MAX_SUMMARY_CHARS: usize = 500;
const MAX_VIEW_DEDUPE_ENTRIES: usize = 16_384;
pub(crate) fn router() -> Router<RouterState> {
  Router::new().route("/workspace/{*path}", get(handle_render_workspace_path))
}
type AssetsManifest = (Vec<String>, Vec<String>, String, String, String);
async fn load_merged_doc_snapshot(state: &RouterState, ws_id: &str, doc_id: &str) -> Option<Vec<u8>> {
  let mut conn = state.app.db.acquire_tiered(WorkloadTier::InteractiveRead).await.ok()?;
  let snap: Option<Vec<u8>> = sqlx::query_scalar("SELECT blob FROM snapshots WHERE workspace_id = $1 AND guid = $2")
    .bind(ws_id)
    .bind(doc_id)
    .fetch_optional(conn.as_conn())
    .await
    .ok()
    .flatten();
  let updates: Vec<Vec<u8>> =
    sqlx::query_scalar("SELECT blob FROM updates WHERE workspace_id = $1 AND guid = $2 ORDER BY created_at ASC")
      .bind(ws_id)
      .bind(doc_id)
      .fetch_all(conn.as_conn())
      .await
      .unwrap_or_default();
  drop(conn);
  if snap.is_none() && updates.is_empty() {
    return None;
  }
  let mut doc = Doc::default();
  for bin in snap.into_iter().chain(updates) {
    if !bin.is_empty() {
      let _ = doc.apply_update_from_binary_v1(&bin);
    }
  }
  doc.encode_state_as_update_v1(&y_octo::StateVector::default()).ok()
}
fn y_str(m: &y_octo::Map, k: &str) -> String {
  match m.get(k) {
    Some(YValue::Any(Any::String(s))) => s,
    _ => String::new(),
  }
}
pub fn render_doc_markdown_from_binary(bin: &[u8]) -> Option<(String, String, String)> {
  let mut doc = Doc::default();
  doc.apply_update_from_binary_v1(bin).ok()?;
  let blocks = doc.get_or_create_map("blocks").ok()?;
  let (mut title, mut lines, mut visited) = (String::new(), Vec::new(), HashSet::new());
  let mut roots: Vec<String> = blocks
    .iter()
    .filter_map(|(id, v)| matches!(v, YValue::Map(b) if y_str(&b, "sys:flavour") == "affine:page").then_some(id))
    .collect();
  roots.sort();
  let mut stack: Vec<(String, usize, usize)> = roots.into_iter().rev().map(|id| (id, 0, 0)).collect();
  while let Some((id, depth, list_depth)) = stack.pop() {
    if depth > 64 || !visited.insert(id.clone()) {
      continue;
    }
    let Some(YValue::Map(block)) = blocks.get(&id) else {
      continue;
    };
    let flavour = y_str(&block, "sys:flavour");
    if flavour == "affine:surface" || (flavour == "affine:note" && y_str(&block, "prop:displayMode") == "edgeless") {
      continue;
    }
    if flavour == "affine:page" {
      if let Some(YValue::Text(t)) = block.get("prop:title") {
        let s = t.to_string();
        if !s.trim().is_empty() {
          title = s.trim().to_owned();
        }
      }
    } else if let Some(YValue::Text(t)) = block.get("prop:text") {
      let raw = t.to_string();
      let trimmed = raw.trim();
      if !trimmed.is_empty() {
        let ptype = y_str(&block, "prop:type");
        let ind = "  ".repeat(list_depth);
        let line = match (flavour.as_str(), ptype.as_str()) {
          ("affine:paragraph", h @ ("h1" | "h2" | "h3" | "h4" | "h5" | "h6")) => {
            format!("{} {trimmed}", "#".repeat((h.as_bytes()[1] - b'0') as usize))
          }
          ("affine:paragraph", "quote") => format!("> {trimmed}"),
          ("affine:list", "numbered") => format!("{ind}1. {trimmed}"),
          ("affine:list", "todo") => {
            let chk = match block.get("prop:checked") {
              Some(YValue::Any(Any::True)) => "x",
              _ => " ",
            };
            format!("{ind}- [{chk}] {trimmed}")
          }
          ("affine:list", _) => format!("{ind}- {trimmed}"),
          ("affine:code", _) => format!("```\n{trimmed}\n```"),
          _ => trimmed.to_owned(),
        };
        lines.push(line);
      }
    }
    if depth < 64
      && let Some(YValue::Array(children)) = block.get("sys:children")
    {
      let next_ld = list_depth + usize::from(flavour == "affine:list");
      let cids: Vec<String> = children
        .iter()
        .filter_map(|c| match c {
          YValue::Any(Any::String(s)) => Some(s),
          _ => None,
        })
        .collect();
      for cid in cids.into_iter().rev() {
        stack.push((cid, depth + 1, next_ld));
      }
    }
  }
  let summary: String = lines
    .iter()
    .take(5)
    .cloned()
    .collect::<Vec<_>>()
    .join(" ")
    .chars()
    .take(MAX_SUMMARY_CHARS)
    .collect();
  let mut md = if title.is_empty() {
    String::new()
  } else {
    format!("# {title}\n\n")
  };
  md.push_str(&lines.join("\n\n"));
  if !md.is_empty() && !md.ends_with('\n') {
    md.push('\n');
  }
  Some((title, summary, md))
}
async fn handle_render_workspace_path(
  State(state): State<RouterState>,
  AxumPath(path): AxumPath<String>,
  headers: HeaderMap,
) -> Response {
  let resolved = match resolve_request_principal_with_policy(&state, &headers, true).await {
    Ok(r) => r,
    Err(err) => return err.into_http_response(),
  };
  let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
  let (ws_opt, sub_opt) = (segs.first().copied(), segs.get(1).copied());
  let is_ws = ws_opt.is_some() && sub_opt.is_some_and(|s| !STATIC_SUBPATHS.contains(&s)) && segs.len() == 2;
  let (is_doc, https) = (is_ws && ws_opt != sub_opt, state.app.config.load().https);
  let resolved_doc_id = if is_doc {
    let (ws_id, raw) = (ws_opt.unwrap_or(""), sub_opt.unwrap_or(""));
    Some(
      state
        .app
        .doc_sharing
        .resolve_storage_doc_id(ws_id, raw)
        .await
        .unwrap_or_else(|_| raw.to_owned()),
    )
  } else {
    None
  };
  let wants_md = headers.get_all(header::ACCEPT).iter().any(|val| {
    val.to_str().is_ok_and(|raw| {
      raw
        .split(',')
        .any(|p| MARKDOWN_TYPES.contains(&p.split(';').next().unwrap_or("").trim().to_ascii_lowercase().as_str()))
    })
  });
  if let Some(doc_id) = resolved_doc_id.as_deref()
    && wants_md
  {
    let (ws_id, uid) = (
      ws_opt.unwrap_or(""),
      resolved.principal.as_ref().map(|p| p.user().id.as_str()),
    );
    let can_read = state
      .app
      .doc_sharing
      .get_doc_permissions(ws_id, uid, doc_id)
      .await
      .ok()
      .flatten()
      .is_some_and(|p| p.doc_read);
    let mut resp = if can_read
      && let Some(bin) = load_merged_doc_snapshot(&state, ws_id, doc_id).await
      && let Some((_, _, md)) = render_doc_markdown_from_binary(&bin)
    {
      (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/markdown; charset=utf-8")],
        md,
      )
        .into_response()
    } else {
      StatusCode::NOT_FOUND.into_response()
    };
    let h = resp.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
    h.insert(header::VARY, HeaderValue::from_static("Accept, Cookie, Authorization"));
    resolved.cookie_action.apply_to(h, https);
    return resp;
  }
  let cfg = state.app.config.load();
  let (mut meta, mut indexable): (Option<(String, String, Option<String>)>, bool) = (None, false);
  if is_ws {
    let ws_id = ws_opt.unwrap_or("");
    if let Some(doc_id) = resolved_doc_id.as_deref() {
      let raw_doc_id = sub_opt.unwrap_or("");
      if let Ok(Some(perms)) = state.app.doc_sharing.get_doc_permissions(ws_id, None, doc_id).await
        && perms.doc_preview
      {
        indexable = perms.doc_read;
        if let Some(bin) = load_merged_doc_snapshot(&state, ws_id, doc_id).await
          && let Some((title, summary, _)) = render_doc_markdown_from_binary(&bin)
        {
          meta = Some((title, summary, None));
        }
        if meta.is_some() {
          static VIEW_CACHE: OnceLock<Mutex<(String, HashSet<[u8; 32]>)>> = OnceLock::new();
          let ip = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok()?.split(',').next())
            .map_or("unknown", str::trim);
          let ua = headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
          let ua_trunc: String = ua.chars().take(256).collect();
          let key: [u8; 32] = Sha256::digest(format!("{ws_id}:{doc_id}:{ip}:{ua_trunc}")).into();
          let today = Utc::now().format("%Y-%m-%d").to_string();
          let rec = VIEW_CACHE
            .get_or_init(|| Mutex::new((String::new(), HashSet::new())))
            .lock()
            .map_or(true, |mut g| {
              if g.0 != today || g.1.len() >= MAX_VIEW_DEDUPE_ENTRIES {
                (g.0, g.1) = (today, HashSet::new());
              }
              g.1.insert(key)
            });
          if rec {
            let (ds, w, d) = (state.app.doc_sharing.clone(), ws_id.to_owned(), raw_doc_id.to_owned());
            tokio::spawn(async move { ds.record_doc_view(&w, &d, true).await });
          }
        }
      }
    } else if let Ok(mut conn) = state.app.db.acquire_tiered(WorkloadTier::InteractiveRead).await
      && let Ok(Some(row)) = sqlx::query(
        "SELECT w.name, w.avatar_key, COALESCE(wap.sharing_enabled, true) AS sh, \
                COALESCE(wap.visibility, 'private') AS vis, COALESCE(wap.url_preview_enabled, false) AS prev \
         FROM workspaces w LEFT JOIN workspace_access_policies wap ON wap.workspace_id = w.id WHERE w.id = $1",
      )
      .bind(ws_id)
      .fetch_optional(conn.as_conn())
      .await
    {
      let (sh, vis, prev): (bool, String, bool) = (row.get("sh"), row.get("vis"), row.get("prev"));
      if sh && (vis == "public" || prev) {
        indexable = vis == "public";
        let name = row
          .get::<Option<String>, _>("name")
          .unwrap_or_else(|| "AFFiNE Workspace".into());
        let avatar = row
          .get::<Option<String>, _>("avatar_key")
          .filter(|k| !k.is_empty())
          .map(|k| format!("{}/api/avatars/{k}", cfg.external_url.trim_end_matches('/')));
        meta = Some((name, String::new(), avatar));
      }
    }
  }
  let selfhosted = cfg.deployment_mode == DeploymentMode::Selfhosted;
  let is_mobile = cfg.channel == "canary" && crate::rest::static_files::is_mobile_request(&headers);
  let mut assets: AssetsManifest = (Vec::new(), Vec::new(), "/".into(), String::new(), String::new());
  if let Some(dir) = cfg.static_dir.as_deref() {
    type AssetsCache = Mutex<HashMap<(PathBuf, bool, bool), AssetsManifest>>;
    static CACHE: OnceLock<AssetsCache> = OnceLock::new();
    let (key, cache) = (
      (dir.to_path_buf(), is_mobile, selfhosted),
      CACHE.get_or_init(Default::default),
    );
    if let Some(c) = cache.lock().ok().and_then(|g| g.get(&key).cloned()) {
      assets = c;
    } else {
      let base = if is_mobile {
        dir.join("mobile")
      } else {
        dir.to_path_buf()
      };
      if let Ok(raw) = tokio::fs::read_to_string(base.join("assets-manifest.json")).await
        && let Ok(v) = serde_json::from_str::<Value>(&raw)
      {
        let pp_raw = v.get("publicPath").and_then(Value::as_str).unwrap_or("/");
        let pp = if selfhosted || pp_raw.is_empty() { "/" } else { pp_raw }.to_owned();
        let list = |k: &str| {
          v.get(k)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(|p| format!("{pp}{p}")).collect())
            .unwrap_or_default()
        };
        let gs = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
        assets = (list("css"), list("js"), pp, gs("gitHash"), gs("description"));
      }
      if let Ok(mut g) = cache.lock() {
        if g.len() >= 64 {
          g.clear();
        }
        g.insert(key, assets.clone());
      }
    }
  }
  let title = match meta.as_ref() {
    Some((t, _, _)) if !t.is_empty() => esc(&format!("{t} | AFFiNE")).to_string(),
    _ => "AFFiNE".to_owned(),
  };
  let summary = esc(meta.as_ref().map_or(assets.4.as_str(), |(_, s, _)| s.as_str()));
  let img_raw = meta
    .as_ref()
    .and_then(|(_, _, a)| a.as_deref())
    .unwrap_or("https://affine.pro/og.jpeg");
  let (image, pp, sp, hash) = (
    esc(img_raw),
    esc(&assets.2),
    esc(&cfg.app_config_baseline.server.path),
    esc(&assets.3),
  );
  let (itunes, sh_meta) = if selfhosted {
    ("", r#"<meta name="env:isSelfHosted" content="true" />"#)
  } else {
    (r#"<meta name="apple-itunes-app" content="app-id=6736937980" />"#, "")
  };
  let preconnect = if assets.2.starts_with('/') {
    String::new()
  } else {
    format!(r#"<link rel="preconnect" href="{pp}" />"#)
  };
  let robots = if indexable {
    ""
  } else {
    r#"<meta name="robots" content="noindex, nofollow" />"#
  };
  let css: String = assets
    .0
    .iter()
    .map(|u| format!(r#"<link rel="stylesheet" href="{}" crossorigin />"#, esc(u)))
    .collect();
  let js: String = assets
    .1
    .iter()
    .map(|u| format!(r#"<script src="{}" crossorigin></script>"#, esc(u)))
    .collect();
  let html = format!(
    r##"<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" /><meta name="mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />{itunes}<title>{title}</title><meta name="theme-color" content="#fafafa" />{preconnect}<link rel="manifest" href="/manifest.json" /><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" /><link rel="icon" sizes="192x192" href="/favicon-192.png" /><link rel="shortcut icon" href="/favicon.ico?v=2" /><meta name="emotion-insertion-point" content="" />{robots}<meta name="twitter:title" content="{title}" /><meta name="twitter:description" content="{summary}" /><meta name="twitter:site" content="@AffineOfficial" /><meta name="twitter:image" content="{image}" /><meta property="og:title" content="{title}" /><meta property="og:description" content="{summary}" /><meta property="og:image" content="{image}" /><meta name="env:publicPath" content="{pp}" /><meta name="env:subPath" content="{sp}" /><meta name="env:renderer" content="ssr" />{sh_meta}{css}</head><body><div id="app" data-version="{hash}"></div>{js}</body></html>"##
  );
  let mut resp = (
    StatusCode::OK,
    [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
    html,
  )
    .into_response();
  let h = resp.headers_mut();
  if !indexable {
    h.insert(
      header::HeaderName::from_static("x-robots-tag"),
      HeaderValue::from_static("noindex"),
    );
  }
  resolved.cookie_action.apply_to(h, https);
  resp
}
