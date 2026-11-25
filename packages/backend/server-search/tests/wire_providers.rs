//! Mock HTTP wire-protocol integration tests for ManticoreSearch and
//! Elasticsearch search providers (provisioning, indexing, querying,
//! aggregation, GC, asset drop, auth headers, and error mapping).

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use serde_json::{Value, json};
use server_search::provider::{SearchChange, SearchProvider, projection_external_id};
use server_search::{SearchConfig, SearchError, SearchTable};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

#[derive(Clone, Debug)]
struct CapturedRequest {
  method: String,
  path: String,
  headers: HashMap<String, String>,
  body: String,
}

#[derive(Clone, Debug)]
struct MockReply {
  status: u16,
  content_type: &'static str,
  body: String,
}

impl MockReply {
  fn json(status: u16, body: Value) -> Self {
    Self {
      status,
      content_type: "application/json",
      body: body.to_string(),
    }
  }
}

async fn read_http_request(socket: &mut tokio::net::TcpStream) -> Option<CapturedRequest> {
  let mut buf = Vec::new();
  let mut chunk = [0u8; 4096];
  let header_end;
  loop {
    let n = socket.read(&mut chunk).await.ok()?;
    if n == 0 {
      return None;
    }
    buf.extend_from_slice(&chunk[..n]);
    if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
      header_end = pos + 4;
      break;
    }
  }
  let head_str = String::from_utf8_lossy(&buf[..header_end]).into_owned();
  let mut lines = head_str.split("\r\n");
  let request_line = lines.next()?;
  let mut parts = request_line.split_whitespace();
  let method = parts.next()?.to_owned();
  let path = parts.next()?.to_owned();
  let mut headers = HashMap::new();
  for line in lines {
    if let Some((k, v)) = line.split_once(':') {
      headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_owned());
    }
  }
  let content_len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
  while buf.len() < header_end + content_len {
    let n = socket.read(&mut chunk).await.ok()?;
    if n == 0 {
      break;
    }
    buf.extend_from_slice(&chunk[..n]);
  }
  let body = String::from_utf8_lossy(&buf[header_end..(header_end + content_len).min(buf.len())]).into_owned();
  Some(CapturedRequest {
    method,
    path,
    headers,
    body,
  })
}

async fn spawn_mock_http<F>(
  handler: F,
) -> (
  SocketAddr,
  Arc<Mutex<Vec<CapturedRequest>>>,
  tokio::task::JoinHandle<()>,
)
where
  F: Fn(&CapturedRequest) -> MockReply + Send + Sync + 'static,
{
  let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind loopback");
  let addr = listener.local_addr().expect("local addr");
  let recorded = Arc::new(Mutex::new(Vec::new()));
  let rec_clone = Arc::clone(&recorded);
  let handler = Arc::new(handler);
  let handle = tokio::spawn(async move {
    loop {
      let Ok((mut socket, _)) = listener.accept().await else {
        break;
      };
      let rec = Arc::clone(&rec_clone);
      let handler = Arc::clone(&handler);
      tokio::spawn(async move {
        let Some(req) = read_http_request(&mut socket).await else {
          return;
        };
        let reply = handler(&req);
        rec.lock().await.push(req);
        let reason = match reply.status {
          200 => "OK",
          400 => "Bad Request",
          401 => "Unauthorized",
          404 => "Not Found",
          500 => "Internal Server Error",
          _ => "Status",
        };
        let resp = format!(
          "HTTP/1.1 {} {reason}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          reply.status,
          reply.content_type,
          reply.body.len(),
          reply.body
        );
        let _ = socket.write_all(resp.as_bytes()).await;
        let _ = socket.shutdown().await;
      });
    }
  });
  (addr, recorded, handle)
}

