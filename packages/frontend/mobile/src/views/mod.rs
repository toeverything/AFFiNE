//! L4 mobile shell GPU UI views (`MobileShellView`, 4-TabBar, routes, modal sheets,
//! `Focusable` + `EntityInputHandler` for Search IME, and live `AccessibilityTree` publication).

mod drawer;
mod explorer;
mod explorer_rows;
mod journals;
mod page;
mod page_directory;
mod page_editor;
mod search;
mod settings;
mod sheet;
mod sheet_actions;
mod tabs;

pub(crate) use drawer::drawer_doc_sections;
pub(crate) use journals::{shift_iso_date, week_days_for_date};

use std::{
    cell::RefCell,
    collections::HashMap,
    ops::Range,
    rc::Rc,
    sync::{Arc, Mutex},
};

use affine_client::{AccessibilityTree, PlatformAccessibility};
use ui::{
    App, Bounds, Context, Direction, EntityInputHandler, FocusHandle, Focusable, Hsla,
    InteractiveElement, IntoElement, KeyDownEvent, ParentElement, Pixels, Point, Render, Styled,
    TextAlign, UTF16Selection, Window, WindowInsets, canvas, div, hsla, px, size,
};
use ui_kit::{BreadcrumbBarLayout, LogicalStyled, SafeArea, SafeAreaEdges};
use ui_tokens::{DARK_THEME, FONT_SANS, LIGHT_THEME, Rgba, ThemeMode};

pub(super) use crate::a11y::{A11yBoundsMap, a11y_bounds_probe, a11y_bounds_probe_border};
use crate::{
    a11y::{
        InMemoryPlatformAccessibility, MobileA11yAction, SafeAreaMetrics, apply_measured_bounds,
        build_accessibility_tree_with_layout, perform_a11y_action_with_layout,
    },
    state::{MobileAppState, MobileRoute, MobileSheet},
};

pub(super) const HOME_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M3 10.5L12 3.5L21 10.5M5.5 9.5V19.5H18.5V9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(super) const EXPLORER_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M3 6.5H9.5L11.5 9H21V19H3V6.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>"#;
pub(super) const JOURNALS_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 10H20M8 3V6M16 3V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>"#;
pub(super) const SEARCH_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="1.8"/><path d="M15.2 15.2L20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>"#;
pub(super) const SETTINGS_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M10.6 2.8H13.4L13.9 5.2L17.0 7.1L19.2 6.2L20.6 8.6L18.8 10.1V13.9L20.6 15.4L19.2 17.8L17.0 16.9L13.9 18.8L13.4 21.2H10.6L10.1 18.8L7.0 16.9L4.8 17.8L3.4 15.4L5.2 13.9V10.1L3.4 8.6L4.8 6.2L7.0 7.1L10.1 5.2L10.6 2.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>"#;
pub(super) const PLUS_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>"#;
pub(super) const CHEVRON_LEFT_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(super) const CHEVRON_RIGHT_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(super) const CHEVRON_DOWN_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(super) const CLOSE_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>"#;
pub(super) const MORE_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>"#;
pub(super) const STAR_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.5L12.3 7.2L17.5 7.9L13.7 11.6L14.6 16.8L10 14.3L5.4 16.8L6.3 11.6L2.5 7.9L7.7 7.2L10 2.5Z"/></svg>"#;
pub(super) const MENU_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M4 7H20M4 12H20M4 17H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>"#;

/// Resolved theme color palette for the mobile shell.
#[derive(Clone, Copy, Debug)]
pub(super) struct MobilePalette {
    pub bg_canvas: Hsla,
    pub bg_surface: Hsla,
    pub bg_elevated: Hsla,
    pub bg_pill: Hsla,
    pub text_primary: Hsla,
    pub text_secondary: Hsla,
    pub text_muted: Hsla,
    pub text_subtle: Hsla,
    pub border: Hsla,
    pub accent: Hsla,
    pub accent_soft: Hsla,
    pub danger: Hsla,
    pub danger_soft: Hsla,
    pub scrim: Hsla,
}

pub(super) trait MobileFlexExt: Styled {
    fn justify_between(mut self) -> Self {
        self.style().justify_content = Some(ui::JustifyContent::SpaceBetween);
        self
    }

