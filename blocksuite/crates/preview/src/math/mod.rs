mod css_color;

use std::fmt::Write;

use ratex_layout::{LayoutOptions, layout, to_display_list};
use ratex_types::display_item::{DisplayItem, DisplayList};
use ratex_types::math_style::MathStyle;
use ratex_types::path_command::PathCommand;

use crate::error::PreviewError;
use crate::font_pool::FontPool;
use crate::svg_raster::{RasterOptions, RgbaImageBuffer, SvgRasterizer};

use self::css_color::{format_paint, validate_css_color};

/// Display mode for LaTeX mathematical formulas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathDisplayMode {
    /// Inline math aligned to the surrounding text baseline (`$...$`).
    Inline,
    /// Centered display math block (`$$...$$`).
    Display,
}

/// Options controlling LaTeX math typesetting and pure-outline SVG export.
#[derive(Debug, Clone, PartialEq)]
pub struct MathRenderOptions {
    /// Inline or display style.
    pub mode: MathDisplayMode,
    /// Base font size in points (for example `16.0`).
    pub font_size_pt: f64,
    /// Optional padding around the SVG box in points.
    pub padding_pt: f64,
    /// Foreground CSS color applied to default-black math glyphs and rules.
    pub color_css: String,
}

impl Default for MathRenderOptions {
    fn default() -> Self {
        Self {
            mode: MathDisplayMode::Inline,
            font_size_pt: 16.0,
            padding_pt: 0.0,
            color_css: "currentColor".to_string(),
        }
    }
}

/// Typeset math box metrics and standalone pure-`<path>` SVG output.
#[derive(Debug, Clone, PartialEq)]
pub struct MathSvgOutput {
    /// Total box width in points.
    pub width_pt: f64,
    /// Height above the baseline in points.
    pub ascent_pt: f64,
    /// Depth below the baseline in points.
    pub descent_pt: f64,
    /// Standalone SVG string containing only vector primitives (zero `<text>`).
    pub svg: String,
}

/// Rasterized math formula with exact baseline metrics.
#[derive(Debug, Clone, PartialEq)]
pub struct MathRgbaOutput {
    /// Total box width in points.
    pub width_pt: f64,
    /// Height above the baseline in points.
    pub ascent_pt: f64,
    /// Depth below the baseline in points.
    pub descent_pt: f64,
    /// Rasterized RGBA8 pixel buffer.
    pub image: RgbaImageBuffer,
}

/// Renders a LaTeX math expression into a pure in-memory `<path>` SVG.
///
/// KaTeX math glyphs come from embedded `ratex-katex-fonts` bytes. Non-KaTeX
/// Unicode characters (such as CJK text inside `\text{...}`) are resolved strictly
/// from `font_pool` with zero host filesystem or system-font access. Missing
/// glyphs return [`PreviewError::MissingGlyphFont`].
pub fn render_latex_svg(
    latex: &str,
    options: &MathRenderOptions,
    font_pool: &FontPool,
) -> Result<MathSvgOutput, PreviewError> {
    if latex.trim().is_empty() {
        return Err(PreviewError::EmptyInput);
    }
    if !options.font_size_pt.is_finite() || options.font_size_pt <= 0.0 {
        return Err(PreviewError::InvalidSize(format!(
            "font_size_pt must be positive and finite, got {}",
            options.font_size_pt
        )));
    }
    let validated_color = validate_css_color(&options.color_css)?;

    let nodes = ratex_parser::parse(latex).map_err(|err| PreviewError::Math(err.to_string()))?;
    let style = match options.mode {
        MathDisplayMode::Inline => MathStyle::Text,
        MathDisplayMode::Display => MathStyle::Display,
    };
    let layout_opts = LayoutOptions::default().with_style(style);
    let layout_box = layout(&nodes, &layout_opts);
    let display_list = to_display_list(&layout_box);

    let svg =
        display_list_to_outline_svg(&display_list, options, &validated_color, font_pool, None)?;
    let width_pt = display_list.width * options.font_size_pt + 2.0 * options.padding_pt;
    let ascent_pt = display_list.height * options.font_size_pt + options.padding_pt;
    let descent_pt = display_list.depth * options.font_size_pt + options.padding_pt;

    Ok(MathSvgOutput {
        width_pt,
        ascent_pt,
        descent_pt,
        svg,
    })
}

