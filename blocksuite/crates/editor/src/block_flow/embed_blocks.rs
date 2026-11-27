//! Layout and paint builders for read-only embedded and reference blocks:
//! `affine:embed-linked-doc`, `affine:embed-synced-doc`, and `affine:surface-ref`.
//!
//! Strictly zero internal IDs (`doc:...`, `affine:frame`, `frame-...`) on card surfaces and
//! strictly zero CRDT writeback.

use std::collections::BTreeSet;

use blocksuite_playground_doc::read::{BlockContent, BlockNode, PageSnapshot};

use crate::{
    directory::EditorDocId,
    theme::{FONT_SANS, IconPaint, TYPOGRAPHY},
};

use super::{
    BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowPass, FlowRect, InlineAlign, InlineStyle, Prim,
    inline::truncate_to_width,
};

const MAX_SYNCED_RECURSION_DEPTH: usize = 2;

/// Howard Hinnant's `civil_from_days` algorithm: converts days since `1970-01-01` to `(year, month, day)`.
pub fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = y + i64::from(m <= 2);
    (year, m as u32, d as u32)
}

/// Formats a Unix millisecond timestamp into `"Updated YYYY-MM-DD HH:MM"` in the host's local
/// timezone offset (`utc_offset_minutes` east of UTC), matching `0.27.5` `embed-linked-doc-block.ts`
/// with zero host wall-clock calls.
fn format_updated_local_datetime(ms: i64, utc_offset_minutes: i32) -> Option<String> {
    if ms <= 0 {
        return None;
    }
    let local_ms = ms.saturating_add(i64::from(utc_offset_minutes) * 60_000);
    let days = local_ms.div_euclid(86_400_000);
    let rem_ms = local_ms.rem_euclid(86_400_000);
    let (year, m, d) = civil_from_days(days);
    let hh = rem_ms / 3_600_000;
    let mm = (rem_ms % 3_600_000) / 60_000;
    Some(format!("Updated {year:04}-{m:02}-{d:02} {hh:02}:{mm:02}"))
}

fn extract_snapshot_snippet(snapshot: &PageSnapshot) -> String {
    let Some(root) = &snapshot.root else {
        return String::new();
    };
    let mut parts = Vec::new();
    for node in root.walk() {
        let text = match &node.content {
            BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                text.plain.trim()
            }
            BlockContent::Callout { text, .. } => text.plain.trim(),
            BlockContent::Code { text, .. } => text.trim(),
            _ => "",
        };
        if !text.is_empty() {
            parts.push(text);
            if parts.len() >= 2 {
                break;
            }
        }
    }
    parts.join(" ")
}

