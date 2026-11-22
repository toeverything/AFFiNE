//! Theme tokens, icons and bundled fonts for the playground.
//!
//! Colors, typography and icons come straight from the generated `tokens/tokens.rs` and
//! `tokens/icons.rs` files, so a regenerated token set reaches every render target without
//! touching this crate. They are pulled in with `include!` rather than `#[path]` modules
//! so `rustfmt` never rewrites the generated sources.

use std::{
    borrow::Cow,
    collections::HashMap,
    sync::{Arc, OnceLock, RwLock},
};

use ui::{
    App, Bounds, BoxShadow, Hsla, Pixels, SharedString, TransformationMatrix, Window, point, px,
};

#[allow(dead_code, clippy::all)]
pub mod tokens {
    include!("../../../tokens/tokens.rs");
}

#[allow(dead_code, clippy::all)]
pub mod icons {
    include!("../../../tokens/icons.rs");
}

pub use icons::{IconDef, icon_by_name};
pub use tokens::{DARK_THEME, LIGHT_THEME, TYPOGRAPHY, ThemeMode, ThemeTokens};

/// Base UI and document font family.
pub const FONT_SANS: &str = "Inter";
/// Code and inline-code font family.
pub const FONT_CODE: &str = "IBM Plex Mono";

const INTER_VARIABLE_TTF: &[u8] = include_bytes!(
    "../../../../../packages/frontend/component/src/fonts/inter/Inter-VariableFont_slnt,wght.ttf"
);
const IBM_PLEX_MONO_REGULAR_TTF: &[u8] = include_bytes!(
    "../../../../../packages/frontend/component/src/fonts/ibm-plex-mono/IBMPlexMono-Regular.ttf"
);
const IBM_PLEX_MONO_BOLD_TTF: &[u8] = include_bytes!(
    "../../../../../packages/frontend/component/src/fonts/ibm-plex-mono/IBMPlexMono-Bold.ttf"
);
const IBM_PLEX_MONO_ITALIC_TTF: &[u8] = include_bytes!(
    "../../../../../packages/frontend/component/src/fonts/ibm-plex-mono/IBMPlexMono-Italic.ttf"
);
const IBM_PLEX_MONO_BOLD_ITALIC_TTF: &[u8] = include_bytes!(
    "../../../../../packages/frontend/component/src/fonts/ibm-plex-mono/IBMPlexMono-BoldItalic.ttf"
);

/// Registers the tracked repository fonts (`Inter` and `IBM Plex Mono`) into the active
/// `TextSystem`.
///
/// Must be called before opening any window across macOS, Linux headless, and Web Wasm.
pub fn register_bundled_fonts(cx: &App) -> anyhow::Result<()> {
    cx.text_system().add_fonts(vec![
        Cow::Borrowed(INTER_VARIABLE_TTF),
        Cow::Borrowed(IBM_PLEX_MONO_REGULAR_TTF),
        Cow::Borrowed(IBM_PLEX_MONO_BOLD_TTF),
        Cow::Borrowed(IBM_PLEX_MONO_ITALIC_TTF),
        Cow::Borrowed(IBM_PLEX_MONO_BOLD_ITALIC_TTF),
    ])
}

/// Color theme of the playground chrome and document.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum PlaygroundTheme {
    #[default]
    Light,
    Dark,
}

