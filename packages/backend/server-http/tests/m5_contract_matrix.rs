//! M5 bidirectional structural GraphQL SDL AST diff and complete 68-route + 26-mount
//! `(DeploymentMode, ServerRole)` contract matrix verification.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::Arc;

use async_graphql::Value as ConstValue;
use async_graphql::parser::parse_schema;
use async_graphql::parser::types::{
  BaseType, ConstDirective, FieldDefinition, InputValueDefinition, ServiceDocument, Type, TypeDefinition, TypeKind,
  TypeSystemDefinition,
};
use axum::body::Body;
use http::{HeaderValue, Method, Request, StatusCode, header};
use server_db::{DbConfig, ServerDb};
use server_http::graphql::{MutationRoot, QueryRoot, build_schema, export_valid_sdl};
use server_http::{AppState, RuntimeConfig, build_router};
use server_spi::CommunityExtension;
use server_types::{DeploymentMode, ServerRole};
use test_db_harness::{
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, DbLease, PgCluster},
};
use tower::ServiceExt as _;

#[derive(Debug, Clone, Eq, PartialEq)]
struct CanonicalDeprecation {
  deprecated: bool,
  reason: Option<String>,
}

#[derive(Debug, Clone, Eq, PartialEq)]
struct CanonicalInputValue {
  ty: String,
  default_value: Option<String>,
  deprecation: CanonicalDeprecation,
}

#[derive(Debug, Clone, Eq, PartialEq)]
struct CanonicalField {
  ty: String,
  args: BTreeMap<String, CanonicalInputValue>,
  deprecation: CanonicalDeprecation,
}

#[derive(Debug, Clone, Eq, PartialEq)]
enum CanonicalTypeDef {
  Scalar,
  Enum(BTreeMap<String, CanonicalDeprecation>),
  Union(BTreeSet<String>),
  Interface {
    implements: BTreeSet<String>,
    fields: BTreeMap<String, CanonicalField>,
  },
  Object {
    implements: BTreeSet<String>,
    fields: BTreeMap<String, CanonicalField>,
  },
  InputObject(BTreeMap<String, CanonicalInputValue>),
  Directive {
    args: BTreeMap<String, CanonicalInputValue>,
    locations: BTreeSet<String>,
    repeatable: bool,
  },
}

fn format_type(ty: &Type) -> String {
  let inner = match &ty.base {
    BaseType::Named(name) => name.to_string(),
    BaseType::List(elem) => format!("[{}]", format_type(elem)),
  };
  if ty.nullable { inner } else { format!("{inner}!") }
}

fn format_const_value(value: &ConstValue) -> String {
  match value {
    ConstValue::Null => "null".to_owned(),
    ConstValue::Number(n) => n.to_string(),
    ConstValue::String(s) => serde_json::to_string(s).unwrap_or_else(|_| format!("\"{s}\"")),
    ConstValue::Boolean(b) => b.to_string(),
    ConstValue::Binary(b) => format!("0x{}", hex::encode(b)),
    ConstValue::Enum(e) => e.to_string(),
    ConstValue::List(items) => {
      let inner: Vec<String> = items.iter().map(format_const_value).collect();
      format!("[{}]", inner.join(", "))
    }
    ConstValue::Object(map) => {
      let mut entries: Vec<(String, String)> = map
        .iter()
        .map(|(k, v)| (k.to_string(), format_const_value(v)))
        .collect();
      entries.sort_by(|a, b| a.0.cmp(&b.0));
      let inner: Vec<String> = entries.into_iter().map(|(k, v)| format!("{k}: {v}")).collect();
      format!("{{{}}}", inner.join(", "))
    }
  }
}

fn extract_deprecation(directives: &[async_graphql::Positioned<ConstDirective>]) -> CanonicalDeprecation {
  for dir in directives {
    if dir.node.name.node == "deprecated" {
      let reason = dir.node.arguments.iter().find_map(|(k, v)| {
        if k.node == "reason" {
          match &v.node {
            ConstValue::String(s) => Some(s.clone()),
            other => Some(format_const_value(other)),
          }
        } else {
          None
        }
      });
      return CanonicalDeprecation {
        deprecated: true,
        reason,
      };
    }
  }
  CanonicalDeprecation {
    deprecated: false,
    reason: None,
  }
}

