//! Surgical PDF attachment single-block relayout and two-peer `RoomHub` SHA-256
//! picked-image blob upload/fetch verification tests.

use std::sync::Arc;

use blocksuite_playground_doc::{
    client_id_from_seed,
    schema::{BlockSpec, ParagraphType},
};
use ui::{point, px};

use crate::{
    DocState, HOME_PAGE_ID, PlaygroundTheme,
    block_flow::{
        PdfPageCount, PdfPageProvider, PdfPreviewPage, page_geometry, register_pdf_page_provider,
        rgba_pixels_to_render_image,
    },
    overlays::{ActiveSelection, OverlayEvent},
    room_client::RoomStatus,
};

use super::tests::MobileSession;

#[test]
fn pdf_attachment_render_and_page_flip_relayout_only_target_block() {
    struct ResetPdf;
    impl Drop for ResetPdf {
        fn drop(&mut self) {
            register_pdf_page_provider(None);
        }
    }
    let _provider_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let _reset = ResetPdf;

    struct TwoPageMockPdfProvider;
    impl PdfPageProvider for TwoPageMockPdfProvider {
        fn page_count(&self, _key: &str, _bytes: &[u8]) -> PdfPageCount {
            PdfPageCount::Ready(2)
        }
        fn render_pdf_page(
            &self,
            _key: &str,
            _bytes: &[u8],
            page_index: usize,
            _scale: f32,
        ) -> Option<PdfPreviewPage> {
            let shade = if page_index == 0 { 40_u8 } else { 180_u8 };
            let image = rgba_pixels_to_render_image(24, 16, &[shade; 24 * 16 * 4])?;
            Some(PdfPreviewPage {
                page_index: page_index.min(1),
                page_count: 2,
                image,
                width_pt: 240.0,
                height_pt: 160.0,
            })
        }
    }

    register_pdf_page_provider(Some(Arc::new(TwoPageMockPdfProvider)));
    let session = MobileSession::open(390, 844, PlaygroundTheme::Light);
    session.app.update(|cx| {
        session
            .window
            .update(cx, |v, _, cx| {
                v.state
                    .blobs
                    .insert("blob-pdf-1".into(), Arc::new(b"%PDF-mock-1".to_vec()));
                v.state
                    .blobs
                    .insert("blob-pdf-2".into(), Arc::new(b"%PDF-mock-2".to_vec()));
                let page = v.state.workspace.page_mut(HOME_PAGE_ID).unwrap();
                for (id, src) in [("pdf-att-1", "blob-pdf-1"), ("pdf-att-2", "blob-pdf-2")] {
                    page.add_block(
                        id,
                        BlockSpec::Attachment {
                            name: format!("{id}.pdf"),
                            size: 128,
                            mime_type: "application/pdf".into(),
                            source_id: src.into(),
                            embed: true,
                            caption: String::new(),
                        },
                        Some("showcase-note"),
                        Some(0),
                        9_200_000,
                    )
                    .unwrap();
                }
                v.doc_rev += 1;
                v.refresh_document();
                cx.notify();
            })
            .unwrap();
    });
    let _ = session.frame();

    // Flip ONLY `pdf-att-1` to page 2 (`delta = +1`): sibling paragraph & `pdf-att-2` must stay cached!
    session.overlay(OverlayEvent::AttachmentPdfPage {
        block_id: "pdf-att-1".into(),
        delta: 1,
    });
    let stats = session.app.update(|cx| {
        session
            .window
            .update(cx, |v, w, _| {
                let col_w = page_geometry(f32::from(w.viewport_size().width)).column_width;
                v.ensure_layout(col_w, w).unwrap().stats
            })
            .unwrap()
    });
    register_pdf_page_provider(None);

    assert_eq!(
        stats.laid_out, 1,
        "flipping one PDF attachment page must relayout ONLY that 1 attachment block, got {stats:?}"
    );
    assert!(
        stats.reused >= 2,
        "sibling paragraphs and second PDF attachment must be reused, got {stats:?}"
    );
}

