use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use merman::model::OperationControl;
use merman::model::runtime::RuntimePolicy;
use merman::model::time::CivilDate;
use merman::svg::{
    DeterministicTextMeasurer, MeasurementProfileId, SvgPipeline, TextMeasurementPolicy,
    TextMeasurementProfile, TextMeasurementProfileIdentity, TextMeasurer, TextStyle,
};
use merman::{RenderOutput, RenderRequest, Renderer, SvgEnvironment, SvgRequest};

use crate::PreviewDate;
use crate::error::PreviewError;
use crate::font_pool::FontPool;
use crate::svg_raster::{RasterOptions, RgbaImageBuffer, SvgRasterizer};

/// Built-in high-contrast Mermaid palette aligned with AFFiNE Light and Dark tokens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MermaidTheme {
    Light,
    Dark,
}

impl MermaidTheme {
    fn init_directive(self) -> &'static str {
        match self {
            Self::Light => concat!(
                "%%{init: {'look': 'classic', 'theme': 'base', 'themeVariables': {",
                "'darkMode': false, ",
                "'background': '#ffffff', ",
                "'mainBkg': '#eef2ff', ",
                "'nodeBorder': '#6366f1', ",
                "'textColor': '#141414', ",
                "'edgeLabelBackground': '#ffffff', ",
                "'primaryColor': '#eef2ff', ",
                "'primaryTextColor': '#141414', ",
                "'primaryBorderColor': '#6366f1', ",
                "'lineColor': '#52525b', ",
                "'secondaryColor': '#f4f4f5', ",
                "'tertiaryColor': '#fafafa', ",
                "'pie1': '#60a5fa', ",
                "'pie2': '#34d399', ",
                "'pie3': '#fbbf24', ",
                "'pie4': '#a78bfa', ",
                "'pie5': '#f472b6', ",
                "'pie6': '#22d3ee', ",
                "'pieOpacity': '0.88', ",
                "'pieStrokeColor': '#ffffff', ",
                "'pieTitleTextColor': '#141414', ",
                "'pieSectionTextColor': '#141414', ",
                "'pieLegendTextColor': '#141414', ",
                "'gridColor': '#d4d4d8', ",
                "'doneTaskBkgColor': '#d1fae5', ",
                "'doneTaskBorderColor': '#059669', ",
                "'activeTaskBkgColor': '#dbeafe', ",
                "'activeTaskBorderColor': '#2563eb', ",
                "'taskBkgColor': '#eef2ff', ",
                "'taskBorderColor': '#6366f1', ",
                "'taskTextColor': '#141414', ",
                "'taskTextDarkColor': '#141414', ",
                "'taskTextOutsideColor': '#141414', ",
                "'sectionBkgColor': '#f4f4f5', ",
                "'sectionBkgColor2': '#fafafa', ",
                "'altSectionBkgColor': '#ffffff', ",
                "'todayLineColor': '#dc2626', ",
                "'git0': '#2563eb', ",
                "'git1': '#047857', ",
                "'git2': '#b45309', ",
                "'git3': '#7c3aed', ",
                "'git4': '#be185d', ",
                "'git5': '#0e7490', ",
                "'git6': '#4338ca', ",
                "'git7': '#475569', ",
                "'gitBranchLabel0': '#ffffff', ",
                "'gitBranchLabel1': '#ffffff', ",
                "'gitBranchLabel2': '#ffffff', ",
                "'gitBranchLabel3': '#ffffff', ",
                "'gitBranchLabel4': '#ffffff', ",
                "'gitBranchLabel5': '#ffffff', ",
                "'gitBranchLabel6': '#ffffff', ",
                "'gitBranchLabel7': '#ffffff', ",
                "'commitLabelColor': '#141414', ",
                "'commitLabelBackground': '#f4f4f5', ",
                "'fontFamily': 'Inter, sans-serif'",
                "}}}%%\n"
            ),
            Self::Dark => concat!(
                "%%{init: {'look': 'classic', 'theme': 'base', 'themeVariables': {",
                "'darkMode': true, ",
                "'background': '#141414', ",
                "'mainBkg': '#1e2433', ",
                "'nodeBorder': '#6366f1', ",
                "'textColor': '#f4f4f5', ",
                "'edgeLabelBackground': '#141414', ",
                "'primaryColor': '#1e2433', ",
                "'primaryTextColor': '#f4f4f5', ",
                "'primaryBorderColor': '#6366f1', ",
                "'lineColor': '#a1a1aa', ",
                "'secondaryColor': '#27272a', ",
                "'tertiaryColor': '#1f1f23', ",
                "'pie1': '#1d4ed8', ",
                "'pie2': '#047857', ",
                "'pie3': '#b45309', ",
                "'pie4': '#6d28d9', ",
                "'pie5': '#be185d', ",
                "'pie6': '#0e7490', ",
                "'pieOpacity': '0.92', ",
                "'pieStrokeColor': '#141414', ",
                "'pieTitleTextColor': '#f4f4f5', ",
                "'pieSectionTextColor': '#f4f4f5', ",
                "'pieLegendTextColor': '#f4f4f5', ",
                "'gridColor': '#52525b', ",
                "'doneTaskBkgColor': '#065f46', ",
                "'doneTaskBorderColor': '#34d399', ",
                "'activeTaskBkgColor': '#1e3a8a', ",
                "'activeTaskBorderColor': '#60a5fa', ",
                "'taskBkgColor': '#27272a', ",
                "'taskBorderColor': '#6366f1', ",
                "'taskTextColor': '#f4f4f5', ",
                "'taskTextDarkColor': '#f4f4f5', ",
                "'taskTextOutsideColor': '#f4f4f5', ",
                "'sectionBkgColor': '#1f1f23', ",
                "'sectionBkgColor2': '#18181b', ",
                "'altSectionBkgColor': '#27272a', ",
                "'todayLineColor': '#f87171', ",
                "'git0': '#1d4ed8', ",
                "'git1': '#047857', ",
                "'git2': '#b45309', ",
                "'git3': '#6d28d9', ",
                "'git4': '#be185d', ",
                "'git5': '#0e7490', ",
                "'git6': '#4338ca', ",
                "'git7': '#3f3f46', ",
                "'gitBranchLabel0': '#f4f4f5', ",
                "'gitBranchLabel1': '#f4f4f5', ",
                "'gitBranchLabel2': '#f4f4f5', ",
                "'gitBranchLabel3': '#f4f4f5', ",
                "'gitBranchLabel4': '#f4f4f5', ",
                "'gitBranchLabel5': '#f4f4f5', ",
                "'gitBranchLabel6': '#f4f4f5', ",
                "'gitBranchLabel7': '#f4f4f5', ",
                "'commitLabelColor': '#f4f4f5', ",
                "'commitLabelBackground': '#27272a', ",
                "'fontFamily': 'Inter, sans-serif'",
                "}}}%%\n"
            ),
        }
    }
}

