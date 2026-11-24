//! Browser viewport and safe-area frame snapshots in canvas coordinates.
//!
//! Browser geometry is sampled before rendering, never by geometry getters.
//! Safe-area padding is resolved by CSS on a single zero-size `aria-hidden`
//! non-interactive probe using per-side CSS padding transitions (`0.001ms
//! step-start`) so any single-edge or fractional CSS-pixel redistribution
//! triggers `transitionrun`/`transitionend` without linear-encoding collisions.

use crate::{Bounds, Edges, Pixels, WindowInsets, point, px, size};
#[cfg(target_family = "wasm")]
use wasm_bindgen::JsCast;

/// Raw CSS-pixel viewport and safe-area measurements used to compute
/// [`Bounds<Pixels>`] and [`WindowInsets`] deterministically.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct RawViewportMetrics {
    pub(crate) canvas_left: f64,
    pub(crate) canvas_top: f64,
    pub(crate) canvas_width: f64,
    pub(crate) canvas_height: f64,
    pub(crate) layout_width: f64,
    pub(crate) layout_height: f64,
    pub(crate) visual_offset_left: f64,
    pub(crate) visual_offset_top: f64,
    pub(crate) visual_width: f64,
    pub(crate) visual_height: f64,
    pub(crate) visual_scale: f64,
    pub(crate) safe_area_css: [f64; 4], // [top, right, bottom, left]
}

/// Pure viewport calculation shared by runtime and unit tests.
///
/// Prevents double-subtracting the software keyboard when `visualViewport.height`
/// has already shrunk: `visible_bounds` reflects the shortened `visualViewport`,
/// while `WindowInsets.ime.bottom` reports only the portion of the canvas
/// obscured below `visible_bounds` (0 when the browser already resized the layout
/// viewport / canvas, or during pinch zoom).
pub(crate) fn compute_viewport_snapshot(m: RawViewportMetrics) -> (Bounds<Pixels>, WindowInsets) {
    let canvas_right = m.canvas_left + m.canvas_width;
    let canvas_bottom = m.canvas_top + m.canvas_height;

    let x = (m.visual_offset_left - m.canvas_left).clamp(0.0, m.canvas_width);
    let y = (m.visual_offset_top - m.canvas_top).clamp(0.0, m.canvas_height);
    let right = (m.visual_offset_left + m.visual_width - m.canvas_left).clamp(x, m.canvas_width);
    let bottom = (m.visual_offset_top + m.visual_height - m.canvas_top).clamp(y, m.canvas_height);
    let visible_bounds = Bounds::new(
        point(px(x as f32), px(y as f32)),
        size(px((right - x) as f32), px((bottom - y) as f32)),
    );

    let [sa_top, sa_right, sa_bottom, sa_left] = m.safe_area_css;
    let safe_area = Edges {
        top: px((sa_top - m.canvas_top).max(0.0) as f32),
        right: px((canvas_right - m.layout_width + sa_right).max(0.0) as f32),
        bottom: px((canvas_bottom - m.layout_height + sa_bottom).max(0.0) as f32),
        left: px((sa_left - m.canvas_left).max(0.0) as f32),
    };

    let unzoomed = (m.visual_scale - 1.0).abs() < 0.01;
    let obscured_bottom = if unzoomed && m.visual_height < m.layout_height - 1.0 {
        (m.canvas_height - bottom).max(0.0)
    } else {
        0.0
    };
    let ime = Edges {
        top: px(0.0),
        right: px(0.0),
        bottom: px(obscured_bottom as f32),
        left: px(0.0),
    };

    let insets = WindowInsets {
        safe_area,
        ime,
        ..WindowInsets::default()
    };
    (visible_bounds, insets)
}

/// Shared single-probe state comparing exact per-edge CSS floats (`[top, right, bottom, left]`)
/// with zero linear-encoding collisions, including fractional CSS pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct SafeAreaProbeState {
    last_edges: [f64; 4],
}

impl SafeAreaProbeState {
    /// Records `edges` (`[top, right, bottom, left]`) and returns `true` if any
    /// individual side changed (even when sums match or deltas are fractional px).
    pub(crate) fn update(&mut self, edges: [f64; 4]) -> bool {
        let changed = self
            .last_edges
            .iter()
            .zip(edges.iter())
            .any(|(prev, next)| prev.to_bits() != next.to_bits());
        self.last_edges = edges;
        changed
    }
}

