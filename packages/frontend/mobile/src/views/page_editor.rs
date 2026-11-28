//! Live [`playground::PlaygroundView`] host bridge for the mobile `Page` route.
//!
//! Hydrates the active workspace document from its authoritative Yjs V1 CRDT update bytes into a
//! real editable `Entity<PlaygroundView>` with `hide_chrome = true`, registers a re-entrancy-safe
//! `cx.observe` writeback back into [`MobileAppState`], and handles media ingestion dynamically.

use std::{cell::RefCell, rc::Rc, sync::Arc};

use affine_client::{PickedMediaInput, PickedMediaKind, ingest_media_into_doc_session};
use blocksuite_playground_doc::{
    read::BlockContent,
    schema::{BlockSpec, ParagraphType},
    session::WorkspaceSession as DocWorkspaceSession,
};
use playground::{
    FormFactor, PlaygroundMode, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    room_client::DocState,
};
use ui::{Context, Entity, prelude::*};
use ui_tokens::ThemeMode;

use super::page_directory::{
    EditorShellEvent, MobileDirShared, MobileShellDocDirectory, drain_editor_events,
    sync_directory_snapshot,
};
use crate::{
    state::{MobileAppState, MobileDocBlock, MobileDocRecord},
    workspace_bridge::blocks_from_snapshot,
};

/// Build a deterministic lightweight solid-accent PNG for showcase image blocks that do not
/// carry external blob bytes, so `BlockFlow` renders a crisp image preview without panicking.
#[cfg(not(target_family = "wasm"))]
fn deterministic_preview_png(width: u32, height: u32) -> Vec<u8> {
    let w = width.clamp(16, 128);
    let h = height.clamp(16, 96);
    let mut img = image::RgbaImage::new(w, h);
    for (x, y, px) in img.enumerate_pixels_mut() {
        let fx = (x as f32) / (w as f32);
        let fy = (y as f32) / (h as f32);
        let r = (36.0 + 70.0 * fx) as u8;
        let g = (118.0 + 62.0 * fy) as u8;
        let b = (218.0 + 28.0 * (1.0 - fx)) as u8;
        *px = image::Rgba([r, g, b, 255]);
    }
    let mut out = Vec::new();
    let _ = image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png);
    out
}

#[cfg(target_family = "wasm")]
fn deterministic_preview_png(_width: u32, _height: u32) -> Vec<u8> {
    Vec::new()
}

