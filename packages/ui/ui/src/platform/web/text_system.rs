use crate::platform::web::canvas_fallback::{CanvasFontFallback, classify_canvas_fallback};
use crate::platform::web::canvas_text::{self, CanvasTextMetrics};
use crate::platform::web::glyph_cache::{
    CANVAS_FONT_BIT, CanvasGlyph, GlyphCache, LOGICAL_FONT_BIT, LogicalFontTable, format_css_font,
};
use crate::platform::web::run_replacements::{Replacement, apply_replacements, collect_candidates};
use crate::platform::wgpu::CosmicTextSystem;
use crate::{
    Bounds, DevicePixels, Font, FontId, FontMetrics, FontRun, GlyphId, LineLayout,
    MissingGlyphSink, Pixels, PlatformTextSystem, RenderGlyphParams, SUBPIXEL_VARIANTS_X,
    SUBPIXEL_VARIANTS_Y, ShapedGlyph, Size, TextRenderingMode, point, px, size,
};
use anyhow::{Context as _, Result, ensure};
use parking_lot::RwLock;
use std::{borrow::Cow, collections::HashMap, sync::Arc};

const MAX_MEASUREMENTS: usize = 4096;

pub(crate) struct WebTextSystem {
    native: CosmicTextSystem,
    state: RwLock<State>,
    canvas_font_fallback: CanvasFontFallback,
}

#[derive(Default)]
struct State {
    missing_glyph_sink: Option<Arc<dyn MissingGlyphSink>>,
    logical_fonts: LogicalFontTable,
    canvas_fonts: Vec<Arc<CanvasFont>>,
    canvas_font_ids: HashMap<FontId, FontId>,
    glyphs: GlyphCache,
    measurements: HashMap<(FontId, GlyphId, Pixels), CanvasTextMetrics>,
}

struct CanvasFont {
    native_id: FontId,
    descriptor: Font,
    monospace: bool,
}

impl WebTextSystem {
    pub(crate) fn new(
        system_font_fallback: &str,
        canvas_font_fallback: CanvasFontFallback,
    ) -> Self {
        Self {
            native: CosmicTextSystem::new_without_system_fonts(system_font_fallback),
            state: RwLock::new(State::default()),
            canvas_font_fallback,
        }
    }

    fn canvas_font(&self, font_id: FontId) -> Option<Arc<CanvasFont>> {
        if font_id.0 & CANVAS_FONT_BIT == 0 {
            return None;
        }
        self.state
            .read()
            .canvas_fonts
            .get(font_id.0 & !CANVAS_FONT_BIT)
            .cloned()
    }

    fn native_font_id(&self, font_id: FontId) -> FontId {
        if let Some(font) = self.canvas_font(font_id) {
            return font.native_id;
        }
        if let Some((native_id, _)) = self.state.read().logical_fonts.get(font_id) {
            return *native_id;
        }
        font_id
    }