fn canonical_input_value(iv: &InputValueDefinition) -> CanonicalInputValue {
  CanonicalInputValue {
    ty: format_type(&iv.ty.node),
    default_value: iv.default_value.as_ref().map(|v| format_const_value(&v.node)),
    deprecation: extract_deprecation(&iv.directives),
  }
}

fn canonical_field(f: &FieldDefinition) -> CanonicalField {
  let args = f
    .arguments
    .iter()
    .map(|arg| (arg.node.name.node.to_string(), canonical_input_value(&arg.node)))
    .collect();
  CanonicalField {
    ty: format_type(&f.ty.node),
    args,
    deprecation: extract_deprecation(&f.directives),
  }
}

fn canonicalize_document(doc: &ServiceDocument) -> BTreeMap<String, CanonicalTypeDef> {
  // Built-in GraphQL scalars and built-in directives (@include, @skip, @deprecated, @specifiedBy,
  // @oneOf) plus the redundant `schema { query: Query mutation: Mutation }` root block emitted by
  // `async-graphql::Schema::sdl()` are normalized out because Apollo SDL omits them by default.
  const BUILTIN_SCALARS: &[&str] = &["Int", "Float", "String", "Boolean", "ID"];
  const BUILTIN_DIRECTIVES: &[&str] = &["include", "skip", "deprecated", "specifiedBy", "oneOf"];

  let mut out = BTreeMap::new();
  for def in &doc.definitions {
    match def {
      TypeSystemDefinition::Type(td) => {
        let TypeDefinition { name, kind, .. } = &td.node;
        let type_name = name.node.to_string();
        if matches!(kind, TypeKind::Scalar) && BUILTIN_SCALARS.contains(&type_name.as_str()) {
          continue;
        }
        let canonical = match kind {
          TypeKind::Scalar => CanonicalTypeDef::Scalar,
          TypeKind::Enum(e) => {
            let vals = e
              .values
              .iter()
              .map(|v| (v.node.value.node.to_string(), extract_deprecation(&v.node.directives)))
              .collect();
            CanonicalTypeDef::Enum(vals)
          }
          TypeKind::Union(u) => {
            let members = u.members.iter().map(|m| m.node.to_string()).collect();
            CanonicalTypeDef::Union(members)
          }
          TypeKind::Interface(i) => {
            let implements = i.implements.iter().map(|im| im.node.to_string()).collect();
            let fields = i
              .fields
              .iter()
              .map(|f| (f.node.name.node.to_string(), canonical_field(&f.node)))
              .collect();
            CanonicalTypeDef::Interface { implements, fields }
          }
          TypeKind::Object(o) => {
            let implements = o.implements.iter().map(|im| im.node.to_string()).collect();
            let fields = o
              .fields
              .iter()
              .map(|f| (f.node.name.node.to_string(), canonical_field(&f.node)))
              .collect();
            CanonicalTypeDef::Object { implements, fields }
          }
          TypeKind::InputObject(io) => {
            let fields = io
              .fields
              .iter()
              .map(|f| (f.node.name.node.to_string(), canonical_input_value(&f.node)))
              .collect();
            CanonicalTypeDef::InputObject(fields)
          }
        };
        out.insert(type_name, canonical);
      }
      TypeSystemDefinition::Directive(dd) => {
        let name = dd.node.name.node.to_string();
        if BUILTIN_DIRECTIVES.contains(&name.as_str()) {
          continue;
        }
        let args = dd
          .node
          .arguments
          .iter()
          .map(|arg| (arg.node.name.node.to_string(), canonical_input_value(&arg.node)))
          .collect();
        let locations = dd.node.locations.iter().map(|loc| format!("{:?}", loc.node)).collect();
        out.insert(
          format!("@{name}"),
          CanonicalTypeDef::Directive {
            args,
            locations,
            repeatable: dd.node.is_repeatable,
          },
        );
      }
      TypeSystemDefinition::Schema(_) => {}
    }
  }
  out
}