fn sample_doc_change(gen_id: &str, ws_id: &str, doc_id: &str) -> SearchChange {
  let external_id = projection_external_id(SearchTable::Doc, gen_id, ws_id, doc_id, None, 10, 2).unwrap();
  SearchChange {
    table: SearchTable::Doc,
    external_id,
    workspace_id: ws_id.to_owned(),
    doc_id: doc_id.to_owned(),
    source_version: 10,
    permission_version: 2,
    payload: json!({
      "generation_id": gen_id,
      "workspace_id": ws_id,
      "doc_id": doc_id,
      "source_version": 10,
      "permission_version": 2,
      "title": "Search Wire Spec",
      "acl_public_readable": true,
      "acl_member_default_readable": true,
      "acl_read_tokens": ["u1", "u2"],
    }),
  }
}

#[tokio::test]
async fn manticore_provider_wire_protocol_provision_apply_search_gc_and_errors() {
  let (addr, recorded, server) = spawn_mock_http(|req| match (req.method.as_str(), req.path.as_str()) {
    ("POST", "/sql?mode=raw") => {
      if req.body.contains("bad_table") {
        MockReply::json(400, json!({"error": "syntax error"}))
      } else {
        MockReply::json(200, json!({"total": 0}))
      }
    }
    ("POST", "/bulk") => {
      if req.body.contains("fail_doc") {
        MockReply::json(
          200,
          json!({"errors": true, "items": [{"replace": {"status": 500, "error": "disk full"}}]}),
        )
      } else {
        MockReply::json(
          200,
          json!({"errors": false, "items": [{"replace": {"status": 200, "created": 1}}]}),
        )
      }
    }
    ("POST", "/search") => {
      let body: Value = serde_json::from_str(&req.body).unwrap_or_default();
      if body.get("table").and_then(Value::as_str) == Some("bad_query") {
        return MockReply::json(400, json!({"error": "bad query"}));
      }
      if body.get("sort").is_some() {
        return MockReply::json(200, json!({"hits": {"total": 2, "hits": [{"_id": 101}, {"_id": 202}]}}));
      }
      MockReply::json(
        200,
        json!({
          "hits": {
            "total": 2,
            "hits": [{
              "_id": 101,
              "_score": 3.5,
              "_source": {
                "external_id": "g1/ws1/doc1/10/2",
                "doc_id": "doc1",
                "title": "Search Wire Spec",
                "source_version": 10,
                "permission_version": 2
              },
              "highlight": {"title": ["<b>Search</b> Wire Spec"]}
            }]
          }
        }),
      )
    }
    ("POST", "/delete") => MockReply::json(200, json!({"deleted": 2})),
    _ => MockReply::json(404, json!({"error": "not found"})),
  })
  .await;

  let provider = SearchProvider::new(&SearchConfig {
    enabled: true,
    provider: "manticoresearch".into(),
    endpoint: format!("http://{addr}"),
    api_key: "mc-secret-key".into(),
    ..SearchConfig::default()
  })
  .expect("construct manticore provider");

  // 1. Provision table and verify CREATE TABLE SQL + ApiKey header.
  provider.provision("affine_doc_g1", SearchTable::Doc).await.unwrap();
  assert!(matches!(
    provider.provision("bad_table", SearchTable::Doc).await,
    Err(SearchError::InvalidState(_))
  ));

  // 2. Bulk apply NDJSON replace payload.
  let change = sample_doc_change("g1", "ws1", "doc1");
  provider.apply("affine_doc_g1", &[change]).await.unwrap();

  let fail_change = sample_doc_change("g1", "ws1", "fail_doc");
  assert!(matches!(
    provider.apply("affine_doc_g1", &[fail_change]).await,
    Err(SearchError::ProviderUnavailable)
  ));

  // 3. Search translation + response normalization + nextCursor.
  let search_res = provider
    .search(
      "affine_doc_g1",
      json!({
        "query": {"term": {"workspace_id": {"value": "ws1"}}},
        "size": 1
      }),
    )
    .await
    .unwrap();
  assert_eq!(search_res["total"], json!(2));
  assert_eq!(search_res["nodes"][0]["id"], json!("g1/ws1/doc1/10/2"));
  assert_eq!(search_res["nextCursor"], json!("{\"offset\":1}"));

  // 4. Unsupported aggregate & 400 query error mapping.
  assert!(matches!(
    provider.aggregate("affine_doc_g1", json!({})).await,
    Err(SearchError::UnsupportedQuery)
  ));
  assert!(matches!(
    provider.search("bad_query", json!({"query": {"match_all": {}}})).await,
    Err(SearchError::UnsupportedQuery)
  ));

  // 5. GC history & workspace + drop table.
  provider
    .gc_document_history("affine_doc_g1", "ws1", "doc1", 10, 2, 10)
    .await
    .unwrap();
  let has_more = provider.gc_workspace("affine_doc_g1", "ws1", 10, 2).await.unwrap();
  assert!(has_more);
  provider.drop_generation_asset("affine_doc_g1").await.unwrap();

  // Verify wire auth header and NDJSON content-type were sent.
  let reqs = recorded.lock().await;
  assert!(
    reqs
      .iter()
      .all(|r| r.headers.get("authorization").map(String::as_str) == Some("ApiKey mc-secret-key"))
  );
  assert!(
    reqs
      .iter()
      .any(|r| r.path == "/bulk" && r.headers.get("content-type").map(String::as_str) == Some("application/x-ndjson"))
  );
  assert!(
    reqs
      .iter()
      .any(|r| r.path == "/sql?mode=raw" && r.body.starts_with("DROP TABLE IF EXISTS affine_doc_g1"))
  );

  server.abort();
}