    fn native_params<'a>(&self, params: &'a RenderGlyphParams) -> Cow<'a, RenderGlyphParams> {
        let native_id = self.native_font_id(params.font_id);
        if native_id == params.font_id {
            Cow::Borrowed(params)
        } else {
            let mut p = params.clone();
            p.font_id = native_id;
            Cow::Owned(p)
        }
    }

    fn canvas_font_id(&self, source_id: FontId) -> Result<FontId> {
        if source_id.0 & CANVAS_FONT_BIT != 0 {
            return Ok(source_id);
        }
        let (native_id, descriptor) = {
            let state = self.state.read();
            if let Some(font_id) = state.canvas_font_ids.get(&source_id) {
                return Ok(*font_id);
            }
            let (native_id, descriptor) = state
                .logical_fonts
                .get(source_id)
                .context("missing source font descriptor for Canvas fallback")?;
            (*native_id, descriptor.clone())
        };
        let monospace = match (
            self.native.glyph_for_char(native_id, 'i'),
            self.native.glyph_for_char(native_id, 'm'),
        ) {
            (Some(narrow), Some(wide)) => {
                self.native.advance(native_id, narrow)?.width
                    == self.native.advance(native_id, wide)?.width
            }
            _ => false,
        };
        let mut state = self.state.write();
        if let Some(font_id) = state.canvas_font_ids.get(&source_id) {
            return Ok(*font_id);
        }
        ensure!(
            state.canvas_fonts.len() < LOGICAL_FONT_BIT,
            "Canvas font ID space exhausted"
        );
        let font_id = FontId(CANVAS_FONT_BIT | state.canvas_fonts.len());
        state.canvas_fonts.push(Arc::new(CanvasFont {
            native_id,
            descriptor,
            monospace,
        }));
        state.canvas_font_ids.insert(source_id, font_id);
        Ok(font_id)
    }

    fn register_glyph(&self, font_id: FontId, text: &str, color: bool) -> Result<GlyphId> {
        if let Some(glyph_id) = self.state.read().glyphs.id_for(font_id, text, color) {
            return Ok(glyph_id);
        }
        // Another thread may register the same glyph between the read and write locks.
        self.state
            .write()
            .glyphs
            .get_or_insert(font_id, text, color)
    }

    fn canvas_glyph(&self, font_id: FontId, glyph_id: GlyphId) -> Result<CanvasGlyph> {
        self.state
            .read()
            .glyphs
            .glyph(font_id, glyph_id)
            .cloned()
            .context("invalid Canvas glyph ID")
    }

    fn measure(
        &self,
        font_id: FontId,
        glyph_id: GlyphId,
        font_size: Pixels,
    ) -> Result<CanvasTextMetrics> {
        let key = (font_id, glyph_id, font_size);
        if let Some(metrics) = self.state.read().measurements.get(&key) {
            return Ok(*metrics);
        }
        let font = self
            .canvas_font(font_id)
            .context("invalid Canvas font ID")?;
        let glyph = self.canvas_glyph(font_id, glyph_id)?;
        let css = format_css_font(&font.descriptor, font.monospace, font_size, glyph.color)?;
        let metrics = canvas_text::measure(&glyph.text, &css)?;
        ensure!(metrics.advance >= 0.0, "Canvas returned a negative advance");
        let mut state = self.state.write();
        if state.measurements.len() >= MAX_MEASUREMENTS {
            state.measurements.clear();
        }
        state.measurements.insert(key, metrics);
        Ok(metrics)
    }

    fn fallback_glyph(
        &self,
        font_id: FontId,
        text: &str,
        color: bool,
        font_size: Pixels,
    ) -> Result<(FontId, GlyphId, CanvasTextMetrics)> {
        {
            let state = self.state.read();
            if let Some(&canvas_id) = state.canvas_font_ids.get(&font_id)
                && let Some(glyph_id) = state.glyphs.id_for(canvas_id, text, color)
                && let Some(&metrics) = state.measurements.get(&(canvas_id, glyph_id, font_size))
            {
                return Ok((canvas_id, glyph_id, metrics));
            }
        }
        let canvas_id = self.canvas_font_id(font_id)?;
        let glyph_id = self.register_glyph(canvas_id, text, color)?;
        let metrics = self.measure(canvas_id, glyph_id, font_size)?;
        Ok((canvas_id, glyph_id, metrics))
    }

    fn apply_fallback(&self, text: &str, font_runs: &[FontRun], layout: &mut LineLayout) {
        if self.canvas_font_fallback == CanvasFontFallback::Disabled
            || text.is_ascii()
            || !f32::from(layout.font_size).is_finite()
            || layout.font_size <= px(0.)
        {
            return;
        }
        let mut replacements = Vec::new();
        for candidate in collect_candidates(text, font_runs, layout) {
            if !self.canvas_font_fallback.allows(candidate.is_emoji) {
                continue;
            }
            let Some(glyphs) = candidate.glyphs else {
                continue;
            };
            if !glyphs.contiguous || !(glyphs.missing || (candidate.color && !glyphs.native_color))
            {
                continue;
            }
            let old_width = glyphs.end_x - glyphs.position.x;
            if old_width < px(0.) {
                continue;
            }
            let replacement = (|| -> Result<Replacement> {
                let text = text
                    .get(candidate.source.clone())
                    .context("invalid Canvas fallback source range")?;
                let (font_id, glyph_id, metrics) = self.fallback_glyph(
                    candidate.font_id,
                    text,
                    candidate.color,
                    layout.font_size,
                )?;
                Ok(Replacement {
                    glyph_range: glyphs.range,
                    font_id,
                    glyph: ShapedGlyph {
                        id: glyph_id,
                        position: glyphs.position,
                        index: candidate.source.start,
                        is_emoji: candidate.color,
                    },
                    width_delta: px(metrics.advance) - old_width,
                })
            })();
            match replacement {
                Ok(replacement) => replacements.push(replacement),
                Err(error) => log::warn!("Canvas font fallback failed: {error:#}"),
            }
        }
        if replacements.is_empty() {
            return;
        }
        replacements.sort_unstable_by_key(|replacement| replacement.glyph_range.start);
        // Keep the primary font's baseline and line spacing stable. Browser ink
        // extents affect raster bounds, not the surrounding editor's line metrics.
        apply_replacements(layout, replacements);
    }
}