fn diff_schemas(
  oracle: &BTreeMap<String, CanonicalTypeDef>,
  candidate: &BTreeMap<String, CanonicalTypeDef>,
) -> Vec<String> {
  let mut diffs = Vec::new();
  for (name, oracle_def) in oracle {
    match candidate.get(name) {
      None => diffs.push(format!("MISSING type `{name}` in runtime schema")),
      Some(cand_def) => diff_type_def(name, oracle_def, cand_def, &mut diffs),
    }
  }
  for name in candidate.keys() {
    if !oracle.contains_key(name) {
      diffs.push(format!("EXTRA type `{name}` in runtime schema (not in v0.27.5 oracle)"));
    }
  }
  diffs
}

fn diff_type_def(name: &str, oracle: &CanonicalTypeDef, cand: &CanonicalTypeDef, diffs: &mut Vec<String>) {
  match (oracle, cand) {
    (CanonicalTypeDef::Scalar, CanonicalTypeDef::Scalar) => {}
    (CanonicalTypeDef::Enum(o), CanonicalTypeDef::Enum(c)) => {
      for (k, v) in o {
        match c.get(k) {
          None => diffs.push(format!("enum {name}: MISSING value `{k}`")),
          Some(cv) if cv != v => diffs.push(format!("enum {name}.{k}: deprecation oracle={v:?} vs runtime={cv:?}")),
          _ => {}
        }
      }
      for k in c.keys() {
        if !o.contains_key(k) {
          diffs.push(format!("enum {name}: EXTRA value `{k}`"));
        }
      }
    }
    (CanonicalTypeDef::Union(o), CanonicalTypeDef::Union(c)) => {
      if o != c {
        diffs.push(format!("union {name}: oracle={o:?} vs runtime={c:?}"));
      }
    }
    (
      CanonicalTypeDef::Interface {
        implements: oi,
        fields: of,
      },
      CanonicalTypeDef::Interface {
        implements: ci,
        fields: cf,
      },
    )
    | (
      CanonicalTypeDef::Object {
        implements: oi,
        fields: of,
      },
      CanonicalTypeDef::Object {
        implements: ci,
        fields: cf,
      },
    ) => {
      if oi != ci {
        diffs.push(format!("type {name} implements: oracle={oi:?} vs runtime={ci:?}"));
      }
      for (fname, fdef) in of {
        match cf.get(fname) {
          None => diffs.push(format!("type {name}: MISSING field `{fname}: {}`", fdef.ty)),
          Some(cfdef) => {
            if fdef.ty != cfdef.ty {
              diffs.push(format!(
                "type {name}.{fname}: return type oracle=`{}` vs runtime=`{}`",
                fdef.ty, cfdef.ty
              ));
            }
            if fdef.deprecation != cfdef.deprecation {
              diffs.push(format!(
                "type {name}.{fname}: deprecation oracle={:?} vs runtime={:?}",
                fdef.deprecation, cfdef.deprecation
              ));
            }
            for (aname, adef) in &fdef.args {
              match cfdef.args.get(aname) {
                None => diffs.push(format!("type {name}.{fname}: MISSING arg `{aname}: {}`", adef.ty)),
                Some(cadef) if cadef != adef => diffs.push(format!(
                  "type {name}.{fname}({aname}): oracle={adef:?} vs runtime={cadef:?}"
                )),
                _ => {}
              }
            }
            for aname in cfdef.args.keys() {
              if !fdef.args.contains_key(aname) {
                diffs.push(format!("type {name}.{fname}: EXTRA arg `{aname}`"));
              }
            }
          }
        }
      }
      for fname in cf.keys() {
        if !of.contains_key(fname) {
          diffs.push(format!("type {name}: EXTRA field `{fname}`"));
        }
      }
    }
    (CanonicalTypeDef::InputObject(o), CanonicalTypeDef::InputObject(c)) => {
      for (fname, fdef) in o {
        match c.get(fname) {
          None => diffs.push(format!("input {name}: MISSING field `{fname}: {}`", fdef.ty)),
          Some(cfdef) if cfdef != fdef => {
            diffs.push(format!("input {name}.{fname}: oracle={fdef:?} vs runtime={cfdef:?}"))
          }
          _ => {}
        }
      }
      for fname in c.keys() {
        if !o.contains_key(fname) {
          diffs.push(format!("input {name}: EXTRA field `{fname}`"));
        }
      }
    }
    (
      CanonicalTypeDef::Directive {
        args: oa,
        locations: ol,
        repeatable: or,
      },
      CanonicalTypeDef::Directive {
        args: ca,
        locations: cl,
        repeatable: cr,
      },
    ) => {
      if ol != cl || or != cr || oa != ca {
        diffs.push(format!(
          "directive {name}: oracle=({oa:?}, {ol:?}, {or}) vs runtime=({ca:?}, {cl:?}, {cr})"
        ));
      }
    }
    _ => diffs.push(format!(
      "type {name}: KIND mismatch oracle={oracle:?} vs runtime={cand:?}"
    )),
  }
}

