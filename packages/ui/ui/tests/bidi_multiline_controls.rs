#![cfg(not(target_family = "wasm"))]

use std::borrow::Cow;
use ui::{
    BaseDirection, Bounds, DevicePixels, Font, FontId, FontMetrics, FontRun, GlyphId, LineLayout,
    Pixels, PlatformTextSystem, RenderGlyphParams, ShapedGlyph, ShapedRun, Size, TextRenderingMode,
    point, px, reorder_line_visual_runs, size,
};

/// Deterministic fixed-width UAX #9 shaper for integration tests (zero host font dependency).
struct DeterministicBidiTextSystem;

impl PlatformTextSystem for DeterministicBidiTextSystem {
    fn add_fonts(&self, _fonts: Vec<Cow<'static, [u8]>>) -> anyhow::Result<()> {
        Ok(())
    }

    fn all_font_names(&self) -> Vec<String> {
        vec!["TestSans".to_string()]
    }

    fn font_id(&self, _descriptor: &Font) -> anyhow::Result<FontId> {
        Ok(FontId(0))
    }

    fn font_metrics(&self, _font_id: FontId) -> FontMetrics {
        FontMetrics {
            units_per_em: 1000,
            ascent: 800.0,
            descent: -200.0,
            line_gap: 0.0,
            underline_position: -100.0,
            underline_thickness: 50.0,
            cap_height: 700.0,
            x_height: 500.0,
            bounding_box: Bounds::new(point(0.0, -200.0), size(600.0, 1000.0)),
        }
    }

    fn typographic_bounds(
        &self,
        _font_id: FontId,
        _glyph_id: GlyphId,
    ) -> anyhow::Result<Bounds<f32>> {
        Ok(Bounds::new(point(0.0, 0.0), size(10.0, 16.0)))
    }

    fn advance(&self, _font_id: FontId, _glyph_id: GlyphId) -> anyhow::Result<Size<f32>> {
        Ok(size(10.0, 0.0))
    }

    fn glyph_for_char(&self, _font_id: FontId, ch: char) -> Option<GlyphId> {
        Some(GlyphId(ch as u32))
    }

    fn glyph_raster_bounds(
        &self,
        _params: &RenderGlyphParams,
    ) -> anyhow::Result<Bounds<DevicePixels>> {
        Ok(Bounds::default())
    }

    fn rasterize_glyph(
        &self,
        _params: &RenderGlyphParams,
        _raster_bounds: Bounds<DevicePixels>,
    ) -> anyhow::Result<(Size<DevicePixels>, Vec<u8>)> {
        Ok((Size::default(), Vec::new()))
    }

    fn layout_line(&self, text: &str, font_size: Pixels, runs: &[FontRun]) -> LineLayout {
        self.layout_line_with_direction(text, font_size, runs, BaseDirection::Ltr)
    }

    fn layout_line_with_direction(
        &self,
        text: &str,
        font_size: Pixels,
        _runs: &[FontRun],
        base_direction: BaseDirection,
    ) -> LineLayout {
        let visual_runs = reorder_line_visual_runs(text, base_direction, 0..text.len());
        let mut shaped_runs = Vec::with_capacity(visual_runs.len());
        let mut x = 0.0_f32;
        for vrun in visual_runs {
            let slice = &text[vrun.byte_range.clone()];
            let mut chars: Vec<(usize, char)> = slice
                .char_indices()
                .map(|(rel, ch)| (vrun.byte_range.start + rel, ch))
                .collect();
            if vrun.bidi_level % 2 == 1 {
                chars.reverse();
            }
            let mut glyphs = Vec::with_capacity(chars.len());
            for (byte_ix, ch) in chars {
                glyphs.push(ShapedGlyph {
                    id: GlyphId(ch as u32),
                    position: point(px(x), px(0.0)),
                    index: byte_ix,
                    is_emoji: false,
                });
                x += 10.0;
            }
            if !glyphs.is_empty() {
                shaped_runs.push(ShapedRun {
                    font_id: FontId(0),
                    glyphs,
                    bidi_level: vrun.bidi_level,
                });
            }
        }
        LineLayout {
            font_size,
            width: px(x),
            ascent: px(12.0),
            descent: px(4.0),
            runs: shaped_runs,
            len: text.len(),
            base_direction,
        }
    }

    fn recommended_rendering_mode(
        &self,
        _font_id: FontId,
        _font_size: Pixels,
    ) -> TextRenderingMode {
        TextRenderingMode::Grayscale
    }
}

#[cfg(feature = "harness")]
mod headless_controls {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;
    use std::sync::Arc;
    use ui::{
        AnyWindowHandle, AppContext, Application, Context, HeadlessPlatform, InteractiveText,
        IntoElement, Modifiers, MouseButton, MouseDownEvent, MouseUpEvent, ParentElement,
        PlatformInput, Render, SharedString, Styled, StyledText, TextRun, Window, WindowOptions,
        div, font,
    };

