use std::rc::Rc;

use blocksuite_playground_doc::{
    read::{RichText, TextAlign as BlockAlign},
    schema::{ListType, ParagraphType},
};

use crate::theme::{FONT_CODE, FONT_SANS, IconPaint, TYPOGRAPHY};

use super::*;

impl FlowPass<'_> {
    pub(super) fn paragraph_body(
        &mut self,
        kind: ParagraphType,
        text: &RichText,
        collapsed: bool,
        width: f32,
        align: BlockAlign,
    ) -> BlockBody {
        let spec = paragraph_spec(kind);
        let (pad_start, pad_top, pad_bottom) = match kind {
            ParagraphType::Quote => QUOTE_PADDING,
            _ => (0.0, 0.0, 0.0),
        };
        let text_x = match self.direction {
            ui::Direction::Ltr => pad_start,
            ui::Direction::Rtl => 0.0,
        };
        let layout = self.block_text(
            text,
            &spec,
            self.palette.text_primary,
            width - pad_start,
            align,
        );
        let height = pad_top + layout.height() + pad_bottom;
        let mut prims = Vec::new();
        if kind == ParagraphType::Quote {
            let bar_x = mirror_x_in_width(0.0, QUOTE_BAR_WIDTH, width, self.direction);
            prims.push(Prim::Quad {
                rect: FlowRect::new(
                    bar_x,
                    pad_top,
                    QUOTE_BAR_WIDTH,
                    height - pad_top - pad_bottom,
                ),
                fill: Some(self.palette.quote),
                border: None,
                radius: QUOTE_BAR_WIDTH / 2.0,
                dashed: false,
            });
        }
        if collapsed {
            // A collapsed heading or paragraph with children hides its subtree; a marker in
            // the logical inline-start gutter, on its first line, makes the fold reachable.
            prims.push(Prim::Chevron {
                rect: heading_marker_rect_for_direction(spec.line_height, width, self.direction),
                collapsed: true,
                color: self.palette.icon,
            });
        }
        prims.push(layout.prim(text_x, pad_top));
        BlockBody {
            kind: FlowKind::Paragraph(kind),
            width,
            height,
            margin_top: spec.margin_top,
            margin_bottom: spec.margin_bottom,
            plain: text.plain.clone(),
            prims,
            text: Some(FlowText {
                x: text_x,
                y: pad_top,
                layout,
            }),
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }

    pub(super) fn list_body(
        &mut self,
        kind: ListType,
        checked: bool,
        collapsed: bool,
        text: &RichText,
        numbered_index: u32,
        list_depth: usize,
        width: f32,
        align: BlockAlign,
    ) -> BlockBody {
        let spec = paragraph_spec(ParagraphType::Text);
        let ink = if kind == ListType::Todo && checked {
            self.palette.text_secondary
        } else {
            self.palette.text_primary
        };
        let line_height = spec.line_height;
        let marker = self.palette.list_marker;
        let mut prims = Vec::new();
        let mut prefix_span = LIST_PREFIX_WIDTH;
        let prefix;
        // Every prefix is placed against the first line of text, never the whole block.
        let prefix_height = match kind {
            ListType::Toggle => line_height,
            _ => LIST_PREFIX_WIDTH,
        };
        let center_y = (prefix_height / 2.0).floor();

        match kind {
            ListType::Bulleted => {
                let (size, filled, radius) = match list_depth % 4 {
                    0 => (6.0, true, 3.0),
                    1 => (6.0, false, 3.0),
                    2 => (6.0, true, 1.0),
                    _ => (6.0, false, 1.0),
                };
                let origin = (LIST_PREFIX_WIDTH - size) / 2.0;
                let x = mirror_x_in_width(origin, size, width, self.direction);
                prefix = FlowRect::new(x, center_y - size / 2.0, size, size);
                prims.push(Prim::Quad {
                    rect: prefix,
                    fill: filled.then_some(marker),
                    border: (!filled).then_some(marker),
                    radius,
                    dashed: false,
                });
            }
            ListType::Numbered => {
                // The smaller number shares the baseline of the item's first line.
                let label = number_prefix(numbered_index, list_depth);
                let style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, marker);
                let layout = Rc::new(layout_inline(
                    &label,
                    &style,
                    f32::MAX,
                    line_height,
                    InlineBaseline::At(spec.baseline),
                    InlineAlign::Left,
                    self.window,
                ));
                let label_width = layout.content_width().ceil();
                prefix_span = (2.0 + label_width.max(22.0)).max(LIST_PREFIX_WIDTH);
                let x = mirror_x_in_width(2.0, label_width, width, self.direction);
                prefix = FlowRect::new(x, 0.0, label_width, line_height);
                prims.push(Prim::Text {
                    x,
                    y: 0.0,
                    layout,
                    clip: None,
                });
            }
            ListType::Todo => {
                let (icon, color) = if checked {
                    ("CheckBoxCheckSolidIcon", self.palette.brand)
                } else {
                    ("CheckBoxUnIcon", self.palette.icon)
                };
                let x = mirror_x_in_width(0.0, 20.0, width, self.direction);
                prefix = FlowRect::new(x, center_y - 10.0, 20.0, 20.0);
                prims.push(Prim::Icon {
                    rect: prefix,
                    icon: IconPaint::named(icon),
                    color,
                });
            }
            ListType::Toggle => {
                let x = mirror_x_in_width(2.0, 20.0, width, self.direction);
                prefix = FlowRect::new(x, center_y - 10.0, 20.0, 20.0);
                prims.push(Prim::Chevron {
                    rect: prefix,
                    collapsed,
                    color: marker,
                });
            }
        }

        if collapsed && kind != ListType::Toggle {
            prims.push(Prim::Chevron {
                rect: heading_marker_rect_for_direction(line_height, width, self.direction),
                collapsed: true,
                color: self.palette.icon,
            });
        }
        // The prefix stays at the logical start edge; only the text box follows the alignment.
        let text_x = match self.direction {
            ui::Direction::Ltr => prefix_span,
            ui::Direction::Rtl => 0.0,
        };
        let layout = self.block_text(text, &spec, ink, width - prefix_span, align);
        let height = layout.height().max(prefix_height);
        prims.push(layout.prim(text_x, 0.0));
        BlockBody {
            kind: FlowKind::List(kind),
            width,
            height,
            margin_top: TEXT_BLOCK_MARGIN,
            margin_bottom: TEXT_BLOCK_MARGIN,
            plain: text.plain.clone(),
            prims,
            text: Some(FlowText {
                x: text_x,
                y: 0.0,
                layout,
            }),
            prefix: Some(prefix),
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }

    pub(super) fn divider_body(&mut self, width: f32) -> BlockBody {
        BlockBody {
            kind: FlowKind::Divider,
            width,
            height: DIVIDER_HEIGHT,
            margin_top: TYPOGRAPHY.paragraph_space_px,
            margin_bottom: 0.0,
            plain: String::new(),
            prims: vec![Prim::Quad {
                rect: FlowRect::new(8.0, DIVIDER_HEIGHT / 2.0, (width - 16.0).max(0.0), 1.0),
                fill: Some(self.palette.divider),
                border: None,
                radius: 0.0,
                dashed: false,
            }],
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }

    /// Append a centered caption below a block body, if there is one.
    pub(super) fn push_caption(&self, body: &mut BlockBody, caption: &str) {
        if caption.is_empty() {
            return;
        }
        let style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, self.palette.icon);
        let layout = self.plain_inline(caption, style, body.width, 22.0, InlineAlign::Center);
        let y = body.height + 4.0;
        body.height = y + layout.height();
        body.prims.push(Prim::Text {
            x: 0.0,
            y,
            layout,
            clip: None,
        });
    }

    pub(super) fn code_body(
        &mut self,
        block_id: &str,
        language: &str,
        wrap: bool,
        explicit_line_number: Option<bool>,
        text: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let (pad_y, pad_x) = CODE_PADDING;
        let line_height = TYPOGRAPHY.font_xs_px + 8.0;
        let code_style = InlineStyle::new(
            FONT_CODE,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_primary,
        );
        let number_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let show_line_numbers =
            explicit_line_number.unwrap_or(self.input.form_factor != super::FormFactor::Phone);
        let code_x = if show_line_numbers {
            pad_x + CODE_GUTTER
        } else {
            pad_x
        };
        let code_width = (width - code_x - pad_x).max(1.0);

        let mut prims = Vec::new();
        let mut y = pad_y;
        let mut code_pieces = Vec::new();
        let mut line_offset = 0;
        let mut source_offset = 0;
        let mut widest_line = 0.0_f32;
        let highlighted_lines = crate::highlight::highlight_block_cached(block_id, language, text);
        let theme_mode = self.input.theme.mode();
        for (index, line) in text.split('\n').enumerate() {
            let hl_spans = highlighted_lines
                .get(index)
                .map(|hl| hl.spans.as_slice())
                .unwrap_or(&[]);
            let layout = Rc::new(super::inline::layout_highlighted_code_line(
                line,
                &code_style,
                hl_spans,
                theme_mode,
                if wrap { code_width } else { f32::MAX },
                line_height,
                self.window,
            ));
            if show_line_numbers {
                // Line numbers sit on the baseline of the code they count.
                let number = Rc::new(layout_inline(
                    &(index + 1).to_string(),
                    &number_style,
                    f32::MAX,
                    line_height,
                    InlineBaseline::Of(&code_style),
                    InlineAlign::Left,
                    self.window,
                ));
                prims.push(Prim::Text {
                    x: pad_x,
                    y,
                    layout: number,
                    clip: None,
                });
            }
            let height = layout.height();
            // Empty lines have a caret stop at x=0 even when no glyph was shaped.
            if layout.pieces.is_empty() {
                code_pieces.push(InlinePiece {
                    line: line_offset,
                    x: 0.0,
                    visible_width: 0.0,
                    baseline_shift: 0.0,
                    shaped: shape(self.window, "", &code_style),
                    source_start: source_offset,
                    source_len: 0,
                });
            }
            for piece in &layout.pieces {
                code_pieces.push(InlinePiece {
                    line: line_offset + piece.line,
                    source_start: source_offset + piece.source_start,
                    ..piece.clone()
                });
            }
            line_offset += layout.line_count;
            source_offset += line.encode_utf16().count() + 1;
            widest_line = widest_line.max(layout.content_width());
            prims.push(if wrap {
                Prim::Text {
                    x: code_x,
                    y,
                    layout,
                    clip: None,
                }
            } else {
                // Unwrapped lines stop at the block's padding edge and scroll sideways.
                Prim::CodeLine {
                    x: code_x,
                    y,
                    layout,
                    clip: FlowRect::new(code_x, y, code_width, height),
                }
            });
            y += height;
        }
        let height = y + pad_y;
        let max_scroll_x = (widest_line - code_width).max(0.0).ceil();
        let code_scroll = (!wrap && max_scroll_x > 0.0).then(|| CodeScroll {
            area: FlowRect::new(code_x, pad_y, code_width, y - pad_y),
            max_x: max_scroll_x,
            initial_x: 0.0,
        });

        prims.insert(
            0,
            Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, height),
                fill: Some(self.palette.code_background),
                border: None,
                radius: CODE_RADIUS,
                dashed: false,
            },
        );
        let label = if language.is_empty() {
            "Plain Text"
        } else {
            language
        };
        let label_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let label_layout = self.plain_inline(label, label_style, f32::MAX, 16.0, InlineAlign::Left);
        prims.push(Prim::Text {
            x: pad_x,
            y: 8.0,
            layout: label_layout,
            clip: Some(FlowRect::new(
                pad_x,
                8.0,
                (width - 2.0 * pad_x).max(0.0),
                16.0,
            )),
        });

        let mut body = BlockBody {
            kind: FlowKind::Code,
            width,
            height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: text.to_string(),
            prims,
            text: Some(FlowText {
                x: code_x,
                y: pad_y,
                layout: FlowTextLayout::Plain(Rc::new(InlineLayout {
                    pieces: code_pieces,
                    line_count: line_offset,
                    line_height,
                    width: code_width,
                    baseline: baseline_in_line(line_height, &shape(self.window, "Ag", &code_style)),
                })),
            }),
            prefix: None,
            code_scroll,
            pdf_controls: None,
            table_cells: Vec::new(),
        };
        self.push_caption(&mut body, caption);
        body
    }

    pub(super) fn image_body(
        &mut self,
        source_id: &str,
        image_width: Option<f64>,
        image_height: Option<f64>,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let slot = self.input.images.get(source_id);
        let natural = match slot {
            Some(ImageSlot::Ready(image)) => {
                let size = image.size(0);
                Some((size.width.0 as f32, size.height.0 as f32))
            }
            _ => None,
        };
        // Explicit block dimensions win; otherwise the image's own size, then a 16:9 frame.
        let (mut w, mut h) = match (image_width, image_height, natural) {
            (Some(w), Some(h), _) => (w as f32, h as f32),
            (Some(w), None, Some((nw, nh))) if nw > 0.0 => (w as f32, w as f32 * nh / nw),
            (_, _, Some(natural)) => natural,
            _ => (480.0, 270.0),
        };
        if w > width && w > 0.0 {
            h *= width / w;
            w = width;
        }
        let (w, h) = (w.round().max(1.0), h.round().max(1.0));
        let x = ((width - w) / 2.0).floor().max(0.0);

        let mut prims = Vec::new();
        let plain;
        match slot {
            Some(ImageSlot::Ready(image)) => {
                plain = caption.to_string();
                prims.push(Prim::Image {
                    rect: FlowRect::new(x, 0.0, w, h),
                    image: image.clone(),
                });
            }
            other => {
                // Media frame shown until the blob arrives (or when it cannot be shown).
                // Longest wording first; a small frame falls back to a shorter one.
                let wordings: &[&str] = if matches!(other, Some(ImageSlot::Unavailable)) {
                    &["Image unavailable", "Unavailable", "No image"]
                } else {
                    &["Loading image", "Loading"]
                };
                let status = wordings[0];
                plain = status.to_string();
                prims.push(Prim::Quad {
                    rect: FlowRect::new(x, 0.0, w, h),
                    fill: Some(self.palette.background_secondary),
                    border: Some(self.palette.border),
                    radius: 8.0,
                    dashed: false,
                });
                let inner = (w - 24.0).max(1.0);
                let status_style = InlineStyle::new(
                    FONT_SANS,
                    TYPOGRAPHY.font_sm_px,
                    500.0,
                    self.palette.text_secondary,
                );
                let fitting = wordings
                    .iter()
                    .find(|wording| {
                        f32::from(shape(self.window, wording, &status_style).width()) <= inner
                    })
                    .unwrap_or(&status);
                let lines = [
                    (fitting.to_string(), status_style, 22.0),
                    (
                        format!("{} \u{00d7} {}", w as i64, h as i64),
                        InlineStyle::new(
                            FONT_SANS,
                            TYPOGRAPHY.font_xs_px,
                            400.0,
                            self.palette.text_secondary,
                        ),
                        20.0,
                    ),
                    (
                        source_id.to_string(),
                        InlineStyle::new(
                            FONT_CODE,
                            TYPOGRAPHY.font_xs_px,
                            400.0,
                            self.palette.text_secondary,
                        ),
                        20.0,
                    ),
                ];
                let total: f32 = lines.iter().map(|(_, _, line_height)| line_height).sum();
                let mut y = ((h - total) / 2.0).floor().max(0.0);
                for (text, style, line_height) in lines {
                    if y + line_height > h {
                        break;
                    }
                    let shaped = truncate_to_width(self.window, &text, &style, inner);
                    let text = shaped.text.to_string();
                    let layout =
                        self.plain_inline(&text, style, inner, line_height, InlineAlign::Center);
                    prims.push(Prim::Text {
                        x: x + 12.0,
                        y,
                        layout,
                        clip: None,
                    });
                    y += line_height;
                }
            }
        }

        let mut body = BlockBody {
            kind: FlowKind::Image,
            width,
            height: h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain,
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

    pub(super) fn bookmark_body(
        &mut self,
        url: &str,
        title: Option<&str>,
        description: Option<&str>,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        // 1px border plus the content's 12px padding.
        let pad = 13.0;
        let inner = (width - 2.0 * pad).max(1.0);
        let host = host_name(url);
        let title = title.filter(|title| !title.is_empty()).unwrap_or(host);
        // Without a fetched description the card falls back to the address itself.
        let description = description
            .filter(|description| !description.is_empty())
            .unwrap_or(url);

        let mut prims = vec![Prim::Quad {
            rect: FlowRect::new(0.0, 0.0, width, BOOKMARK_HEIGHT),
            fill: Some(self.palette.background),
            border: Some(self.palette.card_border),
            radius: 8.0,
            dashed: false,
        }];

        // Title row: 16px link icon centered on the 22px title line.
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            600.0,
            self.palette.text_primary,
        );
        let title_x = pad + 16.0 + 8.0;
        let title_width = (width - title_x - pad).max(1.0);
        let title_text = truncate_to_width(self.window, title, &title_style, title_width)
            .text
            .to_string();
        prims.push(Prim::Icon {
            rect: FlowRect::new(pad, pad + 3.0, 16.0, 16.0),
            icon: IconPaint::named("LinkIcon"),
            color: self.palette.icon,
        });
        prims.push(Prim::Text {
            x: title_x,
            y: pad,
            layout: self.plain_inline(
                &title_text,
                title_style,
                title_width,
                22.0,
                InlineAlign::Left,
            ),
            clip: None,
        });

        // Description: at most two 20px lines.
        let description_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_primary,
        );
        let description_y = pad + 22.0 + 4.0;
        prims.push(Prim::Text {
            x: pad,
            y: description_y,
            layout: self.plain_inline(
                description,
                description_style,
                inner,
                20.0,
                InlineAlign::Left,
            ),
            clip: Some(FlowRect::new(pad, description_y, inner, 40.0)),
        });

        // Address row pinned to the bottom padding edge.
        let url_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            400.0,
            self.palette.text_secondary,
        );
        let url_text = truncate_to_width(self.window, host, &url_style, inner)
            .text
            .to_string();
        prims.push(Prim::Text {
            x: pad,
            y: BOOKMARK_HEIGHT - pad - 20.0,
            layout: self.plain_inline(&url_text, url_style, inner, 20.0, InlineAlign::Left),
            clip: None,
        });

        let mut body = BlockBody {
            kind: FlowKind::Bookmark,
            width,
            height: BOOKMARK_HEIGHT,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: title.to_string(),
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

    pub(super) fn database_body(
        &mut self,
        block_id: &str,
        data: &blocksuite_playground_doc::read::DatabaseData,
        width: f32,
    ) -> BlockBody {
        let ui_state = self.database_state.state_for(block_id);
        let offset_at = |ms: i64| self.input.utc_offset_for(ms);
        let output = crate::database::layout_database_block(
            data,
            &ui_state,
            width,
            self.input.theme,
            self.direction,
            self.input.form_factor,
            self.database_state.mobile_readonly,
            self.database_state.clock_ms,
            &offset_at,
            self.input.page_titles,
            self.window,
        );
        self.database_hits.insert(block_id.to_string(), output.hits);
        self.database_authoring_hits
            .insert(block_id.to_string(), output.authoring_hits);
        self.database_view_tabs_max_scroll.insert(
            block_id.to_string(),
            (output.view_tabs_scroll_px, output.view_tabs_max_scroll_px),
        );
        let prims = output
            .prims
            .into_iter()
            .map(|p| match p {
                crate::database::DatabasePrim::Quad {
                    rect,
                    fill,
                    border,
                    radius,
                    dashed,
                } => Prim::Quad {
                    rect,
                    fill,
                    border,
                    radius,
                    dashed,
                },
                crate::database::DatabasePrim::Text { x, y, layout, clip } => {
                    Prim::Text { x, y, layout, clip }
                }
                crate::database::DatabasePrim::Rich { x, y, layout, clip } => {
                    Prim::Rich { x, y, layout, clip }
                }
                crate::database::DatabasePrim::Icon { rect, icon, color } => {
                    Prim::Icon { rect, icon, color }
                }
                crate::database::DatabasePrim::Chevron {
                    rect,
                    collapsed,
                    color,
                } => Prim::Chevron {
                    rect,
                    collapsed,
                    color,
                },
            })
            .collect();
        BlockBody {
            kind: FlowKind::Database,
            width,
            height: output.height,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: output.plain,
            prims,
            text: None,
            prefix: None,
            code_scroll: output.code_scroll,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }
}

/// Host of a URL without scheme, credentials, port or path; the input itself if it has none.
pub(super) fn host_name(url: &str) -> &str {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    let host = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() { url } else { host }
}