    fn justify_end(mut self) -> Self {
        self.style().justify_content = Some(ui::JustifyContent::FlexEnd);
        self
    }

    fn items_start(mut self) -> Self {
        self.style().align_items = Some(ui::AlignItems::FlexStart);
        self
    }

    fn items_stretch(mut self) -> Self {
        self.style().align_items = Some(ui::AlignItems::Stretch);
        self
    }

    fn max_h(mut self, height: impl Into<ui::Length>) -> Self {
        self.style().max_size.height = Some(height.into());
        self
    }

    fn align_start_for(self, dir: Direction) -> Self {
        let align = if dir.is_rtl() {
            TextAlign::Right
        } else {
            TextAlign::Left
        };
        self.text_align(align)
    }
}

impl<T: Styled> MobileFlexExt for T {}

fn rgba_to_hsla(c: Rgba) -> Hsla {
    ui::Rgba {
        r: f32::from(c.r) / 255.0,
        g: f32::from(c.g) / 255.0,
        b: f32::from(c.b) / 255.0,
        a: f32::from(c.a) / 255.0,
    }
    .into()
}

pub(super) fn palette_for(mode: ThemeMode) -> MobilePalette {
    let tokens = match mode {
        ThemeMode::Light => &LIGHT_THEME,
        ThemeMode::Dark => &DARK_THEME,
    };
    let color =
        |name: &str, fallback: Hsla| tokens.color(name).map(rgba_to_hsla).unwrap_or(fallback);
    let primary_bg = color(
        "--affine-background-primary-color",
        hsla(0.0, 0.0, 1.0, 1.0),
    );
    let secondary_bg = color(
        "--affine-background-secondary-color",
        hsla(0.0, 0.0, 0.96, 1.0),
    );
    let primary_text = color("--affine-text-primary-color", hsla(0.0, 0.0, 0.1, 1.0));
    let secondary_text = color("--affine-text-secondary-color", hsla(0.0, 0.0, 0.45, 1.0));
    let border = color("--affine-border-color", hsla(0.0, 0.0, 0.88, 1.0));
    let accent = hsla(0.58, 0.85, 0.52, 1.0);
    let (bg_canvas, bg_surface, bg_elevated, bg_pill, accent_soft, danger, danger_soft, scrim) =
        match mode {
            ThemeMode::Light => (
                secondary_bg,
                primary_bg,
                primary_bg,
                hsla(0.0, 0.0, 0.93, 1.0),
                hsla(0.58, 0.85, 0.52, 0.12),
                hsla(0.0, 0.78, 0.52, 1.0),
                hsla(0.0, 0.78, 0.52, 0.12),
                hsla(0.0, 0.0, 0.0, 0.36),
            ),
            ThemeMode::Dark => (
                hsla(0.62, 0.08, 0.09, 1.0),
                hsla(0.62, 0.07, 0.13, 1.0),
                hsla(0.62, 0.07, 0.16, 1.0),
                hsla(0.62, 0.07, 0.21, 1.0),
                hsla(0.58, 0.85, 0.60, 0.18),
                hsla(0.0, 0.78, 0.62, 1.0),
                hsla(0.0, 0.78, 0.62, 0.18),
                hsla(0.0, 0.0, 0.0, 0.55),
            ),
        };
    let text_subtle = match mode {
        ThemeMode::Light => hsla(0.69, 0.04, 0.39, 1.0),
        ThemeMode::Dark => hsla(0.62, 0.05, 0.66, 1.0),
    };
    MobilePalette {
        bg_canvas,
        bg_surface,
        bg_elevated,
        bg_pill,
        text_primary: primary_text,
        text_secondary: secondary_text,
        text_muted: secondary_text,
        text_subtle,
        border,
        accent,
        accent_soft,
        danger,
        danger_soft,
        scrim,
    }
}

/// Root GPU UI view for the L4 mobile product shell.
pub struct MobileShellView {
    pub state: MobileAppState,
    clock_origin: Option<ui::scheduler::Instant>,
    pub search_focus: FocusHandle,
    pub published_a11y_tree: AccessibilityTree,
    a11y_sink: Arc<Mutex<dyn PlatformAccessibility + Send>>,
    insets_override: Option<WindowInsets>,
    last_viewport: (f32, f32),
    last_safe_area: SafeAreaMetrics,
    last_measured_breadcrumb: Option<(String, Option<u64>, f32, BreadcrumbBarLayout)>,
    page_editor: page_editor::EmbeddedPageEditor,
}

