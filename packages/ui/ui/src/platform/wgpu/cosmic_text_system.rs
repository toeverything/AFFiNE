use crate::collections::HashMap;
use crate::{
    Bounds, DevicePixels, FallbackFontClass, Font, FontFallbacks, FontFeatures, FontId,
    FontMetrics, FontRun, GlyphId, IsZero as _, LineLayout, MissingGlyph, MissingGlyphSink, Pixels,
    PlatformTextSystem, RenderGlyphParams, SUBPIXEL_VARIANTS_X, SUBPIXEL_VARIANTS_Y, ShapedGlyph,
    ShapedRun, SharedString, Size, TextRenderingMode, point, size,
};
use anyhow::{Context as _, Ok, Result};
use cosmic_text::{
    Attrs, AttrsList, Ellipsize, Family, Font as CosmicTextFont,
    FontFeatures as CosmicFontFeatures, FontSystem, ShapeBuffer, ShapeLine, Stretch, Style, Weight,
};

use itertools::Itertools;
use parking_lot::RwLock;
use smallvec::SmallVec;
use std::{borrow::Cow, ops::Range, sync::Arc};
use swash::{
    scale::{Render, ScaleContext, Source, StrikeWith},
    zeno::{Format, Vector},
};
use unicode_segmentation::UnicodeSegmentation;