#[test]
fn bidirectional_graphql_sdl_ast_matches_frozen_v0275_oracle_without_exemptions() {
  let oracle_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/oracle-contracts/v0.27.5/schema.gql");
  let oracle_sdl =
    std::fs::read_to_string(&oracle_path).unwrap_or_else(|e| panic!("failed to read {}: {e}", oracle_path.display()));
  let schema = async_graphql::Schema::new(
    QueryRoot::default(),
    MutationRoot::default(),
    async_graphql::EmptySubscription,
  );
  let runtime_sdl = export_valid_sdl(&schema);

  let oracle_doc = parse_schema(&oracle_sdl).expect("parse v0.27.5 oracle schema.gql");
  let runtime_doc = parse_schema(&runtime_sdl).expect("parse community runtime SDL");

  let oracle_map = canonicalize_document(&oracle_doc);
  let runtime_map = canonicalize_document(&runtime_doc);

  assert_eq!(
    oracle_map.len(),
    342,
    "v0.27.5 oracle must contain 342 top-level definitions"
  );
  let oracle_queries = match oracle_map.get("Query").expect("oracle Query") {
    CanonicalTypeDef::Object { fields, .. } => fields.len(),
    _ => panic!("oracle Query must be an object"),
  };
  let oracle_mutations = match oracle_map.get("Mutation").expect("oracle Mutation") {
    CanonicalTypeDef::Object { fields, .. } => fields.len(),
    _ => panic!("oracle Mutation must be an object"),
  };
  assert_eq!(oracle_queries, 28, "v0.27.5 oracle must have 28 Query fields");
  assert_eq!(oracle_mutations, 107, "v0.27.5 oracle must have 107 Mutation fields");

  let diffs = diff_schemas(&oracle_map, &runtime_map);
  assert!(
    diffs.is_empty(),
    "Found {} bidirectional AST diffs between v0.27.5 oracle and community runtime SDL:\n{}",
    diffs.len(),
    diffs.join("\n")
  );
  assert_eq!(runtime_map.len(), 342);
}

struct LeaseGuard(Option<(PgCluster, DbLease)>);

impl Drop for LeaseGuard {
  fn drop(&mut self) {
    if let Some(inner) = self.0.take() {
      let _ = std::thread::spawn(move || drop(inner)).join();
    }
  }
}

async fn lease_fresh_db() -> (LeaseGuard, String) {
  let (cluster, lease) = tokio::task::spawn_blocking(|| {
    let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
    let migrations = MigrationSet::from_migrations(Vec::new());
    let template = cluster.ensure_template(&migrations).expect("empty template");
    let lease = cluster
      .lease(&template, DEFAULT_LEASE_TTL)
      .expect("lease test database");
    (cluster, lease)
  })
  .await
  .expect("join lease db");
  let url = lease.url().to_owned();
  (LeaseGuard(Some((cluster, lease))), url)
}

async fn connect_ready_db(url: &str) -> ServerDb {
  let db = ServerDb::connect(DbConfig {
    database_url: url.to_owned(),
    channel: "canary".into(),
    role: ServerRole::Allinone,
    selfhosted: true,
    max_connections: 4,
    statement_timeout_ms: 5_000,
    tier_permits: [8, 4, 2, 1],
  })
  .await
  .expect("connect db");
  sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    .execute(db.pool())
    .await
    .expect("reset schema");
  db.ensure_schema_ready().await.expect("ensure schema ready");
  db
}

