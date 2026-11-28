//! Deterministic L3 integration tests covering multi-document workspace switching,
//! `@` `WorkspaceDocDirectory` search/create/jump, Keychain/DataStore auth hydration +
//! `SpaceSync` bidirectional room push/pull + offline queue replay, and `blobs` image/attachment
//! ingestion with single-step Undo.

use affine_client::{
    BlobUploadState, DocQueryCancelToken, DocQueryRequest, EditorDocMode, HostKind,
    MemoryHostBridge, NativeAuthPlatform, PickedMediaInput, PickedMediaKind, WorkspaceSession,
    WorkspaceSyncStatus,
};
use affine_store::sync::SpaceSyncEvent;
use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
};

fn encode_base64_std(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = if chunk.len() > 1 {
            u32::from(chunk[1])
        } else {
            0
        };
        let b2 = if chunk.len() > 2 {
            u32::from(chunk[2])
        } else {
            0
        };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3F) as usize] as char
        } else {
            '='
        });
    }
    out
}

fn minimal_png_bytes(width: u32, height: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(24);
    out.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    out.extend_from_slice(&13u32.to_be_bytes());
    out.extend_from_slice(b"IHDR");
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&height.to_be_bytes());
    out
}

#[test]
fn multi_doc_switching_at_directory_auth_spacesync_and_blob_undo_pipeline() {
    let mut host = MemoryHostBridge::new(HostKind::Native, "inst-s7");
    let mut session = WorkspaceSession::new(
        "ws-s7",
        "u-darksky",
        101,
        HostKind::Native,
        "affine-cloud",
        "https://app.affine.pro",
        1_000,
    )
    .unwrap();

    // 1. Hydrate native Android DataStore JWT credentials via HostBridge.
    let android_json = r#"{"version":1,"tokenType":"Bearer","accessToken":"jwt-s7-live","accessExpiresAt":1795622400000,"refreshToken":"rt-s7","refreshExpiresAt":"2026-12-01T00:00:00Z","session":{"id":"sess-s7","absoluteExpiresAt":"2027-01-01T00:00:00Z"}}"#;
    host.seed_credential(session.auth().credential_key(), android_json);
    assert!(
        session
            .hydrate_auth(&host, NativeAuthPlatform::Android)
            .unwrap()
    );
    assert_eq!(
        session.auth().native_tokens().unwrap().access_token,
        "jwt-s7-live"
    );

    // 2. Create two documents while offline -> queued in SpaceSync offline queue.
    let (doc_a, _) = session
        .create_document(
            "Architecture Spec",
            EditorDocMode::Page,
            Some("op-a"),
            2_000,
        )
        .unwrap();
    let (doc_b, _) = session
        .create_document("Sync Protocol", EditorDocMode::Page, Some("op-b"), 2_100)
        .unwrap();
    assert_ne!(doc_a.id, doc_b.id);
    assert!(session.sync_engine().offline_queue().len() >= 2);
    assert!(matches!(
        session.sync_status(),
        WorkspaceSyncStatus::Syncing { pending_updates } if pending_updates >= 2
    ));

    // 3. Millisecond document switching & `@` WorkspaceDocDirectory search.
    session.open_document(doc_a.id.as_str()).unwrap();
    assert_eq!(session.active_doc_id(), Some(doc_a.id.as_str()));
    let query_page = session
        .query_linked_docs(&DocQueryRequest {
            query: "Sync".into(),
            limit: 10,
            cursor: None,
            cancel: DocQueryCancelToken::default(),
        })
        .unwrap();
    assert_eq!(query_page.items.len(), 1);
    assert_eq!(query_page.items[0].doc.id, doc_b.id);

    // Jump to the `@` matched doc.
    session
        .open_document(query_page.items[0].doc.id.as_str())
        .unwrap();
    assert_eq!(session.active_doc_id(), Some(doc_b.id.as_str()));

    // 4. Ingest an image + an attachment into `doc_a`, verify metadata + single-step Undo.
    session.open_document(doc_a.id.as_str()).unwrap();
    let img_input = PickedMediaInput {
        filename: "diagram.png".into(),
        mime_type: "image/png".into(),
        bytes: minimal_png_bytes(800, 600),
        dimensions: None,
        caption: "System diagram".into(),
    };
    let inserted_img = session
        .ingest_picked_media(doc_a.id.as_str(), "note-1", None, &img_input, 3_000)
        .unwrap();
    assert_eq!(inserted_img.blob.kind, PickedMediaKind::Image);
    assert_eq!(inserted_img.blob.dimensions, Some((800, 600)));
    assert_eq!(inserted_img.blob.upload_state, BlobUploadState::Queued);
    assert_eq!(
        session.blob_bytes(&inserted_img.blob.key),
        Some(img_input.bytes.as_slice())
    );

    let att_input = PickedMediaInput {
        filename: "spec.pdf".into(),
        mime_type: "application/pdf".into(),
        bytes: b"%PDF-1.7 hello".to_vec(),
        dimensions: None,
        caption: String::new(),
    };
    let inserted_att = session
        .ingest_picked_media(doc_a.id.as_str(), "note-1", None, &att_input, 3_500)
        .unwrap();
    assert_eq!(inserted_att.blob.kind, PickedMediaKind::Attachment);
    assert_eq!(inserted_att.blob.byte_size, att_input.bytes.len());

    let snap_with_media = session.doc_snapshot(doc_a.id.as_str()).unwrap();
    assert!(matches!(
        snap_with_media
            .block(&inserted_img.block_id)
            .map(|b| &b.content),
        Some(BlockContent::Image { .. })
    ));
    assert!(matches!(
        snap_with_media
            .block(&inserted_att.block_id)
            .map(|b| &b.content),
        Some(BlockContent::Attachment { .. })
    ));

    // Single-step Undo removes the attachment while keeping the image intact.
    assert!(
        session
            .undo_doc(doc_a.id.as_str(), 4_000)
            .unwrap()
            .is_some()
    );
    let snap_after_undo1 = session.doc_snapshot(doc_a.id.as_str()).unwrap();
    assert!(snap_after_undo1.block(&inserted_att.block_id).is_none());
    assert!(snap_after_undo1.block(&inserted_img.block_id).is_some());

    // Second single-step Undo removes the image block as well.
    assert!(
        session
            .undo_doc(doc_a.id.as_str(), 4_500)
            .unwrap()
            .is_some()
    );
    let snap_after_undo2 = session.doc_snapshot(doc_a.id.as_str()).unwrap();
    assert!(snap_after_undo2.block(&inserted_img.block_id).is_none());

    // 5. Connect SpaceSync over WebSocket, replay offline queue, and receive a remote broadcast.
    let ws_url = "wss://app.affine.pro/socket.io/?EIO=4&transport=websocket";
    session.connect_sync(&mut host, ws_url, 5_000).unwrap();
    assert_eq!(session.sync_status(), WorkspaceSyncStatus::Connecting);
    session.on_ws_open(&mut host, ws_url, 5_050).unwrap();
    session
        .on_ws_text(
            &mut host,
            ws_url,
            r#"0{"sid":"eio-s7","upgrades":[],"pingInterval":25000,"pingTimeout":20000}"#,
            5_100,
        )
        .unwrap();
    session
        .on_ws_text(&mut host, ws_url, r#"40{"sid":"sio-s7"}"#, 5_150)
        .unwrap();
    let join_events = session
        .on_ws_text(
            &mut host,
            ws_url,
            r#"430[{"data":{"clientId":"c-s7","success":true,"protocolVersion":1}}]"#,
            5_200,
        )
        .unwrap();
    assert!(
        join_events
            .iter()
            .any(|e| matches!(e, SpaceSyncEvent::Joined { .. }))
    );

    // Simulate a remote collaborator editing `doc_b` and broadcasting via `space:broadcast-doc-updates`.
    let mut remote_peer = PageDocSession::new(doc_b.id.as_str(), 999).unwrap();
    let base_b = session
        .open_document(doc_b.id.as_str())
        .unwrap()
        .encode_update_v1()
        .unwrap();
    remote_peer.apply_remote_update_v1(&base_b).unwrap();
    remote_peer
        .add_block(
            "remote-p-1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Synced from remote peer".into(),
            },
            Some("note-1"),
            None,
            5_300,
        )
        .unwrap();
    let remote_update = remote_peer.encode_update_v1().unwrap();
    let broadcast_frame = format!(
        r#"42["space:broadcast-doc-updates",{{"spaceType":"workspace","spaceId":"ws-s7","docId":"{}","updates":["{}"],"timestamp":5300,"editor":"peer-2"}}]"#,
        doc_b.id.as_str(),
        encode_base64_std(&remote_update)
    );
    let remote_events = session
        .on_ws_text(&mut host, ws_url, &broadcast_frame, 5_350)
        .unwrap();
    assert!(
        remote_events
            .iter()
            .any(|e| matches!(e, SpaceSyncEvent::RemoteDocUpdates { .. }))
    );
    let synced_b = session.doc_snapshot(doc_b.id.as_str()).unwrap();
    assert!(synced_b.block("remote-p-1").is_some());
}

