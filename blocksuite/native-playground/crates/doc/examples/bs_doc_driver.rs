#![forbid(unsafe_code)]

//! Interactive JSON-line driver wrapping `crates/doc` (`WorkspaceSession` + `RoomAwareness` +
//! WebSocket client) for live Rust <-> JS Vitest room collaboration tests.

use std::io::{self, BufRead, Write};

use blocksuite_playground_doc::{
    awareness::{
        AWARENESS_EXPIRE_TIMEOUT_MS, AwarenessPayload, RoomAwareness, TextRangePoint,
        TextSelectionState,
    },
    schema::{BlockSpec, ConnectorEndpointSpec, ListType, ParagraphType, SurfaceElementSpec},
    session::WorkspaceSession,
    wire::{
        DocSyncState, RoomBinaryFrame, RoomControlFrame, decode_binary_frame, decode_control_frame,
        encode_binary_frame,
    },
};
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{Value as JsonValue, json};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMsg};
use y_octo::{Any, DocMessage, SessionValue, StateVector, TextAttributes};

#[derive(Debug, Parser)]
struct Args {
    #[arg(long)]
    relay_http: String,
    #[arg(long)]
    room: String,
    #[arg(long)]
    client_id: u64,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum Command {
    SeedFullSchema {
        page_id: String,
        title: String,
    },
    SyncAll,
    Reconnect,
    InsertText {
        page_id: String,
        block_id: String,
        index: u64,
        text: String,
        now_ms: u64,
    },
    RemoveText {
        page_id: String,
        block_id: String,
        index: u64,
        len: u64,
        now_ms: u64,
    },
    FormatText {
        page_id: String,
        block_id: String,
        index: u64,
        len: u64,
        bold: bool,
        now_ms: u64,
    },
    ReorderChild {
        page_id: String,
        parent_id: String,
        child_id: String,
        new_index: u64,
        now_ms: u64,
    },
    UpdateShapeXywh {
        page_id: String,
        surface_id: String,
        element_id: String,
        xywh: String,
        now_ms: u64,
    },
    UpdateConnectorMode {
        page_id: String,
        surface_id: String,
        element_id: String,
        mode: i32,
        now_ms: u64,
    },
    SetAwareness {
        name: String,
        color: String,
        store_key: String,
        block_id: String,
        #[serde(default)]
        index: u64,
        #[serde(default)]
        length: u64,
        now_ms: u64,
    },
    TickAwareness {
        now_ms: u64,
    },
    UploadBlob {
        key: String,
        bytes: Vec<u8>,
    },
    FetchBlob {
        key: String,
    },
    Drain {
        wait_ms: u64,
    },
    ExportState {
        page_id: String,
    },
    Quit,
}

type WsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect_room(relay_http: &str, room: &str) -> WsStream {
    let ws_base = relay_http
        .replacen("http://", "ws://", 1)
        .replacen("https://", "wss://", 1);
    let url = format!("{ws_base}/native-sync/rooms/{room}");
    let (stream, _) = connect_async(&url).await.expect("connect ws");
    stream
}

async fn apply_incoming_frame(
    ws_session: &mut WorkspaceSession,
    awareness: &mut RoomAwareness,
    ws: &mut WsStream,
    bytes: &[u8],
) {
    let Ok(frame) = decode_binary_frame(bytes) else {
        return;
    };
    match frame {
        RoomBinaryFrame::Doc {
            doc_id,
            message: DocMessage::Update(update),
        } => {
            if update.is_empty() || update == [0, 0] {
                return;
            }
            if doc_id == ws_session.room() {
                if let Ok(res) = ws_session.apply_root_update_v1(&update) {
                    for out in res.outbound_updates {
                        let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                            doc_id: doc_id.clone(),
                            message: DocMessage::Update(out),
                        })
                        .unwrap();
                        let _ = ws.send(WsMsg::Binary(f.into())).await;
                    }
                }
            } else if let Ok(page) = ws_session.ensure_page(&doc_id)
                && let Ok(res) = page.apply_remote_update_v1(&update)
            {
                for out in res.outbound_updates {
                    let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                        doc_id: doc_id.clone(),
                        message: DocMessage::Update(out),
                    })
                    .unwrap();
                    let _ = ws.send(WsMsg::Binary(f.into())).await;
                }
            }
        }
        RoomBinaryFrame::Awareness(payload) => {
            let _ = awareness.apply_update(&payload, 1_000);
        }
        _ => {}
    }
}