/// Populate `DocState` from `doc` inside a real `PageDocSession` with a clean undo stack.
pub(super) fn load_doc_into_playground_state(
    doc_state: &mut DocState,
    ws_id: &str,
    doc: &MobileDocRecord,
    crdt_update: Option<&[u8]>,
) {
    let client_id = doc_state.awareness.local_client_id();
    let Ok(mut ws) = DocWorkspaceSession::new(ws_id, client_id) else {
        return;
    };
    let now_i64 = doc.updated_at_ms.max(1);
    let now_ms = now_i64 as u64;
    let _ = ws.create_page(&doc.id, &doc.title, now_i64);
    if let Ok(page) = ws.ensure_page(&doc.id) {
        if let Some(update) = crdt_update
            && !update.is_empty()
        {
            let _ = page.apply_remote_update_v1(update);
            if page.inner().client_required() {
                #[cfg(not(target_family = "wasm"))]
                let next_id = blocksuite_playground_doc::random_client_id();
                #[cfg(target_family = "wasm")]
                let next_id = blocksuite_playground_doc::client_id_from_seed(
                    client_id
                        .wrapping_mul(6_364_136_223_846_793_005)
                        .wrapping_add(1),
                );
                page.inner_mut().set_client(next_id);
            }
            for block in &doc.blocks {
                if let MobileDocBlock::Image {
                    blob_key,
                    width,
                    height,
                    ..
                } = block
                    && !doc_state.blobs.contains_key(blob_key)
                    && !blob_key.is_empty()
                {
                    let png = deterministic_preview_png(*width, *height);
                    if !png.is_empty() {
                        doc_state.blobs.insert(blob_key.clone(), Arc::new(png));
                    }
                }
            }
        } else {
            let _ = page.add_block(
                "page-root",
                BlockSpec::Page {
                    title: doc.title.clone(),
                },
                None,
                None,
                now_ms,
            );
            let _ = page.add_block(
                "note-root",
                BlockSpec::Note { xywh: None },
                Some("page-root"),
                None,
                now_ms,
            );
            if doc.blocks.is_empty() {
                let _ = page.add_block(
                    "body-p-0",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: doc.body_preview.clone(),
                    },
                    Some("note-root"),
                    None,
                    now_ms,
                );
            } else {
                for block in &doc.blocks {
                    match block {
                        MobileDocBlock::Paragraph { id, text } => {
                            let _ = page.add_block(
                                id,
                                BlockSpec::Paragraph {
                                    paragraph_type: ParagraphType::Text,
                                    text: text.clone(),
                                },
                                Some("note-root"),
                                None,
                                now_ms,
                            );
                        }
                        MobileDocBlock::Image {
                            id,
                            blob_key,
                            caption,
                            width,
                            height,
                            ..
                        } => {
                            let _ = page.add_block(
                                id,
                                BlockSpec::Image {
                                    source_id: blob_key.clone(),
                                    caption: caption.clone(),
                                    width: f64::from(*width),
                                    height: f64::from(*height),
                                    xywh: None,
                                },
                                Some("note-root"),
                                None,
                                now_ms,
                            );
                            if !doc_state.blobs.contains_key(blob_key) && !blob_key.is_empty() {
                                let png = deterministic_preview_png(*width, *height);
                                if !png.is_empty() {
                                    doc_state.blobs.insert(blob_key.clone(), Arc::new(png));
                                }
                            }
                        }
                        MobileDocBlock::Attachment {
                            id,
                            blob_key,
                            name,
                            mime_type,
                            byte_size,
                            ..
                        } => {
                            let _ = page.add_block(
                                id,
                                BlockSpec::Attachment {
                                    name: name.clone(),
                                    size: *byte_size as i64,
                                    mime_type: mime_type.clone(),
                                    source_id: blob_key.clone(),
                                    caption: String::new(),
                                    embed: false,
                                },
                                Some("note-root"),
                                None,
                                now_ms,
                            );
                        }
                    }
                }
            }
        }
        let history = page.undo_stack_id();
        let _ = page.inner_mut().clear_stack_history(history, true, true);
    }
    doc_state.workspace = ws;
}

/// Create the embedded `Entity<PlaygroundView>` configured for the mobile shell.
pub(super) fn create_mobile_playground(
    theme: ThemeMode,
    viewport_w: f32,
    readonly: bool,
    shared: Rc<RefCell<MobileDirShared>>,
    cx: &mut Context<super::MobileShellView>,
) -> Entity<PlaygroundView> {
    let form_factor = if viewport_w >= 720.0 {
        FormFactor::Tablet
    } else {
        FormFactor::Phone
    };
    let mut options = PlaygroundOptions::for_form_factor(form_factor);
    options.theme = match theme {
        ThemeMode::Light => PlaygroundTheme::Light,
        ThemeMode::Dark => PlaygroundTheme::Dark,
    };
    options.mode = PlaygroundMode::Page;
    options.hide_chrome = true;
    options.page_readonly = readonly;
    options.edgeless_readonly = true;
    options.database_readonly = true;

    let open_shared = shared.clone();
    cx.new(|cx| {
        let mut pv = PlaygroundView::with_options(options, cx);
        pv.set_doc_directory(Box::new(MobileShellDocDirectory::new(shared)));
        pv.set_on_active_doc_changed(Box::new(move |doc_id| {
            open_shared
                .borrow_mut()
                .pending_events
                .push(EditorShellEvent::OpenDoc(doc_id.to_string()));
        }));
        pv
    })
}