    #[test]
    fn styled_text_respects_ltr_rtl_auto_and_inherited_direction() {
        // Mixed Hebrew + Latin + trailing neutral period wrapping across two rows.
        let sample = "שלום hello world.";
        let dot_ix = sample.rfind('.').unwrap();
        let captured: Rc<RefCell<Vec<(BaseDirection, Pixels, Pixels)>>> =
            Rc::new(RefCell::new(Vec::new()));
        let captured_out = captured.clone();

        struct DirectionMatrixView {
            sample: &'static str,
            dot_ix: usize,
            captured: Rc<RefCell<Vec<(BaseDirection, Pixels, Pixels)>>>,
            layouts: Vec<(BaseDirection, ui::TextLayout)>,
        }

        impl Render for DirectionMatrixView {
            fn render(
                &mut self,
                _window: &mut Window,
                _cx: &mut Context<Self>,
            ) -> impl IntoElement {
                let ltr = StyledText::new(self.sample).text_direction(BaseDirection::Ltr);
                let rtl = StyledText::new(self.sample).text_direction(BaseDirection::Rtl);
                let auto =
                    StyledText::new(self.sample).text_direction(BaseDirection::AutoFirstStrong);
                let inherited_rtl = StyledText::new(self.sample);
                self.layouts = vec![
                    (BaseDirection::Ltr, ltr.layout().clone()),
                    (BaseDirection::Rtl, rtl.layout().clone()),
                    (BaseDirection::AutoFirstStrong, auto.layout().clone()),
                    (BaseDirection::Rtl, inherited_rtl.layout().clone()),
                ];
                div()
                    .flex()
                    .flex_col()
                    .w(px(110.0))
                    .child(div().w(px(110.0)).child(ltr))
                    .child(div().w(px(110.0)).child(rtl))
                    .child(div().w(px(110.0)).child(auto))
                    .child(div().w(px(110.0)).dir_rtl().child(inherited_rtl))
            }
        }

        let platform = HeadlessPlatform::new_with_text_system(
            320,
            300,
            1.0,
            Arc::new(DeterministicBidiTextSystem),
        );
        Application::with_platform(platform).run(move |cx| {
            let handle = cx
                .open_window(WindowOptions::default(), |_, cx| {
                    cx.new(|_| DirectionMatrixView {
                        sample,
                        dot_ix,
                        captured: captured_out,
                        layouts: Vec::new(),
                    })
                })
                .expect("open headless window");
            let any: AnyWindowHandle = handle.into();
            cx.update_window(any, |_, window, cx| {
                window.draw(cx).clear(cx);
            })
            .expect("draw direction matrix");
            handle
                .update(cx, |view, _window, _cx| {
                    for (dir, layout) in &view.layouts {
                        let dot_pos = layout
                            .position_for_index(view.dot_ix)
                            .expect("dot position");
                        let start_pos = layout.position_for_index(0).expect("start position");
                        view.captured
                            .borrow_mut()
                            .push((*dir, start_pos.x, dot_pos.x));
                    }
                })
                .expect("read layouts");
            cx.quit();
        });

        let results = captured.borrow();
        assert_eq!(results.len(), 4);
        let (_ltr, _ltr_start_x, ltr_dot_x) = results[0];
        let (_rtl, _rtl_start_x, rtl_dot_x) = results[1];
        let (_auto, _auto_start_x, auto_dot_x) = results[2];
        let (_inh, _inh_start_x, inh_dot_x) = results[3];

        // Under LTR base direction the trailing '.' sits to the right of its RTL position.
        assert!(
            ltr_dot_x > rtl_dot_x,
            "LTR period ({ltr_dot_x:?}) must sit right of RTL period ({rtl_dot_x:?})"
        );
        // Hebrew-leading AutoFirstStrong resolves to RTL, matching explicit RTL and inherited dir_rtl().
        assert_eq!(auto_dot_x, rtl_dot_x);
        assert_eq!(inh_dot_x, rtl_dot_x);
    }

    #[test]
    fn interactive_text_rtl_wrapped_link_hitboxes_match_visual_rows() {
        // RTL paragraph wrapping across 2 rows; the clickable link ("link") lands on row 1.
        let sample = "مرحبا سلام link هنا";
        let link_start = sample.find("link").unwrap();
        let link_range = link_start..link_start + "link".len();

        let clicked = Rc::new(Cell::new(0usize));
        let clicked_view = clicked.clone();
        let layout_slot: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
        let layout_view = layout_slot.clone();
        let link_range_view = link_range.clone();

        struct RtlLinkView {
            sample: &'static str,
            link_range: std::ops::Range<usize>,
            clicked: Rc<Cell<usize>>,
            layout_slot: Rc<RefCell<Option<ui::TextLayout>>>,
        }

        impl Render for RtlLinkView {
            fn render(
                &mut self,
                _window: &mut Window,
                _cx: &mut Context<Self>,
            ) -> impl IntoElement {
                let styled = StyledText::new(self.sample).text_direction(BaseDirection::Rtl);
                *self.layout_slot.borrow_mut() = Some(styled.layout().clone());
                let clicked = self.clicked.clone();
                div()
                    .w(px(110.0))
                    .child(InteractiveText::new("rtl-link", styled).on_click(
                        vec![self.link_range.clone()],
                        move |range_ix, _window, _cx| {
                            assert_eq!(range_ix, 0);
                            clicked.set(clicked.get() + 1);
                        },
                    ))
            }
        }

        let platform = HeadlessPlatform::new_with_text_system(
            320,
            240,
            1.0,
            Arc::new(DeterministicBidiTextSystem),
        );
        Application::with_platform(platform).run(move |cx| {
            let handle = cx
                .open_window(WindowOptions::default(), |_, cx| {
                    cx.new(|_| RtlLinkView {
                        sample,
                        link_range: link_range_view,
                        clicked: clicked_view,
                        layout_slot: layout_view,
                    })
                })
                .expect("open headless window");
            let any: AnyWindowHandle = handle.into();
            cx.update_window(any, |_, window, cx| {
                window.draw(cx).clear(cx);
            })
            .expect("draw rtl link view");

            let layout = layout_slot.borrow().clone().expect("layout populated");
            let bounds = layout.bounds();
            let line_height = layout.line_height();
            let link_pos = layout
                .position_for_index(link_range.start)
                .expect("link visual position");
            assert!(
                link_pos.y >= bounds.origin.y + line_height,
                "link should wrap onto second visual row (y={:?}, row1>={:?})",
                link_pos.y,
                bounds.origin.y + line_height
            );

            // Click at the visual center of the link on row 1 -> must trigger callback.
            // (`InteractiveText` arms its `MouseUp` listener on the redraw after `MouseDown`.)
            let hit_pt = point(link_pos.x + px(15.0), link_pos.y + line_height * 0.5);
            assert!(
                layout
                    .index_for_position(hit_pt)
                    .is_ok_and(|ix| link_range.contains(&ix)),
                "visual center of link must hit-test inside link_range"
            );
            cx.update_window(any, |_, window, cx| {
                window.dispatch_event(
                    PlatformInput::MouseDown(MouseDownEvent {
                        button: MouseButton::Left,
                        position: hit_pt,
                        modifiers: Modifiers::none(),
                        click_count: 1,
                        first_mouse: false,
                    }),
                    cx,
                );
                window.draw(cx).clear(cx);
                window.dispatch_event(
                    PlatformInput::MouseUp(MouseUpEvent {
                        button: MouseButton::Left,
                        position: hit_pt,
                        modifiers: Modifiers::none(),
                        click_count: 1,
                    }),
                    cx,
                );
                window.draw(cx).clear(cx);
            })
            .expect("dispatch click on visual link");

            // Click on row 0 where the link is NOT drawn -> must not trigger callback.
            let miss_pt = point(link_pos.x + px(15.0), bounds.origin.y + line_height * 0.5);
            cx.update_window(any, |_, window, cx| {
                window.dispatch_event(
                    PlatformInput::MouseDown(MouseDownEvent {
                        button: MouseButton::Left,
                        position: miss_pt,
                        modifiers: Modifiers::none(),
                        click_count: 1,
                        first_mouse: false,
                    }),
                    cx,
                );
                window.draw(cx).clear(cx);
                window.dispatch_event(
                    PlatformInput::MouseUp(MouseUpEvent {
                        button: MouseButton::Left,
                        position: miss_pt,
                        modifiers: Modifiers::none(),
                        click_count: 1,
                    }),
                    cx,
                );
            })
            .expect("dispatch click on wrong row");

            cx.quit();
        });

        assert_eq!(
            clicked.get(),
            1,
            "link click must fire only on its real visual row"
        );
    }

