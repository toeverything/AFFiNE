//! Android `SurfaceHolder.Callback` lifecycle, render backend selection
//! (`Vulkan -> Gles3 -> CpuFallback`), and swapchain-safe frame presentation.
//!
//! Replaces the S1 one-shot `lockCanvas` placeholder and guarantees that
//! `pending_frame` is only cleared after a frame successfully presents.

/// Default observable first-frame clear color (opaque `#FAFAFC` ARGB, matching iOS light canvas).
pub const DEFAULT_CLEAR_COLOR_ARGB: u32 = 0xFFFA_FAFC;

/// Logical-dp window insets forwarded across the Android JNI boundary.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct LogicalWindowInsets {
    pub safe_top: f32,
    pub safe_right: f32,
    pub safe_bottom: f32,
    pub safe_left: f32,
    /// Absolute keyboard overlap height from the window bottom edge in logical `dp`.
    /// Does not subtract `safe_bottom`; `ui::WindowInsets::effective()` takes the max.
    pub ime_bottom: f32,
}

impl LogicalWindowInsets {
    /// Returns keyboard height strictly above the bottom navigation bar in logical `dp`,
    /// preventing double-deduction when combining `safe_bottom` and `ime_bottom`.
    pub fn effective_ime_above_nav_bar(&self) -> f32 {
        (self.ime_bottom - self.safe_bottom).max(0.0)
    }
}

/// Converts Android `WindowInsets` physical pixel measurements into logical `dp`.
pub fn physical_insets_to_logical_dp(
    safe_top_px: i32,
    safe_right_px: i32,
    safe_bottom_px: i32,
    safe_left_px: i32,
    ime_bottom_px: i32,
    density: f32,
) -> LogicalWindowInsets {
    let safe_density = if density.is_finite() && density > 0.0 {
        density
    } else {
        1.0
    };
    let top = safe_top_px.max(0);
    let right = safe_right_px.max(0);
    let bottom = safe_bottom_px.max(0);
    let left = safe_left_px.max(0);
    let ime = ime_bottom_px.max(0);
    LogicalWindowInsets {
        safe_top: top as f32 / safe_density,
        safe_right: right as f32 / safe_density,
        safe_bottom: bottom as f32 / safe_density,
        safe_left: left as f32 / safe_density,
        ime_bottom: ime as f32 / safe_density,
    }
}

/// Active Android presentation backend with deterministic fallback order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum AndroidRenderBackend {
    Unselected = 0,
    Vulkan = 1,
    Gles3 = 2,
    CpuFallback = 3,
}

impl AndroidRenderBackend {
    /// Returns the next lower backend on surface loss or driver failure.
    pub const fn downgrade(self) -> Self {
        match self {
            Self::Unselected | Self::Vulkan => Self::Gles3,
            Self::Gles3 | Self::CpuFallback => Self::CpuFallback,
        }
    }
}

/// Failure reason reported when presenting a frame to an Android `Surface`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SurfacePresentError {
    NotReady,
    SurfaceLost,
    BackendUnavailable,
    LockOrPostFailed,
}

/// Lifecycle state for an Android `SurfaceView` native window binding.
#[derive(Debug, Clone, PartialEq)]
pub struct SurfaceLifecycleState {
    pub active: bool,
    pub bound: bool,
    pub configured_for_generation: bool,
    pub generation: u64,
    pub texture_generation: u64,
    pub recreation_count: u64,
    pub format: i32,
    pub width_px: u32,
    pub height_px: u32,
    pub density: f32,
    pub scroll_offset_x: f32,
    pub scroll_offset_y: f32,
    pub frame_count: u64,
    pub last_frame_nanos: i64,
    pub pending_frame: bool,
    pub needs_first_frame_after_recreate: bool,
    pub clear_color_argb: u32,
    pub backend: AndroidRenderBackend,
    pub present_failures: u64,
}

impl Default for SurfaceLifecycleState {
    fn default() -> Self {
        Self::new()
    }
}

