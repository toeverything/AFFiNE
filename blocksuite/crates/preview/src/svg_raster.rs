#[cfg(feature = "svg-raster")]
use std::sync::Arc;
#[cfg(feature = "svg-text")]
use std::sync::OnceLock;

#[cfg(feature = "svg-raster")]
use resvg::tiny_skia::{Pixmap, Transform};
use sha2::{Digest, Sha256};

#[cfg(feature = "svg-raster")]
use crate::error::PreviewError;
#[cfg(feature = "svg-raster")]
use crate::font_pool::FontPool;

/// Default maximum raster edge in physical pixels to bound memory usage.
pub const DEFAULT_MAX_EDGE_PX: u32 = 4096;

/// Compact RGBA8 pixel buffer produced by SVG or PDF rasterization.
#[derive(Debug, Clone, PartialEq)]
pub struct RgbaImageBuffer {
    /// Physical pixel width.
    pub width_px: u32,
    /// Physical pixel height.
    pub height_px: u32,
    /// Logical width in CSS pixels or points.
    pub logical_width: f32,
    /// Logical height in CSS pixels or points.
    pub logical_height: f32,
    /// Tightly packed `tiny-skia` premultiplied RGBA8 pixel bytes (`width_px * height_px * 4`,
    /// where `R, G, B <= A` for every pixel).
    pub pixels: Vec<u8>,
}

impl RgbaImageBuffer {
    /// Returns the total byte size of the pixel buffer.
    pub fn byte_len(&self) -> usize {
        self.pixels.len()
    }

    /// Composites this premultiplied RGBA8 buffer over an opaque sRGB background
    /// using source-over blending, returning tightly packed RGB8 bytes (`width_px * height_px * 3`).
    pub fn composite_over_rgb(&self, bg: [u8; 3]) -> Vec<u8> {
        let mut out = Vec::with_capacity((self.pixels.len() / 4) * 3);
        for px in self.pixels.chunks_exact(4) {
            let inv_a = 255_u32.saturating_sub(u32::from(px[3]));
            for c in 0..3 {
                let v = u32::from(px[c]) + (inv_a * u32::from(bg[c]) + 127) / 255;
                out.push(v.min(255) as u8);
            }
        }
        out
    }

    /// Composites this premultiplied RGBA8 buffer over an opaque sRGB background
    /// and encodes the resulting opaque image as PNG bytes.
    #[cfg(feature = "svg-raster")]
    pub fn encode_png_over_rgb(&self, bg: [u8; 3]) -> Result<Vec<u8>, PreviewError> {
        let rgb = self.composite_over_rgb(bg);
        let mut rgba = Vec::with_capacity(self.pixels.len());
        for px in rgb.chunks_exact(3) {
            rgba.extend_from_slice(&[px[0], px[1], px[2], 255]);
        }
        let size = resvg::tiny_skia::IntSize::from_wh(self.width_px, self.height_px)
            .ok_or_else(|| PreviewError::InvalidSize("invalid image dimensions for PNG".into()))?;
        let pixmap = Pixmap::from_vec(rgba, size)
            .ok_or_else(|| PreviewError::InvalidSize("failed to build pixmap for PNG".into()))?;
        pixmap
            .encode_png()
            .map_err(|err| PreviewError::InvalidSize(format!("PNG encode failed: {err}")))
    }

    /// Computes a deterministic SHA-256 digest over dimensions and pixel bytes.
    pub fn sha256(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(self.width_px.to_le_bytes());
        hasher.update(self.height_px.to_le_bytes());
        hasher.update(&self.pixels);
        hasher.finalize().into()
    }

    /// Formats the deterministic SHA-256 digest as lowercase hexadecimal.
    pub fn sha256_hex(&self) -> String {
        let digest = self.sha256();
        let mut out = String::with_capacity(64);
        for byte in digest {
            use std::fmt::Write;
            let _ = write!(&mut out, "{byte:02x}");
        }
        out
    }

    /// Counts pixels that differ from the given RGBA color by more than `tolerance`.
    pub fn count_ink_pixels(&self, background: [u8; 4], tolerance: u8) -> usize {
        self.pixels
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|px| {
                px[0].abs_diff(background[0]) > tolerance
                    || px[1].abs_diff(background[1]) > tolerance
                    || px[2].abs_diff(background[2]) > tolerance
                    || px[3].abs_diff(background[3]) > tolerance
            })
            .count()
    }

    /// Counts non-transparent pixels (`alpha > 0`).
    pub fn count_non_transparent_pixels(&self) -> usize {
        self.pixels
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|px| px[3] > 0)
            .count()
    }
}

/// Target sizing options for SVG rasterization.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RasterOptions {
    /// Device scale factor applied to logical dimensions (for example `2.0`).
    pub scale_factor: f32,
    /// Optional logical width override. When set without height, aspect ratio is preserved.
    pub target_logical_width: Option<f32>,
    /// Optional logical height override. When set without width, aspect ratio is preserved.
    pub target_logical_height: Option<f32>,
    /// Maximum allowed physical width or height in pixels.
    pub max_edge_px: u32,
    /// When `false` (default) and compiled with `svg-text`, missing glyphs in SVG `<text>`
    /// elements fail with [`PreviewError::MissingGlyphFont`] so hosts can fetch script fonts on
    /// demand. When `true`, rasterization proceeds best-effort even if some glyphs are uncovered.
    /// Without `svg-text` (path-only `svg-raster` builds), SVG `<text>` elements are rejected with
    /// [`PreviewError::SvgParse`].
    pub allow_missing_glyphs: bool,
}

