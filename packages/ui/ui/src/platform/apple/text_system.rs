use crate::collections::{HashMap, HashSet};
use crate::{
    Bounds, DevicePixels, Font, FontFallbacks, FontFeatures, FontId, FontMetrics, FontRun,
    FontStyle, FontWeight, GlyphId, LineLayout, Pixels, PlatformTextSystem, RenderGlyphParams,
    Result, SUBPIXEL_VARIANTS_X, ShapedGlyph, ShapedRun, SharedString, Size, TextRenderingMode,
    point, px, size, swap_rgba_pa_to_bgra,
};
use anyhow::anyhow;
use core_foundation::{
    array::{CFArray, CFArrayRef},
    attributed_string::CFMutableAttributedString,
    base::{CFRange, TCFType},
    number::CFNumber,
    string::CFString,
};
use core_graphics::{
    base::{CGFloat, CGGlyph, kCGImageAlphaPremultipliedLast},
    color_space::CGColorSpace,
    context::{CGContext, CGTextDrawingMode},
    geometry::CGPoint,
};
use core_text::{
    font::CTFont,
    font_collection::CTFontCollectionRef,
    font_descriptor::{
        CTFontDescriptor, kCTFontSlantTrait, kCTFontSymbolicTrait, kCTFontWeightTrait,
        kCTFontWidthTrait,
    },
    line::CTLine,
    string_attributes::kCTFontAttributeName,
};
use font_kit::{
    font::Font as FontKitFont,
    handle::Handle,
    hinting::HintingOptions,
    metrics::Metrics,
    properties::{Style as FontkitStyle, Weight as FontkitWeight},
    source::SystemSource,
    sources::mem::MemSource,
};
use parking_lot::{RwLock, RwLockUpgradableReadGuard};
use pathfinder_geometry::{
    rect::{RectF, RectI},
    transform2d::Transform2F,
    vector::Vector2F,
};
use smallvec::SmallVec;
use std::{borrow::Cow, char, convert::TryFrom, sync::Arc};

#[cfg(target_os = "macos")]
use {
    crate::{Hsla, Rgba},
    core_foundation::base::CFType,
    std::sync::OnceLock,
};

use crate::platform::apple::open_type::apply_features_and_fallbacks;

#[allow(non_upper_case_globals)]
const kCGImageAlphaOnly: u32 = 7;

const SLNT_AXIS_TAG: i64 = u32::from_be_bytes(*b"slnt") as i64;
const WGHT_AXIS_TAG: i64 = u32::from_be_bytes(*b"wght") as i64;

/// Apple text system using CoreText for font shaping.
pub struct AppleTextSystem(RwLock<AppleTextSystemState>);

#[derive(Clone, PartialEq, Eq, Hash)]
pub(crate) struct FontKey {
    font_family: SharedString,
    font_features: FontFeatures,
    pub(crate) font_fallbacks: Option<FontFallbacks>,
}

struct AppleTextSystemState {
    memory_source: MemSource,
    system_source: SystemSource,
    fonts: Vec<FontKitFont>,
    font_selections: HashMap<Font, FontId>,
    font_ids_by_postscript_name: HashMap<(String, Option<i32>, Option<i32>), FontId>,
    font_ids_by_font_key: HashMap<FontKey, SmallVec<[FontId; 4]>>,
    postscript_names_by_font_id: HashMap<FontId, String>,
    sized_fonts: crate::platform::apple::fast::text_system::SizedFonts,
    color_bitmap_fonts: crate::platform::apple::fast::color_bitmap_fonts::ColorBitmapFonts,
}

impl AppleTextSystem {
    /// Create a new AppleTextSystem.
    pub fn new() -> Self {
        Self(RwLock::new(AppleTextSystemState {
            memory_source: MemSource::empty(),
            system_source: SystemSource::new(),
            fonts: Vec::new(),
            font_selections: HashMap::default(),
            font_ids_by_postscript_name: HashMap::default(),
            font_ids_by_font_key: HashMap::default(),
            postscript_names_by_font_id: HashMap::default(),
            sized_fonts: crate::platform::apple::fast::text_system::SizedFonts::default(),
            color_bitmap_fonts:
                crate::platform::apple::fast::color_bitmap_fonts::ColorBitmapFonts::default(),
        }))
    }
}

impl Default for AppleTextSystem {
    fn default() -> Self {
        Self::new()
    }
}

impl PlatformTextSystem for AppleTextSystem {
    fn add_fonts(&self, fonts: Vec<Cow<'static, [u8]>>) -> Result<()> {
        self.0.write().add_fonts(fonts)
    }