impl SurfaceLifecycleState {
    /// Creates an unbound surface lifecycle state with a pending initial frame.
    pub const fn new() -> Self {
        Self {
            active: false,
            bound: false,
            configured_for_generation: false,
            generation: 0,
            texture_generation: 0,
            recreation_count: 0,
            format: 0,
            width_px: 0,
            height_px: 0,
            density: 1.0,
            scroll_offset_x: 0.0,
            scroll_offset_y: 0.0,
            frame_count: 0,
            last_frame_nanos: 0,
            pending_frame: true,
            needs_first_frame_after_recreate: true,
            clear_color_argb: DEFAULT_CLEAR_COLOR_ARGB,
            backend: AndroidRenderBackend::Unselected,
            present_failures: 0,
        }
    }

    /// Updates the display density preserved across surface recreation.
    pub fn set_density(&mut self, density: f32) {
        if density.is_finite() && density > 0.0 {
            self.density = density;
        }
    }

    /// Updates viewport scroll offsets preserved across surface recreation.
    pub fn set_scroll_offset(&mut self, scroll_x: f32, scroll_y: f32) {
        if scroll_x.is_finite() {
            self.scroll_offset_x = scroll_x;
        }
        if scroll_y.is_finite() {
            self.scroll_offset_y = scroll_y;
        }
    }

    /// Handles a Vulkan device-lost or swapchain init failure by downgrading to GLES3
    /// while preserving viewport, scroll, and session state.
    pub fn report_vulkan_device_lost(&mut self) -> AndroidRenderBackend {
        self.present_failures = self.present_failures.saturating_add(1);
        self.texture_generation = self.texture_generation.saturating_add(1);
        self.pending_frame = true;
        self.needs_first_frame_after_recreate = true;
        if matches!(
            self.backend,
            AndroidRenderBackend::Unselected | AndroidRenderBackend::Vulkan
        ) {
            self.backend = AndroidRenderBackend::Gles3;
        }
        self.backend
    }

    /// Selects the highest available backend: `Vulkan -> Gles3 -> CpuFallback`.
    pub fn select_backend(
        &mut self,
        vulkan_available: bool,
        gles3_available: bool,
    ) -> AndroidRenderBackend {
        self.backend = if vulkan_available {
            AndroidRenderBackend::Vulkan
        } else if gles3_available {
            AndroidRenderBackend::Gles3
        } else {
            AndroidRenderBackend::CpuFallback
        };
        self.backend
    }

    /// Handles `SurfaceHolder.Callback.surfaceCreated`.
    ///
    /// Increments surface and texture generations and marks `configured_for_generation = false`
    /// until `surfaceChanged` delivers non-zero dimensions for this generation, while preserving
    /// previous viewport dimensions, DPI, and scroll offset for layout memory.
    pub fn on_created(&mut self, surface_non_null: bool) {
        self.generation = self.generation.saturating_add(1);
        self.texture_generation = self.texture_generation.saturating_add(1);
        if self.generation > 1 {
            self.recreation_count = self.recreation_count.saturating_add(1);
        }
        self.active = true;
        self.bound = surface_non_null;
        self.configured_for_generation = false;
        self.pending_frame = true;
        self.needs_first_frame_after_recreate = true;
    }

    /// Handles `SurfaceHolder.Callback.surfaceChanged(format, width, height)`.
    pub fn on_changed(&mut self, format: i32, width_px: u32, height_px: u32) {
        self.format = format;
        self.width_px = width_px;
        self.height_px = height_px;
        self.configured_for_generation = width_px > 0 && height_px > 0;
        if self.configured_for_generation {
            self.pending_frame = true;
        }
    }

    /// Handles `SurfaceHolder.Callback.surfaceDestroyed`.
    ///
    /// Detaches the native surface while preserving viewport size, DPI, scroll,
    /// and backend state so the next `surfaceCreated` + `surfaceChanged` pair
    /// immediately presents a recovered first frame.
    pub fn on_destroyed(&mut self) {
        self.active = false;
        self.bound = false;
        self.configured_for_generation = false;
        self.pending_frame = true;
        self.needs_first_frame_after_recreate = true;
    }

    /// Schedules a frame render on the next `Choreographer` tick.
    pub fn request_frame(&mut self) {
        self.pending_frame = true;
    }

    /// Returns `true` when the surface is attached and configured with non-zero
    /// dimensions for the current generation.
    pub const fn is_ready(&self) -> bool {
        self.active
            && self.bound
            && self.configured_for_generation
            && self.width_px > 0
            && self.height_px > 0
    }