    #[test]
    fn wrapped_line_cache_keys_by_max_lines_in_both_orders() {
        let platform = HeadlessPlatform::new_with_text_system(
            320,
            240,
            1.0,
            Arc::new(DeterministicBidiTextSystem),
        );
        Application::with_platform(platform).run(move |cx| {
            let handle = cx
                .open_window(WindowOptions::default(), |_, cx| cx.new(|_| ui::Empty))
                .expect("open headless window");
            let any: AnyWindowHandle = handle.into();
            cx.update_window(any, |_, window, cx| {
                let run = |text: &str| {
                    vec![TextRun {
                        len: text.len(),
                        font: font("TestSans"),
                        color: ui::black(),
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }]
                };

                // Order A: 1-line clamp first, then unbounded multi-line (same frame).
                let text_a = "مرحبا سلام عالم طويل جدا";
                let one_line = window
                    .text_system()
                    .shape_text_with_direction(
                        SharedString::from(text_a),
                        px(16.0),
                        &run(text_a),
                        Some(px(80.0)),
                        Some(1),
                        BaseDirection::Rtl,
                    )
                    .expect("shape 1-line");
                let multi_line = window
                    .text_system()
                    .shape_text_with_direction(
                        SharedString::from(text_a),
                        px(16.0),
                        &run(text_a),
                        Some(px(80.0)),
                        None,
                        BaseDirection::Rtl,
                    )
                    .expect("shape multi-line");
                assert_eq!(one_line[0].size(px(20.0)).height, px(20.0));
                assert!(
                    multi_line[0].size(px(20.0)).height >= px(40.0),
                    "unbounded request must not hit stale 1-line cache entry"
                );

                // Order B: unbounded multi-line first, then 1-line clamp across a frame boundary
                // (`window.draw` calls `text_system().finish_frame()`).
                let text_b = "alpha beta gamma delta epsilon";
                let multi_first = window
                    .text_system()
                    .shape_text_with_direction(
                        SharedString::from(text_b),
                        px(16.0),
                        &run(text_b),
                        Some(px(80.0)),
                        None,
                        BaseDirection::Ltr,
                    )
                    .expect("shape multi-line first");
                window.draw(cx).clear(cx);
                let one_second = window
                    .text_system()
                    .shape_text_with_direction(
                        SharedString::from(text_b),
                        px(16.0),
                        &run(text_b),
                        Some(px(80.0)),
                        Some(1),
                        BaseDirection::Ltr,
                    )
                    .expect("shape 1-line second");
                assert!(multi_first[0].size(px(20.0)).height >= px(40.0));
                assert_eq!(
                    one_second[0].size(px(20.0)).height,
                    px(20.0),
                    "1-line request must not hit stale multi-line previous_frame cache entry"
                );
            })
            .expect("verify max_lines cache key");
            cx.quit();
        });
    }