impl MobileShellView {
    pub fn new(state: MobileAppState, cx: &mut Context<Self>) -> Self {
        Self::with_a11y_sink(
            state,
            Arc::new(Mutex::new(InMemoryPlatformAccessibility::new())),
            cx,
        )
    }

    pub fn with_a11y_sink(
        mut state: MobileAppState,
        a11y_sink: Arc<Mutex<dyn PlatformAccessibility + Send>>,
        cx: &mut Context<Self>,
    ) -> Self {
        let published_a11y_tree = build_accessibility_tree_with_layout(
            &mut state,
            390.0,
            844.0,
            SafeAreaMetrics::default(),
            None,
        );
        Self {
            state,
            clock_origin: None,
            search_focus: cx.focus_handle(),
            published_a11y_tree,
            a11y_sink,
            insets_override: None,
            last_viewport: (390.0, 844.0),
            last_safe_area: SafeAreaMetrics::default(),
            last_measured_breadcrumb: None,
            page_editor: page_editor::EmbeddedPageEditor::default(),
        }
    }

    pub fn page_editor(&self) -> Option<&ui::Entity<playground::PlaygroundView>> {
        self.page_editor.entity()
    }

    pub fn ingest_media_into_active_page(
        &mut self,
        input: &affine_client::PickedMediaInput,
        block_id: &str,
        now_ms: i64,
        cx: &mut Context<Self>,
    ) -> Option<affine_client::InsertedMediaBlock> {
        self.page_editor
            .ingest_media(&mut self.state, input, block_id, now_ms, cx)
    }

    pub fn set_insets_override(&mut self, insets: Option<WindowInsets>) {
        self.insets_override = insets;
    }

    pub fn state_mut(&mut self) -> &mut MobileAppState {
        &mut self.state
    }

    pub fn published_a11y_tree(&self) -> &AccessibilityTree {
        &self.published_a11y_tree
    }

    pub fn last_measured_breadcrumb(&self) -> Option<&BreadcrumbBarLayout> {
        self.last_measured_breadcrumb
            .as_ref()
            .map(|(_, _, _, layout)| layout)
    }

    pub fn perform_a11y_action(
        &mut self,
        node_id: &str,
        action: MobileA11yAction,
        cx: &mut Context<Self>,
    ) -> bool {
        let now_ms = self.now_ms(cx);
        let (vp_w, vp_h) = self.last_viewport;
        let content_w = (vp_w - self.last_safe_area.left - self.last_safe_area.right).max(44.0);
        let head_seq = self
            .state
            .active_workspace()
            .history
            .current()
            .map(|e| e.seq);
        let measured = match (&self.state.route, &self.last_measured_breadcrumb) {
            (MobileRoute::Page(doc_id), Some((c_doc, c_seq, c_w, layout)))
                if c_doc == doc_id && *c_seq == head_seq && (c_w - content_w).abs() < 0.5 =>
            {
                Some(layout)
            }
            _ => None,
        };
        let handled = perform_a11y_action_with_layout(
            &mut self.state,
            node_id,
            action,
            now_ms,
            vp_w,
            vp_h,
            self.last_safe_area,
            measured,
        );
        if handled {
            cx.notify();
        }
        handled
    }

    pub fn clock_ms(&mut self, cx: &Context<Self>) -> f64 {
        self.now_ms(cx)
    }

    pub(super) fn now_ms(&mut self, cx: &Context<Self>) -> f64 {
        let now = cx.background_executor().now();
        let origin = *self.clock_origin.get_or_insert(now);
        now.saturating_duration_since(origin).as_secs_f64() * 1000.0
    }

    fn utf16_to_byte(text: &str, utf16_offset: usize) -> usize {
        let mut units = 0usize;
        for (byte_idx, ch) in text.char_indices() {
            if units >= utf16_offset {
                return byte_idx;
            }
            units += ch.len_utf16();
        }
        text.len()
    }

