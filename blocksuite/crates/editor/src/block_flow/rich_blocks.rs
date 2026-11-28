//! Layout and paint builders for `affine:callout` and `affine:attachment` (card + embedded PDF).

use crate::theme::{FONT_SANS, IconPaint, TYPOGRAPHY};

use super::{
    BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowPass, FlowRect, InlineAlign, InlineStyle, Prim,
    body::AttachmentPdfControls, inline::truncate_to_width, mirror_x_in_width,
};

pub(super) const CALLOUT_MARGIN_Y: f32 = 8.0;
pub(super) const CALLOUT_PAD_X: f32 = 10.0;
pub(super) const CALLOUT_PAD_Y: f32 = 5.0;
pub(super) const CALLOUT_ICON_SLOT: f32 = 24.0;
pub(super) const CALLOUT_CONTENT_GAP: f32 = 10.0;
pub(super) const CALLOUT_MIN_HEIGHT: f32 = 34.0;

fn format_byte_size(bytes: i64) -> String {
    let b = bytes.max(0) as f64;
    if b < 1024.0 {
        format!("{bytes} B")
    } else if b < 1024.0 * 1024.0 {
        format!("{:.1} KB", b / 1024.0)
    } else {
        format!("{:.1} MB", b / (1024.0 * 1024.0))
    }
}

/// Resolves BlockSuite callout background color names directly to the 9 semantic
/// `--affine-v2-block-callout-background-*` tokens (`callout-block.ts:212-238`).
///
/// Empty / `"default"` normalizes to `"grey"`; unknown names fall back to `None` (transparent).
fn semantic_callout_background(
    raw: Option<&str>,
    theme: crate::theme::PlaygroundTheme,
) -> Option<ui::Hsla> {
    let key = raw.map(str::trim).unwrap_or("");
    let normalized = if key.is_empty() || key.eq_ignore_ascii_case("default") {
        "grey"
    } else {
        key
    };
    let var = match normalized.to_ascii_lowercase().as_str() {
        "blue" => "--affine-v2-block-callout-background-blue",
        "green" => "--affine-v2-block-callout-background-green",
        "grey" | "gray" => "--affine-v2-block-callout-background-grey",
        "magenta" => "--affine-v2-block-callout-background-magenta",
        "orange" => "--affine-v2-block-callout-background-orange",
        "purple" => "--affine-v2-block-callout-background-purple",
        "red" => "--affine-v2-block-callout-background-red",
        "teal" => "--affine-v2-block-callout-background-teal",
        "yellow" => "--affine-v2-block-callout-background-yellow",
        _ => return None,
    };
    theme.css_var(var)
}

