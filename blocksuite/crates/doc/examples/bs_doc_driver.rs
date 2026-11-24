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
    StructuralEdit {
        page_id: String,
        action: StructuralAction,
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
    GenerateKeyBetween {
        a: Option<String>,
        b: Option<String>,
    },
    AddShape {
        page_id: String,
        surface_id: String,
        element_id: String,
        index: String,
        shape_type: String,
        xywh: String,
        text: Option<String>,
        now_ms: u64,
    },
    UpdateShapeRotate {
        page_id: String,
        surface_id: String,
        element_id: String,
        rotate: f64,
        now_ms: u64,
    },
    AddConnector {
        page_id: String,
        surface_id: String,
        element_id: String,
        index: String,
        source_id: String,
        target_id: String,
        now_ms: u64,
    },
    AddBrush {
        page_id: String,
        surface_id: String,
        element_id: String,
        index: String,
        xywh: String,
        points: Vec<Vec<f64>>,
        now_ms: u64,
    },
    UpdateBrushPoints {
        page_id: String,
        surface_id: String,
        element_id: String,
        points: Vec<Vec<f64>>,
        now_ms: u64,
    },
    UpdateConnectorLabelXywh {
        page_id: String,
        surface_id: String,
        element_id: String,
        label_xywh: [f64; 4],
        now_ms: u64,
    },
    AddNoteWithText {
        page_id: String,
        root_id: String,
        note_id: String,
        para_id: String,
        xywh: [f64; 4],
        text: String,
        now_ms: u64,
    },
    SpliceSurfaceElementText {
        page_id: String,
        surface_id: String,
        element_id: String,
        field: String,
        utf16_start: u64,
        utf16_delete_len: u64,
        insert: String,
        now_ms: u64,
    },
    CommitConnectorLabel {
        page_id: String,
        surface_id: String,
        element_id: String,
        trimmed_text: String,
        label_xywh: [f64; 4],
        now_ms: u64,
    },
    DeleteWithConnectors {
        page_id: String,
        block_ids: Vec<String>,
        surface_elements: Vec<(String, String)>,
        now_ms: u64,
    },
    Undo {
        page_id: String,
    },
    Redo {
        page_id: String,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum StructuralAction {
    Convert,
    Split,
    Indent,
    Outdent,
    Merge,
    Title,
    Reorder,
    Align,
    Link,
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
            Command::StructuralEdit { page_id, action } => {
                let page = ws_session.page_mut(&page_id).unwrap();
                let numbered = BlockSpec::List {
                    list_type: ListType::Numbered,
                    text: String::new(),
                    checked: false,
                    order: Some(1),
                };
                let commit = match action {
                    StructuralAction::Convert => {
                        page.convert_block_flavour("p-2", "converted", numbered, 100)
                    }
                    StructuralAction::Split => {
                        page.split_text_block("converted", "split", 6, numbered, 110)
                    }
                    StructuralAction::Indent => {
                        page.reparent_block("split", "note-1", "converted", 0, 120)
                    }
                    StructuralAction::Outdent => page.dedent_block("split", 130),
                    StructuralAction::Merge => page
                        .merge_with_previous_text_block("converted", "split", "note-1", 140)
                        .map(|(_, c)| c),
                    StructuralAction::Title => {
                        page.insert_text("page-1", "prop:title", 0, "Edited ", 150)
                    }
                    StructuralAction::Reorder => {
                        page.reparent_block("converted", "note-1", "note-1", 0, 160)
                    }
                    StructuralAction::Align => page.set_block_prop(
                        "converted",
                        "prop:textAlign",
                        SessionValue::Any(Any::String("center".into())),
                        170,
                    ),
                    StructuralAction::Link => page.format_text(
                        "converted",
                        "prop:text",
                        0,
                        6,
                        TextAttributes::from([(
                            "link".to_string(),
                            Any::String("https://affine.pro".into()),
                        )]),
                        180,
                    ),
                }
                .unwrap()
                .unwrap();
                let mut frames = vec![(page_id.clone(), commit.update)];
                if matches!(action, StructuralAction::Title) {
                    let title = page.read_editable_text("page-1").unwrap().0.plain;
                    let root = ws_session
                        .set_page_title(&page_id, &title)
                        .unwrap()
                        .unwrap();
                    frames.push((ws_session.room().into(), root.update));
                }
                for (doc_id, update) in frames {
                    let data = encode_binary_frame(&RoomBinaryFrame::Doc {
                        doc_id,
                        message: DocMessage::Update(update),
                    })
                    .unwrap();
                    ws.send(WsMsg::Binary(data.into())).await.unwrap();
                }
                json!({"ok":true})
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
            Command::GenerateKeyBetween { a, b } => {
                match blocksuite_playground_doc::fractional_index::generate_key_between(
                    a.as_deref(),
                    b.as_deref(),
                ) {
                    Ok(key) => json!({ "ok": true, "key": key }),
                    Err(err) => json!({ "ok": false, "error": err }),
                }
            }
            Command::AddShape {
                page_id,
                surface_id,
                element_id,
                index,
                shape_type,
                xywh,
                text,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .structural_edit(now_ms, move |p| {
                        p.add_surface_element(
                            &surface_id,
                            element_id.clone(),
                            &index,
                            SurfaceElementSpec::Shape {
                                shape_type: shape_type.clone(),
                                xywh: xywh.clone(),
                                seed: 101,
                                filled: true,
                                text: text.clone(),
                            },
                            now_ms,
                        )?;
                        Ok(())
                    })
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
            Command::UpdateShapeRotate {
                page_id,
                surface_id,
                element_id,
                rotate,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .structural_edit(now_ms, move |p| {
                        p.set_surface_element_field(
                            &surface_id,
                            &element_id,
                            "rotate",
                            SessionValue::Any(Any::Float64(rotate.into())),
                            now_ms,
                        )?;
                        Ok(())
                    })
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
            Command::AddConnector {
                page_id,
                surface_id,
                element_id,
                index,
                source_id,
                target_id,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .structural_edit(now_ms, move |p| {
                        p.add_surface_element(
                            &surface_id,
                            element_id.clone(),
                            &index,
                            SurfaceElementSpec::Connector {
                                mode: 1,
                                seed: 202,
                                source: ConnectorEndpointSpec::element(
                                    source_id.clone(),
                                    Some([1.0, 0.5]),
                                ),
                                target: ConnectorEndpointSpec::element(
                                    target_id.clone(),
                                    Some([0.0, 0.5]),
                                ),
                                text: None,
                                label_xywh: None,
                            },
                            now_ms,
                        )?;
                        Ok(())
                    })
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
            Command::AddBrush {
                page_id,
                surface_id,
                element_id,
                index,
                xywh,
                points,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .structural_edit(now_ms, move |p| {
                        p.add_surface_element(
                            &surface_id,
                            element_id.clone(),
                            &index,
                            SurfaceElementSpec::Brush {
                                seed: 303,
                                points: points.clone(),
                                xywh: xywh.clone(),
                            },
                            now_ms,
                        )?;
                        Ok(())
                    })
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
            Command::UpdateBrushPoints {
                page_id,
                surface_id,
                element_id,
                points,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let encoded: Vec<Any> = points
                    .into_iter()
                    .map(|p| Any::Array(p.into_iter().map(|v| Any::Float64(v.into())).collect()))
                    .collect();
                if let Some(c) = page
                    .set_surface_element_field(
                        &surface_id,
                        &element_id,
                        "points",
                        SessionValue::Any(blocksuite_playground_doc::schema::map_array_any(
                            encoded,
                        )),
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
            Command::UpdateConnectorLabelXywh {
                page_id,
                surface_id,
                element_id,
                label_xywh,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let encoded: Vec<Any> = label_xywh
                    .into_iter()
                    .map(|v| Any::Float64(v.into()))
                    .collect();
                if let Some(c) = page
                    .set_surface_element_field(
                        &surface_id,
                        &element_id,
                        "labelXYWH",
                        SessionValue::Any(blocksuite_playground_doc::schema::map_array_any(
                            encoded,
                        )),
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
            Command::AddNoteWithText {
                page_id,
                root_id,
                note_id,
                para_id,
                xywh,
                text,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .add_edgeless_note(&root_id, &note_id, &para_id, "a5", xywh, &text, now_ms)
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
            Command::SpliceSurfaceElementText {
                page_id,
                surface_id,
                element_id,
                field,
                utf16_start,
                utf16_delete_len,
                insert,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .splice_surface_element_text(
                        &surface_id,
                        &element_id,
                        &field,
                        utf16_start,
                        utf16_delete_len,
                        &insert,
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
            Command::CommitConnectorLabel {
                page_id,
                surface_id,
                element_id,
                trimmed_text,
                label_xywh,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page
                    .commit_connector_label(
                        &surface_id,
                        &element_id,
                        &trimmed_text,
                        label_xywh,
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
            Command::DeleteWithConnectors {
                page_id,
                block_ids,
                surface_elements,
                now_ms,
            } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                let b_refs: Vec<&str> = block_ids.iter().map(String::as_str).collect();
                let s_refs: Vec<(&str, &str)> = surface_elements
                    .iter()
                    .map(|(s, e)| (s.as_str(), e.as_str()))
                    .collect();
                if let Some(c) = page
                    .delete_blocks_and_elements_with_connectors(&b_refs, &s_refs, now_ms)
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
            Command::Undo { page_id } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page.undo().unwrap()
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
            Command::Redo { page_id } => {
                let page = ws_session.ensure_page(&page_id).unwrap();
                if let Some(c) = page.redo().unwrap()
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

#[cfg(test)]
mod surface_roundtrip {
    use super::*;
    use blocksuite_playground_doc::{
        read::{BlockContent, ColorValue, ConnectorMode, ShapeType, SurfaceElementKind},
        session::PageDocSession,
    };
    use std::{
        path::Path,
        process::{Command, Stdio},
    };

    /// Exercise Yjs constructors as well as mutations of the nested shared maps and texts.
    /// The room-sync Store test separately checks initial hydration sends no outbound update.
    #[test]
    fn js_authored_surface_returns_typed_fields_without_writeback() {
        let mut page = PageDocSession::new("test", 51).unwrap();
        page.add_block("surface", BlockSpec::Surface, None, None, 1)
            .unwrap();
        let script = r#"
          import * as Y from 'yjs';
          import { readFileSync } from 'node:fs';
          const doc = new Y.Doc();
          Y.applyUpdate(doc, Uint8Array.from(JSON.parse(readFileSync(0, 'utf8'))));
          const elements = doc.getMap('blocks').get('surface').get('prop:elements').get('value');
          const make = (id, fields) => {
            const element = new Y.Map(Object.entries({id, index:'a0', ...fields}));
            elements.set(id, element);
            return element;
          };
          doc.transact(() => {
            const shape = make('s', {type:'shape', shapeType:'ellipse', xywh:'[3,5,90,40]', text:new Y.Text()});
            shape.set('rotate', 17);
            shape.get('text').insert(0, 'marked', {bold:true});
            make('c', {type:'connector', rough:true, mode:0, source:{id:'s',position:[1,0.5]}, target:{position:[230,17]}}).set('mode',2);
            make('b', {type:'brush',xywh:'[10,12,30,25]', points:[[4,3],[20,8,0.8]], lineWidth:7});
            make('h', {type:'highlighter', color:{light:'#ffea334d',dark:'#4477ff4d'}, points:[[0,0]],lineWidth:19});
            make('t', {type:'text', text:new Y.Text('canvas'), hasMaxWidth:true}).set('fontSize',31);
            make('g', {type:'group', title:new Y.Text('set'), children:new Y.Map([['s',true],['h',false],['c',true]])});
          });
          process.stdout.write(JSON.stringify(Array.from(Y.encodeStateAsUpdate(doc))));
        "#;
        let project = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let mut child = Command::new("node")
            .current_dir(project)
            .args(["--input-type=module", "-e", script])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        serde_json::to_writer(
            child.stdin.take().unwrap(),
            &page.encode_update_v1().unwrap(),
        )
        .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        let update: Vec<u8> = serde_json::from_slice(&output.stdout).unwrap();
        page.apply_remote_update_v1(&update).unwrap();
        let before = page.encode_update_v1().unwrap();
        let tree = page.read_page_snapshot().unwrap();
        let BlockContent::Surface {
            elements,
            element_count,
        } = &tree.block("surface").unwrap().content
        else {
            panic!()
        };
        assert_eq!(*element_count, 6);
        let lookup: std::collections::BTreeMap<_, _> =
            elements.iter().map(|e| (e.id.as_str(), e)).collect();
        let SurfaceElementKind::Shape(s) = &lookup["s"].kind else {
            panic!()
        };
        assert_eq!(s.shape_type, ShapeType::Ellipse);
        assert_eq!(s.xywh, [3., 5., 90., 40.]);
        assert_eq!(lookup["s"].rotate, 17.);
        assert_eq!(s.text.plain, "marked");
        assert!(
            matches!(&s.text.delta[..],[y_octo::TextDeltaOp::Insert{format:Some(attrs),..}] if attrs.get("bold")==Some(&Any::True))
        );
        let SurfaceElementKind::Connector(c) = &lookup["c"].kind else {
            panic!()
        };
        assert!(c.rough);
        assert_eq!(c.mode, ConnectorMode::Curve);
        assert_eq!(c.source.id.as_deref(), Some("s"));
        assert_eq!(c.source.position, Some([1., 0.5]));
        assert_eq!(c.target.position, Some([230., 17.]));
        assert_eq!(c.label_xywh, None);
        let SurfaceElementKind::Brush(b) = &lookup["b"].kind else {
            panic!()
        };
        assert!(b.simulated_pressure);
        assert_eq!(b.points, [[4., 3., 0.5], [20., 8., 0.8]]);
        assert_eq!(b.xywh, [10., 12., 30., 25.]);
        assert_eq!(b.line_width, 7.);
        let SurfaceElementKind::Highlighter(h) = &lookup["h"].kind else {
            panic!()
        };
        assert_eq!(h.line_width, 19.);
        assert_eq!(
            h.color,
            ColorValue::Themed {
                light: "#ffea334d".into(),
                dark: "#4477ff4d".into()
            }
        );
        let SurfaceElementKind::Text(t) = &lookup["t"].kind else {
            panic!()
        };
        assert_eq!(t.text.plain, "canvas");
        assert!(t.has_max_width);
        assert_eq!(t.font_size, 31.);
        let SurfaceElementKind::Group { title, children } = &lookup["g"].kind else {
            panic!()
        };
        assert_eq!(children, &["c", "h", "s"]);
        assert_eq!(title.plain, "set");
        assert_eq!(before, page.encode_update_v1().unwrap());
    }
}