#[tokio::test]
async fn elasticsearch_provider_wire_protocol_provision_apply_search_aggregate_gc_and_errors() {
  let (addr, recorded, server) = spawn_mock_http(|req| match (req.method.as_str(), req.path.as_str()) {
    ("HEAD", "/affine_doc_g1") => MockReply::json(404, json!({})),
    ("PUT", "/affine_doc_g1") => MockReply::json(200, json!({"acknowledged": true})),
    ("HEAD", "/bad_auth_idx") => MockReply::json(401, json!({"error": "unauthorized"})),
    ("DELETE", "/affine_doc_g1") => MockReply::json(200, json!({"acknowledged": true})),
    ("POST", "/_bulk?refresh=wait_for") => {
      if req.body.contains("reject_doc") {
        MockReply::json(
          200,
          json!({"errors": true, "items": [{"index": {"status": 400, "error": {"type": "mapper_parsing_exception"}}}]}),
        )
      } else {
        MockReply::json(200, json!({"errors": false, "items": [{"index": {"status": 201}}]}))
      }
    }
    ("POST", "/affine_doc_g1/_search") => {
      let body: Value = serde_json::from_str(&req.body).unwrap_or_default();
      if body.get("aggs").is_some() {
        return MockReply::json(
          200,
          json!({
            "aggregations": {
              "result": {
                "buckets": [
                  {
                    "key": "doc1",
                    "doc_count": 3,
                    "result": {
                      "hits": {
                        "hits": [{
                          "_id": "g1/ws1/doc1/10/2",
                          "_score": 2.0,
                          "_source": {"doc_id": "doc1", "source_version": 10, "permission_version": 2}
                        }]
                      }
                    }
                  },
                  {
                    "key": "doc2",
                    "doc_count": 1,
                    "result": {
                      "hits": {
                        "hits": [{
                          "_id": "g1/ws1/doc2/11/2",
                          "_score": 1.0,
                          "_source": {"doc_id": "doc2", "source_version": 11, "permission_version": 2}
                        }]
                      }
                    }
                  }
                ]
              }
            }
          }),
        );
      }
      MockReply::json(
        200,
        json!({
          "hits": {
            "total": {"value": 1, "relation": "eq"},
            "hits": [{
              "_id": "g1/ws1/doc1/10/2",
              "_score": 4.2,
              "sort": [4.2, "g1/ws1/doc1/10/2"],
              "_source": {"doc_id": "doc1", "source_version": 10, "permission_version": 2},
              "fields": {"title": ["Search Wire Spec"]},
              "highlight": {"title": ["<em>Search</em>"]}
            }]
          }
        }),
      )
    }
    ("POST", "/bad_idx/_search") => MockReply::json(400, json!({"error": "query_shard_exception"})),
    ("POST", "/affine_doc_g1/_delete_by_query?conflicts=proceed&refresh=true") => {
      MockReply::json(200, json!({"deleted": 2, "timed_out": false, "failures": []}))
    }
    _ => MockReply::json(404, json!({})),
  })
  .await;

  let provider = SearchProvider::new(&SearchConfig {
    enabled: true,
    provider: "elasticsearch".into(),
    endpoint: format!("http://{addr}"),
    username: "elastic".into(),
    password: "changeme".into(),
    ..SearchConfig::default()
  })
  .expect("construct elasticsearch provider");

  // 1. Provision (HEAD 404 -> PUT mapping) and 401 auth error mapping.
  provider.provision("affine_doc_g1", SearchTable::Doc).await.unwrap();
  assert!(matches!(
    provider.provision("bad_auth_idx", SearchTable::Doc).await,
    Err(SearchError::Config(_))
  ));

  // 2. Bulk apply & 400 item rejection.
  let change = sample_doc_change("g1", "ws1", "doc1");
  provider.apply("affine_doc_g1", &[change]).await.unwrap();
  let bad_change = sample_doc_change("g1", "ws1", "reject_doc");
  assert!(matches!(
    provider.apply("affine_doc_g1", &[bad_change]).await,
    Err(SearchError::GenerationInvalid(_))
  ));

  // 3. Search with cursor -> search_after and track_total_hits injection.
  let search_res = provider
    .search(
      "affine_doc_g1",
      json!({
        "query": {"term": {"workspace_id": "ws1"}},
        "cursor": "[1.0,\"prev\"]"
      }),
    )
    .await
    .unwrap();
  assert_eq!(search_res["total"], json!(1));
  assert_eq!(search_res["nodes"][0]["id"], json!("g1/ws1/doc1/10/2"));
  assert!(search_res["nextCursor"].as_str().unwrap().contains("g1/ws1/doc1/10/2"));

  // 4. Aggregate normalization & hasMore pagination.
  let agg_res = provider
    .aggregate(
      "affine_doc_g1",
      json!({
        "from": 0,
        "aggs": {
          "result": {
            "terms": {"field": "doc_id", "size": 1},
            "aggs": {"result": {"top_hits": {"size": 1}}}
          }
        }
      }),
    )
    .await
    .unwrap();
  assert_eq!(agg_res["total"], json!(2));
  assert_eq!(agg_res["hasMore"], json!(true));
  assert_eq!(agg_res["buckets"].as_array().unwrap().len(), 1);

  // 5. 400 search -> UnsupportedQuery, GC, and index drop.
  assert!(matches!(
    provider.search("bad_idx", json!({})).await,
    Err(SearchError::UnsupportedQuery)
  ));
  provider
    .gc_document_history("affine_doc_g1", "ws1", "doc1", 10, 2, 10)
    .await
    .unwrap();
  assert!(provider.gc_workspace("affine_doc_g1", "ws1", 10, 2).await.unwrap());
  provider.drop_generation_asset("affine_doc_g1").await.unwrap();

  // Verify Basic auth header and `search_after` / `track_total_hits` on wire.
  let reqs = recorded.lock().await;
  assert!(
    reqs
      .iter()
      .all(|r| r.headers.get("authorization").is_some_and(|v| v.starts_with("Basic ")))
  );
  assert!(reqs.iter().any(|r| {
    r.path == "/affine_doc_g1/_search"
      && r.body.contains("\"track_total_hits\":true")
      && r.body.contains("\"search_after\"")
  }));

  server.abort();
}