    #[test]
    fn interactive_text_center_and_right_aligned_rtl_links_match_geometry() {
        // Fixed 10px/char: "مرحبا سلام " (11 chars = 110px) wraps onto row 0,
        // and "link" (4 chars = 40px) lands alone on row 1 inside a 120px box.
        // Right-aligned row 1 sits at x=80..120 (blank x=0..80).
        // Center-aligned row 1 sits at x=40..80 (blank x=0..40 and x=80..120).
        let sample = "مرحبا سلام link";
        let link_start = sample.find("link").unwrap();
        let link_range = link_start..link_start + "link".len();

        for (align, hit_x, miss_x) in [
            (ui::TextAlign::Right, 100.0_f32, 20.0_f32),
            (ui::TextAlign::Center, 60.0_f32, 15.0_f32),
        ] {
            let clicked = Rc::new(Cell::new(0usize));
            let clicked_view = clicked.clone();
            let layout_slot: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
            let layout_view = layout_slot.clone();
            let link_range_view = link_range.clone();

            struct AlignedLinkView {
                sample: &'static str,
                align: ui::TextAlign,
                link_range: std::ops::Range<usize>,
                clicked: Rc<Cell<usize>>,
                layout_slot: Rc<RefCell<Option<ui::TextLayout>>>,
            }

            impl Render for AlignedLinkView {
                fn render(
                    &mut self,
                    _window: &mut Window,
                    _cx: &mut Context<Self>,
                ) -> impl IntoElement {
                    let styled = StyledText::new(self.sample).text_direction(BaseDirection::Rtl);
                    *self.layout_slot.borrow_mut() = Some(styled.layout().clone());
                    let clicked = self.clicked.clone();
                    div().w(px(120.0)).text_align(self.align).child(
                        InteractiveText::new("aligned-rtl-link", styled).on_click(
                            vec![self.link_range.clone()],
                            move |range_ix, _window, _cx| {
                                assert_eq!(range_ix, 0);
                                clicked.set(clicked.get() + 1);
                            },
                        ),
                    )
                }
            }

            let platform = HeadlessPlatform::new_with_text_system(
                320,
                240,
                1.0,
                Arc::new(DeterministicBidiTextSystem),
            );
            let link_range_check = link_range.clone();
            Application::with_platform(platform).run(move |cx| {
                let handle = cx
                    .open_window(WindowOptions::default(), |_, cx| {
                        cx.new(|_| AlignedLinkView {
                            sample,
                            align,
                            link_range: link_range_view,
                            clicked: clicked_view,
                            layout_slot: layout_view,
                        })
                    })
                    .expect("open headless window");
                let any: AnyWindowHandle = handle.into();
                cx.update_window(any, |_, window, cx| {
                    window.draw(cx).clear(cx);
                })
                .expect("draw aligned link view");

                let layout = layout_slot.borrow().clone().expect("layout populated");
                let bounds = layout.bounds();
                let line_height = layout.line_height();
                let row1_mid_y = bounds.origin.y + line_height * 1.5;

                // Direct geometric coordinates (not read from position_for_index).
                let hit_pt = point(bounds.origin.x + px(hit_x), row1_mid_y);
                let miss_pt = point(bounds.origin.x + px(miss_x), row1_mid_y);
                assert!(
                    layout
                        .index_for_position(hit_pt)
                        .is_ok_and(|ix| link_range_check.contains(&ix)),
                    "align={align:?}: geometric glyph point {hit_pt:?} must map inside link_range"
                );
                assert!(
                    !layout
                        .index_for_position(miss_pt)
                        .is_ok_and(|ix| link_range_check.contains(&ix)),
                    "align={align:?}: blank margin point {miss_pt:?} must not map inside link_range"
                );

                // Real MouseDown -> draw -> MouseUp on glyph point -> +1.
                cx.update_window(any, |_, window, cx| {
                    window.dispatch_event(
                        PlatformInput::MouseDown(MouseDownEvent {
                            button: MouseButton::Left,
                            position: hit_pt,
                            modifiers: Modifiers::none(),
                            click_count: 1,
                            first_mouse: false,
                        }),
                        cx,
                    );
                    window.draw(cx).clear(cx);
                    window.dispatch_event(
                        PlatformInput::MouseUp(MouseUpEvent {
                            button: MouseButton::Left,
                            position: hit_pt,
                            modifiers: Modifiers::none(),
                            click_count: 1,
                        }),
                        cx,
                    );
                    window.draw(cx).clear(cx);
                })
                .expect("click on aligned link");

                // Real MouseDown -> draw -> MouseUp on blank margin -> +0.
                cx.update_window(any, |_, window, cx| {
                    window.dispatch_event(
                        PlatformInput::MouseDown(MouseDownEvent {
                            button: MouseButton::Left,
                            position: miss_pt,
                            modifiers: Modifiers::none(),
                            click_count: 1,
                            first_mouse: false,
                        }),
                        cx,
                    );
                    window.draw(cx).clear(cx);
                    window.dispatch_event(
                        PlatformInput::MouseUp(MouseUpEvent {
                            button: MouseButton::Left,
                            position: miss_pt,
                            modifiers: Modifiers::none(),
                            click_count: 1,
                        }),
                        cx,
                    );
                })
                .expect("click on blank margin");
                cx.quit();
            });

            assert_eq!(
                clicked.get(),
                1,
                "align={align:?}: click must fire once on glyph area and never on blank margin"
            );
        }
    }

