#![forbid(unsafe_code)]

use std::net::SocketAddr;

use blocksuite_playground_doc::{
    MAX_JS_CLIENT_ID,
    awareness::{
        AWARENESS_EXPIRE_TIMEOUT_MS, AWARENESS_RENEW_INTERVAL_MS, AwarenessPayload, RoomAwareness,
    },
    client_id_from_seed,
    room::RoomHub,
    schema::{BlockSpec, ConnectorEndpointSpec, ListType, ParagraphType, SurfaceElementSpec},
    session::{PageDocSession, WorkspaceSession},
    validate_client_id,
    wire::{
        DocSyncPhase, DocSyncState, RoomBinaryFrame, RoomControlFrame, decode_binary_frame,
        decode_control_frame, encode_binary_frame, encode_control_frame,
    },
};
use futures_util::{SinkExt, StreamExt};
use proptest::prelude::*;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use tokio::net::TcpListener;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMsg};
use y_octo::{Any, DocMessage, SessionValue, StateVector, TextAttributes};

#[test]
fn client_id_53_bit_contract() {
    assert!(validate_client_id(0).is_err());
    assert!(validate_client_id(MAX_JS_CLIENT_ID + 1).is_err());
    assert_eq!(
        validate_client_id(MAX_JS_CLIENT_ID).unwrap(),
        MAX_JS_CLIENT_ID
    );

    let high_id = (1u64 << 40) + 12345;
    assert_eq!(validate_client_id(high_id).unwrap(), high_id);

    let mut page = PageDocSession::new("doc:high-id", high_id).unwrap();
    assert_eq!(page.client_id(), high_id);
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "High Client ID".to_string(),
        },
        None,
        None,
        100,
    )
    .unwrap();

    let sv_bytes = page.encode_state_vector_v1().unwrap();
    let sv = StateVector::decode_v1(&sv_bytes).unwrap();
    assert!(
        sv.contains_key(&high_id),
        "53-bit clientId must not be truncated to u32"
    );
}

#[test]
fn all_phase1_blocks_surface_elements_and_unknown_block_lossless() {
    let mut ws = WorkspaceSession::new("room-schema", client_id_from_seed(1)).unwrap();
    ws.initialize_meta().unwrap();
    ws.create_page("doc:home", "Native Schema Doc", 1_700_000_000_000)
        .unwrap();

    let page = ws.page_mut("doc:home").unwrap();
    page.add_block(
        "page-1",
        BlockSpec::Page {
            title: "Native Schema Doc".to_string(),
        },
        None,
        None,
        10,
    )
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
            text: "Heading".to_string(),
        },
        Some("note-1"),
        None,
        40,
    )
    .unwrap();
    page.add_block(
        "l-1",
        BlockSpec::List {
            list_type: ListType::Todo,
            text: "Task".to_string(),
            checked: true,
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
            text: "fn main() {}".to_string(),
            language: Some("rust".to_string()),
            caption: "sample".to_string(),
        },
        Some("note-1"),
        None,
        70,
    )
    .unwrap();
    page.add_block(
        "img-1",
        BlockSpec::Image {
            source_id: "blob-1".to_string(),
            caption: "pic".to_string(),
            width: 320.0,
            height: 240.0,
            xywh: Some("[0,0,320,240]".to_string()),
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
            description: Some("Workspace".to_string()),
        },
        Some("note-1"),
        None,
        90,
    )
    .unwrap();
    page.add_block(
        "frame-1",
        BlockSpec::Frame {
            title: "Frame A".to_string(),
            xywh: Some("[0,0,400,300]".to_string()),
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
            xywh: Some("[10,20,200,40]".to_string()),
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
            seed: 42,
            filled: true,
            text: Some("Box".to_string()),
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
            seed: 43,
            source: ConnectorEndpointSpec::element("el-shape", Some([1.0, 0.5])),
            target: ConnectorEndpointSpec::point(300.0, 120.0),
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
            seed: 44,
            points: vec![vec![0.0, 0.0], vec![20.0, 15.0]],
            xywh: "[0,0,24,19]".to_string(),
        },
        140,
    )
    .unwrap();
    page.add_surface_element(
        "surface-1",
        "el-hl",
        "a3",
        SurfaceElementSpec::Highlighter {
            seed: 45,
            points: vec![vec![0.0, 0.0], vec![30.0, 10.0]],
            xywh: "[0,0,52,32]".to_string(),
        },
        150,
    )
    .unwrap();
    page.add_surface_element(
        "surface-1",
        "el-text",
        "a4",
        SurfaceElementSpec::Text {
            seed: 46,
            text: "Canvas text".to_string(),
            xywh: "[50,50,120,24]".to_string(),
        },
        160,
    )
    .unwrap();
    page.add_surface_element(
        "surface-1",
        "el-group",
        "a5",
        SurfaceElementSpec::Group {
            seed: 47,
            title: "Group 1".to_string(),
            children: vec!["el-shape".to_string()],
        },
        170,
    )
    .unwrap();

    // Inject an unknown/complex block (affine:callout) and verify lossless preservation
    let blocks_target = y_octo::TypeTarget::Path(y_octo::TypePath::root("blocks"));
    page.inner_mut()
        .map_set(
            &blocks_target,
            "callout-1".to_string(),
            SessionValue::Map(vec![
                (
                    "sys:id".to_string(),
                    SessionValue::Any(Any::String("callout-1".to_string())),
                ),
                (
                    "sys:flavour".to_string(),
                    SessionValue::Any(Any::String("affine:callout".to_string())),
                ),
                (
                    "sys:version".to_string(),
                    SessionValue::Any(Any::Integer(1)),
                ),
                ("sys:children".to_string(), SessionValue::Array(vec![])),
                (
                    "prop:emoji".to_string(),
                    SessionValue::Any(Any::String("💡".to_string())),
                ),
            ]),
        )
        .unwrap();

    let unknown = page.read_unknown_block("callout-1").unwrap();
    assert_eq!(unknown.flavour, "affine:callout");
    assert_eq!(unknown.version, Some(1));
    assert_eq!(unknown.prop_keys, vec!["prop:emoji".to_string()]);

    let exported = page.export_doc_json().unwrap();
    let blocks = exported["blocks"].as_object().unwrap();
    assert_eq!(blocks.len(), 12);
    assert!(
        blocks["surface-1"]["prop:elements"]["value"]["el-conn"]
            .get("labelXYWH")
            .is_none()
    );
}