/// Inline style string for the single hidden safe-area probe.
///
/// Uses per-edge `0.001ms step-start` transitions on all four `padding-*`
/// properties so any individual edge change fires `transitionrun` /
/// `transitionend` even when total width/height is unchanged or values are
/// fractional CSS pixels.
pub(crate) const SINGLE_SAFE_AREA_PROBE_STYLE: &str = "position:fixed;left:0;top:0;width:0;height:0;border:0;margin:0;visibility:hidden;\
     pointer-events:none;box-sizing:content-box;\
     padding-top:env(safe-area-inset-top,0px);\
     padding-right:env(safe-area-inset-right,0px);\
     padding-bottom:env(safe-area-inset-bottom,0px);\
     padding-left:env(safe-area-inset-left,0px);\
     transition:padding-top 0.001ms step-start,padding-right 0.001ms step-start,\
     padding-bottom 0.001ms step-start,padding-left 0.001ms step-start";

#[cfg(target_family = "wasm")]
pub(crate) struct WebViewport {
    safe_area_probe: web_sys::HtmlElement,
    probe_state: SafeAreaProbeState,
    pub(crate) visible_bounds: Bounds<Pixels>,
    pub(crate) insets: WindowInsets,
}

#[cfg(target_family = "wasm")]
impl WebViewport {
    pub(crate) fn new(document: &web_sys::Document) -> anyhow::Result<Self> {
        let safe_area_probe = create_single_safe_area_probe(document)?;
        let body = document
            .body()
            .ok_or_else(|| anyhow::anyhow!("Missing document body"))?;
        body.append_child(&safe_area_probe)
            .map_err(|error| anyhow::anyhow!("Failed to attach safe-area probe: {error:?}"))?;
        Ok(Self {
            safe_area_probe,
            probe_state: SafeAreaProbeState::default(),
            visible_bounds: Bounds::default(),
            insets: WindowInsets::default(),
        })
    }

    pub(crate) fn probe_target(&self) -> web_sys::EventTarget {
        self.safe_area_probe.clone().into()
    }

    pub(crate) fn update(
        &mut self,
        window: &web_sys::Window,
        canvas: &web_sys::HtmlCanvasElement,
    ) -> anyhow::Result<bool> {
        let canvas_bounds = canvas.get_bounding_client_rect();
        let document = window
            .document()
            .ok_or_else(|| anyhow::anyhow!("Missing document"))?;
        let root = document
            .document_element()
            .ok_or_else(|| anyhow::anyhow!("Missing root"))?;
        let layout_width = root.client_width() as f64;
        let layout_height = root.client_height() as f64;
        let (visual_offset_left, visual_offset_top, visual_width, visual_height, visual_scale) =
            match window.visual_viewport() {
                Some(viewport) => (
                    viewport.offset_left(),
                    viewport.offset_top(),
                    viewport.width(),
                    viewport.height(),
                    viewport.scale(),
                ),
                None => (0.0, 0.0, layout_width, layout_height, 1.0),
            };

        let safe_area_css = read_safe_area_padding(window, &self.safe_area_probe);
        let probe_changed = self.probe_state.update(safe_area_css);
        let (visible_bounds, insets) = compute_viewport_snapshot(RawViewportMetrics {
            canvas_left: canvas_bounds.left(),
            canvas_top: canvas_bounds.top(),
            canvas_width: canvas_bounds.width(),
            canvas_height: canvas_bounds.height(),
            layout_width,
            layout_height,
            visual_offset_left,
            visual_offset_top,
            visual_width,
            visual_height,
            visual_scale,
            safe_area_css,
        });

        let changed =
            probe_changed || self.visible_bounds != visible_bounds || self.insets != insets;
        self.visible_bounds = visible_bounds;
        self.insets = insets;
        Ok(changed)
    }
}

#[cfg(target_family = "wasm")]
impl Drop for WebViewport {
    fn drop(&mut self) {
        self.safe_area_probe.remove();
    }
}

#[cfg(target_family = "wasm")]
fn create_single_safe_area_probe(
    document: &web_sys::Document,
) -> anyhow::Result<web_sys::HtmlElement> {
    let probe = document
        .create_element("div")
        .map_err(|error| anyhow::anyhow!("Failed to create safe-area probe: {error:?}"))?
        .dyn_into::<web_sys::HtmlElement>()
        .map_err(|error| anyhow::anyhow!("Invalid safe-area probe element: {error:?}"))?;
    probe
        .set_attribute("aria-hidden", "true")
        .map_err(|error| {
            anyhow::anyhow!("Failed to mark safe-area probe aria-hidden: {error:?}")
        })?;
    probe
        .set_attribute("style", SINGLE_SAFE_AREA_PROBE_STYLE)
        .map_err(|error| anyhow::anyhow!("Failed to style safe-area probe: {error:?}"))?;
    Ok(probe)
}