#[test]
fn picked_image_uploads_sha256_blob_to_relay_and_renders_on_second_peer() {
    use ui::{AppContext as _, Application, HeadlessPlatform, WindowOptions, size};

    let runtime = crate::tests::relay_runtime();
    let addr = crate::tests::start_relay(&runtime);
    let room_name = "picked-image-sync";
    let mut seeder = crate::tests::relay_page_peer(room_name, client_id_from_seed(88));
    let _seeder_socket = crate::tests::join_as_peer(&runtime, addr, room_name, &mut seeder);

    let relay_url = format!("ws://{addr}");
    let make_peer = || {
        let platform = HeadlessPlatform::new(390, 844, 1.0);
        let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let cfg = crate::RoomConfig::new(room_name, Some(&relay_url));
        let win = app
            .update(|cx| {
                cx.open_window(
                    WindowOptions {
                        window_bounds: Some(ui::WindowBounds::Windowed(ui::Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(390.0), px(844.0)),
                        ))),
                        ..Default::default()
                    },
                    |_, cx| {
                        cx.new(|cx| {
                            crate::PlaygroundView::with_options(
                                crate::PlaygroundOptions {
                                    room: Some(cfg),
                                    ..Default::default()
                                },
                                cx,
                            )
                        })
                    },
                )
            })
            .unwrap();
        (platform, app, win)
    };

    let (plat_a, app_a, win_a) = make_peer();
    let (plat_b, app_b, win_b) = make_peer();

    let pump_both = || {
        for (plat, app, win) in [(&plat_a, &app_a, &win_a), (&plat_b, &app_b, &win_b)] {
            app.update(|cx| {
                win.update(cx, |v, _, cx| {
                    v.pump_room(cx);
                })
                .unwrap();
            });
            plat.run_until_parked();
        }
    };

    for _ in 0..300 {
        pump_both();
        let ready_a = app_a.update(|cx| {
            win_a
                .read_with(cx, |v, _| {
                    v.room_status() == Some(RoomStatus::Live)
                        && v.page_snapshot().is_some_and(|s| s.block("p-1").is_some())
                })
                .unwrap()
        });
        let ready_b = app_b.update(|cx| {
            win_b
                .read_with(cx, |v, _| {
                    v.room_status() == Some(RoomStatus::Live)
                        && v.page_snapshot().is_some_and(|s| s.block("p-1").is_some())
                })
                .unwrap()
        });
        if ready_a && ready_b {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }

    let png = super::tests::encode_test_png(12, 8);
    app_a.update(|cx| {
        win_a
            .update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::SetSelection(Some(ActiveSelection::caret("p-1", 0))),
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::InsertImageBytes {
                        bytes: png.clone(),
                        caption: "Synced photo".into(),
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
    });

    let mut peer_b_ready = false;
    for _ in 0..250 {
        plat_b.advance_clock(std::time::Duration::from_millis(600));
        app_b.update(|cx| {
            win_b
                .update(cx, |v, _, cx| {
                    v.tick_room(cx);
                    v.pump_room(cx);
                })
                .unwrap();
        });
        pump_both();
        peer_b_ready = app_b.update(|cx| {
            win_b
                .read_with(cx, |v, _| {
                    v.page_snapshot()
                        .and_then(|s| s.block("note").cloned())
                        .is_some_and(|note| {
                            note.children.iter().any(|c| match &c.content {
                                blocksuite_playground_doc::read::BlockContent::Image {
                                    source_id,
                                    caption,
                                    ..
                                } if caption == "Synced photo" => matches!(
                                    v.images.get(source_id),
                                    Some(crate::block_flow::ImageSlot::Ready(_))
                                ),
                                _ => false,
                            })
                        })
                })
                .unwrap()
        });
        if peer_b_ready {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }

    assert!(
        peer_b_ready,
        "second room peer must receive uploaded SHA-256 image blob and decode ImageSlot::Ready"
    );
}

#[test]
fn transient_503_blob_upload_retries_and_delivers_original_bytes_to_peer() {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use ui::{AppContext as _, Application, HeadlessPlatform, WindowOptions, size};

    let runtime = crate::tests::relay_runtime();
    let hub_addr = crate::tests::start_relay(&runtime);
    let room_name = "sync-503-room";
    let mut seeder = crate::tests::relay_page_peer(room_name, client_id_from_seed(77));
    let _seeder_socket = crate::tests::join_as_peer(&runtime, hub_addr, room_name, &mut seeder);

    // Fault-injecting TCP proxy: fails the FIRST `PUT` with `503 Service Unavailable`,
    // and forwards all WebSocket upgrades + subsequent `PUT`/`GET` requests to `hub_addr`.
    // Signals each completed PUT attempt over `put_tx` so the test advances deterministically
    // without polling `thread::sleep`.
    let put_attempts = Arc::new(AtomicUsize::new(0));
    let put_attempts_proxy = put_attempts.clone();
    let (put_tx, put_rx) = std::sync::mpsc::channel::<usize>();
    let proxy_addr = runtime.block_on(async move {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((mut client, _)) = listener.accept().await {
                let attempts = put_attempts_proxy.clone();
                let tx = put_tx.clone();
                tokio::spawn(async move {
                    let mut prefix = Vec::with_capacity(1024);
                    let mut tmp = [0_u8; 1024];
                    loop {
                        let Ok(n) = client.read(&mut tmp).await else {
                            return;
                        };
                        if n == 0 {
                            return;
                        }
                        prefix.extend_from_slice(&tmp[..n]);
                        if prefix.windows(4).any(|w| w == b"\r\n\r\n") || prefix.len() >= 4096 {
                            break;
                        }
                    }
                    let is_put = prefix.starts_with(b"PUT ");
                    if is_put {
                        let n = attempts.fetch_add(1, Ordering::SeqCst) + 1;
                        if n == 1 {
                            let _ = client
                                .write_all(
                                    b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                                )
                                .await;
                            let _ = client.shutdown().await;
                            let _ = tx.send(n);
                            return;
                        }
                        let Ok(mut upstream) = tokio::net::TcpStream::connect(hub_addr).await
                        else {
                            return;
                        };
                        if upstream.write_all(&prefix).await.is_err() {
                            return;
                        }
                        let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
                        let _ = tx.send(n);
                        return;
                    }
                    let Ok(mut upstream) = tokio::net::TcpStream::connect(hub_addr).await else {
                        return;
                    };
                    if upstream.write_all(&prefix).await.is_err() {
                        return;
                    }
                    let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
                });
            }
        });
        addr
    });

    let open_peer = |relay_url: String| {
        let platform = HeadlessPlatform::new(390, 844, 1.0);
        let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let cfg = crate::RoomConfig::new(room_name, Some(&relay_url));
        let win = app
            .update(|cx| {
                cx.open_window(
                    WindowOptions {
                        window_bounds: Some(ui::WindowBounds::Windowed(ui::Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(390.0), px(844.0)),
                        ))),
                        ..Default::default()
                    },
                    |_, cx| {
                        cx.new(|cx| {
                            crate::PlaygroundView::with_options(
                                crate::PlaygroundOptions {
                                    room: Some(cfg),
                                    ..Default::default()
                                },
                                cx,
                            )
                        })
                    },
                )
            })
            .unwrap();
        (platform, app, win)
    };

    let (plat_a, app_a, win_a) = open_peer(format!("ws://{proxy_addr}"));
    let (plat_b, app_b, win_b) = open_peer(format!("ws://{hub_addr}"));

    let pump_both = || {
        for (plat, app, win) in [(&plat_a, &app_a, &win_a), (&plat_b, &app_b, &win_b)] {
            app.update(|cx| {
                win.update(cx, |v, _, cx| {
                    v.pump_room(cx);
                })
                .unwrap();
            });
            plat.run_until_parked();
        }
    };

    let mut both_ready = false;
    for _ in 0..1500 {
        pump_both();
        both_ready = [(&app_a, &win_a), (&app_b, &win_b)]
            .into_iter()
            .all(|(app, win)| {
                app.update(|cx| {
                    win.read_with(cx, |v, _| {
                        v.room_status() == Some(RoomStatus::Live)
                            && v.page_snapshot().is_some_and(|s| s.block("p-1").is_some())
                    })
                    .unwrap()
                })
            });
        if both_ready {
            break;
        }
        let _ = put_rx.recv_timeout(std::time::Duration::from_millis(10));
    }
    assert!(both_ready, "both peers must reach Live room status");

    let png = super::tests::encode_test_png(10, 6);
    app_a.update(|cx| {
        win_a
            .update(cx, |v, w, cx| {
                v.dispatch_overlay(
                    OverlayEvent::SetSelection(Some(ActiveSelection::caret("p-1", 0))),
                    w,
                    cx,
                );
                v.dispatch_overlay(
                    OverlayEvent::InsertImageBytes {
                        bytes: png.clone(),
                        caption: "Recovered after 503".into(),
                    },
                    w,
                    cx,
                );
            })
            .unwrap();
    });

    // Wait deterministically for the initial 503 attempt via channel, then step the
    // scheduler clock past the 4 s retry cap while parking on channel timeouts so async
    // Tokio PUT/GET tasks complete without busy-spinning CPU cores.
    let first_attempt = put_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .expect("initial PUT attempt must reach fault-injecting proxy");
    assert_eq!(first_attempt, 1);

    let mut recovered_on_b = false;
    let mut upload_queue_empty = false;
    for _ in 0..1500 {
        for (plat, app, win) in [(&plat_a, &app_a, &win_a), (&plat_b, &app_b, &win_b)] {
            app.update(|cx| {
                win.update(cx, |v, _, cx| {
                    v.pump_room(cx);
                })
                .unwrap();
            });
            plat.advance_clock(std::time::Duration::from_millis(4_100));
            app.update(|cx| {
                win.update(cx, |v, _, cx| {
                    v.tick_room(cx);
                    v.pump_room(cx);
                })
                .unwrap();
            });
            plat.run_until_parked();
        }
        upload_queue_empty = app_a.update(|cx| {
            win_a
                .read_with(cx, |v, _| v.blob_uploads.is_empty())
                .unwrap()
        });
        recovered_on_b = app_b.update(|cx| {
            win_b
                .read_with(cx, |v, _| {
                    v.page_snapshot()
                        .and_then(|s| s.block("note").cloned())
                        .is_some_and(|note| {
                            note.children.iter().any(|c| match &c.content {
                                blocksuite_playground_doc::read::BlockContent::Image {
                                    source_id,
                                    caption,
                                    ..
                                } if caption == "Recovered after 503" => {
                                    matches!(
                                        v.images.get(source_id),
                                        Some(crate::block_flow::ImageSlot::Ready(_))
                                    ) && v
                                        .state
                                        .blobs
                                        .get(source_id)
                                        .is_some_and(|b| b.as_slice() == png.as_slice())
                                }
                                _ => false,
                            })
                        })
                })
                .unwrap()
        });
        if recovered_on_b && upload_queue_empty && put_attempts.load(Ordering::SeqCst) >= 2 {
            break;
        }
        let _ = put_rx.recv_timeout(std::time::Duration::from_millis(10));
    }

    assert!(
        put_attempts.load(Ordering::SeqCst) >= 2,
        "uploader must retry after initial 503 (attempts={})",
        put_attempts.load(Ordering::SeqCst)
    );
    assert!(
        recovered_on_b,
        "second peer must fetch exact original PNG bytes once uploader recovers from initial 503"
    );
    assert!(
        upload_queue_empty,
        "blob_uploads must clear once retry succeeds"
    );
}