    #[test]
    fn rtl_two_line_ellipsis_truncation_uses_visual_rows_and_base_direction() {
        // Two RTL words of different lengths + punctuation at 10px/char:
        // - fits_text: "مرحبا مرحبتين." (60px + 80px) fits in 2 rows of 100px without truncation.
        // - overflow_text: "مرحبا مرحبتين سلام عالم." (24 chars = 240px) overflows 2 rows of 100px
        //   and must truncate cleanly to <= 2 visual rows with trailing ellipsis and kept prefix.
        let fits_text = "مرحبا مرحبتين.";
        let overflow_text = "مرحبا مرحبتين سلام عالم.";

        let fits_layout: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
        let overflow_layout: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
        let fits_slot = fits_layout.clone();
        let overflow_slot = overflow_layout.clone();

        struct TruncationView {
            fits_text: &'static str,
            overflow_text: &'static str,
            fits_slot: Rc<RefCell<Option<ui::TextLayout>>>,
            overflow_slot: Rc<RefCell<Option<ui::TextLayout>>>,
        }

        impl Render for TruncationView {
            fn render(
                &mut self,
                _window: &mut Window,
                _cx: &mut Context<Self>,
            ) -> impl IntoElement {
                let fits_el = StyledText::new(self.fits_text).text_direction(BaseDirection::Rtl);
                let overflow_el =
                    StyledText::new(self.overflow_text).text_direction(BaseDirection::Rtl);
                *self.fits_slot.borrow_mut() = Some(fits_el.layout().clone());
                *self.overflow_slot.borrow_mut() = Some(overflow_el.layout().clone());
                div()
                    .flex()
                    .flex_col()
                    .w(px(100.0))
                    .child(
                        div()
                            .w(px(100.0))
                            .line_clamp(2)
                            .text_ellipsis()
                            .child(fits_el),
                    )
                    .child(
                        div()
                            .w(px(100.0))
                            .line_clamp(2)
                            .text_ellipsis()
                            .child(overflow_el),
                    )
            }
        }

        let platform = HeadlessPlatform::new_with_text_system(
            320,
            240,
            1.0,
            Arc::new(DeterministicBidiTextSystem),
        );
        Application::with_platform(platform).run(move |cx| {
            let handle = cx
                .open_window(WindowOptions::default(), |_, cx| {
                    cx.new(|_| TruncationView {
                        fits_text,
                        overflow_text,
                        fits_slot,
                        overflow_slot,
                    })
                })
                .expect("open headless window");
            let any: AnyWindowHandle = handle.into();
            cx.update_window(any, |_, window, cx| {
                window.draw(cx).clear(cx);
            })
            .expect("draw truncation view");
            cx.quit();
        });

        let fits_res = fits_layout.borrow().clone().expect("fits layout");
        assert_eq!(
            fits_res.text(),
            fits_text,
            "2-row RTL text that fits within 100px x 2 must not be prematurely truncated"
        );
        assert!(fits_res.bounds().size.height <= fits_res.line_height() * 2.0 + px(0.5));

        let over_res = overflow_layout.borrow().clone().expect("overflow layout");
        let rendered = over_res.text();
        assert!(
            rendered.ends_with('…'),
            "overflowing 2-row RTL text must end with ellipsis, got {rendered:?}"
        );
        assert!(
            rendered.starts_with("مرحبا"),
            "truncated RTL text must preserve leading characters, got {rendered:?}"
        );
        assert!(
            over_res.bounds().size.height <= over_res.line_height() * 2.0 + px(0.5),
            "clamped RTL text height {:?} must fit in 2 rows ({:?})",
            over_res.bounds().size.height,
            over_res.line_height() * 2.0
        );
    }

    #[test]
    fn rtl_ancestor_preserves_direction_across_splice_rebuild() {
        struct ChildView {
            tick: usize,
            seen: Rc<RefCell<Vec<ui::Direction>>>,
        }
        impl Render for ChildView {
            fn render(&mut self, window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
                self.seen.borrow_mut().push(window.layout_direction());
                div().w(px(40.0 + self.tick as f32)).h(px(20.0))
            }
        }
        struct ParentView {
            child: ui::Entity<ChildView>,
        }
        impl Render for ParentView {
            fn render(
                &mut self,
                _window: &mut Window,
                _cx: &mut Context<Self>,
            ) -> impl IntoElement {
                div()
                    .w(px(200.0))
                    .flex()
                    .dir_rtl()
                    .child(self.child.clone())
            }
        }

        let seen = Rc::new(RefCell::new(Vec::new()));
        let seen_clone = seen.clone();
        Application::with_platform(HeadlessPlatform::new(320, 200, 1.0)).run(move |cx| {
            let child = cx.new(|_| ChildView {
                tick: 0,
                seen: seen_clone,
            });
            let child_ref = child.clone();
            let handle = cx
                .open_window(WindowOptions::default(), |_, cx| {
                    cx.new(|_| ParentView { child })
                })
                .expect("open headless window");
            let any_handle: AnyWindowHandle = handle.into();
            cx.update_window(any_handle, |_, window, cx| {
                window.draw(cx).clear(cx);
            })
            .expect("frame 1");
            child_ref.update(cx, |c, cx| {
                c.tick += 1;
                cx.notify();
            });
            cx.update_window(any_handle, |_, window, cx| {
                window.draw(cx).clear(cx);
            })
            .expect("frame 2 splice rebuild");
            cx.quit();
        });
        assert_eq!(*seen.borrow(), vec![ui::Direction::Rtl, ui::Direction::Rtl]);
    }

    /// Deterministic shaper modeling Arabic lam-alef (`لا`) ligature compression:
    /// standalone `'ل'` = `0.475 em`, standalone `'ا'` = `0.292 em`, shaped `"لا"` = `0.525 em`.
    struct ArabicLigatureTextSystem;

    impl PlatformTextSystem for ArabicLigatureTextSystem {
        fn add_fonts(&self, _fonts: Vec<Cow<'static, [u8]>>) -> anyhow::Result<()> {
            Ok(())
        }

        fn all_font_names(&self) -> Vec<String> {
            vec!["TestArabic".to_string()]
        }

        fn font_id(&self, _descriptor: &Font) -> anyhow::Result<FontId> {
            Ok(FontId(0))
        }

        fn font_metrics(&self, _font_id: FontId) -> FontMetrics {
            FontMetrics {
                units_per_em: 1000,
                ascent: 800.0,
                descent: -200.0,
                line_gap: 0.0,
                underline_position: -100.0,
                underline_thickness: 50.0,
                cap_height: 700.0,
                x_height: 500.0,
                bounding_box: Bounds::new(point(0.0, -200.0), size(600.0, 1000.0)),
            }
        }

        fn typographic_bounds(
            &self,
            _font_id: FontId,
            _glyph_id: GlyphId,
        ) -> anyhow::Result<Bounds<f32>> {
            Ok(Bounds::new(point(0.0, 0.0), size(500.0, 1000.0)))
        }