/// Configuration for deterministic `resvg_safe` Mermaid rendering.
#[derive(Debug, Clone, PartialEq)]
pub struct MermaidOptions {
    /// Explicit calendar date used for Gantt `today` markers.
    pub today: PreviewDate,
    /// Explicit UTC offset in minutes (for example `+480` for UTC+8, `0` for UTC).
    pub timezone_offset_minutes: i16,
    /// Optional stable diagram identifier for scoped SVG ids.
    pub diagram_id: Option<String>,
    /// Extra padding around the computed SVG viewBox in CSS pixels.
    pub viewbox_padding: f64,
    /// Optional built-in AFFiNE Light or Dark theme directive injected ahead of
    /// diagram body (and after YAML front-matter when present) so user `%%{init:...}%%`
    /// directives merge cleanly on top.
    pub theme: Option<MermaidTheme>,
}

impl Default for MermaidOptions {
    fn default() -> Self {
        Self {
            today: PreviewDate::DEFAULT,
            timezone_offset_minutes: 0,
            diagram_id: None,
            viewbox_padding: 8.0,
            theme: None,
        }
    }
}

struct CachedFontFace {
    blob: Arc<[u8]>,
    face_index: u32,
    family_lower: String,
    is_monospace: bool,
    weight: u16,
    italic: bool,
    variation_wght: Option<f32>,
    upem: f64,
    ascii_advances: [Option<u16>; 128],
    glyph_cache: Mutex<HashMap<char, Option<u16>>>,
}

impl CachedFontFace {
    #[allow(clippy::too_many_arguments)]
    fn from_face(
        blob: &Arc<[u8]>,
        face_index: u32,
        face: &mut ttf_parser::Face<'_>,
        family_lower: String,
        is_monospace: bool,
        weight: u16,
        italic: bool,
        variation_wght: Option<f32>,
        upem: f64,
    ) -> Self {
        if let Some(w) = variation_wght {
            let _ = face.set_variation(ttf_parser::Tag::from_bytes(b"wght"), w);
        }
        let mut ascii_advances = [None; 128];
        for (code, slot) in ascii_advances.iter_mut().enumerate() {
            if let Some(ch) = char::from_u32(code as u32) {
                *slot = face
                    .glyph_index(ch)
                    .and_then(|gid| face.glyph_hor_advance(gid));
            }
        }
        Self {
            blob: Arc::clone(blob),
            face_index,
            family_lower,
            is_monospace,
            weight,
            italic,
            variation_wght,
            upem,
            ascii_advances,
            glyph_cache: Mutex::new(HashMap::new()),
        }
    }

