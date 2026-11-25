use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::layout::{Abs, Frame, FrameItem};
use typst::syntax::package::PackageSpec;
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_layout::PagedDocument;
use typst_svg::SvgOptions;

use crate::PreviewDate;
use crate::error::PreviewError;
use crate::font_pool::{FontPool, SharedFontBytes};
use crate::svg_raster::{RasterOptions, RgbaImageBuffer, SvgRasterizer};

/// Layout metrics and SVG output for a compiled Typst page.
#[derive(Debug, Clone, PartialEq)]
pub struct TypstSvgOutput {
    /// Compiled SVG document string.
    pub svg: String,
    /// Page width in Typst points.
    pub width_pt: f64,
    /// Page height in Typst points.
    pub height_pt: f64,
    /// Distance from the top edge to the baseline in points.
    pub ascent_pt: f64,
    /// Distance from the baseline to the bottom edge in points.
    pub descent_pt: f64,
}

/// Rasterized RGBA8 output and layout metrics for a compiled Typst page.
#[derive(Debug, Clone, PartialEq)]
pub struct TypstRgbaOutput {
    /// Rasterized RGBA8 pixel buffer.
    pub image: RgbaImageBuffer,
    /// Page width in Typst points.
    pub width_pt: f64,
    /// Distance from the top edge to the baseline in points.
    pub ascent_pt: f64,
    /// Distance from the baseline to the bottom edge in points.
    pub descent_pt: f64,
}

/// Pure in-memory `typst::World` implementation with zero OS I/O, network, or wall clock.
///
/// Fonts come strictly from [`FontPool`] byte buffers, and optional virtual files
/// or `@preview` package files are registered in memory.
pub struct InMemoryTypstWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_id: FileId,
    main_source: Source,
    files: HashMap<FileId, Bytes>,
    today: Option<PreviewDate>,
}

impl InMemoryTypstWorld {
    /// Creates an in-memory Typst world backed by the fonts in `font_pool`.
    pub fn new(font_pool: &FontPool) -> Self {
        let mut book = FontBook::new();
        let mut fonts = Vec::new();
        for blob in font_pool.font_blobs() {
            let bytes = Bytes::new(SharedFontBytes(Arc::clone(blob)));
            for font in Font::iter(bytes) {
                book.push(font.info().clone());
                fonts.push(font);
            }
        }

        let main_path = VirtualPath::new("main.typ").expect("static main.typ path is valid");
        let main_id = FileId::new(RootedPath::new(VirtualRoot::Project, main_path));
        let main_source = Source::new(main_id, String::new());

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(book),
            fonts,
            main_id,
            main_source,
            files: HashMap::new(),
            today: Some(PreviewDate::DEFAULT),
        }
    }

    /// Sets the deterministic date returned by `World::today`.
    pub fn set_today(&mut self, date: Option<PreviewDate>) {
        self.today = date;
    }

    /// Registers an in-memory virtual file accessible via `#include` or `#read`.
    pub fn insert_file(
        &mut self,
        virtual_path: &str,
        bytes: impl Into<Vec<u8>>,
    ) -> Result<(), PreviewError> {
        let vpath = VirtualPath::new(virtual_path)
            .map_err(|err| PreviewError::Typst(format!("invalid virtual path: {err:?}")))?;
        let id = FileId::new(RootedPath::new(VirtualRoot::Project, vpath));
        self.files.insert(id, Bytes::new(bytes.into()));
        Ok(())
    }

    /// Registers an in-memory file belonging to a Typst package (such as `@preview/pkg:0.1.0`).
    pub fn insert_package_file(
        &mut self,
        package: PackageSpec,
        virtual_path: &str,
        bytes: impl Into<Vec<u8>>,
    ) -> Result<(), PreviewError> {
        let vpath = VirtualPath::new(virtual_path)
            .map_err(|err| PreviewError::Typst(format!("invalid package path: {err:?}")))?;
        let id = FileId::new(RootedPath::new(VirtualRoot::Package(package), vpath));
        self.files.insert(id, Bytes::new(bytes.into()));
        Ok(())
    }

    /// Compiles Typst markup into a paged document and bounds resident `comemo` caches.
    pub fn compile_document(&mut self, source: &str) -> Result<Arc<PagedDocument>, PreviewError> {
        if source.trim().is_empty() {
            return Err(PreviewError::EmptyInput);
        }

        self.main_source = Source::new(self.main_id, source.to_string());
        let warned = typst::compile::<PagedDocument>(self);
        comemo::evict(10);
        let document = warned.output.map_err(|errors| {
            let joined = errors
                .iter()
                .map(|diag| diag.message.as_str())
                .collect::<Vec<_>>()
                .join("; ");
            PreviewError::Typst(joined)
        })?;

        if document.pages().is_empty() {
            return Err(PreviewError::Typst(
                "compiled document has zero pages".to_string(),
            ));
        }

        Ok(Arc::new(document))
    }

    /// Exports every page of an already-compiled [`PagedDocument`] to SVG.
    pub fn render_document_pages_svg(document: &PagedDocument) -> Vec<TypstSvgOutput> {
        document
            .pages()
            .iter()
            .map(|page| {
                let svg = typst_svg::svg(page, &SvgOptions::default());
                let (width_pt, height_pt, ascent_pt, descent_pt) =
                    extract_frame_metrics(&page.frame);
                TypstSvgOutput {
                    svg,
                    width_pt,
                    height_pt,
                    ascent_pt,
                    descent_pt,
                }
            })
            .collect()
    }

    /// Exports a single page of an already-compiled [`PagedDocument`] to SVG.
    pub fn render_document_page_svg(
        document: &PagedDocument,
        page_index: usize,
    ) -> Result<TypstSvgOutput, PreviewError> {
        let pages = document.pages();
        let page = pages.get(page_index).ok_or(PreviewError::PageOutOfRange {
            index: page_index,
            page_count: pages.len(),
        })?;
        let svg = typst_svg::svg(page, &SvgOptions::default());
        let (width_pt, height_pt, ascent_pt, descent_pt) = extract_frame_metrics(&page.frame);
        Ok(TypstSvgOutput {
            svg,
            width_pt,
            height_pt,
            ascent_pt,
            descent_pt,
        })
    }

    /// Compiles Typst markup and returns every page SVG with its frame metrics.
    pub fn compile_pages_svg(&mut self, source: &str) -> Result<Vec<TypstSvgOutput>, PreviewError> {
        let document = self.compile_document(source)?;
        Ok(Self::render_document_pages_svg(&document))
    }

    /// Compiles Typst markup and returns the first page SVG and frame metrics.
    pub fn compile_svg(&mut self, source: &str) -> Result<TypstSvgOutput, PreviewError> {
        self.compile_pages_svg(source)?
            .into_iter()
            .next()
            .ok_or_else(|| PreviewError::Typst("compiled document has zero pages".to_string()))
    }

    /// Compiles Typst markup and rasterizes the resulting SVG into an RGBA8 buffer.
    pub fn compile_rgba(
        &mut self,
        source: &str,
        rasterizer: &SvgRasterizer,
        scale_factor: f32,
    ) -> Result<TypstRgbaOutput, PreviewError> {
        let svg_out = self.compile_svg(source)?;
        let image = rasterizer
            .rasterize_with_options(&svg_out.svg, RasterOptions::with_scale(scale_factor))?;
        Ok(TypstRgbaOutput {
            image,
            width_pt: svg_out.width_pt,
            ascent_pt: svg_out.ascent_pt,
            descent_pt: svg_out.descent_pt,
        })
    }

    /// Returns the number of font faces loaded into this world.
    pub fn font_count(&self) -> usize {
        self.fonts.len()
    }
}