        fn advance(&self, _font_id: FontId, glyph_id: GlyphId) -> anyhow::Result<Size<f32>> {
            // Standalone unshaped advances in font units (1000 upem):
            // 'ل' (U+0644) = 475, 'ا' (U+0627) = 292 -> sum per pair = 0.767 em.
            let units = match glyph_id.0 {
                0x0644 => 475.0,
                0x0627 => 292.0,
                _ => 500.0,
            };
            Ok(size(units, 0.0))
        }

        fn glyph_for_char(&self, _font_id: FontId, ch: char) -> Option<GlyphId> {
            Some(GlyphId(ch as u32))
        }

        fn glyph_raster_bounds(
            &self,
            _params: &RenderGlyphParams,
        ) -> anyhow::Result<Bounds<DevicePixels>> {
            Ok(Bounds::default())
        }

        fn rasterize_glyph(
            &self,
            _params: &RenderGlyphParams,
            _raster_bounds: Bounds<DevicePixels>,
        ) -> anyhow::Result<(Size<DevicePixels>, Vec<u8>)> {
            Ok((Size::default(), Vec::new()))
        }

        fn layout_line(&self, text: &str, font_size: Pixels, runs: &[FontRun]) -> LineLayout {
            self.layout_line_with_direction(text, font_size, runs, BaseDirection::Ltr)
        }

        fn layout_line_with_direction(
            &self,
            text: &str,
            font_size: Pixels,
            _runs: &[FontRun],
            base_direction: BaseDirection,
        ) -> LineLayout {
            let em: f32 = font_size.into();
            let visual_runs = reorder_line_visual_runs(text, base_direction, 0..text.len());
            let mut shaped_runs = Vec::with_capacity(visual_runs.len());
            let mut x = 0.0_f32;
            for vrun in visual_runs {
                let slice = &text[vrun.byte_range.clone()];
                // Coalesce logical `ل` + `ا` pairs into single `0.525 em` ligature clusters.
                let mut clusters: Vec<(usize, u32, f32)> = Vec::new();
                let mut iter = slice.char_indices().peekable();
                while let Some((rel, ch)) = iter.next() {
                    let byte_ix = vrun.byte_range.start + rel;
                    if ch == '\u{0644}'
                        && let Some(&(_, '\u{0627}')) = iter.peek()
                    {
                        iter.next();
                        clusters.push((byte_ix, 0xFEFB, 0.525 * em));
                    } else {
                        let adv = match ch {
                            '\u{0644}' => 0.475 * em,
                            '\u{0627}' => 0.292 * em,
                            _ => 0.500 * em,
                        };
                        clusters.push((byte_ix, ch as u32, adv));
                    }
                }
                if vrun.bidi_level % 2 == 1 {
                    clusters.reverse();
                }
                let mut glyphs = Vec::with_capacity(clusters.len());
                for (byte_ix, gid, adv) in clusters {
                    glyphs.push(ShapedGlyph {
                        id: GlyphId(gid),
                        position: point(px(x), px(0.0)),
                        index: byte_ix,
                        is_emoji: false,
                    });
                    x += adv;
                }
                if !glyphs.is_empty() {
                    shaped_runs.push(ShapedRun {
                        font_id: FontId(0),
                        glyphs,
                        bidi_level: vrun.bidi_level,
                    });
                }
            }
            LineLayout {
                font_size,
                width: px(x),
                ascent: px(0.8 * em),
                descent: px(0.2 * em),
                runs: shaped_runs,
                len: text.len(),
                base_direction,
            }
        }

        fn recommended_rendering_mode(
            &self,
            _font_id: FontId,
            _font_size: Pixels,
        ) -> TextRenderingMode {
            TextRenderingMode::Grayscale
        }
    }