/// Renders a LaTeX math formula to RGBA8 pixels with exact baseline metrics.
///
/// Horizontal math rules (fraction bars and square-root overlines) are snapped to device-pixel
/// rows with a `>= 1px` device-pixel floor at `scale_factor` so thin rules stay crisp in both
/// light and dark themes at `1x` and `2x` DPR.
pub fn render_latex_rgba(
    latex: &str,
    options: &MathRenderOptions,
    font_pool: &FontPool,
    rasterizer: &SvgRasterizer,
    scale_factor: f32,
) -> Result<MathRgbaOutput, PreviewError> {
    if latex.trim().is_empty() {
        return Err(PreviewError::EmptyInput);
    }
    if !options.font_size_pt.is_finite() || options.font_size_pt <= 0.0 {
        return Err(PreviewError::InvalidSize(format!(
            "font_size_pt must be positive and finite, got {}",
            options.font_size_pt
        )));
    }
    let validated_color = validate_css_color(&options.color_css)?;
    let nodes = ratex_parser::parse(latex).map_err(|err| PreviewError::Math(err.to_string()))?;
    let style = match options.mode {
        MathDisplayMode::Inline => MathStyle::Text,
        MathDisplayMode::Display => MathStyle::Display,
    };
    let layout_opts = LayoutOptions::default().with_style(style);
    let layout_box = layout(&nodes, &layout_opts);
    let display_list = to_display_list(&layout_box);

    let dpr = if scale_factor.is_finite() && scale_factor > 0.0 {
        f64::from(scale_factor)
    } else {
        1.0
    };
    let svg = display_list_to_outline_svg(
        &display_list,
        options,
        &validated_color,
        font_pool,
        Some(dpr),
    )?;
    let ascent_pt = display_list.height * options.font_size_pt + options.padding_pt;
    let image = rasterizer.rasterize_with_options(&svg, RasterOptions::with_scale(scale_factor))?;
    let width_pt = f64::from(image.logical_width);
    let descent_pt = (f64::from(image.logical_height) - ascent_pt).max(0.0);
    Ok(MathRgbaOutput {
        width_pt,
        ascent_pt,
        descent_pt,
        image,
    })
}