fn build_mode_router(
  db: ServerDb,
  mode: DeploymentMode,
  role: ServerRole,
  static_dir: Option<std::path::PathBuf>,
) -> axum::Router {
  let cfg = RuntimeConfig {
    deployment_mode: mode,
    role,
    dev_mode: false,
    static_dir,
    external_url: "http://127.0.0.1:3010".to_owned(),
    ..RuntimeConfig::default()
  };

  let state = AppState::new(db, None, cfg, Arc::new(CommunityExtension::default()));
  build_router(state)
}

fn materialize_route_path(pattern: &str) -> String {
  pattern
    .replace(":workspaceId", "ws-contract-1")
    .replace(":sessionId", "sess-contract-1")
    .replace(":docId", "doc-contract-1")
    .replace(":license", "lic-contract-1")
    .replace(":timestamp", "1700000000000")
    .replace(":guid", "doc-contract-1")
    .replace(":name", "blob-contract-1")
    .replace(":key", "key-contract-1")
    .replace(":id", "id-contract-1")
    .replace("*path", "ws-contract-1/doc-contract-1")
}

fn is_commercial_extension_route(path: &str) -> bool {
  path.starts_with("/api/team/licenses/")
    || path.starts_with("/api/team/v1/licenses/")
    || path == "/api/stripe/webhook"
    || path == "/api/worker/stripeWebhook"
    || path == "/api/revenuecat/webhook"
}