impl PlaygroundTheme {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
            _ => None,
        }
    }

    pub fn toggled(self) -> Self {
        match self {
            Self::Light => Self::Dark,
            Self::Dark => Self::Light,
        }
    }

    /// The generated tokens' name for this theme.
    pub fn mode(self) -> ThemeMode {
        match self {
            Self::Light => ThemeMode::Light,
            Self::Dark => ThemeMode::Dark,
        }
    }

    /// Generated token set of this theme.
    pub fn tokens(self) -> &'static ThemeTokens {
        match self {
            Self::Light => &LIGHT_THEME,
            Self::Dark => &DARK_THEME,
        }
    }

    /// Resolved colors used by the chrome and the page renderer.
    pub fn palette(self) -> Palette {
        static PALETTES: OnceLock<[Palette; 2]> = OnceLock::new();
        let palettes =
            PALETTES.get_or_init(|| [Palette::new(Self::Light), Palette::new(Self::Dark)]);
        match self {
            Self::Light => palettes[0],
            Self::Dark => palettes[1],
        }
    }

    /// Color of a `--affine-*` CSS variable in this theme.
    pub fn css_var(self, name: &str) -> Option<Hsla> {
        self.tokens().color(name).map(hsla)
    }

    /// Resolve a CSS color as stored in documents and awareness payloads: `var(--name)`,
    /// `var(--name, fallback)`, `#rgb`, `#rrggbb` or `#rrggbbaa`.
    pub fn css_color(self, value: &str) -> Option<Hsla> {
        let value = value.trim();
        if let Some(inner) = value
            .strip_prefix("var(")
            .and_then(|rest| rest.strip_suffix(')'))
        {
            let (name, fallback) = match inner.split_once(',') {
                Some((name, fallback)) => (name.trim(), Some(fallback)),
                None => (inner.trim(), None),
            };
            return self
                .css_var(name)
                .or_else(|| fallback.and_then(|fallback| self.css_color(fallback)));
        }
        if value.starts_with("rgb(") || value.starts_with("rgba(") {
            return parse_rgb_function(value);
        }
        parse_hex_color(value)
    }

    /// Box shadow layers of a `--affine-*-shadow` token in this theme, outermost first.
    /// Inset layers and layers that do not parse are left out.
    pub fn shadows(self, name: &str) -> Vec<BoxShadow> {
        static CACHE: OnceLock<RwLock<HashMap<&'static str, Vec<BoxShadow>>>> = OnceLock::new();
        let Some(raw) = self.tokens().shadow(name) else {
            return Vec::new();
        };
        let cache = CACHE.get_or_init(|| RwLock::new(HashMap::new()));
        if let Some(hit) = cache.read().ok().and_then(|map| map.get(raw).cloned()) {
            return hit;
        }
        let parsed = parse_box_shadows(raw);
        if let Ok(mut map) = cache.write() {
            map.insert(raw, parsed.clone());
        }
        parsed
    }
}

