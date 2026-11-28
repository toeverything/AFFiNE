use std::sync::Arc;

#[cfg(feature = "svg-text")]
use usvg::fontdb::{Database, Source};

use crate::error::PreviewError;

/// Explicit in-memory font registry for deterministic preview rendering.
///
/// This pool never scans host system fonts. Callers register application
/// font bytes explicitly so Linux, macOS, iOS, Android, and WebAssembly
/// produce identical glyph selection and pixel output.
#[derive(Clone, Default)]
pub struct FontPool {
    blobs: Vec<Arc<[u8]>>,
    face_count: usize,
    families: Vec<String>,
    covered_ranges: Vec<(u32, u32)>,
    sans_serif: Option<String>,
    serif: Option<String>,
    monospace: Option<String>,
    math: Option<String>,
    #[cfg(feature = "svg-text")]
    db: Arc<Database>,
}

impl std::fmt::Debug for FontPool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FontPool")
            .field("blob_count", &self.blobs.len())
            .field("face_count", &self.face_count)
            .field("sans_serif", &self.sans_serif)
            .field("serif", &self.serif)
            .field("monospace", &self.monospace)
            .field("math", &self.math)
            .finish()
    }
}

impl FontPool {
    /// Creates an empty font pool with no system fonts loaded.
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a single TrueType, OpenType, or font collection byte buffer.
    pub fn register_font_bytes(
        &mut self,
        bytes: impl Into<Vec<u8>>,
    ) -> Result<usize, PreviewError> {
        let data: Vec<u8> = bytes.into();
        let face_count = ttf_parser::fonts_in_collection(&data).unwrap_or(1) as usize;
        let mut parsed_faces = 0usize;
        let mut discovered_families = Vec::new();
        let mut new_codepoints = Vec::new();

        for index in 0..face_count {
            if let Ok(face) = ttf_parser::Face::parse(&data, index as u32)
                && face_has_renderable_glyph_table(&face)
            {
                parsed_faces += 1;
                if let Some(family) = extract_family_name(&face)
                    && !discovered_families.contains(&family)
                {
                    discovered_families.push(family);
                }
                collect_face_codepoints(&face, &mut new_codepoints);
            }
        }

        if parsed_faces == 0 {
            return Err(PreviewError::InvalidFont(
                "no valid TrueType or OpenType face found".to_string(),
            ));
        }

        let arc_bytes: Arc<[u8]> = Arc::from(data);
        #[cfg(feature = "svg-text")]
        let added = {
            let db = Arc::make_mut(&mut self.db);
            let before = db.len();
            db.load_font_source(Source::Binary(Arc::new(SharedFontBytes(Arc::clone(
                &arc_bytes,
            )))));
            let added = db.len().saturating_sub(before);
            if added == 0 {
                return Err(PreviewError::InvalidFont(
                    "fontdb rejected all faces in buffer".to_string(),
                ));
            }
            added
        };
        #[cfg(not(feature = "svg-text"))]
        let added = parsed_faces;

        self.face_count += added;
        self.blobs.push(arc_bytes);
        merge_codepoint_ranges(&mut self.covered_ranges, new_codepoints);
        for family in discovered_families {
            if !self.families.contains(&family) {
                self.families.push(family);
            }
        }

        self.sync_generic_families();
        Ok(added)
    }

    /// Sets the default sans-serif family name used for generic CSS queries.
    pub fn set_sans_serif_family(&mut self, family: impl Into<String>) {
        self.sans_serif = Some(family.into());
        self.sync_generic_families();
    }

    /// Sets the default serif family name used for generic CSS queries.
    pub fn set_serif_family(&mut self, family: impl Into<String>) {
        self.serif = Some(family.into());
        self.sync_generic_families();
    }

    /// Sets the default monospace family name used for generic CSS queries.
    pub fn set_monospace_family(&mut self, family: impl Into<String>) {
        self.monospace = Some(family.into());
        self.sync_generic_families();
    }

    /// Sets the preferred math font family name.
    pub fn set_math_family(&mut self, family: impl Into<String>) {
        self.math = Some(family.into());
    }

    /// Returns the shared in-memory `fontdb::Database`.
    #[cfg(feature = "svg-text")]
    pub fn database(&self) -> Arc<Database> {
        Arc::clone(&self.db)
    }

    /// Returns all registered raw font byte buffers in registration order.
    pub fn font_blobs(&self) -> &[Arc<[u8]>] {
        &self.blobs
    }

    /// Returns registered family names in registration order.
    pub fn families(&self) -> &[String] {
        &self.families
    }

    /// Returns the configured default sans-serif family name, if any.
    pub fn sans_serif_family(&self) -> Option<&str> {
        self.sans_serif
            .as_deref()
            .or_else(|| self.families.first().map(String::as_str))
    }

    /// Returns the configured default serif family name, if any.
    pub fn serif_family(&self) -> Option<&str> {
        self.serif.as_deref().or_else(|| self.sans_serif_family())
    }

    /// Returns the configured default monospace family name, if any.
    pub fn monospace_family(&self) -> Option<&str> {
        self.monospace
            .as_deref()
            .or_else(|| self.sans_serif_family())
    }

    /// Returns the configured math family name, if any.
    pub fn math_family(&self) -> Option<&str> {
        self.math.as_deref()
    }

    /// Returns the number of loaded font faces.
    pub fn face_count(&self) -> usize {
        self.face_count
    }

    /// Returns true when no font faces are registered.
    pub fn is_empty(&self) -> bool {
        self.face_count == 0
    }