#[test]
fn legacy_33mib_bmp_decodes_from_relay_while_picker_admission_caps_at_32mib() {
    // 3000 x 2890 x 4 bytes = 34,680,000 bytes + 54-byte BMP header = 34,680,054 bytes (~33.07 MiB).
    let width: u32 = 3000;
    let height: u32 = 2890;
    let pixel_bytes = (width as usize) * (height as usize) * 4;
    let file_size = 54 + pixel_bytes;
    assert!(file_size > 32 * 1024 * 1024 && file_size <= 64 * 1024 * 1024);

    let mut bmp = vec![0_u8; file_size];
    bmp[0..2].copy_from_slice(b"BM");
    bmp[2..6].copy_from_slice(&(file_size as u32).to_le_bytes());
    bmp[10..14].copy_from_slice(&54_u32.to_le_bytes());
    bmp[14..18].copy_from_slice(&40_u32.to_le_bytes());
    bmp[18..22].copy_from_slice(&(width as i32).to_le_bytes());
    bmp[22..26].copy_from_slice(&(height as i32).to_le_bytes());
    bmp[26..28].copy_from_slice(&1_u16.to_le_bytes());
    bmp[28..30].copy_from_slice(&32_u16.to_le_bytes());
    bmp[34..38].copy_from_slice(&(pixel_bytes as u32).to_le_bytes());
    for px_chunk in bmp[54..54 + 4096].chunks_exact_mut(4) {
        px_chunk.copy_from_slice(&[0x40, 0x80, 0xC0, 0xFF]);
    }

    assert!(
        crate::block_flow::decode_image(&bmp).is_some(),
        "existing 33 MiB BMP blob within relay's 64 MiB limit must decode cleanly"
    );

    let s = super::tests::MobileSession::open(390, 844, PlaygroundTheme::Light);
    let initial_children = s
        .view(|v| {
            v.page_snapshot()
                .and_then(|snap| snap.block("showcase-note"))
                .map(|n| n.children.len())
        })
        .unwrap();
    s.overlay(OverlayEvent::SetSelection(Some(ActiveSelection::caret(
        "showcase-p1",
        0,
    ))));
    s.overlay(OverlayEvent::InsertImageBytes {
        bytes: bmp,
        caption: "Oversized pick".into(),
    });
    let after_children = s
        .view(|v| {
            v.page_snapshot()
                .and_then(|snap| snap.block("showcase-note"))
                .map(|n| n.children.len())
        })
        .unwrap();
    assert_eq!(
        after_children, initial_children,
        "picker admission must continue rejecting > 32 MiB uploads"
    );
}

