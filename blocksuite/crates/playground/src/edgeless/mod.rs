//! PlaygroundView glue for `blocksuite_editor::edgeless`.

mod commands;
mod commit;
mod gestures;
mod inline_edit;
mod paste;
mod paste_convert;
mod shape_picker;

pub use blocksuite_editor::edgeless::*;

use commands::{find_block, find_surface_element, max_spatial_index};

impl EdgelessToolbarHost for crate::PlaygroundView {
    fn edgeless_active_tool(&self) -> EdgelessTool {
        self.edgeless.authoring.tool
    }

    fn edgeless_active_shape_type(&self) -> ShapePreset {
        self.edgeless.authoring.active_shape_type()
    }

    fn edgeless_toggle_shape_picker(
        &mut self,
        window: &mut ui::Window,
        cx: &mut ui::Context<Self>,
    ) {
        crate::PlaygroundView::edgeless_toggle_shape_picker(self, window, cx);
    }

    fn edgeless_select_tool(
        &mut self,
        tool: EdgelessTool,
        window: &mut ui::Window,
        cx: &mut ui::Context<Self>,
    ) {
        crate::PlaygroundView::edgeless_select_tool(self, tool, window, cx);
    }
}

#[cfg(test)]
mod tests {
    use ui::AppContext;

    #[test]
    fn frame_one_zoom_badge_matches_fitted_camera_zoom() {
        let platform = ui::HeadlessPlatform::new(1280, 800, 1.0);
        let app = ui::Application::with_platform(platform.clone()).run_embedded(|cx| {
            crate::register_bundled_fonts(cx).unwrap();
        });
        let win = app
            .update(|cx| {
                cx.open_window(ui::WindowOptions::default(), |_window, cx| {
                    cx.new(|cx| {
                        crate::PlaygroundView::with_options(
                            crate::PlaygroundOptions {
                                mode: crate::PlaygroundMode::Edgeless,
                                ..Default::default()
                            },
                            cx,
                        )
                    })
                })
            })
            .unwrap();
        let hw = platform.windows().into_iter().next().unwrap();
        hw.request_frame();
        // Frame 1 must already display the fitted zoom percentage (not stale "100%").
        let snap = app
            .update(|cx| win.update(cx, |_, window, _| window.frame_snapshot().clone()))
            .unwrap();
        let badge = snap
            .elements
            .get("chrome.edgeless_zoom.reset")
            .expect("chrome.edgeless_zoom.reset missing on frame 1");
        let text = badge.text.as_deref().unwrap_or("");
        assert_ne!(
            text, "100%",
            "Frame 1 zoom badge must reflect fitted camera, got {text}"
        );
        assert!(text.ends_with('%'), "expected percentage badge, got {text}");
        assert!(
            snap.elements.contains_key("chrome.edgeless_toolbar"),
            "chrome.edgeless_toolbar must be mounted on Frame 1"
        );
    }
}