#[tokio::test]
async fn oracle_68_routes_and_26_mounts_matrix_across_deployment_modes_and_roles() {
  let oracle_path =
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/oracle-contracts/v0.27.5/rest-routes.json");
  let raw = std::fs::read_to_string(&oracle_path).expect("read rest-routes.json");
  let json: serde_json::Value = serde_json::from_str(&raw).expect("parse rest-routes.json");
  let routes = json["routes"].as_array().expect("routes array");
  let mounts = json["mounts"].as_array().expect("mounts array");
  assert_eq!(routes.len(), 68, "v0.27.5 oracle must list 68 controller routes");
  assert_eq!(mounts.len(), 26, "v0.27.5 oracle must list 26 imperative mounts");

  let static_dir = std::env::temp_dir().join(format!("affine-m5-static-{}", uuid::Uuid::new_v4()));
  std::fs::create_dir_all(static_dir.join("admin")).expect("mkdir static/admin");
  std::fs::write(static_dir.join("index.html"), "<html>front-index</html>").unwrap();
  std::fs::write(static_dir.join("selfhost.html"), "<html>selfhost-index</html>").unwrap();
  std::fs::write(static_dir.join("admin/index.html"), "<html>admin-index</html>").unwrap();

  let (_lease_guard, db_url) = lease_fresh_db().await;
  let db = connect_ready_db(&db_url).await;

  let selfhost_allinone = build_mode_router(
    db.clone(),
    DeploymentMode::Selfhosted,
    ServerRole::Allinone,
    Some(static_dir.clone()),
  );
  let selfhost_graphql = build_mode_router(
    db.clone(),
    DeploymentMode::Selfhosted,
    ServerRole::Graphql,
    Some(static_dir.clone()),
  );
  let cloud_allinone = build_mode_router(
    db.clone(),
    DeploymentMode::Cloud,
    ServerRole::Allinone,
    Some(static_dir.clone()),
  );
  let cloud_front = build_mode_router(
    db.clone(),
    DeploymentMode::Cloud,
    ServerRole::Front,
    Some(static_dir.clone()),
  );

  // 1. Account for every single one of the 68 controller routes.
  let mut community_mounted_count = 0usize;
  let mut commercial_extension_count = 0usize;
  for rt in routes {
    let method_str = rt["method"].as_str().expect("route method");
    let full_path = rt["full_path"].as_str().expect("route full_path");
    let method = Method::from_bytes(method_str.as_bytes()).expect("valid HTTP method");
    let concrete_path = materialize_route_path(full_path);

    if is_commercial_extension_route(full_path) {
      commercial_extension_count += 1;
      // CommunityExtension does not mount commercial payment/license routes.
      let resp = cloud_allinone
        .clone()
        .oneshot(
          Request::builder()
            .method(method)
            .uri(&concrete_path)
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
      assert_eq!(
        resp.status(),
        StatusCode::NOT_FOUND,
        "CommunityExtension should not mount commercial route {method_str} {full_path}"
      );
      continue;
    }

    community_mounted_count += 1;
    // In Selfhosted Allinone, every non-commercial controller route must be mounted (not 404/405).
    // Note: /workspace/*path returns 404 for unknown doc IDs from DB, so check DocRenderer separately
    // or verify its handler ran rather than router 404 fallback; similarly DB-backed GETs with lazy DB
    // return 500/401/400/403/503 (never 405 Method Not Allowed).
    let mut req = Request::builder().method(method.clone()).uri(&concrete_path);
    if method == Method::OPTIONS {
      req = req
        .header(header::ORIGIN, "http://127.0.0.1:3010")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST");
    }
    let resp = selfhost_allinone
      .clone()
      .oneshot(req.body(Body::empty()).unwrap())
      .await
      .unwrap();
    assert_ne!(
      resp.status(),
      StatusCode::METHOD_NOT_ALLOWED,
      "route {method_str} {full_path} returned 405 on Selfhosted Allinone"
    );
    assert_ne!(
      resp.status(),
      StatusCode::INTERNAL_SERVER_ERROR,
      "route {method_str} {full_path} returned 500 on Selfhosted Allinone"
    );
    let is_resource_lookup_404_allowed = matches!(
      full_path,
      "/workspace/*path"
        | "/api/avatars/:id"
        | "/api/workspaces/:id/blobs/:name"
        | "/api/workspaces/:id/blobs/v1/:name"
        | "/api/workspaces/:id/blob-manifest/v1"
        | "/api/workspaces/:id/readable-blob-manifest/v1"
        | "/api/workspaces/:id/docs/:guid"
        | "/api/workspaces/:id/docs/:guid/histories/:timestamp"
        | "/api/workspaces/:id/docs/:docId/comment-attachments/:key"
        | "/api/workspaces/:id/public-docs/:docId"
        | "/api/workspaces/:id/public-docs/:docId/root-doc"
        | "/api/copilot/chat/:sessionId/attachments/:key"
    );
    if !is_resource_lookup_404_allowed {
      assert_ne!(
        resp.status(),
        StatusCode::NOT_FOUND,
        "route {method_str} {full_path} returned 404 on Selfhosted Allinone"
      );
    } else if resp.status() == StatusCode::NOT_FOUND && method != Method::HEAD {
      // Handler-produced 404 must carry a response body or JSON content-type (not an empty router fallback).
      let has_json_ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.contains("application/json") || ct.contains("text/plain"));
      let body = axum::body::to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
      assert!(
        has_json_ct || !body.is_empty(),
        "resource route {method_str} {full_path} returned bare empty 404 (unmounted)"
      );
    }
  }
  assert_eq!(community_mounted_count + commercial_extension_count, 68);
  assert_eq!(commercial_extension_count, 15);

  // 2. Explicit (DeploymentMode, ServerRole) matrix assertions.
  // 2a. OPTIONS preflight CORS handling
  for path in [
    "/api/telemetry/collect",
    "/api/worker/image-proxy",
    "/api/worker/link-preview",
  ] {
    let resp = selfhost_allinone
      .clone()
      .oneshot(
        Request::builder()
          .method(Method::OPTIONS)
          .uri(path)
          .header(header::ORIGIN, "http://127.0.0.1:3010")
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert!(
      resp.status().is_success(),
      "OPTIONS {path} must succeed on Selfhosted Allinone, got {}",
      resp.status()
    );
    assert!(
      resp.headers().contains_key(header::ACCESS_CONTROL_ALLOW_METHODS),
      "OPTIONS {path} must return Access-Control-Allow-Methods"
    );
  }

  // 2b. Selfhosted Graphql: /admin/index.html -> /admin redirect and /index.html -> / redirect
  let admin_redirect = selfhost_graphql
    .clone()
    .oneshot(Request::builder().uri("/admin/index.html").body(Body::empty()).unwrap())
    .await
    .unwrap();
  assert_eq!(admin_redirect.status(), StatusCode::FOUND);
  assert_eq!(
    admin_redirect.headers().get(header::LOCATION),
    Some(&HeaderValue::from_static("/admin"))
  );

  let root_redirect = selfhost_graphql
    .clone()
    .oneshot(Request::builder().uri("/index.html").body(Body::empty()).unwrap())
    .await
    .unwrap();
  assert_eq!(root_redirect.status(), StatusCode::FOUND);
  assert_eq!(
    root_redirect.headers().get(header::LOCATION),
    Some(&HeaderValue::from_static("/"))
  );

  // Selfhosted Graphql: DocRenderer GET /workspace/{*path} with Accept: text/markdown hits
  // DocRenderer Markdown authz (401/403/404 JSON/text), not selfhost.html fallback.
  let doc_renderer_resp = selfhost_graphql
    .clone()
    .oneshot(
      Request::builder()
        .uri("/workspace/ws-1/doc-1")
        .header(header::ACCEPT, "text/markdown")
        .body(Body::empty())
        .unwrap(),
    )
    .await
    .unwrap();
  assert_ne!(doc_renderer_resp.status(), StatusCode::METHOD_NOT_ALLOWED);
  let doc_renderer_ct = doc_renderer_resp
    .headers()
    .get(header::CONTENT_TYPE)
    .and_then(|v| v.to_str().ok())
    .unwrap_or("");
  assert!(
    !doc_renderer_ct.starts_with("text/html"),
    "Selfhosted Graphql /workspace/ws-1/doc-1 with Accept: text/markdown must hit DocRenderer, got ct={doc_renderer_ct}"
  );

  // 2c. Cloud Allinone: static asset absence and 404 on selfhost-only routes
  for (method, path) in [
    (Method::GET, "/"),
    (Method::GET, "/admin"),
    (Method::GET, "/admin/index.html"),
    (Method::POST, "/api/setup/create-admin-user"),
    (Method::POST, "/api/worker/link-preview"),
    (Method::GET, "/api/worker/image-proxy"),
    (Method::OPTIONS, "/api/worker/link-preview"),
    (Method::OPTIONS, "/api/worker/image-proxy"),
  ] {
    let resp = cloud_allinone
      .clone()
      .oneshot(
        Request::builder()
          .method(method.clone())
          .uri(path)
          .body(Body::empty())
          .unwrap(),
      )
      .await
      .unwrap();
    assert_eq!(
      resp.status(),
      StatusCode::NOT_FOUND,
      "Cloud Allinone must return 404 for {method} {path}"
    );
  }

  // 2d. Cloud Front: standard static assets mounted (GET / serves index.html, GET /admin serves admin/index.html)
  let front_root = cloud_front
    .clone()
    .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
    .await
    .unwrap();
  assert_eq!(front_root.status(), StatusCode::OK);
  let front_admin = cloud_front
    .clone()
    .oneshot(Request::builder().uri("/admin").body(Body::empty()).unwrap())
    .await
    .unwrap();
  assert_eq!(front_admin.status(), StatusCode::OK);

  // 2e. Partial GraphQL error (`data` + `errors` simultaneously) on live /graphql route.
  // `checkoutAttempt(plan: Pro)` is nullable (`String`), so an auth/payment error on it
  // preserves sibling `__typename` in `data` while returning `errors` alongside it.
  let gql_resp = selfhost_allinone
    .clone()
    .oneshot(
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
          serde_json::json!({
            "query": "query { __typename checkoutAttempt(plan: Pro) }"
          })
          .to_string(),
        ))
        .unwrap(),
    )
    .await
    .unwrap();
  assert_eq!(gql_resp.status(), StatusCode::OK);
  let body_bytes = axum::body::to_bytes(gql_resp.into_body(), 1024 * 1024).await.unwrap();
  let gql_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
  assert_eq!(gql_json["data"]["__typename"], "Query", "gql_json={gql_json}");
  assert!(gql_json["data"]["checkoutAttempt"].is_null());
  assert!(
    gql_json["errors"].as_array().is_some_and(|e| !e.is_empty()),
    "partial GraphQL response must contain both data and errors: {gql_json}"
  );

  // 2f. Multipart GraphQL Upload request route is accepted by /graphql (401/GraphQL error, not 415/404)
  let boundary = "----m5contractboundary";
  let multipart_body = format!(
    "--{boundary}\r\n\
     Content-Disposition: form-data; name=\"operations\"\r\n\r\n\
     {{\"query\":\"mutation($avatar: Upload!) {{ uploadAvatar(avatar: $avatar) {{ id }} }}\",\"variables\":{{\"avatar\":null}}}}\r\n\
     --{boundary}\r\n\
     Content-Disposition: form-data; name=\"map\"\r\n\r\n\
     {{\"0\":[\"variables.avatar\"]}}\r\n\
     --{boundary}\r\n\
     Content-Disposition: form-data; name=\"0\"; filename=\"a.png\"\r\n\
     Content-Type: image/png\r\n\r\n\
     PNGDATA\r\n\
     --{boundary}--\r\n"
  );
  let upload_resp = selfhost_allinone
    .clone()
    .oneshot(
      Request::builder()
        .method(Method::POST)
        .uri("/graphql")
        .header(
          header::CONTENT_TYPE,
          format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(multipart_body))
        .unwrap(),
    )
    .await
    .unwrap();
  assert_eq!(
    upload_resp.status(),
    StatusCode::OK,
    "multipart GraphQL Upload must parse and execute through GraphQL auth envelope"
  );

  // 2g. All 26 mounts classification completeness check
  let mut accounted_mounts = 0usize;
  for m in mounts {
    let method = m["method"].as_str().unwrap_or("USE");
    let path = m["full_path"].as_str().unwrap_or("");
    let flavor = m["flavor"].as_str().unwrap_or("all");
    let valid = matches!(
      (method, path, flavor),
      ("GET" | "POST", "/graphql", "all")
        | ("GET" | "POST" | "WEBSOCKET", "/socket.io", "all")
        | (
          "GET",
          "/" | "/*path" | "/admin" | "/admin/*path" | "/admin/index.html" | "/index.html",
          "selfhost"
        )
        | ("GET", "/" | "/*path" | "/admin" | "/admin/*path", "standard")
        | ("USE", "/" | "/admin", "selfhost" | "standard")
        | ("USE", "/" | "/api/copilot/chat/:sessionId/attachments/:key", "all")
        | ("USE", "/api/docs", "development")
    );
    assert!(valid, "unaccounted oracle mount: {method} {path} (flavor={flavor})");
    accounted_mounts += 1;
  }
  assert_eq!(accounted_mounts, 26);

  let _ = std::fs::remove_dir_all(&static_dir);
}