    #[test]
    fn rtl_ligature_multiline_truncation_preserves_fitting_lam_alef_text() {
        // 4 lam-alef ligatures: unshaped char sum = 4 * (0.475 + 0.292) = 3.068 em (1 pair/line -> 4 lines),
        // but shaped ligatures = 4 * 0.525 em -> 2 ligatures (1.05 em <= 1.1 em) per line = 2 lines!
        let four_ligatures = "لالالالا";
        let five_ligatures = "لالالالالا";
        let two_ligatures = "لالا";

        let four_slot: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
        let five_slot: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
        let single_100_slot: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
        let four_out = four_slot.clone();
        let five_out = five_slot.clone();
        let single_100_out = single_100_slot.clone();

        struct LigatureClampView {
            four: &'static str,
            five: &'static str,
            two: &'static str,
            four_slot: Rc<RefCell<Option<ui::TextLayout>>>,
            five_slot: Rc<RefCell<Option<ui::TextLayout>>>,
            single_100_slot: Rc<RefCell<Option<ui::TextLayout>>>,
        }

        impl Render for LigatureClampView {
            fn render(
                &mut self,
                _window: &mut Window,
                _cx: &mut Context<Self>,
            ) -> impl IntoElement {
                let four_el = StyledText::new(self.four).text_direction(BaseDirection::Rtl);
                let five_el = StyledText::new(self.five).text_direction(BaseDirection::Rtl);
                let single_100_el = StyledText::new(self.two).text_direction(BaseDirection::Rtl);
                *self.four_slot.borrow_mut() = Some(four_el.layout().clone());
                *self.five_slot.borrow_mut() = Some(five_el.layout().clone());
                *self.single_100_slot.borrow_mut() = Some(single_100_el.layout().clone());
                // At font_size = 100px, 1.1 em = 110px (2 shaped ligatures = 105px <= 110px).
                // On a 100px single-line box, "لالا" = 105px > 100px and "لا…" = 102.5px > 100px,
                // so cluster-snapped truncation must output "…" (50px) rather than half-ligature "ل…".
                div()
                    .flex()
                    .flex_col()
                    .text_size(px(100.0))
                    .w(px(110.0))
                    .child(
                        div()
                            .w(px(110.0))
                            .line_clamp(2)
                            .text_ellipsis()
                            .child(four_el),
                    )
                    .child(
                        div()
                            .w(px(110.0))
                            .line_clamp(2)
                            .text_ellipsis()
                            .child(five_el),
                    )
                    .child(div().w(px(100.0)).truncate().child(single_100_el))
            }
        }

        let platform = HeadlessPlatform::new_with_text_system(
            320,
            400,
            1.0,
            Arc::new(ArabicLigatureTextSystem),
        );
        Application::with_platform(platform).run(move |cx| {
            let handle = cx
                .open_window(WindowOptions::default(), |_, cx| {
                    cx.new(|_| LigatureClampView {
                        four: four_ligatures,
                        five: five_ligatures,
                        two: two_ligatures,
                        four_slot: four_out,
                        five_slot: five_out,
                        single_100_slot: single_100_out,
                    })
                })
                .expect("open headless window");
            let any: AnyWindowHandle = handle.into();
            cx.update_window(any, |_, window, cx| {
                window.draw(cx).clear(cx);
            })
            .expect("draw ligature clamp view");
            cx.quit();
        });

        let four_res = four_slot.borrow().clone().expect("four ligature layout");
        assert_eq!(
            four_res.text(),
            four_ligatures,
            "4 lam-alef ligatures (1.05 em/row <= 1.1 em, 2 rows) must not be prematurely truncated"
        );

        let five_res = five_slot.borrow().clone().expect("five ligature layout");
        assert_eq!(
            five_res.text(),
            "لالالا…",
            "5 lam-alef ligatures must retain the longest fitting cluster prefix (3 ligatures + ellipsis)"
        );

        let single_100_res = single_100_slot
            .borrow()
            .clone()
            .expect("single 100px ligature layout");
        assert_eq!(
            single_100_res.text(),
            "…",
            "100px single-line box must snap to valid cluster boundary ('…') rather than splitting 'لا' into 'ل…'"
        );
    }

    #[test]
    fn end_truncation_skips_long_whitespace_runs_with_constant_candidate_shapes() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct CountingTextSystem {
            layout_calls: Arc<AtomicUsize>,
        }

        impl PlatformTextSystem for CountingTextSystem {
            fn add_fonts(&self, fonts: Vec<Cow<'static, [u8]>>) -> anyhow::Result<()> {
                DeterministicBidiTextSystem.add_fonts(fonts)
            }
            fn all_font_names(&self) -> Vec<String> {
                DeterministicBidiTextSystem.all_font_names()
            }
            fn font_id(&self, descriptor: &Font) -> anyhow::Result<FontId> {
                DeterministicBidiTextSystem.font_id(descriptor)
            }
            fn font_metrics(&self, font_id: FontId) -> FontMetrics {
                DeterministicBidiTextSystem.font_metrics(font_id)
            }
            fn typographic_bounds(
                &self,
                font_id: FontId,
                glyph_id: GlyphId,
            ) -> anyhow::Result<Bounds<f32>> {
                DeterministicBidiTextSystem.typographic_bounds(font_id, glyph_id)
            }
            fn advance(&self, font_id: FontId, glyph_id: GlyphId) -> anyhow::Result<Size<f32>> {
                DeterministicBidiTextSystem.advance(font_id, glyph_id)
            }
            fn glyph_for_char(&self, font_id: FontId, ch: char) -> Option<GlyphId> {
                DeterministicBidiTextSystem.glyph_for_char(font_id, ch)
            }
            fn glyph_raster_bounds(
                &self,
                params: &RenderGlyphParams,
            ) -> anyhow::Result<Bounds<DevicePixels>> {
                DeterministicBidiTextSystem.glyph_raster_bounds(params)
            }
            fn rasterize_glyph(
                &self,
                params: &RenderGlyphParams,
                raster_bounds: Bounds<DevicePixels>,
            ) -> anyhow::Result<(Size<DevicePixels>, Vec<u8>)> {
                DeterministicBidiTextSystem.rasterize_glyph(params, raster_bounds)
            }
            fn layout_line(&self, text: &str, font_size: Pixels, runs: &[FontRun]) -> LineLayout {
                self.layout_line_with_direction(text, font_size, runs, BaseDirection::Ltr)
            }
            fn layout_line_with_direction(
                &self,
                text: &str,
                font_size: Pixels,
                runs: &[FontRun],
                base_direction: BaseDirection,
            ) -> LineLayout {
                self.layout_calls.fetch_add(1, Ordering::Relaxed);
                DeterministicBidiTextSystem.layout_line_with_direction(
                    text,
                    font_size,
                    runs,
                    base_direction,
                )
            }
            fn recommended_rendering_mode(
                &self,
                font_id: FontId,
                font_size: Pixels,
            ) -> TextRenderingMode {
                DeterministicBidiTextSystem.recommended_rendering_mode(font_id, font_size)
            }
        }

