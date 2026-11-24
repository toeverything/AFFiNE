use axum::{
    Router,
    body::Bytes,
    extract::{
        Multipart, Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use parity_harness::{
    model::Scenario,
    sinks::{CHANNELS, RedisSink, SmtpSink},
};
use serde_json::{Value, json};
use std::{collections::BTreeSet, sync::Arc};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
    sync::{Mutex, broadcast},
    task::JoinHandle,
};

#[derive(Clone, Copy, Debug, PartialEq)]
enum Fault {
    None,
    Status,
    GraphqlCode,
    SplitId,
    MergeId,
    CookieHttpOnly,
    CookieSameSite,
    MissingRow,
    RowValue,
    MissingMail,
    MailBody,
    MissingInvalidation,
}
#[derive(Clone)]
struct Fixture {
    side: String,
    fault: Fault,
    smtp: String,
    redis: String,
    rows: Arc<Mutex<Vec<Value>>>,
}
impl Fixture {
    fn workspace(&self) -> String {
        format!("{}-workspace-123456789", self.side)
    }
    fn document(&self) -> String {
        format!("{}-document-123456789", self.side)
    }
    fn token(&self) -> String {
        format!("{}-signed-session-token", self.side)
    }
}
struct Service {
    rows: Option<Arc<Mutex<Vec<Value>>>>,
    url: String,
    task: JoinHandle<()>,
}
impl Drop for Service {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn service(router: Router) -> Service {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    Service {
        rows: None,
        url: format!("http://{address}"),
        task,
    }
}
async fn login(State(f): State<Fixture>) -> Response {
    let mut attributes = String::new();
    if f.fault != Fault::CookieHttpOnly {
        attributes.push_str("; HttpOnly");
    }
    if f.fault != Fault::CookieSameSite {
        attributes.push_str("; SameSite=Lax");
    }
    let cookie = format!("session={}; Path=/{}", f.token(), attributes);
    let status = if f.fault == Fault::Status {
        StatusCode::ACCEPTED
    } else {
        StatusCode::OK
    };
    (
        status,
        [("set-cookie", cookie)],
        axum::Json(json!({"accessToken":f.token()})),
    )
        .into_response()
}
async fn graphql(
    State(f): State<Fixture>,
    headers: HeaderMap,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    assert!(headers["cookie"].to_str().unwrap().contains(&f.token()));
    assert_eq!(body["variables"]["name"], "Workspace");
    let code = if f.fault == Fault::GraphqlCode {
        "WRONG"
    } else {
        "EXPECTED"
    };
    axum::Json(json!({"data":{"workspace":{"id":f.workspace(),"timestamp":if f.side=="left"{1000}else{2000}}},"errors":[{"message":"known","extensions":{"code":code,"status":400}}]})).into_response()
}
async fn document(
    State(f): State<Fixture>,
    Path(workspace): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    assert_eq!(workspace, f.workspace());
    assert_eq!(headers["x-signature"], "exact-signature");
    assert_eq!(body.as_ref(), b"raw\0body");
    let doc = f.document();
    let workspace = f.workspace();
    let row = json!({"id":doc,"workspaceId":workspace,"title":"Doc"});
    if f.fault != Fault::MissingRow {
        let mut row = row;
        if f.fault == Fault::RowValue {
            row["title"] = json!("Bad");
        }
        f.rows.lock().await.push(row);
    }
    let echo = if f.fault == Fault::SplitId {
        format!("{workspace}-wrong")
    } else {
        workspace.clone()
    };
    let doc = if f.fault == Fault::MergeId {
        workspace.clone()
    } else {
        doc
    };
    axum::Json(json!({"id":doc,"workspaceId":echo})).into_response()
}
async fn upload(mut multipart: Multipart) -> Response {
    let field = multipart.next_field().await.unwrap().unwrap();
    assert_eq!(field.name(), Some("file"));
    assert_eq!(field.file_name(), Some("doc.bin"));
    assert_eq!(field.bytes().await.unwrap().as_ref(), b"file-data");
    axum::Json(json!({"ok":true})).into_response()
}
async fn effects(State(f): State<Fixture>) -> Response {
    if f.fault != Fault::MissingMail {
        let suffix = if f.fault == Fault::MailBody { "!" } else { "" };
        send_mail(
            &f.smtp,
            &format!("<p>Workspace {}{suffix}</p>", f.workspace()),
        )
        .await;
    }
    let client = redis::Client::open(f.redis.clone()).unwrap();
    let mut conn = client.get_multiplexed_async_connection().await.unwrap();
    for channel in CHANNELS {
        if channel == CHANNELS[0] && f.fault == Fault::MissingInvalidation {
            continue;
        }
        let payload = if channel == CHANNELS[0] {
            json!({"v":1,"workspaceId":f.workspace(),"docId":f.document(),"kind":"InvalidationHintV1"})
        } else {
            json!({"v":1,"id":format!("eb_{}",f.side),"originId":format!("origin_{}",f.side),"event":"sync.doc.updates.pushed","payload":{"workspaceId":f.workspace(),"bytes":{"$b64":"AAEC"}}})
        };
        let _: i64 = redis::cmd("PUBLISH")
            .arg(channel)
            .arg(payload.to_string())
            .query_async(&mut conn)
            .await
            .unwrap();
    }
    axum::Json(json!({"ok":true})).into_response()
}
async fn sse(State(f): State<Fixture>) -> Response {
    ([ ("content-type","text/event-stream") ],format!(":comment\r\n\r\nevent: doc\r\ndata: {{\"workspaceId\":\"{}\"}}\r\n\r\nevent: done\r\ndata: {{\"ok\":true}}\r\n\r\n",f.workspace())).into_response()
}
async fn ws(upgrade: WebSocketUpgrade) -> Response {
    upgrade.on_upgrade(echo)
}
async fn echo(mut socket: WebSocket) {
    while let Some(Ok(message)) = socket.recv().await {
        if matches!(message, Message::Close(_)) {
            break;
        }
        socket.send(message).await.unwrap();
    }
}
async fn send_mail(address: &str, html: &str) {
    let stream = TcpStream::connect(address).await.unwrap();
    let (read, mut write) = stream.into_split();
    let mut read = BufReader::new(read);
    let mut line = String::new();
    read.read_line(&mut line).await.unwrap();
    for command in [
        "HELO fixture\r\n".to_string(),
        "MAIL FROM:<sender@example.test>\r\n".into(),
        "RCPT TO:<user@example.test>\r\n".into(),
        "DATA\r\n".into(),
        format!(
            "Subject: Workspace created\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{html}\r\n.\r\n"
        ),
        "QUIT\r\n".into(),
    ] {
        write.write_all(command.as_bytes()).await.unwrap();
        line.clear();
        read.read_line(&mut line).await.unwrap();
        assert!(!line.starts_with('5'), "{line}");
    }
}

// Tiny RESP2 reference broker, deliberately independent of the production sink.
// It exercises real subscription acknowledgements, channels and TCP delivery.
async fn redis_command(
    read: &mut BufReader<tokio::net::tcp::OwnedReadHalf>,
) -> Option<Vec<String>> {
    let mut line = String::new();
    if read.read_line(&mut line).await.ok()? == 0 {
        return None;
    }
    let count: usize = line.trim().strip_prefix('*')?.parse().ok()?;
    let mut args = Vec::new();
    for _ in 0..count {
        line.clear();
        read.read_line(&mut line).await.ok()?;
        let size: usize = line.trim().strip_prefix('$')?.parse().ok()?;
        let mut bytes = vec![0; size + 2];
        read.read_exact(&mut bytes).await.ok()?;
        args.push(String::from_utf8(bytes[..size].to_vec()).ok()?);
    }
    Some(args)
}
fn redis_bulk(value: &str) -> String {
    format!("${}\r\n{value}\r\n", value.len())
}
async fn broker(delay_ms: u64, burst_after_fence: bool) -> Service {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (events, _) = broadcast::channel::<(String, String)>(100);
    let task = tokio::spawn(async move {
        let mut children = tokio::task::JoinSet::new();
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let events = events.clone();
            let mut rx = events.subscribe();
            children.spawn(async move {
                let (read,mut write)=stream.into_split();let mut read=BufReader::new(read);let mut subscribed=BTreeSet::new();
                loop {
                    tokio::select! {
                        command=redis_command(&mut read)=>{
                            let Some(args)=command else{return};let command=args[0].to_ascii_uppercase();
                            let response=match command.as_str(){
                                "SUBSCRIBE"=>{subscribed.insert(args[1].clone());format!("*3\r\n{}{}:{}\r\n",redis_bulk("subscribe"),redis_bulk(&args[1]),subscribed.len())},
                                "PUBLISH"=>{let _=events.send((args[1].clone(),args[2].clone()));":1\r\n".into()},
                                "PING"=>"+PONG\r\n".into(),_=>"+OK\r\n".into(),
                            };
                            if write.write_all(response.as_bytes()).await.is_err(){return;}
                        }
                        event=rx.recv()=>{
                            let Ok((channel,payload))=event else{return};
                            if subscribed.contains(&channel) {
                                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                                let mut response=format!("*3\r\n{}{}{}",redis_bulk("message"),redis_bulk(&channel),redis_bulk(&payload));
                                if burst_after_fence && channel.starts_with("parity-harness:drain:") {
                                    response.push_str(&format!("*3\r\n{}{}{}",redis_bulk("message"),redis_bulk(CHANNELS[0]),redis_bulk(r#"{"event":"after"}"#)));
                                }
                                if write.write_all(response.as_bytes()).await.is_err(){return;}
                            }
                        }
                    }
                }
            });
        }
    });
    Service {
        rows: None,
        url: format!("redis://{address}"),
        task,
    }
}
async fn fixture(side: &str, fault: Fault, redis: &str, smtp: &str) -> Service {
    let state = Fixture {
        side: side.into(),
        fault,
        redis: redis.into(),
        smtp: smtp.into(),
        rows: Arc::new(Mutex::new(Vec::new())),
    };
    let rows = state.rows.clone();
    let mut instance = service(
        Router::new()
            .route("/login", post(login))
            .route("/graphql", post(graphql))
            .route("/docs/{workspace}", put(document))
            .route("/upload", post(upload))
            .route("/effects", post(effects))
            .route("/events", get(sse))
            .route("/ws", get(ws))
            .with_state(state),
    )
    .await;
    instance.rows = Some(rows);
    instance
}
async fn replay(fault: Fault) -> parity_harness::model::Report {
    replay_with_delivery_delay(fault, 0).await
}
async fn replay_with_delivery_delay(fault: Fault, delay_ms: u64) -> parity_harness::model::Report {
    let lredis = broker(delay_ms, false).await;
    let rredis = broker(delay_ms, false).await;
    let lsmtp = SmtpSink::bind("127.0.0.1:0").await.unwrap();
    let rsmtp = SmtpSink::bind("127.0.0.1:0").await.unwrap();
    let lsmtp_addr = lsmtp.address.to_string();
    let rsmtp_addr = rsmtp.address.to_string();
    let left = fixture("left", Fault::None, &lredis.url, &lsmtp_addr).await;
    let right = fixture("right", fault, &rredis.url, &rsmtp_addr).await;
    let scenario:Scenario=serde_json::from_value(json!({
        "left_target":{"base_url":left.url,"redis":lredis.url,"smtp_bind":lsmtp_addr},
        "right_target":{"base_url":right.url,"redis":rredis.url,"smtp_bind":rsmtp_addr},
        "timeout_ms":3000,"table_keys":{"public.docs":["id"]},
        "dynamic":[{"path":"/(id|workspaceId|docId|originId)$","kind":"id"},{"path":"/timestamp$","kind":"ts"},{"path":"/accessToken$","kind":"token"}],
        "steps":[
            {"name":"login","kind":"http","method":"POST","path":"/login"},
            {"name":"create_workspace","kind":"graphql","query":"mutation Create($name: String!) { createWorkspace(name:$name) { id } }","variables":{"name":"Workspace"},"extract":{"workspace":"/body/value/data/workspace/id"}},
            {"name":"write_document","kind":"http","method":"PUT","path":"/docs/{{workspace}}","raw_base64":"cmF3AGJvZHk=","headers":{"x-signature":"exact-signature"}},
            {"name":"multipart","kind":"http","method":"POST","path":"/upload","multipart":[{"name":"file","filename":"doc.bin","mime":"application/octet-stream","base64":"ZmlsZS1kYXRh"}]},
            {"name":"sse","kind":"sse","path":"/events","event_count":2},
            {"name":"websocket_frames","kind":"websocket","path":"/ws","frames":[{"action":"send_text","text":"hello"},{"action":"receive","count":1},{"action":"send_text","text":"{\"workspaceId\":\"{{workspace}}\"}"},{"action":"receive","count":1},{"action":"send_binary","base64":"AAECAw=="},{"action":"receive","count":1}]},
            {"name":"mail_and_invalidation","kind":"http","method":"POST","path":"/effects"}
        ]
    })).unwrap();
    let snapshots = FixtureSnapshots {
        left: left.rows.as_ref().unwrap().clone(),
        right: right.rows.as_ref().unwrap().clone(),
    };
    parity_harness::run_with_snapshots_and_smtp(&scenario, &snapshots, (Some(lsmtp), Some(rsmtp)))
        .await
        .unwrap()
}
#[tokio::test]
async fn zero_noise_network_replay_and_six_fault_categories_are_precisely_located() {
    let report = replay(Fault::None).await;
    assert!(
        report.is_equal(),
        "{}",
        serde_json::to_string_pretty(&report).unwrap()
    );
    assert_eq!(report.left["protocol"].as_array().unwrap().len(), 7);
    assert_eq!(
        report.left["database"]["public.docs"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(report.left["effects"]["smtp"].as_array().unwrap().len(), 1);
    assert_eq!(report.left["effects"]["redis"].as_array().unwrap().len(), 2);
    println!("zero-noise: 7 protocol steps + state table + SMTP + 2 Redis channels: 0 differences");
    for (fault, path) in [
        (Fault::Status, "/protocol/0/login/status"),
        (
            Fault::GraphqlCode,
            "/protocol/1/create_workspace/body/value/errors/0/extensions/code",
        ),
        (
            Fault::SplitId,
            "/protocol/2/write_document/body/value/workspaceId",
        ),
        (Fault::MergeId, "/protocol/2/write_document/body/value/id"),
        (
            Fault::CookieHttpOnly,
            "/protocol/0/login/headers/set-cookie/0/attributes/httponly",
        ),
        (
            Fault::CookieSameSite,
            "/protocol/0/login/headers/set-cookie/0/attributes/samesite",
        ),
        (Fault::MissingRow, "/database/public.docs"),
        (Fault::RowValue, "/database/public.docs/0/title"),
        (Fault::MissingMail, "/effects/smtp"),
        (Fault::MailBody, "/effects/smtp/0/html/0"),
        (Fault::MissingInvalidation, "/effects/redis"),
    ] {
        let report = replay(fault).await;
        assert!(
            report.differences.iter().any(|d| d.path == path),
            "{fault:?}: expected {path}: {}",
            serde_json::to_string_pretty(&report.differences).unwrap()
        );
        println!("fault {fault:?}: RED at {path}");
    }
}

#[tokio::test]
async fn variable_binding_preserves_json_types_and_rejects_missing_values() {
    use parity_harness::protocol::expand;
    let vars = [("n".into(), json!(42)), ("id".into(), json!("a\"b"))].into();
    assert_eq!(
        expand(&json!({"number":"{{n}}","path":"/x/{{id}}"}), &vars).unwrap(),
        json!({"number":42,"path":"/x/a\"b"})
    );
    assert!(expand(&json!("{{missing}}"), &vars).is_err());
    assert_eq!(expand(&json!("{{n}}}"), &vars).unwrap(), json!("42}"));
}

#[tokio::test]
async fn cli_writes_reports_and_distinguishes_equal_different_and_invalid_runs() {
    let left = fixture("left", Fault::None, "redis://unused", "unused").await;
    let right = fixture("right", Fault::Status, "redis://unused", "unused").await;
    let base = json!({
        "left_target":{"base_url":left.url},"right_target":{"base_url":left.url},
        "dynamic":[{"path":"/accessToken$","kind":"token"}],
        "steps":[{"name":"login","kind":"http","method":"POST","path":"/login"}]
    });
    let directory = std::env::temp_dir().join(format!(
        "parity-cli-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    tokio::fs::create_dir(&directory).await.unwrap();
    let input = directory.join("scenario.json");
    let output = directory.join("report.json");
    for (case, expected) in [(0, 0), (1, 1), (2, 2)] {
        let mut scenario = base.clone();
        if case == 1 {
            scenario["right_target"]["base_url"] = json!(right.url);
        }
        if case == 2 {
            scenario["steps"][0]["extract"] = json!({"missing":"/body/value/no_such_field"});
        }
        tokio::fs::write(&input, serde_json::to_vec(&scenario).unwrap())
            .await
            .unwrap();
        let result = tokio::process::Command::new(env!("CARGO_BIN_EXE_parity-harness"))
            .arg(&input)
            .arg(&output)
            .output()
            .await
            .unwrap();
        assert_eq!(
            result.status.code(),
            Some(expected),
            "case {case}: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        if expected != 2 {
            let report: Value =
                serde_json::from_slice(&tokio::fs::read(&output).await.unwrap()).unwrap();
            assert_eq!(
                report["differences"].as_array().unwrap().is_empty(),
                expected == 0
            );
        } else {
            assert!(String::from_utf8_lossy(&result.stderr).contains("missing pointer"));
        }
    }
    tokio::fs::remove_dir_all(directory).await.unwrap();
}

#[tokio::test]
async fn redis_drain_preserves_delayed_events_and_detects_missing_invalidation() {
    for fault in [Fault::None, Fault::MissingInvalidation] {
        let report = replay_with_delivery_delay(fault, 80).await;
        assert_eq!(report.left["effects"]["redis"].as_array().unwrap().len(), 2);
        assert_eq!(
            report.right["effects"]["redis"].as_array().unwrap().len(),
            if fault == Fault::None { 2 } else { 1 }
        );
        if fault == Fault::None {
            assert!(
                report.is_equal(),
                "{}",
                serde_json::to_string_pretty(&report).unwrap()
            );
        } else {
            assert!(
                report
                    .differences
                    .iter()
                    .any(|d| d.path == "/effects/redis")
            );
        }
    }
}

#[tokio::test]
async fn redis_snapshot_is_frozen_at_fence_with_later_events_in_the_same_read_buffer() {
    let broker = broker(0, true).await;
    let sink = RedisSink::subscribe(&broker.url).await.unwrap();
    let client = redis::Client::open(broker.url.clone()).unwrap();
    let mut publisher = client.get_multiplexed_async_connection().await.unwrap();
    let _: i64 = redis::cmd("PUBLISH")
        .arg(CHANNELS[0])
        .arg(r#"{"event":"before"}"#)
        .query_async(&mut publisher)
        .await
        .unwrap();
    let first = sink.snapshot().await.unwrap();
    assert_eq!(
        first,
        json!([{"channel":CHANNELS[0],"payload":{"encoding":"json","value":{"event":"before"}}}])
    );
    let second = sink.snapshot().await.unwrap();
    assert_eq!(
        second,
        json!([
            {"channel":CHANNELS[0],"payload":{"encoding":"json","value":{"event":"before"}}},
            {"channel":CHANNELS[0],"payload":{"encoding":"json","value":{"event":"after"}}}
        ])
    );
}

struct FixtureSnapshots {
    left: Arc<Mutex<Vec<Value>>>,
    right: Arc<Mutex<Vec<Value>>>,
}
impl parity_harness::SnapshotSource for FixtureSnapshots {
    async fn snapshots(
        &self,
        _left: &parity_harness::model::Target,
        _right: &parity_harness::model::Target,
        _ignore: &[String],
    ) -> anyhow::Result<(Value, Value)> {
        Ok((
            json!({"public.docs":self.left.lock().await.clone()}),
            json!({"public.docs":self.right.lock().await.clone()}),
        ))
    }
}

#[tokio::test]
async fn expected_smtp_count_prevents_equal_missing_mail_from_being_green() {
    let target = fixture("same", Fault::None, "unused", "unused").await;
    let lsmtp = SmtpSink::bind("127.0.0.1:0").await.unwrap();
    let rsmtp = SmtpSink::bind("127.0.0.1:0").await.unwrap();
    let scenario: Scenario = serde_json::from_value(json!({
        "left_target":{"base_url":target.url,"smtp_bind":lsmtp.address.to_string()},
        "right_target":{"base_url":target.url,"smtp_bind":rsmtp.address.to_string()},
        "timeout_ms":80,"expected_smtp_count":1,
        "steps":[{"name":"no_mail","kind":"http","method":"POST","path":"/login"}]
    }))
    .unwrap();
    let report = parity_harness::run_with_snapshots_and_smtp(
        &scenario,
        &parity_harness::PostgresSnapshots,
        (Some(lsmtp), Some(rsmtp)),
    )
    .await
    .unwrap();
    assert_eq!(report.differences.len(), 2);
    assert!(
        report
            .differences
            .iter()
            .all(|d| d.path.ends_with("/expected_count"))
    );
}

#[tokio::test]
async fn redis_json_string_and_invalid_json_are_different_captured_messages() {
    let broker = broker(0, false).await;
    let sink = RedisSink::subscribe(&broker.url).await.unwrap();
    let client = redis::Client::open(broker.url.clone()).unwrap();
    let mut publisher = client.get_multiplexed_async_connection().await.unwrap();
    for payload in [r#""ok""#, "ok"] {
        let _: i64 = redis::cmd("PUBLISH")
            .arg(CHANNELS[0])
            .arg(payload)
            .query_async(&mut publisher)
            .await
            .unwrap();
    }
    let captured = sink.snapshot().await.unwrap();
    assert_eq!(captured.as_array().unwrap().len(), 2);
    assert_eq!(
        captured[0]["payload"],
        json!({"encoding":"json","value":"ok"})
    );
    assert_eq!(
        captured[1]["payload"],
        json!({"encoding":"invalid_json","raw":"ok"})
    );
    let mut normalizer = parity_harness::normalize::Normalizer::new(&[]).unwrap();
    normalizer.compare("/redis", &captured[0], &captured[1]);
    assert!(
        normalizer
            .differences
            .iter()
            .any(|d| d.path == "/redis/payload/encoding")
    );
}