impl Default for RasterOptions {
    fn default() -> Self {
        Self {
            scale_factor: 2.0,
            target_logical_width: None,
            target_logical_height: None,
            max_edge_px: DEFAULT_MAX_EDGE_PX,
            allow_missing_glyphs: false,
        }
    }
}

impl RasterOptions {
    /// Creates raster options with the given scale factor and default limits.
    pub fn with_scale(scale_factor: f32) -> Self {
        Self {
            scale_factor,
            ..Self::default()
        }
    }
}

/// Pure-Rust deterministic SVG rasterizer backed by `usvg` and `resvg`.
///
/// Uses only fonts explicitly registered in its [`FontPool`] and blocks all
/// external filesystem or URL `<image href="...">` resolution.
#[cfg(feature = "svg-raster")]
#[derive(Clone)]
pub struct SvgRasterizer {
    options: Arc<usvg::Options<'static>>,
    font_pool: FontPool,
}

#[cfg(feature = "svg-raster")]
impl SvgRasterizer {
    /// Builds a rasterizer bound to the given explicit [`FontPool`].
    pub fn new(font_pool: &FontPool) -> Self {
        // Allow inline `data:` images only; block all host filesystem paths and URLs
        // regardless of whether `svg-text` / `resvg/raster-images` are enabled.
        let image_href_resolver = usvg::ImageHrefResolver {
            resolve_data: usvg::ImageHrefResolver::default_data_resolver(),
            resolve_string: Box::new(|_, _| None),
        };

        #[cfg(feature = "svg-text")]
        let usvg_options = {
            let fontdb = font_pool.database();
            let default_selector = usvg::FontResolver::default_font_selector();
            let default_fallback = usvg::FontResolver::default_fallback_selector();

            let select_font = Box::new(
                move |font: &usvg::Font, db: &mut Arc<usvg::fontdb::Database>| {
                    if let Some(id) = default_selector(font, db) {
                        return Some(id);
                    }
                    let sans_query = usvg::fontdb::Query {
                        families: &[usvg::fontdb::Family::SansSerif],
                        ..Default::default()
                    };
                    db.query(&sans_query)
                        .or_else(|| db.faces().next().map(|face| face.id))
                },
            );

            let select_fallback = Box::new(
                move |ch: char,
                      fonts: &[usvg::fontdb::ID],
                      db: &mut Arc<usvg::fontdb::Database>| {
                    default_fallback(ch, fonts, db)
                },
            );

            let mut usvg_options = usvg::Options {
                fontdb,
                font_resolver: usvg::FontResolver {
                    select_font,
                    select_fallback,
                },
                image_href_resolver,
                ..Default::default()
            };
            if let Some(sans) = font_pool.sans_serif_family() {
                usvg_options.font_family = sans.to_string();
            }
            usvg_options
        };
        #[cfg(not(feature = "svg-text"))]
        let usvg_options = usvg::Options {
            image_href_resolver,
            ..Default::default()
        };

        Self {
            options: Arc::new(usvg_options),
            font_pool: font_pool.clone(),
        }
    }

    /// Returns the explicit [`FontPool`] bound to this rasterizer.
    pub fn font_pool(&self) -> &FontPool {
        &self.font_pool
    }

    /// Rasterizes an SVG string at the given scale factor.
    pub fn rasterize(&self, svg: &str, scale_factor: f32) -> Result<RgbaImageBuffer, PreviewError> {
        self.rasterize_with_options(svg, RasterOptions::with_scale(scale_factor))
    }

    /// Rasterizes an SVG string with explicit sizing and scale options.
    pub fn rasterize_with_options(
        &self,
        svg: &str,
        options: RasterOptions,
    ) -> Result<RgbaImageBuffer, PreviewError> {
        if svg.trim().is_empty() {
            return Err(PreviewError::EmptyInput);
        }
        if !options.scale_factor.is_finite() || options.scale_factor <= 0.0 {
            return Err(PreviewError::InvalidSize(format!(
                "scale_factor must be positive and finite, got {}",
                options.scale_factor
            )));
        }
        if options.max_edge_px == 0 {
            return Err(PreviewError::InvalidSize(
                "max_edge_px must be greater than zero".to_string(),
            ));
        }

        #[cfg(not(feature = "svg-text"))]
        let tree = {
            let xml_opt = usvg::roxmltree::ParsingOptions {
                allow_dtd: true,
                ..Default::default()
            };
            let xml_doc =
                usvg::roxmltree::Document::parse_with_options(svg, xml_opt).map_err(|err| {
                    PreviewError::SvgParse(usvg::Error::ParsingFailed(err).to_string())
                })?;
            if xml_contains_svg_text_element(xml_doc.root()) {
                return Err(PreviewError::SvgParse(
                    "SVG <text> requires the `svg-text` feature".to_string(),
                ));
            }
            usvg::Tree::from_xmltree(&xml_doc, &self.options)
                .map_err(|err| PreviewError::SvgParse(err.to_string()))?
        };
        #[cfg(feature = "svg-text")]
        let tree = usvg::Tree::from_str(svg, &self.options)
            .map_err(|err| PreviewError::SvgParse(err.to_string()))?;
        #[cfg(feature = "svg-text")]
        if !options.allow_missing_glyphs {
            // Collect uncovered codepoints across both the actual render tree and the synthetic
            // non-empty `.notdef` probe tree in one shared deduplicated pass so neither glyphs
            // kept only by real font metrics (e.g. negative-`startOffset` `<textPath>`) nor `<text>`
            // elements dropped by outline-less `.notdef` subset fonts omit missing codepoints.
            let probe = usvg::Tree::from_str(svg, glyph_probe_options())
                .map_err(|err| PreviewError::SvgParse(err.to_string()))?;
            verify_trees_text_glyph_coverage(&[&tree, &probe], &self.font_pool)?;
        }

        rasterize_tree(&tree, options)
    }
}

