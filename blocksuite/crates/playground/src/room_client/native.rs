use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::mpsc,
    time::timeout,
};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::{RoomCommand, RoomConfig, RoomEvent, RoomFrame, RoomLink};

const RECONNECT_MIN: Duration = Duration::from_millis(250);
const RECONNECT_MAX: Duration = Duration::from_secs(5);

/// Connect to the room on a background thread running a single-threaded `tokio`
/// runtime. The transport reconnects with backoff until the link is dropped.
pub fn connect(config: RoomConfig) -> RoomLink {
    let (events_tx, events_rx) = async_channel::unbounded();
    if let Err(err) = config.validate_native() {
        // Nothing to retry: report the reason once and stay closed.
        let _ = events_tx.try_send(RoomEvent::Closed(err.to_string()));
        return RoomLink::from_parts(events_rx, |_| {});
    }
    let (commands_tx, commands_rx) = mpsc::unbounded_channel();
    let failure_tx = events_tx.clone();
    let spawned = std::thread::Builder::new()
        .name("room-sync".to_string())
        .spawn(move || {
            match tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                Ok(runtime) => runtime.block_on(run(config, events_tx, commands_rx)),
                Err(err) => {
                    let _ = events_tx.try_send(RoomEvent::Closed(format!(
                        "room sync runtime failed to start: {err}"
                    )));
                }
            }
        });
    if let Err(err) = spawned {
        let _ = failure_tx.try_send(RoomEvent::Closed(format!(
            "room sync thread failed to start: {err}"
        )));
    }
    RoomLink::from_parts(events_rx, move |command| {
        let _ = commands_tx.send(command);
    })
}

/// Largest blob body accepted from the relay.
const MAX_BLOB_BYTES: usize = blocksuite_playground_doc::MAX_BLOB_BYTES;
/// Longest wait for the relay to connect, finish a handshake, accept a request or send
/// more bytes.
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);

