//! Fallback atlas and text system for `affine-android-host`.
//!
//! `FallbackAtlas` backs `SwappableAtlas` before an Android `SurfaceView` attaches
//! (or after `surfaceDestroyed`), and `FallbackTextSystem` runs on non-Android
//! JVM/Linux/macOS test hosts where `CosmicTextSystem` is not required.

use std::borrow::Cow;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use ui::{
    AtlasKey, AtlasTextureId, AtlasTextureKind, AtlasTile, Bounds, DevicePixels, PlatformAtlas,
    PlatformDispatcher, Priority, RunnableVariant, Size, TileId, point, size,
};
#[cfg(not(target_os = "android"))]
use ui::{
    BaseDirection, Font, FontId, FontMetrics, FontRun, GlyphId, LineLayout, Pixels,
    PlatformTextSystem, RenderGlyphParams, ShapedGlyph, ShapedRun, TextRenderingMode, px,
};

struct ScheduledTimer {
    due: ui::scheduler::Instant,
    runnable: RunnableVariant,
}

/// Deterministic foreground/background dispatcher for the Android UI thread.
///
/// Main-thread tasks run inline on the next frame tick; delayed timers (`dispatch_after`)
/// are stamped against [`ui::clock_now()`] and drained by `drain_ready()` on each
/// `Choreographer` frame tick so caret blink, selection menus, and deferred editor tasks
/// execute deterministically without spawning background threads or reading wall clocks.
pub(crate) struct AndroidDispatcher {
    main_queue: Mutex<VecDeque<RunnableVariant>>,
    timers: Mutex<Vec<ScheduledTimer>>,
    #[cfg(test)]
    test_clock_offset: Mutex<Duration>,
}

impl AndroidDispatcher {
    pub(crate) fn new() -> Self {
        Self {
            main_queue: Mutex::new(VecDeque::new()),
            timers: Mutex::new(Vec::new()),
            #[cfg(test)]
            test_clock_offset: Mutex::new(Duration::ZERO),
        }
    }

    fn current_instant(&self) -> ui::scheduler::Instant {
        #[cfg(test)]
        {
            let offset = *self
                .test_clock_offset
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            ui::clock_now() + offset
        }
        #[cfg(not(test))]
        {
            ui::clock_now()
        }
    }

    #[cfg(test)]
    pub(crate) fn advance_test_clock(&self, delta: Duration) {
        let mut offset = self
            .test_clock_offset
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *offset += delta;
    }

    /// Runs all queued tasks and timers due at `current_instant()`, returning the
    /// remaining duration until the earliest still-pending timer, if any.
    pub(crate) fn drain_ready(&self) -> Option<Duration> {
        let now = self.current_instant();
        loop {
            let due_timers: Vec<RunnableVariant> = {
                let mut timers = self.timers.lock().unwrap_or_else(|e| e.into_inner());
                let mut ready = Vec::new();
                let mut i = 0;
                while i < timers.len() {
                    if timers[i].due <= now {
                        ready.push(timers.swap_remove(i).runnable);
                    } else {
                        i += 1;
                    }
                }
                ready
            };
            let queued: Vec<RunnableVariant> = {
                let mut q = self.main_queue.lock().unwrap_or_else(|e| e.into_inner());
                q.drain(..).collect()
            };
            if due_timers.is_empty() && queued.is_empty() {
                break;
            }
            for runnable in due_timers.into_iter().chain(queued) {
                runnable.run();
            }
        }
        let timers = self.timers.lock().unwrap_or_else(|e| e.into_inner());
        timers
            .iter()
            .map(|t| t.due.saturating_duration_since(now))
            .min()
    }
}

impl PlatformDispatcher for AndroidDispatcher {
    fn is_main_thread(&self) -> bool {
        true
    }

    fn now(&self) -> ui::scheduler::Instant {
        self.current_instant()
    }

    fn dispatch(&self, runnable: RunnableVariant, _priority: Priority) {
        self.main_queue
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push_back(runnable);
    }

    fn dispatch_on_main_thread(&self, runnable: RunnableVariant, _priority: Priority) {
        self.main_queue
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push_back(runnable);
    }

    fn dispatch_after(&self, duration: Duration, runnable: RunnableVariant) {
        let due = self.current_instant() + duration;
        self.timers
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(ScheduledTimer { due, runnable });
    }

    fn spawn_realtime(&self, f: Box<dyn FnOnce() + Send>) {
        f();
    }
}

/// Delegates to `FallbackAtlas` before an `ANativeWindow` attaches, and hot-swaps to
/// `WgpuRenderer::sprite_atlas()` once `surfaceChanged` initializes the GPU surface.
pub(crate) struct SwappableAtlas {
    inner: Mutex<Arc<dyn PlatformAtlas>>,
}

impl SwappableAtlas {
    pub(crate) fn new(initial: Arc<dyn PlatformAtlas>) -> Self {
        Self {
            inner: Mutex::new(initial),
        }
    }

    #[cfg(target_os = "android")]
    pub(crate) fn swap(&self, next: Arc<dyn PlatformAtlas>) {
        *self.inner.lock().unwrap_or_else(|e| e.into_inner()) = next;
    }
}

impl PlatformAtlas for SwappableAtlas {
    fn get_or_insert_with<'a>(
        &self,
        key: AtlasKey,
        build: &mut dyn FnMut() -> Result<Option<(Size<DevicePixels>, Cow<'a, [u8]>)>>,
    ) -> Result<Option<AtlasTile>> {
        let atlas = self.inner.lock().unwrap_or_else(|e| e.into_inner()).clone();
        atlas.get_or_insert_with(key, build)
    }

    fn remove(&self, key: &AtlasKey) {
        let atlas = self.inner.lock().unwrap_or_else(|e| e.into_inner()).clone();
        atlas.remove(key);
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

#[cfg(not(target_os = "android"))]
pub(crate) struct FallbackTextSystem;

#[cfg(not(target_os = "android"))]
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