    /// Begins a frame tick without clearing `pending_frame` until presentation succeeds.
    pub fn begin_frame(&self) -> Option<u32> {
        if !self.is_ready() {
            return None;
        }
        Some(self.clear_color_argb)
    }

    /// Records the outcome of submitting a frame to the Android `Surface`.
    ///
    /// Clears `pending_frame` ONLY on `Ok(())`. Any error keeps `pending_frame = true`
    /// so the next `Choreographer` tick retries automatically without new user input,
    /// and surface-loss / backend-unavailable errors trigger `Vulkan -> Gles3` downgrade.
    pub fn complete_frame(
        &mut self,
        frame_time_nanos: i64,
        result: Result<(), SurfacePresentError>,
    ) -> bool {
        match result {
            Ok(()) => {
                self.frame_count = self.frame_count.saturating_add(1);
                self.last_frame_nanos = frame_time_nanos;
                self.pending_frame = false;
                self.needs_first_frame_after_recreate = false;
                true
            }
            Err(err) => {
                self.present_failures = self.present_failures.saturating_add(1);
                self.pending_frame = true;
                if matches!(
                    err,
                    SurfacePresentError::SurfaceLost | SurfacePresentError::BackendUnavailable
                ) {
                    self.backend = self.backend.downgrade();
                    self.texture_generation = self.texture_generation.saturating_add(1);
                }
                false
            }
        }
    }

