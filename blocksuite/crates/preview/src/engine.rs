#[cfg(feature = "pdf")]
use std::collections::HashMap;
#[cfg(any(feature = "mermaid", feature = "typst"))]
use std::sync::Arc;

#[cfg(feature = "typst")]
use sha2::{Digest, Sha256};

use crate::cache::{CacheLimits, PinnedPixelCache};
use crate::error::PreviewError;
use crate::font_pool::FontPool;
#[cfg(any(feature = "mermaid", feature = "math", feature = "typst"))]
use crate::svg_raster::RasterOptions;
#[cfg(any(feature = "mermaid", feature = "typst", feature = "pdf"))]
use crate::svg_raster::RgbaImageBuffer;
#[cfg(feature = "svg-raster")]
use crate::svg_raster::SvgRasterizer;

#[cfg(feature = "math")]
use crate::math::{MathRenderOptions, MathRgbaOutput, MathSvgOutput, render_latex_svg};
#[cfg(feature = "mermaid")]
use crate::mermaid::{MermaidOptions, MermaidRenderer};
#[cfg(feature = "pdf")]
use crate::pdf::{HayroPdfRenderer, PdfPageRenderer, PdfRenderRequest};
#[cfg(feature = "typst")]
use crate::typst_world::{InMemoryTypstWorld, TypstSvgOutput};

#[cfg(feature = "typst")]
struct CachedTypstDocument {
    source_hash: [u8; 32],
    today: crate::PreviewDate,
    font_generation: u64,
    inputs_generation: u64,
    document: Arc<typst_layout::PagedDocument>,
}

/// Stateful offline preview engine retaining registered fonts, pixel cache,
/// in-memory Typst files/packages, and parsed PDF handles across calls.
pub struct PreviewEngine {
    font_pool: FontPool,
    font_generation: u64,
    #[cfg(feature = "svg-raster")]
    rasterizer: SvgRasterizer,
    cache: PinnedPixelCache<String>,
    #[cfg(feature = "typst")]
    typst_files: Vec<(String, Vec<u8>)>,
    #[cfg(feature = "typst")]
    typst_package_files: Vec<(String, String, String, String, Vec<u8>)>,
    #[cfg(feature = "typst")]
    typst_inputs_generation: u64,
    #[cfg(feature = "typst")]
    typst_world: Option<InMemoryTypstWorld>,
    #[cfg(feature = "typst")]
    last_typst_doc: Option<CachedTypstDocument>,
    #[cfg(feature = "pdf")]
    pdf_docs: HashMap<u32, HayroPdfRenderer>,
    #[cfg(feature = "pdf")]
    next_pdf_handle: u32,
}

impl Default for PreviewEngine {
    fn default() -> Self {
        Self::new(CacheLimits::MOBILE_DEFAULT)
    }
}

impl PreviewEngine {
    /// Creates an empty preview engine with the given pixel cache limits.
    pub fn new(limits: CacheLimits) -> Self {
        let font_pool = FontPool::new();
        #[cfg(feature = "svg-raster")]
        let rasterizer = SvgRasterizer::new(&font_pool);
        Self {
            font_pool,
            font_generation: 0,
            #[cfg(feature = "svg-raster")]
            rasterizer,
            cache: PinnedPixelCache::new(limits),
            #[cfg(feature = "typst")]
            typst_files: Vec::new(),
            #[cfg(feature = "typst")]
            typst_package_files: Vec::new(),
            #[cfg(feature = "typst")]
            typst_inputs_generation: 0,
            #[cfg(feature = "typst")]
            typst_world: None,
            #[cfg(feature = "typst")]
            last_typst_doc: None,
            #[cfg(feature = "pdf")]
            pdf_docs: HashMap::new(),
            #[cfg(feature = "pdf")]
            next_pdf_handle: 1,
        }
    }

