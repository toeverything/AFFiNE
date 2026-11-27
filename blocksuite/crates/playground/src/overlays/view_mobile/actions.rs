//! Single-step Undo document commands driven by the mobile `KeyboardToolbar`:
//! inline/block color highlights, block duplicate/delete, block inserts
//! (equation, table, callout, image, bookmark), inline math, and deterministic
//! scheduler-clock date formatting.

use blocksuite_playground_doc::{
    DocError, DocResult,
    read::{BlockContent, BlockNode},
    schema::{BlockSpec, ListType, ParagraphType},
};
use ui::{Context, Window};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use crate::{
    PlaygroundView,
    block_flow::{FlowKind, civil_from_days},
    editor_session::{DocPoint, DocumentSelection},
    overlays::{EquationTarget, KeyboardToolbarDateKind, OverlayEvent, find_parent},
};

/// Encodes a 32-byte SHA-256 digest as 44-character padded base64url (`[A-Za-z0-9_-]{43}=`),
/// matching BlockSuite `0.27.5` `sha()` (`toBase64(sha256(bytes)).replace(/\+/g, '-').replace(/\//g, '_')`).
pub(crate) fn sha256_base64url(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(44);
    let mut i = 0usize;
    while i + 3 <= 32 {
        let n = ((digest[i] as u32) << 16) | ((digest[i + 1] as u32) << 8) | (digest[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 6) & 0x3f) as usize] as char);
        out.push(TABLE[(n & 0x3f) as usize] as char);
        i += 3;
    }
    let rem = ((digest[30] as u32) << 16) | ((digest[31] as u32) << 8);
    out.push(TABLE[((rem >> 18) & 0x3f) as usize] as char);
    out.push(TABLE[((rem >> 12) & 0x3f) as usize] as char);
    out.push(TABLE[((rem >> 6) & 0x3f) as usize] as char);
    out.push('=');
    out
}

/// Format a UTC Unix timestamp (`utc_epoch_ms`) shifted by `utc_offset_minutes` into
/// BlockSuite `0.27.5` local calendar `formatDate` (`yyyy-mm-dd`) or `formatTime` (`mm-dd hh:mm`).
pub(super) fn format_keyboard_toolbar_local_date(
    utc_epoch_ms: i64,
    utc_offset_minutes: i32,
    kind: KeyboardToolbarDateKind,
) -> String {
    let local_ms = utc_epoch_ms.saturating_add(i64::from(utc_offset_minutes) * 60_000);
    let total_secs = local_ms.div_euclid(1_000);
    let days = total_secs.div_euclid(86_400);
    let sec_of_day = total_secs.rem_euclid(86_400);
    match kind {
        KeyboardToolbarDateKind::Today => {
            let (y, m, d) = civil_from_days(days);
            format!("{y:04}-{m:02}-{d:02}")
        }
        KeyboardToolbarDateKind::Tomorrow => {
            let (y, m, d) = civil_from_days(days + 1);
            format!("{y:04}-{m:02}-{d:02}")
        }
        KeyboardToolbarDateKind::Yesterday => {
            let (y, m, d) = civil_from_days(days - 1);
            format!("{y:04}-{m:02}-{d:02}")
        }
        KeyboardToolbarDateKind::Now => {
            let (_, m, d) = civil_from_days(days);
            let hh = sec_of_day / 3_600;
            let mm = (sec_of_day % 3_600) / 60;
            format!("{m:02}-{d:02} {hh:02}:{mm:02}")
        }
    }
}

