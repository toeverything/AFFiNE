use std::{ops::Range, sync::Arc};

use ui::gpui_util::ResultExt as _;
use ui::{
    App, Bounds, Hsla, IntoElement, Pixels, Point, Styled, TextAlign, Window, canvas, fill, point,
    px, size,
};

use super::{CaretPosition, DecorationKind, IconPaint, LaidOutRichParagraph};

impl LaidOutRichParagraph {
    /// Paint the paragraph with its top-left corner at `origin`: decorations, the given
    /// selection fills, glyphs, strokes, then the given carets.
    pub fn paint_at(
        &self,
        origin: Point<Pixels>,
        selections: &[(Range<u64>, Hsla)],
        carets: &[(CaretPosition, Hsla)],
        hovered_link: Option<&Range<u64>>,
        window: &mut Window,
        cx: &mut App,
    ) {
        static PAGE_ICON: std::sync::OnceLock<IconPaint> = std::sync::OnceLock::new();
        let translated = |b: Bounds<Pixels>| Bounds::new(origin + b.origin, b.size);
        let style = &self.style;
        for d in &self.decorations {
            let bounds = translated(d.bounds);
            match &d.kind {
                DecorationKind::Highlight | DecorationKind::ReferenceChip(_) => {
                    window.paint_quad(fill(bounds, d.color));
                }
                DecorationKind::CodePill => window.paint_quad(
                    fill(bounds, d.color)
                        .corner_radii(px(style.code_radius))
                        .border_widths(px(style.code_border_width))
                        .border_color(style.code_border),
                ),
                DecorationKind::PageGlyph => PAGE_ICON
                    .get_or_init(|| IconPaint::named("LinkedPageIcon"))
                    .paint(bounds, d.color, window, cx),
                _ => {}
            }
        }
        for (range, color) in selections {
            for rect in self.selection_rects(range.start, range.end) {
                window.paint_quad(fill(translated(rect), *color));
            }
        }
        for line in &self.lines {
            for fragment in &line.fragments {
                let shaped = &fragment.shaped;
                let glyph_origin = origin + point(fragment.x, line.baseline_y - shaped.ascent);
                shaped
                    .paint(
                        glyph_origin,
                        shaped.ascent + shaped.descent,
                        TextAlign::Left,
                        None,
                        window,
                        cx,
                    )
                    .log_err();
            }
        }
        for d in &self.decorations {
            if matches!(
                d.kind,
                DecorationKind::Underline
                    | DecorationKind::Strikethrough
                    | DecorationKind::ReferenceDivider
            ) {
                window.paint_quad(fill(translated(d.bounds), d.color));
            } else if matches!(d.kind, DecorationKind::Link(_))
                && hovered_link
                    .is_some_and(|r| r.start < d.source_utf16.end && d.source_utf16.start < r.end)
            {
                let line = &self.lines[self
                    .lines
                    .partition_point(|line| line.top < d.bounds.origin.y)];
                let stroke = Bounds::new(
                    point(d.bounds.origin.x, line.baseline_y + px(1.)),
                    size(d.bounds.size.width, px(1.)),
                );
                window.paint_quad(fill(translated(stroke), d.color));
            }
        }
        self.paint_carets(origin, carets, window);
    }

    /// Paint only the carets, for callers that clip the paragraph but not its carets.
    pub fn paint_carets(
        &self,
        origin: Point<Pixels>,
        carets: &[(CaretPosition, Hsla)],
        window: &mut Window,
    ) {
        for (position, color) in carets {
            let rect = self.caret_rect(*position);
            window.paint_quad(fill(Bounds::new(origin + rect.origin, rect.size), *color));
        }
    }
}

/// The caller can supply highlights and carets for any number of local or remote users.
pub struct RichParagraphElement {
    pub layout: Arc<LaidOutRichParagraph>,
    pub hovered_link: Option<Range<u64>>,
    pub selections: Vec<(Range<u64>, Hsla)>,
    pub carets: Vec<(CaretPosition, Hsla)>,
}

impl RichParagraphElement {
    pub fn new(layout: Arc<LaidOutRichParagraph>) -> Self {
        Self {
            layout,
            hovered_link: None,
            selections: Vec::new(),
            carets: Vec::new(),
        }
    }

    fn paint(self, bounds: Bounds<Pixels>, window: &mut Window, cx: &mut App) {
        let layout = &self.layout;
        // Glyphs and decorations stay inside the element; carets may sit on its edge.
        window.with_content_mask(Some(ui::ContentMask { bounds }), |window| {
            layout.paint_at(
                bounds.origin,
                &self.selections,
                &[],
                self.hovered_link.as_ref(),
                window,
                cx,
            );
        });
        layout.paint_carets(bounds.origin, &self.carets, window);
    }
}

impl IntoElement for RichParagraphElement {
    type Element = ui::Canvas<()>;