    fn all_font_names(&self) -> Vec<String> {
        let mut names = Vec::new();
        let collection = core_text::font_collection::create_for_all_families();
        // NOTE: We intentionally avoid using `collection.get_descriptors()` here because
        // it has a memory leak bug in core-text v21.0.0. The upstream code uses
        // `wrap_under_get_rule` but `CTFontCollectionCreateMatchingFontDescriptors`
        // follows the Create Rule (caller owns the result), so it should use
        // `wrap_under_create_rule`. We call the function directly with correct memory management.
        unsafe extern "C" {
            fn CTFontCollectionCreateMatchingFontDescriptors(
                collection: CTFontCollectionRef,
            ) -> CFArrayRef;
        }
        let descriptors: Option<CFArray<CTFontDescriptor>> = unsafe {
            let array_ref =
                CTFontCollectionCreateMatchingFontDescriptors(collection.as_concrete_TypeRef());
            if array_ref.is_null() {
                None
            } else {
                Some(CFArray::wrap_under_create_rule(array_ref))
            }
        };
        let Some(descriptors) = descriptors else {
            return names;
        };
        for descriptor in descriptors.into_iter() {
            names.extend(lenient_font_attributes::family_name(&descriptor));
        }
        if let Ok(fonts_in_memory) = self.0.read().memory_source.all_families() {
            names.extend(fonts_in_memory);
        }
        names
    }

    fn font_id(&self, font: &Font) -> Result<FontId> {
        let lock = self.0.upgradable_read();
        if let Some(font_id) = lock.font_selections.get(font) {
            Ok(*font_id)
        } else {
            let mut lock = RwLockUpgradableReadGuard::upgrade(lock);
            let font_key = FontKey {
                font_family: font.family.clone(),
                font_features: font.features.clone(),
                font_fallbacks: font.fallbacks.clone(),
            };
            let candidates = if let Some(font_ids) = lock.font_ids_by_font_key.get(&font_key) {
                font_ids.as_slice()
            } else {
                let font_ids =
                    lock.load_family(&font.family, &font.features, font.fallbacks.as_ref())?;
                lock.font_ids_by_font_key.insert(font_key.clone(), font_ids);
                lock.font_ids_by_font_key[&font_key].as_ref()
            };

            let candidate_properties = candidates
                .iter()
                .map(|font_id| lock.fonts[font_id.0].properties())
                .collect::<SmallVec<[_; 4]>>();

            let ix = font_kit::matching::find_best_match(
                &candidate_properties,
                &font_kit::properties::Properties {
                    style: fontkit_style(font.style),
                    weight: fontkit_weight(font.weight),
                    stretch: Default::default(),
                },
            )?;

            let base_id = candidates[ix];
            let font_id = if let Some(varied_font) =
                apply_font_variations(&lock.fonts[base_id.0], font.weight.0 as f64, font.style)
            {
                let native = varied_font.native_font();
                let postscript_name = native.postscript_name();
                let lookup_key = font_lookup_key(&native, postscript_name.clone());
                if let Some(&existing_id) = lock.font_ids_by_postscript_name.get(&lookup_key) {
                    existing_id
                } else {
                    let state = &mut *lock;
                    let new_id = FontId(state.fonts.len());
                    state.font_ids_by_postscript_name.insert(lookup_key, new_id);
                    state
                        .postscript_names_by_font_id
                        .insert(new_id, postscript_name);
                    state.fonts.push(varied_font);
                    crate::platform::apple::fast::color_bitmap_fonts::ColorBitmapFonts::note(
                        &mut state.color_bitmap_fonts,
                        new_id,
                        &state.fonts[new_id.0],
                    );
                    new_id
                }
            } else {
                base_id
            };
            lock.font_selections.insert(font.clone(), font_id);
            Ok(font_id)
        }
    }

    fn font_metrics(&self, font_id: FontId) -> FontMetrics {
        font_kit_metrics_to_metrics(self.0.read().fonts[font_id.0].metrics())
    }

