use crate::{
    AssetSource, DevicePixels, IsZero, RenderImage, Result, SharedString, Size,
    swap_rgba_pa_to_bgra,
};
use image::Frame;
use resvg::tiny_skia::Pixmap;
use smallvec::SmallVec;
use std::{
    hash::Hash,
    sync::{Arc, LazyLock, OnceLock},
};

#[cfg(any(target_os = "macos", target_os = "ios"))]
const EMOJI_FONT_FAMILIES: &[&str] = &["Apple Color Emoji", ".AppleColorEmojiUI"];

#[cfg(any(target_os = "linux", target_os = "android"))]
const EMOJI_FONT_FAMILIES: &[&str] = &[
    "Noto Color Emoji",
    "Emoji One",
    "Twitter Color Emoji",
    "JoyPixels",
];

#[cfg(target_family = "wasm")]
const EMOJI_FONT_FAMILIES: &[&str] = &[];

fn is_emoji_presentation(c: char) -> bool {
    static EMOJI_PRESENTATION_REGEX: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new("\\p{Emoji_Presentation}").unwrap());
    let mut buf = [0u8; 4];
    EMOJI_PRESENTATION_REGEX.is_match(c.encode_utf8(&mut buf))
}

fn font_has_char(db: &usvg::fontdb::Database, id: usvg::fontdb::ID, ch: char) -> bool {
    db.with_face_data(id, |font_data, face_index| {
        ttf_parser::Face::parse(font_data, face_index)
            .ok()
            .and_then(|face| face.glyph_index(ch))
            .is_some()
    })
    .unwrap_or(false)
}

fn select_emoji_font(
    ch: char,
    fonts: &[usvg::fontdb::ID],
    db: &usvg::fontdb::Database,
    families: &[&str],
) -> Option<usvg::fontdb::ID> {
    for family_name in families {
        let query = usvg::fontdb::Query {
            families: &[usvg::fontdb::Family::Name(family_name)],
            weight: usvg::fontdb::Weight(400),
            stretch: usvg::fontdb::Stretch::Normal,
            style: usvg::fontdb::Style::Normal,
        };

        let Some(id) = db.query(&query) else {
            continue;
        };

        if fonts.contains(&id) || !font_has_char(db, id, ch) {
            continue;
        }

        return Some(id);
    }

    None
}

/// When rendering SVGs, we render them at twice the size to get a higher-quality result.
pub const SMOOTH_SVG_SCALE_FACTOR: f32 = 2.;

#[derive(Clone, PartialEq, Hash, Eq)]
#[expect(missing_docs)]
pub struct RenderSvgParams {
    pub path: SharedString,
    pub size: Size<DevicePixels>,
}

#[derive(Clone)]
/// A struct holding everything necessary to render SVGs.
pub struct SvgRenderer {
    asset_source: Arc<dyn AssetSource>,
    usvg_options: Arc<usvg::Options<'static>>,
}

/// A parsed SVG document that can be rasterized at any scale.
///
/// Produced by [`SvgRenderer::parse_svg`] and rasterized by
/// [`SvgRenderer::render_parsed`]. Parsing resolves fonts and converts text
/// to paths, so callers that need to rasterize the same SVG at multiple
/// scales should retain this value to avoid re-paying the parse cost.
pub struct ParsedSvg(usvg::Tree);

/// The size in which to rasterize the SVG.
#[derive(Clone, Copy)]
pub enum SvgSize {
    /// A width in device pixels. The SVG retains its aspect ratio.
    Size(Size<DevicePixels>),
    /// An exact width and height in device pixels.
    ExactSize(Size<DevicePixels>),
    /// A logical scaling factor to apply to the size provided by the SVG.
    ScaleFactor(f32),
}

impl From<f32> for SvgSize {
    fn from(scale_factor: f32) -> Self {
        Self::ScaleFactor(scale_factor)
    }
}