    /// Returns true when at least one registered font face contains a glyph for `ch`.
    ///
    /// Uses the precomputed sorted scalar-range table built during registration (`O(log R)`).
    pub fn has_glyph(&self, ch: char) -> bool {
        let cp = ch as u32;
        self.covered_ranges
            .binary_search_by(|&(start, end)| {
                if cp < start {
                    std::cmp::Ordering::Greater
                } else if cp > end {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .is_ok()
    }

    #[cfg(feature = "svg-text")]
    fn sync_generic_families(&mut self) {
        let Some(fallback) = self
            .sans_serif
            .clone()
            .or_else(|| self.families.first().cloned())
        else {
            return;
        };
        let serif = self.serif.clone().unwrap_or_else(|| fallback.clone());
        let mono = self.monospace.clone().unwrap_or_else(|| fallback.clone());

        let db = Arc::make_mut(&mut self.db);
        db.set_sans_serif_family(&fallback);
        db.set_serif_family(&serif);
        db.set_monospace_family(&mono);
        db.set_cursive_family(&fallback);
        db.set_fantasy_family(&fallback);
    }

    #[cfg(not(feature = "svg-text"))]
    fn sync_generic_families(&mut self) {}
}

#[cfg(feature = "svg-text")]
pub(crate) struct SharedFontBytes(pub(crate) Arc<[u8]>);

#[cfg(feature = "svg-text")]
impl AsRef<[u8]> for SharedFontBytes {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

fn face_has_renderable_glyph_table(face: &ttf_parser::Face<'_>) -> bool {
    let t = face.tables();
    // Exclude Apple `hvgl`-only hyper-variable faces (`PingFangUI.ttc` on macOS 15+ / iOS 18+),
    // which expose Unicode `cmap` entries with zero standard vector or bitmap glyph tables so
    // `usvg` and `typst` would otherwise treat CJK codepoints as covered while drawing nothing.
    t.glyf.is_some()
        || t.cff.is_some()
        || t.cff2.is_some()
        || t.colr.is_some()
        || t.svg.is_some()
        || t.sbix.is_some()
        || t.cbdt.is_some()
}

fn collect_face_codepoints(face: &ttf_parser::Face<'_>, out: &mut Vec<u32>) {
    let Some(cmap) = face.tables().cmap else {
        return;
    };
    for subtable in cmap.subtables {
        if !subtable.is_unicode() {
            continue;
        }
        subtable.codepoints(|cp| {
            if let Some(ch) = char::from_u32(cp)
                && face.glyph_index(ch).is_some()
            {
                out.push(cp);
            }
        });
    }
}

fn merge_codepoint_ranges(ranges: &mut Vec<(u32, u32)>, mut points: Vec<u32>) {
    if points.is_empty() {
        return;
    }
    points.sort_unstable();
    points.dedup();

    let mut all_ranges = Vec::with_capacity(ranges.len() + points.len());
    all_ranges.extend_from_slice(ranges);

    let mut start = points[0];
    let mut end = points[0];
    for &cp in &points[1..] {
        if cp == end.saturating_add(1) {
            end = cp;
        } else {
            all_ranges.push((start, end));
            start = cp;
            end = cp;
        }
    }
    all_ranges.push((start, end));

    all_ranges.sort_unstable_by_key(|&(s, _)| s);
    ranges.clear();
    for (s, e) in all_ranges {
        if let Some(last) = ranges.last_mut()
            && s <= last.1.saturating_add(1)
        {
            last.1 = last.1.max(e);
        } else {
            ranges.push((s, e));
        }
    }
}

fn extract_family_name(face: &ttf_parser::Face<'_>) -> Option<String> {
    let mut fallback = None;
    for name in face.names() {
        let is_typographic = name.name_id == ttf_parser::name_id::TYPOGRAPHIC_FAMILY;
        let is_family = name.name_id == ttf_parser::name_id::FAMILY;
        if !is_typographic && !is_family {
            continue;
        }
        if let Some(text) = name.to_string() {
            if is_typographic {
                return Some(text);
            }
            if fallback.is_none() {
                fallback = Some(text);
            }
        }
    }
    fallback
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_pool_loads_zero_system_fonts() {
        let pool = FontPool::new();
        assert!(pool.is_empty());
        assert_eq!(pool.face_count(), 0);
        assert!(pool.font_blobs().is_empty());
        assert!(pool.families().is_empty());
    }

    #[test]
    fn invalid_font_bytes_are_rejected() {
        let mut pool = FontPool::new();
        let err = pool
            .register_font_bytes(b"not-a-font".to_vec())
            .unwrap_err();
        assert!(matches!(err, PreviewError::InvalidFont(_)));
        assert!(pool.is_empty());
    }

    #[test]
    fn registers_valid_font_bytes_and_populates_generic_families() {
        let font_bytes = typst_assets::fonts().next().expect("typst bundled font");
        let mut pool = FontPool::new();
        let added = pool.register_font_bytes(font_bytes.to_vec()).unwrap();
        assert!(added >= 1);
        assert_eq!(pool.face_count(), added);
        assert_eq!(pool.font_blobs().len(), 1);
        assert!(pool.sans_serif_family().is_some());

        #[cfg(feature = "svg-text")]
        {
            let db = pool.database();
            let sans = db.query(&usvg::fontdb::Query {
                families: &[usvg::fontdb::Family::SansSerif],
                ..Default::default()
            });
            assert!(sans.is_some());
        }
    }
}