    /// Registers a font byte buffer into the persistent [`FontPool`].
    ///
    /// Increments `font_generation` and clears cached pixel buffers from the
    /// previous generation so stale bitmaps are freed immediately.
    pub fn register_font(&mut self, bytes: impl Into<Vec<u8>>) -> Result<usize, PreviewError> {
        let added = self.font_pool.register_font_bytes(bytes)?;
        self.font_generation = self.font_generation.wrapping_add(1);
        self.cache.clear();
        #[cfg(feature = "svg-raster")]
        {
            self.rasterizer = SvgRasterizer::new(&self.font_pool);
        }
        #[cfg(feature = "typst")]
        {
            self.typst_world = None;
            self.last_typst_doc = None;
        }
        Ok(added)
    }

    /// Returns the monotonically increasing font registration generation counter.
    pub fn font_generation(&self) -> u64 {
        self.font_generation
    }

    /// Returns the total number of registered font faces.
    pub fn font_face_count(&self) -> usize {
        self.font_pool.face_count()
    }

    /// Returns a shared reference to the engine's [`FontPool`].
    pub fn font_pool(&self) -> &FontPool {
        &self.font_pool
    }

    /// Returns a mutable reference to the engine's [`PinnedPixelCache`].
    pub fn cache_mut(&mut self) -> &mut PinnedPixelCache<String> {
        &mut self.cache
    }

    /// Registers an in-memory Typst file accessible via `#include` or `#import`.
    #[cfg(feature = "typst")]
    pub fn register_typst_file(
        &mut self,
        path: impl Into<String>,
        bytes: impl Into<Vec<u8>>,
    ) -> Result<(), PreviewError> {
        let path_str = path.into();
        let data = bytes.into();
        if let Some(world) = self.typst_world.as_mut() {
            world.insert_file(&path_str, data.clone())?;
        }
        self.typst_files.push((path_str, data));
        self.typst_inputs_generation = self.typst_inputs_generation.wrapping_add(1);
        self.last_typst_doc = None;
        Ok(())
    }

    /// Registers an in-memory Typst package file (for example `@preview/demo:0.1.0`).
    #[cfg(feature = "typst")]
    pub fn register_typst_package_file(
        &mut self,
        namespace: impl Into<String>,
        name: impl Into<String>,
        version: impl Into<String>,
        path: impl Into<String>,
        bytes: impl Into<Vec<u8>>,
    ) -> Result<(), PreviewError> {
        let ns = namespace.into();
        let pkg_name = name.into();
        let ver = version.into();
        let file_path = path.into();
        let data = bytes.into();
        let spec = parse_package_spec(&ns, &pkg_name, &ver)?;
        if let Some(world) = self.typst_world.as_mut() {
            world.insert_package_file(spec, &file_path, data.clone())?;
        }
        self.typst_package_files
            .push((ns, pkg_name, ver, file_path, data));
        self.typst_inputs_generation = self.typst_inputs_generation.wrapping_add(1);
        self.last_typst_doc = None;
        Ok(())
    }

    /// Renders a Mermaid diagram to `resvg`-safe SVG using registered font metrics.
    #[cfg(feature = "mermaid")]
    pub fn render_mermaid_svg(
        &self,
        source: &str,
        options: &MermaidOptions,
    ) -> Result<String, PreviewError> {
        MermaidRenderer::new().render_svg_with_fonts(source, options, &self.font_pool)
    }

    /// Renders a Mermaid diagram to RGBA8 pixels using registered fonts and pixel cache.
    ///
    /// Fails with [`PreviewError::MissingGlyphFont`] when any non-ignorable glyph in
    /// the SVG `<text>` elements is uncovered by the registered [`FontPool`].
    #[cfg(feature = "mermaid")]
    pub fn render_mermaid_rgba(
        &mut self,
        source: &str,
        options: &MermaidOptions,
        scale_factor: f32,
    ) -> Result<Arc<RgbaImageBuffer>, PreviewError> {
        self.render_mermaid_rgba_internal(source, options, scale_factor, false)
    }

    /// Renders a Mermaid diagram to RGBA8 pixels in lenient mode, allowing missing
    /// glyphs to fall back when the host has no additional script fonts to register.
    #[cfg(feature = "mermaid")]
    pub fn render_mermaid_rgba_lenient(
        &mut self,
        source: &str,
        options: &MermaidOptions,
        scale_factor: f32,
    ) -> Result<Arc<RgbaImageBuffer>, PreviewError> {
        self.render_mermaid_rgba_internal(source, options, scale_factor, true)
    }