#[cfg(target_family = "wasm")]
fn read_safe_area_padding(window: &web_sys::Window, probe: &web_sys::HtmlElement) -> [f64; 4] {
    let Ok(Some(computed)) = window.get_computed_style(probe) else {
        return [0.0; 4];
    };
    [
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
    ]
    .map(|prop| {
        computed
            .get_property_value(prop)
            .ok()
            .and_then(|val| val.trim_end_matches("px").parse::<f64>().ok())
            .filter(|v| v.is_finite() && *v >= 0.0)
            .unwrap_or(0.0)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_single_probe_detects_landscape_flip_fractional_px_and_avoids_ime_double_subtraction() {
        // Verify single-probe CSS uses per-side transitions rather than lossy linear encoding.
        assert!(SINGLE_SAFE_AREA_PROBE_STYLE.contains("padding-top 0.001ms step-start"));
        assert!(SINGLE_SAFE_AREA_PROBE_STYLE.contains("padding-right 0.001ms step-start"));
        assert!(SINGLE_SAFE_AREA_PROBE_STYLE.contains("padding-bottom 0.001ms step-start"));
        assert!(SINGLE_SAFE_AREA_PROBE_STYLE.contains("padding-left 0.001ms step-start"));
        assert!(!SINGLE_SAFE_AREA_PROBE_STYLE.contains("1024"));

        // Table-driven edge redistributions including fractional CSS px (16, 0) -> (0, 1/64).
        let mut probe = SafeAreaProbeState::default();
        let transitions = [
            ([0.0, 0.0, 0.0, 44.0], true),
            ([0.0, 44.0, 0.0, 0.0], true),
            ([0.0, 44.0, 0.0, 0.0], false),
            ([16.0, 0.0, 0.0, 0.0], true),
            ([0.0, 0.015625, 0.0, 0.0], true),
            ([0.0, 0.0, 44.0, 0.0], true),
        ];
        for (edges, expect_changed) in transitions {
            assert_eq!(probe.update(edges), expect_changed, "edges={edges:?}");
        }

        let left_notch = RawViewportMetrics {
            canvas_left: 0.0,
            canvas_top: 0.0,
            canvas_width: 844.0,
            canvas_height: 390.0,
            layout_width: 844.0,
            layout_height: 390.0,
            visual_offset_left: 0.0,
            visual_offset_top: 0.0,
            visual_width: 844.0,
            visual_height: 390.0,
            visual_scale: 1.0,
            safe_area_css: [0.0, 0.0, 0.0, 44.0],
        };
        let right_notch = RawViewportMetrics {
            safe_area_css: [0.0, 44.0, 0.0, 0.0],
            ..left_notch
        };
        let (_, insets_left) = compute_viewport_snapshot(left_notch);
        let (_, insets_right) = compute_viewport_snapshot(right_notch);
        assert_ne!(insets_left, insets_right);
        assert_eq!(insets_left.safe_area.left, px(44.0));
        assert_eq!(insets_right.safe_area.right, px(44.0));

        // IME inset check: Android resizes-content vs iOS Safari resizes-visual.
        let resized_content = RawViewportMetrics {
            canvas_width: 390.0,
            canvas_height: 500.0,
            layout_width: 390.0,
            layout_height: 500.0,
            visual_width: 390.0,
            visual_height: 500.0,
            safe_area_css: [0.0; 4],
            ..left_notch
        };
        let (vis1, ins1) = compute_viewport_snapshot(resized_content);
        assert_eq!(vis1.size.height, px(500.0));
        assert_eq!(ins1.ime.bottom, px(0.0));

        let resized_visual = RawViewportMetrics {
            canvas_width: 390.0,
            canvas_height: 844.0,
            layout_width: 390.0,
            layout_height: 844.0,
            visual_width: 390.0,
            visual_height: 500.0,
            safe_area_css: [0.0; 4],
            ..left_notch
        };
        let (vis2, ins2) = compute_viewport_snapshot(resized_visual);
        assert_eq!(vis2.size.height, px(500.0));
        assert_eq!(ins2.ime.bottom, px(344.0));
        assert_eq!(vis2.size.height + ins2.ime.bottom, px(844.0));
    }
}
