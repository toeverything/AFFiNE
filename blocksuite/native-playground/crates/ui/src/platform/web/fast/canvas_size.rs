//! Canvas size from a `ResizeObserverEntry`.

/// Physical and logical canvas sizes for a resize observation.
///
/// Prefers the exact `devicePixelContentBoxSize` when it agrees with the CSS
/// content box scaled by `devicePixelRatio`. Firefox can report that size in
/// CSS pixels instead (e.g. under fractional display scaling), which would
/// shrink GPUI's logical bounds by `dpr` and enlarge the rendered content while
/// pointer events stay in CSS pixels, so clicks land up and to the left of what
/// is drawn. In that case, and when the property is missing (Safari), derive
/// the physical size from the CSS content box.
#[cfg(target_family = "wasm")]
pub(crate) fn observed_sizes(
    entry: &web_sys::ResizeObserverEntry,
    dpr: f64,
    has_device_pixel_support: bool,
) -> (u32, u32, f32, f32) {
    use wasm_bindgen::JsCast as _;

    let rect = entry.content_rect();
    let device_size = has_device_pixel_support.then(|| {
        let size: web_sys::ResizeObserverSize = entry
            .device_pixel_content_box_size()
            .get(0)
            .unchecked_into();
        (size.inline_size(), size.block_size())
    });
    canvas_sizes(device_size, (rect.width(), rect.height()), dpr)
}

pub(crate) fn canvas_sizes(
    device_size: Option<(f64, f64)>,
    css_size: (f64, f64),
    dpr: f64,
) -> (u32, u32, f32, f32) {
    let (css_width, css_height) = css_size;
    let expected = (css_width * dpr, css_height * dpr);
    match device_size {
        Some((width, height))
            if (width - expected.0).abs() <= 1. && (height - expected.1).abs() <= 1. =>
        {
            (
                width as u32,
                height as u32,
                (width / dpr) as f32,
                (height / dpr) as f32,
            )
        }
        _ => (
            expected.0.round() as u32,
            expected.1.round() as u32,
            css_width as f32,
            css_height as f32,
        ),
    }
}
