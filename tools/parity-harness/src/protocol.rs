use crate::model::{Frame, Request, Scenario, Step, Target};
use anyhow::{Context, Result, bail, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt};
use reqwest::{
    Client,
    cookie::{CookieStore, Jar},
    header::HeaderMap,
};
use serde_json::{Value, json};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message, client::IntoClientRequest},
};

pub struct Session {
    pub target: Target,
    client: Client,
    jar: Arc<Jar>,
    variables: BTreeMap<String, Value>,
    headers: Vec<String>,
    timeout_ms: u64,
}
impl Session {
    pub fn new(target: &Target, scenario: &Scenario) -> Result<Self> {
        let jar = Arc::new(Jar::default());
        Ok(Self {
            target: target.clone(),
            client: Client::builder()
                .cookie_provider(jar.clone())
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_millis(scenario.timeout_ms))
                .build()?,
            jar,
            variables: BTreeMap::new(),
            headers: scenario.compare_headers.clone(),
            timeout_ms: scenario.timeout_ms,
        })
    }
    pub async fn run(&mut self, step: &Step) -> Result<Value> {
        let expanded = expand(&serde_json::to_value(&step.request)?, &self.variables)?;
        let request: Request = serde_json::from_value(expanded)?;
        let response = self
            .request(request)
            .await
            .with_context(|| format!("step {} at {}", step.name, self.target.base_url))?;
        for (variable, pointer) in &step.extract {
            let value = response.pointer(pointer).with_context(|| {
                format!(
                    "extract {variable}: missing pointer {pointer} in {}",
                    step.name
                )
            })?;
            self.variables.insert(variable.clone(), value.clone());
        }
        Ok(response)
    }
    fn url(&self, path: &str) -> String {
        format!("{}{}", self.target.base_url.trim_end_matches('/'), path)
    }
    async fn request(&self, request: Request) -> Result<Value> {
        match request {
            Request::Graphql {
                query,
                variables,
                path,
                headers,
            } => {
                self.http(
                    "POST".into(),
                    path,
                    headers,
                    Some(json!({"query":query,"variables":variables})),
                    None,
                    vec![],
                )
                .await
            }
            Request::Http {
                method,
                path,
                headers,
                body,
                raw_base64,
                multipart,
            } => {
                self.http(method, path, headers, body, raw_base64, multipart)
                    .await
            }
            Request::Sse {
                path,
                headers,
                event_count,
            } => {
                ensure!(event_count > 0, "SSE event_count must be positive");
                let mut req = self.client.get(self.url(&path));
                for (k, v) in headers {
                    req = req.header(k, v);
                }
                let response = req.send().await?;
                let status = response.status().as_u16();
                let headers = header_value(response.headers(), &self.headers)?;
                let mut stream = response.bytes_stream();
                let mut buffer = Vec::new();
                let mut events = Vec::new();
                'read: while let Some(chunk) = stream.next().await {
                    buffer.extend_from_slice(&chunk?);
                    ensure!(buffer.len() <= 10 * 1024 * 1024, "SSE buffer exceeds 10MiB");
                    while let Some((end, delimiter)) = boundary(&buffer) {
                        let event = String::from_utf8(buffer[..end].to_vec())?;
                        buffer.drain(..end + delimiter);
                        if let Some(event) = sse_event(&event) {
                            events.push(event);
                        }
                        if events.len() == event_count {
                            break 'read;
                        }
                    }
                }
                ensure!(
                    events.len() == event_count,
                    "SSE ended after {} of {event_count} events",
                    events.len()
                );
                Ok(json!({"status":status,"headers":headers,"body":events}))
            }
            Request::Socketio {
                path,
                namespace,
                mut headers,
                transports,
                auth,
                actions,
                record_events,
            } => {
                let cookie_url = self.url(&path).parse()?;
                if let Some(cookies) = self.jar.cookies(&cookie_url) {
                    headers.insert("Cookie".into(), cookies.to_str()?.to_owned());
                }
                let input = json!({"url":self.target.base_url,"path":path,"namespace":namespace,"headers":headers,"transports":transports,"auth":auth,"actions":actions,"record_events":record_events,"timeout_ms":self.timeout_ms});
                let driver = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("scripts/socketio-driver.mjs");
                let mut child = tokio::process::Command::new("node")
                    .arg(driver)
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .kill_on_drop(true)
                    .spawn()
                    .context("start socket.io-client bridge")?;
                use tokio::io::AsyncWriteExt;
                child
                    .stdin
                    .take()
                    .context("Socket.IO bridge stdin")?
                    .write_all(format!("{input}\n").as_bytes())
                    .await?;
                let output = child.wait_with_output().await?;
                let reply: Value = serde_json::from_slice(&output.stdout).with_context(|| {
                    format!(
                        "Socket.IO bridge output: {}",
                        String::from_utf8_lossy(&output.stderr)
                    )
                })?;
                ensure!(
                    output.status.success(),
                    "Socket.IO driver failed: {}",
                    reply.get("error").unwrap_or(&Value::Null)
                );
                Ok(json!({"body":{"encoding":"socketio","value":reply["result"]}}))
            }
            Request::Websocket {
                path,
                headers,
                frames,
            } => {
                let url = self
                    .url(&path)
                    .replacen("https://", "wss://", 1)
                    .replacen("http://", "ws://", 1);
                let mut request = url.clone().into_client_request()?;
                for (k, v) in headers {
                    request.headers_mut().insert(
                        k.parse::<tokio_tungstenite::tungstenite::http::HeaderName>()?,
                        v.parse()?,
                    );
                }
                let http_url = self.url(&path).parse()?;
                if let Some(cookies) = self.jar.cookies(&http_url) {
                    request
                        .headers_mut()
                        .insert("cookie", cookies.to_str()?.parse()?);
                }
                let (mut socket, handshake) = connect_async(request).await?;
                let mut received = Vec::new();
                for frame in frames {
                    match frame {
                        Frame::SendText { text } => socket.send(Message::Text(text.into())).await?,
                        Frame::SendJson { value } => {
                            socket.send(Message::Text(value.to_string().into())).await?
                        }
                        Frame::SendBinary { base64 } => {
                            socket
                                .send(Message::Binary(STANDARD.decode(base64)?.into()))
                                .await?
                        }
                        Frame::Receive { count } => {
                            ensure!(count <= 4096, "too many WS frames requested");
                            let goal = received.len() + count;
                            while received.len() < goal {
                                match socket
                                    .next()
                                    .await
                                    .context("WS closed before expected frame")??
                                {
                                    Message::Text(t) => {
                                        received.push(json!({"text":t.to_string()}))
                                    }
                                    Message::Binary(b) => {
                                        received.push(json!({"binary":STANDARD.encode(b)}))
                                    }
                                    Message::Ping(p) => socket.send(Message::Pong(p)).await?,
                                    Message::Pong(_) => {}
                                    Message::Close(c) => {
                                        bail!("WS closed before expected frame: {c:?}")
                                    }
                                    Message::Frame(_) => {}
                                }
                            }
                        }
                    }
                }
                socket.close(None).await?;
                let selected = header_value(handshake.headers(), &self.headers)?;
                Ok(json!({"status":handshake.status().as_u16(),"headers":selected,"body":received}))
            }
        }
    }
    async fn http(
        &self,
        method: String,
        path: String,
        headers: BTreeMap<String, String>,
        body: Option<Value>,
        raw: Option<String>,
        parts: Vec<crate::model::Part>,
    ) -> Result<Value> {
        ensure!(
            usize::from(body.is_some())
                + usize::from(raw.is_some())
                + usize::from(!parts.is_empty())
                <= 1,
            "choose one HTTP body encoding"
        );
        let mut request = self.client.request(method.parse()?, self.url(&path));
        for (k, v) in headers {
            request = request.header(k, v);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        if let Some(raw) = raw {
            request = request.body(STANDARD.decode(raw)?);
        }
        if !parts.is_empty() {
            let mut form = reqwest::multipart::Form::new();
            for part in parts {
                let bytes = match (part.base64, part.text) {
                    (Some(b64), None) => STANDARD.decode(b64)?,
                    (None, Some(txt)) => txt.into_bytes(),
                    _ => bail!(
                        "multipart part `{}` must specify exactly one of base64 or text",
                        part.name
                    ),
                };
                let mut data = reqwest::multipart::Part::bytes(bytes);
                if let Some(filename) = part.filename {
                    data = data.file_name(filename);
                }
                if let Some(mime) = part.mime {
                    data = data.mime_str(&mime)?;
                }
                form = form.part(part.name, data);
            }
            request = request.multipart(form);
        }
        let response = request.send().await?;
        let status = response.status().as_u16();
        let headers = header_value(response.headers(), &self.headers)?;
        let response_content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_owned();
        let bytes = response.bytes().await?;
        let content_type = response_content_type;
        let body = decode_body(&content_type, &bytes);
        Ok(json!({"status":status,"headers":headers,"body":body}))
    }
}
fn boundary(bytes: &[u8]) -> Option<(usize, usize)> {
    let lf = bytes.windows(2).position(|w| w == b"\n\n").map(|i| (i, 2));
    let crlf = bytes
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| (i, 4));
    lf.into_iter().chain(crlf).min_by_key(|(i, _)| *i)
}
fn sse_event(block: &str) -> Option<Value> {
    let mut fields = BTreeMap::new();
    let mut data = Vec::new();
    for line in block.lines().filter(|l| !l.starts_with(':')) {
        let (key, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        if key == "data" {
            data.push(value);
        } else if !key.is_empty() {
            fields.insert(key.to_owned(), json!(value));
        }
    }
    if data.is_empty() {
        return None;
    }
    let data = data.join("\n");
    fields.insert("data".into(), crate::tagged_json_payload(&data, "raw_text"));
    Some(json!(fields))
}
fn header_value(headers: &HeaderMap, selected: &[String]) -> Result<Value> {
    let mut result = BTreeMap::new();
    for name in selected {
        let name = name.to_lowercase();
        let mut values = Vec::new();
        for value in headers.get_all(&name) {
            let value = value.to_str()?;
            values.push(if name == "set-cookie" {
                cookie(value)?
            } else {
                json!(value)
            });
        }
        if name == "set-cookie" {
            values.sort_by_key(|v| v["name"].to_string());
        }
        if !values.is_empty() {
            result.insert(name, values);
        }
    }
    Ok(json!(result))
}
fn cookie(value: &str) -> Result<Value> {
    let mut segments = value.split(';');
    let (name, value) = segments
        .next()
        .context("empty Set-Cookie")?
        .trim()
        .split_once('=')
        .context("Set-Cookie missing =")?;
    let mut attributes = BTreeMap::new();
    for attribute in segments.filter(|s| !s.trim().is_empty()) {
        let (name, value) = attribute
            .trim()
            .split_once('=')
            .map(|(k, v)| (k.trim(), json!(v.trim())))
            .unwrap_or((attribute.trim(), json!(true)));
        attributes.insert(name.to_lowercase(), value);
    }
    Ok(json!({"name":name.trim(),"value":value.trim(),"attributes":attributes}))
}
pub fn expand(value: &Value, variables: &BTreeMap<String, Value>) -> Result<Value> {
    Ok(match value {
        Value::String(s) => {
            if let Some(key) = s.strip_prefix("{{").and_then(|s| s.strip_suffix("}}"))
                && !key.contains(['{', '}'])
            {
                variables
                    .get(key)
                    .with_context(|| format!("unbound variable {key}"))?
                    .clone()
            } else {
                let mut rest = s.as_str();
                let mut output = String::new();
                while let Some(start) = rest.find("{{") {
                    output.push_str(&rest[..start]);
                    let after = &rest[start + 2..];
                    let end = after.find("}}").context("unterminated variable")?;
                    let key = &after[..end];
                    let v = variables
                        .get(key)
                        .with_context(|| format!("unbound variable {key}"))?;
                    output.push_str(v.as_str().unwrap_or(&v.to_string()));
                    rest = &after[end + 2..];
                }
                output.push_str(rest);
                json!(output)
            }
        }
        Value::Array(values) => Value::Array(
            values
                .iter()
                .map(|v| expand(v, variables))
                .collect::<Result<_>>()?,
        ),
        Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(k, v)| Ok((k.clone(), expand(v, variables)?)))
                .collect::<Result<_>>()?,
        ),
        _ => value.clone(),
    })
}