impl FlowPass<'_> {
    pub(super) fn callout_body(
        &mut self,
        icon: &str,
        text: &str,
        background_color: Option<&str>,
        has_children: bool,
        width: f32,
    ) -> BlockBody {
        let fill = semantic_callout_background(background_color, self.input.theme);

        let icon_text = if icon.trim().is_empty() {
            "\u{1F4A1}"
        } else {
            icon.trim()
        };
        let icon_x = mirror_x_in_width(CALLOUT_PAD_X, CALLOUT_ICON_SLOT, width, self.direction);
        let icon_style = InlineStyle::new(
            FONT_SANS,
            (TYPOGRAPHY.font_base_px * 1.2).round(),
            400.0,
            self.palette.text_primary,
        );
        let icon_layout = self.plain_inline(
            icon_text,
            icon_style,
            CALLOUT_ICON_SLOT,
            CALLOUT_ICON_SLOT,
            InlineAlign::Center,
        );
        let mut glyph_count = 0usize;
        let mut has_notdef = false;
        for piece in &icon_layout.pieces {
            for run in &piece.shaped.runs {
                for glyph in &run.glyphs {
                    glyph_count += 1;
                    if glyph.id.0 == 0 {
                        has_notdef = true;
                    }
                }
            }
        }
        let icon_prim = if glyph_count > 0 && !has_notdef {
            Prim::Text {
                x: icon_x,
                y: CALLOUT_PAD_Y,
                layout: icon_layout,
                clip: None,
            }
        } else {
            let fallback_name = match icon_text {
                "\u{1F4A1}" | "info" | "tip" | "bulb" | "\u{2139}" | "\u{2139}\u{FE0F}" => {
                    "InformationIcon"
                }
                "\u{26A0}" | "\u{26A0}\u{FE0F}" | "\u{1F525}" | "\u{2757}" | "warn" | "warning" => {
                    "WarningIcon"
                }
                _ => "QuoteIcon",
            };
            Prim::Icon {
                rect: FlowRect::new(icon_x + 2.0, CALLOUT_PAD_Y + 2.0, 20.0, 20.0),
                icon: IconPaint::named(fallback_name),
                color: self.palette.icon,
            }
        };

        let title_trimmed = text.trim();
        let content_offset_x = CALLOUT_PAD_X + CALLOUT_ICON_SLOT + CALLOUT_CONTENT_GAP;
        let text_w = (width - content_offset_x - CALLOUT_PAD_X).max(1.0);
        let title_x = match self.direction {
            ui::Direction::Ltr => content_offset_x,
            ui::Direction::Rtl => CALLOUT_PAD_X,
        };
        let mut prims = vec![
            Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, CALLOUT_MIN_HEIGHT),
                fill,
                border: None,
                radius: 8.0,
                dashed: false,
            },
            icon_prim,
        ];
        let content_h = if !title_trimmed.is_empty() {
            let title_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_base_px,
                400.0,
                self.palette.text_primary,
            );
            let align = match self.direction {
                ui::Direction::Ltr => InlineAlign::Left,
                ui::Direction::Rtl => InlineAlign::Right,
            };
            let title_layout = self.plain_inline(
                title_trimmed,
                title_style,
                text_w,
                TYPOGRAPHY.line_height_base_px,
                align,
            );
            let h = title_layout.height().max(CALLOUT_ICON_SLOT);
            prims.push(Prim::Text {
                x: title_x,
                y: CALLOUT_PAD_Y,
                layout: title_layout,
                clip: None,
            });
            h
        } else {
            CALLOUT_ICON_SLOT
        };
        let height = (content_h + 2.0 * CALLOUT_PAD_Y).max(CALLOUT_MIN_HEIGHT);
        if let Some(Prim::Quad { rect, .. }) = prims.first_mut() {
            rect.h = height;
        }

        BlockBody {
            kind: FlowKind::Callout,
            width,
            height,
            margin_top: CALLOUT_MARGIN_Y,
            margin_bottom: if has_children { 0.0 } else { CALLOUT_MARGIN_Y },
            plain: if title_trimmed.is_empty() {
                icon_text.to_string()
            } else {
                format!("{icon_text} {title_trimmed}")
            },
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn attachment_body(
        &mut self,
        block_id: &str,
        name: &str,
        size: i64,
        mime_type: &str,
        source_id: &str,
        caption: &str,
        embed: bool,
        width: f32,
    ) -> BlockBody {
        let is_pdf = mime_type.eq_ignore_ascii_case("application/pdf")
            || name.to_ascii_lowercase().ends_with(".pdf");
        let pdf_preview = (embed || is_pdf)
            .then(|| {
                self.input
                    .pdf_previews
                    .and_then(|map| map.get(block_id).or_else(|| map.get(source_id)))
            })
            .flatten();

        let title = if name.is_empty() {
            "Untitled attachment"
        } else {
            name
        };
        let meta = format!("{}  {}", format_byte_size(size), mime_type);

        if let Some(pdf) = pdf_preview {
            let header_h = 40.0;
            let footer_h = 52.0;
            let pad = 12.0;
            let max_img_w = (width - 2.0 * pad).max(60.0);
            let aspect = if pdf.width_pt > 0.0 {
                pdf.height_pt / pdf.width_pt
            } else {
                0.75
            };
            let img_w = max_img_w.min(540.0);
            let img_h = (img_w * aspect).clamp(120.0, 420.0).round();
            let img_x = ((width - img_w) / 2.0).floor().max(pad);
            let total_h = header_h + pad + img_h + pad + footer_h;

            let mut prims = vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, total_h),
                    fill: Some(self.palette.background_secondary),
                    border: Some(self.palette.card_border),
                    radius: 10.0,
                    dashed: false,
                },
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, header_h),
                    fill: Some(self.palette.panel),
                    border: Some(self.palette.border),
                    radius: 10.0,
                    dashed: false,
                },
            ];

            let title_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_sm_px,
                600.0,
                self.palette.text_primary,
            );
            let title_w = (width - pad * 2.0 - 24.0 - 120.0).max(40.0);
            let title_str = truncate_to_width(self.window, title, &title_style, title_w)
                .text
                .to_string();
            prims.push(Prim::Icon {
                rect: FlowRect::new(pad, 12.0, 16.0, 16.0),
                icon: IconPaint::named("PageIcon"),
                color: self.palette.brand,
            });
            prims.push(Prim::Text {
                x: pad + 24.0,
                y: 9.0,
                layout: self.plain_inline(
                    &title_str,
                    title_style,
                    title_w,
                    22.0,
                    InlineAlign::Left,
                ),
                clip: None,
            });

            let size_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                400.0,
                self.palette.text_secondary,
            );
            let size_label = format_byte_size(size);
            prims.push(Prim::Text {
                x: width - pad - 96.0,
                y: 10.0,
                layout: self.plain_inline(&size_label, size_style, 96.0, 20.0, InlineAlign::Right),
                clip: None,
            });

            let img_rect = FlowRect::new(img_x, header_h + pad, img_w, img_h);
            prims.push(Prim::Quad {
                rect: img_rect,
                fill: Some(ui::rgb(0xFFFFFF).into()),
                border: Some(self.palette.border),
                radius: 4.0,
                dashed: false,
            });
            prims.push(Prim::Image {
                rect: img_rect,
                image: pdf.image.clone(),
            });

            let footer_y = total_h - footer_h;
            let btn_w = 72.0;
            let btn_h = 44.0;
            let btn_y = footer_y + (footer_h - btn_h) / 2.0;
            let center_x = width / 2.0;
            let label_w = 104.0;
            let prev_rect = FlowRect::new(
                (center_x - label_w / 2.0 - btn_w - 8.0).max(pad),
                btn_y,
                btn_w,
                btn_h,
            );
            let next_rect = FlowRect::new(
                (center_x + label_w / 2.0 + 8.0).min(width - pad - btn_w),
                btn_y,
                btn_w,
                btn_h,
            );

            let btn_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                500.0,
                self.palette.text_primary,
            );
            for (rect, text) in [(prev_rect, "Prev"), (next_rect, "Next")] {
                let visual = FlowRect::new(rect.x, rect.y + 6.0, rect.w, 32.0);
                prims.push(Prim::Quad {
                    rect: visual,
                    fill: Some(self.palette.background),
                    border: Some(self.palette.border),
                    radius: 8.0,
                    dashed: false,
                });
                prims.push(Prim::Text {
                    x: visual.x,
                    y: visual.y + 6.0,
                    layout: self.plain_inline(
                        text,
                        btn_style.clone(),
                        visual.w,
                        20.0,
                        InlineAlign::Center,
                    ),
                    clip: None,
                });
            }

            let page_label = format!("Page {} / {}", pdf.page_index + 1, pdf.page_count);
            let page_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px,
                600.0,
                self.palette.text_primary,
            );
            prims.push(Prim::Text {
                x: center_x - label_w / 2.0,
                y: footer_y + 16.0,
                layout: self.plain_inline(
                    &page_label,
                    page_style,
                    label_w,
                    20.0,
                    InlineAlign::Center,
                ),
                clip: None,
            });

            let mut body = BlockBody {
                kind: FlowKind::Attachment,
                width,
                height: total_h,
                margin_top: CARD_BLOCK_MARGIN,
                margin_bottom: CARD_BLOCK_MARGIN,
                plain: format!("{title} ({page_label})"),
                prims,
                text: None,
                prefix: None,
                code_scroll: None,
                pdf_controls: Some(AttachmentPdfControls {
                    prev: prev_rect,
                    next: next_rect,
                    page_index: pdf.page_index,
                    page_count: pdf.page_count,
                }),
                table_cells: Vec::new(),
            };
            self.push_caption(&mut body, caption);
            return body;
        }

        let card_h = 64.0;
        let pad = 12.0;
        let inner_w = (width - pad * 2.0 - 36.0).max(40.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let meta_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let title_str = truncate_to_width(self.window, title, &title_style, inner_w)
            .text
            .to_string();
        let meta_str = truncate_to_width(self.window, &meta, &meta_style, inner_w)
            .text
            .to_string();
        let mut body = BlockBody {
            kind: FlowKind::Attachment,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: title.to_string(),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, card_h),
                    fill: Some(self.palette.background),
                    border: Some(self.palette.card_border),
                    radius: 8.0,
                    dashed: false,
                },
                Prim::Icon {
                    rect: FlowRect::new(pad, 20.0, 24.0, 24.0),
                    icon: IconPaint::named("PageIcon"),
                    color: self.palette.icon,
                },
                Prim::Text {
                    x: pad + 34.0,
                    y: 11.0,
                    layout: self.plain_inline(
                        &title_str,
                        title_style,
                        inner_w,
                        22.0,
                        InlineAlign::Left,
                    ),
                    clip: None,
                },
                Prim::Text {
                    x: pad + 34.0,
                    y: 34.0,
                    layout: self.plain_inline(
                        &meta_str,
                        meta_style,
                        inner_w,
                        18.0,
                        InlineAlign::Left,
                    ),
                    clip: None,
                },
            ],
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        };
        self.push_caption(&mut body, caption);
        body
    }

    pub(super) fn block_body(
        &mut self,
        node: &blocksuite_playground_doc::read::BlockNode,
        width: f32,
        list_depth: usize,
        align: blocksuite_playground_doc::read::TextAlign,
    ) -> BlockBody {
        use super::{CodePreviewKind, EquationDraft, body};
        use blocksuite_playground_doc::read::BlockContent;
        match &node.content {
            BlockContent::Paragraph {
                kind,
                text,
                collapsed,
                ..
            } => {
                if let Some(EquationDraft::Inline {
                    block_id,
                    utf16_offset,
                    latex,
                }) = self.input.equation_draft
                    && block_id == &node.id
                {
                    let patched = body::patch_inline_latex_draft(text, *utf16_offset, latex);
                    return self.paragraph_body(*kind, &patched, *collapsed, width, align);
                }
                self.paragraph_body(*kind, text, *collapsed, width, align)
            }
            BlockContent::List {
                kind,
                checked,
                collapsed,
                text,
                numbered_index,
                ..
            } => {
                if let Some(EquationDraft::Inline {
                    block_id,
                    utf16_offset,
                    latex,
                }) = self.input.equation_draft
                    && block_id == &node.id
                {
                    let patched = body::patch_inline_latex_draft(text, *utf16_offset, latex);
                    return self.list_body(
                        *kind,
                        *checked,
                        *collapsed && !node.children.is_empty(),
                        &patched,
                        numbered_index.unwrap_or(1),
                        list_depth,
                        width,
                        align,
                    );
                }
                self.list_body(
                    *kind,
                    *checked,
                    *collapsed && !node.children.is_empty(),
                    text,
                    numbered_index.unwrap_or(1),
                    list_depth,
                    width,
                    align,
                )
            }
            BlockContent::Divider => self.divider_body(width),
            BlockContent::Code {
                language,
                wrap,
                text,
                caption,
            } => {
                if self.code_preview_blocks.contains(&node.id)
                    && let Some(kind) = CodePreviewKind::from_language(language)
                    && super::code_preview::code_preview_supported(kind)
                {
                    return self.code_preview_body(kind, language, text, caption, width);
                }
                let explicit_line_number =
                    node.props.get("prop:lineNumber").and_then(|v| v.as_bool());
                self.code_body(
                    &node.id,
                    language,
                    *wrap,
                    explicit_line_number,
                    text,
                    caption,
                    width,
                )
            }
            BlockContent::Image {
                source_id,
                width: image_width,
                height: image_height,
                caption,
            } => self.image_body(source_id, *image_width, *image_height, caption, width),
            BlockContent::Bookmark {
                url,
                title,
                description,
                caption,
            } => self.bookmark_body(
                url,
                title.as_deref(),
                description.as_deref(),
                caption,
                width,
            ),
            BlockContent::Latex { latex } => {
                let effective = match self.input.equation_draft {
                    Some(EquationDraft::Block {
                        block_id,
                        latex: draft,
                    }) if block_id == &node.id => draft.as_str(),
                    _ => latex.as_str(),
                };
                self.latex_body(effective, width)
            }
            BlockContent::Callout {
                icon,
                text,
                background_color,
            } => self.callout_body(
                icon,
                &text.plain,
                background_color.as_deref(),
                !node.children.is_empty(),
                width,
            ),
            BlockContent::Table(table) => self.table_body(
                table,
                width,
                self.focused_table_block == Some(node.id.as_str()),
            ),
            BlockContent::Attachment {
                name,
                size,
                mime_type,
                source_id,
                caption,
                embed,
            } => self.attachment_body(
                &node.id, name, *size, mime_type, source_id, caption, *embed, width,
            ),
            BlockContent::EmbedLinkedDoc {
                page_id, caption, ..
            } => self.embed_linked_doc_body(page_id, caption, width),
            BlockContent::EmbedSyncedDoc { page_id, caption } => {
                self.embed_synced_doc_body(page_id, caption, width)
            }
            BlockContent::SurfaceRef {
                reference,
                ref_flavour,
                caption,
            } => self.surface_ref_body(&node.id, reference, ref_flavour, caption, width),
            BlockContent::ExternalEmbed {
                kind,
                url,
                title,
                description,
                html,
                caption,
            } => {
                let effective = self.effective_embed_state(&node.id);
                self.external_embed_body(
                    *kind,
                    url,
                    title.as_deref(),
                    description.as_deref(),
                    html.as_deref(),
                    caption,
                    effective,
                    width,
                )
            }
            BlockContent::Database(db) => self.database_body(&node.id, db, width),
            _ => self.unknown_body(&node.flavour, &node.id, width),
        }
    }
}