    fn lookup_advance(&self, ch: char) -> Option<u16> {
        if (ch as u32) < 128 {
            return self.ascii_advances[ch as usize];
        }
        let mut cache = self
            .glyph_cache
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if let Some(&cached) = cache.get(&ch) {
            return cached;
        }
        let computed = ttf_parser::Face::parse(&self.blob, self.face_index)
            .ok()
            .and_then(|mut face| {
                if let Some(w) = self.variation_wght {
                    let _ = face.set_variation(ttf_parser::Tag::from_bytes(b"wght"), w);
                }
                face.glyph_index(ch).and_then(|g| face.glyph_hor_advance(g))
            });
        cache.insert(ch, computed);
        computed
    }
}

/// Pure safe-Rust width callback backed by pre-parsed [`FontPool`] faces.
///
/// Plugged into `DeterministicTextMeasurer::default().with_width_callback(...)`
/// so Merman retains full line-wrapping, `<br/>`, line-height, and literal `<T, E>`
/// handling while sizing every candidate string with true registered glyph advances.
struct FontPoolWidthMeasurer {
    faces: Vec<CachedFontFace>,
    fallback: DeterministicTextMeasurer,
}

impl FontPoolWidthMeasurer {
    fn new(font_pool: &FontPool) -> Self {
        let mut faces = Vec::new();
        let wght_tag = ttf_parser::Tag::from_bytes(b"wght");
        for blob in font_pool.font_blobs() {
            let count = ttf_parser::fonts_in_collection(blob).unwrap_or(1);
            for face_index in 0..count {
                if let Ok(mut face) = ttf_parser::Face::parse(blob, face_index) {
                    let upem = f64::from(face.units_per_em());
                    if upem <= 0.0 {
                        continue;
                    }
                    let family_lower = extract_face_family(&face).to_ascii_lowercase();
                    let is_monospace = face.is_monospaced() || family_lower.contains("mono");
                    let italic = face.is_italic() || face.is_oblique();
                    let has_wght_axis = face.is_variable()
                        && face.variation_axes().into_iter().any(|a| a.tag == wght_tag);
                    if has_wght_axis {
                        // Variable fonts (e.g. Inter-VariableFont_slnt,wght.ttf) store thin/default
                        // advances in `hmtx`; instantiate both regular (400) and bold (700) via HVAR.
                        for weight in [400_u16, 700_u16] {
                            faces.push(CachedFontFace::from_face(
                                blob,
                                face_index,
                                &mut face,
                                family_lower.clone(),
                                is_monospace,
                                weight,
                                italic,
                                Some(f32::from(weight)),
                                upem,
                            ));
                        }
                    } else {
                        let weight = face.weight().to_number();
                        faces.push(CachedFontFace::from_face(
                            blob,
                            face_index,
                            &mut face,
                            family_lower,
                            is_monospace,
                            weight,
                            italic,
                            None,
                            upem,
                        ));
                    }
                }
            }
        }
        Self {
            faces,
            fallback: DeterministicTextMeasurer::default(),
        }
    }

    fn ordered_face_indices(&self, style: &TextStyle) -> Vec<usize> {
        let requested: Vec<String> = style
            .font_family
            .as_deref()
            .unwrap_or("")
            .split(',')
            .map(|part| {
                part.trim()
                    .trim_matches(|c| c == '\'' || c == '"')
                    .to_ascii_lowercase()
            })
            .filter(|s| !s.is_empty())
            .collect();
        let want_bold = is_bold_weight(style.font_weight.as_deref());
        let want_italic = is_italic_style(style.font_style.as_deref());

        let mut indices: Vec<usize> = (0..self.faces.len()).collect();
        indices.sort_by_key(|&idx| {
            let face = &self.faces[idx];
            let family_rank = requested
                .iter()
                .position(|req| face_matches_request(face, req))
                .unwrap_or(requested.len());
            let target_weight: i32 = if want_bold { 700 } else { 400 };
            let weight_diff = (i32::from(face.weight) - target_weight).abs();
            let italic_mismatch = usize::from(face.italic != want_italic);
            (family_rank, italic_mismatch, weight_diff, idx)
        });
        indices
    }

    fn measure_candidate_width(&self, text: &str, style: &TextStyle) -> f64 {
        if text.is_empty()
            || self.faces.is_empty()
            || !style.font_size.is_finite()
            || style.font_size <= 0.0
        {
            return 0.0;
        }
        let order = self.ordered_face_indices(style);
        let want_bold = is_bold_weight(style.font_weight.as_deref());
        let mut width = 0.0_f64;
        let mut has_visible_char = false;

        for ch in text.chars() {
            if ch == '\u{00ad}' {
                continue;
            }
            has_visible_char = true;
            let mut measured = None;
            for &face_idx in &order {
                let face = &self.faces[face_idx];
                if let Some(adv) = face.lookup_advance(ch) {
                    let bold_scale = if want_bold && face.weight < 600 {
                        1.07
                    } else {
                        1.0
                    };
                    measured = Some((f64::from(adv) / face.upem) * style.font_size * bold_scale);
                    break;
                }
            }
            if let Some(ch_w) = measured {
                width += ch_w;
            } else {
                let mut buf = [0u8; 4];
                let s = ch.encode_utf8(&mut buf);
                width += self.fallback.measure(s, style).width;
            }
        }

        if !has_visible_char {
            return 0.0;
        }
        let safety_pad = (width * 0.04).max(style.font_size * 0.25).max(4.0);
        (width + safety_pad).ceil()
    }
}