#[cfg(feature = "svg-raster")]
fn rasterize_tree(
    tree: &usvg::Tree,
    options: RasterOptions,
) -> Result<RgbaImageBuffer, PreviewError> {
    let svg_size = tree.size();
    let src_w = svg_size.width();
    let src_h = svg_size.height();
    if !src_w.is_finite() || !src_h.is_finite() || src_w <= 0.0 || src_h <= 0.0 {
        return Err(PreviewError::InvalidSize(format!(
            "svg intrinsic size is invalid: {src_w}x{src_h}"
        )));
    }

    let (logical_width, logical_height) =
        match (options.target_logical_width, options.target_logical_height) {
            (Some(w), Some(h)) => (w, h),
            (Some(w), None) => (w, src_h * (w / src_w)),
            (None, Some(h)) => (src_w * (h / src_h), h),
            (None, None) => (src_w, src_h),
        };

    if !logical_width.is_finite()
        || !logical_height.is_finite()
        || logical_width <= 0.0
        || logical_height <= 0.0
    {
        return Err(PreviewError::InvalidSize(format!(
            "logical size must be positive and finite: {logical_width}x{logical_height}"
        )));
    }

    let raw_w = (logical_width * options.scale_factor).max(1.0);
    let raw_h = (logical_height * options.scale_factor).max(1.0);
    let max_edge = options.max_edge_px as f32;
    let clamp = (max_edge / raw_w).min(max_edge / raw_h).min(1.0);
    let width_px = (raw_w * clamp).round().max(1.0) as u32;
    let height_px = (raw_h * clamp).round().max(1.0) as u32;

    let mut pixmap = Pixmap::new(width_px, height_px).ok_or_else(|| {
        PreviewError::InvalidSize(format!(
            "failed to allocate pixmap of size {width_px}x{height_px}"
        ))
    })?;

    let scale_x = width_px as f32 / src_w;
    let scale_y = height_px as f32 / src_h;
    let transform = Transform::from_scale(scale_x, scale_y);
    resvg::render(tree, transform, &mut pixmap.as_mut());

    Ok(RgbaImageBuffer {
        width_px,
        height_px,
        logical_width,
        logical_height,
        pixels: pixmap.take(),
    })
}

#[cfg(feature = "svg-text")]
fn verify_trees_text_glyph_coverage(
    trees: &[&usvg::Tree],
    font_pool: &FontPool,
) -> Result<(), PreviewError> {
    let mut missing: Vec<char> = Vec::new();
    for tree in trees {
        walk_usvg_root_group(tree.root(), font_pool, &mut missing);
    }

    if !missing.is_empty() {
        let list = missing
            .iter()
            .map(|&ch| format!("U+{:04X} ('{ch}')", ch as u32))
            .collect::<Vec<_>>()
            .join(", ");
        let detail = if font_pool.is_empty() {
            format!("SVG <text> requires glyphs [{list}] but FontPool has no registered fonts")
        } else {
            format!("SVG <text> contains uncovered glyphs [{list}] not present in FontPool")
        };
        return Err(PreviewError::MissingGlyphFont(detail));
    }

    Ok(())
}

#[cfg(feature = "svg-text")]
fn walk_usvg_root_group(group: &usvg::Group, font_pool: &FontPool, missing: &mut Vec<char>) {
    if let Some(clip) = group.clip_path() {
        walk_usvg_root_group(clip.root(), font_pool, missing);
    }
    if let Some(mask) = group.mask() {
        walk_usvg_root_group(mask.root(), font_pool, missing);
    }
    walk_usvg_children(group, font_pool, missing);
}