#[test]
fn undo_scoped_to_blocks_with_deterministic_clock_and_selection_snapshot() {
    let mut page = PageDocSession::new("doc:undo", (1u64 << 35) + 7).unwrap();
    page.add_block(
        "p1",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "hello".to_string(),
        },
        None,
        None,
        0,
    )
    .unwrap();
    page.stop_capturing().unwrap();

    // Two edits within 500ms merge into one undo step
    page.insert_text("p1", "prop:text", 5, " world", 1000)
        .unwrap();
    let snap = page.capture_selection_snapshot("p1", 11, "p1", 11).unwrap();
    page.set_undo_selection_snapshot(snap.clone()).unwrap();
    page.insert_text("p1", "prop:text", 11, "!", 1200).unwrap();

    // Third edit after >= 500ms starts a new undo step
    page.insert_text("p1", "prop:text", 12, "?", 2000).unwrap();

    assert!(page.can_undo());
    let u1 = page.undo().unwrap().expect("undo 1");
    assert_eq!(u1.selection_meta, None);

    let u2 = page.undo().unwrap().expect("undo 2");
    assert_eq!(u2.selection_meta, Some(snap));

    let json = page.export_doc_json().unwrap();
    assert_eq!(json["blocks"]["p1"]["prop:text"][0]["insert"], "hello");
}

#[test]
fn add_block_invalid_parent_leaves_no_orphan_or_undo_entry() {
    let mut page = PageDocSession::new("doc:invalid-parent", (1u64 << 36) + 3).unwrap();
    let sv_before = page.encode_state_vector_v1().unwrap();

    let err = page
        .add_block(
            "orphan-1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "should not exist".to_string(),
            },
            Some("nonexistent-parent"),
            None,
            100,
        )
        .unwrap_err();
    assert!(
        matches!(err, blocksuite_playground_doc::DocError::BlockNotFound(ref id) if id == "nonexistent-parent")
    );
    assert!(
        !page.can_undo(),
        "failed add_block must not push to Undo stack"
    );
    assert_eq!(
        page.encode_state_vector_v1().unwrap(),
        sv_before,
        "failed add_block must emit 0 commits"
    );
    let exported = page.export_doc_json().unwrap();
    assert!(
        exported["blocks"].as_object().unwrap().is_empty(),
        "failed add_block must not leave an orphan block in blocks map"
    );
}