fn face_matches_request(face: &CachedFontFace, req: &str) -> bool {
    if face.family_lower == req {
        return true;
    }
    match req {
        "sans-serif" | "system-ui" | "ui-sans-serif" => {
            face.family_lower == "inter" || !face.is_monospace
        }
        "monospace" | "ui-monospace" => face.family_lower == "ibm plex mono" || face.is_monospace,
        _ => false,
    }
}

fn extract_face_family(face: &ttf_parser::Face<'_>) -> String {
    for name in face.names() {
        if name.name_id == ttf_parser::name_id::FAMILY
            && let Some(s) = name.to_string()
            && !s.trim().is_empty()
        {
            return s.trim().to_string();
        }
    }
    String::new()
}

fn is_bold_weight(weight: Option<&str>) -> bool {
    let Some(w) = weight.map(str::trim) else {
        return false;
    };
    if w.eq_ignore_ascii_case("bold") || w.eq_ignore_ascii_case("bolder") {
        return true;
    }
    w.parse::<u16>().is_ok_and(|num| num >= 600)
}

fn is_italic_style(style: Option<&str>) -> bool {
    style.is_some_and(|s| {
        let s = s.trim();
        s.eq_ignore_ascii_case("italic") || s.eq_ignore_ascii_case("oblique")
    })
}

/// Inserts a `%%{init:...}%%` directive after any YAML front-matter block
/// (`---` ... `---` / `...`), or at the start of `source` otherwise.
///
/// Precedence note: because the built-in theme `%%{init:...}%%` is injected
/// *after* YAML front-matter and *before* any user `%%{init:...}%%` directive,
/// user `%%{init:...}%%` directives override the injected theme variables,
/// while YAML front-matter `config.theme` (which precedes the injected init)
/// is overridden when the caller explicitly passes `MermaidOptions::theme = Some(...)`.
/// Callers that want YAML front-matter `config.theme` to win should leave
/// `MermaidOptions::theme` as `None`.
pub(crate) fn inject_theme_after_frontmatter(source: &str, directive: &str) -> String {
    let Some(first_nl) = source.find('\n') else {
        return format!("{directive}{source}");
    };
    let first_line = source[..first_nl].trim_end_matches('\r');
    if first_line != "---" {
        return format!("{directive}{source}");
    }

    let mut offset = first_nl + 1;
    while offset <= source.len() {
        let rest = &source[offset..];
        let (line_raw, next_offset) = match rest.find('\n') {
            Some(nl) => (&rest[..nl], offset + nl + 1),
            None => (rest, source.len() + 1),
        };
        let trimmed = line_raw.trim_end_matches('\r');
        if trimmed == "---" || trimmed == "..." {
            let split_at = next_offset.min(source.len());
            let mut out = String::with_capacity(source.len() + directive.len() + 1);
            out.push_str(&source[..split_at]);
            if !out.ends_with('\n') {
                out.push('\n');
            }
            out.push_str(directive);
            out.push_str(&source[split_at..]);
            return out;
        }
        if next_offset > source.len() {
            break;
        }
        offset = next_offset;
    }

    format!("{directive}{source}")
}

fn is_class_diagram_source(source: &str) -> bool {
    let mut in_frontmatter = false;
    for (idx, raw_line) in source.lines().enumerate() {
        let line = raw_line.trim();
        if idx == 0 && line == "---" {
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if line == "---" || line == "..." {
                in_frontmatter = false;
            }
            continue;
        }
        if line.is_empty() || line.starts_with("%%") {
            continue;
        }
        return line.starts_with("classDiagram");
    }
    false
}

