use ui::{
    AnyElement, BorderStyle, Bounds, Corners, Edges, FontWeight, MouseButton, SharedString,
    TextRun, Window, canvas, div, point, prelude::*, px, size,
};

use crate::{
    block_flow::{PAGE_SURFACE_ID, PageViewport, RemotePresence, page_elements, page_geometry},
    room_client::RoomStatus,
    theme::{FONT_SANS, Palette},
};

use super::*;

/// Cached per-frame software-keyboard and bottom safe-area insets (logical px).
#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct ImeInsetsState {
    pub(crate) last_keyboard: f32,
    pub(crate) last_bottom: f32,
    pub(crate) host_override: f32,
}

impl PlaygroundView {
    /// Applies an explicit host-reported software keyboard height (logical px) in
    /// addition to `window.insets().ime.bottom`.
    pub fn set_host_ime_bottom(&mut self, height_px: f32) {
        self.ime_insets.host_override = height_px.max(0.0);
    }

    pub(crate) fn effective_ime_bottom(&self, window: &Window) -> f32 {
        f32::from(window.insets().ime.bottom)
            .max(self.ime_insets.host_override)
            .max(0.0)
    }

    fn render_mode_switcher(
        &mut self,
        palette: &Palette,
        left: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
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
        let is_page = self.mode == PlaygroundMode::Page;
        let is_edgeless = self.mode == PlaygroundMode::Edgeless;

        let indicator = div()
            .absolute()
            .left(px(indicator_x))
            .top(px(4.0))
            .w(px(86.0))
            .h(px(26.0))
            .rounded(px(6.0))
            .bg(palette.background)
            .border_1()
            .border_color(palette.brand)
            .snapshot(
                "chrome.mode_switcher.indicator",
                Some("chrome.mode_switcher"),
            );

        let segment = |id: &'static str, x: f64, active: bool| {
            div()
                .id(id)
                .absolute()
                .left(px(x as f32))
                .top(px(4.0))
                .w(px(86.0))
                .h(px(26.0))
                .rounded(px(6.0))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_color(if active {
                    palette.text_primary
                } else {
                    palette.text_secondary
                })
                .text_size(px(13.0))
                .font_weight(FontWeight::MEDIUM)
        };

        let page_button = segment("mode-page", PILL_PAGE_X, is_page)
            .on_click(cx.listener(|this, _, window, cx| {
                this.edgeless_camera_transition = None;
                let now_ms = this.now_ms(cx);
                this.overlays.close_context_menu(now_ms);
                this.set_mode(PlaygroundMode::Page, window, cx);
            }))
            .snapshot("chrome.mode_switcher.page", Some("chrome.mode_switcher"))
            .snapshot_focused(is_page)
            .snapshot_text("Page")
            .child("Page");

        let edgeless_button = segment("mode-edgeless", PILL_EDGELESS_X, is_edgeless)
            .on_click(cx.listener(|this, _, window, cx| {
                let now_ms = this.now_ms(cx);
                this.overlays.close_context_menu(now_ms);
                this.set_mode(PlaygroundMode::Edgeless, window, cx);
            }))
            .snapshot(
                "chrome.mode_switcher.edgeless",
                Some("chrome.mode_switcher"),
            )
            .snapshot_focused(is_edgeless)
            .snapshot_text("Edgeless")
            .child("Edgeless");