    /// Control-key handler for `Search` (`Backspace`, `Delete`, `Escape`).
    /// Printable character insertion flows exclusively through [`EntityInputHandler`] so
    /// physical keyboard events never duplicate characters on Web or native hosts.
    fn handle_search_key_down(
        &mut self,
        event: &KeyDownEvent,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.state.route != MobileRoute::Search {
            return;
        }
        match event.keystroke.key.as_str() {
            "backspace" => {
                self.state.search_preedit = None;
                let total = self.state.search_query.encode_utf16().count();
                let start = self.state.search_selection.start.min(total);
                let end = self.state.search_selection.end.min(total).max(start);
                if end > start {
                    let bs = Self::utf16_to_byte(&self.state.search_query, start);
                    let be = Self::utf16_to_byte(&self.state.search_query, end);
                    self.state.search_query.replace_range(bs..be, "");
                    self.state.search_selection = start..start;
                } else if start > 0 {
                    let be = Self::utf16_to_byte(&self.state.search_query, start);
                    if let Some((prev_b, prev_ch)) =
                        self.state.search_query[..be].char_indices().next_back()
                    {
                        self.state.search_query.replace_range(prev_b..be, "");
                        let new_pos = start.saturating_sub(prev_ch.len_utf16());
                        self.state.search_selection = new_pos..new_pos;
                    }
                }
                cx.stop_propagation();
                cx.notify();
            }
            "delete" => {
                self.state.search_preedit = None;
                let total = self.state.search_query.encode_utf16().count();
                let start = self.state.search_selection.start.min(total);
                let end = self.state.search_selection.end.min(total).max(start);
                if end > start {
                    let bs = Self::utf16_to_byte(&self.state.search_query, start);
                    let be = Self::utf16_to_byte(&self.state.search_query, end);
                    self.state.search_query.replace_range(bs..be, "");
                    self.state.search_selection = start..start;
                } else if start < total {
                    let bs = Self::utf16_to_byte(&self.state.search_query, start);
                    if let Some(next_ch) = self.state.search_query[bs..].chars().next() {
                        let be = bs + next_ch.len_utf8();
                        self.state.search_query.replace_range(bs..be, "");
                    }
                }
                cx.stop_propagation();
                cx.notify();
            }
            "escape" => {
                self.state.search_preedit = None;
                cx.stop_propagation();
                cx.notify();
            }
            _ => {}
        }
    }
}

impl Focusable for MobileShellView {
    fn focus_handle(&self, _cx: &App) -> FocusHandle {
        self.search_focus.clone()
    }
}

impl EntityInputHandler for MobileShellView {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        adjusted_range: &mut Option<Range<usize>>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<String> {
        let total = self.state.search_query.encode_utf16().count();
        let s = range.start.min(total);
        let e = range.end.min(total).max(s);
        *adjusted_range = Some(s..e);
        let bs = Self::utf16_to_byte(&self.state.search_query, s);
        let be = Self::utf16_to_byte(&self.state.search_query, e);
        Some(self.state.search_query[bs..be].to_string())
    }

    fn selected_text_range(
        &mut self,
        _ignore_disabled_input: bool,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        let total = self.state.search_query.encode_utf16().count();
        let start = self.state.search_selection.start.min(total);
        let end = self.state.search_selection.end.min(total).max(start);
        Some(UTF16Selection {
            range: start..end,
            reversed: false,
        })
    }