impl World for InMemoryTypstWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            return Ok(self.main_source.clone());
        }
        let bytes = self.file(id)?;
        let text = std::str::from_utf8(&bytes).map_err(|_| FileError::InvalidUtf8)?;
        Ok(Source::new(id, text.to_string()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.main_id {
            return Ok(Bytes::from_string(self.main_source.text().to_string()));
        }
        self.files
            .get(&id)
            .cloned()
            .ok_or_else(|| FileError::NotFound(PathBuf::from(id.vpath().get_without_slash())))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        let date = self.today?;
        Datetime::from_ymd(date.year, date.month, date.day)
    }
}

/// Extracts `(width_pt, height_pt, ascent_pt, descent_pt)` from a compiled page frame.
///
/// Typst page frames often store the math or inline baseline on a child group frame
/// rather than the outer page frame. We walk nested group items to locate the first
/// explicit baseline in page coordinates, falling back to `frame.baseline()`.
pub(crate) fn extract_frame_metrics(frame: &Frame) -> (f64, f64, f64, f64) {
    let width_pt = frame.width().to_pt();
    let height_pt = frame.height().to_pt();
    let baseline = find_explicit_baseline(frame, Abs::zero()).unwrap_or_else(|| frame.baseline());
    let ascent_pt = baseline.to_pt().clamp(0.0, height_pt);
    let descent_pt = (height_pt - ascent_pt).max(0.0);
    (width_pt, height_pt, ascent_pt, descent_pt)
}

fn find_explicit_baseline(frame: &Frame, y_offset: Abs) -> Option<Abs> {
    if frame.has_baseline() {
        return Some(y_offset + frame.baseline());
    }
    for (pos, item) in frame.items() {
        if let FrameItem::Group(group) = item
            && let Some(found) = find_explicit_baseline(&group.frame, y_offset + pos.y)
        {
            return Some(found);
        }
    }
    None
}

/// Shared reference wrapper so callers can reuse an `Arc<FontPool>` cleanly.
pub fn new_typst_world_from_arc(font_pool: &Arc<FontPool>) -> InMemoryTypstWorld {
    InMemoryTypstWorld::new(font_pool.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::build_test_font_pool;

    #[test]
    fn compiles_native_typst_block_and_in_memory_include_without_io() {
        let pool = build_test_font_pool();
        let rasterizer = SvgRasterizer::new(&pool);
        let mut world = InMemoryTypstWorld::new(&pool);
        world
            .insert_file("helper.typ", b"#let greeting = [Hello In-Memory Typst]")
            .unwrap();

        let source = r#"
#set page(width: auto, height: auto, margin: 4pt)
#import "helper.typ": greeting
#greeting
$ E = m c^2 $
"#;
        let svg_out = world.compile_svg(source).unwrap();
        assert!(svg_out.svg.contains("<svg"));
        assert!(svg_out.width_pt > 0.0 && svg_out.height_pt > 0.0);

        let rgba_first = world.compile_rgba(source, &rasterizer, 2.0).unwrap();
        let rgba_second = world.compile_rgba(source, &rasterizer, 2.0).unwrap();
        assert!(rgba_first.image.count_non_transparent_pixels() > 50);
        assert_eq!(rgba_first.image.sha256(), rgba_second.image.sha256());
    }

    #[test]
    fn uses_deterministic_today_date_without_wall_clock() {
        let pool = build_test_font_pool();
        let mut world = InMemoryTypstWorld::new(&pool);
        world.set_today(Some(PreviewDate::new(2026, 11, 25)));
        let source = r#"#set page(width: auto, height: auto, margin: 2pt)
#datetime.today().display()"#;
        let first = world.compile_svg(source).unwrap();
        let second = world.compile_svg(source).unwrap();
        assert_eq!(first.svg, second.svg);
    }
}