    #[cfg(feature = "mermaid")]
    fn render_mermaid_rgba_internal(
        &mut self,
        source: &str,
        options: &MermaidOptions,
        scale_factor: f32,
        allow_missing_glyphs: bool,
    ) -> Result<Arc<RgbaImageBuffer>, PreviewError> {
        let diagram_id_tag = match options.diagram_id.as_deref() {
            Some(id) => format!("some({}:{id})", id.len()),
            None => "none".to_string(),
        };
        let mode_tag = if allow_missing_glyphs {
            "lenient"
        } else {
            "strict"
        };
        let theme_tag = match options.theme {
            None => "none",
            Some(crate::mermaid::MermaidTheme::Light) => "light",
            Some(crate::mermaid::MermaidTheme::Dark) => "dark",
        };
        let key = format!(
            "mermaid:{mode_tag}:theme={theme_tag}:fg={}:date={:04}-{:02}-{:02}:tz={}:pad={:016x}:id={diagram_id_tag}:scale={:08x}:src={source}",
            self.font_generation,
            options.today.year,
            options.today.month,
            options.today.day,
            options.timezone_offset_minutes,
            options.viewbox_padding.to_bits(),
            scale_factor.to_bits(),
        );
        if let Some(cached) = self.cache.get(&key) {
            return Ok(cached);
        }
        let svg = MermaidRenderer::new().render_svg_with_fonts(source, options, &self.font_pool)?;
        let raster_opts = RasterOptions {
            allow_missing_glyphs,
            ..RasterOptions::with_scale(scale_factor)
        };
        let buf = Arc::new(self.rasterizer.rasterize_with_options(&svg, raster_opts)?);
        self.cache.insert(key, Arc::clone(&buf));
        Ok(buf)
    }

    /// Renders a LaTeX formula to pure-`<path>` SVG using registered fonts.
    #[cfg(feature = "math")]
    pub fn render_latex_svg(
        &self,
        latex: &str,
        options: &MathRenderOptions,
    ) -> Result<MathSvgOutput, PreviewError> {
        render_latex_svg(latex, options, &self.font_pool)
    }

    /// Renders a LaTeX formula to RGBA8 pixels with baseline metrics.
    #[cfg(feature = "math")]
    pub fn render_latex_rgba(
        &mut self,
        latex: &str,
        options: &MathRenderOptions,
        scale_factor: f32,
    ) -> Result<MathRgbaOutput, PreviewError> {
        let svg_out = render_latex_svg(latex, options, &self.font_pool)?;
        let image = self
            .rasterizer
            .rasterize_with_options(&svg_out.svg, RasterOptions::with_scale(scale_factor))?;
        Ok(MathRgbaOutput {
            width_pt: svg_out.width_pt,
            ascent_pt: svg_out.ascent_pt,
            descent_pt: svg_out.descent_pt,
            image,
        })
    }

    /// Compiles a native Typst document and returns all rendered pages.
    #[cfg(feature = "typst")]
    pub fn compile_typst_pages(
        &mut self,
        source: &str,
        today: crate::PreviewDate,
    ) -> Result<Vec<TypstSvgOutput>, PreviewError> {
        let document = self.compile_or_reuse_typst_document(source, today)?;
        Ok(InMemoryTypstWorld::render_document_pages_svg(&document))
    }

    /// Compiles a native Typst document and rasterizes `page_index` to RGBA8.
    ///
    /// Consecutive page renders for the same source, date, font generation, and
    /// registered virtual inputs reuse the cached compiled `PagedDocument`.
    #[cfg(feature = "typst")]
    pub fn compile_typst_page_rgba(
        &mut self,
        source: &str,
        today: crate::PreviewDate,
        page_index: usize,
        scale_factor: f32,
    ) -> Result<Arc<RgbaImageBuffer>, PreviewError> {
        let document = self.compile_or_reuse_typst_document(source, today)?;
        let page = InMemoryTypstWorld::render_document_page_svg(&document, page_index)?;
        let image = Arc::new(
            self.rasterizer
                .rasterize_with_options(&page.svg, RasterOptions::with_scale(scale_factor))?,
        );
        Ok(image)
    }