fn clone_block_spec(node: &BlockNode) -> BlockSpec {
    match &node.content {
        BlockContent::Paragraph { kind, .. } => BlockSpec::Paragraph {
            paragraph_type: *kind,
            text: String::new(),
        },
        BlockContent::List {
            kind,
            checked,
            order,
            ..
        } => BlockSpec::List {
            list_type: *kind,
            text: String::new(),
            checked: *checked,
            order: order.and_then(|v| i32::try_from(v).ok()),
        },
        BlockContent::Code {
            language, caption, ..
        } => BlockSpec::Code {
            text: String::new(),
            language: (!language.is_empty()).then(|| language.clone()),
            caption: caption.clone(),
        },
        BlockContent::Divider => BlockSpec::Divider,
        BlockContent::Latex { latex } => BlockSpec::Latex {
            latex: latex.clone(),
        },
        BlockContent::Callout {
            icon,
            background_color,
            ..
        } => BlockSpec::Callout {
            icon: icon.clone(),
            background_color: background_color.clone(),
        },
        BlockContent::Image {
            source_id,
            caption,
            width,
            height,
        } => BlockSpec::Image {
            source_id: source_id.clone(),
            caption: caption.clone(),
            width: width.unwrap_or(320.0),
            height: height.unwrap_or(180.0),
            xywh: None,
        },
        BlockContent::Bookmark {
            url,
            title,
            description,
            ..
        } => BlockSpec::Bookmark {
            url: url.clone(),
            title: title.clone(),
            description: description.clone(),
        },
        BlockContent::Table(table) => {
            let rows = table
                .rows
                .iter()
                .map(|r| {
                    table
                        .columns
                        .iter()
                        .map(|c| {
                            table
                                .cells
                                .get(&(r.row_id.clone(), c.column_id.clone()))
                                .map(|cell| cell.text.plain.clone())
                                .unwrap_or_default()
                        })
                        .collect()
                })
                .collect();
            BlockSpec::Table { rows }
        }
        _ => BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: String::new(),
        },
    }
}

impl PlaygroundView {
    pub(super) fn can_indent_current_block(&self) -> bool {
        let Some(id) = self
            .editor
            .selection
            .as_ref()
            .map(|s| s.focus.block_id.as_str())
        else {
            return false;
        };
        let Some(snapshot) = self.snapshot.as_ref() else {
            return false;
        };
        if snapshot
            .block(id)
            .is_some_and(|n| matches!(n.content, BlockContent::Code { .. }))
        {
            return true;
        }
        let Some(root) = snapshot.root.as_ref() else {
            return false;
        };
        let Some((parent, pos)) = find_parent(root, id) else {
            return false;
        };
        pos.checked_sub(1)
            .and_then(|i| parent.children.get(i))
            .is_some_and(|b| {
                matches!(
                    b.content,
                    BlockContent::List { .. } | BlockContent::Paragraph { .. }
                )
            })
    }

    pub(super) fn can_dedent_current_block(&self) -> bool {
        let Some(id) = self
            .editor
            .selection
            .as_ref()
            .map(|s| s.focus.block_id.as_str())
        else {
            return false;
        };
        let Some(snapshot) = self.snapshot.as_ref() else {
            return false;
        };
        let Some(root) = snapshot.root.as_ref() else {
            return false;
        };
        let Some((parent, _)) = find_parent(root, id) else {
            return false;
        };
        matches!(
            parent.content,
            BlockContent::List { .. } | BlockContent::Paragraph { .. }
        ) && find_parent(root, &parent.id).is_some()
    }

