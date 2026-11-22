use parity_harness::model::Scenario;
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::{Child, Command},
};
struct Reference {
    url: String,
    _child: Child,
}
async fn reference() -> Reference {
    reference_with_auth_message("AuthenticationRequired").await
}
async fn reference_with_auth_message(message: &str) -> Reference {
    let script =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("scripts/socketio-reference.mjs");
    let mut child = Command::new("node")
        .arg(script)
        .env("PARITY_REFERENCE_AUTH_MESSAGE", message)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .await
        .unwrap();
    let ready: Value = serde_json::from_str(&line).expect("real Socket.IO reference startup");
    Reference {
        url: ready["url"].as_str().unwrap().to_owned(),
        _child: child,
    }
}
#[tokio::test]
async fn real_socketio_handles_upgrade_heartbeats_cookie_headers_ack_and_binary_attachments() {
    let left = reference().await;
    let right = reference().await;
    for transports in [json!(["polling", "websocket"]), json!(["polling"])] {
        let mut actions = vec![json!({"action":"wait_event","event":"ready","count":1})];
        if transports.as_array().unwrap().len() == 2 {
            actions.push(json!({"action":"wait_upgrade"}));
        }
        actions.extend([
            json!({"action":"emit_with_ack","event":"echo","args":[{"bytes":{"$b64":"AAEC/w=="},"text":"hello"}]}),
            json!({"action":"emit_with_ack","event":"delayed","args":["heartbeat-survived"]}),
            json!({"action":"wait_event","event":"binary-push","count":1})
        ]);
        let scenario:Scenario=serde_json::from_value(json!({
            "left_target":{"base_url":left.url},"right_target":{"base_url":right.url},"timeout_ms":5000,
            "steps":[{"name":"login","kind":"http","method":"POST","path":"/login"},
                {"name":"socketio","kind":"socketio","transports":transports,"headers":{"x-parity":"checked"},"actions":actions}]
        })).unwrap();
        let report = parity_harness::run(&scenario).await.unwrap();
        assert!(
            report.is_equal(),
            "{}",
            serde_json::to_string_pretty(&report).unwrap()
        );
        let result = &report.left["protocol"][1]["body"]["value"];
        assert_eq!(result["initial_transport"], "polling");
        assert_eq!(
            result["transport"],
            if transports.as_array().unwrap().len() == 2 {
                "websocket"
            } else {
                "polling"
            }
        );
        assert_eq!(result["acks"][0]["value"]["bytes"]["$b64"], "AwT/");
        assert_eq!(
            result["acks"][0]["value"]["payload"]["bytes"]["$b64"],
            "AAEC/w=="
        );
        assert_eq!(
            result["acks"][1]["value"],
            json!({"payload":"heartbeat-survived","alive":true})
        );
        assert_eq!(result["events"].as_array().unwrap().len(), 2);
        assert_eq!(
            result["events"][0]["args"][0],
            json!({"cookie":"sid=reference-session","header":"checked"})
        );
        assert_eq!(result["events"][1]["args"][0]["bytes"]["$b64"], "AAEC/w==");
    }
}

#[tokio::test]
async fn socketio_authentication_rejections_are_protocol_results_and_are_compared() {
    let left = reference().await;
    let right = reference().await;
    let changed = reference_with_auth_message("DifferentAuthenticationError").await;
    for (target, equal) in [(&right, true), (&changed, false)] {
        let scenario:Scenario=serde_json::from_value(json!({
            "left_target":{"base_url":left.url},"right_target":{"base_url":target.url},"timeout_ms":3000,
            "steps":[{"name":"reject","kind":"socketio","auth":{"reject":true},"actions":[]}]
        })).unwrap();
        let report = parity_harness::run(&scenario).await.unwrap();
        assert_eq!(report.is_equal(), equal);
        assert_eq!(
            report.left["protocol"][0]["body"]["value"],
            json!({"connected":false,"connect_error":{"message":"AuthenticationRequired","data":{"code":"AUTHENTICATION_REQUIRED","status":401}}})
        );
        if !equal {
            assert!(
                report
                    .differences
                    .iter()
                    .any(|d| d.path == "/protocol/0/reject/body/value/connect_error/message")
            );
        }
    }
}
#[tokio::test]
async fn socketio_connection_refusal_remains_an_infrastructure_error() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let url = format!("http://{address}");
    let scenario: Scenario = serde_json::from_value(json!({
        "left_target":{"base_url":url},"right_target":{"base_url":url},"timeout_ms":2000,
        "steps":[{"name":"unreachable","kind":"socketio","actions":[]}]
    }))
    .unwrap();
    assert!(parity_harness::run(&scenario).await.is_err());
}