    /// Convenience tick for headless/non-Android hosts where presentation succeeds.
    pub fn on_frame_tick(&mut self, frame_time_nanos: i64) -> Option<u32> {
        let argb = self.begin_frame()?;
        self.complete_frame(frame_time_nanos, Ok(()));
        Some(argb)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_recreation_preserves_pending_frame_and_advances_generation() {
        let mut surface = SurfaceLifecycleState::new();
        assert!(!surface.is_ready());
        assert!(surface.pending_frame);
        assert_eq!(surface.on_frame_tick(16_000_000), None);
        assert_eq!(surface.frame_count, 0);

        surface.on_created(true);
        assert_eq!(surface.generation, 1);
        assert!(!surface.is_ready());
        surface.on_changed(1, 1080, 2400);
        assert!(surface.is_ready());
        assert!(surface.pending_frame);

        assert_eq!(
            surface.on_frame_tick(16_666_667),
            Some(DEFAULT_CLEAR_COLOR_ARGB)
        );
        assert_eq!(surface.frame_count, 1);
        assert!(!surface.pending_frame);

        // Background: surface destroyed -> ticks are ignored, pending_frame stays set.
        surface.on_destroyed();
        assert!(!surface.is_ready());
        assert!(surface.pending_frame);
        assert_eq!(surface.on_frame_tick(33_333_334), None);
        assert_eq!(surface.frame_count, 1);

        // Foreground: new surface created with updated dimensions -> seamlessly resumes.
        surface.on_created(true);
        assert_eq!(surface.generation, 2);
        surface.on_changed(1, 2400, 1080);
        assert!(surface.is_ready());
        assert!(surface.pending_frame);
        assert_eq!(
            surface.on_frame_tick(50_000_000),
            Some(DEFAULT_CLEAR_COLOR_ARGB)
        );
        assert_eq!(surface.frame_count, 2);
        assert_eq!(surface.width_px, 2400);
        assert_eq!(surface.height_px, 1080);
    }

    #[test]
    fn present_failure_keeps_pending_frame_and_downgrades_vulkan_to_gles3() {
        let mut surface = SurfaceLifecycleState::new();
        assert_eq!(
            surface.select_backend(true, true),
            AndroidRenderBackend::Vulkan
        );
        surface.on_created(true);
        surface.on_changed(1, 1080, 2400);

        // First submit fails with SurfaceLost -> pending_frame stays true & backend downgrades to Gles3.
        assert_eq!(surface.begin_frame(), Some(DEFAULT_CLEAR_COLOR_ARGB));
        assert!(!surface.complete_frame(16_000_000, Err(SurfacePresentError::SurfaceLost)));
        assert!(surface.pending_frame);
        assert_eq!(surface.frame_count, 0);
        assert_eq!(surface.present_failures, 1);
        assert_eq!(surface.backend, AndroidRenderBackend::Gles3);

        // Lock/post failure also keeps pending_frame true without incrementing frame_count.
        assert!(!surface.complete_frame(32_000_000, Err(SurfacePresentError::LockOrPostFailed)));
        assert!(surface.pending_frame);
        assert_eq!(surface.frame_count, 0);
        assert_eq!(surface.present_failures, 2);
        assert_eq!(surface.backend, AndroidRenderBackend::Gles3);

        // BackendUnavailable on Gles3 downgrades to CpuFallback while preserving pending_frame.
        assert!(!surface.complete_frame(40_000_000, Err(SurfacePresentError::BackendUnavailable)));
        assert!(surface.pending_frame);
        assert_eq!(surface.frame_count, 0);
        assert_eq!(surface.present_failures, 3);
        assert_eq!(surface.backend, AndroidRenderBackend::CpuFallback);

        // Retry succeeds -> clears pending_frame and advances frame_count.
        assert!(surface.complete_frame(48_000_000, Ok(())));
        assert!(!surface.pending_frame);
        assert_eq!(surface.frame_count, 1);
    }

    #[test]
    fn null_or_zero_sized_surface_never_presents() {
        let mut surface = SurfaceLifecycleState::new();
        surface.on_created(false);
        surface.on_changed(1, 1080, 2400);
        assert!(!surface.is_ready());
        assert_eq!(surface.on_frame_tick(10_000), None);

        surface.on_created(true);
        surface.on_changed(1, 0, 2400);
        assert!(!surface.is_ready());
        assert_eq!(surface.on_frame_tick(20_000), None);
    }

    #[test]
    fn surface_recreation_and_vulkan_device_loss_preserve_viewport_dpi_and_scroll() {
        let mut surface = SurfaceLifecycleState::new();
        assert_eq!(
            surface.select_backend(true, true),
            AndroidRenderBackend::Vulkan
        );
        surface.set_density(3.0);
        surface.set_scroll_offset(12.5, 420.0);
        surface.on_created(true);
        surface.on_changed(1, 1080, 2400);
        assert!(surface.needs_first_frame_after_recreate);
        assert_eq!(surface.recreation_count, 0);
        assert_eq!(surface.texture_generation, 1);

        // First frame presented under Vulkan.
        assert_eq!(
            surface.on_frame_tick(16_000_000),
            Some(DEFAULT_CLEAR_COLOR_ARGB)
        );
        assert!(!surface.needs_first_frame_after_recreate);

        // Simulate Vulkan device loss -> downgrades to GLES3 while keeping state intact.
        assert_eq!(
            surface.report_vulkan_device_lost(),
            AndroidRenderBackend::Gles3
        );
        assert!(surface.pending_frame);
        assert!(surface.needs_first_frame_after_recreate);
        assert_eq!(surface.texture_generation, 2);
        assert_eq!(surface.density, 3.0);
        assert_eq!(surface.scroll_offset_x, 12.5);
        assert_eq!(surface.scroll_offset_y, 420.0);

        // Rotation / backgrounding -> surfaceDestroyed -> surfaceCreated -> surfaceChanged.
        surface.on_destroyed();
        assert!(!surface.is_ready());
        assert_eq!(surface.density, 3.0);
        assert_eq!(surface.scroll_offset_y, 420.0);

        surface.on_created(true);
        assert_eq!(surface.generation, 2);
        assert_eq!(surface.recreation_count, 1);
        assert_eq!(surface.texture_generation, 3);
        // Before surfaceChanged arrives for generation 2, is_ready() MUST be false even though
        // previous width_px/height_px are remembered for layout, preventing 0x0 present failures.
        assert!(!surface.is_ready());
        assert_eq!(surface.on_frame_tick(24_000_000), None);
        assert_eq!(surface.present_failures, 1);

        surface.on_changed(1, 2400, 1080);
        assert!(surface.is_ready());
        assert_eq!(
            surface.on_frame_tick(32_000_000),
            Some(DEFAULT_CLEAR_COLOR_ARGB)
        );
        assert!(!surface.needs_first_frame_after_recreate);
        assert_eq!(surface.backend, AndroidRenderBackend::Gles3);
        assert_eq!(surface.density, 3.0);
        assert_eq!(surface.scroll_offset_y, 420.0);
    }
}