    /// Parses and caches a PDF document, returning a handle for fast page flipping.
    #[cfg(feature = "pdf")]
    pub fn load_pdf(&mut self, pdf_bytes: impl Into<Vec<u8>>) -> Result<u32, PreviewError> {
        let renderer = HayroPdfRenderer::from_bytes(pdf_bytes)?;
        let handle = self.next_pdf_handle;
        self.next_pdf_handle = self.next_pdf_handle.wrapping_add(1).max(1);
        self.pdf_docs.insert(handle, renderer);
        Ok(handle)
    }

    /// Removes a previously loaded PDF document handle from memory.
    #[cfg(feature = "pdf")]
    pub fn unload_pdf(&mut self, handle: u32) -> bool {
        self.pdf_docs.remove(&handle).is_some()
    }

    /// Returns the page count for a cached PDF handle.
    #[cfg(feature = "pdf")]
    pub fn pdf_page_count(&self, handle: u32) -> Result<usize, PreviewError> {
        let doc = self
            .pdf_docs
            .get(&handle)
            .ok_or_else(|| PreviewError::Pdf(format!("unknown pdf handle {handle}")))?;
        Ok(doc.page_count())
    }

    /// Renders a single page of a cached PDF document handle to RGBA8.
    #[cfg(feature = "pdf")]
    pub fn render_pdf_page(
        &self,
        handle: u32,
        request: PdfRenderRequest,
    ) -> Result<(usize, RgbaImageBuffer), PreviewError> {
        let doc = self
            .pdf_docs
            .get(&handle)
            .ok_or_else(|| PreviewError::Pdf(format!("unknown pdf handle {handle}")))?;
        let page_count = doc.page_count();
        let buffer = doc.render_page(request)?;
        Ok((page_count, buffer))
    }

    #[cfg(feature = "typst")]
    fn compile_or_reuse_typst_document(
        &mut self,
        source: &str,
        today: crate::PreviewDate,
    ) -> Result<Arc<typst_layout::PagedDocument>, PreviewError> {
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        let source_hash: [u8; 32] = hasher.finalize().into();

        if let Some(cached) = self.last_typst_doc.as_ref()
            && cached.source_hash == source_hash
            && cached.today == today
            && cached.font_generation == self.font_generation
            && cached.inputs_generation == self.typst_inputs_generation
        {
            return Ok(Arc::clone(&cached.document));
        }

        let world = self.ensure_typst_world()?;
        world.set_today(Some(today));
        let document = world.compile_document(source)?;
        self.last_typst_doc = Some(CachedTypstDocument {
            source_hash,
            today,
            font_generation: self.font_generation,
            inputs_generation: self.typst_inputs_generation,
            document: Arc::clone(&document),
        });
        Ok(document)
    }

    #[cfg(feature = "typst")]
    fn ensure_typst_world(&mut self) -> Result<&mut InMemoryTypstWorld, PreviewError> {
        if self.typst_world.is_none() {
            let mut world = InMemoryTypstWorld::new(&self.font_pool);
            for (path, bytes) in &self.typst_files {
                world.insert_file(path, bytes.clone())?;
            }
            for (ns, name, ver, path, bytes) in &self.typst_package_files {
                let spec = parse_package_spec(ns, name, ver)?;
                world.insert_package_file(spec, path, bytes.clone())?;
            }
            self.typst_world = Some(world);
        }
        Ok(self.typst_world.as_mut().expect("typst world initialized"))
    }
}