        div()
            .absolute()
            .left(px(left))
            .top(px(8.0))
            .w(px(PILL_WIDTH))
            .h(px(36.0))
            .p(px(4.0))
            .rounded(px(10.0))
            .bg(palette.background_secondary)
            .border_1()
            .border_color(palette.border)
            .snapshot("chrome.mode_switcher", Some("chrome.topbar"))
            .child(indicator)
            .child(page_button)
            .child(edgeless_button)
    }

    fn render_theme_toggle(
        &self,
        palette: &Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let ink = palette.text_primary;
        let hover = palette.hover;
        div()
            .id("theme-toggle")
            .flex_none()
            .w(px(THEME_TOGGLE_SIZE))
            .h(px(THEME_TOGGLE_SIZE))
            .rounded(px(8.0))
            .bg(palette.background)
            .border_1()
            .border_color(palette.border)
            .cursor_pointer()
            .hover(move |style| style.bg(hover))
            .on_click(cx.listener(|this, _, _, cx| {
                let next = this.theme.toggled();
                this.set_theme(next, cx);
            }))
            .snapshot("chrome.theme_toggle", Some("chrome.topbar"))
            .snapshot_text(match self.theme {
                PlaygroundTheme::Light => "Light",
                PlaygroundTheme::Dark => "Dark",
            })
            .child(
                // Contrast glyph: a ring whose left half is filled.
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, _| {
                        let glyph = Bounds::new(
                            point(
                                bounds.origin.x + (bounds.size.width - px(14.0)) / 2.0,
                                bounds.origin.y + (bounds.size.height - px(14.0)) / 2.0,
                            ),
                            size(px(14.0), px(14.0)),
                        );
                        window.paint_quad(ui::quad(
                            glyph,
                            Corners::all(px(7.0)),
                            ui::transparent_black(),
                            Edges::all(px(1.5)),
                            ink,
                            BorderStyle::Solid,
                        ));
                        window.paint_quad(ui::quad(
                            Bounds::new(glyph.origin, size(px(7.0), px(14.0))),
                            Corners {
                                top_left: px(7.0),
                                top_right: px(0.0),
                                bottom_right: px(0.0),
                                bottom_left: px(7.0),
                            },
                            ink,
                            Edges::all(px(0.0)),
                            ui::transparent_black(),
                            BorderStyle::Solid,
                        ));
                    },
                )
                .size_full(),
            )
    }

    /// Presence badges that fit in `available` px: name pills on regular viewports,
    /// initials on narrow ones, and a `+N` chip for collaborators that do not fit.
    fn render_presence(
        presences: &[RemotePresence],
        palette: &Palette,
        available: f32,
        compact: bool,
        window: &Window,
    ) -> Vec<AnyElement> {
        const NAME_MAX: f32 = 72.0;
        let slot = if compact {
            32.0
        } else {
            8.0 + 8.0 + 6.0 + NAME_MAX + 10.0 + 8.0
        };
        let capacity = ((available / slot).floor().max(0.0) as usize).min(3);
        if capacity == 0 || presences.is_empty() {
            return Vec::new();
        }
        let shown = if presences.len() > capacity {
            capacity - 1
        } else {
            presences.len()
        };
        let mut badges = Vec::new();
        let hidden = presences.len() - shown;
        if hidden > 0 {
            badges.push(
                div()
                    .flex_none()
                    .w(px(24.0))
                    .h(px(24.0))
                    .rounded(px(12.0))
                    .bg(palette.background_secondary)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(11.0))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(palette.text_secondary)
                    .snapshot("chrome.presence.more", Some("chrome.topbar"))
                    .snapshot_text(format!("+{hidden}"))
                    .child(format!("+{hidden}"))
                    .into_any_element(),
            );
        }
        for presence in &presences[..shown] {
            let id = SharedString::from(format!("chrome.presence.{}", presence.client_id));
            let name = SharedString::from(presence.name.clone());
            let badge = if compact {
                let initial: String = presence
                    .name
                    .chars()
                    .find(|ch| ch.is_alphanumeric())
                    .map(|ch| ch.to_uppercase().collect())
                    .unwrap_or_else(|| "?".to_string());
                div()
                    .flex_none()
                    .w(px(24.0))
                    .h(px(24.0))
                    .rounded(px(12.0))
                    .bg(presence.color)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(12.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.on_accent)
                    .snapshot(id, Some("chrome.topbar"))
                    .snapshot_text(name)
                    .child(initial)
            } else {
                // The name box gets an explicit whole-pixel width so the pill stays on
                // the pixel grid whatever the name measures.
                let mut font = ui::font(FONT_SANS);
                font.weight = FontWeight::MEDIUM;
                let measured = window.text_system().shape_line(
                    name.clone(),
                    px(12.0),
                    &[TextRun {
                        len: name.len(),
                        font,
                        color: palette.text_primary,
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }],
                    None,
                );
                let name_width = f32::from(measured.width()).ceil().min(NAME_MAX);
                div()
                    .flex_none()
                    .h(px(24.0))
                    .pl(px(8.0))
                    .pr(px(10.0))
                    .rounded(px(12.0))
                    .bg(presence.color.opacity(0.14))
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .snapshot(id, Some("chrome.topbar"))
                    .snapshot_text(name.clone())
                    .child(
                        div()
                            .flex_none()
                            .w(px(8.0))
                            .h(px(8.0))
                            .rounded(px(4.0))
                            .bg(presence.color),
                    )
                    .child(
                        div()
                            .flex_none()
                            .w(px(name_width))
                            .truncate()
                            .text_size(px(12.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(palette.text_primary)
                            .child(name),
                    )
            };
            badges.push(badge.into_any_element());
        }
        badges
    }

    fn render_page(
        &mut self,
        palette: &Palette,
        viewport_width: f32,
        viewport_height: f32,
        presences: &[RemotePresence],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        if window.focused(cx).is_none() {
            self.editor_focus.focus(window, cx);
        }
        let geometry = page_geometry(viewport_width);
        let surface = div()
            .id("page-viewport")
            .relative()
            .flex_1()
            .w_full()
            .min_h_0()
            .overflow_hidden()
            .track_focus(&self.editor_focus)
            .on_mouse_down(MouseButton::Left, cx.listener(Self::page_mouse_down))
            .on_mouse_down(MouseButton::Right, cx.listener(Self::page_right_mouse_down))
            .on_key_down(cx.listener(Self::editor_key_down))
            .on_scroll(cx.listener(|this, event, window, cx| {
                let now_ms = this.now_ms(cx);
                this.overlays.close_context_menu(now_ms);
                this.on_scroll(event, window, cx);
            }))
            .snapshot(PAGE_SURFACE_ID, Some("root.canvas"));

        self.flow.database_state.mobile_readonly = self.database_readonly;
        self.flow.database_state.clock_ms = self.local_calendar_now(cx).0;
        let Some(layout) = self.ensure_layout(geometry.column_width, window) else {
            self.max_scroll = 0.0;
            self.scroll_y = 0.0;
            return surface
                .child(self.render_status(palette, &geometry))
                .into_any_element();
        };
        let was_toolbar_visible = self.overlays.keyboard_toolbar_visible();
        let live_kb_inset = self.effective_ime_bottom(window);
        // Auto-show the mobile soft-keyboard toolbar on touch hosts, narrow viewports, or when
        // a software keyboard is active whenever an editable target holds focus, unless dismissed.
        if !self.page_readonly
            && (self.is_touch_host()
                || f32::from(window.viewport_size().width) < 600.0
                || live_kb_inset > 0.0)
            && (self.editor.selection.is_some()
                || (live_kb_inset > 0.0 && self.table_cell.is_some()))
            && !self.keyboard_toolbar_dismissed
        {
            self.overlays.set_keyboard_toolbar_visible(true);
        }
        if !was_toolbar_visible && self.overlays.keyboard_toolbar_visible() {
            self.editor.reveal = true;
        }
        let bottom_inset = self.ime_insets.last_bottom;
        let avail_win_h = (self.window_size.1 - bottom_inset).max(TOPBAR_HEIGHT);
        let toolbar_reserved = self.overlays.keyboard_toolbar_reserved_height(avail_win_h);
        let bottom_occlusion = bottom_inset + toolbar_reserved;
        let effective_viewport_height = (viewport_height - bottom_occlusion).max(40.0);
        self.max_scroll = (layout.height + bottom_occlusion - viewport_height)
            .max(0.0)
            .ceil();
        let now_ms = self.now_ms(cx);
        self.step_page_flings(now_ms, window);
        if let Some((id, screen_y)) = self.reading_anchor.take()
            && let Some(block) = layout.block(&id)
        {
            self.scroll_y = (block.y - screen_y).round();
        }
        let reveal_margin = if bottom_occlusion > 0.0 { 10.0 } else { 0.0 };
        self.reveal_caret(effective_viewport_height, reveal_margin);
        self.scroll_y = self.scroll_y.clamp(0.0, self.max_scroll);
        if self.database_readonly && !self.database_readonly_toast_shown {
            let vis_top = self.scroll_y;
            let vis_bot = self.scroll_y + effective_viewport_height;
            if layout.blocks.iter().any(|b| {
                b.body.kind == crate::block_flow::FlowKind::Database
                    && b.y + b.body.height > vis_top
                    && b.y < vis_bot
            }) {
                self.show_database_readonly_toast_once(cx);
            }
        }
        let viewport = PageViewport {
            column_x: geometry.column_x,
            height: viewport_height,
            scroll_y: self.scroll_y,
        };
        let caret_alpha = self.caret_blink_alpha(self.now_ms(cx));
        let local = self.local_selection_elements(&layout, viewport, palette, caret_alpha);
        let focus = self.editor_focus.clone();
        let entity = cx.entity();
        let marks = layout.presence_marks(presences, palette, window);
        let (paint, controls) = self.overlay_page_layer(&layout, palette, window, cx);
        let table_toolbar = self.render_table_toolbar(&layout, viewport, palette, cx);
        let scrollbar = overlays::ScrollbarMetrics::compute(
            viewport_width,
            viewport_height,
            self.scroll_y,
            self.max_scroll,
            window.layout_direction(),
            self.form_factor.is_touch_form_factor() || self.edgeless_readonly,
        )
        .map(|metrics| {
            overlays::build_page_scrollbar(
                metrics,
                self.scrollbar_drag.is_some(),
                palette,
                Self::on_scrollbar_mouse_down,
                cx,
            )
        });
        surface
            .children(page_elements(
                &layout,
                marks,
                PageViewport {
                    column_x: geometry.column_x,
                    height: viewport_height,
                    scroll_y: self.scroll_y,
                },
                &paint,
            ))
            .children(local)
            .child(
                canvas(
                    |_, _, _| (),
                    move |bounds, _, window, cx| {
                        window.handle_input(
                            &focus,
                            ui::ElementInputHandler::new(bounds, entity),
                            cx,
                        )
                    },
                )
                .absolute()
                .size_full(),
            )
            .children(controls)
            .children(table_toolbar)
            .children(scrollbar)
            .into_any_element()
    }

    /// Shown while a live room has not delivered a page yet.
    fn render_status(
        &self,
        palette: &Palette,
        geometry: &block_flow::PageGeometry,
    ) -> impl IntoElement + use<> {
        let (headline, detail) = match &self.room {
            Some(room) => {
                let headline = match room.protocol.status() {
                    RoomStatus::Connecting => format!("Connecting to room {}", room.config.room),
                    RoomStatus::Syncing { .. } => format!("Syncing room {}", room.config.room),
                    RoomStatus::Live => format!("Room {} has no page yet", room.config.room),
                    RoomStatus::Offline(_) => format!("Room {} is offline", room.config.room),
                };
                let detail = match (room.protocol.status(), &room.error) {
                    (_, Some(error)) => error.clone(),
                    (RoomStatus::Offline(reason), None) => reason,
                    (RoomStatus::Live, None) => {
                        "The page appears here as soon as a peer creates it.".to_string()
                    }
                    _ => room.config.ws_url.clone(),
                };
                (headline, detail)
            }
            None => (
                "This document has no page yet".to_string(),
                "Add an affine:page root block to see it here.".to_string(),
            ),
        };
        div()
            .absolute()
            .left(px(geometry.column_x))
            .top(px(block_flow::TITLE_PADDING_Y))
            .w(px(geometry.column_width))
            .flex()
            .flex_col()
            .gap(px(8.0))
            .snapshot("page.status", Some(PAGE_SURFACE_ID))
            .snapshot_text(headline.clone())
            .child(
                div()
                    .text_size(px(20.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.text_primary)
                    .child(headline),
            )
            .child(
                div()
                    .text_size(px(14.0))
                    .text_color(palette.text_secondary)
                    .child(detail),
            )
    }

    fn render_edgeless(
        &mut self,
        palette: &Palette,
        viewport_width: f32,
        viewport_height: f32,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let Some(snapshot) = self.snapshot.clone() else {
            return div()
                .flex_1()
                .w_full()
                .min_h_0()
                .bg(palette.background_secondary)
                .snapshot(edgeless::EDGELESS_VIEWPORT_ID, Some("root.canvas"))
                .into_any_element();
        };

        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let vp_size = size(px(viewport_width.max(1.0)), px(viewport_height.max(1.0)));
        if viewport_width > 0.0 && viewport_height > 0.0 {
            self.edgeless.ensure_camera_initialized(&snapshot, vp_size);
        }
        let now_ms = self.now_ms(cx);
        self.step_edgeless_fling(now_ms, window);
        let (zoom_controls, toolbar) = self.step_edgeless_controls_and_toolbar(
            vp_origin,
            vp_size,
            viewport_width,
            palette,
            window,
            cx,
        );

        let render_snapshot = self
            .preedit_snapshot()
            .map(Rc::new)
            .unwrap_or_else(|| Rc::clone(&snapshot));
        let preedit_nonce = self.editor.preedit_nonce();
        let editing_selection = self
            .edgeless
            .authoring
            .editing_spatial_block()
            .map(|(id, is_note)| (id.to_string(), is_note))
            .or_else(|| self.edgeless_readonly_selection_target.clone())
            .and_then(|(editing_id, is_note)| {
                if self.native_suppresses_gpu_caret_and_selection {
                    return None;
                }
                let sel = self.editor.selection.clone()?;
                let focus = self.visual_focus()?;
                Some((editing_id, is_note, sel, focus))
            });

        let (_, utc_offset_minutes) = self.local_calendar_now(cx);
        let offset_at = self.utc_offset_resolver();
        let doc_dir: &dyn crate::directory::WorkspaceDocDirectory = self
            .custom_doc_directory
            .as_deref()
            .unwrap_or(&self.default_doc_directory);
        let input = edgeless::EdgelessRenderInput {
            snapshot: &render_snapshot,
            doc_rev: self.doc_rev,
            env_rev: self.env_rev,
            preview_rev: crate::block_flow::preview_revision(),
            preedit_nonce,
            theme: self.theme,
            palette,
            page_titles: &self.page_titles,
            images: &self.images,
            pdf_previews: Some(&self.pdf_previews),
            doc_directory: Some(doc_dir),
            viewport_width,
            viewport_height,
            direction: window.layout_direction(),
            form_factor: self.form_factor,
            utc_offset_minutes,
            utc_offset_at: Some(&offset_at),
            editing_selection,
        };
        let layer = edgeless::build_edgeless_layer(
            &mut self.edgeless,
            &input,
            window,
            zoom_controls,
            toolbar,
        );
        let needs_text_input = self.edgeless.authoring.inline_edit.is_some()
            || self.overlays.active_text_field().is_some();
        let input_overlay = needs_text_input.then(|| {
            let focus = self.editor_focus.clone();
            let entity = cx.entity();
            canvas(
                |_, _, _| (),
                move |bounds, _, window, cx| {
                    window.handle_input(&focus, ui::ElementInputHandler::new(bounds, entity), cx)
                },
            )
            .absolute()
            .size_full()
        });

        div()
            .relative()
            .flex_1()
            .w_full()
            .min_h_0()
            .flex()
            .flex_col()
            .track_focus(&self.editor_focus)
            .on_key_down(cx.listener(Self::editor_key_down))
            .on_key_up(cx.listener(|this, event: &ui::KeyUpEvent, _, _| {
                if event.keystroke.key == "space" {
                    this.edgeless.authoring.space_pan = false;
                }
            }))
            .on_scroll(cx.listener(Self::on_edgeless_scroll))
            .on_pinch(cx.listener(Self::on_edgeless_pinch))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_edgeless_left_down))
            .on_mouse_down(
                MouseButton::Right,
                cx.listener(Self::edgeless_right_mouse_down),
            )
            .on_mouse_down(
                MouseButton::Middle,
                cx.listener(Self::on_edgeless_pan_start),
            )
            .child(layer)
            .children(input_overlay)
            .into_any_element()
    }
}