impl PlatformTextSystem for WebTextSystem {
    fn set_missing_glyph_sink(&self, sink: Option<Arc<dyn MissingGlyphSink>>) {
        // Cosmic must not report missing glyphs before Canvas has a chance to replace them.
        self.state.write().missing_glyph_sink = sink;
    }

    fn add_fonts(&self, fonts: Vec<Cow<'static, [u8]>>) -> Result<()> {
        self.native.add_fonts(fonts)?;
        self.state.write().measurements.clear();
        Ok(())
    }

    fn all_font_names(&self) -> Vec<String> {
        self.native.all_font_names()
    }

    fn font_id(&self, font: &Font) -> Result<FontId> {
        let native_id = self.native.font_id(font)?;
        ensure!(
            native_id.0 & (CANVAS_FONT_BIT | LOGICAL_FONT_BIT) == 0,
            "native font ID space exhausted"
        );
        let (_, resolved_style) = self.native.font_weight_and_style(native_id)?;
        self.state
            .write()
            .logical_fonts
            .intern(native_id, font, resolved_style)
    }

    fn prewarm_fonts(&self, font_ids: &[FontId]) {
        let native_ids: Vec<_> = font_ids.iter().map(|id| self.native_font_id(*id)).collect();
        self.native.prewarm_fonts(&native_ids);
    }

    fn font_metrics(&self, font_id: FontId) -> FontMetrics {
        self.native.font_metrics(self.native_font_id(font_id))
    }