#[cfg(feature = "typst")]
fn parse_package_spec(
    namespace: &str,
    name: &str,
    version: &str,
) -> Result<typst::syntax::package::PackageSpec, PreviewError> {
    let parsed_version: typst::syntax::package::PackageVersion =
        version.parse().map_err(|err| {
            PreviewError::Typst(format!("invalid package version '{version}': {err}"))
        })?;
    Ok(typst::syntax::package::PackageSpec {
        namespace: namespace.into(),
        name: name.into(),
        version: parsed_version,
    })
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "mermaid")]
    use super::*;
    #[cfg(all(feature = "mermaid", feature = "typst"))]
    use crate::PreviewDate;
    #[cfg(feature = "mermaid")]
    use crate::test_support::build_test_cjk_ttf;

    #[cfg(all(feature = "mermaid", feature = "typst"))]
    #[test]
    fn persistent_engine_supports_multi_font_cjk_mermaid_and_typst_packages() {
        let mut engine = PreviewEngine::default();
        let first_latin = typst_assets::fonts().next().expect("typst bundled font");
        assert!(engine.register_font(first_latin.to_vec()).unwrap() >= 1);
        assert!(engine.register_font(build_test_cjk_ttf()).unwrap() >= 1);

        // 1. CJK Mermaid 2x RGBA rendering and cache reuse.
        let opts = MermaidOptions {
            today: PreviewDate::new(2026, 3, 10),
            timezone_offset_minutes: 480,
            ..MermaidOptions::default()
        };
        let img = engine
            .render_mermaid_rgba("flowchart LR\n  A[中文] --> B[通过]", &opts, 2.0)
            .unwrap();
        assert!(img.width_px > 0 && img.height_px > 0);
        assert!(img.count_non_transparent_pixels() > 100);
        let cached = engine
            .render_mermaid_rgba("flowchart LR\n  A[中文] --> B[通过]", &opts, 2.0)
            .unwrap();
        assert!(Arc::ptr_eq(&img, &cached));

        // 2. Multi-font + in-memory @preview package + multi-page Typst compilation & doc reuse.
        engine
            .register_typst_package_file(
                "preview",
                "demo",
                "0.1.0",
                "typst.toml",
                b"[package]\nname = \"demo\"\nversion = \"0.1.0\"\nentrypoint = \"lib.typ\"\n",
            )
            .unwrap();
        engine
            .register_typst_package_file(
                "preview",
                "demo",
                "0.1.0",
                "lib.typ",
                b"#let badge(t) = [Package: #t]",
            )
            .unwrap();

        let source = r#"
#import "@preview/demo:0.1.0": badge
#set page(width: 140pt, height: 60pt, margin: 4pt)
#badge[Page 1 中文]
#pagebreak()
#badge[Page 2 测试]
"#;
        let date = PreviewDate::new(2026, 3, 10);
        let pages = engine.compile_typst_pages(source, date).unwrap();
        assert_eq!(pages.len(), 2);
        assert!(pages[0].svg.contains("<svg") && pages[1].svg.contains("<svg"));
        assert_ne!(pages[0].svg, pages[1].svg);

        // Consecutive page RGBA renders reuse the cached compiled PagedDocument.
        let doc_before = Arc::clone(&engine.last_typst_doc.as_ref().unwrap().document);
        let p0 = engine
            .compile_typst_page_rgba(source, date, 0, 2.0)
            .unwrap();
        let p1 = engine
            .compile_typst_page_rgba(source, date, 1, 2.0)
            .unwrap();
        let doc_after = Arc::clone(&engine.last_typst_doc.as_ref().unwrap().document);
        assert!(Arc::ptr_eq(&doc_before, &doc_after));
        assert_ne!(p0.sha256(), p1.sha256());
    }

    #[cfg(feature = "mermaid")]
    #[test]
    fn register_font_signals_missing_cjk_and_invalidates_mermaid_pixel_cache() {
        let mut engine = PreviewEngine::default();
        let mut fonts = typst_assets::fonts();
        let latin_1 = fonts.next().expect("font 1").to_vec();
        let latin_2 = fonts.next().expect("font 2").to_vec();
        engine.register_font(latin_1).unwrap();
        let gen_after_1 = engine.font_generation();

        let opts = MermaidOptions::default();

        // (a) Latin-only FontPool must return MissingGlyphFont on CJK Mermaid text
        // instead of silently rendering .notdef boxes, then succeed once CJK font is added.
        let cjk_src = "flowchart LR\n  A[中文测试] --> B[Done]";
        let missing = engine.render_mermaid_rgba(cjk_src, &opts, 2.0);
        assert!(matches!(missing, Err(PreviewError::MissingGlyphFont(_))));

        // (b) Pure-Latin Mermaid caches an Arc, and registering a second font bumps
        // font_generation so re-rendering does not return the stale cached Arc.
        let latin_src = "flowchart LR\n  A[Start] --> B[Done]";
        let first = engine.render_mermaid_rgba(latin_src, &opts, 2.0).unwrap();
        engine.register_font(latin_2).unwrap();
        assert!(engine.font_generation() > gen_after_1);
        let second = engine.render_mermaid_rgba(latin_src, &opts, 2.0).unwrap();
        assert!(!Arc::ptr_eq(&first, &second));

        // Now register the CJK font and verify the CJK diagram succeeds with visible ink.
        engine.register_font(build_test_cjk_ttf()).unwrap();
        let cjk_ok = engine.render_mermaid_rgba(cjk_src, &opts, 2.0).unwrap();
        assert!(cjk_ok.count_non_transparent_pixels() > 100);
    }

    #[cfg(feature = "mermaid")]
    #[test]
    fn mermaid_options_all_fields_participate_in_pixel_cache_key() {
        let mut engine = PreviewEngine::default();
        engine
            .register_font(typst_assets::fonts().next().expect("font").to_vec())
            .unwrap();
        let src = "flowchart LR\n  A[Start] --> B[Done]";

        let tight = MermaidOptions {
            viewbox_padding: 0.0,
            ..MermaidOptions::default()
        };
        let wide = MermaidOptions {
            viewbox_padding: 64.0,
            ..MermaidOptions::default()
        };
        let a = engine.render_mermaid_rgba(src, &tight, 2.0).unwrap();
        let b = engine.render_mermaid_rgba(src, &wide, 2.0).unwrap();
        assert!(!Arc::ptr_eq(&a, &b));
        let a_hit = engine.render_mermaid_rgba(src, &tight, 2.0).unwrap();
        assert!(Arc::ptr_eq(&a, &a_hit));

        let id_a = MermaidOptions {
            diagram_id: Some("diag-a".to_string()),
            ..MermaidOptions::default()
        };
        let id_b = MermaidOptions {
            diagram_id: Some("diag-b".to_string()),
            ..MermaidOptions::default()
        };
        let img_id_a = engine.render_mermaid_rgba(src, &id_a, 2.0).unwrap();
        let img_id_b = engine.render_mermaid_rgba(src, &id_b, 2.0).unwrap();
        assert!(!Arc::ptr_eq(&img_id_a, &img_id_b));
    }

    #[cfg(feature = "mermaid")]
    #[test]
    fn variation_selector_default_ignorable_passes_and_lenient_mode_falls_back() {
        let mut engine = PreviewEngine::default();
        let latin = typst_assets::fonts().next().expect("typst bundled font");
        engine.register_font(latin.to_vec()).unwrap();
        assert!(engine.font_pool().has_glyph('\u{00A9}'));
        assert!(!engine.font_pool().has_glyph('\u{FE0F}'));

        let opts = MermaidOptions::default();
        let plain = engine.render_mermaid_rgba(
            "flowchart LR\n  A[Copyright \u{00A9} 2026] --> B[Done]",
            &opts,
            2.0,
        );
        let with_vs16 = engine.render_mermaid_rgba(
            "flowchart LR\n  A[Copyright \u{00A9}\u{FE0F} 2026] --> B[Done]",
            &opts,
            2.0,
        );
        assert!(plain.is_ok(), "plain copyright failed: {plain:?}");
        assert!(
            with_vs16.is_ok(),
            "copyright + U+FE0F variation selector must not fail: {with_vs16:?}"
        );

        // Uncovered CJK fails in strict mode, succeeds in lenient mode under a distinct cache key.
        let cjk = "flowchart LR\n  A[中文] --> B[Done]";
        assert!(matches!(
            engine.render_mermaid_rgba(cjk, &opts, 2.0),
            Err(PreviewError::MissingGlyphFont(_))
        ));
        let lenient = engine
            .render_mermaid_rgba_lenient(cjk, &opts, 2.0)
            .expect("lenient mode must render available glyphs");
        assert!(lenient.count_non_transparent_pixels() > 0);
    }
}