    fn typographic_bounds(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Bounds<f32>> {
        Ok(bounds_from_rect(
            self.0.read().fonts[font_id.0].typographic_bounds(glyph_id.0)?,
        ))
    }

    fn advance(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Size<f32>> {
        self.0.read().advance(font_id, glyph_id)
    }

    fn glyph_for_char(&self, font_id: FontId, ch: char) -> Option<GlyphId> {
        self.0.read().glyph_for_char(font_id, ch)
    }

    fn glyph_raster_bounds(&self, params: &RenderGlyphParams) -> Result<Bounds<DevicePixels>> {
        self.0.read().raster_bounds(params)
    }

    fn rasterize_glyph(
        &self,
        glyph_id: &RenderGlyphParams,
        raster_bounds: Bounds<DevicePixels>,
    ) -> Result<(Size<DevicePixels>, Vec<u8>)> {
        self.0.read().rasterize_glyph(glyph_id, raster_bounds)
    }

    fn layout_line(&self, text: &str, font_size: Pixels, font_runs: &[FontRun]) -> LineLayout {
        self.0.write().layout_line_with_direction(
            text,
            font_size,
            font_runs,
            crate::BaseDirection::Ltr,
        )
    }

    fn layout_line_with_direction(
        &self,
        text: &str,
        font_size: Pixels,
        font_runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> LineLayout {
        self.0
            .write()
            .layout_line_with_direction(text, font_size, font_runs, base_direction)
    }

    fn recommended_rendering_mode(
        &self,
        _font_id: FontId,
        _font_size: Pixels,
    ) -> TextRenderingMode {
        TextRenderingMode::Grayscale
    }

    #[cfg(target_os = "macos")]
    fn glyph_dilation_for_color(&self, color: Hsla) -> u8 {
        // When font smoothing is enabled, CoreGraphics thickens glyph strokes by an amount that
        // depends on the foreground color's luminance. We replicate the logic used by CoreGraphics
        // to select between the different levels of dilation.
        if !font_smoothing_allowed_by_user() {
            return 0;
        }
        let rgba: Rgba = color.into();
        let luminance = 0.2126 * rgba.r + 0.7152 * rgba.g + 0.0722 * rgba.b;
        let level = ((4.0 * luminance) + 0.5).floor() as i32;
        level.clamp(0, 4) as u8
    }
}

#[cfg(target_os = "macos")]
fn font_smoothing_allowed_by_user() -> bool {
    static ALLOWED: OnceLock<bool> = OnceLock::new();
    *ALLOWED.get_or_init(|| {
        use core_foundation_sys::preferences::{
            CFPreferencesCopyAppValue, kCFPreferencesCurrentApplication,
        };

        let key = CFString::new("AppleFontSmoothing");
        let value_ref = unsafe {
            CFPreferencesCopyAppValue(key.as_concrete_TypeRef(), kCFPreferencesCurrentApplication)
        };
        if value_ref.is_null() {
            return true;
        }
        let value = unsafe { CFType::wrap_under_create_rule(value_ref) };
        let Some(number) = value.downcast_into::<CFNumber>() else {
            return true;
        };
        // Only an explicit value of `0` means that font smoothing is disabled.
        number.to_i64() != Some(0)
    })
}

impl AppleTextSystemState {
    fn add_fonts(&mut self, fonts: Vec<Cow<'static, [u8]>>) -> Result<()> {
        let fonts = fonts
            .into_iter()
            .map(|bytes| match bytes {
                Cow::Borrowed(embedded_font) => {
                    let data_provider = unsafe {
                        core_graphics::data_provider::CGDataProvider::from_slice(embedded_font)
                    };
                    let font = core_graphics::font::CGFont::from_data_provider(data_provider)
                        .map_err(|()| anyhow!("Could not load an embedded font."))?;
                    let font = font_kit::loaders::core_text::Font::from_core_graphics_font(font);
                    Ok(Handle::from_native(&font))
                }
                Cow::Owned(bytes) => Ok(Handle::from_memory(Arc::new(bytes), 0)),
            })
            .collect::<Result<Vec<_>>>()?;
        self.memory_source.add_fonts(fonts.into_iter())?;
        crate::platform::apple::fast::font_fallbacks::forget_cascades(
            &mut self.font_selections,
            &mut self.font_ids_by_font_key,
        );
        Ok(())
    }

    fn load_family(
        &mut self,
        name: &str,
        features: &FontFeatures,
        fallbacks: Option<&FontFallbacks>,
    ) -> Result<SmallVec<[FontId; 4]>> {
        let name = crate::font_name_with_fallbacks(name, ".AppleSystemUIFont");

        let mut font_ids = SmallVec::new();
        let mut postscript_names_seen = HashSet::default();
        let family = self
            .memory_source
            .select_family_by_name(name)
            .or_else(|_| self.system_source.select_family_by_name(name))?;
        for font in family.fonts() {
            let mut font = font.load()?;

            let fast_app_fallbacks =
                crate::platform::apple::fast::font_fallbacks::AppFallbacks::new(
                    &self.memory_source,
                    fallbacks,
                    &font,
                );
            apply_features_and_fallbacks(&mut font, features, fallbacks, &fast_app_fallbacks)?;

            // We've seen a number of panics in production caused by calling font.properties()
            // which unwraps a downcast to CFNumber. This is an attempt to avoid the panic,
            // and to try and identify the incalcitrant font.
            let traits = font.native_font().all_traits();
            if unsafe {
                !(traits
                    .get(kCTFontSymbolicTrait)
                    .downcast::<CFNumber>()
                    .is_some()
                    && traits
                        .get(kCTFontWidthTrait)
                        .downcast::<CFNumber>()
                        .is_some()
                    && traits
                        .get(kCTFontWeightTrait)
                        .downcast::<CFNumber>()
                        .is_some()
                    && traits
                        .get(kCTFontSlantTrait)
                        .downcast::<CFNumber>()
                        .is_some())
            } {
                log::error!(
                    "Failed to read traits for font {:?} (PostScript name {:?})",
                    font.full_name(),
                    font.postscript_name(),
                );
                continue;
            }

            let Some(postscript_name) = font.postscript_name() else {
                log::warn!(
                    "font {:?} in family {:?} has no PostScript name; skipping",
                    font.full_name(),
                    name,
                );
                continue;
            };
            // Dedup is scoped to this single `load_family` call (issue #55472).
            // The same family can be reloaded later under a different `FontKey`
            // (different features/fallbacks); a global check against
            // `font_ids_by_postscript_name` would skip every already-registered
            // font and leave the second call's `font_ids` empty.
            if !postscript_names_seen.insert(postscript_name.clone()) {
                log::warn!(
                    "skipping duplicate font {:?} with PostScript name {:?} \
                     in family {:?}",
                    font.full_name(),
                    postscript_name,
                    name,
                );
                continue;
            }
            let font_id = FontId(self.fonts.len());
            let lookup_key = font_lookup_key(&font.native_font(), postscript_name.clone());
            font_ids.push(font_id);
            self.font_ids_by_postscript_name.insert(lookup_key, font_id);
            self.postscript_names_by_font_id
                .insert(font_id, postscript_name);
            self.fonts.push(font);
            crate::platform::apple::fast::color_bitmap_fonts::ColorBitmapFonts::note(
                &mut self.color_bitmap_fonts,
                font_id,
                &self.fonts[font_id.0],
            );
        }
        Ok(font_ids)
    }

    fn advance(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Size<f32>> {
        Ok(size_from_vector2f(
            self.fonts[font_id.0].advance(glyph_id.0)?,
        ))
    }

    fn glyph_for_char(&self, font_id: FontId, ch: char) -> Option<GlyphId> {
        self.fonts[font_id.0].glyph_for_char(ch).map(GlyphId)
    }

    fn id_for_native_font(&mut self, requested_font: CTFont) -> FontId {
        let postscript_name = requested_font.postscript_name();
        let lookup_key = font_lookup_key(&requested_font, postscript_name.clone());
        if let Some(font_id) = self.font_ids_by_postscript_name.get(&lookup_key) {
            *font_id
        } else {
            let font_id = FontId(self.fonts.len());
            self.font_ids_by_postscript_name.insert(lookup_key, font_id);
            self.postscript_names_by_font_id
                .insert(font_id, postscript_name);
            self.fonts
                .push(unsafe { font_kit::font::Font::from_native_font(&requested_font) });
            crate::platform::apple::fast::color_bitmap_fonts::ColorBitmapFonts::note(
                &mut self.color_bitmap_fonts,
                font_id,
                &self.fonts[font_id.0],
            );
            font_id
        }
    }

    fn is_emoji(&self, font_id: FontId) -> bool {
        if crate::platform::apple::fast::color_bitmap_fonts::ColorBitmapFonts::contains(
            &self.color_bitmap_fonts,
            font_id,
        ) {
            return true;
        }
        self.postscript_names_by_font_id
            .get(&font_id)
            .is_some_and(|postscript_name| {
                postscript_name == "AppleColorEmoji" || postscript_name == ".AppleColorEmojiUI"
            })
    }

    fn raster_bounds(&self, params: &RenderGlyphParams) -> Result<Bounds<DevicePixels>> {
        let font = &self.fonts[params.font_id.0];
        let scale = Transform2F::from_scale(params.scale_factor);
        let bounds: Bounds<DevicePixels> = bounds_from_rect_i(font.raster_bounds(
            params.glyph_id.0,
            params.font_size.into(),
            scale,
            HintingOptions::None,
            font_kit::canvas::RasterizationOptions::GrayscaleAa,
        )?);

        // Expand the bounds by 1 pixel on each side to give CG room for anti-aliasing.
        Ok(bounds.dilate(DevicePixels(1)))
    }

    fn rasterize_glyph(
        &self,
        params: &RenderGlyphParams,
        glyph_bounds: Bounds<DevicePixels>,
    ) -> Result<(Size<DevicePixels>, Vec<u8>)> {
        if glyph_bounds.size.width.0 == 0 || glyph_bounds.size.height.0 == 0 {
            anyhow::bail!("glyph bounds are empty");
        } else {
            // Add an extra pixel when the subpixel variant isn't zero to make room for anti-aliasing.
            let mut bitmap_size = glyph_bounds.size;
            if params.subpixel_variant.x > 0 {
                bitmap_size.width += DevicePixels(1);
            }
            if params.subpixel_variant.y > 0 {
                bitmap_size.height += DevicePixels(1);
            }
            let bitmap_size = bitmap_size;

            let mut bytes;
            let cx;
            if params.is_emoji {
                bytes = vec![0; bitmap_size.width.0 as usize * 4 * bitmap_size.height.0 as usize];
                cx = CGContext::create_bitmap_context(
                    Some(bytes.as_mut_ptr() as *mut _),
                    bitmap_size.width.0 as usize,
                    bitmap_size.height.0 as usize,
                    8,
                    bitmap_size.width.0 as usize * 4,
                    &CGColorSpace::create_device_rgb(),
                    kCGImageAlphaPremultipliedLast,
                );
            } else {
                bytes = vec![0; bitmap_size.width.0 as usize * bitmap_size.height.0 as usize];
                cx = CGContext::create_bitmap_context(
                    Some(bytes.as_mut_ptr() as *mut _),
                    bitmap_size.width.0 as usize,
                    bitmap_size.height.0 as usize,
                    8,
                    bitmap_size.width.0 as usize,
                    &CGColorSpace::create_device_gray(),
                    kCGImageAlphaOnly,
                );
            }

            // Move the origin to bottom left and account for scaling, this
            // makes drawing text consistent with the font-kit's raster_bounds.
            cx.translate(
                -glyph_bounds.origin.x.0 as CGFloat,
                (glyph_bounds.origin.y.0 + glyph_bounds.size.height.0) as CGFloat,
            );
            cx.scale(
                params.scale_factor as CGFloat,
                params.scale_factor as CGFloat,
            );

            let subpixel_shift = params
                .subpixel_variant
                .map(|v| v as f32 / SUBPIXEL_VARIANTS_X as f32);
            cx.set_text_drawing_mode(CGTextDrawingMode::CGTextFill);
            cx.set_allows_antialiasing(true);
            cx.set_should_antialias(true);
            cx.set_allows_font_subpixel_positioning(true);
            cx.set_should_subpixel_position_fonts(true);
            cx.set_allows_font_subpixel_quantization(false);
            cx.set_should_subpixel_quantize_fonts(false);

            if cfg!(target_os = "macos") && params.dilation > 0 {
                let luminance = params.dilation as f64 * 0.25;
                cx.set_should_smooth_fonts(true);
                cx.set_gray_fill_color(luminance, 1.0);
            } else {
                #[cfg(target_os = "macos")]
                crate::platform::apple::fast::text_system::smooth_undilated(
                    &cx,
                    font_smoothing_allowed_by_user(),
                );
                cx.set_gray_fill_color(0.0, 1.0);
            }
            self.fonts[params.font_id.0]
                .native_font()
                .clone_with_font_size(f32::from(params.font_size) as CGFloat)
                .draw_glyphs(
                    &[params.glyph_id.0 as CGGlyph],
                    &[CGPoint::new(
                        (subpixel_shift.x / params.scale_factor) as CGFloat,
                        (subpixel_shift.y / params.scale_factor) as CGFloat,
                    )],
                    cx,
                );

            if params.is_emoji {
                // Convert from RGBA with premultiplied alpha to BGRA with straight alpha.
                for pixel in bytes.chunks_exact_mut(4) {
                    swap_rgba_pa_to_bgra(pixel);
                }
            }

            Ok((bitmap_size, bytes))
        }
    }

    fn layout_line_with_direction(
        &mut self,
        text: &str,
        font_size: Pixels,
        font_runs: &[FontRun],
        base_direction: crate::BaseDirection,
    ) -> LineLayout {
        if let Some(mark) = crate::bidi_direction_override_mark(text, base_direction) {
            let mark_len = mark.len_utf8();
            let mut prefixed = String::with_capacity(mark_len + text.len());
            prefixed.push(mark);
            prefixed.push_str(text);
            let mut prefixed_runs = font_runs.to_vec();
            if let Some(first) = prefixed_runs.first_mut() {
                first.len += mark_len;
            }
            let mut layout = self.layout_line_raw(&prefixed, font_size, &prefixed_runs);
            crate::strip_leading_direction_mark(&mut layout, mark_len, text.len());
            layout.apply_bidi_levels(text, base_direction);
            return layout;
        }
        let mut layout = self.layout_line_raw(text, font_size, font_runs);
        layout.apply_bidi_levels(text, base_direction);
        layout
    }

    fn layout_line_raw(
        &mut self,
        text: &str,
        font_size: Pixels,
        font_runs: &[FontRun],
    ) -> LineLayout {
        // Construct the attributed string, converting UTF8 ranges to UTF16 ranges.
        let mut string = CFMutableAttributedString::new();
        let mut max_ascent = 0.0f32;
        let mut max_descent = 0.0f32;

        {
            // Restrict to Arabic/Syriac/Thaana/NKo blocks and Arabic presentation forms
            // (excluding U+FE0F emoji variation selectors and CJK compatibility forms).
            let contains_joining_rtl = text.chars().any(|c| {
                matches!(
                    c,
                    '\u{0600}'..='\u{08FF}' | '\u{FB50}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFC}'
                )
            });
            let mut text = text;
            // CoreText merges adjacent runs that end up in equal fonts, including runs of
            // different fonts that fall back to the same one, so every other run that inserts
            // text is set a hair larger to keep ligatures from forming across them. The first
            // run keeps its exact size: SF tracks by its exact point size, and a nudged size
            // draws wider or narrower than AppKit sets the same text.
            //
            // When the text contains contextual-joining RTL scripts (Arabic/Syriac) and adjacent
            // runs share the same `font_id` (decoration-only split), match the preceding run's
            // exact effective size (`prev_nudged`) so contextual letter joining is preserved
            // across highlights/colors.
            let mut break_ligature = false;
            let mut prev_font_id: Option<FontId> = None;
            let mut prev_nudged = false;
            for run in font_runs {
                let text_run;
                (text_run, text) = text.split_at(run.len);

                let utf16_start = string.char_len(); // insert at end of string
                // note: replace_str may silently ignore codepoints it dislikes (e.g., BOM at start of string)
                string.replace_str(&CFString::new(text_run), CFRange::init(utf16_start, 0));
                let utf16_end = string.char_len();

                let length = utf16_end - utf16_start;
                let cf_range = CFRange::init(utf16_start, length);
                let font = &self.fonts[run.font_id.0];

                let font_metrics = font.metrics();
                let font_scale = f32::from(font_size) / font_metrics.units_per_em as f32;
                max_ascent = max_ascent.max(font_metrics.ascent * font_scale);
                max_descent = max_descent.max(-font_metrics.descent * font_scale);

                let preserve_rtl_joining =
                    contains_joining_rtl && prev_font_id == Some(run.font_id);
                let use_nudged = if preserve_rtl_joining {
                    prev_nudged
                } else {
                    break_ligature
                };
                let font_size = if use_nudged {
                    px(f32::from(font_size).next_up())
                } else {
                    font_size
                };
                unsafe {
                    string.set_attribute(
                        cf_range,
                        kCTFontAttributeName,
                        &crate::platform::apple::fast::text_system::SizedFonts::get(
                            &mut self.sized_fonts,
                            run.font_id,
                            font,
                            font_size,
                        ),
                    );
                }
                if length > 0 {
                    prev_nudged = use_nudged;
                    if !preserve_rtl_joining {
                        break_ligature = !use_nudged;
                    }
                    prev_font_id = Some(run.font_id);
                }
            }
        }
        // Retrieve the glyphs from the shaped line, converting UTF16 offsets to UTF8 offsets.
        let line = CTLine::new_with_attributed_string(string.as_concrete_TypeRef());
        let glyph_runs = line.glyph_runs();
        let mut runs = <Vec<ShapedRun>>::with_capacity(glyph_runs.len() as usize);
        let mut ix_converter = StringIndexConverter::new(text);
        for run in glyph_runs.into_iter() {
            let attributes = run.attributes().unwrap();
            let font = unsafe {
                attributes
                    .get(kCTFontAttributeName)
                    .downcast::<CTFont>()
                    .unwrap()
            };
            let font_id = self.id_for_native_font(font);

            let glyphs = match runs.last_mut() {
                Some(run) if run.font_id == font_id => &mut run.glyphs,
                _ => {
                    runs.push(ShapedRun {
                        font_id,
                        glyphs: Vec::with_capacity(run.glyph_count().try_into().unwrap_or(0)),
                        bidi_level: 0,
                    });
                    &mut runs.last_mut().unwrap().glyphs
                }
            };
            for ((&glyph_id, position), &glyph_utf16_ix) in run
                .glyphs()
                .iter()
                .zip(run.positions().iter())
                .zip(run.string_indices().iter())
            {
                let glyph_utf16_ix = usize::try_from(glyph_utf16_ix).unwrap();
                if ix_converter.utf16_ix > glyph_utf16_ix {
                    // We cannot reuse current index converter, as it can only seek forward. Restart the search.
                    ix_converter = StringIndexConverter::new(text);
                }
                ix_converter.advance_to_utf16_ix(glyph_utf16_ix);
                glyphs.push(ShapedGlyph {
                    id: GlyphId(glyph_id as u32),
                    position: point(position.x as f32, position.y as f32).map(px),
                    index: ix_converter.utf8_ix,
                    is_emoji: self.is_emoji(font_id),
                });
            }
        }
        let typographic_bounds = line.get_typographic_bounds();
        let mut layout = LineLayout {
            runs,
            font_size,
            width: typographic_bounds.width.into(),
            ascent: max_ascent.into(),
            descent: max_descent.into(),
            len: text.len(),
            base_direction: crate::BaseDirection::Ltr,
        };
        layout.apply_bidi_levels(text, crate::BaseDirection::AutoFirstStrong);
        layout
    }
}

#[derive(Debug, Clone)]
struct StringIndexConverter<'a> {
    text: &'a str,
    /// Index in UTF-8 bytes
    utf8_ix: usize,
    /// Index in UTF-16 code units
    utf16_ix: usize,
}

impl<'a> StringIndexConverter<'a> {
    fn new(text: &'a str) -> Self {
        Self {
            text,
            utf8_ix: 0,
            utf16_ix: 0,
        }
    }

    fn advance_to_utf16_ix(&mut self, utf16_target: usize) {
        for (ix, c) in self.text[self.utf8_ix..].char_indices() {
            if self.utf16_ix >= utf16_target {
                self.utf8_ix += ix;
                return;
            }
            self.utf16_ix += c.len_utf16();
        }
        self.utf8_ix = self.text.len();
    }
}

fn font_kit_metrics_to_metrics(metrics: Metrics) -> FontMetrics {
    FontMetrics {
        units_per_em: metrics.units_per_em,
        ascent: metrics.ascent,
        descent: metrics.descent,
        line_gap: metrics.line_gap,
        underline_position: metrics.underline_position,
        underline_thickness: metrics.underline_thickness,
        cap_height: metrics.cap_height,
        x_height: metrics.x_height,
        bounding_box: bounds_from_rect(metrics.bounding_box),
    }
}

fn bounds_from_rect(rect: RectF) -> Bounds<f32> {
    Bounds {
        origin: point(rect.origin_x(), rect.origin_y()),
        size: size(rect.width(), rect.height()),
    }
}

fn bounds_from_rect_i(rect: RectI) -> Bounds<DevicePixels> {
    Bounds {
        origin: point(DevicePixels(rect.origin_x()), DevicePixels(rect.origin_y())),
        size: size(DevicePixels(rect.width()), DevicePixels(rect.height())),
    }
}

// impl From<Vector2I> for Size<DevicePixels> {
//     fn from(value: Vector2I) -> Self {
//         size(value.x().into(), value.y().into())
//     }
// }

// impl From<RectI> for Bounds<i32> {
//     fn from(rect: RectI) -> Self {
//         Bounds {
//             origin: point(rect.origin_x(), rect.origin_y()),
//             size: size(rect.width(), rect.height()),
//         }
//     }
// }

// impl From<Point<u32>> for Vector2I {
//     fn from(size: Point<u32>) -> Self {
//         Vector2I::new(size.x as i32, size.y as i32)
//     }
// }

fn size_from_vector2f(vec: Vector2F) -> Size<f32> {
    size(vec.x(), vec.y())
}

fn font_lookup_key(font: &CTFont, name: String) -> (String, Option<i32>, Option<i32>) {
    (
        name,
        ct_font_axis_tenths(font, WGHT_AXIS_TAG),
        ct_font_axis_tenths(font, SLNT_AXIS_TAG),
    )
}

fn ct_font_axis_tenths(ct_font: &CTFont, tag: i64) -> Option<i32> {
    unsafe {
        let generated_font = &*ct_font
            .as_concrete_TypeRef()
            .cast::<objc2_core_text::CTFont>();
        let variations = generated_font.variation()?;
        let dict_ref = objc2_core_foundation::CFRetained::as_ptr(&variations).as_ptr()
            as core_foundation_sys::dictionary::CFDictionaryRef;
        let key = CFNumber::from(tag);
        let mut val_ptr: *const std::ffi::c_void = std::ptr::null();
        if core_foundation_sys::dictionary::CFDictionaryGetValueIfPresent(
            dict_ref,
            key.as_CFTypeRef(),
            &mut val_ptr,
        ) != 0
            && !val_ptr.is_null()
        {
            let num = CFNumber::wrap_under_get_rule(val_ptr as _);
            let weight = num.to_f64().or_else(|| num.to_i64().map(|v| v as f64))?;
            return Some((weight * 10.0).round() as i32);
        }
        None
    }
}

fn ct_font_axis_range(ct_font: &CTFont, tag: i64) -> Option<(f64, f64, f64)> {
    unsafe {
        let generated_font = &*ct_font
            .as_concrete_TypeRef()
            .cast::<objc2_core_text::CTFont>();
        let axes = generated_font.variation_axes()?;
        let axes_ref = objc2_core_foundation::CFRetained::as_ptr(&axes).as_ptr()
            as core_foundation_sys::array::CFArrayRef;
        let count = core_foundation_sys::array::CFArrayGetCount(axes_ref);
        let id_key = objc2_core_text::kCTFontVariationAxisIdentifierKey
            as *const objc2_core_foundation::CFString
            as *const std::ffi::c_void;
        let min_key = objc2_core_text::kCTFontVariationAxisMinimumValueKey
            as *const objc2_core_foundation::CFString
            as *const std::ffi::c_void;
        let max_key = objc2_core_text::kCTFontVariationAxisMaximumValueKey
            as *const objc2_core_foundation::CFString
            as *const std::ffi::c_void;
        let def_key = objc2_core_text::kCTFontVariationAxisDefaultValueKey
            as *const objc2_core_foundation::CFString
            as *const std::ffi::c_void;

        let get_f64 = |dict: core_foundation_sys::dictionary::CFDictionaryRef,
                       key: *const std::ffi::c_void|
         -> Option<f64> {
            let mut val_ptr: *const std::ffi::c_void = std::ptr::null();
            if core_foundation_sys::dictionary::CFDictionaryGetValueIfPresent(
                dict,
                key,
                &mut val_ptr,
            ) != 0
                && !val_ptr.is_null()
            {
                let num = CFNumber::wrap_under_get_rule(val_ptr as _);
                num.to_f64().or_else(|| num.to_i64().map(|v| v as f64))
            } else {
                None
            }
        };

        for i in 0..count {
            let dict_ptr = core_foundation_sys::array::CFArrayGetValueAtIndex(axes_ref, i)
                as core_foundation_sys::dictionary::CFDictionaryRef;
            if dict_ptr.is_null() {
                continue;
            }
            let mut id_ptr: *const std::ffi::c_void = std::ptr::null();
            if core_foundation_sys::dictionary::CFDictionaryGetValueIfPresent(
                dict_ptr,
                id_key,
                &mut id_ptr,
            ) != 0
                && !id_ptr.is_null()
            {
                let id_num = CFNumber::wrap_under_get_rule(id_ptr as _);
                if id_num.to_i64() == Some(tag) {
                    let min_v = get_f64(dict_ptr, min_key)?;
                    let max_v = get_f64(dict_ptr, max_key)?;
                    let def_v = get_f64(dict_ptr, def_key)?;
                    return Some((min_v, max_v, def_v));
                }
            }
        }
        None
    }
}

fn apply_font_variations(
    base: &FontKitFont,
    target_weight: f64,
    style: FontStyle,
) -> Option<FontKitFont> {
    let base_ct = base.native_font();
    let mut axes = Vec::new();
    let mut changed = false;
    for tag in [WGHT_AXIS_TAG, SLNT_AXIS_TAG] {
        let Some((min, max, default)) = ct_font_axis_range(&base_ct, tag) else {
            continue;
        };
        let current = ct_font_axis_tenths(&base_ct, tag).map_or(default, |n| n as f64 / 10.0);
        let value = if tag == WGHT_AXIS_TAG {
            target_weight.clamp(min, max)
        } else if base_ct.symbolic_traits() & core_text::font_descriptor::kCTFontItalicTrait != 0 {
            current
        } else if style == FontStyle::Normal {
            0.0_f64.clamp(min, max)
        } else {
            min
        };
        changed |= (current - value).abs() > 0.05;
        axes.push((CFNumber::from(tag), CFNumber::from(value)));
    }
    if !changed {
        return None;
    }
    let variations = core_foundation::dictionary::CFDictionary::from_CFType_pairs(&axes);
    unsafe {
        let attr_keys = [objc2_core_text::kCTFontVariationAttribute
            as *const objc2_core_foundation::CFString
            as *const std::ffi::c_void];
        let attr_vals = [variations.as_CFTypeRef()];
        let attrs = core_foundation::dictionary::CFDictionaryCreate(
            core_foundation::base::kCFAllocatorDefault,
            attr_keys.as_ptr() as _,
            attr_vals.as_ptr() as _,
            1,
            &core_foundation::dictionary::kCFTypeDictionaryKeyCallBacks,
            &core_foundation::dictionary::kCFTypeDictionaryValueCallBacks,
        );
        let desc_ref = core_text::font_descriptor::CTFontDescriptorCreateWithAttributes(attrs);
        core_foundation::base::CFRelease(attrs as _);
        let desc = CTFontDescriptor::wrap_under_create_rule(desc_ref);

        let generated_font = &*base_ct
            .as_concrete_TypeRef()
            .cast::<objc2_core_text::CTFont>();
        let generated_desc = &*desc
            .as_concrete_TypeRef()
            .cast::<objc2_core_text::CTFontDescriptor>();
        let new_font =
            generated_font.copy_with_attributes(0.0, std::ptr::null(), Some(generated_desc));
        let new_ct = CTFont::wrap_under_create_rule(
            objc2_core_foundation::CFRetained::into_raw(new_font)
                .as_ptr()
                .cast(),
        );
        Some(FontKitFont::from_native_font(&new_ct))
    }
}

fn fontkit_weight(value: FontWeight) -> FontkitWeight {
    FontkitWeight(value.0)
}

fn fontkit_style(style: FontStyle) -> FontkitStyle {
    match style {
        FontStyle::Normal => FontkitStyle::Normal,
        FontStyle::Italic => FontkitStyle::Italic,
        FontStyle::Oblique => FontkitStyle::Oblique,
    }
}

// Some fonts may have no attributes despite `core_text` requiring them (and panicking).
// This is the same version as `core_text` has without `expect` calls.
mod lenient_font_attributes {
    use core_foundation::{
        base::{CFRetain, CFType, TCFType},
        string::{CFString, CFStringRef},
    };
    use core_text::font_descriptor::{
        CTFontDescriptor, CTFontDescriptorCopyAttribute, kCTFontFamilyNameAttribute,
    };

    pub fn family_name(descriptor: &CTFontDescriptor) -> Option<String> {
        unsafe { get_string_attribute(descriptor, kCTFontFamilyNameAttribute) }
    }

    fn get_string_attribute(
        descriptor: &CTFontDescriptor,
        attribute: CFStringRef,
    ) -> Option<String> {
        unsafe {
            let value = CTFontDescriptorCopyAttribute(descriptor.as_concrete_TypeRef(), attribute);
            if value.is_null() {
                return None;
            }

            let value = CFType::wrap_under_create_rule(value);
            assert!(value.instance_of::<CFString>());
            let s = wrap_under_get_rule(value.as_CFTypeRef() as CFStringRef);
            Some(s.to_string())
        }
    }

    unsafe fn wrap_under_get_rule(reference: CFStringRef) -> CFString {
        unsafe {
            assert!(!reference.is_null(), "Attempted to create a NULL object.");
            let reference = CFRetain(reference as *const ::std::os::raw::c_void) as CFStringRef;
            TCFType::wrap_under_create_rule(reference)
        }
    }
}