    fn marked_text_range(
        &self,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Range<usize>> {
        self.state.search_preedit.clone()
    }

    fn unmark_text(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        self.state.search_preedit = None;
        cx.notify();
    }

    fn replace_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        text: &str,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let total = self.state.search_query.encode_utf16().count();
        let target = range
            .or_else(|| self.state.search_preedit.take())
            .unwrap_or_else(|| {
                let s = self.state.search_selection.start.min(total);
                let e = self.state.search_selection.end.min(total).max(s);
                s..e
            });
        let start_u16 = target.start.min(total);
        let end_u16 = target.end.min(total).max(start_u16);
        let bs = Self::utf16_to_byte(&self.state.search_query, start_u16);
        let be = Self::utf16_to_byte(&self.state.search_query, end_u16);
        self.state.search_query.replace_range(bs..be, text);
        let new_caret = start_u16 + text.encode_utf16().count();
        self.state.search_selection = new_caret..new_caret;
        self.state.search_preedit = None;
        cx.notify();
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range: Option<Range<usize>>,
        new_text: &str,
        new_selected_range: Option<Range<usize>>,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let total = self.state.search_query.encode_utf16().count();
        let target = range
            .or_else(|| self.state.search_preedit.clone())
            .unwrap_or_else(|| {
                let s = self.state.search_selection.start.min(total);
                let e = self.state.search_selection.end.min(total).max(s);
                s..e
            });
        let start_u16 = target.start.min(total);
        let end_u16 = target.end.min(total).max(start_u16);
        let bs = Self::utf16_to_byte(&self.state.search_query, start_u16);
        let be = Self::utf16_to_byte(&self.state.search_query, end_u16);
        self.state.search_query.replace_range(bs..be, new_text);
        let inserted_len = new_text.encode_utf16().count();
        self.state.search_preedit = if inserted_len > 0 {
            Some(start_u16..(start_u16 + inserted_len))
        } else {
            None
        };
        let sel = new_selected_range.map_or(
            (start_u16 + inserted_len)..(start_u16 + inserted_len),
            |r| (start_u16 + r.start)..(start_u16 + r.end),
        );
        self.state.search_selection = sel;
        cx.notify();
    }

    fn bounds_for_range(
        &mut self,
        range_utf16: Range<usize>,
        element_bounds: Bounds<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let char_w = 8.0 * self.state.font_scale.max(0.5);
        let origin_x: f32 = element_bounds.origin.x.into();
        let origin_y: f32 = element_bounds.origin.y.into();
        let max_w: f32 = element_bounds.size.width.into();
        let x = (origin_x + 36.0 + (range_utf16.start as f32) * char_w)
            .min(origin_x + (max_w - 48.0).max(36.0));
        let w = ((range_utf16.end.saturating_sub(range_utf16.start) as f32) * char_w).max(2.0);
        Some(Bounds::new(
            Point::new(px(x), px(origin_y + 12.0)),
            size(px(w), px(20.0)),
        ))
    }

    fn character_index_for_point(
        &mut self,
        point: Point<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<usize> {
        let total = self.state.search_query.encode_utf16().count();
        let char_w = 8.0 * self.state.font_scale.max(0.5);
        let px_x: f32 = point.x.into();
        let rel = (px_x - 52.0).max(0.0);
        Some(((rel / char_w).round() as usize).min(total))
    }
}

impl Render for MobileShellView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        window.set_touch_gestures_enabled(true);
        let now_ms = self.now_ms(cx);
        self.state.settle_animations(now_ms);
        self.page_editor.drain_events(&mut self.state, now_ms);

        let locale = self.state.locale();
        let dir = locale.direction();
        let strings = locale.strings();
        let palette = palette_for(self.state.resolved_theme());
        let vp = window.viewport_size();
        let viewport_w: f32 = vp.width.into();
        let viewport_h: f32 = vp.height.into();

        let raw_insets = self
            .insets_override
            .clone()
            .unwrap_or_else(|| window.insets());
        let safe = SafeArea::resolve_logical(&raw_insets, dir, SafeAreaEdges::all());
        let safe_metrics = SafeAreaMetrics {
            left: raw_insets.safe_area.left.into(),
            top: raw_insets.safe_area.top.into(),
            right: raw_insets.safe_area.right.into(),
            bottom: raw_insets.safe_area.bottom.into(),
        };
        let content_w = (viewport_w - safe_metrics.left - safe_metrics.right).max(44.0);
        let avail_h = (viewport_h - safe_metrics.top - safe_metrics.bottom).max(160.0);
        let a11y_bounds: A11yBoundsMap = Rc::new(RefCell::new(HashMap::new()));
        let search_focused = self.search_focus.is_focused(window);

