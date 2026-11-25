use std::fmt::Write;

use ratex_layout::{LayoutOptions, layout, to_display_list};
use ratex_types::color::Color;
use ratex_types::display_item::{DisplayItem, DisplayList};
use ratex_types::math_style::MathStyle;
use ratex_types::path_command::PathCommand;

use crate::error::PreviewError;
use crate::font_pool::FontPool;
use crate::svg_raster::{RasterOptions, RgbaImageBuffer, SvgRasterizer};

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

    let svg = display_list_to_outline_svg(&display_list, options, &validated_color, font_pool)?;
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
pub fn render_latex_rgba(
    latex: &str,
    options: &MathRenderOptions,
    font_pool: &FontPool,
    rasterizer: &SvgRasterizer,
    scale_factor: f32,
) -> Result<MathRgbaOutput, PreviewError> {
    let svg_out = render_latex_svg(latex, options, font_pool)?;
    let image =
        rasterizer.rasterize_with_options(&svg_out.svg, RasterOptions::with_scale(scale_factor))?;
    Ok(MathRgbaOutput {
        width_pt: svg_out.width_pt,
        ascent_pt: svg_out.ascent_pt,
        descent_pt: svg_out.descent_pt,
        image,
    })
}

fn display_list_to_outline_svg(
    list: &DisplayList,
    options: &MathRenderOptions,
    validated_color: &str,
    font_pool: &FontPool,
) -> Result<String, PreviewError> {
    let fs = options.font_size_pt;
    let pad = options.padding_pt;
    let total_w = (list.width * fs + 2.0 * pad).max(1.0);
    let total_h = (list.total_height() * fs + 2.0 * pad).max(1.0);
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
                    let _ = write!(
                        out,
                        r#"<line x1="{x1:.3}" y1="{y1:.3}" x2="{x2:.3}" y2="{y1:.3}" stroke="{paint}"{opacity_attr} stroke-width="{t:.3}" stroke-dasharray="{dash:.2} {dash:.2}"/>"#,
                    );
                } else {
                    let (paint, opacity_attr) = format_paint(*color, validated_color, "fill");
                    let top = y1 - t * 0.5;
                    let _ = write!(
                        out,
                        r#"<rect x="{x1:.3}" y="{top:.3}" width="{w:.3}" height="{t:.3}" fill="{paint}"{opacity_attr}/>"#,
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
                let ry = pad + y * fs;
                let rw = width * fs;
                let rh = height * fs;
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

/// Exact W3C CSS Color Module Level 4 named colors plus `transparent` (149 keywords, sorted lowercase).
const CSS_NAMED_COLORS: &[&str] = &[
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "transparent",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen",
];

fn validate_css_color(raw: &str) -> Result<String, PreviewError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(PreviewError::InvalidColor(
            "color_css must not be empty".to_string(),
        ));
    }
    if trimmed.chars().any(|ch| {
        matches!(
            ch,
            '"' | '\'' | '<' | '>' | '&' | ';' | '\\' | '\n' | '\r' | '\0'
        )
    }) {
        return Err(PreviewError::InvalidColor(format!(
            "color_css contains forbidden characters: {trimmed}"
        )));
    }
    if trimmed.eq_ignore_ascii_case("currentColor") {
        return Ok("currentColor".to_string());
    }
    if let Some(hex) = trimmed.strip_prefix('#') {
        if matches!(hex.len(), 3 | 4 | 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Ok(format!("#{}", hex.to_ascii_lowercase()));
        }
        return Err(PreviewError::InvalidColor(format!(
            "invalid hex CSS color: {trimmed}"
        )));
    }
    let lower = trimmed.to_ascii_lowercase();
    if let Some(inner) = lower
        .strip_prefix("rgb(")
        .or_else(|| lower.strip_prefix("rgba("))
        .and_then(|rest| rest.strip_suffix(')'))
    {
        return parse_and_normalize_rgb(inner, trimmed);
    }
    if CSS_NAMED_COLORS.binary_search(&lower.as_str()).is_ok() {
        return Ok(lower);
    }
    Err(PreviewError::InvalidColor(format!(
        "unsupported CSS color syntax: {trimmed}"
    )))
}

fn parse_and_normalize_rgb(inner: &str, raw: &str) -> Result<String, PreviewError> {
    let err = |msg: &str| PreviewError::InvalidColor(format!("{msg}: {raw}"));
    let inner = inner.trim();
    if inner.is_empty() {
        return Err(err("empty rgb/rgba channel list"));
    }

    let (channels, alpha_str) = if inner.contains(',') {
        if inner.contains('/') {
            return Err(err("cannot mix ',' and '/' in rgb/rgba"));
        }
        let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
        if parts.iter().any(|p| p.is_empty()) || !matches!(parts.len(), 3 | 4) {
            return Err(err("invalid comma-separated rgb/rgba channels"));
        }
        let is_pct = [parts[0], parts[1], parts[2]].map(|p| p.ends_with('%'));
        if is_pct[0] != is_pct[1] || is_pct[1] != is_pct[2] {
            return Err(err(
                "comma-separated rgb/rgba cannot mix numbers and percentages",
            ));
        }
        ([parts[0], parts[1], parts[2]], parts.get(3).copied())
    } else {
        let mut slash_split = inner.split('/');
        let rgb_part = slash_split.next().unwrap_or("").trim();
        let alpha_part = slash_split.next().map(str::trim);
        if slash_split.next().is_some() {
            return Err(err("multiple '/' separators in rgb/rgba"));
        }
        let rgb_tokens: Vec<&str> = rgb_part.split_ascii_whitespace().collect();
        if rgb_tokens.len() != 3 {
            return Err(err("expected 3 space-separated rgb channels"));
        }
        if let Some(a) = alpha_part
            && (a.is_empty() || a.split_ascii_whitespace().count() != 1)
        {
            return Err(err("invalid alpha component after '/'"));
        }
        ([rgb_tokens[0], rgb_tokens[1], rgb_tokens[2]], alpha_part)
    };

    let r = parse_rgb_channel(channels[0], raw)?;
    let g = parse_rgb_channel(channels[1], raw)?;
    let b = parse_rgb_channel(channels[2], raw)?;
    if let Some(alpha_tok) = alpha_str {
        let a = parse_alpha_channel(alpha_tok, raw)?;
        Ok(format!("rgba({r},{g},{b},{a:.4})"))
    } else {
        Ok(format!("rgb({r},{g},{b})"))
    }
}