#[cfg(not(target_family = "wasm"))]
#[tokio::test]
async fn sqlite_reopen_same_client_id_rotates_and_writes_cleanly() {
    use affine_client::SqliteWorkspaceStore;
    let base_dir =
        std::env::temp_dir().join(format!("affine-s7-client-id-reopen-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base_dir);
    std::fs::create_dir_all(&base_dir).unwrap();

    let fixed_client_id = 42_424_242u64;
    let doc_id = {
        let store = SqliteWorkspaceStore::open(&base_dir, "workspace", "local", "ws-reopen")
            .await
            .unwrap();
        let mut session = store
            .load_workspace_session(
                "u-reopen",
                fixed_client_id,
                HostKind::Native,
                "local",
                "https://app.affine.pro",
                1_000,
            )
            .await
            .unwrap();
        let (doc, pending) = session
            .create_document("Same Client Reopen", EditorDocMode::Page, None, 1_100)
            .unwrap();
        store
            .persist_pending_updates(&pending, None, 1_100)
            .await
            .unwrap();
        store.checkpoint().await.unwrap();
        store.close().await;
        doc.id.as_str().to_string()
    };

    // Reopen the exact same SQLite workspace with the exact same `client_id`.
    let store2 = SqliteWorkspaceStore::open(&base_dir, "workspace", "local", "ws-reopen")
        .await
        .unwrap();
    let mut page = store2
        .load_doc_session(&doc_id, fixed_client_id)
        .await
        .unwrap()
        .expect("reloaded doc session");

    // Writing a new block after reopen must succeed without client_id collision error.
    page.add_block(
        "after-reopen-p",
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: "Written cleanly after same-client_id reopen".into(),
        },
        Some("note-1"),
        None,
        2_000,
    )
    .expect("subsequent write after same-client_id reopen must succeed");
    let snap = page.read_page_snapshot().unwrap();
    assert!(snap.block("after-reopen-p").is_some());

    store2.close().await;
    let _ = std::fs::remove_dir_all(&base_dir);
}