    fn into_element(self) -> Self::Element {
        let size = self.layout.size();
        canvas(
            |_, _, _| (),
            move |bounds, (), window, cx| self.paint(bounds, window, cx),
        )
        .w(size.width)
        .h(size.height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rich_text::{RichParagraph, RichParagraphStyle, WrapAffinity};
    use ui::{
        AppContext as _, Application, FontStyle, HeadlessPlatform, Platform as _, WindowTextSystem,
    };
    use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

    fn insert(text: &str, format: Option<TextAttributes>) -> TextDeltaOp {
        TextDeltaOp::Insert {
            insert: TextInsert::Text(text.into()),
            format,
        }
    }

    struct InlineSample(Arc<LaidOutRichParagraph>);

    impl ui::Render for InlineSample {
        fn render(&mut self, _: &mut Window, _: &mut ui::Context<Self>) -> impl IntoElement {
            let mut element = RichParagraphElement::new(self.0.clone());
            element.selections.push((0..1, ui::rgb(0xddffdd).into()));
            element.carets.push((
                CaretPosition {
                    utf16_offset: 0,
                    affinity: WrapAffinity::Downstream,
                },
                ui::rgb(0xff0000).into(),
            ));
            element
        }
    }

    #[test]
    fn inline_pills_links_selections_carets_and_italic_slant_paint_from_layout() {
        let platform = HeadlessPlatform::new(320, 64, 1.);
        let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
            let reference = Any::Object(Box::new(
                [
                    ("type".into(), Any::String("Subpage".into())),
                    ("pageId".into(), Any::String("Home".into())),
                ]
                .into_iter()
                .collect(),
            ));
            let para = RichParagraph::from_delta(vec![
                insert("A ", None),
                insert(
                    "code",
                    Some([("code".into(), Any::True), ("strike".into(), Any::True)].into()),
                ),
                insert(
                    "link",
                    Some([("link".into(), Any::String("https://example.org".into()))].into()),
                ),
                insert(" ", Some([("reference".into(), reference)].into())),
            ])
            .unwrap();
            let ts = WindowTextSystem::new(cx.text_system().clone());
            let style = RichParagraphStyle::default();
            let layout = Arc::new(para.layout(&ts, &style, 320.));
            let decorations = layout.inline_decorations();
            let code = decorations
                .iter()
                .find(|d| d.kind == DecorationKind::CodePill)
                .unwrap();
            assert_eq!(code.source_utf16, 2..6);
            assert!(
                decorations
                    .iter()
                    .any(|d| d.kind == DecorationKind::Strikethrough)
            );
            assert!(decorations.iter().any(
                |d| matches!(d.kind, DecorationKind::Link(_)) && d.source_utf16 == (6..10)
            ));
            assert!(
                !decorations
                    .iter()
                    .any(|d| d.kind == DecorationKind::Underline)
            );
            let chip = decorations
                .iter()
                .find(|d| matches!(d.kind, DecorationKind::ReferenceChip(_)))
                .unwrap();
            assert_eq!(chip.source_utf16, 10..11);
            let rect = layout.selection_rects(10, 11)[0];
            assert_eq!(rect.origin.x, chip.bounds.origin.x);
            assert_eq!(rect.size.width, chip.bounds.size.width);
            assert_eq!(
                layout
                    .hit_test(rect.origin + point(rect.size.width * 0.75, px(1.)))
                    .utf16_offset,
                11
            );
            cx.open_window(
                ui::WindowOptions {
                    window_bounds: Some(ui::WindowBounds::Windowed(Bounds::new(
                        point(px(0.), px(0.)),
                        size(px(320.), px(64.)),
                    ))),
                    ..Default::default()
                },
                |_, cx| cx.new(|_| InlineSample(layout)),
            )
            .unwrap();
        });
        platform.windows()[0].request_frame();
        app.update(|cx| {
            let view = cx.windows()[0].downcast::<InlineSample>().unwrap();
            view.update(cx, |_, window, _| {
                let scene = window.rendered_scene();
                assert!(scene.monochrome_sprites.len() >= 8);
                let image = window.render_to_image().unwrap();
                assert!(
                    image.pixels().any(|p| p.0 == [255, 0, 0, 255]),
                    "caret should paint over the selection"
                );
                assert!(
                    image.pixels().any(|p| p.0 == [221, 255, 221, 255]),
                    "selection fill should be visible"
                );
            })
            .unwrap();

            // Variable-font italic slants rasterized glyph ink.
            let system = platform.text_system();
            let measure = |style| {
                let mut font = ui::font("Inter");
                font.style = style;
                let font_id = cx.text_system().resolve_font(&font);
                let text = "Native BlockSuite";
                let font_size = px(24.);
                let line = system.layout_line(
                    text,
                    font_size,
                    &[ui::FontRun {
                        len: text.len(),
                        font_id,
                    }],
                );
                let mut moments = [0.; 2];
                let mut masses = [0.; 2];
                for run in line.runs {
                    for glyph in run.glyphs {
                        if text.as_bytes()[glyph.index] == b' ' {
                            continue;
                        }
                        let params = ui::RenderGlyphParams {
                            font_id: run.font_id,
                            glyph_id: glyph.id,
                            font_size,
                            subpixel_variant: point(0, 0),
                            scale_factor: 1.,
                            is_emoji: false,
                            subpixel_rendering: false,
                            dilation: 0,
                        };
                        let bounds = system.glyph_raster_bounds(&params).unwrap();
                        let (size, mask) = system.rasterize_glyph(&params, bounds).unwrap();
                        let w = size.width.0 as usize;
                        let h = size.height.0 as usize;
                        assert_eq!(mask.len(), w * h);
                        for (i, alpha) in mask.into_iter().enumerate() {
                            let half = usize::from(i / w >= h / 2);
                            let x = bounds.origin.x.0 as f64 + (i % w) as f64;
                            masses[half] += f64::from(alpha);
                            moments[half] += x * f64::from(alpha);
                        }
                    }
                }
                assert!(masses.into_iter().all(|m| m > 0.));
                moments[0] / masses[0] - moments[1] / masses[1]
            };
            let normal = measure(FontStyle::Normal);
            let italic = measure(FontStyle::Italic);
            assert!(
                italic > normal + 0.5,
                "top-minus-bottom ink centroids: italic {italic}, upright {normal}"
            );
        });
    }
}