#[test]
fn surface_ref_relayouts_single_block_on_whiteboard_edit_and_clips_under_edgeless_zoom() {
    use blocksuite_playground_doc::schema::SurfaceElementSpec;

    let s = super::tests::MobileSession::open(800, 640, PlaygroundTheme::Light);
    let mut state = DocState::new("surf-ref-test", 123).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "SurfaceRef Parity", 1)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "SurfaceRef Parity".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surf", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        page.add_block(
            "frame-1",
            BlockSpec::Frame {
                title: "Initial Frame".into(),
                xywh: Some("[0,0,400,200]".into()),
                presentation_index: Some("a0".into()),
            },
            Some("surf"),
            None,
            3,
        )
        .unwrap();
        page.add_surface_element(
            "surf",
            "shape-red",
            "a1",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[40,30,320,140]".into(),
                seed: 42,
                filled: true,
                text: None,
            },
            4,
        )
        .unwrap();
        page.set_surface_element_field(
            "surf",
            "shape-red",
            "fillColor",
            y_octo::SessionValue::Any(y_octo::Any::String("#e53935".into())),
            4,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note {
                xywh: Some("[600,320,448,360]".into()),
            },
            Some("root"),
            None,
            5,
        )
        .unwrap();
        page.add_block(
            "p-before",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Sibling before".into(),
            },
            Some("note"),
            None,
            6,
        )
        .unwrap();
        page.add_block(
            "sref-1",
            BlockSpec::SurfaceRef {
                reference: "frame-1".into(),
                ref_flavour: "affine:frame".into(),
                caption: String::new(),
            },
            Some("note"),
            None,
            7,
        )
        .unwrap();
        page.add_block(
            "p-after",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Sibling after".into(),
            },
            Some("note"),
            None,
            8,
        )
        .unwrap();
    }
    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let _ = s.frame();

    let render_window_image = || {
        s.app
            .update(|cx| {
                s.window
                    .update(cx, |_, window, _| window.render_to_image())
                    .unwrap()
            })
            .expect("render image")
    };

    // Mutate the referenced whiteboard shape color + frame title while staying in Page mode:
    // ONLY `sref-1` (`laid_out == 1`) must relayout, sibling paragraphs must hit cache (`reused >= 2`),
    // and the card title + rendered pixels must update immediately!
    let page_img_before = render_window_image();
    s.edit(|page| {
        page.set_block_title_text("frame-1", "Renamed Architecture Frame", 10)
            .unwrap();
        page.set_surface_element_field(
            "surf",
            "shape-red",
            "fillColor",
            y_octo::SessionValue::Any(y_octo::Any::String("#1e88e5".into())),
            11,
        )
        .unwrap();
    });
    let _ = s.frame();
    let (stats, card_plain) = s.view(|v| {
        let layout = v.flow_layout().unwrap();
        let plain = layout
            .blocks
            .iter()
            .find(|b| b.block_id == "sref-1")
            .unwrap()
            .body
            .plain
            .clone();
        (layout.stats, plain)
    });
    assert_eq!(
        stats.laid_out, 1,
        "whiteboard shape/frame edit must relayout ONLY the SurfaceRef block, got {stats:?}"
    );
    assert!(
        stats.reused >= 2,
        "sibling paragraphs must reuse cached bodies"
    );
    assert_eq!(card_plain, "Renamed Architecture Frame");
    let page_img_after = render_window_image();
    assert_ne!(
        page_img_before.as_raw(),
        page_img_after.as_raw(),
        "SurfaceRef thumbnail pixels must update when referenced shape fillColor changes"
    );

    // Switch to Edgeless mode with camera pan & zoom != 1.0 (`0.55x`) so `note` sits shifted
    // away from its world `[600, 320]` coords: `Prim::Surface` inside `note` MUST clip via
    // `with_local_paint_mask` so the blue `#1e88e5` shape inside `sref-1` renders visibly!
    s.app.update(|cx| {
        s.window
            .update(cx, |v, w, cx| {
                v.set_mode(crate::PlaygroundMode::Edgeless, w, cx);
                v.edgeless.camera =
                    blocksuite_editor::edgeless::EdgelessCamera::new(500.0, 220.0, 0.55);
                v.edgeless.camera_initialized = true;
                cx.notify();
            })
            .unwrap();
    });
    let _ = s.frame();
    let edgeless_img = render_window_image();
    let dpr = 1.0_f32;
    // Note world `[600, 320]` at camera `(500, 220, 0.55)` starts at screen `x = (600-500)*0.55 = 55`,
    // `y = 53 + (320-220)*0.55 = 108` (well away from raw world `[600, 320]`!).
    // Scan the note's screen region `[40..340] x [100..360]` for the `#1e88e5` blue shape inside `sref-1`.
    let w_px = edgeless_img.width();
    let raw = edgeless_img.as_raw();
    let mut blue_pixels_in_note = 0usize;
    for py in ((100.0 * dpr) as u32)..((360.0 * dpr) as u32).min(edgeless_img.height()) {
        for px_x in ((40.0 * dpr) as u32)..((340.0 * dpr) as u32).min(w_px) {
            let idx = ((py * w_px + px_x) * 4) as usize;
            // BGRA or RGBA check: blue channel dominant (`#1e88e5` -> R=30, G=136, B=229).
            let (c0, c1, c2) = (raw[idx], raw[idx + 1], raw[idx + 2]);
            let is_blue =
                (c2 >= 180 && c1 >= 90 && c0 <= 80) || (c0 >= 180 && c1 >= 90 && c2 <= 80);
            if is_blue {
                blue_pixels_in_note += 1;
            }
        }
    }
    assert!(
        blue_pixels_in_note >= 100,
        "SurfaceRef inside Edgeless Note at 0.55x zoom must render its shape pixels (found {blue_pixels_in_note})"
    );
    if let Ok(png_path) = std::env::var("EDGELESS_SURFACE_REF_PNG") {
        s.save_png(
            std::path::Path::new(&png_path),
            "edgeless-surface-ref-055x-zoom",
        );
    }
}