/// Fetch a blob with a plain HTTP/1.1 `GET` over TCP (`http://host[:port]/path`).
/// `None` when the URL is not plain HTTP, the relay does not answer `2xx` in time, or
/// the body is malformed or larger than [`MAX_BLOB_BYTES`].
async fn fetch_blob(url: String) -> Option<Vec<u8>> {
    let rest = url.strip_prefix("http://")?;
    let (authority, path) = match rest.find('/') {
        Some(slash) => rest.split_at(slash),
        None => (rest, "/"),
    };
    let has_port = authority
        .rsplit_once(':')
        .is_some_and(|(_, port)| !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()));
    let address = if has_port {
        authority.to_string()
    } else {
        format!("{authority}:80")
    };
    let mut stream = timeout(HTTP_TIMEOUT, TcpStream::connect(address))
        .await
        .ok()?
        .ok()?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {authority}\r\nAccept: */*\r\nConnection: close\r\n\r\n"
    );
    timeout(HTTP_TIMEOUT, stream.write_all(request.as_bytes()))
        .await
        .ok()?
        .ok()?;

    // `Connection: close` makes the end of the stream the end of the response.
    let mut response = Vec::new();
    let mut chunk = [0_u8; 16 * 1024];
    loop {
        let read = timeout(HTTP_TIMEOUT, stream.read(&mut chunk))
            .await
            .ok()?
            .ok()?;
        if read == 0 {
            break;
        }
        response.extend_from_slice(&chunk[..read]);
        if response.len() > MAX_BLOB_BYTES + chunk.len() {
            return None;
        }
    }
    parse_http_response(&response)
}

/// Body of a complete HTTP/1.1 response with a `2xx` status, honoring `Content-Length`
/// and chunked framing; without either the body runs to the end of the stream.
fn parse_http_response(response: &[u8]) -> Option<Vec<u8>> {
    let header_end = response.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = std::str::from_utf8(&response[..header_end]).ok()?;
    let body = &response[header_end + 4..];
    let mut lines = head.split("\r\n");
    let status = lines.next()?.split(' ').nth(1)?;
    if status.len() != 3 || !status.starts_with('2') {
        return None;
    }
    let mut content_length = None;
    let mut chunked = false;
    for line in lines {
        let (name, value) = line.split_once(':')?;
        let value = value.trim();
        if name.eq_ignore_ascii_case("content-length") {
            content_length = Some(value.parse::<usize>().ok()?);
        } else if name.eq_ignore_ascii_case("transfer-encoding") {
            chunked = value.to_ascii_lowercase().contains("chunked");
        }
    }
    let body = if chunked {
        decode_chunked(body)?
    } else if let Some(length) = content_length {
        body.get(..length)?.to_vec()
    } else {
        body.to_vec()
    };
    (body.len() <= MAX_BLOB_BYTES).then_some(body)
}

fn decode_chunked(mut body: &[u8]) -> Option<Vec<u8>> {
    let mut decoded = Vec::new();
    loop {
        let line_end = body.windows(2).position(|w| w == b"\r\n")?;
        let size_line = std::str::from_utf8(&body[..line_end]).ok()?;
        let size = usize::from_str_radix(size_line.split(';').next()?.trim(), 16).ok()?;
        body = &body[line_end + 2..];
        if size == 0 {
            return Some(decoded);
        }
        if decoded.len().checked_add(size)? > MAX_BLOB_BYTES {
            return None;
        }
        decoded.extend_from_slice(body.get(..size)?);
        // Each chunk is followed by its own line break.
        let rest = &body[size..];
        if rest.get(..2) != Some(b"\r\n".as_slice()) {
            return None;
        }
        body = &rest[2..];
    }
}

fn spawn_fetch(config: &RoomConfig, events: &async_channel::Sender<RoomEvent>, source_id: String) {
    let url = config.blob_url(&source_id);
    let events = events.clone();
    tokio::spawn(async move {
        let bytes = fetch_blob(url).await;
        let _ = events.try_send(RoomEvent::Blob { source_id, bytes });
    });
}

async fn put_blob_once(url: &str, body: &[u8]) -> bool {
    let Some(rest) = url.strip_prefix("http://") else {
        return false;
    };
    let (authority, path) = match rest.find('/') {
        Some(slash) => rest.split_at(slash),
        None => (rest, "/"),
    };
    let has_port = authority
        .rsplit_once(':')
        .is_some_and(|(_, port)| !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()));
    let address = if has_port {
        authority.to_string()
    } else {
        format!("{authority}:80")
    };
    let Ok(Ok(mut stream)) = timeout(HTTP_TIMEOUT, TcpStream::connect(address)).await else {
        return false;
    };
    let head = format!(
        "PUT {path} HTTP/1.1\r\nHost: {authority}\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    if timeout(HTTP_TIMEOUT, stream.write_all(head.as_bytes()))
        .await
        .ok()
        .and_then(Result::ok)
        .is_none()
    {
        return false;
    }
    if timeout(HTTP_TIMEOUT, stream.write_all(body))
        .await
        .ok()
        .and_then(Result::ok)
        .is_none()
    {
        return false;
    }
    let mut response = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let Ok(Ok(read)) = timeout(HTTP_TIMEOUT, stream.read(&mut chunk)).await else {
            return false;
        };
        if read == 0 {
            break;
        }
        response.extend_from_slice(&chunk[..read]);
        if response.len() > 64 * 1024 {
            break;
        }
    }
    parse_http_response(&response).is_some()
}

fn spawn_upload(
    config: &RoomConfig,
    events: &async_channel::Sender<RoomEvent>,
    source_id: String,
    bytes: std::sync::Arc<Vec<u8>>,
) {
    let url = config.blob_url(&source_id);
    let events = events.clone();
    tokio::spawn(async move {
        let ok = put_blob_once(&url, &bytes).await;
        let _ = events.try_send(RoomEvent::BlobUploaded { source_id, ok });
    });
}

/// Serve a command while no socket is open; `false` once the link is gone.
fn serve_unconnected(
    command: Option<RoomCommand>,
    config: &RoomConfig,
    events: &async_channel::Sender<RoomEvent>,
) -> bool {
    match command {
        Some(RoomCommand::FetchBlob(source_id)) => {
            spawn_fetch(config, events, source_id);
            true
        }
        Some(RoomCommand::UploadBlob { source_id, bytes }) => {
            spawn_upload(config, events, source_id, bytes);
            true
        }
        // Frames addressed to a closed socket are dropped: the next handshake resends
        // whatever the relay is missing.
        Some(RoomCommand::Send(_)) => true,
        Some(RoomCommand::Close) | None => false,
    }
}

async fn run(
    config: RoomConfig,
    events: async_channel::Sender<RoomEvent>,
    mut commands: mpsc::UnboundedReceiver<RoomCommand>,
) {
    let mut backoff = RECONNECT_MIN;
    loop {
        // A pending connect never holds up blob fetches or shutdown.
        let connecting = timeout(HTTP_TIMEOUT, connect_async(config.ws_url.as_str()));
        tokio::pin!(connecting);
        let connected = loop {
            tokio::select! {
                result = &mut connecting => break result,
                command = commands.recv() => {
                    if !serve_unconnected(command, &config, &events) {
                        return;
                    }
                }
            }
        };
        let reason = match connected {
            Ok(Ok((stream, _))) => {
                backoff = RECONNECT_MIN;
                if events.try_send(RoomEvent::Opened).is_err() {
                    return;
                }
                let (mut sink, mut source) = stream.split();
                loop {
                    tokio::select! {
                        message = source.next() => match message {
                            Some(Ok(Message::Binary(bytes))) => {
                                let frame = RoomFrame::Binary(bytes.to_vec());
                                if events.try_send(RoomEvent::Frame(frame)).is_err() {
                                    return;
                                }
                            }
                            Some(Ok(Message::Text(text))) => {
                                let frame = RoomFrame::Text(text.to_string());
                                if events.try_send(RoomEvent::Frame(frame)).is_err() {
                                    return;
                                }
                            }
                            Some(Ok(Message::Close(_))) | None => {
                                break "connection closed by relay".to_string();
                            }
                            Some(Ok(_)) => {}
                            Some(Err(err)) => break format!("connection lost: {err}"),
                        },
                        command = commands.recv() => match command {
                            Some(RoomCommand::Send(RoomFrame::Binary(bytes))) => {
                                if let Err(err) = sink.send(Message::Binary(bytes.into())).await {
                                    break format!("send failed: {err}");
                                }
                            }
                            Some(RoomCommand::Send(RoomFrame::Text(text))) => {
                                if let Err(err) = sink.send(Message::Text(text.into())).await {
                                    break format!("send failed: {err}");
                                }
                            }
                            Some(RoomCommand::FetchBlob(source_id)) => {
                                spawn_fetch(&config, &events, source_id);
                            }
                            Some(RoomCommand::UploadBlob { source_id, bytes }) => {
                                spawn_upload(&config, &events, source_id, bytes);
                            }
                            Some(RoomCommand::Close) | None => {
                                let _ = sink.close().await;
                                return;
                            }
                        },
                    }
                }
            }
            Ok(Err(err)) => format!("cannot reach {}: {err}", config.ws_url),
            Err(_) => format!("cannot reach {}: the connection timed out", config.ws_url),
        };
        if events.try_send(RoomEvent::Closed(reason)).is_err() {
            return;
        }

        // Wait out the backoff while still serving blob fetches and shutdown.
        let retry = tokio::time::sleep(backoff);
        tokio::pin!(retry);
        loop {
            tokio::select! {
                () = &mut retry => break,
                command = commands.recv() => {
                    if !serve_unconnected(command, &config, &events) {
                        return;
                    }
                }
            }
        }
        backoff = (backoff * 2).min(RECONNECT_MAX);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_response_bodies_follow_length_chunked_and_close_framing() {
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\ncontent-type: image/png\r\nContent-Length: 3\r\n\r\nabcTRAILING"
            ),
            Some(b"abc".to_vec())
        );
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWiki\r\n5;x=1\r\npedia\r\n0\r\n\r\n"
            ),
            Some(b"Wikipedia".to_vec())
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 204 No Content\r\n\r\n"),
            Some(Vec::new())
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\n\r\nuntil close"),
            Some(b"until close".to_vec())
        );
        // Anything but a complete 2xx response is no blob.
        assert_eq!(
            parse_http_response(b"HTTP/1.1 404 Not Found\r\n\r\nmissing"),
            None
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort"),
            None
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWi"),
            None
        );
        assert_eq!(
            parse_http_response(b"HTTP/1.1 200 OK\r\nContent-Length: 3"),
            None
        );
        // A chunk must end with its own line break and declare a size that fits.
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nWikiXX0\r\n\r\n"
            ),
            None
        );
        assert_eq!(
            parse_http_response(
                b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nffffffffffffffff\r\nWiki\r\n0\r\n\r\n"
            ),
            None
        );
    }

    #[test]
    fn native_transport_rejects_tls_relays_up_front() {
        for relay in ["wss://relay.example", "https://relay.example"] {
            let config = RoomConfig::new("room", Some(relay));
            assert_eq!(config.ws_url, "wss://relay.example/native-sync/rooms/room");
            assert_eq!(config.http_origin, "https://relay.example");
            let error = config.validate_native().unwrap_err().to_string();
            assert!(error.contains("ws://") && error.contains("wss://relay.example"));

            // The transport reports the reason once and never starts a reconnect loop.
            let link = connect(config);
            assert_eq!(link.events().try_recv(), Ok(RoomEvent::Closed(error)));
            assert!(link.events().is_closed());
        }
        for relay in [
            None,
            Some("ws://127.0.0.1:8788"),
            Some("http://relay.local:9000"),
        ] {
            assert!(RoomConfig::new("room", relay).validate_native().is_ok());
        }
    }

    #[test]
    fn closing_the_link_ends_a_pending_connect() {
        // A listener that never answers the WebSocket handshake keeps the connect pending.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let relay = format!("ws://{}", listener.local_addr().unwrap());
        let link = connect(RoomConfig::new("room", Some(&relay)));
        let events = link.events().clone();
        // A frame for the unopened socket is dropped without ending the transport.
        link.send(RoomCommand::Send(RoomFrame::Text("early".to_string())));
        drop(link);
        for _ in 0..300 {
            if events.is_closed() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert!(
            events.is_closed(),
            "the transport kept connecting after its link was dropped"
        );
        assert!(events.try_recv().is_err());
    }
}