impl FlowPass<'_> {
    pub(super) fn embed_linked_doc_body(
        &mut self,
        page_id: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let doc_id = EditorDocId::from(page_id);
        let preview = self
            .input
            .doc_directory
            .and_then(|dir| dir.doc_preview(&doc_id));
        let title_from_preview = preview
            .as_ref()
            .map(|p| p.title.as_str())
            .filter(|s| !s.trim().is_empty());
        let title_from_map = self
            .input
            .page_titles
            .get(page_id)
            .map(String::as_str)
            .filter(|s| !s.trim().is_empty());
        let resolved_title = title_from_preview.or(title_from_map).unwrap_or("Untitled");

        let snippet = preview
            .as_ref()
            .map(|p| p.snippet.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                self.input
                    .doc_directory
                    .and_then(|dir| dir.doc_snapshot(&doc_id))
                    .map(|snap| extract_snapshot_snippet(&snap))
                    .filter(|s| !s.is_empty())
            });
        let date_label = preview.as_ref().and_then(|p| {
            format_updated_local_datetime(
                p.updated_at_ms,
                self.input.utc_offset_for(p.updated_at_ms),
            )
        });

        let pad = 12.0;
        let inner_w = (width - pad * 2.0 - 28.0).max(40.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let snippet_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let date_style = InlineStyle::new(FONT_SANS, 11.0, 400.0, self.palette.placeholder);
        let title_str = truncate_to_width(self.window, resolved_title, &title_style, inner_w)
            .text
            .to_string();

        let mut prims = vec![
            Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, 72.0),
                fill: Some(self.palette.background),
                border: Some(self.palette.card_border),
                radius: 8.0,
                dashed: false,
            },
            Prim::Icon {
                rect: FlowRect::new(pad, 14.0, 18.0, 18.0),
                icon: IconPaint::named("LinkedPageIcon"),
                color: self.palette.brand,
            },
            Prim::Text {
                x: pad + 26.0,
                y: 12.0,
                layout: self.plain_inline(
                    &title_str,
                    title_style,
                    inner_w,
                    22.0,
                    InlineAlign::Left,
                ),
                clip: None,
            },
        ];

        let mut y = 38.0;
        if let Some(snippet_text) = snippet.as_deref() {
            let line = truncate_to_width(self.window, snippet_text, &snippet_style, inner_w)
                .text
                .to_string();
            prims.push(Prim::Text {
                x: pad + 26.0,
                y,
                layout: self.plain_inline(&line, snippet_style, inner_w, 18.0, InlineAlign::Left),
                clip: None,
            });
            y += 20.0;
        }
        if let Some(date_text) = date_label.as_deref() {
            prims.push(Prim::Text {
                x: pad + 26.0,
                y,
                layout: self.plain_inline(date_text, date_style, inner_w, 16.0, InlineAlign::Left),
                clip: None,
            });
            y += 18.0;
        }

        let card_h = (y + 10.0).max(52.0);
        if let Some(Prim::Quad { rect, .. }) = prims.first_mut() {
            rect.h = card_h;
        }

        let mut body = BlockBody {
            kind: FlowKind::EmbedLinkedDoc,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: resolved_title.to_string(),
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        };
        self.push_caption(&mut body, caption);
        body
    }

    pub(super) fn embed_synced_doc_body(
        &mut self,
        page_id: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let doc_id = EditorDocId::from(page_id);
        let preview = self
            .input
            .doc_directory
            .and_then(|dir| dir.doc_preview(&doc_id));
        let resolved_title = preview
            .as_ref()
            .map(|p| p.title.as_str())
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                self.input
                    .page_titles
                    .get(page_id)
                    .map(String::as_str)
                    .filter(|s| !s.trim().is_empty())
            })
            .unwrap_or("Untitled");

        // Match `0.27.5` `embed-synced-doc-block/styles.ts` Page mode:
        // transparent background, no permanent border or 3px blue bar, header hidden at rest
        // (hover border is painted by `Overlays::page_layer` when hovered), and full read-only
        // body blocks without any 6-block truncation (`MAX_SYNCED_RECURSION_DEPTH = 2` guards cycles).
        let mut prims = Vec::new();
        let mut visited: BTreeSet<String> = self.visited_embeds.clone();
        visited.insert(self.input.snapshot.doc_id.clone());
        let pad_y = 6.0;
        let mut content_y = pad_y;
        let mut rendered_any = false;
        let mut loaded_empty_doc = false;
        if self.embed_depth < MAX_SYNCED_RECURSION_DEPTH
            && !visited.contains(page_id)
            && let Some(target_snap) = self
                .input
                .doc_directory
                .and_then(|dir| dir.doc_snapshot(&doc_id))
            && let Some(root) = &target_snap.root
        {
            visited.insert(page_id.to_string());
            let mut preview_nodes: Vec<BlockNode> = Vec::new();
            for child in &root.children {
                if child.is_edgeless_only() {
                    continue;
                }
                match &child.content {
                    BlockContent::Note { hidden: true, .. } => continue,
                    BlockContent::Note { .. } => {
                        preview_nodes.extend(child.children.iter().cloned());
                    }
                    _ => {
                        preview_nodes.push(child.clone());
                    }
                }
            }
            if preview_nodes.is_empty() {
                loaded_empty_doc = true;
            } else {
                let nested_w = width.max(60.0);
                let mut nested_flow = super::BlockFlow::new();
                let nested_input = super::FlowInput {
                    snapshot: &target_snap,
                    width: nested_w,
                    theme: self.input.theme,
                    page_titles: self.input.page_titles,
                    images: self.input.images,
                    pdf_previews: self.input.pdf_previews,
                    doc_directory: self.input.doc_directory,
                    equation_draft: None,
                    env_rev: self.input.env_rev,
                    direction: self.direction,
                    form_factor: self.input.form_factor,
                    utc_offset_minutes: self.input.utc_offset_minutes,
                    utc_offset_at: self.input.utc_offset_at,
                };
                let nested = nested_flow.layout_nodes_nested(
                    &preview_nodes,
                    &nested_input,
                    self.window,
                    self.embed_depth + 1,
                    visited,
                );
                for block in &nested.blocks {
                    let dx = block.x;
                    let dy = content_y + block.y;
                    for prim in &block.body.prims {
                        prims.push(translate_prim(prim, dx, dy));
                    }
                }
                content_y += nested.height;
                rendered_any = true;
            }
        }

        if !rendered_any {
            let fallback = preview
                .as_ref()
                .map(|p| p.snippet.trim())
                .filter(|s| !s.is_empty())
                .or(loaded_empty_doc.then_some("Empty document"))
                .unwrap_or(resolved_title);
            let empty_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_sm_px,
                400.0,
                self.palette.text_secondary,
            );
            prims.push(Prim::Text {
                x: 0.0,
                y: content_y + 10.0,
                layout: self.plain_inline(
                    fallback,
                    empty_style,
                    width.max(40.0),
                    22.0,
                    InlineAlign::Left,
                ),
                clip: None,
            });
            content_y += 38.0;
        }

        let card_h = (content_y + pad_y).max(44.0);

        let mut body = BlockBody {
            kind: FlowKind::EmbedSyncedDoc,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: resolved_title.to_string(),
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        };
        self.push_caption(&mut body, caption);
        body
    }
}