#[test]
fn awareness_deterministic_clock_renew_and_expire() {
    let local_id = (1u64 << 42) + 1;
    let remote_id = (1u64 << 42) + 2;

    let mut local = RoomAwareness::new(local_id).unwrap();
    let mut remote = RoomAwareness::new(remote_id).unwrap();

    // Missing color must be rejected
    assert!(
        local
            .set_local_payload(&AwarenessPayload::new("A", ""), 0)
            .is_err()
    );

    let mut payload_a = AwarenessPayload::new("Alice", "#ff5500");
    payload_a.set_selection(
        "doc:home",
        vec![serde_json::json!({ "type": "text", "blockId": "p1" })],
    );
    let bytes_a = local.set_local_payload(&payload_a, 1_000).unwrap();

    let payload_b = AwarenessPayload::new("Bob", "#0088ff");
    let bytes_b = remote.set_local_payload(&payload_b, 1_000).unwrap();

    local.apply_update(&bytes_b, 1_000).unwrap();
    remote.apply_update(&bytes_a, 1_000).unwrap();

    assert_eq!(local.get_payload(remote_id).unwrap().color, "#0088ff");
    assert_eq!(remote.get_payload(local_id).unwrap().color, "#ff5500");

    // At +15s: local renews, remote not yet expired
    let t1 = local.tick(1_000 + AWARENESS_RENEW_INTERVAL_MS).unwrap();
    assert!(t1.renewed_local);
    assert!(t1.expired_clients.is_empty());
    assert!(t1.outbound_update.is_some());

    // At +30s: remote expires
    let t2 = local.tick(1_000 + AWARENESS_EXPIRE_TIMEOUT_MS).unwrap();
    assert_eq!(t2.expired_clients, vec![remote_id]);
    assert!(local.get_payload(remote_id).is_none());
}

proptest! {
    #[test]
    fn wire_binary_doc_frame_roundtrip(
        doc_id in "[a-zA-Z0-9:_-]{1,32}",
        step in 0u8..3,
        payload in proptest::collection::vec(any::<u8>(), 0..64),
    ) {
        let message = match step {
            0 => DocMessage::Step1(payload),
            1 => DocMessage::Step2(payload),
            _ => DocMessage::Update(payload),
        };
        let frame = RoomBinaryFrame::Doc { doc_id, message };
        let encoded = encode_binary_frame(&frame).unwrap();
        let decoded = decode_binary_frame(&encoded).unwrap();
        prop_assert_eq!(decoded, frame);
    }
}