impl ui::Render for PlaygroundView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.overlays.set_keyboard_toolbar_marks_disabled(
            self.table_cell.is_some() && self.editor.selection.is_none(),
        );
        self.sync_keyboard_toolbar_state();
        window.set_touch_gestures_enabled(true);
        self.handle_touch_gestures(window, cx);
        let kb_inset = self.effective_ime_bottom(window);
        let eff_bottom = f32::from(window.insets().effective().bottom)
            .max(kb_inset)
            .max(0.0);
        if self.ime_insets.last_keyboard > 0.0 && kb_inset == 0.0 {
            self.keyboard_toolbar_dismissed = true;
            self.overlays.set_keyboard_toolbar_visible(false);
        } else if kb_inset > 0.0 && self.ime_insets.last_keyboard == 0.0 {
            self.keyboard_toolbar_dismissed = false;
            self.editor.reveal = true;
        } else if kb_inset > self.ime_insets.last_keyboard
            || eff_bottom > self.ime_insets.last_bottom
        {
            self.editor.reveal = true;
        }
        self.ime_insets.last_keyboard = kb_inset;
        self.ime_insets.last_bottom = eff_bottom;

        let palette = self.theme.palette();
        let viewport = window.viewport_size();
        let viewport_width = f32::from(viewport.width).floor();
        let viewport_height = (f32::from(viewport.height) - TOPBAR_HEIGHT)
            .max(0.0)
            .floor();
        self.window_size = (viewport_width, f32::from(viewport.height).floor());

        let presences = self.remote_presences(&palette);
        let switcher_left = ((viewport_width - PILL_WIDTH) / 2.0).floor().max(0.0);
        let mode_switcher = self.render_mode_switcher(&palette, switcher_left, window, cx);
        let doc_panel_toggle = self.render_doc_panel_toggle(&palette, viewport_width < 440.0, cx);
        let theme_toggle = self.render_theme_toggle(&palette, cx);
        let presence_room = viewport_width
            - TOPBAR_EDGE
            - THEME_TOGGLE_SIZE
            - 8.0
            - (switcher_left + PILL_WIDTH + 8.0);
        let badges = Self::render_presence(
            &presences,
            &palette,
            presence_room,
            viewport_width < 720.0,
            window,
        );

        self.sync_embeds_shielded();

        let content = match self.mode {
            PlaygroundMode::Page => self.render_page(
                &palette,
                viewport_width,
                viewport_height,
                &presences,
                window,
                cx,
            ),
            PlaygroundMode::Edgeless => {
                self.render_edgeless(&palette, viewport_width, viewport_height, window, cx)
            }
        };
        #[cfg(target_arch = "wasm32")]
        self.reconcile_wasm_html_embeds(viewport_width, viewport_height);
        let mut popovers = self.overlay_popovers(&palette, window, cx);
        popovers.extend(self.render_touch_selection_menu(&palette, window, cx));
        popovers.extend(self.render_database_record_sheet(&palette, window, cx));
        popovers.extend(self.render_doc_panel(&palette, viewport_width, viewport_height, cx));

        div()
            .relative()
            .size_full()
            .font_family(FONT_SANS)
            .flex()
            .flex_col()
            .bg(palette.background)
            .text_color(palette.text_primary)
            .on_mouse_move(cx.listener(Self::root_mouse_move))
            .on_mouse_up(MouseButton::Left, cx.listener(Self::root_mouse_up))
            .on_mouse_up(
                MouseButton::Middle,
                cx.listener(|this, e, w, cx| {
                    if this.mode == PlaygroundMode::Edgeless {
                        this.on_edgeless_pan_end(e, w, cx);
                    }
                }),
            )
            .snapshot("root.canvas", None)
            .child(
                div()
                    .relative()
                    .flex_none()
                    .w_full()
                    .h(px(TOPBAR_HEIGHT))
                    .bg(palette.panel)
                    .border_b_1()
                    .border_color(palette.border)
                    .snapshot("chrome.topbar", Some("root.canvas"))
                    .child(
                        div()
                            .absolute()
                            .left(px(TOPBAR_EDGE))
                            .top(px(0.0))
                            .h(px(TOPBAR_HEIGHT - 1.0))
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .child(doc_panel_toggle)
                            .children(self.render_nav_back(&palette, cx)),
                    )
                    .child(mode_switcher)
                    .child(
                        div()
                            .absolute()
                            .right(px(TOPBAR_EDGE))
                            .top(px(0.0))
                            .h(px(TOPBAR_HEIGHT - 1.0))
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .children(badges)
                            .child(theme_toggle),
                    ),
            )
            .child(content)
            .children(popovers)
    }
}