fn translate_prim(prim: &Prim, dx: f32, dy: f32) -> Prim {
    match prim {
        Prim::Quad {
            rect,
            fill,
            border,
            radius,
            dashed,
        } => Prim::Quad {
            rect: rect.translated(dx, dy),
            fill: *fill,
            border: *border,
            radius: *radius,
            dashed: *dashed,
        },
        Prim::Text { x, y, layout, clip } => Prim::Text {
            x: x + dx,
            y: y + dy,
            layout: layout.clone(),
            clip: clip.map(|r| r.translated(dx, dy)),
        },
        Prim::CodeLine { x, y, layout, clip } => Prim::CodeLine {
            x: x + dx,
            y: y + dy,
            layout: layout.clone(),
            clip: clip.translated(dx, dy),
        },
        Prim::Rich { x, y, layout } => Prim::Rich {
            x: x + dx,
            y: y + dy,
            layout: layout.clone(),
        },
        Prim::Icon { rect, icon, color } => Prim::Icon {
            rect: rect.translated(dx, dy),
            icon: icon.clone(),
            color: *color,
        },
        Prim::Chevron {
            rect,
            collapsed,
            color,
        } => Prim::Chevron {
            rect: rect.translated(dx, dy),
            collapsed: *collapsed,
            color: *color,
        },
        Prim::Image { rect, image } => Prim::Image {
            rect: rect.translated(dx, dy),
            image: image.clone(),
        },
        Prim::Surface {
            rect,
            layout,
            world_origin,
            scale,
        } => Prim::Surface {
            rect: rect.translated(dx, dy),
            layout: layout.clone(),
            world_origin: *world_origin,
            scale: *scale,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_updated_local_datetime_handles_positive_negative_and_epoch_boundaries() {
        assert_eq!(format_updated_local_datetime(0, 0), None);
        assert_eq!(format_updated_local_datetime(-100, 480), None);
        // 2026-11-26 14:30:00 UTC == 1_795_703_400_000 ms
        assert_eq!(
            format_updated_local_datetime(1_795_703_400_000, 0).as_deref(),
            Some("Updated 2026-11-26 14:30")
        );
        assert_eq!(
            format_updated_local_datetime(1_795_703_400_000, 480).as_deref(),
            Some("Updated 2026-11-26 22:30")
        );
        assert_eq!(
            format_updated_local_datetime(1_795_703_400_000, 600).as_deref(),
            Some("Updated 2026-11-27 00:30")
        );
        assert_eq!(
            format_updated_local_datetime(1_795_703_400_000, -300).as_deref(),
            Some("Updated 2026-11-26 09:30")
        );
    }
}