        let mut measured_bc_layout = None;
        let body: ui::AnyElement = match self.state.route.clone() {
            MobileRoute::Home => tabs::render_home(
                &mut self.state,
                avail_h,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            )
            .into_any_element(),
            MobileRoute::Explorer => explorer::render_explorer(
                &mut self.state,
                avail_h,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            )
            .into_any_element(),
            MobileRoute::Journals => journals::render_journals(
                &self.state,
                content_w,
                avail_h,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            )
            .into_any_element(),
            MobileRoute::Search => search::render_search(
                &mut self.state,
                self.search_focus.clone(),
                search_focused,
                avail_h,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            )
            .into_any_element(),
            MobileRoute::Settings => settings::render_settings(
                &mut self.state,
                avail_h,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            )
            .into_any_element(),
            MobileRoute::Page(doc_id) => {
                let editor_entity =
                    self.page_editor
                        .sync(&mut self.state, &doc_id, content_w, avail_h, cx);
                let (el, bc_layout) = page::render_page(
                    &mut self.state,
                    &doc_id,
                    content_w,
                    avail_h,
                    editor_entity,
                    palette,
                    dir,
                    strings,
                    &a11y_bounds,
                    window,
                    cx,
                );
                measured_bc_layout = bc_layout;
                el.into_any_element()
            }
        };

        // Build the semantic tree; the host `PlatformAccessibility` sink is published exactly
        // once per frame at paint time after `apply_measured_bounds` fills real layout rects.
        self.published_a11y_tree = build_accessibility_tree_with_layout(
            &mut self.state,
            viewport_w,
            viewport_h,
            safe_metrics,
            measured_bc_layout.as_ref(),
        );
        self.last_viewport = (viewport_w, viewport_h);
        self.last_safe_area = safe_metrics;
        self.last_measured_breadcrumb =
            measured_bc_layout.and_then(|layout| match &self.state.route {
                MobileRoute::Page(doc_id) => Some((
                    doc_id.clone(),
                    self.state
                        .active_workspace()
                        .history
                        .current()
                        .map(|e| e.seq),
                    content_w,
                    layout,
                )),
                _ => None,
            });

        // Schedule the next animation frame automatically while any transition is mid-flight.
        if self.state.has_active_animation(now_ms) {
            window.request_animation_frame();
        }

        let show_tabbar = matches!(
            self.state.route,
            MobileRoute::Home | MobileRoute::Explorer | MobileRoute::Journals | MobileRoute::Search
        );

        let mut root = div()
            .id("mobile.shell.root")
            .snapshot("mobile.shell.root", None)
            .track_focus(&self.search_focus)
            .on_key_down(cx.listener(Self::handle_search_key_down))
            .size_full()
            .relative()
            .pt(safe.top)
            .pb(safe.bottom)
            .ps(safe.inline_start, dir)
            .pe(safe.inline_end, dir)
            .flex()
            .flex_col()
            .bg(palette.bg_canvas)
            .text_color(palette.text_primary)
            .font_family(FONT_SANS)
            .overflow_hidden();
        root = if dir.is_rtl() {
            root.dir_rtl()
        } else {
            root.dir_ltr()
        };
        root = root.child(
            div()
                .id("mobile.shell.body")
                .flex_1()
                .min_h(px(0.0))
                .w_full()
                .flex()
                .flex_col()
                .overflow_hidden()
                .child(body),
        );

        if show_tabbar {
            root = root.child(tabs::render_bottom_tabbar(
                &self.state,
                now_ms,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            ));
        }

        let sheet_snap = self.state.sheet_motion.snapshot_at(now_ms);
        let sheet_kind = if self.state.active_sheet != MobileSheet::None {
            self.state.active_sheet
        } else {
            self.state.closing_sheet.unwrap_or(MobileSheet::None)
        };
        if sheet_kind != MobileSheet::None
            && (self.state.active_sheet != MobileSheet::None || sheet_snap.is_open)
        {
            root = root.child(sheet::render_active_sheet(
                &mut self.state,
                sheet_kind,
                viewport_w,
                viewport_h,
                sheet_snap.progress as f32,
                sheet_snap.accepts_input,
                palette,
                dir,
                strings,
                &a11y_bounds,
                cx,
            ));
        }

        let view_entity = cx.entity().clone();
        let sync_bounds = a11y_bounds.clone();
        root = root.child(
            canvas(
                |_, _, _| (),
                move |_, (), _, cx| {
                    let measured = sync_bounds.borrow();
                    let _ = view_entity.update(cx, |this, _| {
                        apply_measured_bounds(&mut this.published_a11y_tree, &measured);
                        if let Ok(mut sink) = this.a11y_sink.lock() {
                            sink.publish_tree(&this.published_a11y_tree);
                        }
                    });
                },
            )
            .absolute()
            .w(px(0.0))
            .h(px(0.0)),
        );

        root
    }
}
