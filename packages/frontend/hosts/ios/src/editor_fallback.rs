//! Deterministic non-iOS host dispatcher, atlas, and text system for `affine-ios-host` tests.

use std::{borrow::Cow, collections::VecDeque, sync::Mutex, time::Duration};

use anyhow::Result;
use ui::scheduler::{Clock, TestClock};
use ui::{
    AtlasKey, AtlasTextureId, AtlasTextureKind, AtlasTile, BaseDirection, Bounds, DevicePixels,
    Font, FontId, FontMetrics, FontRun, GlyphId, LineLayout, Pixels, PlatformAtlas,
    PlatformDispatcher, PlatformTextSystem, Priority, RenderGlyphParams, RunnableVariant,
    ShapedGlyph, ShapedRun, Size, TextRenderingMode, TileId, point, px, size,
};

pub(crate) struct SyncHostDispatcher {
    clock: TestClock,
    queue: Mutex<VecDeque<RunnableVariant>>,
}

impl SyncHostDispatcher {
    pub(crate) fn new() -> Self {
        Self {
            clock: TestClock::new(),
            queue: Mutex::new(VecDeque::new()),
        }
    }
}

impl PlatformDispatcher for SyncHostDispatcher {
    fn is_main_thread(&self) -> bool {
        true
    }

    fn now(&self) -> ui::scheduler::Instant {
        self.clock.advance(Duration::from_millis(16));
        self.clock.now()
    }

    fn dispatch(&self, runnable: RunnableVariant, _priority: Priority) {
        if let Ok(mut q) = self.queue.lock() {
            q.push_back(runnable);
        }
    }

    fn dispatch_on_main_thread(&self, runnable: RunnableVariant, _priority: Priority) {
        if let Ok(mut q) = self.queue.lock() {
            q.push_back(runnable);
        }
    }

    fn dispatch_after(&self, _duration: Duration, _runnable: RunnableVariant) {}

    fn spawn_realtime(&self, f: Box<dyn FnOnce() + Send>) {
        f();
    }
}

pub(crate) struct FallbackAtlas;

impl PlatformAtlas for FallbackAtlas {
    fn get_or_insert_with<'a>(
        &self,
        _key: AtlasKey,
        _build: &mut dyn FnMut() -> Result<Option<(Size<DevicePixels>, Cow<'a, [u8]>)>>,
    ) -> Result<Option<AtlasTile>> {
        Ok(Some(AtlasTile {
            texture_id: AtlasTextureId {
                index: 0,
                kind: AtlasTextureKind::Monochrome,
            },
            tile_id: TileId(0),
            padding: 0,
            bounds: Bounds::new(
                point(DevicePixels(0), DevicePixels(0)),
                size(DevicePixels(1), DevicePixels(1)),
            ),
        }))
    }

    fn remove(&self, _key: &AtlasKey) {}
}

pub(crate) struct FallbackTextSystem;

impl PlatformTextSystem for FallbackTextSystem {
    fn add_fonts(&self, _fonts: Vec<Cow<'static, [u8]>>) -> Result<()> {
        Ok(())
    }

    fn all_font_names(&self) -> Vec<String> {
        vec!["Inter".to_string(), "IBM Plex Mono".to_string()]
    }

    fn font_id(&self, _descriptor: &Font) -> Result<FontId> {
        Ok(FontId(0))
    }

    fn font_metrics(&self, _font_id: FontId) -> FontMetrics {
        FontMetrics {
            units_per_em: 1000,
            ascent: 800.0,
            descent: -200.0,
            line_gap: 0.0,
            underline_position: -100.0,
            underline_thickness: 50.0,
            cap_height: 700.0,
            x_height: 500.0,
            bounding_box: Bounds::new(point(0.0, -200.0), size(600.0, 1000.0)),
        }
    }

    fn typographic_bounds(&self, _font_id: FontId, _glyph_id: GlyphId) -> Result<Bounds<f32>> {
        Ok(Bounds::new(point(0.0, -200.0), size(600.0, 1000.0)))
    }

    fn advance(&self, _font_id: FontId, _glyph_id: GlyphId) -> Result<Size<f32>> {
        Ok(size(600.0, 0.0))
    }

    fn glyph_for_char(&self, _font_id: FontId, ch: char) -> Option<GlyphId> {
        Some(GlyphId(ch as u32))
    }

    fn glyph_raster_bounds(&self, _params: &RenderGlyphParams) -> Result<Bounds<DevicePixels>> {
        Ok(Bounds::new(
            point(DevicePixels(0), DevicePixels(0)),
            size(DevicePixels(8), DevicePixels(14)),
        ))
    }

    fn rasterize_glyph(
        &self,
        _params: &RenderGlyphParams,
        raster_bounds: Bounds<DevicePixels>,
    ) -> Result<(Size<DevicePixels>, Vec<u8>)> {
        let w = raster_bounds.size.width.0.max(1) as usize;
        let h = raster_bounds.size.height.0.max(1) as usize;
        Ok((raster_bounds.size, vec![0u8; w * h]))
    }

    fn layout_line(&self, text: &str, font_size: Pixels, runs: &[FontRun]) -> LineLayout {
        let cell = f32::from(font_size) * 0.56;
        let mut x = 0.0f32;
        let mut shaped_runs = Vec::new();
        let mut offset = 0usize;
        for run in runs {
            let end = (offset + run.len).min(text.len());
            let slice = &text[offset..end];
            let mut glyphs = Vec::new();
            for (rel_idx, ch) in slice.char_indices() {
                let adv = if ch == ' ' { cell * 0.65 } else { cell };
                glyphs.push(ShapedGlyph {
                    id: GlyphId(ch as u32),
                    position: point(px(x), px(0.0)),
                    index: offset + rel_idx,
                    is_emoji: false,
                });
                x += adv;
            }
            shaped_runs.push(ShapedRun {
                font_id: run.font_id,
                glyphs,
                bidi_level: 0,
            });
            offset = end;
        }
        LineLayout {
            font_size,
            width: px(x),
            ascent: px(f32::from(font_size) * 0.8),
            descent: px(f32::from(font_size) * 0.2),
            runs: shaped_runs,
            len: text.len(),
            base_direction: BaseDirection::Ltr,
        }
    }

    fn recommended_rendering_mode(
        &self,
        _font_id: FontId,
        _font_size: Pixels,
    ) -> TextRenderingMode {
        TextRenderingMode::Grayscale
    }
}