pub struct CosmicTextSystem(RwLock<CosmicTextSystemState>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct FontKey {
    family: SharedString,
    features: FontFeatures,
    fallbacks: Option<FontFallbacks>,
}

impl FontKey {
    fn new(family: SharedString, features: FontFeatures, fallbacks: Option<FontFallbacks>) -> Self {
        Self {
            family,
            features,
            fallbacks,
        }
    }
}

const WGHT_TAG: swash::Tag = swash::tag_from_bytes(b"wght");

const SLNT_TAG: swash::Tag = swash::tag_from_bytes(b"slnt");

fn variation_coords(
    font: &CosmicTextFont,
    weight: Weight,
    slanted: bool,
) -> SmallVec<[swash::NormalizedCoord; 4]> {
    let variations = font.as_swash().variations();
    let slnt = variations.find_by_tag(SLNT_TAG);
    let angle = slnt.map_or(0.0, |axis| if slanted { axis.min_value() } else { 0.0 });
    variations
        .normalized_coords([("wght", weight.0 as f32), ("slnt", angle)])
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct LoadedFontKey {
    database_id: cosmic_text::fontdb::ID,
    font: FontKey,
    weight: u16,
    slanted: bool,
}

struct CosmicTextSystemState {
    font_system: FontSystem,
    scratch: ShapeBuffer,
    swash_scale_context: ScaleContext,
    pending_glyph_images: HashMap<RenderGlyphParams, swash::scale::image::Image>,
    /// Contains all already loaded fonts, including all faces. Indexed by `FontId`.
    loaded_fonts: Vec<LoadedFont>,
    loaded_font_ids_by_key: HashMap<LoadedFontKey, FontId>,
    /// Caches the `FontId`s associated with a specific family to avoid iterating the font database
    /// for every font face in a family.
    font_ids_by_family_cache: HashMap<FontKey, SmallVec<[FontId; 4]>>,
    system_font_fallback: String,
    missing_glyph_sink: Option<Arc<dyn MissingGlyphSink>>,
}

struct LoadedFont {
    font: Arc<CosmicTextFont>,
    weight: Weight,
    // Cosmic shaping applies weight. Keep that instance's coordinates to preserve
    // kerning and add only the advance difference introduced by slant.
    upright_coords: Option<SmallVec<[swash::NormalizedCoord; 4]>>,
    normalized_coords: SmallVec<[swash::NormalizedCoord; 4]>,
    features: CosmicFontFeatures,
    is_known_emoji_font: bool,
    /// resolved at load time so `layout_line` shares one chain across faces.
    /// `Arc` keeps clone cheap on the per-run hot path.
    user_fallback_chain: Arc<[(FontId, SharedString)]>,
}

struct FontMatchProperties {
    primary_family_name: SharedString,
    stretch: Stretch,
    style: Style,
    weight: Weight,
    features: CosmicFontFeatures,
    fallback_chain: Arc<[(FontId, SharedString)]>,
}

impl FontMatchProperties {
    fn attributes<'a>(&'a self, font_id: FontId, family_name: &'a str) -> Attrs<'a> {
        Attrs::new()
            .metadata(font_id.0)
            .family(Family::Name(family_name))
            .stretch(self.stretch)
            .style(self.style)
            .weight(self.weight)
            .font_features(self.features.clone())
    }
}

impl CosmicTextSystem {
    /// Returns the selected face's weight and style, which may differ from the request.
    pub fn font_weight_and_style(
        &self,
        font_id: FontId,
    ) -> Result<(crate::FontWeight, crate::FontStyle)> {
        let state = self.0.read();
        let font = state
            .loaded_fonts
            .get(font_id.0)
            .context("invalid font ID")?;
        let face = state
            .font_system
            .db()
            .face(font.font.id())
            .context("font face not found")?;
        let style = match face.style {
            cosmic_text::Style::Normal if font.upright_coords.is_some() => {
                crate::FontStyle::Oblique
            }
            cosmic_text::Style::Normal => crate::FontStyle::Normal,
            cosmic_text::Style::Italic => crate::FontStyle::Italic,
            cosmic_text::Style::Oblique => crate::FontStyle::Oblique,
        };
        Ok((crate::FontWeight(font.weight.0 as f32), style))
    }

    /// Builds reports for unresolved source indices after an outer text system
    /// has applied its own fallback.
    pub fn missing_glyphs(
        &self,
        text: &str,
        font_runs: &[FontRun],
        missing_text_indices: impl IntoIterator<Item = usize>,
    ) -> Vec<MissingGlyph> {
        self.0
            .read()
            .missing_glyphs(text, font_runs, missing_text_indices)
    }

    pub fn new(system_font_fallback: &str) -> Self {
        let font_system = FontSystem::new();

        Self(RwLock::new(CosmicTextSystemState {
            font_system,
            scratch: ShapeBuffer::default(),
            swash_scale_context: ScaleContext::new(),
            pending_glyph_images: HashMap::default(),
            loaded_fonts: Vec::new(),
            loaded_font_ids_by_key: HashMap::default(),
            font_ids_by_family_cache: HashMap::default(),
            system_font_fallback: system_font_fallback.to_string(),
            missing_glyph_sink: None,
        }))
    }

    pub fn new_without_system_fonts(system_font_fallback: &str) -> Self {
        let font_system = FontSystem::new_with_locale_and_db(
            "en-US".to_string(),
            cosmic_text::fontdb::Database::new(),
        );

        Self(RwLock::new(CosmicTextSystemState {
            font_system,
            scratch: ShapeBuffer::default(),
            swash_scale_context: ScaleContext::new(),
            pending_glyph_images: HashMap::default(),
            loaded_fonts: Vec::new(),
            loaded_font_ids_by_key: HashMap::default(),
            font_ids_by_family_cache: HashMap::default(),
            system_font_fallback: system_font_fallback.to_string(),
            missing_glyph_sink: None,
        }))
    }
}

impl PlatformTextSystem for CosmicTextSystem {
    fn add_fonts(&self, fonts: Vec<Cow<'static, [u8]>>) -> Result<()> {
        self.0.write().add_fonts(fonts)
    }

    fn set_missing_glyph_sink(&self, sink: Option<Arc<dyn MissingGlyphSink>>) {
        self.0.write().missing_glyph_sink = sink;
    }

    fn all_font_names(&self) -> Vec<String> {
        let mut result = self
            .0
            .read()
            .font_system
            .db()
            .faces()
            .filter_map(|face| face.families.first().map(|family| family.0.clone()))
            .collect_vec();
        result.sort_unstable();
        result.dedup();
        result
    }

    fn font_id(&self, font: &Font) -> Result<FontId> {
        let mut state = self.0.write();
        let key = FontKey::new(
            font.family.clone(),
            font.features.clone(),
            font.fallbacks.clone(),
        );
        let candidates = if let Some(font_ids) = state.font_ids_by_family_cache.get(&key) {
            font_ids.as_slice()
        } else {
            let font_ids =
                state.load_family(&font.family, &font.features, font.fallbacks.as_ref())?;
            state.font_ids_by_family_cache.insert(key.clone(), font_ids);
            state.font_ids_by_family_cache[&key].as_ref()
        };

        let ix = find_best_match(font, candidates, &state)?;
        let base_id = candidates[ix];
        let requested_weight = Weight(font.weight.0.round().clamp(1.0, 1000.0) as u16);

        state.resolve_variations(base_id, &key, requested_weight, font.style)
    }

    fn prewarm_fonts(&self, font_ids: &[FontId]) {
        self.0.write().prewarm_fonts(font_ids);
    }

    fn font_metrics(&self, font_id: FontId) -> FontMetrics {
        let state = self.0.read();
        let loaded = state.loaded_font(font_id);
        let metrics = loaded.font.as_swash().metrics(&loaded.normalized_coords);

        FontMetrics {
            units_per_em: metrics.units_per_em as u32,
            ascent: metrics.ascent,
            descent: -metrics.descent,
            line_gap: metrics.leading,
            underline_position: metrics.underline_offset,
            underline_thickness: metrics.stroke_size,
            cap_height: metrics.cap_height,
            x_height: metrics.x_height,
            bounding_box: Bounds {
                origin: point(0.0, 0.0),
                size: size(metrics.max_width, metrics.ascent + metrics.descent),
            },
        }
    }

    fn typographic_bounds(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Bounds<f32>> {
        let lock = self.0.read();
        let loaded = lock.loaded_font(font_id);
        let glyph_metrics = loaded
            .font
            .as_swash()
            .glyph_metrics(&loaded.normalized_coords);
        let glyph_id = glyph_id.0 as u16;
        Ok(Bounds {
            origin: point(0.0, 0.0),
            size: size(
                glyph_metrics.advance_width(glyph_id),
                glyph_metrics.advance_height(glyph_id),
            ),
        })
    }

    fn advance(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Size<f32>> {
        self.0.read().advance(font_id, glyph_id)
    }

    fn glyph_for_char(&self, font_id: FontId, ch: char) -> Option<GlyphId> {
        self.0.read().glyph_for_char(font_id, ch)
    }

    fn glyph_raster_bounds(&self, params: &RenderGlyphParams) -> Result<Bounds<DevicePixels>> {
        self.0.write().raster_bounds(params)
    }

    fn rasterize_glyph(
        &self,
        params: &RenderGlyphParams,
        raster_bounds: Bounds<DevicePixels>,
    ) -> Result<(Size<DevicePixels>, Vec<u8>)> {
        self.0.write().rasterize_glyph(params, raster_bounds)
    }

    fn layout_line(&self, text: &str, font_size: Pixels, runs: &[FontRun]) -> LineLayout {
        self.layout_line_with_direction(text, font_size, runs, crate::BaseDirection::Ltr)
    }

    fn layout_line_with_direction(
        &self,
        text: &str,
        font_size: Pixels,
        runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> LineLayout {
        let mut state = self.0.write();
        if let Some(mark) = crate::bidi_direction_override_mark(text, base_direction) {
            let mark_len = mark.len_utf8();
            let mut prefixed = String::with_capacity(mark_len + text.len());
            prefixed.push(mark);
            prefixed.push_str(text);
            let mut prefixed_runs = runs.to_vec();
            if let Some(first) = prefixed_runs.first_mut() {
                first.len += mark_len;
            }
            let mut layout = state.layout_line(&prefixed, font_size, &prefixed_runs);
            crate::strip_leading_direction_mark(&mut layout, mark_len, text.len());
            layout.apply_bidi_levels(text, base_direction);
            return layout;
        }
        let mut layout = state.layout_line(text, font_size, runs);
        layout.apply_bidi_levels(text, base_direction);
        layout
    }

    fn recommended_rendering_mode(
        &self,
        _font_id: FontId,
        _font_size: Pixels,
    ) -> TextRenderingMode {
        TextRenderingMode::Subpixel
    }
}

impl CosmicTextSystemState {
    fn loaded_font(&self, font_id: FontId) -> &LoadedFont {
        &self.loaded_fonts[font_id.0]
    }

    fn font_match_properties(&self, font_id: FontId) -> Option<FontMatchProperties> {
        let loaded_font = self.loaded_font(font_id);
        let Some(face) = self.font_system.db().face(loaded_font.font.id()) else {
            log::warn!("font face not found in database for font_id {:?}", font_id);
            return None;
        };
        let Some(first_family) = face.families.first() else {
            log::warn!("font face has no family names for font_id {:?}", font_id);
            return None;
        };

        Some(FontMatchProperties {
            primary_family_name: first_family.0.clone().into(),
            stretch: face.stretch,
            style: face.style,
            weight: loaded_font.weight,
            features: loaded_font.features.clone(),
            fallback_chain: Arc::clone(&loaded_font.user_fallback_chain),
        })
    }

    fn resolve_variations(
        &mut self,
        base_id: FontId,
        font_key: &FontKey,
        requested_weight: Weight,
        style: crate::FontStyle,
    ) -> Result<FontId> {
        let base = &self.loaded_fonts[base_id.0];
        let axes = base.font.as_swash().variations();
        let requested_weight = if axes.find_by_tag(WGHT_TAG).is_some() {
            requested_weight
        } else {
            base.weight
        };
        let slanted = style != crate::FontStyle::Normal
            && axes.find_by_tag(SLNT_TAG).is_some()
            && self
                .font_system
                .db()
                .face(base.font.id())
                .is_some_and(|face| face.style == Style::Normal);
        if base.weight == requested_weight && base.upright_coords.is_some() == slanted {
            return Ok(base_id);
        }
        let database_id = base.font.id();
        let key = LoadedFontKey {
            database_id,
            font: font_key.clone(),
            weight: requested_weight.0,
            slanted,
        };
        if let Some(&font_id) = self.loaded_font_ids_by_key.get(&key) {
            return Ok(font_id);
        }

        let features = base.features.clone();
        let is_known_emoji_font = base.is_known_emoji_font;
        let user_fallback_chain = Arc::clone(&base.user_fallback_chain);

        let font = self
            .font_system
            .get_font(database_id, requested_weight)
            .context("Could not load variable font weight")?;
        let normalized_coords = variation_coords(&font, requested_weight, slanted);

        let font_id = FontId(self.loaded_fonts.len());
        self.loaded_fonts.push(LoadedFont {
            upright_coords: slanted.then(|| variation_coords(&font, requested_weight, false)),
            font,
            weight: requested_weight,
            normalized_coords,
            features,
            is_known_emoji_font,
            user_fallback_chain,
        });
        self.loaded_font_ids_by_key.insert(key, font_id);
        Ok(font_id)
    }

    fn prewarm_fonts(&mut self, font_ids: &[FontId]) {
        for &font_id in font_ids {
            let Some(properties) = self.font_match_properties(font_id) else {
                continue;
            };
            let primary_attributes =
                properties.attributes(font_id, &properties.primary_family_name);
            self.font_system.get_font_matches(&primary_attributes);

            for (fallback_id, fallback_name) in &*properties.fallback_chain {
                let fallback_attributes = properties.attributes(*fallback_id, fallback_name);
                self.font_system.get_font_matches(&fallback_attributes);
            }
        }
    }
    fn add_fonts(&mut self, fonts: Vec<Cow<'static, [u8]>>) -> Result<()> {
        self.font_ids_by_family_cache.clear();
        let db = self.font_system.db_mut();
        for bytes in fonts {
            db.load_font_source(cosmic_text::fontdb::Source::Binary(Arc::new(bytes)));
        }
        Ok(())
    }
    fn load_family(
        &mut self,
        name: &str,
        features: &FontFeatures,
        fallbacks: Option<&FontFallbacks>,
    ) -> Result<SmallVec<[FontId; 4]>> {
        let loaded_font_key = FontKey::new(
            SharedString::from(name.to_owned()),
            features.clone(),
            fallbacks.cloned(),
        );

        // recurse with `fallbacks = None` so a fallback family cannot pull in
        // another chain. missing fallback families are dropped so a typo in
        // settings still lets the primary family load.
        let user_fallback_chain: Arc<[(FontId, SharedString)]> = match fallbacks {
            Some(fallbacks) if !fallbacks.fallback_list().is_empty() => {
                let mut chain: Vec<(FontId, SharedString)> = Vec::new();
                for fallback_name in fallbacks.fallback_list() {
                    let fb_key = FontKey::new(
                        SharedString::from(fallback_name.clone()),
                        features.clone(),
                        None,
                    );
                    let fb_ids = if let Some(cached) = self.font_ids_by_family_cache.get(&fb_key) {
                        cached.clone()
                    } else {
                        let loaded = self.load_family(fallback_name, features, None)?;
                        self.font_ids_by_family_cache
                            .insert(fb_key.clone(), loaded.clone());
                        loaded
                    };
                    let Some(&fb_id) = fb_ids.first() else {
                        continue;
                    };
                    let db_id = self.loaded_fonts[fb_id.0].font.id();
                    if let Some(face) = self.font_system.db().face(db_id)
                        && let Some(family) = face.families.first()
                    {
                        chain.push((fb_id, SharedString::from(family.0.clone())));
                    }
                }
                Arc::from(chain)
            }
            _ => Arc::from(Vec::new()),
        };

        let name = crate::font_name_with_fallbacks(name, &self.system_font_fallback);

        let families = self
            .font_system
            .db()
            .faces()
            .filter(|face| face.families.iter().any(|family| *name == family.0))
            .map(|face| (face.id, face.post_script_name.clone(), face.weight))
            .collect::<SmallVec<[_; 4]>>();

        let cosmic_features = cosmic_font_features(features)?;

        let mut loaded_font_ids = SmallVec::new();
        for (database_id, postscript_name, face_weight) in families {
            let key = LoadedFontKey {
                database_id,
                font: loaded_font_key.clone(),
                weight: face_weight.0,
                slanted: false,
            };
            if let Some(&font_id) = self.loaded_font_ids_by_key.get(&key) {
                self.loaded_fonts[font_id.0].user_fallback_chain = Arc::clone(&user_fallback_chain);
                loaded_font_ids.push(font_id);
                continue;
            }

            let font = self
                .font_system
                .get_font(database_id, face_weight)
                .context("Could not load font")?;

            // HACK: To let the storybook run and render Windows caption icons. We should actually do better font fallback.
            let allowed_bad_font_names = [
                "SegoeFluentIcons", // NOTE: Segoe fluent icons postscript name is inconsistent
                "Segoe Fluent Icons",
            ];

            // This only decides whether a face can be a primary font. The
            // editor measures layout with the width of 'm' and would panic
            // without it.
            //
            // Don't remove the face from the font database. Arabic, Devanagari
            // and emoji fonts often have no Latin glyphs, and they are exactly
            // what cosmic-text falls back to when the primary font lacks a
            // glyph.
            if font.as_swash().charmap().map('m') == 0
                && !allowed_bad_font_names.contains(&postscript_name.as_str())
                && !crate::platform::wgpu::fast::emoji_fonts::may_load_without_m(&postscript_name)
            {
                continue;
            };

            let normalized_coords = variation_coords(&font, face_weight, false);
            let font_id = FontId(self.loaded_fonts.len());
            loaded_font_ids.push(font_id);
            self.loaded_fonts.push(LoadedFont {
                font,
                weight: face_weight,
                upright_coords: None,
                normalized_coords,
                features: cosmic_features.clone(),
                is_known_emoji_font: check_is_known_emoji_font(&postscript_name),
                user_fallback_chain: Arc::clone(&user_fallback_chain),
            });
            self.loaded_font_ids_by_key.insert(key, font_id);
        }

        Ok(loaded_font_ids)
    }

    fn advance(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Size<f32>> {
        let loaded = self.loaded_font(font_id);
        let glyph_metrics = loaded
            .font
            .as_swash()
            .glyph_metrics(&loaded.normalized_coords);
        Ok(Size {
            width: glyph_metrics.advance_width(glyph_id.0 as u16),
            height: glyph_metrics.advance_height(glyph_id.0 as u16),
        })
    }

    fn glyph_for_char(&self, font_id: FontId, ch: char) -> Option<GlyphId> {
        let glyph_id = self.loaded_font(font_id).font.as_swash().charmap().map(ch);
        if glyph_id == 0 {
            None
        } else {
            Some(GlyphId(glyph_id.into()))
        }
    }

    fn raster_bounds(&mut self, params: &RenderGlyphParams) -> Result<Bounds<DevicePixels>> {
        let image = self.render_glyph_image(params)?;
        if image.placement.width == 0 || image.placement.height == 0 {
            return Ok(Bounds::default());
        }
        // Pad non-empty glyph tiles with a 1px transparent gutter on every side so bilinear
        // sampling under zoomed/rotated transforms never clips edge coverage or bleeds into
        // adjacent atlas tiles.
        let bounds = Bounds {
            origin: point(
                (image.placement.left - 1).into(),
                (-image.placement.top - 1).into(),
            ),
            size: size(
                (image.placement.width + 2).into(),
                (image.placement.height + 2).into(),
            ),
        };
        self.pending_glyph_images.insert(params.clone(), image);
        Ok(bounds)
    }
    fn rasterize_glyph(
        &mut self,
        params: &RenderGlyphParams,
        glyph_bounds: Bounds<DevicePixels>,
    ) -> Result<(Size<DevicePixels>, Vec<u8>)> {
        if glyph_bounds.size.width.0 == 0 || glyph_bounds.size.height.0 == 0 {
            anyhow::bail!("glyph bounds are empty");
        }

        let mut image = match self.pending_glyph_images.remove(params) {
            Some(image) => image,
            None => self.render_glyph_image(params)?,
        };
        let bitmap_size = glyph_bounds.size;
        let pad_bitmap = |src: &[u8], src_w: usize, src_h: usize, bpp: usize| -> Vec<u8> {
            let dst_w = bitmap_size.width.0 as usize;
            let dst_h = bitmap_size.height.0 as usize;
            let mut out = vec![0u8; dst_w * dst_h * bpp];
            let copy_w = src_w.min(dst_w.saturating_sub(2));
            let copy_h = src_h.min(dst_h.saturating_sub(2));
            let src_stride = src_w * bpp;
            let dst_stride = dst_w * bpp;
            let row_bytes = copy_w * bpp;
            for y in 0..copy_h {
                let src_off = y * src_stride;
                let dst_off = (y + 1) * dst_stride + bpp;
                out[dst_off..dst_off + row_bytes]
                    .copy_from_slice(&src[src_off..src_off + row_bytes]);
            }
            out
        };
        let src_w = image.placement.width as usize;
        let src_h = image.placement.height as usize;
        match image.content {
            swash::scale::image::Content::Color | swash::scale::image::Content::SubpixelMask => {
                // Convert from RGBA to BGRA.
                for pixel in image.data.chunks_exact_mut(4) {
                    pixel.swap(0, 2);
                }
                Ok((bitmap_size, pad_bitmap(&image.data, src_w, src_h, 4)))
            }
            swash::scale::image::Content::Mask => {
                if params.subpixel_rendering {
                    // We must always return RGBA data when subpixel rendering is requested.
                    let expanded: Vec<u8> = image.data.iter().flat_map(|&a| [a, a, a, a]).collect();
                    Ok((bitmap_size, pad_bitmap(&expanded, src_w, src_h, 4)))
                } else {
                    Ok((bitmap_size, pad_bitmap(&image.data, src_w, src_h, 1)))
                }
            }
        }
    }

    fn render_glyph_image(
        &mut self,
        params: &RenderGlyphParams,
    ) -> Result<swash::scale::image::Image> {
        let loaded_font = &self.loaded_fonts[params.font_id.0];
        let font_ref = loaded_font.font.as_swash();
        let pixel_size = f32::from(params.font_size);

        let subpixel_offset = Vector::new(
            params.subpixel_variant.x as f32 / SUBPIXEL_VARIANTS_X as f32 / params.scale_factor,
            params.subpixel_variant.y as f32 / SUBPIXEL_VARIANTS_Y as f32 / params.scale_factor,
        );

        let mut scaler = self
            .swash_scale_context
            .builder(font_ref)
            .size(pixel_size * params.scale_factor)
            .hint(params.subpixel_rendering)
            .normalized_coords(&loaded_font.normalized_coords)
            .build();

        let sources: &[Source] = if params.is_emoji {
            &[
                Source::ColorOutline(0),
                Source::ColorBitmap(StrikeWith::BestFit),
                Source::Outline,
            ]
        } else {
            &[Source::Bitmap(StrikeWith::ExactSize), Source::Outline]
        };

        let mut renderer = Render::new(sources);
        if params.subpixel_rendering {
            // There seems to be a bug in Swash where the B and R values are swapped.
            renderer
                .format(Format::subpixel_bgra())
                .offset(subpixel_offset);
        } else {
            renderer.format(Format::Alpha).offset(subpixel_offset);
        }

        let glyph_id: u16 = params.glyph_id.0.try_into()?;
        renderer
            .render(&mut scaler, glyph_id)
            .with_context(|| format!("unable to render glyph via swash for {params:?}"))
    }

    /// This is used when cosmic_text has chosen a fallback font instead of using the requested
    /// font, typically to handle some unicode characters. When this happens, `loaded_fonts` may not
    /// yet have an entry for this fallback font, and so one is added.
    ///
    /// Note that callers shouldn't use this `FontId` somewhere that will retrieve the corresponding
    /// `LoadedFont.features`, as it will have an arbitrarily chosen or empty value. The only
    /// current use of this field is for the *input* of `layout_line`, and so it's fine to use
    /// `font_id_for_cosmic_id` when computing the *output* of `layout_line`.
    fn font_id_for_cosmic_id(
        &mut self,
        id: cosmic_text::fontdb::ID,
        requested_weight: Weight,
        wants_slant: bool,
    ) -> Result<FontId> {
        let font = self
            .font_system
            .get_font(id, requested_weight)
            .context("failed to load fallback font")?;
        let face = self
            .font_system
            .db()
            .face(id)
            .context("missing fallback font face")?;
        let axes = font.as_swash().variations();
        let effective_weight = if axes.find_by_tag(WGHT_TAG).is_some() {
            requested_weight
        } else {
            face.weight
        };
        let slanted =
            wants_slant && face.style == Style::Normal && axes.find_by_tag(SLNT_TAG).is_some();
        if let Some(ix) = self.loaded_fonts.iter().position(|loaded| {
            loaded.font.id() == id
                && loaded.weight == effective_weight
                && loaded.upright_coords.is_some() == slanted
        }) {
            return Ok(FontId(ix));
        }
        let normalized_coords = variation_coords(&font, effective_weight, slanted);
        let font_id = FontId(self.loaded_fonts.len());
        self.loaded_fonts.push(LoadedFont {
            upright_coords: slanted.then(|| variation_coords(&font, effective_weight, false)),
            font,
            weight: effective_weight,
            normalized_coords,
            features: CosmicFontFeatures::new(),
            is_known_emoji_font: check_is_known_emoji_font(&face.post_script_name),
            user_fallback_chain: Arc::from(Vec::new()),
        });

        Ok(font_id)
    }
    fn layout_line(&mut self, text: &str, font_size: Pixels, font_runs: &[FontRun]) -> LineLayout {
        if contains_paragraph_separator(text) {
            self.layout_line_with_separators(text, font_size, font_runs)
        } else {
            self.layout_line_no_separators(text, font_size, font_runs)
        }
    }

    fn layout_line_with_separators(
        &mut self,
        text: &str,
        font_size: Pixels,
        font_runs: &[FontRun],
    ) -> LineLayout {
        let mut layout = LineLayout {
            font_size,
            len: text.len(),
            ..Default::default()
        };
        let mut paragraph_start = 0;

        for (separator_start, separator) in text
            .char_indices()
            .filter(|(_, character)| is_paragraph_separator(*character))
        {
            let separator_end = separator_start + separator.len_utf8();
            self.shape_segment(
                text,
                paragraph_start..separator_start,
                font_size,
                font_runs,
                &mut layout,
            );
            self.shape_segment(
                text,
                separator_start..separator_end,
                font_size,
                font_runs,
                &mut layout,
            );
            paragraph_start = separator_end;
        }

        self.shape_segment(
            text,
            paragraph_start..text.len(),
            font_size,
            font_runs,
            &mut layout,
        );

        layout
    }

    fn shape_segment(
        &mut self,
        text: &str,
        range: Range<usize>,
        font_size: Pixels,
        font_runs: &[FontRun],
        layout: &mut LineLayout,
    ) {
        if range.is_empty() {
            return;
        }

        let segment_font_runs = clip_font_runs(font_runs, range.clone());
        let segment =
            self.layout_line_no_separators(&text[range.clone()], font_size, &segment_font_runs);

        let mut segment_runs = segment.runs;
        for run in &mut segment_runs {
            for glyph in &mut run.glyphs {
                glyph.index += range.start;
                glyph.position.x += layout.width;
            }
        }

        for mut run in segment_runs {
            if let Some(same_run) = layout
                .runs
                .last_mut()
                .filter(|last| last.font_id == run.font_id)
            {
                same_run.glyphs.append(&mut run.glyphs);
            } else {
                layout.runs.push(run);
            }
        }

        layout.width += segment.width;
        layout.ascent = layout.ascent.max(segment.ascent);
        layout.descent = layout.descent.max(segment.descent);
    }

    fn layout_line_no_separators(
        &mut self,
        text: &str,
        font_size: Pixels,
        font_runs: &[FontRun],
    ) -> LineLayout {
        let mut attrs_list = AttrsList::new(&Attrs::new());
        let mut offs = 0;
        for run in font_runs {
            let run_end = offs + run.len;

            let Some(properties) = self.font_match_properties(run.font_id) else {
                offs = run_end;
                continue;
            };

            let primary_attrs = properties.attributes(run.font_id, &properties.primary_family_name);
            let fallback_attrs: SmallVec<[Attrs<'_>; 4]> = properties
                .fallback_chain
                .iter()
                .map(|(font_id, family_name)| properties.attributes(*font_id, family_name))
                .collect();

            let spans = if properties.fallback_chain.is_empty() {
                let mut spans = SmallVec::<[RunSpan; 4]>::new();
                spans.push(RunSpan {
                    start: offs,
                    end: run_end,
                    slot: None,
                    font_id: run.font_id,
                });
                spans
            } else {
                let loaded_fonts = &self.loaded_fonts;
                let covers = |id: FontId, ch: char| charmap_covers(loaded_fonts, id, ch);
                compute_run_spans(
                    text,
                    offs,
                    run.len,
                    run.font_id,
                    &properties.fallback_chain,
                    &covers,
                )
            };

            for span in spans {
                let attrs = match span.slot {
                    None => &primary_attrs,
                    Some(ix) => &fallback_attrs[ix],
                };
                attrs_list.add_span(span.start..span.end, attrs);
            }
            offs = run_end;
        }

        let line = ShapeLine::new(
            &mut self.font_system,
            text,
            &attrs_list,
            cosmic_text::Shaping::Advanced,
            4,
        );
        let mut layout_lines = Vec::with_capacity(1);
        line.layout_to_buffer(
            &mut self.scratch,
            f32::from(font_size),
            None, // We do our own wrapping
            cosmic_text::Wrap::None,
            Ellipsize::None,
            None,
            &mut layout_lines,
            None,
            cosmic_text::Hinting::Disabled,
        );

        let Some(layout) = layout_lines.first() else {
            return LineLayout {
                font_size,
                width: Pixels::ZERO,
                ascent: Pixels::ZERO,
                descent: Pixels::ZERO,
                runs: Vec::new(),
                len: text.len(),
                base_direction: crate::BaseDirection::Ltr,
            };
        };

        let missing_glyphs = self.missing_glyph_sink.as_ref().map(|_| {
            self.missing_glyphs(
                text,
                font_runs,
                layout
                    .glyphs
                    .iter()
                    .filter(|glyph| glyph.glyph_id == 0)
                    .map(|glyph| glyph.start),
            )
        });

        let mut runs: Vec<ShapedRun> = Vec::new();
        let mut advance_shift = 0.0;
        for glyph in &layout.glyphs {
            let mut font_id = FontId(glyph.metadata);
            let mut loaded_font = self.loaded_font(font_id);
            if loaded_font.font.id() != glyph.font_id {
                let requested_weight = loaded_font.weight;
                match self.font_id_for_cosmic_id(
                    glyph.font_id,
                    requested_weight,
                    loaded_font.upright_coords.is_some(),
                ) {
                    std::result::Result::Ok(resolved_id) => {
                        font_id = resolved_id;
                        loaded_font = self.loaded_font(font_id);
                    }
                    Err(error) => {
                        log::warn!(
                            "failed to resolve cosmic font id {:?}: {error:#}",
                            glyph.font_id
                        );
                        continue;
                    }
                }
            }
            let is_emoji = loaded_font.is_known_emoji_font;

            // HACK: Prevent crash caused by variation selectors.
            if glyph.glyph_id == 3 && is_emoji {
                continue;
            }

            let advance_delta = loaded_font.upright_coords.as_ref().map_or(0.0, |upright| {
                let font = loaded_font.font.as_swash();
                let upright = font.glyph_metrics(upright).scale(glyph.font_size);
                let varied = font
                    .glyph_metrics(&loaded_font.normalized_coords)
                    .scale(glyph.font_size);
                varied.advance_width(glyph.glyph_id) - upright.advance_width(glyph.glyph_id)
            });
            let shift = if line.rtl {
                -advance_shift - advance_delta
            } else {
                advance_shift
            };
            advance_shift += advance_delta;
            let shaped_glyph = ShapedGlyph {
                id: GlyphId(glyph.glyph_id as u32),
                position: point(
                    (glyph.x + shift + glyph.x_offset * f32::from(font_size)).into(),
                    (glyph.y - glyph.y_offset * f32::from(font_size)).into(),
                ),
                index: glyph.start,
                is_emoji,
            };

            if let Some(last_run) = runs.last_mut().filter(|last_run| {
                last_run.font_id == font_id && last_run.bidi_level == glyph.level.number()
            }) {
                last_run.glyphs.push(shaped_glyph);
            } else {
                runs.push(ShapedRun {
                    font_id,
                    glyphs: vec![shaped_glyph],
                    bidi_level: glyph.level.number(),
                });
            }
        }

        if line.rtl && advance_shift != 0.0 {
            for glyph in runs.iter_mut().flat_map(|run| &mut run.glyphs) {
                glyph.position.x += crate::px(advance_shift);
            }
        }
        if let Some((sink, missing_glyphs)) = self.missing_glyph_sink.as_ref().zip(missing_glyphs) {
            sink.report(missing_glyphs);
        }

        LineLayout {
            font_size,
            width: (layout.w + advance_shift).into(),
            ascent: layout.max_ascent.into(),
            descent: layout.max_descent.into(),
            runs,
            len: text.len(),
            base_direction: if line.rtl {
                crate::BaseDirection::Rtl
            } else {
                crate::BaseDirection::Ltr
            },
        }
    }

    fn missing_glyphs(
        &self,
        text: &str,
        font_runs: &[FontRun],
        missing_text_indices: impl IntoIterator<Item = usize>,
    ) -> Vec<MissingGlyph> {
        let mut missing_text_indices = missing_text_indices.into_iter().peekable();
        if missing_text_indices.peek().is_none() {
            return Vec::new();
        }
        let mut missing_text_indices = missing_text_indices.collect::<Vec<_>>();
        missing_text_indices.sort_unstable();
        missing_text_indices.dedup();

        let mut font_run_index = 0;
        let mut font_run_end = font_runs.first().map_or(0, |font_run| font_run.len);
        let mut missing_glyphs = Vec::new();
        let mut missing_index = 0;
        for (grapheme_start, grapheme) in text.grapheme_indices(true) {
            let grapheme_end = grapheme_start + grapheme.len();
            while missing_text_indices
                .get(missing_index)
                .is_some_and(|text_index| *text_index < grapheme_start)
            {
                missing_index += 1;
            }
            let Some(&text_index) = missing_text_indices.get(missing_index) else {
                break;
            };
            if text_index >= grapheme_end {
                continue;
            }

            while font_run_end <= text_index && font_run_index + 1 < font_runs.len() {
                font_run_index += 1;
                let Some(font_run) = font_runs.get(font_run_index) else {
                    break;
                };
                font_run_end += font_run.len;
            }
            let font_class = self.fallback_font_class(
                font_runs
                    .get(font_run_index)
                    .or_else(|| font_runs.last())
                    .map(|font_run| font_run.font_id),
            );
            missing_glyphs.push(MissingGlyph::new(grapheme.into(), font_class));
            while missing_text_indices
                .get(missing_index)
                .is_some_and(|text_index| *text_index < grapheme_end)
            {
                missing_index += 1;
            }
        }
        missing_glyphs
    }

    fn fallback_font_class(&self, font_id: Option<FontId>) -> FallbackFontClass {
        let Some(font_id) = font_id else {
            return FallbackFontClass::Proportional;
        };
        let loaded_font = self.loaded_font(font_id);
        let is_monospace = self
            .font_system
            .db()
            .face(loaded_font.font.id())
            .is_some_and(|face| face.monospaced);
        if is_monospace {
            FallbackFontClass::Monospace
        } else {
            FallbackFontClass::Proportional
        }
    }
}

#[inline(always)]
fn is_paragraph_separator(character: char) -> bool {
    unicode_bidi::bidi_class(character) == unicode_bidi::BidiClass::B
}

fn contains_paragraph_separator(text: &str) -> bool {
    if text
        .bytes()
        .any(|byte| matches!(byte, b'\n' | b'\r' | 0x1c | 0x1d | 0x1e))
    {
        return true;
    }

    !text.is_ascii() && text.chars().any(is_paragraph_separator)
}

fn clip_font_runs(font_runs: &[FontRun], range: Range<usize>) -> SmallVec<[FontRun; 4]> {
    let mut clipped = SmallVec::new();
    let mut offs = 0;
    for run in font_runs {
        let run_start = offs;
        offs += run.len;
        if offs <= range.start {
            continue;
        }
        if run_start >= range.end {
            break;
        }
        let start = run_start.max(range.start);
        let end = offs.min(range.end);
        if start < end {
            clipped.push(FontRun {
                len: end - start,
                font_id: run.font_id,
            });
        }
    }
    clipped
}

#[cfg(all(feature = "font-kit", not(target_family = "wasm")))]
fn find_best_match(
    font: &Font,
    candidates: &[FontId],
    state: &CosmicTextSystemState,
) -> Result<usize> {
    let candidate_properties = candidates
        .iter()
        .map(|font_id| {
            let database_id = state.loaded_font(*font_id).font.id();
            let face_info = state
                .font_system
                .db()
                .face(database_id)
                .context("font face not found in database")?;
            Ok(face_info_into_properties(face_info))
        })
        .collect::<Result<SmallVec<[_; 4]>>>()?;

    let ix =
        font_kit::matching::find_best_match(&candidate_properties, &font_into_properties(font))
            .context("requested font family contains no font matching the other parameters")?;

    Ok(ix)
}

#[cfg(any(not(feature = "font-kit"), target_family = "wasm"))]
fn find_best_match(
    font: &Font,
    candidates: &[FontId],
    state: &CosmicTextSystemState,
) -> Result<usize> {
    if candidates.is_empty() {
        anyhow::bail!("requested font family contains no font matching the other parameters");
    }
    if candidates.len() == 1 {
        return Ok(0);
    }

    let target_weight = font.weight.0;
    let target_italic = matches!(
        font.style,
        crate::FontStyle::Italic | crate::FontStyle::Oblique
    );

    let mut best_index = 0;
    let mut best_score = u32::MAX;

    for (index, font_id) in candidates.iter().enumerate() {
        let database_id = state.loaded_font(*font_id).font.id();
        let face_info = state
            .font_system
            .db()
            .face(database_id)
            .context("font face not found in database")?;

        let is_italic = matches!(
            face_info.style,
            cosmic_text::Style::Italic | cosmic_text::Style::Oblique
        );
        let style_penalty: u32 = if is_italic == target_italic { 0 } else { 1000 };
        let weight_diff = (face_info.weight.0 as i32 - target_weight as i32).unsigned_abs();
        let score = style_penalty + weight_diff;

        if score < best_score {
            best_score = score;
            best_index = index;
        }
    }

    Ok(best_index)
}

/// one contiguous slice of a `FontRun` that maps to a single slot. `slot` is
/// `None` for the primary font and `Some(ix)` for `fallback_chain[ix]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RunSpan {
    start: usize,
    end: usize,
    slot: Option<usize>,
    font_id: FontId,
}

/// walks `text[run_offset..run_offset + run_len]` and groups codepoints into
/// spans. inheriting codepoints stay in the current span so shaping clusters
/// like emoji zwj sequences and combining marks are not torn apart.
fn compute_run_spans(
    text: &str,
    run_offset: usize,
    run_len: usize,
    primary: FontId,
    fallback_chain: &[(FontId, SharedString)],
    covers: &impl Fn(FontId, char) -> bool,
) -> SmallVec<[RunSpan; 4]> {
    let mut spans = SmallVec::new();
    let run_end = run_offset + run_len;
    if run_end <= run_offset {
        return spans;
    }
    if fallback_chain.is_empty() {
        spans.push(RunSpan {
            start: run_offset,
            end: run_end,
            slot: None,
            font_id: primary,
        });
        return spans;
    }
    let run_text = &text[run_offset..run_end];
    let mut span_start = run_offset;
    let mut span_slot: Option<usize> = None;
    let mut span_font_id = primary;
    for (grapheme_idx, grapheme) in run_text.grapheme_indices(true) {
        let abs = run_offset + grapheme_idx;
        let ch = grapheme.chars().next().unwrap_or('\0');
        let next_slot = pick_covering_slot(ch, span_slot, primary, fallback_chain, covers);
        if next_slot == span_slot {
            continue;
        }
        if abs > span_start {
            spans.push(RunSpan {
                start: span_start,
                end: abs,
                slot: span_slot,
                font_id: span_font_id,
            });
        }
        span_start = abs;
        span_slot = next_slot;
        span_font_id = slot_font_id(next_slot, primary, fallback_chain);
    }
    if span_start < run_end {
        spans.push(RunSpan {
            start: span_start,
            end: run_end,
            slot: span_slot,
            font_id: span_font_id,
        });
    }
    spans
}

fn slot_font_id(
    slot: Option<usize>,
    primary: FontId,
    fallback_chain: &[(FontId, SharedString)],
) -> FontId {
    match slot {
        None => primary,
        Some(ix) => fallback_chain[ix].0,
    }
}

fn pick_covering_slot(
    ch: char,
    current: Option<usize>,
    primary: FontId,
    fallback_chain: &[(FontId, SharedString)],
    covers: &impl Fn(FontId, char) -> bool,
) -> Option<usize> {
    if (ch as u32) <= 0x7F {
        return None;
    }
    if covers(primary, ch) {
        return None;
    }
    let current_id = slot_font_id(current, primary, fallback_chain);
    if covers(current_id, ch) {
        return current;
    }

    fallback_chain
        .iter()
        .position(|(fb_id, _)| covers(*fb_id, ch))
}

fn charmap_covers(loaded_fonts: &[LoadedFont], id: FontId, ch: char) -> bool {
    loaded_fonts
        .get(id.0)
        .is_some_and(|loaded| loaded.font.as_swash().charmap().map(ch) != 0)
}

fn cosmic_font_features(features: &FontFeatures) -> Result<CosmicFontFeatures> {
    let mut result = CosmicFontFeatures::new();
    for feature in features.0.iter() {
        let name_bytes: [u8; 4] = feature
            .0
            .as_bytes()
            .try_into()
            .context("Incorrect feature flag format")?;

        let tag = cosmic_text::FeatureTag::new(&name_bytes);

        result.set(tag, feature.1);
    }
    Ok(result)
}

#[cfg(all(feature = "font-kit", not(target_family = "wasm")))]
fn font_into_properties(font: &crate::Font) -> font_kit::properties::Properties {
    font_kit::properties::Properties {
        style: match font.style {
            crate::FontStyle::Normal => font_kit::properties::Style::Normal,
            crate::FontStyle::Italic => font_kit::properties::Style::Italic,
            crate::FontStyle::Oblique => font_kit::properties::Style::Oblique,
        },
        weight: font_kit::properties::Weight(font.weight.0),
        stretch: Default::default(),
    }
}

#[cfg(all(feature = "font-kit", not(target_family = "wasm")))]
fn face_info_into_properties(
    face_info: &cosmic_text::fontdb::FaceInfo,
) -> font_kit::properties::Properties {
    font_kit::properties::Properties {
        style: match face_info.style {
            cosmic_text::Style::Normal => font_kit::properties::Style::Normal,
            cosmic_text::Style::Italic => font_kit::properties::Style::Italic,
            cosmic_text::Style::Oblique => font_kit::properties::Style::Oblique,
        },
        weight: font_kit::properties::Weight(face_info.weight.0.into()),
        stretch: match face_info.stretch {
            cosmic_text::Stretch::Condensed => font_kit::properties::Stretch::CONDENSED,
            cosmic_text::Stretch::Expanded => font_kit::properties::Stretch::EXPANDED,
            cosmic_text::Stretch::ExtraCondensed => font_kit::properties::Stretch::EXTRA_CONDENSED,
            cosmic_text::Stretch::ExtraExpanded => font_kit::properties::Stretch::EXTRA_EXPANDED,
            cosmic_text::Stretch::Normal => font_kit::properties::Stretch::NORMAL,
            cosmic_text::Stretch::SemiCondensed => font_kit::properties::Stretch::SEMI_CONDENSED,
            cosmic_text::Stretch::SemiExpanded => font_kit::properties::Stretch::SEMI_EXPANDED,
            cosmic_text::Stretch::UltraCondensed => font_kit::properties::Stretch::ULTRA_CONDENSED,
            cosmic_text::Stretch::UltraExpanded => font_kit::properties::Stretch::ULTRA_EXPANDED,
        },
    }
}

pub(crate) fn check_is_known_emoji_font(postscript_name: &str) -> bool {
    // TODO: Include other common emoji fonts
    postscript_name == "NotoColorEmoji"
}