fn display_list_to_outline_svg(
    list: &DisplayList,
    options: &MathRenderOptions,
    validated_color: &str,
    font_pool: &FontPool,
    snap_dpr: Option<f64>,
) -> Result<String, PreviewError> {
    let fs = options.font_size_pt;
    let pad = options.padding_pt;
    let raw_w = (list.width * fs + 2.0 * pad).max(1.0);
    let raw_h = (list.total_height() * fs + 2.0 * pad).max(1.0);
    let (total_w, total_h) = if let Some(dpr) = snap_dpr {
        (
            ((raw_w * dpr).ceil().max(1.0)) / dpr,
            ((raw_h * dpr).ceil().max(1.0)) / dpr,
        )
    } else {
        (raw_w, raw_h)
    };
    let stroke_w = (fs * 0.04).max(0.5);

    let mut out = String::with_capacity(list.items.len() * 128 + 256);
    let _ = write!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.3}" height="{total_h:.3}" viewBox="0 0 {total_w:.3} {total_h:.3}">"#,
    );

    for item in &list.items {
        match item {
            DisplayItem::GlyphPath {
                x,
                y,
                scale,
                font,
                char_code,
                color,
            } => {
                let Some(ch) = char::from_u32(*char_code) else {
                    continue;
                };
                if ch.is_whitespace() || ch == '\u{00A0}' {
                    continue;
                }
                let origin_x = pad + x * fs;
                let origin_y = pad + y * fs;
                let d =
                    extract_glyph_svg_path(font, ch, origin_x, origin_y, *scale * fs, font_pool)?;
                if !d.is_empty() {
                    let (paint, opacity_attr) = format_paint(*color, validated_color, "fill");
                    let _ = write!(out, r#"<path d="{d}" fill="{paint}"{opacity_attr}/>"#);
                }
            }
            DisplayItem::Line {
                x,
                y,
                width,
                thickness,
                color,
                dashed,
            } => {
                let x1 = pad + x * fs;
                let y1 = pad + y * fs;
                let w = width * fs;
                let t = (thickness * fs).max(0.4);
                if *dashed {
                    let (paint, opacity_attr) = format_paint(*color, validated_color, "stroke");
                    let x2 = x1 + w;
                    let dash = (fs * 0.25).max(2.0);
                    let snapped_t = if let Some(dpr) = snap_dpr {
                        (t * dpr).ceil().max(1.0) / dpr
                    } else {
                        t.max(1.0)
                    };
                    let _ = write!(
                        out,
                        r#"<line x1="{x1:.3}" y1="{y1:.3}" x2="{x2:.3}" y2="{y1:.3}" stroke="{paint}"{opacity_attr} stroke-width="{snapped_t:.3}" stroke-dasharray="{dash:.2} {dash:.2}"/>"#,
                    );
                } else {
                    let (paint, opacity_attr) = format_paint(*color, validated_color, "fill");
                    let (top, snapped_t) = if let Some(dpr) = snap_dpr {
                        let dev_t = (t * dpr).ceil().max(1.0);
                        let pt_t = dev_t / dpr;
                        let pt_top = ((y1 - pt_t * 0.5) * dpr).round() / dpr;
                        (pt_top, pt_t)
                    } else {
                        let pt_t = t.max(1.0);
                        (y1 - pt_t * 0.5, pt_t)
                    };
                    let _ = write!(
                        out,
                        r#"<rect x="{x1:.3}" y="{top:.3}" width="{w:.3}" height="{snapped_t:.3}" fill="{paint}"{opacity_attr}/>"#,
                    );
                }
            }
            DisplayItem::Rect {
                x,
                y,
                width,
                height,
                color,
            } => {
                let rx = pad + x * fs;
                let mut ry = pad + y * fs;
                let rw = width * fs;
                let mut rh = height * fs;
                if rh > 0.0 && rw > rh {
                    if let Some(dpr) = snap_dpr {
                        if rh * dpr < 2.0 {
                            let dev_h = (rh * dpr).ceil().max(1.0);
                            let pt_h = dev_h / dpr;
                            let center_y = ry + rh * 0.5;
                            ry = ((center_y - pt_h * 0.5) * dpr).round() / dpr;
                            rh = pt_h;
                        }
                    } else if rh < 1.0 {
                        let center_y = ry + rh * 0.5;
                        ry = center_y - 0.5;
                        rh = 1.0;
                    }
                }
                let (paint, opacity_attr) = format_paint(*color, validated_color, "fill");
                let _ = write!(
                    out,
                    r#"<rect x="{rx:.3}" y="{ry:.3}" width="{rw:.3}" height="{rh:.3}" fill="{paint}"{opacity_attr}/>"#,
                );
            }
            DisplayItem::Path {
                x,
                y,
                commands,
                fill,
                color,
            } => {
                let ox = pad + x * fs;
                let oy = pad + y * fs;
                let mut d = String::with_capacity(commands.len() * 24);
                for cmd in commands {
                    match *cmd {
                        PathCommand::MoveTo { x: px, y: py } => {
                            let _ = write!(d, "M{:.3} {:.3}", ox + px * fs, oy + py * fs);
                        }
                        PathCommand::LineTo { x: px, y: py } => {
                            let _ = write!(d, "L{:.3} {:.3}", ox + px * fs, oy + py * fs);
                        }
                        PathCommand::QuadTo {
                            x1,
                            y1,
                            x: px,
                            y: py,
                        } => {
                            let _ = write!(
                                d,
                                "Q{:.3} {:.3} {:.3} {:.3}",
                                ox + x1 * fs,
                                oy + y1 * fs,
                                ox + px * fs,
                                oy + py * fs
                            );
                        }
                        PathCommand::CubicTo {
                            x1,
                            y1,
                            x2,
                            y2,
                            x: px,
                            y: py,
                        } => {
                            let _ = write!(
                                d,
                                "C{:.3} {:.3} {:.3} {:.3} {:.3} {:.3}",
                                ox + x1 * fs,
                                oy + y1 * fs,
                                ox + x2 * fs,
                                oy + y2 * fs,
                                ox + px * fs,
                                oy + py * fs
                            );
                        }
                        PathCommand::Close => d.push('Z'),
                    }
                }
                if !d.is_empty() {
                    if *fill {
                        let (paint, opacity_attr) = format_paint(*color, validated_color, "fill");
                        let _ = write!(out, r#"<path d="{d}" fill="{paint}"{opacity_attr}/>"#);
                    } else {
                        let (paint, opacity_attr) = format_paint(*color, validated_color, "stroke");
                        let _ = write!(
                            out,
                            r#"<path d="{d}" fill="none" stroke="{paint}"{opacity_attr} stroke-width="{stroke_w:.3}"/>"#,
                        );
                    }
                }
            }
        }
    }

    out.push_str("</svg>");
    Ok(out)
}

fn extract_glyph_svg_path(
    font_name: &str,
    ch: char,
    origin_x: f64,
    origin_y: f64,
    size_px: f64,
    font_pool: &FontPool,
) -> Result<String, PreviewError> {
    if let Some(katex_bytes) = lookup_katex_font_bytes(font_name)
        && let Ok(face) = ttf_parser::Face::parse(&katex_bytes, 0)
        && let Some(gid) = face.glyph_index(ch)
    {
        return Ok(outline_glyph(&face, gid, origin_x, origin_y, size_px));
    }

    for blob in font_pool.font_blobs() {
        let count = ttf_parser::fonts_in_collection(blob).unwrap_or(1);
        for face_idx in 0..count {
            if let Ok(face) = ttf_parser::Face::parse(blob, face_idx)
                && let Some(gid) = face.glyph_index(ch)
            {
                return Ok(outline_glyph(&face, gid, origin_x, origin_y, size_px));
            }
        }
    }

    Err(PreviewError::MissingGlyphFont(format!(
        "no glyph for U+{:04X} ('{ch}') in KaTeX font '{font_name}' or registered FontPool",
        ch as u32
    )))
}

fn lookup_katex_font_bytes(font_name: &str) -> Option<std::borrow::Cow<'static, [u8]>> {
    let filename = if font_name.starts_with("KaTeX_") {
        format!("{font_name}.ttf")
    } else {
        format!("KaTeX_{font_name}.ttf")
    };
    ratex_katex_fonts::ttf_bytes(&filename)
}