/// Parse a CSS `box-shadow` list of `<x> <y> <blur> [<spread>] <color>` layers.
fn parse_box_shadows(value: &str) -> Vec<BoxShadow> {
    // Layers are separated by the commas outside of `rgba(...)`.
    let mut layers = Vec::new();
    let (mut depth, mut start) = (0_i32, 0_usize);
    for (index, ch) in value.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                layers.push(&value[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    layers.push(&value[start..]);

    layers
        .into_iter()
        .filter_map(|layer| {
            let layer = layer.trim();
            if layer.split_whitespace().any(|word| word == "inset") {
                return None;
            }
            let (lengths, color) = match layer.find("rgb") {
                Some(at) => (&layer[..at], parse_rgb_function(&layer[at..])?),
                None => {
                    let at = layer.find('#')?;
                    (&layer[..at], parse_hex_color(layer[at..].trim())?)
                }
            };
            let lengths: Vec<f32> = lengths
                .split_whitespace()
                .map(|length| length.trim_end_matches("px").parse::<f32>())
                .collect::<Result<_, _>>()
                .ok()?;
            let length = |index: usize| lengths.get(index).copied().unwrap_or(0.0);
            (lengths.len() >= 2).then(|| BoxShadow {
                color,
                offset: point(px(length(0)), px(length(1))),
                blur_radius: px(length(2)),
                spread_radius: px(length(3)),
                inset: false,
            })
        })
        .collect()
}

/// Parse `rgb(r, g, b)` or `rgba(r, g, b, a)` with 0-255 channels and a 0-1 alpha.
fn parse_rgb_function(value: &str) -> Option<Hsla> {
    let inner = value.split_once('(')?.1.split_once(')')?.0;
    let mut channels = inner.split(',').map(|part| part.trim().parse::<f32>().ok());
    let mut channel = || channels.next().flatten().map(|value| value / 255.0);
    let (r, g, b) = (channel()?, channel()?, channel()?);
    let a = channels.next().flatten().unwrap_or(1.0);
    Some(ui::Rgba { r, g, b, a }.into())
}

impl From<ThemeMode> for PlaygroundTheme {
    fn from(mode: ThemeMode) -> Self {
        match mode {
            ThemeMode::Light => Self::Light,
            ThemeMode::Dark => Self::Dark,
        }
    }
}

/// Convert a generated token color into a UI color.
pub fn hsla(color: tokens::Rgba) -> Hsla {
    let [r, g, b, a] = color.to_f32();
    ui::Rgba { r, g, b, a }.into()
}

fn parse_hex_color(value: &str) -> Option<Hsla> {
    let hex = value.strip_prefix('#')?;
    if !hex.is_ascii() {
        return None;
    }
    let channel = |index: usize, width: usize| -> Option<f32> {
        let digits = hex.get(index * width..(index + 1) * width)?;
        let value = u8::from_str_radix(digits, 16).ok()?;
        let value = if width == 1 { value * 17 } else { value };
        Some(f32::from(value) / 255.0)
    };
    let (width, has_alpha) = match hex.len() {
        3 => (1, false),
        4 => (1, true),
        6 => (2, false),
        8 => (2, true),
        _ => return None,
    };
    Some(
        ui::Rgba {
            r: channel(0, width)?,
            g: channel(1, width)?,
            b: channel(2, width)?,
            a: if has_alpha { channel(3, width)? } else { 1.0 },
        }
        .into(),
    )
}

/// Theme colors resolved once per frame from the generated tokens.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Palette {
    pub theme: PlaygroundTheme,
    /// `--affine-background-primary-color`
    pub background: Hsla,
    /// `--affine-background-secondary-color`
    pub background_secondary: Hsla,
    /// `--affine-background-overlay-panel-color`
    pub panel: Hsla,
    /// `--affine-background-code-block`
    pub code_background: Hsla,
    /// `--affine-text-primary-color`
    pub text_primary: Hsla,
    /// `--affine-text-secondary-color`
    pub text_secondary: Hsla,
    /// `--affine-placeholder-color`
    pub placeholder: Hsla,
    /// `--affine-border-color`
    pub border: Hsla,
    /// `--affine-divider-color`
    pub divider: Hsla,
    /// `--affine-quote-color`
    pub quote: Hsla,
    /// `--affine-link-color`
    pub link: Hsla,
    /// `--affine-icon-color`
    pub icon: Hsla,
    /// `--affine-blue-700`, the list prefix color.
    pub list_marker: Hsla,
    /// `--affine-brand-color`, the checked to-do box.
    pub brand: Hsla,
    /// `--affine-hover-color`
    pub hover: Hsla,
    /// `--affine-v2-layer-background-tertiary`, the embed card border.
    pub card_border: Hsla,
    /// `--affine-edgeless-grid-color`
    pub edgeless_grid: Hsla,
    /// `--affine-pure-white`, ink on saturated presence colors.
    pub on_accent: Hsla,
}

impl Palette {
    pub fn new(theme: PlaygroundTheme) -> Self {
        let tokens = theme.tokens();
        let var = |name: &str, fallback: tokens::Rgba| hsla(tokens.color(name).unwrap_or(fallback));
        Self {
            theme,
            background: hsla(tokens.background_primary),
            background_secondary: hsla(tokens.background_secondary),
            panel: hsla(tokens.background_overlay_panel),
            code_background: hsla(tokens.background_code_block),
            text_primary: hsla(tokens.text_primary),
            text_secondary: hsla(tokens.text_secondary),
            placeholder: hsla(tokens.placeholder),
            border: hsla(tokens.border),
            divider: hsla(tokens.divider),
            quote: hsla(tokens.quote),
            link: hsla(tokens.link),
            icon: hsla(tokens.icon),
            list_marker: var("--affine-blue-700", tokens.primary),
            brand: hsla(tokens.brand),
            hover: hsla(tokens.hover),
            card_border: var("--affine-v2-layer-background-tertiary", tokens.border),
            edgeless_grid: hsla(tokens.edgeless_grid),
            on_accent: var("--affine-pure-white", tokens::Rgba::new(255, 255, 255, 255)),
        }
    }
}

/// Serialize an icon definition as a standalone monochrome SVG document for the SVG renderer.
pub fn icon_svg(icon: &IconDef) -> String {
    let mut svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{}" fill="none">"#,
        icon.view_box
    );
    for path in icon.paths {
        svg.push_str(r#"<path d=""#);
        svg.push_str(path.d);
        svg.push('"');
        let mut attr = |name: &str, value: &str| {
            if !value.is_empty() {
                svg.push_str(&format!(r#" {name}="{value}""#));
            }
        };
        attr(
            "fill",
            match path.fill {
                "" | "currentColor" => "#000",
                other => other,
            },
        );
        attr("fill-rule", path.fill_rule);
        attr("clip-rule", path.clip_rule);
        attr(
            "stroke",
            match path.stroke {
                "currentColor" => "#000",
                other => other,
            },
        );
        attr("stroke-linecap", path.stroke_linecap);
        attr("stroke-linejoin", path.stroke_linejoin);
        if path.stroke_width > 0.0 {
            svg.push_str(&format!(r#" stroke-width="{}""#, path.stroke_width));
        }
        svg.push_str("/>");
    }
    svg.push_str("</svg>");
    svg
}

/// An icon ready to paint through the monochrome SVG renderer.
#[derive(Clone)]
pub struct IconPaint {
    key: SharedString,
    svg: Arc<str>,
}

impl IconPaint {
    pub fn new(icon: &IconDef) -> Self {
        Self {
            key: SharedString::from(format!("playground-icon:{}", icon.name)),
            svg: Arc::from(icon_svg(icon)),
        }
    }

    /// Look a generated icon up by name; an unknown name paints nothing.
    pub fn named(name: &str) -> Self {
        static CACHE: OnceLock<RwLock<HashMap<&'static str, IconPaint>>> = OnceLock::new();
        let Some(icon) = icon_by_name(name) else {
            return Self {
                key: SharedString::from(format!("playground-icon:missing:{name}")),
                svg: Arc::from(""),
            };
        };
        let cache = CACHE.get_or_init(|| RwLock::new(HashMap::new()));
        if let Some(hit) = cache
            .read()
            .ok()
            .and_then(|map| map.get(icon.name).cloned())
        {
            return hit;
        }
        let paint = Self::new(icon);
        if let Ok(mut map) = cache.write() {
            map.insert(icon.name, paint.clone());
        }
        paint
    }

    /// Paint the icon into `bounds`, tinted with `color`.
    pub fn paint(&self, bounds: Bounds<Pixels>, color: Hsla, window: &mut Window, cx: &mut App) {
        if self.svg.is_empty() {
            return;
        }
        let _ = window.paint_svg(
            bounds,
            self.key.clone(),
            Some(self.svg.as_bytes()),
            TransformationMatrix::unit(),
            color,
            cx,
        );
    }

    /// Paint the icon into `bounds` turned clockwise by `turn` radians around its center.
    pub fn paint_rotated(
        &self,
        bounds: Bounds<Pixels>,
        color: Hsla,
        turn: f32,
        window: &mut Window,
        cx: &mut App,
    ) {
        if self.svg.is_empty() {
            return;
        }
        let scale = window.scale_factor();
        let center = bounds.center();
        let transformation = TransformationMatrix::unit()
            .translate(center.scale(scale))
            .rotate(ui::radians(turn))
            .translate(center.scale(-scale));
        let _ = window.paint_svg(
            bounds,
            self.key.clone(),
            Some(self.svg.as_bytes()),
            transformation,
            color,
            cx,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn css_colors_resolve_variables_fallbacks_and_hex() {
        let light = PlaygroundTheme::Light;
        let dark = PlaygroundTheme::Dark;

        assert_eq!(
            light.css_var("--affine-text-primary-color"),
            Some(hsla(LIGHT_THEME.text_primary))
        );
        assert_eq!(
            dark.css_color("var(--affine-multi-players-purple)"),
            dark.css_var("--affine-multi-players-purple")
        );
        assert!(dark.css_var("--affine-multi-players-purple").is_some());
        assert_eq!(
            light.css_color("var(--affine-not-a-token, #ff8a00)"),
            light.css_color("#ff8a00")
        );
        assert_eq!(light.css_color("#fff"), light.css_color("#ffffffff"));
        assert_eq!(light.css_color("#12"), None);
        assert_eq!(light.css_color("rebeccapurple"), None);
        assert_eq!(PlaygroundTheme::parse("dark"), Some(dark));
        assert_eq!(dark.toggled(), light);
        assert_eq!(light.palette().theme, light);
        assert_ne!(light.palette().background, dark.palette().background);
    }

    #[test]
    fn shadow_tokens_parse_into_outer_layers() {
        for theme in [PlaygroundTheme::Light, PlaygroundTheme::Dark] {
            let panel = theme.shadows("--affine-overlay-panel-shadow");
            assert_eq!(panel.len(), 2, "{theme:?}");
            assert_eq!(panel[0].offset, point(px(0.0), px(1.0)));
            assert_eq!(panel[0].blur_radius, px(6.0));
            assert_eq!(panel[1].offset, point(px(0.0), px(8.0)));
            assert_eq!(panel[1].blur_radius, px(14.0));
            assert!(
                panel
                    .iter()
                    .all(|layer| layer.color.a > 0.0 && !layer.inset)
            );

            // A hex color with alpha, and a list whose inset layer is dropped.
            let toolbar = theme.shadows("--affine-toolbar-shadow");
            assert_eq!(toolbar.len(), 1, "{theme:?}");
            assert_eq!(toolbar[0].offset, point(px(0.0), px(6.0)));
            assert!(toolbar[0].color.a > 0.0 && toolbar[0].color.a < 1.0);
            assert_eq!(theme.shadows("--affine-popover-shadow").len(), 2);
        }
        assert!(
            PlaygroundTheme::Light
                .shadows("--affine-not-a-shadow")
                .is_empty()
        );
        assert!(parse_box_shadows("unset").is_empty());
    }

    #[test]
    fn icons_serialize_to_parseable_monochrome_svg() {
        for name in [
            "CheckBoxCheckSolidIcon",
            "CheckBoxUnIcon",
            "ToggleDownIcon",
            "ToggleRightIcon",
            "LinkIcon",
            "LinkedPageIcon",
            "BoldIcon",
            "ItalicIcon",
            "UnderLineIcon",
            "StrikeThroughIcon",
            "CodeIcon",
            "CopyIcon",
            "DragCursorIcon",
            "TextIcon",
            "Heading1Icon",
            "Heading6Icon",
            "QuoteIcon",
            "DividerIcon",
            "BulletedListIcon",
            "NumberedListIcon",
            "CheckBoxCheckLinearIcon",
            "CodeBlockIcon",
        ] {
            let icon = icon_by_name(name).unwrap_or_else(|| panic!("icon {name} is generated"));
            let svg = icon_svg(icon);
            assert!(svg.starts_with("<svg "), "{svg}");
            assert!(svg.ends_with("</svg>"), "{svg}");
            assert_eq!(svg.matches("<path ").count(), icon.paths.len());
            assert!(!svg.contains("currentColor"), "{svg}");
        }
    }
}