/// Reflect edits made inside `PlaygroundView` back into `MobileAppState`:
/// persists the authoritative Yjs V1 CRDT update bytes in `WorkspaceData::doc_crdt_updates`,
/// and updates `MobileDocRecord` title/preview/blocks purely as derived read-only projections.
pub(super) fn sync_playground_edits_back(
    state: &mut MobileAppState,
    doc_id: &str,
    pv: &PlaygroundView,
) {
    if let Some(update_v1) = pv
        .document()
        .workspace
        .page(doc_id)
        .and_then(|page| page.encode_update_v1().ok())
        && !update_v1.is_empty()
    {
        state
            .active_workspace_mut()
            .doc_crdt_updates
            .insert(doc_id.to_string(), update_v1);
    }
    let Some(snap) = pv.page_snapshot() else {
        return;
    };
    let title = snap
        .root
        .as_ref()
        .and_then(|root| match &root.content {
            BlockContent::Page { title } => Some(title.plain.clone()),
            _ => None,
        })
        .unwrap_or_default();
    let blocks = blocks_from_snapshot(snap, &|_| None);
    let body_preview = blocks
        .iter()
        .find_map(|b| match b {
            MobileDocBlock::Paragraph { text, .. } if !text.trim().is_empty() => Some(text.clone()),
            _ => None,
        })
        .unwrap_or_default();
    if let Some(doc) = state
        .active_workspace_mut()
        .docs
        .iter_mut()
        .find(|d| d.id == doc_id)
    {
        doc.title = title;
        doc.body_preview = body_preview;
        doc.blocks = blocks;
    }
}

fn doc_content_fingerprint(doc: &MobileDocRecord, crdt_update: Option<&[u8]>) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let mix = |h: &mut u64, bytes: &[u8]| {
        for &b in bytes {
            *h ^= u64::from(b);
            *h = h.wrapping_mul(0x0100_0000_01b3);
        }
    };
    if let Some(bytes) = crdt_update
        && !bytes.is_empty()
    {
        mix(&mut h, b"CRDT");
        mix(&mut h, &(bytes.len() as u64).to_le_bytes());
        mix(&mut h, bytes);
        return h;
    }
    mix(&mut h, &doc.clock.to_le_bytes());
    mix(&mut h, doc.title.as_bytes());
    mix(&mut h, &[0xff]);
    mix(&mut h, doc.body_preview.as_bytes());
    mix(&mut h, &[0xfe]);
    mix(&mut h, &(doc.blocks.len() as u64).to_le_bytes());
    for block in &doc.blocks {
        match block {
            MobileDocBlock::Paragraph { id, text } => {
                mix(&mut h, b"P");
                mix(&mut h, id.as_bytes());
                mix(&mut h, text.as_bytes());
            }
            MobileDocBlock::Image {
                id,
                blob_key,
                caption,
                ..
            } => {
                mix(&mut h, b"I");
                mix(&mut h, id.as_bytes());
                mix(&mut h, blob_key.as_bytes());
                mix(&mut h, caption.as_bytes());
            }
            MobileDocBlock::Attachment {
                id, blob_key, name, ..
            } => {
                mix(&mut h, b"A");
                mix(&mut h, id.as_bytes());
                mix(&mut h, blob_key.as_bytes());
                mix(&mut h, name.as_bytes());
            }
        }
    }
    h
}

/// Encapsulates `MobileShellView`'s embedded `PlaygroundView` entity and sync bookkeeping.
#[derive(Default)]
pub(super) struct EmbeddedPageEditor {
    entity: Option<Entity<PlaygroundView>>,
    dir: Rc<RefCell<MobileDirShared>>,
    key: Option<(String, String, u64)>,
    last_doc_rev: u64,
    syncing: Rc<std::cell::Cell<bool>>,
    _observer: Option<ui::Subscription>,
}

impl EmbeddedPageEditor {
    pub(super) fn entity(&self) -> Option<&Entity<PlaygroundView>> {
        self.entity.as_ref()
    }

    pub(super) fn drain_events(&self, state: &mut MobileAppState, now_ms: f64) {
        drain_editor_events(state, &self.dir, now_ms);
    }

