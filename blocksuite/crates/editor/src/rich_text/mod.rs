//! Shaped paragraph geometry in document UTF-16 coordinates.
mod bi_index;
mod layout;
mod paint;

use std::ops::Range;

pub use crate::theme::ThemeMode;
use crate::theme::{IconPaint, PlaygroundTheme, tokens as raw_tokens};
use ui::{Bounds, FontWeight, Hsla, Pixels, SharedString, TextAlign};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

pub use bi_index::TextBiIndex;
pub use layout::{LaidOutRichLine, LaidOutRichParagraph};
pub use paint::RichParagraphElement;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WrapAffinity {
    Upstream,
    Downstream,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CaretPosition {
    pub utf16_offset: u64,
    pub affinity: WrapAffinity,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DecorationKind {
    CodePill,
    LatexChip(String),
    ReferenceChip(InlineReference),
    ReferenceDivider,
    PageGlyph,
    Underline,
    Strikethrough,
    Link(String),
    /// Background of a highlighted run, painted behind its glyphs.
    Highlight,
}

#[derive(Clone, Debug)]
pub struct InlineDecoration {
    pub kind: DecorationKind,
    pub bounds: Bounds<Pixels>,
    pub source_utf16: Range<u64>,
    pub color: Hsla,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InlineReference {
    pub kind: String,
    pub page_id: String,
    pub title: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct InlineMarkSet {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
    pub code: bool,
    pub link: Option<String>,
    pub latex: Option<String>,
    pub reference: Option<InlineReference>,
    /// Text color as stored in the document (`var(--token)` or a hex color).
    pub color: Option<String>,
    /// Highlight color as stored in the document (`var(--token)` or a hex color).
    pub background: Option<String>,
}

fn string_attr(value: Option<&Any>) -> Option<String> {
    match value? {
        Any::String(s) => Some(s.clone()),
        _ => None,
    }
}

impl InlineMarkSet {
    fn from_attrs(attrs: &TextAttributes) -> Self {
        let enabled = |key| attrs.get(key) == Some(&Any::True);
        let reference = match attrs.get("reference") {
            Some(Any::Object(obj)) => string_attr(obj.get("type"))
                .zip(string_attr(obj.get("pageId")))
                .map(|(kind, page_id)| InlineReference {
                    kind,
                    page_id,
                    title: string_attr(obj.get("title")),
                }),
            _ => None,
        };
        Self {
            bold: enabled("bold"),
            italic: enabled("italic"),
            underline: enabled("underline"),
            strike: enabled("strike"),
            code: enabled("code"),
            link: string_attr(attrs.get("link")),
            latex: string_attr(attrs.get("latex")),
            reference,
            color: string_attr(attrs.get("color")),
            background: string_attr(attrs.get("background")),
        }
    }
}

#[derive(Clone, Debug)]
pub struct RichSpan {
    pub source_utf16: Range<u64>,
    pub display_bytes: Range<usize>,
    pub marks: InlineMarkSet,
    pub(super) source_bytes: Range<usize>,
    pub(super) chip: bool,
}

/// Owns the original snapshot, including opaque attributes and embedded values.
pub struct RichParagraph {
    delta: Vec<TextDeltaOp>,
    pub(super) source: String,
    pub(super) display: String,
    pub(super) spans: Vec<RichSpan>,
    pub(super) index: TextBiIndex,
}

impl RichParagraph {
    pub fn from_delta(delta: Vec<TextDeltaOp>) -> anyhow::Result<Self> {
        Self::from_delta_with_resolver(delta, |_| None)
    }

    pub fn from_delta_with_resolver(
        delta: Vec<TextDeltaOp>,
        resolve_doc_title: impl Fn(&str) -> Option<String>,
    ) -> anyhow::Result<Self> {
        let mut source = String::new();
        let mut display = String::new();
        let mut spans = Vec::new();
        let mut utf16 = 0;
        for op in &delta {
            let TextDeltaOp::Insert { insert, format } = op else {
                anyhow::bail!(
                    "paragraph layout requires a document snapshot containing insert operations"
                );
            };
            let marks = format
                .as_ref()
                .map(InlineMarkSet::from_attrs)
                .unwrap_or_default();
            let mut append = |text: &str, label: &str, chip: bool| {
                if text.is_empty() {
                    return;
                }
                let start = source.len();
                let display_start = display.len();
                source.push_str(text);
                display.push_str(label);
                let end = utf16 + text.encode_utf16().count() as u64;
                spans.push(RichSpan {
                    source_bytes: start..source.len(),
                    source_utf16: utf16..end,
                    display_bytes: display_start..display.len(),
                    marks: marks.clone(),
                    chip,
                });
                utf16 = end;
            };
            match insert {
                TextInsert::Text(s)
                    if marks.reference.is_some() && s.bytes().all(|b| b == b' ') =>
                {
                    let reference = marks.reference.as_ref().unwrap();
                    let resolved = resolve_doc_title(&reference.page_id);
                    let title = resolved
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .or_else(|| reference.title.as_deref().filter(|s| !s.is_empty()))
                        .unwrap_or("Untitled");
                    let label = format!("{PAGE_PREFIX}{}", title.replace(['\r', '\n'], " "));
                    // Y.Text may coalesce consecutive identically formatted placeholders.
                    for _ in s.bytes() {
                        append(" ", &label, true);
                    }
                }
                TextInsert::Text(s) if marks.latex.is_some() && s.bytes().all(|b| b == b' ') => {
                    let tex = marks.latex.as_deref().unwrap_or("");
                    let label = if tex.is_empty() {
                        "Equation".to_string()
                    } else {
                        tex.replace(['\r', '\n'], " ")
                    };
                    for _ in s.bytes() {
                        append(" ", &label, true);
                    }
                }
                TextInsert::Text(s) => append(s, s, false),
                TextInsert::Embed(values) => {
                    let objects = "\u{fffc}".repeat(values.len());
                    append(&objects, &objects, false);
                }
            }
        }
        let index = TextBiIndex::new(&source);
        Ok(Self {
            delta,
            source,
            display,
            spans,
            index,
        })
    }

    pub fn delta(&self) -> &[TextDeltaOp] {
        &self.delta
    }
    pub fn source_text(&self) -> &str {
        &self.source
    }
    pub fn display_text(&self) -> &str {
        &self.display
    }
    pub fn spans(&self) -> &[RichSpan] {
        &self.spans
    }
    pub fn index(&self) -> &TextBiIndex {
        &self.index
    }

    /// Maps a document position to a UTF-8 boundary in the flattened display string.
    pub fn display_byte_for_utf16(&self, offset: u64) -> usize {
        let i = self.spans.partition_point(|s| s.source_utf16.end <= offset);
        self.spans.get(i).map_or(self.display.len(), |s| {
            s.display_bytes.start
                + (self.index.utf16_to_utf8_clamped(offset) - s.source_bytes.start)
        })
    }

    /// Inside a reference label, all interior byte positions address the placeholder's start.
    pub fn utf16_for_display_byte(&self, offset: usize) -> u64 {
        let i = self
            .spans
            .partition_point(|s| s.display_bytes.end <= offset);
        self.spans.get(i).map_or(self.index.utf16_len(), |s| {
            if s.chip {
                s.source_utf16.start
            } else {
                self.index
                    .utf8_to_utf16(s.source_bytes.start + (offset - s.display_bytes.start))
            }
        })
    }
}

// The display index includes the page symbol. Its outline is drawn with the
// paragraph so a platform's font fallback cannot substitute a color emoji.
const PAGE_PREFIX: &str = "▤ ";

#[derive(Clone, Debug)]
pub struct RichParagraphStyle {
    /// Theme that resolves `color` and `background` marks.
    pub theme: PlaygroundTheme,
    pub font_family: SharedString,
    pub code_font_family: SharedString,
    pub font_size: f32,
    pub base_weight: FontWeight,
    pub line_height: f32,
    /// Measured alphabetic baseline within the line box. Defaults to centered font metrics.
    pub baseline_offset: Option<f32>,
    pub letter_spacing: f32,
    /// Where each line sits inside the layout width.
    pub align: TextAlign,
    pub text_color: Hsla,
    pub link_color: Hsla,
    pub code_bg: Hsla,
    pub code_fg: Hsla,
    pub code_font_size: f32,
    pub code_border: Hsla,
    pub code_border_width: f32,
    pub code_radius: f32,
    pub code_padding_x: f32,
    pub code_padding_bottom: f32,
    pub code_baseline: f32,
    pub code_descent: f32,
    pub reference_divider: Hsla,
    pub icon_color: Hsla,
    pub chip_bg: Hsla,
    pub chip_fg: Hsla,
    /// Display scale factor used for rasterizing inline math formulas.
    pub dpr: f32,
}

impl Default for RichParagraphStyle {
    fn default() -> Self {
        Self::from_theme(ThemeMode::Light)
    }
}

/// Inline code box as measured in the browser (`inline_formats.inline_code` of
/// `tokens/style-oracle.json`); a test keeps these constants equal to the oracle.
#[derive(Clone, Copy, Debug, PartialEq)]
struct CodeBoxMetrics {
    baseline: f32,
    descent: f32,
    border: f32,
    radius: f32,
    padding_x: f32,
    padding_bottom: f32,
}

impl CodeBoxMetrics {
    const LIGHT: Self = Self {
        baseline: 12.0,
        descent: 3.0,
        border: 1.0,
        radius: 4.0,
        padding_x: 4.0,
        padding_bottom: 2.0,
    };
    const DARK: Self = Self {
        baseline: 13.0,
        descent: 3.0,
        border: 1.0,
        radius: 4.0,
        padding_x: 4.0,
        padding_bottom: 2.0,
    };

    fn for_theme(mode: ThemeMode) -> Self {
        match mode {
            ThemeMode::Light => Self::LIGHT,
            ThemeMode::Dark => Self::DARK,
        }
    }
}

impl RichParagraphStyle {
    pub fn from_theme(mode: ThemeMode) -> Self {
        let theme = raw_tokens::theme(mode);
        let typography = &raw_tokens::TYPOGRAPHY;
        let color = |rgba: raw_tokens::Rgba| ui::rgba(rgba.to_u32()).into();
        let family = |stack: &'static str| {
            SharedString::from(stack.split(',').next().unwrap().trim_matches('"'))
        };
        let metrics = CodeBoxMetrics::for_theme(mode);
        Self {
            theme: mode.into(),
            font_family: family(typography.font_family),
            code_font_family: family(typography.font_code_family),
            font_size: typography.font_base_px,
            base_weight: FontWeight::NORMAL,
            line_height: typography.line_height_base_px,
            baseline_offset: None,
            letter_spacing: 0.,
            align: TextAlign::Left,
            text_color: color(theme.text_primary),
            link_color: color(theme.link),
            code_bg: color(theme.background_code_block),
            code_fg: color(theme.text_primary),
            code_font_size: typography.font_base_px - 3.,
            code_border: color(theme.border),
            code_border_width: metrics.border,
            code_radius: metrics.radius,
            code_padding_x: metrics.padding_x,
            code_padding_bottom: metrics.padding_bottom,
            code_baseline: metrics.baseline,
            code_descent: metrics.descent,
            reference_divider: color(theme.divider),
            icon_color: color(theme.icon),
            chip_bg: color(raw_tokens::Rgba::TRANSPARENT),
            chip_fg: color(theme.text_primary),
            dpr: 2.0,
        }
    }
}

/// Shared fixture for comparing plain document text with its rendered marks.
#[cfg(feature = "harness")]
pub fn sample_paragraph() -> anyhow::Result<RichParagraph> {
    let plain = |s: &str| TextDeltaOp::Insert {
        insert: TextInsert::Text(s.into()),
        format: None,
    };
    let marked = |s: &str, key: &str, value: Any| TextDeltaOp::Insert {
        insert: TextInsert::Text(s.into()),
        format: Some([(key.into(), value)].into()),
    };
    let reference = Any::Object(Box::new(
        [
            ("type".into(), Any::String("LinkedPage".into())),
            ("pageId".into(), Any::String("release".into())),
        ]
        .into_iter()
        .collect(),
    ));
    RichParagraph::from_delta_with_resolver(
        vec![
            plain("The "),
            marked("release", "bold", Any::True),
            plain(" is ready when "),
            marked("cargo test", "code", Any::True),
            plain(" passes.\nStatus: "),
            marked("draft", "strike", Any::True),
            plain(" "),
            marked("approved", "italic", Any::True),
            plain(". Read the "),
            marked(
                "review notes",
                "link",
                Any::String("https://example.org/review".into()),
            ),
            plain(" or "),
            marked(" ", "reference", reference),
            plain("."),
        ],
        |id| (id == "release").then(|| "Release guide".to_owned()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{
        schema::{BlockSpec, ParagraphType},
        session::PageDocSession,
    };

    fn insert(text: &str, format: Option<TextAttributes>) -> TextDeltaOp {
        TextDeltaOp::Insert {
            insert: TextInsert::Text(text.into()),
            format,
        }
    }

    #[test]
    fn document_delta_preserves_marks_and_atomic_reference_offsets() {
        let mut page = PageDocSession::new("test:rich", 17).unwrap();
        page.add_block(
            "p",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: String::new(),
            },
            None,
            None,
            0,
        )
        .unwrap();
        let mut attrs: TextAttributes = ["bold", "italic", "underline", "strike", "code"]
            .into_iter()
            .map(|key| (key.into(), Any::True))
            .collect();
        attrs.insert("link".into(), Any::String("https://example.org".into()));
        attrs.insert("custom".into(), Any::Integer(42));
        let reference = Any::Object(Box::new(
            [
                ("type".into(), Any::String("LinkedPage".into())),
                ("pageId".into(), Any::String("page-x".into())),
                ("title".into(), Any::String("Reference title".into())),
            ]
            .into_iter()
            .collect(),
        ));
        page.apply_text_delta(
            "p",
            "prop:text",
            &[
                insert("😀", Some(attrs)),
                insert(" ", Some([("reference".into(), reference)].into())),
                insert("中", None),
            ],
            1,
        )
        .unwrap();
        let delta = page
            .inner()
            .read_text_delta(&y_octo::TypeTarget::Path(
                y_octo::TypePath::root("blocks").key("p").key("prop:text"),
            ))
            .unwrap();
        let para = RichParagraph::from_delta(delta.clone()).unwrap();
        assert_eq!(para.delta(), delta.as_slice());
        assert_eq!(para.source_text(), "😀 中");
        assert_eq!(para.display_text(), "😀▤ Reference title中");
        let marks = &para.spans()[0].marks;
        assert!(marks.bold && marks.italic && marks.underline && marks.strike && marks.code);
        assert_eq!(marks.link.as_deref(), Some("https://example.org"));
        let chip = &para.spans()[1];
        assert_eq!(chip.marks.reference.as_ref().unwrap().kind, "LinkedPage");
        assert_eq!(chip.source_utf16, 2..3);
        assert_eq!(para.display_byte_for_utf16(2), 4);
        assert_eq!(para.display_byte_for_utf16(3), 23);
        for i in 4..23 {
            assert_eq!(para.utf16_for_display_byte(i), 2);
        }
        assert_eq!(para.utf16_for_display_byte(23), 3);
    }

    #[test]
    fn code_box_constants_match_the_browser_oracle() {
        let oracle: serde_json::Value =
            serde_json::from_str(include_str!("../../../oracle/style-oracle.json")).unwrap();
        for (mode, name) in [(ThemeMode::Light, "light"), (ThemeMode::Dark, "dark")] {
            let node = &oracle["themes"][name]["inline_formats"]["inline_code"];
            let css = |property: &str| -> f32 {
                node["computed"][property]
                    .as_str()
                    .and_then(|s| s.strip_suffix("px"))
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| panic!("{name} inline code {property} is a pixel measure"))
            };
            let baseline = node["baseline_offset_px"].as_f64().unwrap() as f32;
            let height = node["rect"]["height"].as_f64().unwrap() as f32;
            let border = css("border_top_width");
            let padding_bottom = css("padding_bottom");
            assert_eq!(
                CodeBoxMetrics::for_theme(mode),
                CodeBoxMetrics {
                    baseline,
                    descent: height - baseline - padding_bottom - border,
                    border,
                    radius: css("border_radius"),
                    padding_x: css("padding_left"),
                    padding_bottom,
                },
                "{name} inline code box"
            );
        }
    }

    #[test]
    fn reference_title_resolution_preserves_document_identity() {
        let reference = |title: Option<&str>| {
            let mut attrs = vec![
                ("type".into(), Any::String("LinkedPage".into())),
                ("pageId".into(), Any::String("doc:abc".into())),
            ];
            if let Some(s) = title {
                attrs.push(("title".into(), Any::String(s.into())));
            }
            vec![insert(
                " ",
                Some(
                    [(
                        "reference".into(),
                        Any::Object(Box::new(attrs.into_iter().collect())),
                    )]
                    .into(),
                ),
            )]
        };
        for (stored, resolved, expected) in [
            (Some("Saved"), Some("Initial Title"), "Initial Title"),
            (Some("Saved"), Some("Renamed Page"), "Renamed Page"),
            (Some("Saved"), Some(""), "Saved"),
            (Some(""), None, "Untitled"),
            (None, None, "Untitled"),
        ] {
            let delta = reference(stored);
            let p = RichParagraph::from_delta_with_resolver(delta.clone(), |id| {
                assert_eq!(id, "doc:abc");
                resolved.map(str::to_owned)
            })
            .unwrap();
            assert_eq!(p.display_text(), format!("{PAGE_PREFIX}{expected}"));
            assert_eq!(p.spans()[0].source_utf16, 0..1);
            assert_eq!(p.delta(), delta);
        }
    }
}