#[tokio::test]
async fn build_schema_exposes_exact_query_and_mutation_counts() {
  let (_lease_guard, db_url) = lease_fresh_db().await;
  let db = connect_ready_db(&db_url).await;
  let state = AppState::new(
    db,
    None,
    RuntimeConfig::default(),
    Arc::new(CommunityExtension::default()),
  );
  let schema = build_schema(state);
  let sdl = export_valid_sdl(&schema);
  let doc = parse_schema(&sdl).expect("parse build_schema sdl");
  let map = canonicalize_document(&doc);
  assert_eq!(map.len(), 342);

  // Real GraphQL Introspection check: Copilot.transcriptTask.deprecationReason matches v0.27.5 byte-for-byte.
  let intro = schema
    .execute(r#"{ __type(name: "Copilot") { fields(includeDeprecated: true) { name deprecationReason } } }"#)
    .await;
  assert!(intro.errors.is_empty(), "introspection errors: {:?}", intro.errors);
  let intro_json = serde_json::to_value(&intro.data).expect("serialize introspection data");
  let fields = intro_json["__type"]["fields"].as_array().expect("Copilot fields");
  let reason = fields
    .iter()
    .find(|f| f["name"].as_str() == Some("transcriptTask"))
    .and_then(|f| f["deprecationReason"].as_str());
  assert_eq!(
    reason,
    Some("Use realtime subscription \"copilot.transcript.task.changed\" instead.")
  );
}