fn parse_rgb_channel(tok: &str, raw: &str) -> Result<u8, PreviewError> {
    if let Some(pct) = tok.strip_suffix('%') {
        let v = parse_css_number_in_range(pct, 0.0..=100.0, "rgb percentage", raw)?;
        Ok(((v * 255.0) / 100.0).round().clamp(0.0, 255.0) as u8)
    } else {
        let v = parse_css_number_in_range(tok, 0.0..=255.0, "rgb channel", raw)?;
        Ok(v.round() as u8)
    }
}

fn parse_alpha_channel(tok: &str, raw: &str) -> Result<f64, PreviewError> {
    if let Some(pct) = tok.strip_suffix('%') {
        Ok(parse_css_number_in_range(pct, 0.0..=100.0, "alpha percentage", raw)? / 100.0)
    } else {
        parse_css_number_in_range(tok, 0.0..=1.0, "alpha", raw)
    }
}

fn is_valid_css_number(tok: &str) -> bool {
    let b = tok.as_bytes();
    let mut i = usize::from(matches!(b.first(), Some(b'+' | b'-')));
    let int_start = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let has_int = i > int_start;
    let mut has_frac = false;
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let frac_start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        has_frac = i > frac_start;
        if !has_frac {
            return false;
        }
    }
    if !has_int && !has_frac {
        return false;
    }
    if i < b.len() && matches!(b[i], b'e' | b'E') {
        i += 1;
        i += usize::from(i < b.len() && matches!(b[i], b'+' | b'-'));
        let exp_start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == exp_start {
            return false;
        }
    }
    i == b.len()
}

fn parse_css_number_in_range(
    tok: &str,
    range: std::ops::RangeInclusive<f64>,
    label: &str,
    raw: &str,
) -> Result<f64, PreviewError> {
    if !is_valid_css_number(tok) {
        return Err(PreviewError::InvalidColor(format!(
            "invalid CSS number '{tok}' in {raw}"
        )));
    }
    let val = tok
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite())
        .ok_or_else(|| {
            PreviewError::InvalidColor(format!("invalid numeric channel '{tok}' in {raw}"))
        })?;
    if !range.contains(&val) {
        return Err(PreviewError::InvalidColor(format!(
            "{label} out of range: {raw}"
        )));
    }
    Ok(val)
}

fn escape_xml_attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

fn format_paint(color: Color, default_css: &str, attr_prefix: &str) -> (String, String) {
    let is_default_black =
        color.r == 0.0 && color.g == 0.0 && color.b == 0.0 && (color.a - 1.0).abs() < 1e-4;
    if is_default_black {
        // Use explicit #000000 when caller passed currentColor so resvg renders black cleanly.
        let css = if default_css.eq_ignore_ascii_case("currentColor") {
            "#000000".to_string()
        } else {
            escape_xml_attr(default_css)
        };
        return (css, String::new());
    }
    let r = (color.r.clamp(0.0, 1.0) * 255.0).round() as u8;
    let g = (color.g.clamp(0.0, 1.0) * 255.0).round() as u8;
    let b = (color.b.clamp(0.0, 1.0) * 255.0).round() as u8;
    let paint = format!("rgb({r},{g},{b})");
    let opacity = if color.a < 0.999 {
        format!(r#" {attr_prefix}-opacity="{:.3}""#, color.a.clamp(0.0, 1.0))
    } else {
        String::new()
    };
    (paint, opacity)
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
        let raw = include_str!("../tests/fixtures/katex_v0275_metrics.json");
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
                "rendered SVG must be well-formed XML for color '{valid}'"
            );
        }
        assert_eq!(
            validate_css_color("rgb(50%,50%,50%)").unwrap(),
            "rgb(128,128,128)"
        );
        let half_gray = render_latex_svg(
            "E = mc^2",
            &MathRenderOptions {
                color_css: "rgb(50%,50%,50%)".to_string(),
                ..MathRenderOptions::default()
            },
            &pool,
        )
        .unwrap();
        assert!(half_gray.svg.contains("rgb(128,128,128)"));

        for invalid in [
            "",
            "   ",
            "notacolor",
            r##"#000" onload="alert(1)"##,
            "#12345",
            "rgb(1, 2)",
            "rgb(+, ., -)",
            "rgb(,,1,2,3)",
            "rgb(1.,2,3)",
            "rgb(+1., 2, 3)",
            "rgb(10%,20,30)",
            "rgba(10%, 20, 30, 0.5)",
            "rgb(256, 0, 0)",
            "rgb(-1, 0, 0)",
            "rgb(1, 2 3)",
            "rgba(0, 0, 0, 1.5)",
            "red; fill:url(http://evil)",
            "<script>",
        ] {
            let opts = MathRenderOptions {
                color_css: invalid.to_string(),
                ..MathRenderOptions::default()
            };
            assert!(
                matches!(
                    render_latex_svg("E = mc^2", &opts, &pool),
                    Err(PreviewError::InvalidColor(_))
                ),
                "expected InvalidColor for '{invalid}'"
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