    pub(super) fn sync(
        &mut self,
        state: &mut MobileAppState,
        doc_id: &str,
        content_w: f32,
        avail_h: f32,
        cx: &mut Context<super::MobileShellView>,
    ) -> Option<Entity<PlaygroundView>> {
        let resolved_theme = state.resolved_theme();
        let derivation = state.derive_breadcrumb();
        let ws_id = state.active_workspace_id().to_string();
        let doc = state.doc_by_id(doc_id).cloned()?;
        let crdt_update = state
            .active_workspace()
            .doc_crdt_updates
            .get(&doc.id)
            .cloned();
        sync_directory_snapshot(state, &self.dir);

        let form_factor = if content_w >= 720.0 {
            FormFactor::Tablet
        } else {
            FormFactor::Phone
        };
        if self
            .entity
            .as_ref()
            .is_some_and(|e| e.read(cx).form_factor() != form_factor)
        {
            self.entity = None;
            self._observer = None;
            self.key = None;
        }

        let entity = if let Some(existing) = self.entity.clone() {
            existing
        } else {
            let created = create_mobile_playground(
                resolved_theme,
                content_w,
                derivation.in_trash,
                self.dir.clone(),
                cx,
            );
            let syncing_obs = self.syncing.clone();
            let sub = cx.observe(
                &created,
                move |shell: &mut super::MobileShellView, editor, cx| {
                    if syncing_obs.get() {
                        return;
                    }
                    let crate::state::MobileRoute::Page(active_doc_id) = shell.state.route.clone()
                    else {
                        return;
                    };
                    let pv = editor.read(cx);
                    if pv.active_page_id() != Some(active_doc_id.as_str()) {
                        return;
                    }
                    let rev = pv.doc_rev();
                    if rev == shell.page_editor.last_doc_rev {
                        return;
                    }
                    syncing_obs.set(true);
                    sync_playground_edits_back(&mut shell.state, &active_doc_id, pv);
                    let ws_id = shell.state.active_workspace_id().to_string();
                    if let Some(updated) = shell.state.doc_by_id(&active_doc_id).cloned() {
                        let bytes = shell
                            .state
                            .active_workspace()
                            .doc_crdt_updates
                            .get(&active_doc_id)
                            .map(Vec::as_slice);
                        shell.page_editor.key = Some((
                            ws_id,
                            updated.id.clone(),
                            doc_content_fingerprint(&updated, bytes),
                        ));
                    }
                    shell.page_editor.last_doc_rev = rev;
                    syncing_obs.set(false);
                    cx.notify();
                },
            );
            self.entity = Some(created.clone());
            self._observer = Some(sub);
            created
        };

        let pg_theme = match resolved_theme {
            ThemeMode::Light => PlaygroundTheme::Light,
            ThemeMode::Dark => PlaygroundTheme::Dark,
        };
        let chrome_h =
            52.0 + if !derivation.should_hide_bar_on_mobile && !derivation.crumbs.is_empty() {
                45.0
            } else {
                0.0
            } + if derivation.in_trash { 68.0 } else { 0.0 }
                + 60.0;
        let editor_h = (avail_h - chrome_h).max(120.0);
        let target_key = (
            ws_id.clone(),
            doc.id.clone(),
            doc_content_fingerprint(&doc, crdt_update.as_deref()),
        );
        let needs_load = self.key.as_ref() != Some(&target_key);
        self.syncing.set(true);
        let doc_rev = entity.update(cx, |pv, cx| {
            pv.set_theme(pg_theme, cx);
            pv.set_page_readonly(derivation.in_trash, cx);
            pv.set_canvas_rect(0.0, chrome_h, content_w, editor_h);
            if needs_load {
                pv.edit_document(cx, |doc_state| {
                    load_doc_into_playground_state(doc_state, &ws_id, &doc, crdt_update.as_deref());
                });
                pv.set_active_page_id(&doc.id, cx);
            }
            pv.doc_rev()
        });
        if needs_load {
            self.key = Some(target_key);
            self.last_doc_rev = doc_rev;
        } else if doc_rev != self.last_doc_rev {
            sync_playground_edits_back(state, doc_id, entity.read(cx));
            if let Some(updated) = state.doc_by_id(doc_id).cloned() {
                let bytes = state
                    .active_workspace()
                    .doc_crdt_updates
                    .get(doc_id)
                    .map(Vec::as_slice);
                self.key = Some((
                    ws_id,
                    updated.id.clone(),
                    doc_content_fingerprint(&updated, bytes),
                ));
            }
            self.last_doc_rev = doc_rev;
        }
        self.syncing.set(false);
        Some(entity)
    }