#[tokio::test]
async fn room_hub_handshake_seed_cas_blobs_awareness_refcount_and_1000_step_fuzz() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr: SocketAddr = listener.local_addr().unwrap();
    let hub = RoomHub::new();
    let server = tokio::spawn(async move {
        axum::serve(listener, hub.router()).await.unwrap();
    });

    // 1. Healthz + Blob HTTP PUT/GET/DELETE
    let http = reqwest::Client::new();
    let health = http
        .get(format!("http://{addr}/healthz"))
        .send()
        .await
        .unwrap();
    assert!(health.status().is_success());

    let blob_url = format!("http://{addr}/api/collection/room-fuzz/blob/img-42");
    assert_eq!(http.get(&blob_url).send().await.unwrap().status(), 404);
    assert!(
        http.put(&blob_url)
            .header("content-type", "application/octet-stream")
            .body(vec![1u8, 2, 3, 4, 5])
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    let fetched = http
        .get(&blob_url)
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(&fetched[..], &[1u8, 2, 3, 4, 5]);
    assert!(
        http.delete(&blob_url)
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    assert_eq!(http.get(&blob_url).send().await.unwrap().status(), 404);

    // Verify >2 MiB image blob roundtrip (exceeds Axum's default 2 MiB body limit)
    let large_blob = vec![0xABu8; 3 * 1024 * 1024];
    let large_url = format!("http://{addr}/api/collection/room-fuzz/blob/img-3mib");
    assert!(
        http.put(&large_url)
            .header("content-type", "application/octet-stream")
            .body(large_blob.clone())
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );
    let fetched_large = http
        .get(&large_url)
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(fetched_large.len(), large_blob.len());
    assert_eq!(&fetched_large[..], &large_blob[..]);
    assert!(
        http.delete(&large_url)
            .send()
            .await
            .unwrap()
            .status()
            .is_success()
    );

    // 2. Seed-claim single-winner CAS + Awareness multi-connection refcount
    let ws_url = format!("ws://{addr}/native-sync/rooms/room-fuzz");
    let (mut ws1, _) = connect_async(&ws_url).await.unwrap();
    let (mut ws2, _) = connect_async(&ws_url).await.unwrap();
    let (mut ws3, _) = connect_async(&ws_url).await.unwrap();

    let claim = encode_control_frame(&RoomControlFrame::SeedClaim {
        key: "init".to_string(),
    })
    .unwrap();
    ws1.send(WsMsg::Text(claim.clone().into())).await.unwrap();
    let r1 = match ws1.next().await.unwrap().unwrap() {
        WsMsg::Text(t) => decode_control_frame(&t).unwrap(),
        other => panic!("unexpected: {other:?}"),
    };
    assert_eq!(
        r1,
        RoomControlFrame::SeedClaimResult {
            key: "init".to_string(),
            winner: true
        }
    );

    ws2.send(WsMsg::Text(claim.into())).await.unwrap();
    let r2 = match ws2.next().await.unwrap().unwrap() {
        WsMsg::Text(t) => decode_control_frame(&t).unwrap(),
        other => panic!("unexpected: {other:?}"),
    };
    assert_eq!(
        r2,
        RoomControlFrame::SeedClaimResult {
            key: "init".to_string(),
            winner: false
        }
    );

    // Same client_id announced on ws1 AND ws2; observer on ws3
    let shared_cid = (1u64 << 45) + 99;
    let mut aw_sender = RoomAwareness::new(shared_cid).unwrap();
    let aw_bytes = aw_sender
        .set_local_payload(&AwarenessPayload::new("DualConn", "#12aa34"), 0)
        .unwrap();
    let aw_frame = encode_binary_frame(&RoomBinaryFrame::Awareness(aw_bytes)).unwrap();
    ws1.send(WsMsg::Binary(aw_frame.clone().into()))
        .await
        .unwrap();
    ws2.send(WsMsg::Binary(aw_frame.into())).await.unwrap();

    let mut aw_observer = RoomAwareness::new((1u64 << 45) + 100).unwrap();
    if let Some(Ok(WsMsg::Binary(b))) = ws3.next().await
        && let RoomBinaryFrame::Awareness(payload) = decode_binary_frame(&b).unwrap()
    {
        aw_observer.apply_update(&payload, 10).unwrap();
    }
    assert!(aw_observer.get_payload(shared_cid).is_some());

    // Closing ws1 must NOT mark shared_cid offline because ws2 still holds it.
    ws1.close(None).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    // Closing ws2 MUST broadcast offline removal to ws3.
    ws2.close(None).await.unwrap();
    let offline_msg = tokio::time::timeout(std::time::Duration::from_secs(2), ws3.next())
        .await
        .expect("expected offline broadcast")
        .unwrap()
        .unwrap();
    if let WsMsg::Binary(b) = offline_msg
        && let RoomBinaryFrame::Awareness(payload) = decode_binary_frame(&b).unwrap()
    {
        aw_observer.apply_update(&payload, 20).unwrap();
    }
    assert!(aw_observer.get_payload(shared_cid).is_none());
    ws3.close(None).await.unwrap();

    // 3. 1,000-step deterministic seeded concurrent fuzz between two WorkspaceSessions over RoomHub
    let mut peer_a = WorkspaceSession::new("room-fuzz", (1u64 << 40) + 1).unwrap();
    let mut peer_b = WorkspaceSession::new("room-fuzz", (1u64 << 40) + 2).unwrap();
    peer_a.initialize_meta().unwrap();
    peer_a.create_page("doc:home", "Fuzz", 1).unwrap();
    peer_b.ensure_page("doc:home").unwrap();

    // Seed initial structure on peer_a
    {
        let p = peer_a.page_mut("doc:home").unwrap();
        p.add_block(
            "root",
            BlockSpec::Page {
                title: "Fuzz".to_string(),
            },
            None,
            None,
            0,
        )
        .unwrap();
        p.add_block("surface", BlockSpec::Surface, Some("root"), None, 1)
            .unwrap();
        p.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        for i in 0..4 {
            p.add_block(
                format!("p{i}"),
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: format!("seed-{i}"),
                },
                Some("note"),
                None,
                3 + i,
            )
            .unwrap();
        }
        p.add_surface_element(
            "surface",
            "shape-1",
            "a0",
            SurfaceElementSpec::Shape {
                shape_type: "rect".to_string(),
                xywh: "[0,0,100,100]".to_string(),
                seed: 7,
                filled: false,
                text: None,
            },
            10,
        )
        .unwrap();
    }

    async fn sync_doc(
        ws: &mut tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        page: &mut PageDocSession,
        doc_id: &str,
    ) {
        let mut state = DocSyncState::new(doc_id);
        let step1 = state.begin_pull(page.encode_state_vector_v1().unwrap());
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
                            page.apply_remote_update_v1(&diff).unwrap();
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
                    _ => {}
                }
            }
        };
        assert_eq!(state.phase(), DocSyncPhase::Synced);
        let diff_to_hub = page.encode_diff_v1(&hub_sv).unwrap();
        let rev_step2 = state.build_reverse_step2(diff_to_hub);
        ws.send(WsMsg::Binary(
            encode_binary_frame(&rev_step2).unwrap().into(),
        ))
        .await
        .unwrap();
        // Wait for hub Ready control frame
        loop {
            if let WsMsg::Text(t) = ws.next().await.unwrap().unwrap()
                && let Ok(RoomControlFrame::Ready { doc_id: d }) = decode_control_frame(&t)
                && d == doc_id
            {
                break;
            }
        }
    }

    let (mut sock_a, _) = connect_async(&ws_url).await.unwrap();
    let (mut sock_b, _) = connect_async(&ws_url).await.unwrap();
    sync_doc(
        &mut sock_a,
        peer_a.page_mut("doc:home").unwrap(),
        "doc:home",
    )
    .await;
    sync_doc(
        &mut sock_b,
        peer_b.page_mut("doc:home").unwrap(),
        "doc:home",
    )
    .await;

    let mut rng = ChaCha8Rng::seed_from_u64(0xB5_2026_1000);
    for step in 0..1_000u64 {
        let on_a = rng.random_bool(0.5);
        let page = if on_a {
            peer_a.page_mut("doc:home").unwrap()
        } else {
            peer_b.page_mut("doc:home").unwrap()
        };
        let target_block = format!("p{}", rng.random_range(0..4));
        let now_ms = 1_000 + step * 10;

        let commit = match rng.random_range(0..5u8) {
            0 => {
                let target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(&target_block)
                        .key("prop:text"),
                );
                let len = page.inner().read_text_len(&target).unwrap_or(0);
                let idx = if len == 0 {
                    0
                } else {
                    rng.random_range(0..=len)
                };
                let ch = format!("{}", (b'a' + (step % 26) as u8) as char);
                page.insert_text(&target_block, "prop:text", idx, &ch, now_ms)
                    .unwrap()
            }
            1 => {
                let target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(&target_block)
                        .key("prop:text"),
                );
                let len = page.inner().read_text_len(&target).unwrap_or(0);
                if len > 0 {
                    let idx = rng.random_range(0..len);
                    let del = rng.random_range(1..=(len - idx).min(3));
                    page.remove_text(&target_block, "prop:text", idx, del, now_ms)
                        .unwrap()
                } else {
                    None
                }
            }
            2 => {
                let target = y_octo::TypeTarget::Path(
                    y_octo::TypePath::root("blocks")
                        .key(&target_block)
                        .key("prop:text"),
                );
                let len = page.inner().read_text_len(&target).unwrap_or(0);
                if len > 0 {
                    let idx = rng.random_range(0..len);
                    let fmt_len = rng.random_range(1..=(len - idx).min(4));
                    let mut attrs = TextAttributes::new();
                    attrs.insert("bold".to_string(), Any::True);
                    page.format_text(&target_block, "prop:text", idx, fmt_len, attrs, now_ms)
                        .unwrap()
                } else {
                    None
                }
            }
            3 => {
                let new_idx = rng.random_range(0..4);
                page.reorder_child("note", &target_block, new_idx, now_ms)
                    .unwrap()
            }
            _ => {
                let x = rng.random_range(0..500);
                let y = rng.random_range(0..500);
                page.set_surface_element_field(
                    "surface",
                    "shape-1",
                    "xywh",
                    SessionValue::Any(Any::String(format!("[{x},{y},100,100]"))),
                    now_ms,
                )
                .unwrap()
            }
        };

        if let Some(c) = commit
            && !c.update.is_empty()
        {
            let frame = encode_binary_frame(&RoomBinaryFrame::Doc {
                doc_id: "doc:home".to_string(),
                message: DocMessage::Update(c.update),
            })
            .unwrap();
            if on_a {
                sock_a.send(WsMsg::Binary(frame.into())).await.unwrap();
            } else {
                sock_b.send(WsMsg::Binary(frame.into())).await.unwrap();
            }
        }

        // Simulate mid-flight disconnect & reconnect at step 500
        if step == 500 {
            sock_b.close(None).await.unwrap();
            let (reconn, _) = connect_async(&ws_url).await.unwrap();
            sock_b = reconn;
            sync_doc(
                &mut sock_b,
                peer_b.page_mut("doc:home").unwrap(),
                "doc:home",
            )
            .await;
        }
    }

    // Drain any in-flight messages and perform final bidirectional resync
    sock_a.close(None).await.unwrap();
    sock_b.close(None).await.unwrap();
    let (mut final_a, _) = connect_async(&ws_url).await.unwrap();
    let (mut final_b, _) = connect_async(&ws_url).await.unwrap();
    sync_doc(
        &mut final_a,
        peer_a.page_mut("doc:home").unwrap(),
        "doc:home",
    )
    .await;
    sync_doc(
        &mut final_b,
        peer_b.page_mut("doc:home").unwrap(),
        "doc:home",
    )
    .await;
    sync_doc(
        &mut final_a,
        peer_a.page_mut("doc:home").unwrap(),
        "doc:home",
    )
    .await;

    let sv_a = peer_a
        .page("doc:home")
        .unwrap()
        .encode_state_vector_v1()
        .unwrap();
    let sv_b = peer_b
        .page("doc:home")
        .unwrap()
        .encode_state_vector_v1()
        .unwrap();
    assert_eq!(
        StateVector::decode_v1(&sv_a).unwrap(),
        StateVector::decode_v1(&sv_b).unwrap(),
        "StateVectors must match after 1,000-step concurrent fuzz"
    );

    let json_a = peer_a.page("doc:home").unwrap().export_doc_json().unwrap();
    let json_b = peer_b.page("doc:home").unwrap().export_doc_json().unwrap();
    assert_eq!(
        json_a, json_b,
        "Normalized doc.json must match after 1,000-step fuzz"
    );

    let diff_ab = peer_a
        .page("doc:home")
        .unwrap()
        .encode_diff_v1(&sv_b)
        .unwrap();
    let diff_ba = peer_b
        .page("doc:home")
        .unwrap()
        .encode_diff_v1(&sv_a)
        .unwrap();
    assert!(
        peer_b
            .page_mut("doc:home")
            .unwrap()
            .apply_remote_update_v1(&diff_ab)
            .unwrap()
            .commits
            .is_empty(),
        "Applying diff_ab to converged peer_b must produce 0 commits"
    );
    assert!(
        peer_a
            .page_mut("doc:home")
            .unwrap()
            .apply_remote_update_v1(&diff_ba)
            .unwrap()
            .commits
            .is_empty(),
        "Applying diff_ba to converged peer_a must produce 0 commits"
    );

    final_a.close(None).await.unwrap();
    final_b.close(None).await.unwrap();
    server.abort();
}