    fn typographic_bounds(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Bounds<f32>> {
        let Some(font) = self.canvas_font(font_id) else {
            return self
                .native
                .typographic_bounds(self.native_font_id(font_id), glyph_id);
        };
        let font_size = px(self.native.font_metrics(font.native_id).units_per_em as f32);
        let metrics = self.measure(font_id, glyph_id, font_size)?;
        Ok(Bounds {
            origin: point(metrics.left, -metrics.ascent),
            size: size(
                metrics.right - metrics.left,
                metrics.ascent + metrics.descent,
            ),
        })
    }

    fn advance(&self, font_id: FontId, glyph_id: GlyphId) -> Result<Size<f32>> {
        let Some(font) = self.canvas_font(font_id) else {
            return self.native.advance(self.native_font_id(font_id), glyph_id);
        };
        let font_size = px(self.native.font_metrics(font.native_id).units_per_em as f32);
        Ok(size(
            self.measure(font_id, glyph_id, font_size)?.advance,
            0.,
        ))
    }

    fn glyph_for_char(&self, font_id: FontId, character: char) -> Option<GlyphId> {
        if self.canvas_font(font_id).is_none() {
            return self
                .native
                .glyph_for_char(self.native_font_id(font_id), character);
        }
        let mut buffer = [0; 4];
        let text = character.encode_utf8(&mut buffer);
        let color =
            classify_canvas_fallback(text).is_some_and(|fallback| fallback.emoji_presentation);
        match self.register_glyph(font_id, text, color) {
            Ok(glyph_id) => Some(glyph_id),
            Err(error) => {
                log::warn!("registering Canvas glyph failed: {error:#}");
                None
            }
        }
    }

    fn glyph_raster_bounds(&self, params: &RenderGlyphParams) -> Result<Bounds<DevicePixels>> {
        if self.canvas_font(params.font_id).is_none() {
            return self.native.glyph_raster_bounds(&self.native_params(params));
        }
        let metrics = self.measure(
            params.font_id,
            params.glyph_id,
            params.font_size * params.scale_factor,
        )?;
        if metrics.right <= metrics.left || metrics.ascent + metrics.descent <= 0. {
            return Ok(Bounds::default());
        }
        let (offset_x, offset_y) = subpixel_offset(params);
        let left = (f64::from(metrics.left) + f64::from(offset_x)).floor() - 1.;
        let top = (-f64::from(metrics.ascent) + f64::from(offset_y)).floor() - 1.;
        let right = (f64::from(metrics.right) + f64::from(offset_x)).ceil() + 1.;
        let bottom = (f64::from(metrics.descent) + f64::from(offset_y)).ceil() + 1.;
        ensure!(
            [left, top, right, bottom]
                .into_iter()
                .all(|value| value >= f64::from(i32::MIN) && value <= f64::from(i32::MAX)),
            "Canvas text bounds exceed device coordinates"
        );
        let width = (right as i32)
            .checked_sub(left as i32)
            .context("Canvas text width overflow")?;
        let height = (bottom as i32)
            .checked_sub(top as i32)
            .context("Canvas text height overflow")?;
        Ok(Bounds {
            origin: point((left as i32).into(), (top as i32).into()),
            size: size(width.into(), height.into()),
        })
    }

    fn rasterize_glyph(
        &self,
        params: &RenderGlyphParams,
        bounds: Bounds<DevicePixels>,
    ) -> Result<(Size<DevicePixels>, Vec<u8>)> {
        let Some(font) = self.canvas_font(params.font_id) else {
            return self
                .native
                .rasterize_glyph(&self.native_params(params), bounds);
        };
        let glyph = self.canvas_glyph(params.font_id, params.glyph_id)?;
        let css_font = format_css_font(
            &font.descriptor,
            font.monospace,
            params.font_size * params.scale_factor,
            glyph.color,
        )?;
        let mut pixels = canvas_text::rasterize(
            &glyph.text,
            &css_font,
            bounds,
            subpixel_offset(params),
            glyph.color,
        )?;
        if params.subpixel_rendering && !glyph.color {
            pixels = pixels.into_iter().flat_map(|alpha| [alpha; 4]).collect();
        }
        Ok((bounds.size, pixels))
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
        let native_runs: Vec<_> = runs
            .iter()
            .map(|r| FontRun {
                len: r.len,
                font_id: self.native_font_id(r.font_id),
            })
            .collect();
        let mut layout =
            self.native
                .layout_line_with_direction(text, font_size, &native_runs, base_direction);
        self.apply_fallback(text, runs, &mut layout);
        let sink = self.state.read().missing_glyph_sink.clone();
        if let Some(sink) = sink {
            let missing_indices = layout
                .runs
                .iter()
                .filter(|run| run.font_id.0 & CANVAS_FONT_BIT == 0)
                .flat_map(|run| &run.glyphs)
                .filter(|glyph| glyph.id.0 == 0)
                .map(|glyph| glyph.index);
            sink.report(
                self.native
                    .missing_glyphs(text, &native_runs, missing_indices),
            );
        }
        layout
    }

    fn recommended_rendering_mode(&self, font_id: FontId, font_size: Pixels) -> TextRenderingMode {
        if self.canvas_font(font_id).is_some() {
            TextRenderingMode::Grayscale
        } else {
            self.native
                .recommended_rendering_mode(self.native_font_id(font_id), font_size)
        }
    }
}

fn subpixel_offset(params: &RenderGlyphParams) -> (f32, f32) {
    (
        f32::from(params.subpixel_variant.x) / SUBPIXEL_VARIANTS_X as f32,
        f32::from(params.subpixel_variant.y) / SUBPIXEL_VARIANTS_Y as f32,
    )
}