impl SvgRenderer {
    /// Creates a new SVG renderer with the provided asset source.
    pub fn new(asset_source: Arc<dyn AssetSource>) -> Self {
        static SYSTEM_FONT_DB: LazyLock<Arc<usvg::fontdb::Database>> = LazyLock::new(|| {
            let mut db = usvg::fontdb::Database::new();
            db.load_system_fonts();
            Arc::new(db)
        });

        // Build the enriched font DB lazily on first SVG render rather than
        // eagerly at construction time. This avoids the expensive deep-clone
        // of the system font database for code paths that never render SVGs
        // (e.g. tests).
        let enriched_fontdb: Arc<OnceLock<Arc<usvg::fontdb::Database>>> = Arc::new(OnceLock::new());

        let default_font_resolver = usvg::FontResolver::default_font_selector();
        let font_resolver = Box::new({
            let asset_source = asset_source.clone();
            move |font: &usvg::Font, db: &mut Arc<usvg::fontdb::Database>| {
                if db.is_empty() {
                    let fontdb = enriched_fontdb.get_or_init(|| {
                        let mut db = (**SYSTEM_FONT_DB).clone();
                        load_bundled_fonts(&*asset_source, &mut db);
                        fix_generic_font_families(&mut db);
                        Arc::new(db)
                    });
                    *db = fontdb.clone();
                }
                if let Some(id) = default_font_resolver(font, db) {
                    return Some(id);
                }
                // fontdb doesn't recognize CSS system font keywords like "system-ui"
                // or "ui-sans-serif", so fall back to sans-serif before any face.
                let sans_query = usvg::fontdb::Query {
                    families: &[usvg::fontdb::Family::SansSerif],
                    ..Default::default()
                };
                db.query(&sans_query)
                    .or_else(|| db.faces().next().map(|f| f.id))
            }
        });
        let default_fallback_selection = usvg::FontResolver::default_fallback_selector();
        let fallback_selection = Box::new(
            move |ch: char, fonts: &[usvg::fontdb::ID], db: &mut Arc<usvg::fontdb::Database>| {
                if is_emoji_presentation(ch) {
                    if let Some(id) = select_emoji_font(ch, fonts, db.as_ref(), EMOJI_FONT_FAMILIES)
                    {
                        return Some(id);
                    }
                }

                default_fallback_selection(ch, fonts, db)
            },
        );
        let options = usvg::Options {
            font_resolver: usvg::FontResolver {
                select_font: font_resolver,
                select_fallback: fallback_selection,
            },
            ..Default::default()
        };
        Self {
            asset_source,
            usvg_options: Arc::new(options),
        }
    }

    /// Parses SVG data into a [`ParsedSvg`] that can be rasterized at any scale.
    pub fn parse_svg(&self, bytes: &[u8]) -> Result<ParsedSvg, usvg::Error> {
        usvg::Tree::from_data(bytes, &self.usvg_options).map(ParsedSvg)
    }

    /// Rasterizes a previously parsed SVG into an image buffer.
    pub fn render_parsed(
        &self,
        svg: &ParsedSvg,
        size: impl Into<SvgSize>,
    ) -> Result<Arc<RenderImage>, usvg::Error> {
        let (size, image_scale_factor) = match size.into() {
            SvgSize::Size(size) => (SvgSize::Size(size), 1.0),
            SvgSize::ExactSize(size) => (SvgSize::ExactSize(size), 1.0),
            SvgSize::ScaleFactor(scale_factor) => (
                SvgSize::ScaleFactor(scale_factor * SMOOTH_SVG_SCALE_FACTOR),
                SMOOTH_SVG_SCALE_FACTOR,
            ),
        };
        let pixmap = rasterize_tree(&svg.0, size)?;
        let mut buffer =
            image::ImageBuffer::from_raw(pixmap.width(), pixmap.height(), pixmap.take()).unwrap();

        for pixel in buffer.chunks_exact_mut(4) {
            swap_rgba_pa_to_bgra(pixel);
        }

        let mut image = RenderImage::new(SmallVec::from_const([Frame::new(buffer)]));
        image.scale_factor = image_scale_factor;
        Ok(Arc::new(image))
    }

    /// Renders the given bytes into an image buffer.
    pub fn render_single_frame(
        &self,
        bytes: &[u8],
        scale_factor: f32,
    ) -> Result<Arc<RenderImage>, usvg::Error> {
        let svg = self.parse_svg(bytes)?;
        self.render_parsed(&svg, scale_factor)
    }