#[tokio::test]
async fn room_hub_awareness_equal_clock_refcount_seed_promotion_and_blob_cors() {
    let hub = RoomHub::new();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, hub.router()).await.unwrap();
    });

    // 1. Blob CORS preflight (OPTIONS -> 204) and CORS headers on PUT/GET/DELETE.
    let http = reqwest::Client::new();
    let blob_url = format!("http://{addr}/api/collection/cors-room/blob/img-1");
    let preflight = http
        .request(reqwest::Method::OPTIONS, &blob_url)
        .send()
        .await
        .unwrap();
    assert_eq!(preflight.status(), reqwest::StatusCode::NO_CONTENT);
    assert_eq!(
        preflight
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("*")
    );
    assert!(
        preflight
            .headers()
            .get("access-control-allow-methods")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|m| m.contains("PUT") && m.contains("OPTIONS"))
    );
    assert_eq!(
        preflight
            .headers()
            .get("access-control-allow-headers")
            .and_then(|v| v.to_str().ok()),
        Some("Content-Type")
    );

    let put_resp = http
        .put(&blob_url)
        .header("content-type", "application/octet-stream")
        .body(vec![7u8, 8, 9])
        .send()
        .await
        .unwrap();
    assert!(put_resp.status().is_success());
    assert_eq!(
        put_resp
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("*")
    );

    let get_resp = http.get(&blob_url).send().await.unwrap();
    assert!(get_resp.status().is_success());
    assert_eq!(
        get_resp
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("*")
    );
    assert_eq!(get_resp.bytes().await.unwrap().as_ref(), &[7u8, 8, 9]);

    // 2. Equal-clock awareness announcement across two connections -> closing conn1 must keep
    //    conn2's state live for a fresh observer.
    let ws_url = format!("ws://{addr}/native-sync/rooms/room-hardening");
    let (mut conn1, _) = connect_async(&ws_url).await.unwrap();
    let (mut conn2, _) = connect_async(&ws_url).await.unwrap();

    let shared_cid = (1u64 << 46) + 77;
    let mut aw_sender = RoomAwareness::new(shared_cid).unwrap();
    let live_bytes = aw_sender
        .set_local_payload(&AwarenessPayload::new("SameClockPeer", "#3366ff"), 0)
        .unwrap();
    let live_frame = encode_binary_frame(&RoomBinaryFrame::Awareness(live_bytes)).unwrap();

    // Both connections send the EXACT same (client_id, clock) frame.
    conn1
        .send(WsMsg::Binary(live_frame.clone().into()))
        .await
        .unwrap();
    conn2.send(WsMsg::Binary(live_frame.into())).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    // Close conn1; conn2 still owns shared_cid so a fresh observer MUST see it live.
    conn1.close(None).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let (mut fresh_obs, _) = connect_async(&ws_url).await.unwrap();
    let initial_aw = tokio::time::timeout(std::time::Duration::from_secs(2), fresh_obs.next())
        .await
        .expect("fresh observer should receive live awareness snapshot")
        .unwrap()
        .unwrap();
    let mut obs_awareness = RoomAwareness::new((1u64 << 46) + 78).unwrap();
    if let WsMsg::Binary(b) = initial_aw
        && let RoomBinaryFrame::Awareness(payload) = decode_binary_frame(&b).unwrap()
    {
        obs_awareness.apply_update(&payload, 10).unwrap();
    }
    assert_eq!(
        obs_awareness.get_payload(shared_cid).map(|p| p.user.name),
        Some("SameClockPeer".to_string())
    );

    // Closing conn2 finally tombstones shared_cid and notifies fresh_obs.
    conn2.close(None).await.unwrap();
    let offline_aw = tokio::time::timeout(std::time::Duration::from_secs(2), fresh_obs.next())
        .await
        .expect("expected offline broadcast after last owner disconnects")
        .unwrap()
        .unwrap();
    if let WsMsg::Binary(b) = offline_aw
        && let RoomBinaryFrame::Awareness(payload) = decode_binary_frame(&b).unwrap()
    {
        obs_awareness.apply_update(&payload, 20).unwrap();
    }
    assert!(obs_awareness.get_payload(shared_cid).is_none());
    fresh_obs.close(None).await.unwrap();

    // 2b. Equal-clock live-to-null removal (how `y-protocols` expires a remote peer): an
    //     already-connected observer must receive it once the LAST owner releases the client.
    let expiry_ws_url = format!("ws://{addr}/native-sync/rooms/room-equal-clock-expiry");
    let (mut watcher, _) = connect_async(&expiry_ws_url).await.unwrap();
    let (mut owner_a, _) = connect_async(&expiry_ws_url).await.unwrap();
    let (mut owner_b, _) = connect_async(&expiry_ws_url).await.unwrap();

    let expiring_cid = (1u64 << 46) + 79;
    let mut expiring_sender = RoomAwareness::new(expiring_cid).unwrap();
    let expiring_live = encode_binary_frame(&RoomBinaryFrame::Awareness(
        expiring_sender
            .set_local_payload(&AwarenessPayload::new("ExpiringPeer", "#ff8a00"), 0)
            .unwrap(),
    ))
    .unwrap();
    let live_clock = expiring_sender
        .states()
        .get(&expiring_cid)
        .expect("local awareness state")
        .clock();
    let mut equal_clock_null = y_octo::Awareness::new(0);
    equal_clock_null.apply_update(y_octo::AwarenessStates::from([(
        expiring_cid,
        y_octo::AwarenessState::new(live_clock, "null".to_string()),
    )]));
    let equal_clock_null_frame = encode_binary_frame(&RoomBinaryFrame::Awareness(
        equal_clock_null
            .encode_update(Some(&[expiring_cid]))
            .unwrap(),
    ))
    .unwrap();

    owner_a
        .send(WsMsg::Binary(expiring_live.clone().into()))
        .await
        .unwrap();
    owner_b
        .send(WsMsg::Binary(expiring_live.into()))
        .await
        .unwrap();

    let mut watcher_awareness = RoomAwareness::new((1u64 << 46) + 80).unwrap();
    let live_seen = tokio::time::timeout(std::time::Duration::from_secs(2), watcher.next())
        .await
        .expect("connected observer should receive the live awareness broadcast")
        .unwrap()
        .unwrap();
    if let WsMsg::Binary(b) = live_seen
        && let RoomBinaryFrame::Awareness(payload) = decode_binary_frame(&b).unwrap()
    {
        watcher_awareness.apply_update(&payload, 10).unwrap();
    }
    assert_eq!(
        watcher_awareness
            .get_payload(expiring_cid)
            .map(|p| p.user.name),
        Some("ExpiringPeer".to_string())
    );

    // First owner releases at the same clock: owner_b still holds the client, nothing is sent.
    owner_a
        .send(WsMsg::Binary(equal_clock_null_frame.clone().into()))
        .await
        .unwrap();
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(120), watcher.next())
            .await
            .is_err(),
        "equal-clock removal must stay local while another owner keeps the client alive"
    );

    // Last owner releases at the same clock: the connected observer must be told.
    owner_b
        .send(WsMsg::Binary(equal_clock_null_frame.into()))
        .await
        .unwrap();
    let removal_seen = tokio::time::timeout(std::time::Duration::from_secs(2), watcher.next())
        .await
        .expect("connected observer should receive the equal-clock live-to-null removal")
        .unwrap()
        .unwrap();
    let WsMsg::Binary(removal_bytes) = removal_seen else {
        panic!("unexpected removal frame: {removal_seen:?}");
    };
    let RoomBinaryFrame::Awareness(removal_payload) = decode_binary_frame(&removal_bytes).unwrap()
    else {
        panic!("expected an awareness frame for the equal-clock removal");
    };
    let removal_event = watcher_awareness
        .apply_update(&removal_payload, 20)
        .unwrap();
    assert_eq!(removal_event.removed(), &[expiring_cid]);
    assert!(watcher_awareness.get_payload(expiring_cid).is_none());

    watcher.close(None).await.unwrap();
    owner_a.close(None).await.unwrap();
    owner_b.close(None).await.unwrap();

    // 3. Seed CAS FIFO waiter promotion on partial-seed disconnect.
    let seed_ws_url = format!("ws://{addr}/native-sync/rooms/room-seed-promote");
    let (mut s1, _) = connect_async(&seed_ws_url).await.unwrap();
    let (mut s2, _) = connect_async(&seed_ws_url).await.unwrap();

    let claim = encode_control_frame(&RoomControlFrame::SeedClaim {
        key: "seed:doc:home".to_string(),
    })
    .unwrap();
    s1.send(WsMsg::Text(claim.clone().into())).await.unwrap();
    let r1 = match s1.next().await.unwrap().unwrap() {
        WsMsg::Text(t) => decode_control_frame(&t).unwrap(),
        other => panic!("unexpected: {other:?}"),
    };
    assert_eq!(
        r1,
        RoomControlFrame::SeedClaimResult {
            key: "seed:doc:home".to_string(),
            winner: true
        }
    );

    // s2 claims while s1 is pending -> s2 is queued (no immediate reply).
    s2.send(WsMsg::Text(claim.clone().into())).await.unwrap();
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(80), s2.next())
            .await
            .is_err(),
        "waiter should stay queued while winner is still connected and seeding"
    );

    // s1 disconnects WITHOUT seeding doc:home -> s2 must be promoted to winner=true!
    s1.close(None).await.unwrap();
    let r2 = tokio::time::timeout(std::time::Duration::from_secs(2), s2.next())
        .await
        .expect("waiter should be promoted on winner disconnect")
        .unwrap()
        .unwrap();
    let r2 = match r2 {
        WsMsg::Text(t) => decode_control_frame(&t).unwrap(),
        other => panic!("unexpected: {other:?}"),
    };
    assert_eq!(
        r2,
        RoomControlFrame::SeedClaimResult {
            key: "seed:doc:home".to_string(),
            winner: true
        }
    );

    // s2 seeds doc:home with a usable affine:page root -> subsequent claimer s3 gets winner=false.
    let mut page = PageDocSession::new("doc:home", (1u64 << 46) + 90).unwrap();
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "Promoted".to_string(),
        },
        None,
        None,
        1,
    )
    .unwrap();
    let update = page.encode_update_v1().unwrap();
    let doc_frame = encode_binary_frame(&RoomBinaryFrame::Doc {
        doc_id: "doc:home".to_string(),
        message: DocMessage::Update(update),
    })
    .unwrap();
    s2.send(WsMsg::Binary(doc_frame.into())).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let (mut s3, _) = connect_async(&seed_ws_url).await.unwrap();
    s3.send(WsMsg::Text(claim.into())).await.unwrap();
    let r3 = match s3.next().await.unwrap().unwrap() {
        WsMsg::Text(t) => decode_control_frame(&t).unwrap(),
        other => panic!("unexpected: {other:?}"),
    };
    assert_eq!(
        r3,
        RoomControlFrame::SeedClaimResult {
            key: "seed:doc:home".to_string(),
            winner: false
        }
    );

    s2.close(None).await.unwrap();
    s3.close(None).await.unwrap();
    server.abort();
}