async fn sync_single_doc(
    ws: &mut WsStream,
    ws_session: &mut WorkspaceSession,
    awareness: &mut RoomAwareness,
    doc_id: &str,
) {
    let mut state = DocSyncState::new(doc_id);
    let sv = ws_session.encode_state_vector_v1(doc_id).unwrap();
    let step1 = state.begin_pull(sv);
    ws.send(WsMsg::Binary(encode_binary_frame(&step1).unwrap().into()))
        .await
        .unwrap();

    let hub_sv = loop {
        if let WsMsg::Binary(b) = ws.next().await.unwrap().unwrap() {
            match decode_binary_frame(&b).unwrap() {
                RoomBinaryFrame::Doc {
                    doc_id: d,
                    message: DocMessage::Step2(diff),
                } if d == doc_id => {
                    if !(diff.is_empty() || diff == [0, 0]) {
                        if doc_id == ws_session.room() {
                            ws_session.apply_root_update_v1(&diff).unwrap();
                        } else {
                            ws_session
                                .ensure_page(doc_id)
                                .unwrap()
                                .apply_remote_update_v1(&diff)
                                .unwrap();
                        }
                    }
                    if let Some(sv) = state.on_hub_step2() {
                        break sv;
                    }
                }
                RoomBinaryFrame::Doc {
                    doc_id: d,
                    message: DocMessage::Step1(sv),
                } if d == doc_id => {
                    if let Some(sv) = state.on_hub_step1(sv) {
                        break sv;
                    }
                }
                _ => {
                    apply_incoming_frame(ws_session, awareness, ws, &b).await;
                }
            }
        }
    };

    let diff_to_hub = ws_session.encode_diff_v1(doc_id, &hub_sv).unwrap();
    let rev_step2 = state.build_reverse_step2(diff_to_hub);
    ws.send(WsMsg::Binary(
        encode_binary_frame(&rev_step2).unwrap().into(),
    ))
    .await
    .unwrap();

    loop {
        match ws.next().await.unwrap().unwrap() {
            WsMsg::Text(t) => {
                if let Ok(RoomControlFrame::Ready { doc_id: d }) = decode_control_frame(&t)
                    && d == doc_id
                {
                    break;
                }
            }
            WsMsg::Binary(b) => {
                apply_incoming_frame(ws_session, awareness, ws, &b).await;
            }
            _ => {}
        }
    }
}