/// Normalizes nested `~...~` generic type parameters that `merman 0.11.0`'s
/// single-level `parse_generic_types` leaves partially expanded in `classDiagram`
/// SVG text (for example `Map~String, List&lt;int~&gt;` -> `Map&lt;String, List&lt;int&gt;&gt;`),
/// while preserving leading package-private visibility markers (`~field`).
fn normalize_class_svg_nested_generics(svg: String, is_class_diagram: bool) -> String {
    if !is_class_diagram || !svg.contains('~') {
        return svg;
    }
    let mut out = String::with_capacity(svg.len() + 32);
    let mut rest = svg.as_str();
    while let Some(gt) = rest.find('>') {
        // Copy tag up to and including `>`.
        out.push_str(&rest[..=gt]);
        rest = &rest[gt + 1..];
        let next_lt = rest.find('<').unwrap_or(rest.len());
        let text = &rest[..next_lt];
        rest = &rest[next_lt..];
        if !text.contains('~') {
            out.push_str(text);
            continue;
        }
        let decoded = text.replace("&lt;", "<").replace("&gt;", ">");
        let chars: Vec<char> = decoded.chars().collect();
        let mut rebuilt = String::with_capacity(decoded.len());
        let mut depth: usize = 0;
        let mut balanced = true;
        for (i, &ch) in chars.iter().enumerate() {
            match ch {
                '<' => {
                    rebuilt.push('<');
                    depth += 1;
                }
                '>' => {
                    rebuilt.push('>');
                    if depth == 0 {
                        balanced = false;
                    } else {
                        depth -= 1;
                    }
                }
                '~' => {
                    let prev_ident =
                        i > 0 && (chars[i - 1].is_alphanumeric() || chars[i - 1] == '_');
                    let next_ident = i + 1 < chars.len()
                        && (chars[i + 1].is_alphanumeric() || chars[i + 1] == '_');
                    if prev_ident && next_ident {
                        rebuilt.push('<');
                        depth += 1;
                    } else if depth > 0 {
                        rebuilt.push('>');
                        depth -= 1;
                    } else {
                        rebuilt.push('~');
                        if prev_ident {
                            balanced = false;
                        }
                    }
                }
                other => rebuilt.push(other),
            }
        }
        if balanced && depth == 0 {
            out.push_str(&rebuilt.replace('<', "&lt;").replace('>', "&gt;"));
        } else {
            out.push_str(text);
        }
    }
    out.push_str(rest);
    out
}

/// Ensures dark-theme Gantt grid tick lines stay clearly visible against `#141414`
/// even when `merman` emits dark default `.grid .tick line` strokes.
fn patch_dark_gantt_grid_stroke(svg: String, theme: Option<MermaidTheme>) -> String {
    if theme != Some(MermaidTheme::Dark) || !svg.contains("class=\"grid\"") {
        return svg;
    }
    if let Some(pos) = svg.find("</style>") {
        let mut out = String::with_capacity(svg.len() + 96);
        out.push_str(&svg[..pos]);
        out.push_str("\n.grid .tick line{stroke:#52525b !important;}\n");
        out.push_str(&svg[pos..]);
        return out;
    }
    svg
}

/// Pure-Rust Mermaid renderer that emits `resvg`-safe SVG without `<foreignObject>`.
#[derive(Debug, Default, Clone, Copy)]
pub struct MermaidRenderer;

impl MermaidRenderer {
    /// Creates a new deterministic Mermaid renderer.
    pub const fn new() -> Self {
        Self
    }

    /// Renders Mermaid source into a `resvg`-safe SVG string (no `<foreignObject>`).
    pub fn render_svg(
        &self,
        source: &str,
        options: &MermaidOptions,
    ) -> Result<String, PreviewError> {
        self.render_svg_internal(source, options, None)
    }

    /// Renders Mermaid source into a `resvg`-safe SVG string using true glyph
    /// advances from `font_pool` via `DeterministicTextMeasurer::with_width_callback`.
    pub fn render_svg_with_fonts(
        &self,
        source: &str,
        options: &MermaidOptions,
        font_pool: &FontPool,
    ) -> Result<String, PreviewError> {
        let pool_opt = (!font_pool.is_empty()).then_some(font_pool);
        self.render_svg_internal(source, options, pool_opt)
    }