fn outline_glyph(
    face: &ttf_parser::Face<'_>,
    gid: ttf_parser::GlyphId,
    origin_x: f64,
    origin_y: f64,
    size_px: f64,
) -> String {
    let upem = f64::from(face.units_per_em()).max(1.0);
    let scale = size_px / upem;
    let mut builder = SvgOutlineBuilder {
        origin_x,
        origin_y,
        scale,
        d: String::new(),
    };
    let _ = face.outline_glyph(gid, &mut builder);
    builder.d
}

struct SvgOutlineBuilder {
    origin_x: f64,
    origin_y: f64,
    scale: f64,
    d: String,
}

impl ttf_parser::OutlineBuilder for SvgOutlineBuilder {
    fn move_to(&mut self, x: f32, y: f32) {
        let _ = write!(
            self.d,
            "M{:.3} {:.3}",
            self.origin_x + f64::from(x) * self.scale,
            self.origin_y - f64::from(y) * self.scale
        );
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let _ = write!(
            self.d,
            "L{:.3} {:.3}",
            self.origin_x + f64::from(x) * self.scale,
            self.origin_y - f64::from(y) * self.scale
        );
    }

    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let _ = write!(
            self.d,
            "Q{:.3} {:.3} {:.3} {:.3}",
            self.origin_x + f64::from(x1) * self.scale,
            self.origin_y - f64::from(y1) * self.scale,
            self.origin_x + f64::from(x) * self.scale,
            self.origin_y - f64::from(y) * self.scale
        );
    }

    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let _ = write!(
            self.d,
            "C{:.3} {:.3} {:.3} {:.3} {:.3} {:.3}",
            self.origin_x + f64::from(x1) * self.scale,
            self.origin_y - f64::from(y1) * self.scale,
            self.origin_x + f64::from(x2) * self.scale,
            self.origin_y - f64::from(y2) * self.scale,
            self.origin_x + f64::from(x) * self.scale,
            self.origin_y - f64::from(y) * self.scale
        );
    }

    fn close(&mut self) {
        self.d.push('Z');
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
    use crate::test_support::build_test_font_pool;

    #[derive(Deserialize)]
    struct KatexFixtureFile {
        katex_version: String,
        formulas: Vec<KatexFormulaFixture>,
    }

    #[derive(Deserialize)]
    struct KatexFormulaFixture {
        name: String,
        latex: String,
        display_mode: bool,
        katex_ok: bool,
        height_em: f64,
        depth_em: f64,
        width_em: f64,
    }

    #[test]
    fn ratex_matches_v0275_katex_metrics_and_emits_zero_text_elements() {
        let raw = include_str!("../../tests/fixtures/katex_v0275_metrics.json");
        let fixture: KatexFixtureFile =
            serde_json::from_str(raw).expect("valid katex_v0275_metrics.json");
        assert_eq!(fixture.katex_version, "0.18.10");
        assert_eq!(fixture.formulas.len(), 52);

        let pool = build_test_font_pool();
        let empty_pool = FontPool::new();
        let rasterizer = SvgRasterizer::new(&empty_pool);

        let mut passed = 0usize;
        let mut metrics_matched = 0usize;
        let mut katex_comparable = 0usize;
        let mut width_rel_errors: Vec<(f64, String, f64, f64)> = Vec::new();

        for item in &fixture.formulas {
            let mode = if item.display_mode {
                MathDisplayMode::Display
            } else {
                MathDisplayMode::Inline
            };
            let opts = MathRenderOptions {
                mode,
                font_size_pt: 16.0,
                padding_pt: 0.0,
                color_css: "#000000".to_string(),
            };
            let res = render_latex_svg(&item.latex, &opts, &pool);
            if item.name == "edge_newcommand_builtin" {
                // `\R` is a built-in RaTeX macro; `\newcommand{\R}` errors by design (use `\renewcommand`).
                assert!(res.is_err(), "expected builtin \\R redefinition error");
                continue;
            }
            let out = res.unwrap_or_else(|err| {
                panic!("ratex failed on {} ({}): {err}", item.name, item.latex)
            });
            passed += 1;
            assert!(out.svg.contains("<svg"), "{}: missing <svg>", item.name);
            assert!(
                !out.svg.contains("<text"),
                "{}: outline SVG must not contain <text>",
                item.name
            );
            assert!(out.svg.contains("<path"), "{}: expected <path>", item.name);

            // Pure <path> SVG must rasterize with an empty FontPool (zero external fonts).
            let rgba = rasterizer.rasterize(&out.svg, 2.0).unwrap();
            assert!(
                rgba.count_non_transparent_pixels() > 0,
                "{}: zero raster ink",
                item.name
            );

            if item.katex_ok && !item.name.contains("cjk") {
                katex_comparable += 1;
                let height_em = out.ascent_pt / 16.0;
                let depth_em = out.descent_pt / 16.0;
                let dh = (height_em - item.height_em).abs();
                let dd = (depth_em - item.depth_em).abs();
                let limit = match item.name.as_str() {
                    "sum_squares" | "product_k" | "sinc_limit" | "accents" | "left_right_norm" => {
                        0.085
                    }
                    _ => 0.005,
                };
                assert!(
                    dh <= limit && dd <= limit,
                    "KaTeX metric drift on {}: ratex=({height_em:.4}, {depth_em:.4}) vs katex=({:.4}, {:.4}), diff=({dh:.4}, {dd:.4}), limit={limit}",
                    item.name,
                    item.height_em,
                    item.depth_em,
                );
                let width_em = out.width_pt / 16.0;
                assert!(width_em > 0.0 && item.width_em > 0.0);
                let rel_w = (width_em - item.width_em).abs() / item.width_em.max(0.5);
                width_rel_errors.push((rel_w, item.name.clone(), width_em, item.width_em));
                metrics_matched += 1;
            }
        }

        // 51/52 pass (all 48 main + 3 of 4 edge cases including custom \newcommand).
        assert_eq!(passed, 51);
        assert_eq!(metrics_matched, katex_comparable);

        // Horizontal width parity check across all 48 non-CJK formulas (real Chromium katex@0.18.10 CSS + fonts).
        width_rel_errors.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let p50 = width_rel_errors[width_rel_errors.len() / 2].0;
        let p90 = width_rel_errors[(width_rel_errors.len() * 9) / 10].0;
        let worst = width_rel_errors.last().unwrap();
        let within_10pct = width_rel_errors.iter().filter(|r| r.0 <= 0.10).count();
        eprintln!(
            "KATEX_WIDTH_STATS n={} p50={:.4} p90={:.4} max={:.4} ({} ratex={:.3} katex={:.3}) <=10%={}",
            width_rel_errors.len(),
            p50,
            p90,
            worst.0,
            worst.1,
            worst.2,
            worst.3,
            within_10pct
        );
        assert!(
            p50 <= 0.01,
            "median width relative error too high: {p50:.4}"
        );
        assert!(p90 <= 0.05, "p90 width relative error too high: {p90:.4}");
        assert_eq!(
            within_10pct,
            width_rel_errors.len(),
            "expected 100% width agreement <=10%, got {within_10pct}/{} (worst: {} {:.4})",
            width_rel_errors.len(),
            worst.1,
            worst.0
        );
    }

    #[test]
    fn color_css_is_strictly_validated_and_xml_escaped() {
        let pool = FontPool::new();
        for valid in [
            "#1e293b",
            "#fff",
            "rgb(30, 41, 59)",
            "rgb(30 41 59 / 50%)",
            "rgb(10% 20 30)",
            "rgb(50%, 50%, 50%)",
            "rgba(0, 0, 0, 0.5)",
            "currentColor",
            "transparent",
            "rebeccapurple",
            "navy",
        ] {
            let opts = MathRenderOptions {
                color_css: valid.to_string(),
                ..MathRenderOptions::default()
            };
            let out = render_latex_svg("E = mc^2", &opts, &pool)
                .unwrap_or_else(|err| panic!("expected valid color '{valid}' to pass: {err}"));
            assert!(
                roxmltree::Document::parse(&out.svg).is_ok(),
                "SVG for valid color '{valid}' must parse cleanly"
            );
        }

        for invalid in [
            "",
            "   ",
            "red\" onclick=\"alert(1)",
            "#12345",
            "#zzzzzz",
            "rgb(300, 0, 0)",
            "rgb(10%, 20, 30)",
            "rgb(10 20 30 / 2)",
            "rgb(10, 20, 30 / 0.5)",
            "notacolor",
            "hsl(0, 100%, 50%)",
        ] {
            let opts = MathRenderOptions {
                color_css: invalid.to_string(),
                ..MathRenderOptions::default()
            };
            let err = render_latex_svg("E = mc^2", &opts, &pool).unwrap_err();
            assert!(
                matches!(err, PreviewError::InvalidColor(_)),
                "expected InvalidColor for '{invalid}', got {err:?}"
            );
        }
    }

    #[test]
    fn cjk_formula_errors_without_font_pool_and_renders_distinct_outlines_with_pool() {
        let empty = FontPool::new();
        let opts = MathRenderOptions::default();

        // Missing CJK font must return explicit MissingGlyphFont (never silent <text>).
        let err = render_latex_svg(r"\text{中文测试}", &opts, &empty).unwrap_err();
        assert!(matches!(err, PreviewError::MissingGlyphFont(_)));

        // With CJK font registered, emits pure <path> with zero <text> and distinct glyphs.
        let pool = build_test_font_pool();
        let rasterizer = SvgRasterizer::new(&empty);

        let out_a = render_latex_svg(r"\text{中文}", &opts, &pool).unwrap();
        let out_b = render_latex_svg(r"\text{测试}", &opts, &pool).unwrap();
        assert!(!out_a.svg.contains("<text"));
        assert!(!out_b.svg.contains("<text"));
        assert_ne!(out_a.svg, out_b.svg);

        let img_a = rasterizer.rasterize(&out_a.svg, 2.0).unwrap();
        let img_b = rasterizer.rasterize(&out_b.svg, 2.0).unwrap();
        assert!(img_a.count_non_transparent_pixels() > 0);
        assert!(img_b.count_non_transparent_pixels() > 0);
        assert_ne!(img_a.sha256(), img_b.sha256());
    }

    #[test]
    fn fraction_bar_and_sqrt_vinculum_snap_to_crisp_device_pixel_rows() {
        let pool = FontPool::new();
        let rasterizer = SvgRasterizer::new(&pool);
        let has_crisp_bar = |img: &RgbaImageBuffer,
                             y_range: std::ops::Range<usize>,
                             min_run: usize,
                             min_rgb: u8| {
            let w = img.width_px as usize;
            y_range.into_iter().any(|row| {
                let mut best_run = 0usize;
                let mut cur_run = 0usize;
                for col in 0..w {
                    let px = &img.pixels[(row * w + col) * 4..][..4];
                    if px[3] >= 250 && px[0] >= min_rgb && px[1] >= min_rgb && px[2] >= min_rgb {
                        cur_run += 1;
                        best_run = best_run.max(cur_run);
                    } else {
                        cur_run = 0;
                    }
                }
                best_run >= min_run
            })
        };

        for (dpr, color, min_rgb) in [
            (1.0_f32, "#121212", 0u8),
            (2.0_f32, "#121212", 0u8),
            (1.0_f32, "#e6e6e6", 220u8),
            (2.0_f32, "#e6e6e6", 220u8),
        ] {
            let opts = MathRenderOptions {
                mode: MathDisplayMode::Display,
                font_size_pt: 16.0,
                padding_pt: 2.0,
                color_css: color.to_string(),
            };
            let out = render_latex_rgba(r"\frac{\sqrt{\pi}}{2}", &opts, &pool, &rasterizer, dpr)
                .expect("render_latex_rgba fraction");
            let w = out.image.width_px as usize;
            let h = out.image.height_px as usize;
            let min_run = (w / 2).max(6);
            assert!(
                has_crisp_bar(&out.image, h / 3..(h * 2) / 3, min_run, min_rgb),
                "expected crisp >=250-alpha fraction bar row at dpr={dpr} color={color} ({w}x{h})"
            );

            // Standalone radical overbar must also have a crisp >=1px high-contrast bar in top half.
            let sqrt_out = render_latex_rgba(r"\sqrt{x^2 + y^2}", &opts, &pool, &rasterizer, dpr)
                .expect("render_latex_rgba sqrt");
            let sw = sqrt_out.image.width_px as usize;
            let sh = sqrt_out.image.height_px as usize;
            let sqrt_min_run = (sw / 3).max(8);
            assert!(
                has_crisp_bar(&sqrt_out.image, 0..(sh / 2).max(1), sqrt_min_run, min_rgb),
                "expected crisp >=250-alpha sqrt overbar row at dpr={dpr} color={color} ({sw}x{sh})"
            );
        }
    }

    #[cfg(feature = "typst")]
    #[test]
    fn mitex_typst_candidate_with_prelude_runs_for_parity_comparison() {
        let pool = build_test_font_pool();
        let mut world = crate::typst_world::InMemoryTypstWorld::new(&pool);
        let prelude = r#"
#let dfrac(a, b) = $display((a) / (b))$
#let tfrac(a, b) = $inline((a) / (b))$
#let mitexsqrt(a, ..b) = if b.pos().len() == 0 { $sqrt(a)$ } else { $root(a, b.pos().at(0))$ }
#let mitexmathbf(a) = $bold(upright(a))$
#let textmath(a) = $#a$
#let boxed(a) = box(stroke: 0.5pt, inset: 2pt)[$a$]
"#;
        let samples = [
            r"E = mc^2",
            r"\frac{a+b}{c+d}",
            r"\sqrt{2}",
            r"\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}",
        ];
        for latex in samples {
            let typst_math = mitex::convert_math(latex, None).expect("mitex conversion");
            let wrapped = format!(
                "{prelude}\n#set page(width: auto, height: auto, margin: 0pt)\n#set text(size: 16pt)\n${typst_math}$"
            );
            let out = world.compile_svg(&wrapped).expect("typst compile");
            assert!(out.width_pt > 0.0 && out.ascent_pt > 0.0);
        }
    }
}
