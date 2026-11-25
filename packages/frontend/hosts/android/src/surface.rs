//! Android `SurfaceHolder.Callback` lifecycle, render backend selection
//! (`Vulkan -> Gles3 -> CpuFallback`), and swapchain-safe frame presentation.
//!
//! Replaces the S1 one-shot `lockCanvas` placeholder and guarantees that
//! `pending_frame` is only cleared after a frame successfully presents.

/// Default observable first-frame clear color (opaque `#141414` ARGB).
pub const DEFAULT_CLEAR_COLOR_ARGB: u32 = 0xFF14_1414;

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
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SurfaceLifecycleState {
    pub active: bool,
    pub bound: bool,
    pub generation: u64,
    pub format: i32,
    pub width_px: u32,
    pub height_px: u32,
    pub frame_count: u64,
    pub last_frame_nanos: i64,
    pub pending_frame: bool,
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
            generation: 0,
            format: 0,
            width_px: 0,
            height_px: 0,
            frame_count: 0,
            last_frame_nanos: 0,
            pending_frame: true,
            clear_color_argb: DEFAULT_CLEAR_COLOR_ARGB,
            backend: AndroidRenderBackend::Unselected,
            present_failures: 0,
        }
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
    /// Increments the surface generation and marks a pending redraw so
    /// background/foreground recreation seamlessly restores the frame.
    pub fn on_created(&mut self, surface_non_null: bool) {
        self.generation = self.generation.saturating_add(1);
        self.active = true;
        self.bound = surface_non_null;
        self.pending_frame = true;
    }

    /// Handles `SurfaceHolder.Callback.surfaceChanged(format, width, height)`.
    pub fn on_changed(&mut self, format: i32, width_px: u32, height_px: u32) {
        self.format = format;
        self.width_px = width_px;
        self.height_px = height_px;
        if width_px > 0 && height_px > 0 {
            self.pending_frame = true;
        }
    }

    /// Handles `SurfaceHolder.Callback.surfaceDestroyed`.
    ///
    /// Detaches the native surface while keeping `pending_frame = true` so the
    /// next `surfaceCreated` + `surfaceChanged` pair immediately presents.
    pub fn on_destroyed(&mut self) {
        self.active = false;
        self.bound = false;
        self.pending_frame = true;
    }

    /// Schedules a frame render on the next `Choreographer` tick.
    pub fn request_frame(&mut self) {
        self.pending_frame = true;
    }

    /// Returns `true` when the surface is attached and has non-zero dimensions.
    pub const fn is_ready(&self) -> bool {
        self.active && self.bound && self.width_px > 0 && self.height_px > 0
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
}