    fn render_svg_internal(
        &self,
        source: &str,
        options: &MermaidOptions,
        font_pool: Option<&FontPool>,
    ) -> Result<String, PreviewError> {
        if source.trim().is_empty() {
            return Err(PreviewError::EmptyInput);
        }

        let is_class_diagram = is_class_diagram_source(source);
        let effective_source = match options.theme {
            Some(theme) => inject_theme_after_frontmatter(source, theme.init_directive()),
            None => source.to_string(),
        };

        let civil_date = CivilDate::new(
            options.today.year,
            u32::from(options.today.month),
            u32::from(options.today.day),
        )
        .ok_or_else(|| {
            PreviewError::Mermaid(format!(
                "invalid calendar date: {:04}-{:02}-{:02}",
                options.today.year, options.today.month, options.today.day
            ))
        })?;

        let runtime = RuntimePolicy::deterministic()
            .try_with_fixed_local_offset_minutes(i32::from(options.timezone_offset_minutes))
            .map_err(|err| PreviewError::Mermaid(err.to_string()))?
            .try_with_fixed_today_at_local_midnight(civil_date)
            .map_err(|err| PreviewError::Mermaid(err.to_string()))?;

        let mut environment = SvgEnvironment::deterministic();
        if let Some(pool) = font_pool {
            let width_measurer = Arc::new(FontPoolWidthMeasurer::new(pool));
            let measurer: Arc<dyn TextMeasurer + Send + Sync> =
                DeterministicTextMeasurer::default().with_width_callback(move |text, style| {
                    width_measurer.measure_candidate_width(text, style)
                });
            let profile_id = MeasurementProfileId::new("affine-font-pool")
                .map_err(|err| PreviewError::Mermaid(err.to_string()))?;
            let identity = TextMeasurementProfileIdentity::new(profile_id, "2")
                .map_err(|err| PreviewError::Mermaid(err.to_string()))?;
            let profile = TextMeasurementProfile::new(identity, measurer);
            environment =
                environment.with_text_measurement_policy(TextMeasurementPolicy::uniform(profile));
        }

        let mut svg_request = SvgRequest {
            environment,
            pipeline: Some(SvgPipeline::resvg_safe()),
            ..SvgRequest::default()
        };
        svg_request.options.viewbox_padding = options.viewbox_padding;
        svg_request.options.diagram_id = options.diagram_id.clone();

        let request = RenderRequest::svg(&effective_source, OperationControl::new(), svg_request);
        let renderer = Renderer::new().with_runtime_policy(runtime);
        let output = renderer
            .render(request)
            .map_err(|err| PreviewError::Mermaid(err.to_string()))?;

        match output {
            RenderOutput::Svg(Some(document)) => {
                let svg = normalize_class_svg_nested_generics(
                    patch_dark_gantt_grid_stroke(document.svg().to_string(), options.theme),
                    is_class_diagram,
                );
                if svg.contains("<foreignObject") {
                    return Err(PreviewError::Mermaid(
                        "merman emitted forbidden <foreignObject> tag under resvg_safe pipeline"
                            .to_string(),
                    ));
                }
                Ok(svg)
            }
            RenderOutput::Svg(None) => Err(PreviewError::Mermaid(
                "source did not contain a Mermaid diagram".to_string(),
            )),
            _ => Err(PreviewError::Mermaid(
                "unexpected non-SVG output from Mermaid renderer".to_string(),
            )),
        }
    }

