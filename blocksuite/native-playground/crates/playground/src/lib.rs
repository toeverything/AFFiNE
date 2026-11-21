//! Native BlockSuite Playground shell (native desktop + Web Wasm canvas + headless harness).
//!
//! All targets execute the single shipping [`PlaygroundView`] element tree.

use std::borrow::Cow;
use ui::{App, FontWeight, Hsla, Motion, MotionCurve, Window, div, prelude::*, px};

/// Tracked repository Inter variable font registered into the text system on all targets.
const INTER_VARIABLE_TTF: &[u8] = include_bytes!(
    "../../../../../packages/frontend/component/src/fonts/inter/Inter-VariableFont_slnt,wght.ttf"
);

/// Registers the tracked repository base font (`Inter`) into the active `TextSystem`.
///
/// Must be called before opening any window across macOS, Linux headless, and Web Wasm.
pub fn register_bundled_fonts(cx: &App) -> anyhow::Result<()> {
    cx.text_system()
        .add_fonts(vec![Cow::Borrowed(INTER_VARIABLE_TTF)])
}

/// Active view mode for the playground frame.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlaygroundMode {
    Page,
    Edgeless,
}

const PILL_PAGE_X: f64 = 4.0;
const PILL_EDGELESS_X: f64 = 94.0;
const PILL_TRANSITION_MS: f64 = 200.0;

/// Interactive GPUI root view for desktop, Web canvas, and headless verification sessions.
pub struct PlaygroundView {
    mode: PlaygroundMode,
    origin_time: ui::scheduler::Instant,
    pill_motion: Option<Motion>,
}

impl PlaygroundView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self {
            mode: PlaygroundMode::Page,
            origin_time: cx.background_executor().now(),
            pill_motion: None,
        }
    }

    pub fn mode(&self) -> PlaygroundMode {
        self.mode
    }

    fn now_ms(&self, cx: &Context<Self>) -> f64 {
        cx.background_executor()
            .now()
            .saturating_duration_since(self.origin_time)
            .as_secs_f64()
            * 1000.0
    }

    fn target_pill_x(mode: PlaygroundMode) -> f64 {
        match mode {
            PlaygroundMode::Page => PILL_PAGE_X,
            PlaygroundMode::Edgeless => PILL_EDGELESS_X,
        }
    }

    fn indicator_x(&self, now_ms: f64) -> f64 {
        match self.pill_motion {
            Some(motion) => motion.value_at(now_ms),
            None => Self::target_pill_x(self.mode),
        }
    }

    fn set_mode(&mut self, target: PlaygroundMode, cx: &mut Context<Self>) {
        if self.mode == target {
            return;
        }
        let now_ms = self.now_ms(cx);
        let current_x = self.indicator_x(now_ms);
        self.mode = target;
        self.pill_motion = Some(Motion::new(
            current_x,
            Self::target_pill_x(target),
            MotionCurve::EaseInOutCubic,
            now_ms,
            PILL_TRANSITION_MS,
        ));
        cx.notify();
    }
}

fn rgb_hex(hex: u32) -> Hsla {
    let r = ((hex >> 16) & 0xff) as f32 / 255.0;
    let g = ((hex >> 8) & 0xff) as f32 / 255.0;
    let b = (hex & 0xff) as f32 / 255.0;
    ui::Rgba { r, g, b, a: 1.0 }.into()
}

