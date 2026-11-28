//! Edgeless smooth `170ms` camera zoom/fit transition and `230ms` Shape subpanel motion glue.

use ui::{AnyElement, Context, Pixels, Size, Window};

use crate::{PlaygroundView, theme::Palette};

use super::{CameraTransition, EdgelessCamera, ShapePickerVisualState};

impl PlaygroundView {
    /// Step active Edgeless camera/shape-picker transitions and build the zoom bar + toolbar.
    pub(crate) fn step_edgeless_controls_and_toolbar(
        &mut self,
        vp_origin: ui::Point<Pixels>,
        vp_size: Size<Pixels>,
        viewport_width: f32,
        palette: &Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> (AnyElement, Option<AnyElement>) {
        let now_ms = self.now_ms(cx);
        if let Some(transition) = self.edgeless_camera_transition {
            self.edgeless.camera = transition.camera_at(now_ms, vp_size);
            if transition.is_finished(now_ms) {
                self.edgeless_camera_transition = None;
            } else {
                window.request_animation_frame();
            }
        }
        // Structural invariant: whenever the Shape tool or its subpanel is no longer active,
        // ensure any open subpanel presence begins its 230ms close transition.
        if (!self.edgeless.authoring.tool.is_shape() || !self.edgeless.authoring.shape_picker_open)
            && let Some(p) = self.edgeless_shape_picker_presence.as_mut()
            && !p.closing
        {
            p.close(now_ms);
        }
        if self
            .edgeless_shape_picker_presence
            .is_some_and(|p| p.gone(now_ms))
        {
            self.edgeless_shape_picker_presence = None;
        }
        if self
            .edgeless_shape_picker_presence
            .is_some_and(|p| p.in_flight(now_ms) || p.closing)
        {
            window.request_animation_frame();
        }

        let toolbar_visible = !self.edgeless_readonly;
        let zoom_controls = super::build_zoom_controls(
            self.edgeless.camera.zoom,
            viewport_width,
            toolbar_visible,
            self.form_factor.is_touch_form_factor(),
            palette,
            self.theme,
            move |this: &mut Self, _, _, cx| {
                this.animate_edgeless_camera(vp_size, |cam| cam.zoom_out(vp_origin, vp_size), cx);
            },
            move |this: &mut Self, _, _, cx| {
                this.animate_edgeless_camera(vp_size, |cam| cam.reset_zoom(vp_origin, vp_size), cx);
            },
            move |this: &mut Self, _, _, cx| {
                this.animate_edgeless_camera(vp_size, |cam| cam.zoom_in(vp_origin, vp_size), cx);
            },
            move |this: &mut Self, _, _, cx| {
                if let Some(snap) = this.snapshot.clone() {
                    let bounds = this.edgeless.scene_world_bounds(&snap);
                    this.animate_edgeless_camera(
                        vp_size,
                        |cam| cam.fit_to_bounds(bounds, vp_size, 48.0),
                        cx,
                    );
                }
            },
            cx,
        );
        let toolbar = toolbar_visible.then(|| {
            let picker_state = self.edgeless_shape_picker_presence.and_then(|presence| {
                let progress = presence.progress(now_ms);
                if presence.closing && progress <= 0.0 {
                    return None;
                }
                Some(ShapePickerVisualState {
                    active_shape: self.edgeless.authoring.active_shape_type(),
                    progress,
                    interactive: !presence.closing,
                })
            });
            super::build_edgeless_toolbar(
                self.edgeless.authoring.tool,
                picker_state,
                viewport_width,
                palette,
                self.theme,
                cx,
            )
        });
        (zoom_controls, toolbar)
    }

    /// Start or smoothly retarget a `170ms` ease-out camera transition on the scheduler clock.
    pub(crate) fn animate_edgeless_camera(
        &mut self,
        vp_size: Size<Pixels>,
        compute_target: impl FnOnce(&mut EdgelessCamera),
        cx: &mut Context<Self>,
    ) {
        let now_ms = self.now_ms(cx);
        let current = match self.edgeless_camera_transition {
            Some(tr) => tr.camera_at(now_ms, vp_size),
            None => self.edgeless.camera,
        };
        let mut target = match self.edgeless_camera_transition {
            Some(tr) => tr.target_camera(),
            None => current,
        };
        compute_target(&mut target);
        self.edgeless.camera = current;
        self.edgeless.camera_initialized = true;
        self.edgeless_camera_transition =
            Some(CameraTransition::new(current, target, vp_size, now_ms));
        cx.notify();
    }
}