    /// Apply or clear a `color` or `background` rich-text highlight mark in one undo step.
    pub(super) fn format_color_mark(
        &mut self,
        key: &str,
        value: Option<&str>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        if sel.empty() {
            self.editor
                .pending_marks
                .insert(key.into(), value.map(|v| Any::String(v.to_owned())));
            return Ok(());
        }
        let Some(layout) = self.flow_layout() else {
            return Ok(());
        };
        let Some((start, end, a, b, _)) = sel.ordered(&layout) else {
            return Ok(());
        };
        let now = self.now_ms(cx) as u64;
        let mut ranges = Vec::new();
        for block in layout.blocks[a..=b].iter().filter(|b| b.editable()) {
            let id = &block.block_id;
            let from = if id == &start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if id == &end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if to <= from {
                continue;
            }
            let prop = if matches!(block.body.kind, FlowKind::Title) {
                "prop:title"
            } else {
                "prop:text"
            };
            ranges.push((id.as_str(), prop, from, to - from));
        }
        if ranges.is_empty() {
            return Ok(());
        }
        let page = self.page_mut()?;
        let snap = sel.snapshot(page)?;
        page.stop_capturing()?;
        let attr_val = value.map_or(Any::Null, |v| Any::String(v.to_owned()));
        let commit = page.structural_edit(now, |page| {
            for (id, prop, from, len) in ranges {
                page.format_text(
                    id,
                    prop,
                    from,
                    len,
                    TextAttributes::from([(key.to_owned(), attr_val.clone())]),
                    now,
                )?;
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(snap)?;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, (a == b).then_some(&start.block_id), window, cx);
        Ok(())
    }

    /// Insert an inline LaTeX equation placeholder at the caret and open the equation editor.
    pub(super) fn insert_inline_math_from_toolbar(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(sel) = self.editor.selection.clone() else {
            return;
        };
        let offset = sel.focus.offset();
        let now = self.now_ms(cx) as u64;
        let before = self.selection_snapshot();
        if let Ok(page) = self.page_mut() {
            let _ = page.stop_capturing();
            let mut delta = Vec::new();
            if offset > 0 {
                delta.push(TextDeltaOp::Retain {
                    retain: offset,
                    format: None,
                });
            }
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(" ".into()),
                format: Some(TextAttributes::from([(
                    "latex".to_string(),
                    Any::String(String::new()),
                )])),
            });
            if let Ok(commit) = page.apply_text_delta(&sel.focus.block_id, "prop:text", &delta, now)
            {
                if commit.is_some()
                    && let Some(before) = before
                {
                    let _ = page.set_undo_selection_snapshot(before);
                }
                self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(
                    &sel.focus.block_id,
                    offset + 1,
                )));
                self.did_edit(commit, Some(&sel.focus.block_id), window, cx);
                self.dispatch_overlay(
                    OverlayEvent::OpenEquationEditor {
                        target: EquationTarget::Inline {
                            block_id: sel.focus.block_id,
                            utf16_offset: offset,
                        },
                        initial: String::new(),
                    },
                    window,
                    cx,
                );
            }
        }
    }

    /// Clone the currently focused block directly below it as one undoable `structural_edit`.
    pub(super) fn duplicate_current_block(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        let block_id = sel.focus.block_id.clone();
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?;
        let Some((parent, slot)) = snapshot
            .root
            .as_ref()
            .and_then(|root| find_parent(root, &block_id))
        else {
            return Ok(());
        };
        let node = &parent.children[slot];
        let spec = clone_block_spec(node);
        let is_numbered = matches!(
            node.content,
            BlockContent::List {
                kind: ListType::Numbered,
                ..
            }
        );
        let has_text = matches!(
            node.content,
            BlockContent::Paragraph { .. } | BlockContent::List { .. } | BlockContent::Code { .. }
        );
        let existing_delta = if has_text {
            self.page()
                .and_then(|p| p.read_editable_text(&block_id).ok())
                .map(|(rich, _)| rich.delta)
        } else {
            None
        };
        let fresh = self.fresh_block_id();
        let parent_id = parent.id.clone();
        let now = self.now_ms(cx) as u64;
        let before = self.selection_snapshot();
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            page.add_block(&fresh, spec, Some(&parent_id), Some(slot as u64 + 1), now)?;
            if let Some(delta) = existing_delta.as_ref()
                && !delta.is_empty()
            {
                page.apply_text_delta(&fresh, "prop:text", delta, now)?;
            }
            if is_numbered {
                page.correct_numbered_order_from(&parent_id, slot + 1, 1)?;
            }
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        if has_text {
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(&fresh, 0)));
        }
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(())
    }

    /// Delete the currently focused block in one undoable `structural_edit`.
    /// When deleting the last remaining block of its parent, inserts a fresh empty paragraph.
    pub(super) fn delete_current_block(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(());
        };
        let block_id = sel.focus.block_id.clone();
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?;
        let Some((parent, slot)) = snapshot
            .root
            .as_ref()
            .and_then(|root| find_parent(root, &block_id))
        else {
            return Ok(());
        };
        let parent_id = parent.id.clone();
        let is_last_child = parent.children.len() <= 1;
        let fallback_id = if is_last_child {
            Some(self.fresh_block_id())
        } else {
            None
        };
        let next_focus_id = if let Some(ref fresh) = fallback_id {
            Some(fresh.clone())
        } else if slot > 0 {
            Some(parent.children[slot - 1].id.clone())
        } else {
            parent.children.get(slot + 1).map(|n| n.id.clone())
        };
        let now = self.now_ms(cx) as u64;
        let before = self.selection_snapshot();
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            if let Some(ref fresh) = fallback_id {
                page.add_block(
                    fresh,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: String::new(),
                    },
                    Some(&parent_id),
                    Some(0),
                    now,
                )?;
            }
            page.delete_block_subtree(&parent_id, &block_id, now)?;
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.selection =
            next_focus_id.map(|id| DocumentSelection::caret(DocPoint::new(id, 0)));
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(())
    }

    fn insert_sibling_after_block(
        &mut self,
        anchor_block_id: &str,
        spec: BlockSpec,
        child_paragraph: bool,
        remove_empty_line: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<Option<String>> {
        let snapshot = self
            .snapshot
            .clone()
            .ok_or_else(|| DocError::InvalidState("missing page".into()))?;
        let Some((parent, slot)) = snapshot
            .root
            .as_ref()
            .and_then(|root| find_parent(root, anchor_block_id))
        else {
            return Ok(None);
        };
        let drop_empty = remove_empty_line
            && parent.children.get(slot).is_some_and(|n| {
                n.children.is_empty()
                    && matches!(&n.content, BlockContent::Paragraph { text, .. } if text.plain.is_empty())
            });
        let parent_id = parent.id.clone();
        let fresh = self.fresh_block_id();
        let child_id = child_paragraph.then(|| self.fresh_block_id());
        let now = self.now_ms(cx) as u64;
        let before = self.selection_snapshot();
        let page = self.page_mut()?;
        page.stop_capturing()?;
        let commit = page.structural_edit(now, |page| {
            page.add_block(&fresh, spec, Some(&parent_id), Some(slot as u64 + 1), now)?;
            if let Some(ref cid) = child_id {
                page.add_block(
                    cid,
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: String::new(),
                    },
                    Some(&fresh),
                    Some(0),
                    now,
                )?;
            }
            if drop_empty {
                page.delete_block_subtree(&parent_id, anchor_block_id, now)?;
            }
            Ok(())
        })?;
        if commit.is_some()
            && let Some(before) = before
        {
            page.set_undo_selection_snapshot(before)?;
        }
        page.stop_capturing()?;
        if let Some(ref cid) = child_id {
            self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(cid, 0)));
        } else if drop_empty {
            self.editor.selection = None;
        }
        self.editor.last_typing = None;
        self.did_edit(commit, None, window, cx);
        Ok(Some(fresh))
    }

    fn insert_sibling_block(
        &mut self,
        spec: BlockSpec,
        child_paragraph: bool,
        remove_empty_line: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<Option<String>> {
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(None);
        };
        let block_id = sel.focus.block_id.clone();
        self.insert_sibling_after_block(
            &block_id,
            spec,
            child_paragraph,
            remove_empty_line,
            window,
            cx,
        )
    }

    pub(super) fn insert_equation_block_from_toolbar(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        if let Some(block_id) = self.insert_sibling_block(
            BlockSpec::Latex {
                latex: String::new(),
            },
            false,
            true,
            window,
            cx,
        )? {
            self.dispatch_overlay(
                OverlayEvent::OpenEquationEditor {
                    target: EquationTarget::Block { block_id },
                    initial: String::new(),
                },
                window,
                cx,
            );
        }
        Ok(())
    }

    pub(super) fn insert_table_block_from_toolbar(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let _ = self.insert_sibling_block(
            BlockSpec::Table {
                rows: vec![
                    vec![String::new(), String::new()],
                    vec![String::new(), String::new()],
                ],
            },
            false,
            true,
            window,
            cx,
        )?;
        Ok(())
    }

    pub(super) fn insert_callout_block_from_toolbar(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let _ = self.insert_sibling_block(
            BlockSpec::Callout {
                icon: "\u{1F4A1}".into(),
                background_color: None,
            },
            true,
            false,
            window,
            cx,
        )?;
        Ok(())
    }

    /// Triggers the host image file picker without mutating the document until a valid image is chosen.
    pub(super) fn trigger_image_picker_from_toolbar(&mut self, _cx: &mut Context<Self>) {
        if let Some(picker) = self.image_picker.clone() {
            picker();
            return;
        }
        #[cfg(target_family = "wasm")]
        crate::wasm_preview::request_host_image_picker();
    }

    /// Maximum encoded image size accepted when picking a new photo on mobile/Web (32 MiB).
    /// Existing room blobs up to `MAX_BLOB_BYTES` (64 MiB) remain readable via `decode_image`.
    const MAX_PICKED_IMAGE_BYTES: usize = 32 * 1024 * 1024;

    /// Decodes chosen image bytes in a single pass, stores and uploads the content-addressed
    /// SHA-256 blob, and inserts an `affine:image` block with its intrinsic logical dimensions
    /// as one Undo step. Invalid or oversized bytes leave the document untouched.
    pub(super) fn insert_picked_image_bytes(
        &mut self,
        bytes: &[u8],
        caption: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        if bytes.is_empty() || bytes.len() > Self::MAX_PICKED_IMAGE_BYTES {
            return Ok(());
        }
        let Some((render_img, px_w, px_h)) = crate::block_flow::decode_image_with_dimensions(bytes)
        else {
            return Ok(());
        };
        let w = (px_w.max(1) as f64).min(720.0);
        let scale = w / (px_w.max(1) as f64);
        let h = ((px_h.max(1) as f64) * scale).round().max(1.0);

        let source_id = sha256_base64url(bytes);
        let shared_bytes = std::sync::Arc::new(bytes.to_vec());
        self.state
            .blobs
            .insert(source_id.clone(), shared_bytes.clone());
        self.images.insert(
            source_id.clone(),
            crate::block_flow::ImageSlot::Ready(render_img),
        );
        self.queue_blob_upload(source_id.clone(), shared_bytes, cx);
        self.env_rev += 1;

        let _ = self.insert_sibling_block(
            BlockSpec::Image {
                source_id,
                caption: caption.to_string(),
                width: w,
                height: h,
                xywh: None,
            },
            false,
            false,
            window,
            cx,
        )?;
        Ok(())
    }

    /// Stores and uploads a PDF blob under its base64url SHA-256 `sourceId` and inserts an
    /// embedded `affine:attachment` block (`embed: true`) so Hayro renders its pages in-document.
    pub fn insert_picked_pdf_bytes(
        &mut self,
        bytes: &[u8],
        name: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        if bytes.len() < 5 || bytes.len() > 64 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") {
            return Ok(());
        }
        let source_id = sha256_base64url(bytes);
        let shared_bytes = std::sync::Arc::new(bytes.to_vec());
        self.state
            .blobs
            .insert(source_id.clone(), shared_bytes.clone());
        self.queue_blob_upload(source_id.clone(), shared_bytes, cx);
        let spec = BlockSpec::Attachment {
            name: if name.trim().is_empty() {
                "document.pdf".to_string()
            } else {
                name.trim().to_string()
            },
            size: bytes.len() as i64,
            mime_type: "application/pdf".to_string(),
            source_id,
            embed: true,
            caption: String::new(),
        };
        if self.editor.selection.is_some() {
            let _ = self.insert_sibling_block(spec, false, false, window, cx)?;
            return Ok(());
        }
        let Some(anchor_id) = self.snapshot.as_ref().and_then(|snap| {
            let root = snap.root.as_ref()?;
            let note = root.children.iter().find(|c| {
                matches!(
                    c.content,
                    blocksuite_playground_doc::read::BlockContent::Note { .. }
                )
            })?;
            note.children.first().map(|c| c.id.clone())
        }) else {
            return Ok(());
        };
        let _ = self.insert_sibling_after_block(&anchor_id, spec, false, false, window, cx)?;
        Ok(())
    }

    /// Inserts an `affine:bookmark` block after `anchor_block_id` once the user confirms a valid URL.
    pub(crate) fn insert_bookmark_after_block(
        &mut self,
        anchor_block_id: &str,
        url: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult {
        let trimmed = url.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        let _ = self.insert_sibling_after_block(
            anchor_block_id,
            BlockSpec::Bookmark {
                url: trimmed.to_string(),
                title: None,
                description: None,
            },
            false,
            false,
            window,
            cx,
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_date_formatter_matches_0275_formats_and_crosses_midnight() {
        // 2026-11-26T16:30:00Z = 1795710600000 ms; at UTC+08:00 (+480 min) -> 2026-11-27 00:30 local!
        let ts = 1_795_710_600_000_i64;
        assert_eq!(
            format_keyboard_toolbar_local_date(ts, 480, KeyboardToolbarDateKind::Today),
            "2026-11-27"
        );
        assert_eq!(
            format_keyboard_toolbar_local_date(ts, 480, KeyboardToolbarDateKind::Tomorrow),
            "2026-11-28"
        );
        assert_eq!(
            format_keyboard_toolbar_local_date(ts, 480, KeyboardToolbarDateKind::Yesterday),
            "2026-11-26"
        );
        assert_eq!(
            format_keyboard_toolbar_local_date(ts, 480, KeyboardToolbarDateKind::Now),
            "11-27 00:30"
        );
    }
}