impl ui::Render for PlaygroundView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let now_ms = self.now_ms(cx);
        let raw_indicator_x = self.indicator_x(now_ms);
        if let Some(motion) = self.pill_motion {
            if motion.is_finished(now_ms) {
                self.pill_motion = None;
            } else {
                window.request_animation_frame();
            }
        }
        let indicator_x = raw_indicator_x.round() as f32;

        let bg_canvas = rgb_hex(0xFFFFFF);
        let bg_toolbar = rgb_hex(0xFBFBFB);
        let border_subtle = rgb_hex(0xE3E2E4);
        let accent_blue = rgb_hex(0x1E96EB);
        let edgeless_bg = rgb_hex(0xF5F8FC);
        let edgeless_border = rgb_hex(0xBFDBFE);
        let pill_bg = rgb_hex(0xF4F4F5);
        let card_bg = rgb_hex(0xFAFAFA);
        let ink_primary = rgb_hex(0x121212);
        let ink_muted = rgb_hex(0x52525B);

        let is_page = self.mode == PlaygroundMode::Page;
        let is_edgeless = self.mode == PlaygroundMode::Edgeless;

        let title_text = match self.mode {
            PlaygroundMode::Page => "Native BlockSuite Playground",
            PlaygroundMode::Edgeless => "Edgeless Spatial Canvas",
        };
        let body_text = match self.mode {
            PlaygroundMode::Page => {
                "Deterministic native canvas shell rendered across Metal, WGPU, and WebAssembly."
            }
            PlaygroundMode::Edgeless => {
                "Infinite spatial canvas mode active — click Page to return to document layout."
            }
        };

        let indicator = div()
            .absolute()
            .left(px(indicator_x))
            .top(px(4.0))
            .w(px(86.0))
            .h(px(26.0))
            .rounded(px(6.0))
            .bg(bg_canvas)
            .border_1()
            .border_color(accent_blue)
            .snapshot(
                "chrome.mode_switcher.indicator",
                Some("chrome.mode_switcher"),
            );

        let page_btn = div()
            .id("mode-page")
            .absolute()
            .left(px(PILL_PAGE_X as f32))
            .top(px(4.0))
            .w(px(86.0))
            .h(px(26.0))
            .rounded(px(6.0))
            .flex()
            .items_center()
            .justify_center()
            .text_color(if is_page { ink_primary } else { ink_muted })
            .text_size(px(13.0))
            .font_weight(FontWeight::MEDIUM)
            .on_click(cx.listener(|this, _, _, cx| {
                this.set_mode(PlaygroundMode::Page, cx);
            }))
            .snapshot("chrome.mode_switcher.page", Some("chrome.mode_switcher"))
            .snapshot_focused(is_page)
            .snapshot_text("Page")
            .child("Page");

        let edgeless_btn = div()
            .id("mode-edgeless")
            .absolute()
            .left(px(PILL_EDGELESS_X as f32))
            .top(px(4.0))
            .w(px(86.0))
            .h(px(26.0))
            .rounded(px(6.0))
            .flex()
            .items_center()
            .justify_center()
            .text_color(if is_edgeless { ink_primary } else { ink_muted })
            .text_size(px(13.0))
            .font_weight(FontWeight::MEDIUM)
            .on_click(cx.listener(|this, _, _, cx| {
                this.set_mode(PlaygroundMode::Edgeless, cx);
            }))
            .snapshot(
                "chrome.mode_switcher.edgeless",
                Some("chrome.mode_switcher"),
            )
            .snapshot_focused(is_edgeless)
            .snapshot_text("Edgeless")
            .child("Edgeless");

        div()
            .size_full()
            .font_family("Inter")
            .flex()
            .flex_col()
            .bg(if is_edgeless { edgeless_bg } else { bg_canvas })
            .snapshot("root.canvas", None)
            .child(
                div()
                    .w_full()
                    .h(px(53.0))
                    .bg(bg_toolbar)
                    .border_b_1()
                    .border_color(border_subtle)
                    .flex()
                    .items_center()
                    .justify_center()
                    .snapshot("chrome.topbar", Some("root.canvas"))
                    .child(
                        div()
                            .relative()
                            .w(px(186.0))
                            .h(px(36.0))
                            .p(px(4.0))
                            .rounded(px(10.0))
                            .bg(pill_bg)
                            .border_1()
                            .border_color(border_subtle)
                            .snapshot("chrome.mode_switcher", Some("chrome.topbar"))
                            .child(indicator)
                            .child(page_btn)
                            .child(edgeless_btn),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .flex()
                    .justify_center()
                    .pt(px(48.0))
                    .pb(px(48.0))
                    .px(px(48.0))
                    .child(
                        div()
                            .w(px(944.0))
                            .h_full()
                            .p(px(32.0))
                            .rounded(px(12.0))
                            .bg(if is_edgeless { bg_canvas } else { card_bg })
                            .border_1()
                            .border_color(if is_edgeless {
                                edgeless_border
                            } else {
                                border_subtle
                            })
                            .flex()
                            .flex_col()
                            .gap(px(16.0))
                            .snapshot("page.editor_surface", Some("root.canvas"))
                            .child(
                                div()
                                    .text_size(px(24.0))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(ink_primary)
                                    .snapshot("page.title_block", Some("page.editor_surface"))
                                    .snapshot_text(title_text)
                                    .child(title_text),
                            )
                            .child(div().w_full().h(px(1.0)).bg(if is_edgeless {
                                edgeless_border
                            } else {
                                border_subtle
                            }))
                            .child(
                                div()
                                    .text_size(px(14.0))
                                    .font_weight(FontWeight::NORMAL)
                                    .text_color(ink_muted)
                                    .snapshot("page.body_block", Some("page.editor_surface"))
                                    .snapshot_text(body_text)
                                    .child(body_text),
                            ),
                    ),
            )
    }
}