        let measure_case = |spaces: usize| -> (String, usize) {
            let sample = SharedString::from(format!("A{}B", " ".repeat(spaces)));
            let calls = Arc::new(AtomicUsize::new(0));
            let calls_out = calls.clone();
            let layout_slot: Rc<RefCell<Option<ui::TextLayout>>> = Rc::new(RefCell::new(None));
            let layout_out = layout_slot.clone();

            struct LongSpaceView {
                sample: SharedString,
                slot: Rc<RefCell<Option<ui::TextLayout>>>,
            }
            impl Render for LongSpaceView {
                fn render(
                    &mut self,
                    _window: &mut Window,
                    _cx: &mut Context<Self>,
                ) -> impl IntoElement {
                    let el = StyledText::new(self.sample.clone());
                    *self.slot.borrow_mut() = Some(el.layout().clone());
                    div().w(px(110.0)).truncate().child(el)
                }
            }

            let platform = HeadlessPlatform::new_with_text_system(
                320,
                120,
                1.0,
                Arc::new(CountingTextSystem {
                    layout_calls: calls,
                }),
            );
            Application::with_platform(platform).run(move |cx| {
                let handle = cx
                    .open_window(WindowOptions::default(), |_, cx| {
                        cx.new(|_| LongSpaceView {
                            sample,
                            slot: layout_out,
                        })
                    })
                    .expect("open headless window");
                let any: AnyWindowHandle = handle.into();
                cx.update_window(any, |_, window, cx| {
                    window.draw(cx).clear(cx);
                })
                .expect("draw long space view");
                cx.quit();
            });

            let rendered = layout_slot
                .borrow()
                .clone()
                .expect("long space layout")
                .text()
                .to_string();
            (rendered, calls_out.load(Ordering::Relaxed))
        };

        let (short_text, short_calls) = measure_case(16);
        let (long_text, long_calls) = measure_case(16_384);
        assert_eq!(short_text, "A…");
        assert_eq!(long_text, "A…");
        assert_eq!(
            long_calls, short_calls,
            "16,384 spaces must construct and shape the exact same O(1) number of candidates as 16 spaces"
        );
        assert!(
            long_calls <= 6,
            "expected at most 6 line-shaping calls across frame, got {long_calls}"
        );
    }
}

#[test]
fn bidi_wrapped_rows_match_unicode_bidi_visual_runs_with_bn_and_explicit_controls() {
    let shaper = DeterministicBidiTextSystem;

    // 1. Explicit regression for LTR paragraph `Aאב \u{00AD}גZ` wrapped right after soft hyphen
    // (`0..8`, 5 chars = 50px): trailing space (byte 5) and U+00AD BN (bytes 6..8) must reset to
    // LTR paragraph level 0 on the right rather than reversing with Hebrew `אב`.
    let shy_sample = "A\u{05D0}\u{05D1} \u{00AD}\u{05D2}Z";
    let full = shaper.layout_line_with_direction(
        shy_sample,
        px(16.0),
        &[FontRun {
            len: shy_sample.len(),
            font_id: FontId(0),
        }],
        BaseDirection::Ltr,
    );
    let rows = full.compute_bidi_wrapped_rows(shy_sample, px(50.0), None);
    assert_eq!(rows[0].byte_range, 0..8);
    let row0_indices: Vec<usize> = rows[0]
        .layout
        .runs
        .iter()
        .flat_map(|r| r.glyphs.iter().map(|g| g.index))
        .collect();
    // Visual order on row 0: 'A' (0), 'ב' (3), 'א' (1), ' ' (5), '\u{00AD}' (6).
    assert_eq!(row0_indices, vec![0, 3, 1, 5, 6]);

    // 2. Differential check of `compute_bidi_wrapped_rows` against `reorder_line_visual_runs`
    // (`unicode-bidi 0.3.18` reference) across mixed scripts, whitespace, BN, embeddings & isolates.
    let alphabet = [
        'a', 'b', ' ', '1', '-', '\u{05D0}', '\u{05D1}', '\u{0645}', '\u{0631}', '\t', '\u{200B}',
        '\u{200D}', '\u{00AD}', '\u{200E}', '\u{200F}', '\u{202A}', '\u{202B}', '\u{202C}',
        '\u{2066}', '\u{2067}', '\u{2069}',
    ];
    let mut state = 0x5EED_1234_u64;
    let mut next_u64 = || {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        state >> 33
    };

    for _ in 0..450 {
        let len = 2 + (next_u64() % 18) as usize;
        let text: String = (0..len)
            .map(|_| alphabet[(next_u64() % alphabet.len() as u64) as usize])
            .collect();
        for dir in [
            BaseDirection::Ltr,
            BaseDirection::Rtl,
            BaseDirection::AutoFirstStrong,
        ] {
            let mut line = shaper.layout_line_with_direction(
                &text,
                px(16.0),
                &[FontRun {
                    len: text.len(),
                    font_id: FontId(0),
                }],
                dir,
            );
            // Force `compute_bidi_wrapped_rows` for every sample regardless of paragraph direction.
            line.base_direction = match dir {
                BaseDirection::Rtl => BaseDirection::Rtl,
                BaseDirection::Ltr => BaseDirection::Ltr,
                BaseDirection::AutoFirstStrong => line.base_direction,
            };
            for cols in [3_usize, 6, 9] {
                let rows = line.compute_bidi_wrapped_rows(&text, px((cols * 10) as f32), None);
                for row in &rows {
                    let got: Vec<usize> = row
                        .layout
                        .runs
                        .iter()
                        .flat_map(|r| r.glyphs.iter().map(|g| g.index))
                        .collect();
                    let expected_runs = reorder_line_visual_runs(
                        &text,
                        line.base_direction,
                        row.byte_range.clone(),
                    );
                    let mut expected = Vec::new();
                    for vrun in expected_runs {
                        let mut idxs: Vec<usize> = text[vrun.byte_range.clone()]
                            .char_indices()
                            .map(|(rel, _)| vrun.byte_range.start + rel)
                            .collect();
                        if vrun.bidi_level % 2 == 1 {
                            idxs.reverse();
                        }
                        expected.extend(idxs);
                    }
                    assert_eq!(
                        got, expected,
                        "mismatch for text={text:?} dir={:?} row={:?}",
                        line.base_direction, row.byte_range
                    );
                }
            }
        }
    }
}