    pub(super) fn ingest_media(
        &mut self,
        state: &mut MobileAppState,
        input: &PickedMediaInput,
        block_id: &str,
        now_ms: i64,
        cx: &mut Context<super::MobileShellView>,
    ) -> Option<affine_client::InsertedMediaBlock> {
        let crate::state::MobileRoute::Page(doc_id) = state.route.clone() else {
            return None;
        };
        let editor = self.entity.clone()?;
        self.syncing.set(true);
        let res = editor.update(cx, |pv, cx| {
            ingest_media_into_playground(pv, &doc_id, input, block_id, now_ms, cx)
        });
        if res.is_some() {
            let pv = editor.read(cx);
            let doc_rev = pv.doc_rev();
            sync_playground_edits_back(state, &doc_id, pv);
            let ws_id = state.active_workspace_id().to_string();
            if let Some(updated) = state.doc_by_id(&doc_id).cloned() {
                let bytes = state
                    .active_workspace()
                    .doc_crdt_updates
                    .get(&doc_id)
                    .map(Vec::as_slice);
                self.key = Some((
                    ws_id,
                    updated.id.clone(),
                    doc_content_fingerprint(&updated, bytes),
                ));
            }
            self.last_doc_rev = doc_rev;
            cx.notify();
        }
        self.syncing.set(false);
        res
    }
}

/// Insert a local image or attachment directly through `PlaygroundView`'s real `PageDocSession`
/// so it is rendered immediately and reverted by a single `undo()`.
///
/// Dynamically resolves the first page-visible Note under the page root (creating one if absent)
/// rather than hardcoding a fixed note id.
pub(super) fn ingest_media_into_playground(
    pv: &mut PlaygroundView,
    doc_id: &str,
    input: &PickedMediaInput,
    block_id: &str,
    now_ms: i64,
    cx: &mut Context<PlaygroundView>,
) -> Option<affine_client::InsertedMediaBlock> {
    let mut inserted = None;
    pv.edit_document(cx, |doc_state| {
        if let Some(page) = doc_state.workspace.page_mut(doc_id) {
            let parent_note_id = page
                .read_page_snapshot()
                .ok()
                .and_then(|snap| {
                    snap.root.as_ref().and_then(|root| {
                        root.children
                            .iter()
                            .find(|n| n.is_page_visible_note())
                            .map(|n| n.id.clone())
                    })
                })
                .or_else(|| {
                    let root_id = page
                        .read_page_snapshot()
                        .ok()
                        .and_then(|snap| snap.root.as_ref().map(|r| r.id.clone()))?;
                    let fallback_note_id = format!("note-{now_ms}");
                    page.add_block(
                        &fallback_note_id,
                        BlockSpec::Note { xywh: None },
                        Some(&root_id),
                        None,
                        now_ms.max(0) as u64,
                    )
                    .ok()?;
                    Some(fallback_note_id)
                });
            if let Some(parent_id) = parent_note_id
                && let Ok(res) =
                    ingest_media_into_doc_session(page, input, &parent_id, None, block_id, now_ms)
            {
                if matches!(res.blob.kind, PickedMediaKind::Image) && !input.bytes.is_empty() {
                    doc_state
                        .blobs
                        .insert(res.blob.key.clone(), Arc::new(input.bytes.clone()));
                }
                inserted = Some(res);
            }
        }
    });
    inserted
}