#[cfg(target_family = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn wasm_main() {
    console_error_panic_hook::set_once();
    let platform = std::rc::Rc::new(ui::WebPlatform::new(false));
    ui::Application::with_platform(platform).run(|cx| {
        if let Err(err) = register_bundled_fonts(cx) {
            panic!("failed to register bundled Inter font on web: {err:#}");
        }
        if let Err(err) = cx.open_window(ui::WindowOptions::default(), |_, cx| {
            cx.new(PlaygroundView::new)
        }) {
            panic!("failed to open playground web window: {err:#}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::time::Duration;
    use ui::{Application, Bounds, HeadlessPlatform, WindowBounds, WindowOptions, point, size};

    #[test]
    fn headless_playground_renders_and_clicking_edgeless_mutates_snapshot_and_image() {
        let platform = HeadlessPlatform::new(1280, 800, 1.0);
        let handle_cell: Rc<RefCell<Option<ui::WindowHandle<PlaygroundView>>>> =
            Rc::new(RefCell::new(None));
        let handle_out = handle_cell.clone();

        let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
            register_bundled_fonts(cx).expect("register bundled Inter font");
            let window_handle = cx
                .open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(1280.0), px(800.0)),
                        ))),
                        ..WindowOptions::default()
                    },
                    |_, cx| cx.new(PlaygroundView::new),
                )
                .expect("open headless window");
            *handle_out.borrow_mut() = Some(window_handle);
        });

        let window_handle = handle_cell.borrow_mut().take().expect("window opened");
        let headless_win = platform
            .windows()
            .into_iter()
            .next()
            .expect("headless window registered");

        // Render initial Page frame via real GPUI Window::draw()
        headless_win.request_frame();
        let (page_snap, page_img, page_glyphs) = app.update(|cx| {
            window_handle
                .update(cx, |_, window, _| {
                    let snap = window.frame_snapshot().clone();
                    let img = window.render_to_image().expect("render Page PNG");
                    let glyphs = window.rendered_scene().monochrome_sprites.len();
                    (snap, img, glyphs)
                })
                .expect("read initial frame")
        });

        assert!(
            page_glyphs > 50,
            "expected real shaped glyphs in initial frame, got {page_glyphs}"
        );
        let violations = ui::audit_frame_snapshot(&page_snap);
        assert!(
            violations.is_empty(),
            "Page audit violations: {violations:#?}"
        );

        let edgeless_btn = page_snap
            .elements
            .get("chrome.mode_switcher.edgeless")
            .expect("edgeless button in snapshot");
        let click_pt = point(
            px(edgeless_btn.bounds.x + edgeless_btn.bounds.width * 0.5),
            px(edgeless_btn.bounds.y + edgeless_btn.bounds.height * 0.5),
        );

        // Dispatch real click on Edgeless and step scheduler past 200ms transition
        headless_win.simulate_click(click_pt);
        platform.run_until_parked();
        platform.advance_clock(Duration::from_millis(250));
        headless_win.request_frame();

        let (edgeless_snap, edgeless_img) = app.update(|cx| {
            window_handle
                .update(cx, |_, window, _| {
                    let snap = window.frame_snapshot().clone();
                    let img = window.render_to_image().expect("render Edgeless PNG");
                    (snap, img)
                })
                .expect("read edgeless frame")
        });

        let violations = ui::audit_frame_snapshot(&edgeless_snap);
        assert!(
            violations.is_empty(),
            "Edgeless audit violations: {violations:#?}"
        );

        let page_ind_x = page_snap.elements["chrome.mode_switcher.indicator"]
            .bounds
            .x;
        let edge_ind_x = edgeless_snap.elements["chrome.mode_switcher.indicator"]
            .bounds
            .x;
        assert!(
            edge_ind_x > page_ind_x + 80.0,
            "indicator did not slide right: page={page_ind_x}, edgeless={edge_ind_x}"
        );
        assert!(edgeless_snap.elements["chrome.mode_switcher.edgeless"].focused);
        assert!(!edgeless_snap.elements["chrome.mode_switcher.page"].focused);
        assert_ne!(
            page_snap.elements["page.title_block"].text,
            edgeless_snap.elements["page.title_block"].text
        );
        assert_ne!(
            page_img.as_raw(),
            edgeless_img.as_raw(),
            "clicking Edgeless must produce a visibly different rendered PNG"
        );
    }
}