#[tokio::main]
async fn main() {
    let args = Args::parse();
    let mut ws_session = WorkspaceSession::new(&args.room, args.client_id).unwrap();
    let mut awareness = RoomAwareness::new(args.client_id).unwrap();
    let mut ws = connect_room(&args.relay_http, &args.room).await;
    let http = reqwest::Client::new();

    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<String>();
    std::thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            if cmd_tx.send(line).is_err() {
                break;
            }
        }
    });

    println!("READY");
    let _ = io::stdout().flush();

    while let Some(line) = cmd_rx.recv().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let cmd: Command = serde_json::from_str(trimmed).expect("valid JSON command");
        let reply: JsonValue = match cmd {
            Command::SeedFullSchema { page_id, title } => {
                ws_session.initialize_meta().unwrap();
                ws_session
                    .create_page(&page_id, &title, 1_700_000_000_000)
                    .unwrap();
                let page = ws_session.page_mut(&page_id).unwrap();
                page.add_block("page-1", BlockSpec::Page { title }, None, None, 10)
                    .unwrap();
                page.add_block("surface-1", BlockSpec::Surface, Some("page-1"), None, 20)
                    .unwrap();
                page.add_block(
                    "note-1",
                    BlockSpec::Note {
                        xywh: Some("[0,100,800,640]".to_string()),
                    },
                    Some("page-1"),
                    None,
                    30,
                )
                .unwrap();
                page.add_block(
                    "p-1",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::H1,
                        text: "Native Title".to_string(),
                    },
                    Some("note-1"),
                    None,
                    40,
                )
                .unwrap();
                page.add_block(
                    "p-2",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: "Shared paragraph text".to_string(),
                    },
                    Some("note-1"),
                    None,
                    45,
                )
                .unwrap();
                page.add_block(
                    "l-1",
                    BlockSpec::List {
                        list_type: ListType::Todo,
                        text: "Item 1".to_string(),
                        checked: false,
                        order: None,
                    },
                    Some("note-1"),
                    None,
                    50,
                )
                .unwrap();
                page.add_block("d-1", BlockSpec::Divider, Some("note-1"), None, 60)
                    .unwrap();
                page.add_block(
                    "c-1",
                    BlockSpec::Code {
                        text: "let x = 1;".to_string(),
                        language: Some("rust".to_string()),
                        caption: "".to_string(),
                    },
                    Some("note-1"),
                    None,
                    70,
                )
                .unwrap();
                page.add_block(
                    "img-1",
                    BlockSpec::Image {
                        source_id: "blob-seed".to_string(),
                        caption: "".to_string(),
                        width: 100.0,
                        height: 100.0,
                        xywh: Some("[0,0,100,100]".to_string()),
                    },
                    Some("note-1"),
                    None,
                    80,
                )
                .unwrap();
                page.add_block(
                    "bm-1",
                    BlockSpec::Bookmark {
                        url: "https://affine.pro".to_string(),
                        title: Some("AFFiNE".to_string()),
                        description: None,
                    },
                    Some("note-1"),
                    None,
                    90,
                )
                .unwrap();
                page.add_block(
                    "frame-1",
                    BlockSpec::Frame {
                        title: "Frame 1".to_string(),
                        xywh: Some("[0,0,300,200]".to_string()),
                        presentation_index: Some("a0".to_string()),
                    },
                    Some("surface-1"),
                    None,
                    100,
                )
                .unwrap();
                page.add_block(
                    "et-1",
                    BlockSpec::EdgelessText {
                        xywh: Some("[20,20,160,32]".to_string()),
                    },
                    Some("surface-1"),
                    None,
                    110,
                )
                .unwrap();

                // All 6 surface elements
                page.add_surface_element(
                    "surface-1",
                    "el-shape",
                    "a0",
                    SurfaceElementSpec::Shape {
                        shape_type: "rect".to_string(),
                        xywh: "[10,10,120,80]".to_string(),
                        seed: 101,
                        filled: true,
                        text: Some("Shape".to_string()),
                    },
                    120,
                )
                .unwrap();
                page.add_surface_element(
                    "surface-1",
                    "el-conn",
                    "a1",
                    SurfaceElementSpec::Connector {
                        mode: 2,
                        seed: 102,
                        source: ConnectorEndpointSpec::point(10.0, 10.0),
                        target: ConnectorEndpointSpec::point(200.0, 100.0),
                        text: None,
                        label_xywh: None,
                    },
                    130,
                )
                .unwrap();
                page.add_surface_element(
                    "surface-1",
                    "el-brush",
                    "a2",
                    SurfaceElementSpec::Brush {
                        seed: 103,
                        points: vec![vec![0.0, 0.0], vec![10.0, 10.0]],
                        xywh: "[0,0,14,14]".to_string(),
                    },
                    140,
                )
                .unwrap();
                page.add_surface_element(
                    "surface-1",
                    "el-hl",
                    "a3",
                    SurfaceElementSpec::Highlighter {
                        seed: 104,
                        points: vec![vec![0.0, 0.0], vec![15.0, 5.0]],
                        xywh: "[0,0,37,27]".to_string(),
                    },
                    150,
                )
                .unwrap();
                page.add_surface_element(
                    "surface-1",
                    "el-text",
                    "a4",
                    SurfaceElementSpec::Text {
                        seed: 105,
                        text: "Note".to_string(),
                        xywh: "[40,40,80,24]".to_string(),
                    },
                    160,
                )
                .unwrap();
                page.add_surface_element(
                    "surface-1",
                    "el-group",
                    "a5",
                    SurfaceElementSpec::Group {
                        seed: 106,
                        title: "Group".to_string(),
                        children: vec!["el-shape".to_string()],
                    },
                    170,
                )
                .unwrap();

                let room = ws_session.room().to_string();
                sync_single_doc(&mut ws, &mut ws_session, &mut awareness, &room).await;
                sync_single_doc(&mut ws, &mut ws_session, &mut awareness, &page_id).await;
                json!({ "ok": true })
            }
            Command::SyncAll => {
                let room = ws_session.room().to_string();
                sync_single_doc(&mut ws, &mut ws_session, &mut awareness, &room).await;
                let pages = ws_session.list_pages().unwrap();
                for p in pages {
                    ws_session.ensure_page(&p.id).unwrap();
                    sync_single_doc(&mut ws, &mut ws_session, &mut awareness, &p.id).await;
                }
                json!({ "ok": true })
            }
            Command::Reconnect => {
                let _ = ws.close(None).await;
                ws = connect_room(&args.relay_http, &args.room).await;
                let room = ws_session.room().to_string();
                sync_single_doc(&mut ws, &mut ws_session, &mut awareness, &room).await;
                let pages = ws_session.list_pages().unwrap();
                for p in pages {
                    ws_session.ensure_page(&p.id).unwrap();
                    sync_single_doc(&mut ws, &mut ws_session, &mut awareness, &p.id).await;
                }
                json!({ "ok": true })
            }
            Command::InsertText {
                page_id,
                block_id,
                index,
                text,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(&block_id)
                        .key("prop:text"),
                );
                let len = page.inner().read_text_len(&target).unwrap_or(0);
                let clamped = index.min(len);
                if let Some(c) = page
                    .insert_text(&block_id, "prop:text", clamped, &text, now_ms)
                    .unwrap()
                    && !c.update.is_empty()
                {
                    let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                        doc_id: page_id,
                        message: DocMessage::Update(c.update),
                    })
                    .unwrap();
                    ws.send(WsMsg::Binary(f.into())).await.unwrap();
                }
                json!({ "ok": true })
            }
            Command::RemoveText {
                page_id,
                block_id,
                index,
                len,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(&block_id)
                        .key("prop:text"),
                );
                let cur_len = page.inner().read_text_len(&target).unwrap_or(0);
                if cur_len > 0 && len > 0 {
                    let start = index.min(cur_len - 1);
                    let del = len.min(cur_len - start);
                    if let Some(c) = page
                        .remove_text(&block_id, "prop:text", start, del, now_ms)
                        .unwrap()
                        && !c.update.is_empty()
                    {
                        let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                            doc_id: page_id,
                            message: DocMessage::Update(c.update),
                        })
                        .unwrap();
                        ws.send(WsMsg::Binary(f.into())).await.unwrap();
                    }
                }
                json!({ "ok": true })
            }
            Command::FormatText {
                page_id,
                block_id,
                index,
                len,
                bold,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(&block_id)
                        .key("prop:text"),
                );
                let cur_len = page.inner().read_text_len(&target).unwrap_or(0);
                if cur_len > 0 && len > 0 {
                    let start = index.min(cur_len - 1);
                    let fmt_len = len.min(cur_len - start);
                    let mut attrs = TextAttributes::new();
                    attrs.insert("bold".to_string(), if bold { Any::True } else { Any::Null });
                    if let Some(c) = page
                        .format_text(&block_id, "prop:text", start, fmt_len, attrs, now_ms)
                        .unwrap()
                        && !c.update.is_empty()
                    {
                        let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                            doc_id: page_id,
                            message: DocMessage::Update(c.update),
                        })
                        .unwrap();
                        ws.send(WsMsg::Binary(f.into())).await.unwrap();
                    }
                }
                json!({ "ok": true })
            }
            Command::ReorderChild {
                page_id,
                parent_id,
                child_id,
                new_index,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Ok(Some(c)) = page.reorder_child(&parent_id, &child_id, new_index, now_ms)
                    && !c.update.is_empty()
                {
                    let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                        doc_id: page_id,
                        message: DocMessage::Update(c.update),
                    })
                    .unwrap();
                    ws.send(WsMsg::Binary(f.into())).await.unwrap();
                }
                json!({ "ok": true })
            }
            Command::UpdateShapeXywh {
                page_id,
                surface_id,
                element_id,
                xywh,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .set_surface_element_field(
                        &surface_id,
                        &element_id,
                        "xywh",
                        SessionValue::Any(Any::String(xywh)),
                        now_ms,
                    )
                    .unwrap()
                    && !c.update.is_empty()
                {
                    let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                        doc_id: page_id,
                        message: DocMessage::Update(c.update),
                    })
                    .unwrap();
                    ws.send(WsMsg::Binary(f.into())).await.unwrap();
                }
                json!({ "ok": true })
            }
            Command::UpdateConnectorMode {
                page_id,
                surface_id,
                element_id,
                mode,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .set_surface_element_field(
                        &surface_id,
                        &element_id,
                        "mode",
                        SessionValue::Any(Any::Integer(mode)),
                        now_ms,
                    )
                    .unwrap()
                    && !c.update.is_empty()
                {
                    let f = encode_binary_frame(&RoomBinaryFrame::Doc {
                        doc_id: page_id,
                        message: DocMessage::Update(c.update),
                    })
                    .unwrap();
                    ws.send(WsMsg::Binary(f.into())).await.unwrap();
                }
                json!({ "ok": true })
            }
            Command::SetAwareness {
                name,
                color,
                store_key,
                block_id,
                index,
                length,
                now_ms,
            } => {
                let mut payload = AwarenessPayload::new(name, color);
                payload
                    .set_text_selection(
                        store_key,
                        TextSelectionState::range(
                            TextRangePoint {
                                block_id,
                                index,
                                length,
                            },
                            None,
                            false,
                        ),
                    )
                    .unwrap();
                let bytes = awareness.set_local_payload(&payload, now_ms).unwrap();
                let frame = encode_binary_frame(&RoomBinaryFrame::Awareness(bytes)).unwrap();
                ws.send(WsMsg::Binary(frame.into())).await.unwrap();
                json!({ "ok": true })
            }
            Command::TickAwareness { now_ms } => {
                let tick = awareness.tick(now_ms).unwrap();
                if let Some(out) = tick.outbound_update {
                    let frame = encode_binary_frame(&RoomBinaryFrame::Awareness(out)).unwrap();
                    ws.send(WsMsg::Binary(frame.into())).await.unwrap();
                }
                json!({
                    "ok": true,
                    "expired": tick.expired_clients,
                    "renewed": tick.renewed_local,
                    "activeRemotes": awareness.active_remote_clients(),
                    "expireTimeoutMs": AWARENESS_EXPIRE_TIMEOUT_MS,
                })
            }
            Command::UploadBlob { key, bytes } => {
                let url = format!(
                    "{}/api/collection/{}/blob/{key}",
                    args.relay_http, args.room
                );
                let resp = http.put(&url).body(bytes).send().await.unwrap();
                json!({ "ok": resp.status().is_success(), "status": resp.status().as_u16() })
            }
            Command::FetchBlob { key } => {
                let url = format!(
                    "{}/api/collection/{}/blob/{key}",
                    args.relay_http, args.room
                );
                let resp = http.get(&url).send().await.unwrap();
                let ok = resp.status().is_success();
                let bytes = if ok {
                    resp.bytes().await.unwrap().to_vec()
                } else {
                    Vec::new()
                };
                json!({ "ok": ok, "bytes": bytes })
            }
            Command::Drain { wait_ms } => {
                let mut remaining_ms = wait_ms;
                let step_ms = 25u64;
                while remaining_ms > 0 {
                    let slice = remaining_ms.min(step_ms);
                    match tokio::time::timeout(std::time::Duration::from_millis(slice), ws.next())
                        .await
                    {
                        Ok(Some(Ok(WsMsg::Binary(b)))) => {
                            apply_incoming_frame(&mut ws_session, &mut awareness, &mut ws, &b)
                                .await;
                        }
                        Ok(Some(Ok(_))) => {}
                        Ok(_) => break,
                        Err(_) => {
                            remaining_ms = remaining_ms.saturating_sub(slice);
                        }
                    }
                }
                json!({
                    "ok": true,
                    "activeRemotes": awareness.active_remote_clients(),
                })
            }
            Command::ExportState { page_id } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let sv_bytes = page.encode_state_vector_v1().unwrap();
                let sv = StateVector::decode_v1(&sv_bytes).unwrap();
                let full_update_bytes = page.encode_update_v1().unwrap();
                let sv_map: std::collections::BTreeMap<String, u64> = sv
                    .iter()
                    .map(|(cid, clk)| (cid.to_string(), *clk))
                    .collect();
                let doc_json = page.export_doc_json().unwrap();
                let remote_awareness: std::collections::BTreeMap<String, JsonValue> = awareness
                    .active_remote_clients()
                    .into_iter()
                    .filter_map(|cid| {
                        awareness
                            .get_payload(cid)
                            .map(|p| (cid.to_string(), serde_json::to_value(p).unwrap()))
                    })
                    .collect();

                json!({
                    "ok": true,
                    "stateVector": sv_map,
                    "fullUpdateV1": full_update_bytes,
                    "docJson": doc_json,
                    "remoteAwareness": remote_awareness,
                })
            }
            Command::Quit => {
                let _ = ws.close(None).await;
                println!("{}", json!({ "ok": true }));
                let _ = io::stdout().flush();
                break;
            }
        };

        println!("{reply}");
        let _ = io::stdout().flush();
    }
}