fn decode_body(content_type: &str, bytes: &[u8]) -> Value {
    if bytes.is_empty() {
        return json!({"encoding":"empty"});
    }
    let media = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if media == "application/json" || media.ends_with("+json") {
        return match serde_json::from_slice::<Value>(bytes) {
            Ok(value) => json!({"encoding":"json","value":value}),
            Err(_) => {
                json!({"encoding":"invalid_json","raw":String::from_utf8(bytes.to_vec()).map(Value::String).unwrap_or_else(|_|json!({"base64":STANDARD.encode(bytes)}))})
            }
        };
    }
    if media.starts_with("text/")
        && let Ok(text) = std::str::from_utf8(bytes)
    {
        return json!({"encoding":"text","value":text});
    }
    json!({"encoding":"binary","base64":STANDARD.encode(bytes)})
}
#[cfg(test)]
mod decoding_tests {
    use super::*;
    #[test]
    fn preserves_content_type_json_validity_and_empty_body_distinctions() {
        let bodies = [
            decode_body("application/json", br#""ok""#),
            decode_body("application/json", b"ok"),
            decode_body("text/plain", b"ok"),
            decode_body("application/json", b""),
            decode_body("application/json", br#""""#),
        ];
        for (i, left) in bodies.iter().enumerate() {
            for right in &bodies[i + 1..] {
                assert_ne!(left, right);
            }
        }
        assert_eq!(
            cookie("session= abc ; HttpOnly; SameSite = Lax; ").unwrap(),
            json!({"name":"session","value":"abc","attributes":{"httponly":true,"samesite":"Lax"}})
        );
    }
}

#[cfg(test)]
mod sse_encoding_tests {
    use super::*;
    #[test]
    fn sse_json_string_and_raw_text_are_different_protocol_observations() {
        let json = sse_event(r#"data: "ok""#).unwrap();
        let raw = sse_event("data: ok").unwrap();
        assert_eq!(json["data"], json!({"encoding":"json","value":"ok"}));
        assert_eq!(raw["data"], json!({"encoding":"raw_text","raw":"ok"}));
        let mut normalizer = crate::normalize::Normalizer::new(&[]).unwrap();
        normalizer.compare("/sse", &json, &raw);
        assert!(
            normalizer
                .differences
                .iter()
                .any(|d| d.path == "/sse/data/encoding")
        );
    }
}