    /// Renders Mermaid source to `resvg`-safe SVG using `rasterizer.font_pool()`
    /// glyph metrics and rasterizes it into RGBA8 pixels.
    pub fn render_rgba(
        &self,
        source: &str,
        options: &MermaidOptions,
        rasterizer: &SvgRasterizer,
        raster_options: RasterOptions,
    ) -> Result<RgbaImageBuffer, PreviewError> {
        let svg = self.render_svg_with_fonts(source, options, rasterizer.font_pool())?;
        rasterizer.rasterize_with_options(&svg, raster_options)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font_pool::FontPool;
    use crate::test_support::build_test_font_pool;

    struct MermaidCase {
        name: &'static str,
        source: &'static str,
        has_cjk: bool,
    }

    const CORPUS: &[MermaidCase] = &[
        MermaidCase {
            name: "flowchart",
            source: "flowchart TD\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Done]\n  B -->|No| D[Retry]",
            has_cjk: false,
        },
        MermaidCase {
            name: "flowchart_cjk",
            source: "flowchart LR\n  A[开始流程] --> B[数据处理]\n  B --> C[结束渲染]",
            has_cjk: true,
        },
        MermaidCase {
            name: "sequence",
            source: "sequenceDiagram\n  participant 用户\n  participant 系统\n  用户->>系统: 发送请求\n  系统-->>用户: 返回预览",
            has_cjk: true,
        },
        MermaidCase {
            name: "class",
            source: "classDiagram\n  class PreviewCache {\n    +usize max_bytes\n    +acquire_pin()\n  }\n  class FontPool {\n    +register_font_bytes()\n  }\n  PreviewCache --> FontPool",
            has_cjk: false,
        },
        MermaidCase {
            name: "state",
            source: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Rendering: render\n  Rendering --> Cached: ok\n  Cached --> [*]",
            has_cjk: false,
        },
        MermaidCase {
            name: "er",
            source: "erDiagram\n  WORKSPACE ||--o{ DOCUMENT : contains\n  DOCUMENT ||--|{ BLOCK : has",
            has_cjk: false,
        },
        MermaidCase {
            name: "gantt",
            source: "gantt\n  title 发布计划\n  dateFormat YYYY-MM-DD\n  section 预览核\n  光栅底座 :done, a1, 2026-01-01, 2d\n  公式渲染 :active, a2, after a1, 3d",
            has_cjk: true,
        },
        MermaidCase {
            name: "pie",
            source: "pie title 占比分布\n  \"流程图表\" : 45\n  \"数学公式\" : 35\n  \"文档预览\" : 20",
            has_cjk: true,
        },
        MermaidCase {
            name: "gitgraph",
            source: "gitGraph\n  commit id: \"init\"\n  branch preview\n  checkout preview\n  commit id: \"merman\"\n  checkout main\n  merge preview",
            has_cjk: false,
        },
    ];

    fn unclip_nested_svgs(svg: &str) -> String {
        let s = svg
            .replace("overflow: hidden", "overflow: visible")
            .replace("overflow:hidden", "overflow:visible")
            .replace("overflow=\"hidden\"", "overflow=\"visible\"");
        let mut out = String::with_capacity(s.len() + 256);
        for (i, part) in s.split("<svg").enumerate() {
            if i == 0 {
                out.push_str(part);
                continue;
            }
            out.push_str("<svg");
            let head = part.split('>').next().unwrap_or("");
            if i > 1 && !head.contains("overflow") {
                out.push_str(" overflow=\"visible\"");
            }
            out.push_str(part);
        }
        out
    }

    fn count_clipped_pixels(svg: &str, pool: &FontPool) -> usize {
        let r = SvgRasterizer::new(pool);
        let opts = RasterOptions::with_scale(2.0);
        let clipped = r.rasterize_with_options(svg, opts).expect("clipped raster");
        let unclipped = r
            .rasterize_with_options(&unclip_nested_svgs(svg), opts)
            .expect("unclipped raster");
        assert_eq!(clipped.width_px, unclipped.width_px);
        assert_eq!(clipped.height_px, unclipped.height_px);
        clipped
            .pixels
            .chunks_exact(4)
            .zip(unclipped.pixels.chunks_exact(4))
            .filter(|(a, b)| {
                // Ignore small isolated-layer premul AA rounding from `overflow:hidden`
                // compositing over opaque node fills; real clipped glyph ink differs by >> 16.
                a.iter().zip(b.iter()).any(|(&x, &y)| x.abs_diff(y) > 16)
            })
            .count()
    }

    #[test]
    fn renders_all_diagram_families_without_foreign_object_and_deterministically() {
        let pool = build_test_font_pool();
        let rasterizer = SvgRasterizer::new(&pool);
        let renderer = MermaidRenderer::new();
        let opts = MermaidOptions {
            today: PreviewDate::new(2026, 1, 3),
            timezone_offset_minutes: 480,
            diagram_id: Some("test-diagram".to_string()),
            viewbox_padding: 8.0,
            theme: None,
        };

        for case in CORPUS {
            let svg = renderer
                .render_svg_with_fonts(case.source, &opts, &pool)
                .unwrap_or_else(|err| panic!("case {} failed: {err}", case.name));
            assert!(!svg.contains("<foreignObject"));
            assert!(svg.contains("<text"));

            let first = rasterizer.rasterize(&svg, 2.0).unwrap();
            let second = rasterizer.rasterize(&svg, 2.0).unwrap();
            assert_eq!(first.sha256(), second.sha256());
            assert!(first.count_non_transparent_pixels() > 100);

            if case.has_cjk {
                let empty_rasterizer = SvgRasterizer::new(&FontPool::new());
                assert!(matches!(
                    empty_rasterizer.rasterize(&svg, 2.0),
                    Err(PreviewError::MissingGlyphFont(_))
                ));
            }
        }
    }

    #[test]
    fn font_pool_width_callback_wraps_long_labels_and_generics_with_zero_clipped_pixels() {
        let inter_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(
            "../../../packages/frontend/component/src/fonts/inter/Inter-VariableFont_slnt,wght.ttf",
        );
        let inter_bytes = std::fs::read(&inter_path).expect("tracked Inter font must exist");
        let mut pool = FontPool::new();
        pool.register_font_bytes(inter_bytes)
            .expect("Inter font must register");

        let renderer = MermaidRenderer::new();
        let cases = [
            (
                "wrapped_latin",
                "flowchart LR\n  A[This is a fairly long label that needs wrapping inside the node] --> B[Short]\n  B -->|a long edge label that wraps too, please| C[Third node]",
            ),
            (
                "generic_class",
                "classDiagram\n  class PreviewCache {\n    +items Map~String, List~int~~\n    +acquire_pin() Result~T~\n  }\n  class FontPool {\n    +register_font_bytes()\n  }\n  PreviewCache --> FontPool",
            ),
            (
                "state_diagram",
                "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Rendering: render\n  Rendering --> Cached: ok\n  Cached --> [*]",
            ),
        ];

        for (name, src) in cases {
            let svg = renderer
                .render_svg_with_fonts(
                    src,
                    &MermaidOptions {
                        theme: Some(MermaidTheme::Light),
                        ..MermaidOptions::default()
                    },
                    &pool,
                )
                .unwrap_or_else(|e| panic!("{name} failed: {e}"));
            let clipped = count_clipped_pixels(&svg, &pool);
            assert_eq!(
                clipped, 0,
                "{name} must have zero clipped pixels inside nested <svg> boxes"
            );
            if name == "wrapped_latin" {
                let text_lines = svg
                    .matches("<text")
                    .count()
                    .max(svg.matches("<tspan").count());
                assert!(
                    text_lines >= 5,
                    "long wrapped label must wrap into multiple SVG text lines (got {text_lines})"
                );
            }
            if name == "generic_class" {
                assert!(
                    svg.contains("class=\"divider\""),
                    "classic look classDiagram must emit solid divider elements"
                );
                assert!(
                    !svg.contains("stroke:url(#"),
                    "classic look must not emit objectBoundingBox gradient strokes on dividers"
                );
            }
        }
    }

    #[test]
    fn frontmatter_and_user_init_merge_cleanly_with_mermaid_theme() {
        let pool = build_test_font_pool();
        let renderer = MermaidRenderer::new();
        let dark_opts = MermaidOptions {
            theme: Some(MermaidTheme::Dark),
            ..MermaidOptions::default()
        };

        let with_fm = "---\ntitle: Demo Title\n---\nflowchart LR\n  A[Start] --> B[End]";
        let fm_svg = renderer
            .render_svg_with_fonts(with_fm, &dark_opts, &pool)
            .expect("front-matter + Dark theme must render without parse error");
        assert!(fm_svg.contains("Demo Title"));
        assert!(fm_svg.to_ascii_lowercase().contains("#1e2433"));

        let with_non_theme_init =
            "%%{init: {'flowchart': {'curve': 'linear'}}}%%\nflowchart LR\n  A[Start] --> B[End]";
        let init_svg = renderer
            .render_svg_with_fonts(with_non_theme_init, &dark_opts, &pool)
            .expect("non-theme user init + Dark theme must keep dark palette");
        assert!(init_svg.to_ascii_lowercase().contains("#1e2433"));

        let with_custom_pie = "%%{init: {'themeVariables': {'pie1': '#ff00aa'}}}%%\npie title Custom\n  \"A\" : 60\n  \"B\" : 40";
        let pie_svg = renderer
            .render_svg_with_fonts(with_custom_pie, &dark_opts, &pool)
            .expect("user themeVariables override must take precedence");
        assert!(
            pie_svg.contains("#ff00aa") || pie_svg.contains("rgb(255, 0, 170)"),
            "user themeVariables must override base theme"
        );
    }

    #[test]
    fn gantt_today_marker_moves_with_injected_preview_date() {
        let renderer = MermaidRenderer::new();
        let gantt = "gantt\n  title Release\n  dateFormat YYYY-MM-DD\n  section Core\n  Task A :a1, 2026-03-01, 20d\n";
        let early = renderer
            .render_svg(
                gantt,
                &MermaidOptions {
                    today: PreviewDate::new(2026, 3, 2),
                    timezone_offset_minutes: 0,
                    ..MermaidOptions::default()
                },
            )
            .unwrap();
        let late = renderer
            .render_svg(
                gantt,
                &MermaidOptions {
                    today: PreviewDate::new(2026, 3, 18),
                    timezone_offset_minutes: 0,
                    ..MermaidOptions::default()
                },
            )
            .unwrap();

        let extract_today_x = |svg: &str| -> f64 {
            let line_tag = svg
                .split("<line ")
                .skip(1)
                .filter_map(|part| part.split('>').next())
                .find(|attrs| attrs.contains("class=\"today\"") || attrs.contains("todayMarker"))
                .expect("today <line>");
            let x1_pos = line_tag.find("x1=\"").expect("x1");
            let after = &line_tag[x1_pos + 4..];
            let end = after.find('"').expect("closing quote");
            after[..end].parse::<f64>().expect("numeric x1")
        };

        assert!(extract_today_x(&late) > extract_today_x(&early) + 20.0);
    }

    #[test]
    fn distinct_cjk_labels_render_distinct_raster_pixels() {
        let pool = build_test_font_pool();
        let rasterizer = SvgRasterizer::new(&pool);
        let renderer = MermaidRenderer::new();
        let opts = MermaidOptions::default();

        let svg_a = renderer
            .render_svg_with_fonts("flowchart LR\n  A[中文] --> B[开始]", &opts, &pool)
            .unwrap();
        let svg_b = renderer
            .render_svg_with_fonts("flowchart LR\n  A[测试] --> B[结束]", &opts, &pool)
            .unwrap();

        assert_ne!(
            rasterizer.rasterize(&svg_a, 2.0).unwrap().sha256(),
            rasterizer.rasterize(&svg_b, 2.0).unwrap().sha256()
        );
    }

    #[test]
    fn rejects_empty_mermaid_input() {
        let renderer = MermaidRenderer::new();
        assert!(matches!(
            renderer.render_svg("   ", &MermaidOptions::default()),
            Err(PreviewError::EmptyInput)
        ));
    }
}