    pub(crate) fn render_alpha_mask(
        &self,
        params: &RenderSvgParams,
        bytes: Option<&[u8]>,
    ) -> Result<Option<(Size<DevicePixels>, Vec<u8>)>> {
        anyhow::ensure!(!params.size.is_zero(), "can't render at a zero size");

        let render_pixmap = |bytes| {
            let pixmap = self.render_pixmap(bytes, SvgSize::Size(params.size))?;

            // Convert the pixmap's pixels into an alpha mask.
            let size = Size::new(
                DevicePixels(pixmap.width() as i32),
                DevicePixels(pixmap.height() as i32),
            );
            let alpha_mask = pixmap
                .pixels()
                .iter()
                .map(|p| p.alpha())
                .collect::<Vec<_>>();

            Ok(Some((size, alpha_mask)))
        };

        if let Some(bytes) = bytes {
            render_pixmap(bytes)
        } else if let Some(bytes) = self.asset_source.load(&params.path)? {
            render_pixmap(&bytes)
        } else {
            Ok(None)
        }
    }

    fn render_pixmap(&self, bytes: &[u8], size: SvgSize) -> Result<Pixmap, usvg::Error> {
        let tree = usvg::Tree::from_data(bytes, &self.usvg_options)?;
        rasterize_tree(&tree, size)
    }
}

fn rasterize_tree(tree: &usvg::Tree, size: SvgSize) -> Result<Pixmap, usvg::Error> {
    // Cap the size of the rendered pixmap to avoid texture allocation panics
    // Related issue: #56466
    const MAX_SIZE: f32 = 8192.0;

    let svg_size = tree.size();
    let (mut width, mut height) = match size {
        SvgSize::Size(size) => {
            let scale = i32::from(size.width) as f32 / svg_size.width();
            (svg_size.width() * scale, svg_size.height() * scale)
        }
        SvgSize::ExactSize(size) => (i32::from(size.width) as f32, i32::from(size.height) as f32),
        SvgSize::ScaleFactor(scale) => (svg_size.width() * scale, svg_size.height() * scale),
    };

    if width > MAX_SIZE {
        log::warn!("Attempted to render pixmap where width ({width}) > MAX_SIZE ({MAX_SIZE})");
    }
    if height > MAX_SIZE {
        log::warn!("Attempted to render pixmap where height ({height}) > MAX_SIZE ({MAX_SIZE})");
    }
    let scale = (MAX_SIZE / width).min(MAX_SIZE / height).min(1.0);
    width *= scale;
    height *= scale;

    // Render the SVG to a pixmap with the specified width and height.
    let mut pixmap = resvg::tiny_skia::Pixmap::new(width as u32, height as u32)
        .ok_or(usvg::Error::InvalidSize)?;

    let transform = resvg::tiny_skia::Transform::from_scale(
        width / svg_size.width(),
        height / svg_size.height(),
    );

    resvg::render(tree, transform, &mut pixmap.as_mut());

    Ok(pixmap)
}

fn load_bundled_fonts(asset_source: &dyn AssetSource, db: &mut usvg::fontdb::Database) {
    let font_paths = [
        "fonts/ibm-plex-sans/IBMPlexSans-Regular.ttf",
        "fonts/lilex/Lilex-Regular.ttf",
    ];
    for path in font_paths {
        match asset_source.load(path) {
            Ok(Some(data)) => db.load_font_data(data.into_owned()),
            Ok(None) => log::warn!("Bundled font not found: {path}"),
            Err(error) => log::warn!("Failed to load bundled font {path}: {error}"),
        }
    }
}

// fontdb defaults generic families to Microsoft fonts ("Arial", "Times New Roman")
// which aren't installed on most Linux systems. fontconfig normally overrides these,
// but when it fails the defaults remain and all generic family queries return None.
fn fix_generic_font_families(db: &mut usvg::fontdb::Database) {
    use usvg::fontdb::{Family, Query};

    let families_and_fallbacks: &[(Family<'_>, &str)] = &[
        (Family::SansSerif, "IBM Plex Sans"),
        // No serif font bundled; use sans-serif as best available fallback.
        (Family::Serif, "IBM Plex Sans"),
        (Family::Monospace, "Lilex"),
        (Family::Cursive, "IBM Plex Sans"),
        (Family::Fantasy, "IBM Plex Sans"),
    ];

    for (family, fallback_name) in families_and_fallbacks {
        let query = Query {
            families: &[*family],
            ..Default::default()
        };
        if db.query(&query).is_none() {
            match family {
                Family::SansSerif => db.set_sans_serif_family(*fallback_name),
                Family::Serif => db.set_serif_family(*fallback_name),
                Family::Monospace => db.set_monospace_family(*fallback_name),
                Family::Cursive => db.set_cursive_family(*fallback_name),
                Family::Fantasy => db.set_fantasy_family(*fallback_name),
                _ => {}
            }
        }
    }
}