#[cfg(feature = "svg-text")]
fn walk_usvg_children(group: &usvg::Group, font_pool: &FontPool, missing: &mut Vec<char>) {
    for node in group.children() {
        match node {
            usvg::Node::Group(child_group) => {
                node.subroots(|subroot| walk_usvg_root_group(subroot, font_pool, missing));
                walk_usvg_children(child_group, font_pool, missing);
            }
            usvg::Node::Path(path) => {
                if !path.is_visible() {
                    continue;
                }
                if path.data().bounds().width() > 0.0
                    && path.data().bounds().height() > 0.0
                    && let Some(usvg::Paint::Pattern(pattern)) = path.fill().map(|f| f.paint())
                {
                    walk_usvg_root_group(pattern.root(), font_pool, missing);
                }
                if let Some(usvg::Paint::Pattern(pattern)) = path.stroke().map(|s| s.paint()) {
                    walk_usvg_root_group(pattern.root(), font_pool, missing);
                }
            }
            usvg::Node::Image(image) => {
                if !image.is_visible() {
                    continue;
                }
                node.subroots(|subroot| walk_usvg_root_group(subroot, font_pool, missing));
            }
            usvg::Node::Text(text) => {
                walk_usvg_root_group(text.flattened(), font_pool, missing);
                for chunk in text.chunks() {
                    let chunk_text = chunk.text();
                    for span in chunk.spans() {
                        if !span.is_visible() {
                            continue;
                        }
                        if let Some(slice) = chunk_text.get(span.start()..span.end()) {
                            for ch in slice.chars() {
                                if !is_ignorable_for_glyph_check(ch)
                                    && !font_pool.has_glyph(ch)
                                    && !missing.contains(&ch)
                                {
                                    missing.push(ch);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Returns a `usvg::Options` with a minimal 1-glyph synthetic `.notdef` font so `usvg`
/// preserves reachable `Node::Text` elements (expanding `<use>`/`<tref>` while pruning
/// unreferenced `<defs>`) even when [`FontPool`] is empty or its selected face has an
/// outline-less `.notdef` glyph.
#[cfg(feature = "svg-text")]
fn glyph_probe_options() -> &'static usvg::Options<'static> {
    static PROBE_OPTS: OnceLock<usvg::Options<'static>> = OnceLock::new();
    PROBE_OPTS.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        db.load_font_data(build_minimal_probe_ttf());
        debug_assert!(
            db.faces().next().is_some(),
            "synthetic probe TTF must register one face in fontdb"
        );
        db.set_sans_serif_family("Probe");
        let fontdb = Arc::new(db);
        let select_font = Box::new(
            move |_font: &usvg::Font, db: &mut Arc<usvg::fontdb::Database>| {
                db.faces().next().map(|face| face.id)
            },
        );
        let select_fallback = Box::new(
            move |_ch: char, _fonts: &[usvg::fontdb::ID], _db: &mut Arc<usvg::fontdb::Database>| {
                None
            },
        );
        usvg::Options {
            fontdb,
            font_family: "Probe".to_string(),
            font_resolver: usvg::FontResolver {
                select_font,
                select_fallback,
            },
            image_href_resolver: usvg::ImageHrefResolver {
                resolve_data: usvg::ImageHrefResolver::default_data_resolver(),
                resolve_string: Box::new(|_, _| None),
            },
            ..Default::default()
        }
    })
}

#[cfg(feature = "svg-text")]
fn build_minimal_probe_ttf() -> Vec<u8> {
    let mut head = vec![0u8; 54];
    head[0..4].copy_from_slice(&0x0001_0000_u32.to_be_bytes());
    head[4..8].copy_from_slice(&0x0001_0000_u32.to_be_bytes());
    head[12..16].copy_from_slice(&0x5F0F_3CF5_u32.to_be_bytes());
    head[18..20].copy_from_slice(&1000_u16.to_be_bytes());
    head[50..52].copy_from_slice(&1_i16.to_be_bytes());

    let mut hhea = vec![0u8; 36];
    hhea[0..4].copy_from_slice(&0x0001_0000_u32.to_be_bytes());
    hhea[4..6].copy_from_slice(&800_i16.to_be_bytes());
    hhea[6..8].copy_from_slice(&(-200_i16).to_be_bytes());
    hhea[34..36].copy_from_slice(&1_u16.to_be_bytes());

    let mut maxp = vec![0u8; 32];
    maxp[0..4].copy_from_slice(&0x0001_0000_u32.to_be_bytes());
    maxp[4..6].copy_from_slice(&1_u16.to_be_bytes());
    maxp[6..8].copy_from_slice(&4_u16.to_be_bytes());
    maxp[8..10].copy_from_slice(&1_u16.to_be_bytes());

    let mut os2 = vec![0u8; 78];
    os2[0..2].copy_from_slice(&1_u16.to_be_bytes());
    os2[4..6].copy_from_slice(&400_u16.to_be_bytes());
    os2[6..8].copy_from_slice(&5_u16.to_be_bytes());
    os2[62..64].copy_from_slice(&0x0040_u16.to_be_bytes());
    os2[68..70].copy_from_slice(&800_i16.to_be_bytes());
    os2[70..72].copy_from_slice(&(-200_i16).to_be_bytes());

    let records = [
        (1_u16, "Probe"),
        (2_u16, "Regular"),
        (4_u16, "Probe Regular"),
        (6_u16, "Probe-Regular"),
    ];
    let mut storage = Vec::new();
    let mut entries = Vec::new();
    for (name_id, text) in records {
        let utf16: Vec<u8> = text.encode_utf16().flat_map(u16::to_be_bytes).collect();
        entries.push((name_id, utf16.len() as u16, storage.len() as u16));
        storage.extend_from_slice(&utf16);
    }
    let count = entries.len() as u16;
    let mut name = Vec::new();
    name.extend_from_slice(&0_u16.to_be_bytes());
    name.extend_from_slice(&count.to_be_bytes());
    name.extend_from_slice(&(6 + count * 12).to_be_bytes());
    for (name_id, len, off) in entries {
        name.extend_from_slice(&3_u16.to_be_bytes());
        name.extend_from_slice(&1_u16.to_be_bytes());
        name.extend_from_slice(&0x0409_u16.to_be_bytes());
        name.extend_from_slice(&name_id.to_be_bytes());
        name.extend_from_slice(&len.to_be_bytes());
        name.extend_from_slice(&off.to_be_bytes());
    }
    name.extend_from_slice(&storage);

    let mut post = vec![0u8; 32];
    post[0..4].copy_from_slice(&0x0003_0000_u32.to_be_bytes());

    // Minimal cmap format 4 with only the 0xFFFF sentinel segment.
    let cmap: Vec<u8> = [
        0_u16, 1, 3, 1, 0, 12, // header + 1 encoding record (offset 12)
        4, 24, 0, 2, 2, 0, 0, // format 4 subtable (len 24, segCountX2=2)
        0xFFFF, 0, 0xFFFF, 1, 0, // sentinel end/pad/start/delta/offset
    ]
    .into_iter()
    .flat_map(u16::to_be_bytes)
    .collect();

    let hmtx = [500_u16, 0_u16]
        .into_iter()
        .flat_map(u16::to_be_bytes)
        .collect::<Vec<_>>();
    // Glyph 0 (.notdef): 4-point rectangle so usvg never elides reachable Node::Text as empty.
    let mut glyf = Vec::with_capacity(36);
    for v in [1_i16, 50, 0, 450, 700, 3, 0] {
        glyf.extend_from_slice(&v.to_be_bytes());
    }
    glyf.extend_from_slice(&[0x01, 0x01, 0x01, 0x01]);
    for d in [50_i16, 400, 0, -400, 0, 0, 700, 0] {
        glyf.extend_from_slice(&d.to_be_bytes());
    }
    while !glyf.len().is_multiple_of(4) {
        glyf.push(0);
    }
    let mut loca = Vec::with_capacity(8);
    loca.extend_from_slice(&0_u32.to_be_bytes());
    loca.extend_from_slice(&(glyf.len() as u32).to_be_bytes());

    let mut tables: Vec<([u8; 4], Vec<u8>)> = vec![
        (*b"OS/2", os2),
        (*b"cmap", cmap),
        (*b"glyf", glyf),
        (*b"head", head),
        (*b"hhea", hhea),
        (*b"hmtx", hmtx),
        (*b"loca", loca),
        (*b"maxp", maxp),
        (*b"name", name),
        (*b"post", post),
    ];
    tables.sort_by_key(|(tag, _)| *tag);

    let num_tables = tables.len() as u16;
    let mut out = Vec::new();
    out.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    out.extend_from_slice(&num_tables.to_be_bytes());
    out.extend_from_slice(&128_u16.to_be_bytes());
    out.extend_from_slice(&3_u16.to_be_bytes());
    out.extend_from_slice(&((num_tables * 16).saturating_sub(128)).to_be_bytes());

    let mut offset = 12 + tables.len() * 16;
    for (tag, data) in &tables {
        let checksum = data.chunks(4).fold(0u32, |acc, chunk| {
            let mut buf = [0u8; 4];
            buf[..chunk.len()].copy_from_slice(chunk);
            acc.wrapping_add(u32::from_be_bytes(buf))
        });
        out.extend_from_slice(tag);
        out.extend_from_slice(&checksum.to_be_bytes());
        out.extend_from_slice(&(offset as u32).to_be_bytes());
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        offset += (data.len() + 3) & !3;
    }
    for (_, data) in &tables {
        out.extend_from_slice(data);
        while !out.len().is_multiple_of(4) {
            out.push(0);
        }
    }
    out
}

/// Walks parsed XML elements (matching `usvg`'s SVG namespace and container rules) and returns
/// `true` when any SVG `<text>` element (`http://www.w3.org/2000/svg` or unqualified) is present,
/// ignoring XML comments, CDATA, foreign namespaces, and non-rendered metadata/style subtrees.
#[cfg(all(feature = "svg-raster", not(feature = "svg-text")))]
fn xml_contains_svg_text_element(root: usvg::roxmltree::Node<'_, '_>) -> bool {
    let mut stack = vec![root];
    while let Some(node) = stack.pop() {
        for child in node.children() {
            if !child.is_element() {
                continue;
            }
            let tag = child.tag_name();
            if !matches!(tag.namespace(), None | Some("http://www.w3.org/2000/svg")) {
                continue;
            }
            match tag.name() {
                "text" => return true,
                "metadata" | "title" | "desc" | "style" | "script" | "foreignObject" => {}
                _ => stack.push(child),
            }
        }
    }
    false
}

/// Returns true for whitespace, control characters, and Unicode `Default_Ignorable_Code_Point`
/// scalars (including variation selectors such as `U+FE0F`, joiners, and bidi/tag formatters)
/// that render invisibly and do not require font glyph coverage.
#[cfg(feature = "svg-text")]
pub(crate) fn is_ignorable_for_glyph_check(ch: char) -> bool {
    if ch.is_whitespace() || ch.is_control() {
        return true;
    }
    matches!(
        ch,
        '\u{00AD}'
            | '\u{034F}'
            | '\u{061C}'
            | '\u{115F}'..='\u{1160}'
            | '\u{17B4}'..='\u{17B5}'
            | '\u{180B}'..='\u{180F}'
            | '\u{200B}'..='\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{206F}'
            | '\u{3164}'
            | '\u{FE00}'..='\u{FE0F}'
            | '\u{FEFF}'
            | '\u{FFA0}'
            | '\u{FFF0}'..='\u{FFF8}'
            | '\u{E0000}'..='\u{E0FFF}'
    )
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "svg-raster")]
    use super::*;

    #[cfg(feature = "svg-raster")]
    #[test]
    fn rasterizes_vector_svg_deterministically_at_multiple_scales() {
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20">
            <rect x="2" y="2" width="36" height="16" fill="#1e66f5"/>
        </svg>"##;

        let rasterizer = SvgRasterizer::new(&FontPool::new());
        let cases = [(1.0_f32, 40_u32, 20_u32), (2.0_f32, 80_u32, 40_u32)];
        for (scale, expected_w, expected_h) in cases {
            let first = rasterizer.rasterize(svg, scale).unwrap();
            let second = rasterizer.rasterize(svg, scale).unwrap();
            assert_eq!(first.width_px, expected_w);
            assert_eq!(first.height_px, expected_h);
            assert_eq!(first.byte_len(), (expected_w * expected_h * 4) as usize);
            assert!(first.count_non_transparent_pixels() > 0);
            assert_eq!(first.sha256(), second.sha256());
        }
    }

    #[cfg(feature = "svg-raster")]
    #[test]
    fn clamps_oversized_raster_target_to_max_edge() {
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500" viewBox="0 0 1000 500">
            <rect width="1000" height="500" fill="#000000"/>
        </svg>"##;

        let rasterizer = SvgRasterizer::new(&FontPool::new());
        let opts = RasterOptions {
            scale_factor: 2.0,
            target_logical_width: None,
            target_logical_height: None,
            max_edge_px: 256,
            allow_missing_glyphs: false,
        };
        let buf = rasterizer.rasterize_with_options(svg, opts).unwrap();
        assert_eq!(buf.width_px, 256);
        assert_eq!(buf.height_px, 128);
    }

    #[cfg(feature = "svg-raster")]
    #[test]
    fn rejects_empty_svg_and_non_positive_scale() {
        let rasterizer = SvgRasterizer::new(&FontPool::new());
        assert!(matches!(
            rasterizer.rasterize("   ", 2.0),
            Err(PreviewError::EmptyInput)
        ));
        let valid = r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>"#;
        assert!(matches!(
            rasterizer.rasterize(valid, 0.0),
            Err(PreviewError::InvalidSize(_))
        ));
        assert!(matches!(
            rasterizer.rasterize(valid, f32::NAN),
            Err(PreviewError::InvalidSize(_))
        ));

        let text_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text x="2" y="14">Hi</text></svg>"#;
        let prefixed_text_svg = r#"<s:svg xmlns:s="http://www.w3.org/2000/svg" width="40" height="20"><s:text x="2" y="14">Hi</s:text></s:svg>"#;
        let mixed_prefixed_text_svg = r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg" width="40" height="20"><s:text x="2" y="14">Hi</s:text></svg>"#;
        for candidate in [text_svg, prefixed_text_svg, mixed_prefixed_text_svg] {
            #[cfg(feature = "svg-text")]
            assert!(matches!(
                rasterizer.rasterize(candidate, 1.0),
                Err(PreviewError::MissingGlyphFont(_))
            ));
            #[cfg(not(feature = "svg-text"))]
            match rasterizer.rasterize(candidate, 1.0) {
                Err(PreviewError::SvgParse(msg)) => assert!(msg.contains("svg-text"), "{msg}"),
                other => panic!("expected SvgParse requiring svg-text, got {other:?}"),
            }
        }

        // Path-only SVG with `<text> legend` inside an XML comment and foreign-namespace metadata
        // has 0 SVG text elements and must rasterize cleanly regardless of `svg-text`.
        let commented_path_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20">
            <!-- <text> legend -->
            <metadata><x:text xmlns:x="urn:meta">legend</x:text></metadata>
            <path d="M2 2 H38 V18 H2 Z" fill="#1e66f5"/>
        </svg>"##;
        let rendered = rasterizer.rasterize(commented_path_svg, 1.0).unwrap();
        assert!(rendered.count_non_transparent_pixels() > 0);
    }

    #[cfg(feature = "svg-raster")]
    #[test]
    fn blocks_external_filesystem_image_href_resolution() {
        // Verify both raster PNG and external vector `.svg` local file paths are blocked
        // even when `svg-text` / `resvg/raster-images` are disabled (`math` configuration).
        const ONE_BY_ONE_RED_PNG: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
            0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
            0xB0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        const LOCAL_RED_SVG: &[u8] = br##"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ff0000"/></svg>"##;
        static TMP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let seq = TMP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let tmp_png = std::env::temp_dir().join(format!(
            "blocksuite_preview_blocked_href_{}_{seq}.png",
            std::process::id()
        ));
        let tmp_svg = std::env::temp_dir().join(format!(
            "blocksuite_preview_blocked_href_{}_{seq}.svg",
            std::process::id()
        ));
        std::fs::write(&tmp_png, ONE_BY_ONE_RED_PNG).expect("write temp png");
        std::fs::write(&tmp_svg, LOCAL_RED_SVG).expect("write temp svg");

        let rasterizer = SvgRasterizer::new(&FontPool::new());
        for (existing, missing) in [
            (
                tmp_png.display().to_string(),
                "/nonexistent/preview_blocked.png",
            ),
            (
                tmp_svg.display().to_string(),
                "/nonexistent/preview_blocked.svg",
            ),
        ] {
            let svg_existing = format!(
                r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><image href="{existing}" width="16" height="16"/></svg>"#
            );
            let svg_missing = format!(
                r#"<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><image href="{missing}" width="16" height="16"/></svg>"#
            );
            let with_file = rasterizer.rasterize(&svg_existing, 1.0).unwrap();
            let without_file = rasterizer.rasterize(&svg_missing, 1.0).unwrap();
            assert_eq!(with_file.sha256(), without_file.sha256());
            assert_eq!(with_file.count_non_transparent_pixels(), 0);
        }
        let _ = std::fs::remove_file(&tmp_png);
        let _ = std::fs::remove_file(&tmp_svg);
    }

    #[cfg(all(feature = "svg-text", feature = "typst"))]
    #[test]
    fn non_empty_latin_font_pool_signals_missing_cjk_glyph_until_cjk_font_registered() {
        let mut pool = FontPool::new();
        let latin = typst_assets::fonts().next().expect("typst bundled font");
        pool.register_font_bytes(latin.to_vec()).unwrap();

        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"><text x="4" y="20">中文 Done</text></svg>"#;
        let latin_only = SvgRasterizer::new(&pool);
        assert!(matches!(
            latin_only.rasterize(svg, 2.0),
            Err(PreviewError::MissingGlyphFont(_))
        ));

        pool.register_font_bytes(crate::test_support::build_test_cjk_ttf())
            .unwrap();
        let with_cjk = SvgRasterizer::new(&pool);
        let img = with_cjk.rasterize(svg, 2.0).unwrap();
        assert!(img.count_non_transparent_pixels() > 0);
    }

    #[cfg(all(feature = "svg-text", feature = "typst"))]
    #[test]
    fn xml_tree_glyph_check_handles_cdata_comments_dedup_and_lenient_mode() {
        let mut pool = FontPool::new();
        let latin = typst_assets::fonts().next().expect("typst bundled font");
        pool.register_font_bytes(latin.to_vec()).unwrap();
        let rasterizer = SvgRasterizer::new(&pool);

        // (a) Direct CJK text fails with deduplicated missing codepoints.
        let direct = r#"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><text x="2" y="16">中文中</text></svg>"#;
        let err = rasterizer.rasterize(direct, 1.0).unwrap_err();
        let msg = err.to_string();
        assert!(matches!(err, PreviewError::MissingGlyphFont(_)));
        assert!(msg.contains("U+4E2D") && msg.contains("U+6587"));
        assert_eq!(msg.matches("U+4E2D").count(), 1);

        // (b) CDATA inside <text> must also be checked and rejected.
        let cdata = r#"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><text x="2" y="16"><![CDATA[中]]></text></svg>"#;
        assert!(matches!(
            rasterizer.rasterize(cdata, 1.0),
            Err(PreviewError::MissingGlyphFont(_))
        ));

        // (c) XML comments, <metadata> foreign namespaces, and <title>/<desc> inside <text> are ignored.
        let commented = r#"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><!-- <text>中文</text> --><metadata><x:text xmlns:x="urn:meta">中文</x:text></metadata><text x="2" y="16"><title>中文说明</title><desc>不绘制</desc>A</text></svg>"#;
        assert!(rasterizer.rasterize(commented, 1.0).is_ok());

        // (d) Nested <tspan> with CDATA inside <text> must still report MissingGlyphFont.
        let nested_tspan = r#"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><text x="2" y="16"><tspan><![CDATA[中]]></tspan></text></svg>"#;
        assert!(matches!(
            rasterizer.rasterize(nested_tspan, 1.0),
            Err(PreviewError::MissingGlyphFont(_))
        ));

        // (e) Unreferenced <defs><text> is not rendered by usvg and must not false-positive.
        let unused_defs = r#"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><defs><text id="unused">中</text></defs><text x="2" y="16">A</text></svg>"#;
        assert!(rasterizer.rasterize(unused_defs, 1.0).is_ok());

        // (f) Referenced <defs><text> via <use> and <tref> must report MissingGlyphFont.
        let used_defs = r##"<svg xmlns="http://www.w3.org/2000/svg" width="80" height="24"><defs><text id="used" x="2" y="16">中</text></defs><use href="#used"/></svg>"##;
        assert!(matches!(
            rasterizer.rasterize(used_defs, 1.0),
            Err(PreviewError::MissingGlyphFont(_))
        ));
        let tref_xlink = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="24"><defs><g id="label">中</g></defs><text x="2" y="16"><tref xlink:href="#label"/></text></svg>"##;
        assert!(matches!(
            rasterizer.rasterize(tref_xlink, 1.0),
            Err(PreviewError::MissingGlyphFont(_))
        ));

        // (g) Visible pattern fill subroots on converted paths report uncovered glyphs, whereas a
        // hidden `<rect visibility="hidden" fill="url(#p)"/>` is skipped by resvg and must not fail.
        let hidden_pattern_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><defs><pattern id="p" patternUnits="userSpaceOnUse" width="24" height="24"><text y="18">A中</text></pattern></defs><text y="18">A</text><rect width="24" height="24" visibility="hidden" fill="url(#p)"/></svg>"##;
        assert!(rasterizer.rasterize(hidden_pattern_svg, 1.0).is_ok());

        let visible_pattern_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><defs><pattern id="p" patternUnits="userSpaceOnUse" width="24" height="24"><text y="18">A中</text></pattern></defs><text y="18">A</text><rect width="24" height="24" visibility="visible" fill="url(#p)"/></svg>"##;
        let pat_err = rasterizer.rasterize(visible_pattern_svg, 1.0).unwrap_err();
        assert!(pat_err.to_string().contains("U+4E2D"));

        let hidden_tspan = r#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><text y="18">A<tspan visibility="hidden">中</tspan></text></svg>"#;
        assert!(rasterizer.rasterize(hidden_tspan, 1.0).is_ok());

        let visible_tspan = r#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><text y="18">A<tspan visibility="visible">中</tspan></text></svg>"#;
        let vis_err = rasterizer.rasterize(visible_tspan, 1.0).unwrap_err();
        assert!(vis_err.to_string().contains("U+4E2D"));

        // (h) Subset font with an outline-less `.notdef` (0 contours, like `pyftsubset` defaults)
        // and base64-encoded nested `<image>` SVGs still report uncovered CJK glyphs in strict mode.
        let mut empty_notdef_pool = FontPool::new();
        empty_notdef_pool
            .register_font_bytes(crate::test_support::build_test_latin_empty_notdef_ttf())
            .unwrap();
        let subset_rasterizer = SvgRasterizer::new(&empty_notdef_pool);
        let all_cjk = r#"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"><text x="4" y="20">中文标签</text></svg>"#;
        let subset_err = subset_rasterizer.rasterize(all_cjk, 2.0).unwrap_err();
        let subset_msg = subset_err.to_string();
        for code in ["U+4E2D", "U+6587", "U+6807", "U+7B7E"] {
            assert!(subset_msg.contains(code), "missing {code} in {subset_msg}");
        }

        // Base64-encoded `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text y="14">中</text></svg>`
        let b64_inner = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSIyMCI+PHRleHQgeT0iMTQiPuS4rTwvdGV4dD48L3N2Zz4=";
        let nested_visible = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><image width="40" height="20" href="data:image/svg+xml;base64,{b64_inner}"/></svg>"#
        );
        let nested_err = subset_rasterizer
            .rasterize(&nested_visible, 1.0)
            .unwrap_err();
        assert!(nested_err.to_string().contains("U+4E2D"));
        let nested_hidden = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><image width="40" height="20" visibility="hidden" href="data:image/svg+xml;base64,{b64_inner}"/></svg>"#
        );
        assert!(subset_rasterizer.rasterize(&nested_hidden, 1.0).is_ok());

        // (i) Negative-`startOffset` `<textPath>` where the real font's `.notdef` (`0.90 em` =
        // `18 px` at `20 px`, midpoint `-6 + 9 = +3 px >= 0`) is kept and drawn in `tree` while
        // the `0.50 em` probe `.notdef` (`10 px`, midpoint `-6 + 5 = -1 px < 0`) is clipped off
        // the start of the path in `probe`: strict mode must still reject `U+4E2D`.
        let mut latin_notdef_pool = FontPool::new();
        latin_notdef_pool
            .register_font_bytes(crate::test_support::build_test_latin_with_notdef_ttf())
            .unwrap();
        let latin_notdef_rasterizer = SvgRasterizer::new(&latin_notdef_pool);
        let text_path_svg = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50"><defs><path id="p" d="M20 30h70"/></defs><text font-family="TestLatinWithNotdef" font-size="20"><textPath xlink:href="#p" startOffset="-6">中</textPath></text></svg>"##;
        let lenient_opts = RasterOptions {
            allow_missing_glyphs: true,
            ..RasterOptions::with_scale(1.0)
        };
        let drawn_notdef = latin_notdef_rasterizer
            .rasterize_with_options(text_path_svg, lenient_opts)
            .unwrap();
        assert!(
            drawn_notdef.count_non_transparent_pixels() > 0,
            "real tree keeps and draws `.notdef` on negative-startOffset textPath"
        );
        let tp_err = latin_notdef_rasterizer
            .rasterize(text_path_svg, 1.0)
            .unwrap_err();
        assert!(matches!(tp_err, PreviewError::MissingGlyphFont(_)));
        assert!(tp_err.to_string().contains("U+4E2D"));

        // Combined dual-font SVG where `tree` retains only `中` (negative-`startOffset` `<textPath>`
        // on `TestLatinWithNotdef`) while `probe` retains only `文` (`EmptyNotdefLatin` drops `<text>`
        // in `tree`), plus `startOffset="0"` where `probe` retains `[中, 文]`: both must report
        // `U+4E2D` and `U+6587` once each in a single deduplicated `MissingGlyphFont` error.
        let mut dual_pool = FontPool::new();
        dual_pool
            .register_font_bytes(crate::test_support::build_test_latin_with_notdef_ttf())
            .unwrap();
        dual_pool
            .register_font_bytes(crate::test_support::build_test_latin_empty_notdef_ttf())
            .unwrap();
        let dual_rasterizer = SvgRasterizer::new(&dual_pool);
        for offset in ["-6", "0"] {
            let dual_svg = format!(
                r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="70"><defs><path id="p" d="M20 30h70"/></defs><text font-family="TestLatinWithNotdef" font-size="20"><textPath xlink:href="#p" startOffset="{offset}">中</textPath></text><text x="4" y="55" font-family="EmptyNotdefLatin">文</text></svg>"##
            );
            let dual_err = dual_rasterizer.rasterize(&dual_svg, 1.0).unwrap_err();
            let dual_msg = dual_err.to_string();
            assert!(matches!(dual_err, PreviewError::MissingGlyphFont(_)));
            assert_eq!(
                dual_msg.matches("U+4E2D").count(),
                1,
                "offset={offset}: {dual_msg}"
            );
            assert_eq!(
                dual_msg.matches("U+6587").count(),
                1,
                "offset={offset}: {dual_msg}"
            );
        }

        // (j) Lenient mode allows rendering available glyphs when host has no more fonts to fetch.
        assert!(
            rasterizer
                .rasterize_with_options(direct, lenient_opts)
                .is_ok()
        );
    }
}
