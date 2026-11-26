//! Layout and paint builders for the 7 rich Page block flavours:
//! `affine:callout`, `affine:table`, `affine:attachment` (card + embedded PDF preview),
//! `affine:embed-linked-doc`, `affine:embed-synced-doc`, and `affine:surface-ref`
//! (with `affine:latex` upgraded to RaTeX vector math in `blocks.rs`).

use blocksuite_playground_doc::read::TableData;

use crate::theme::{FONT_SANS, IconPaint, TYPOGRAPHY};

use super::{
    BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowPass, FlowRect, InlineAlign, InlineStyle, Prim,
    body::{AttachmentPdfControls, TableCellHit},
    inline::truncate_to_width,
    mirror_x_in_width,
};

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

fn semantic_callout_color(name: &str, theme: crate::theme::PlaygroundTheme) -> Option<ui::Hsla> {
    let var = match name.trim().to_ascii_lowercase().as_str() {
        "red" => "--affine-tag-red",
        "orange" => "--affine-tag-orange",
        "yellow" => "--affine-tag-yellow",
        "green" => "--affine-tag-green",
        "teal" => "--affine-tag-teal",
        "blue" => "--affine-tag-blue",
        "purple" => "--affine-tag-purple",
        "magenta" | "pink" => "--affine-tag-pink",
        "grey" | "gray" => "--affine-tag-gray",
        _ => return theme.css_color(name),
    };
    theme.css_var(var).or_else(|| theme.css_color(name))
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
        let pad_x = 14.0;
        let pad_y = 12.0;
        let icon_box = 24.0;
        let resolved = background_color.and_then(|c| semantic_callout_color(c, self.input.theme));
        let fill = resolved.unwrap_or_else(|| self.palette.background_secondary);
        let tint = if fill.a > 0.35 {
            fill.opacity(0.18)
        } else {
            fill
        };
        let border = resolved
            .map(|c| c.opacity(0.32))
            .unwrap_or(self.palette.border);

        let icon_text = if icon.trim().is_empty() {
            "\u{1F4A1}"
        } else {
            icon.trim()
        };
        let icon_x = mirror_x_in_width(pad_x, icon_box, width, self.direction);
        let icon_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_base_px,
            600.0,
            self.palette.text_primary,
        );
        let icon_layout =
            self.plain_inline(icon_text, icon_style, icon_box, 22.0, InlineAlign::Center);
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
                y: pad_y,
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
                rect: FlowRect::new(icon_x + 2.0, pad_y + 1.0, 20.0, 20.0),
                icon: IconPaint::named(fallback_name),
                color: resolved.unwrap_or(self.palette.icon),
            }
        };

        let title_trimmed = text.trim();
        let text_w = (width - pad_x * 2.0 - icon_box - 8.0).max(1.0);
        let title_x = match self.direction {
            ui::Direction::Ltr => pad_x + icon_box + 8.0,
            ui::Direction::Rtl => pad_x,
        };
        let mut prims = vec![
            Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, pad_y * 2.0 + 22.0),
                fill: Some(tint),
                border: Some(border),
                radius: 8.0,
                dashed: false,
            },
            icon_prim,
        ];
        let content_h = if !title_trimmed.is_empty() {
            let title_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_sm_px,
                600.0,
                self.palette.text_primary,
            );
            let align = match self.direction {
                ui::Direction::Ltr => InlineAlign::Left,
                ui::Direction::Rtl => InlineAlign::Right,
            };
            let title_layout = self.plain_inline(title_trimmed, title_style, text_w, 22.0, align);
            let h = title_layout.height().max(22.0);
            prims.push(Prim::Text {
                x: title_x,
                y: pad_y,
                layout: title_layout,
                clip: None,
            });
            h
        } else {
            22.0
        };
        let height = if has_children && title_trimmed.is_empty() {
            pad_y + 22.0
        } else {
            pad_y * 2.0 + content_h
        };
        if let Some(Prim::Quad { rect, .. }) = prims.first_mut() {
            rect.h = height;
        }

        BlockBody {
            kind: FlowKind::Callout,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: if has_children { 4.0 } else { CARD_BLOCK_MARGIN },
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

    pub(super) fn table_body(&mut self, data: &TableData, width: f32) -> BlockBody {
        let col_count = data.columns.len().max(1);
        let row_count = data.rows.len().max(1);
        // Logical inline-start to inline-end column ordering.
        let ordered_cols: Vec<usize> = match self.direction {
            ui::Direction::Ltr => (0..data.columns.len()).collect(),
            ui::Direction::Rtl => (0..data.columns.len()).rev().collect(),
        };
        // Scale column weights proportionally so even 8+ column tables never overflow `width`.
        let raw_weights: Vec<f32> = ordered_cols
            .iter()
            .map(|&idx| data.columns[idx].width.unwrap_or(160.0).max(20.0) as f32)
            .collect();
        let weight_sum: f32 = raw_weights.iter().sum::<f32>().max(1.0);
        let col_widths: Vec<f32> = if raw_weights.is_empty() {
            vec![width.max(1.0)]
        } else {
            let mut widths: Vec<f32> = raw_weights
                .iter()
                .map(|w| (width * (*w / weight_sum)).floor().max(1.0))
                .collect();
            let used: f32 = widths.iter().sum();
            let rem = width - used;
            if let Some(last) = widths.last_mut() {
                *last = (*last + rem).max(1.0);
            }
            widths
        };
        let table_w = width.max(1.0);
        let cell_pad_x = if (table_w / col_count as f32) < 52.0 {
            4.0
        } else {
            10.0
        };
        let cell_pad_y = 8.0;
        let line_h = 20.0;

        let mut prims = Vec::new();
        let mut table_cells = Vec::new();
        let mut y = 0.0_f32;
        let mut plain_rows = Vec::with_capacity(row_count);
        let empty_rich = blocksuite_playground_doc::read::RichText::default();
        let block_align = match self.direction {
            ui::Direction::Ltr => blocksuite_playground_doc::read::TextAlign::Left,
            ui::Direction::Rtl => blocksuite_playground_doc::read::TextAlign::Right,
        };

        for (r_idx, row) in data.rows.iter().enumerate() {
            let is_header = r_idx == 0;
            let spec = super::TextSpec {
                font_size: TYPOGRAPHY.font_sm_px,
                font_weight: if is_header { 600.0 } else { 400.0 },
                line_height: line_h,
                baseline: 15.0,
                letter_spacing: 0.0,
                margin_top: 0.0,
                margin_bottom: 0.0,
            };
            let mut row_layouts = Vec::with_capacity(ordered_cols.len());
            let mut row_h = line_h + 2.0 * cell_pad_y;
            let mut row_texts = Vec::with_capacity(ordered_cols.len());

            for (visual_col, &c_idx) in ordered_cols.iter().enumerate() {
                let col = &data.columns[c_idx];
                let col_w = col_widths[visual_col];
                let inner_w = (col_w - 2.0 * cell_pad_x).max(1.0);
                let rich = data
                    .cells
                    .get(&(row.row_id.clone(), col.column_id.clone()))
                    .map(|c| &c.text)
                    .unwrap_or(&empty_rich);
                row_texts.push(rich.plain.clone());
                let layout =
                    self.block_text(rich, &spec, self.palette.text_primary, inner_w, block_align);
                row_h = row_h.max(layout.height() + 2.0 * cell_pad_y);
                row_layouts.push((col.column_id.clone(), col_w, layout));
            }
            plain_rows.push(row_texts.join(" | "));

            let mut cell_x = 0.0_f32;
            for (col_id, col_w, layout) in row_layouts {
                let cell_rect = FlowRect::new(cell_x, y, col_w, row_h);
                let fill = if is_header {
                    Some(self.palette.background_secondary)
                } else {
                    Some(self.palette.background)
                };
                prims.push(Prim::Quad {
                    rect: cell_rect,
                    fill,
                    border: Some(self.palette.border),
                    radius: 0.0,
                    dashed: false,
                });
                let text_x = cell_x + cell_pad_x;
                let text_y = y + cell_pad_y;
                prims.push(layout.prim(text_x, text_y));
                table_cells.push(TableCellHit {
                    row_id: row.row_id.clone(),
                    column_id: col_id,
                    rect: cell_rect,
                    text_origin: (text_x, text_y),
                    text: layout,
                });
                cell_x += col_w;
            }
            y += row_h;
        }

        let height = y.max(36.0);
        if data.rows.is_empty() {
            prims.push(Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, table_w, height),
                fill: Some(self.palette.background_secondary),
                border: Some(self.palette.border),
                radius: 6.0,
                dashed: false,
            });
        }

        BlockBody {
            kind: FlowKind::Table,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: plain_rows.join("\n"),
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells,
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
            let footer_h = 40.0;
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

            // Rendered PDF page image framed on crisp white paper.
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

            // Footer pagination bar: Prev | Page k / N | Next.
            let footer_y = total_h - footer_h;
            let btn_w = 64.0;
            let btn_h = 28.0;
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
                prims.push(Prim::Quad {
                    rect,
                    fill: Some(self.palette.background),
                    border: Some(self.palette.border),
                    radius: 6.0,
                    dashed: false,
                });
                prims.push(Prim::Text {
                    x: rect.x,
                    y: rect.y + 4.0,
                    layout: self.plain_inline(
                        text,
                        btn_style.clone(),
                        rect.w,
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
                y: footer_y + 10.0,
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

        // Compact horizontal file card mode.
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

    pub(super) fn embed_linked_doc_body(
        &mut self,
        page_id: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let resolved_title = self
            .input
            .page_titles
            .get(page_id)
            .filter(|s| !s.is_empty())
            .map(String::as_str)
            .unwrap_or("Untitled");
        let card_h = 72.0;
        let pad = 14.0;
        let inner_w = (width - pad * 2.0 - 32.0).max(40.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let sub_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let title_str = truncate_to_width(self.window, resolved_title, &title_style, inner_w)
            .text
            .to_string();
        let sub = format!("Linked doc  {page_id}");
        let sub_str = truncate_to_width(self.window, &sub, &sub_style, inner_w)
            .text
            .to_string();
        let mut body = BlockBody {
            kind: FlowKind::EmbedLinkedDoc,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: resolved_title.to_string(),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, card_h),
                    fill: Some(self.palette.background),
                    border: Some(self.palette.card_border),
                    radius: 8.0,
                    dashed: false,
                },
                Prim::Icon {
                    rect: FlowRect::new(pad, 16.0, 20.0, 20.0),
                    icon: IconPaint::named("LinkedPageIcon"),
                    color: self.palette.brand,
                },
                Prim::Text {
                    x: pad + 28.0,
                    y: 14.0,
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
                    x: pad + 28.0,
                    y: 38.0,
                    layout: self.plain_inline(
                        &sub_str,
                        sub_style,
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

    pub(super) fn embed_synced_doc_body(
        &mut self,
        page_id: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let resolved_title = self
            .input
            .page_titles
            .get(page_id)
            .filter(|s| !s.is_empty())
            .map(String::as_str)
            .unwrap_or("Untitled");
        let card_h = 88.0;
        let pad = 14.0;
        let inner_w = (width - pad * 2.0 - 32.0).max(40.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let body_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let title_str = truncate_to_width(self.window, resolved_title, &title_style, inner_w)
            .text
            .to_string();
        let preview_line = format!("Synced document preview ({page_id})");
        let mut body = BlockBody {
            kind: FlowKind::EmbedSyncedDoc,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: resolved_title.to_string(),
            prims: vec![
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, width, card_h),
                    fill: Some(self.palette.background_secondary),
                    border: Some(self.palette.brand.opacity(0.45)),
                    radius: 8.0,
                    dashed: false,
                },
                Prim::Quad {
                    rect: FlowRect::new(0.0, 0.0, 3.0, card_h),
                    fill: Some(self.palette.brand),
                    border: None,
                    radius: 1.5,
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
                Prim::Text {
                    x: pad,
                    y: 44.0,
                    layout: self.plain_inline(
                        &preview_line,
                        body_style,
                        (width - 2.0 * pad).max(40.0),
                        20.0,
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
}
