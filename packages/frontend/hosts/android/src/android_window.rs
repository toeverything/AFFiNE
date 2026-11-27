#![allow(unsafe_code)]

//! Android NDK `ANativeWindow` binding, real EGL/GLES3 surface presentation,
//! and CPU fallback with producer handoff safety.

use core::ffi::{c_char, c_int, c_void};
use core::ptr::NonNull;
use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

use raw_window_handle::{
    AndroidDisplayHandle, AndroidNdkWindowHandle, DisplayHandle, HandleError, HasDisplayHandle,
    HasWindowHandle, RawDisplayHandle, RawWindowHandle, WindowHandle,
};
use ui::{DevicePixels, GpuContext, WgpuRenderer, WgpuSurfaceConfig, size};

use crate::jni_bridge::{JLong, JObject, JniEnvPtr};
use crate::{AndroidRenderBackend, SurfacePresentError};

#[repr(C)]
struct ANativeWindow {
    _private: [u8; 0],
}

#[repr(C)]
struct ANativeWindowBuffer {
    width: i32,
    height: i32,
    stride: i32,
    format: i32,
    bits: *mut c_void,
    reserved: [u32; 6],
}

#[repr(C)]
struct ARect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

type EglDisplay = *mut c_void;
type EglConfig = *mut c_void;
type EglContext = *mut c_void;
type EglSurface = *mut c_void;
type EglBoolean = u32;
type EglInt = i32;
type GlInt = i32;
type GlSizei = i32;
type GlFloat = f32;
type GlBitfield = u32;

const WINDOW_FORMAT_RGBA_8888: i32 = 1;
const RTLD_LAZY: c_int = 1;

const EGL_TRUE: EglBoolean = 1;
const EGL_NONE: EglInt = 0x3038;
const EGL_RED_SIZE: EglInt = 0x3024;
const EGL_GREEN_SIZE: EglInt = 0x3023;
const EGL_BLUE_SIZE: EglInt = 0x3022;
const EGL_ALPHA_SIZE: EglInt = 0x3021;
const EGL_SURFACE_TYPE: EglInt = 0x3033;
const EGL_WINDOW_BIT: EglInt = 0x0004;
const EGL_RENDERABLE_TYPE: EglInt = 0x3040;
const EGL_OPENGL_ES2_BIT: EglInt = 0x0004;
const EGL_OPENGL_ES3_BIT: EglInt = 0x0040;
const EGL_CONTEXT_CLIENT_VERSION: EglInt = 0x3098;
const GL_COLOR_BUFFER_BIT: GlBitfield = 0x0000_4000;

#[link(name = "android")]
unsafe extern "C" {
    fn ANativeWindow_fromSurface(env: JniEnvPtr, surface: JObject) -> *mut ANativeWindow;
    fn ANativeWindow_setBuffersGeometry(
        window: *mut ANativeWindow,
        width: i32,
        height: i32,
        format: i32,
    ) -> i32;
    fn ANativeWindow_lock(
        window: *mut ANativeWindow,
        out_buffer: *mut ANativeWindowBuffer,
        in_out_dirty_bounds: *mut ARect,
    ) -> i32;
    fn ANativeWindow_unlockAndPost(window: *mut ANativeWindow) -> i32;
    fn ANativeWindow_release(window: *mut ANativeWindow);
}

#[link(name = "EGL")]
unsafe extern "C" {
    fn eglGetDisplay(display_id: *mut c_void) -> EglDisplay;
    fn eglInitialize(dpy: EglDisplay, major: *mut EglInt, minor: *mut EglInt) -> EglBoolean;
    fn eglChooseConfig(
        dpy: EglDisplay,
        attrib_list: *const EglInt,
        configs: *mut EglConfig,
        config_size: EglInt,
        num_config: *mut EglInt,
    ) -> EglBoolean;
    fn eglCreateContext(
        dpy: EglDisplay,
        config: EglConfig,
        share_context: EglContext,
        attrib_list: *const EglInt,
    ) -> EglContext;
    fn eglCreateWindowSurface(
        dpy: EglDisplay,
        config: EglConfig,
        win: *mut ANativeWindow,
        attrib_list: *const EglInt,
    ) -> EglSurface;
    fn eglMakeCurrent(
        dpy: EglDisplay,
        draw: EglSurface,
        read: EglSurface,
        ctx: EglContext,
    ) -> EglBoolean;
    fn eglSwapBuffers(dpy: EglDisplay, surface: EglSurface) -> EglBoolean;
    fn eglDestroySurface(dpy: EglDisplay, surface: EglSurface) -> EglBoolean;
    fn eglDestroyContext(dpy: EglDisplay, ctx: EglContext) -> EglBoolean;
}

#[link(name = "GLESv2")]
unsafe extern "C" {
    fn glViewport(x: GlInt, y: GlInt, width: GlSizei, height: GlSizei);
    fn glClearColor(red: GlFloat, green: GlFloat, blue: GlFloat, alpha: GlFloat);
    fn glClear(mask: GlBitfield);
}

unsafe extern "C" {
    fn dlopen(filename: *const c_char, flags: c_int) -> *mut c_void;
    fn dlclose(handle: *mut c_void) -> c_int;
}

fn probe_shared_lib(name: &core::ffi::CStr) -> bool {
    let handle = unsafe { dlopen(name.as_ptr(), RTLD_LAZY) };
    if handle.is_null() {
        return false;
    }
    unsafe {
        let _ = dlclose(handle);
    }
    true
}

/// Probes available presentation backends.
///
/// Vulkan swapchain creation lands in the next stage with `wgpu`, so `vulkan`
/// reports `false` here and presentation starts at real EGL/GLES3 -> CPU fallback.
pub(crate) fn probe_backends() -> (bool, bool) {
    let egl_ok = probe_shared_lib(c"libEGL.so")
        && (probe_shared_lib(c"libGLESv3.so") || probe_shared_lib(c"libGLESv2.so"));
    (false, egl_ok)
}

#[derive(Clone, Copy)]
struct EglWindowState {
    display: usize,
    context: usize,
    surface: usize,
}

impl EglWindowState {
    fn create(win: *mut ANativeWindow) -> Option<Self> {
        let display = unsafe { eglGetDisplay(core::ptr::null_mut()) };
        if display.is_null() {
            return None;
        }
        let mut major = 0;
        let mut minor = 0;
        if unsafe { eglInitialize(display, &mut major, &mut minor) } != EGL_TRUE {
            return None;
        }

        let (config, client_version) = choose_egl_config(display, EGL_OPENGL_ES3_BIT, 3)
            .or_else(|| choose_egl_config(display, EGL_OPENGL_ES2_BIT, 2))?;

        let ctx_attribs = [EGL_CONTEXT_CLIENT_VERSION, client_version, EGL_NONE];
        let context = unsafe {
            eglCreateContext(display, config, core::ptr::null_mut(), ctx_attribs.as_ptr())
        };
        if context.is_null() {
            return None;
        }

        let surface = unsafe { eglCreateWindowSurface(display, config, win, core::ptr::null()) };
        if surface.is_null() {
            unsafe {
                let _ = eglDestroyContext(display, context);
            }
            return None;
        }

        Some(Self {
            display: display as usize,
            context: context as usize,
            surface: surface as usize,
        })
    }

    fn present_clear(&self, width: i32, height: i32, argb: u32) -> bool {
        let display = self.display as EglDisplay;
        let context = self.context as EglContext;
        let surface = self.surface as EglSurface;
        if unsafe { eglMakeCurrent(display, surface, surface, context) } != EGL_TRUE {
            return false;
        }
        let a = ((argb >> 24) & 0xFF) as f32 / 255.0;
        let r = ((argb >> 16) & 0xFF) as f32 / 255.0;
        let g = ((argb >> 8) & 0xFF) as f32 / 255.0;
        let b = (argb & 0xFF) as f32 / 255.0;
        unsafe {
            glViewport(0, 0, width, height);
            glClearColor(r, g, b, a);
            glClear(GL_COLOR_BUFFER_BIT);
        }
        let swapped = unsafe { eglSwapBuffers(display, surface) } == EGL_TRUE;
        unsafe {
            let _ = eglMakeCurrent(
                display,
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
            );
        }
        swapped
    }

    fn destroy(self) {
        let display = self.display as EglDisplay;
        let context = self.context as EglContext;
        let surface = self.surface as EglSurface;
        unsafe {
            let _ = eglMakeCurrent(
                display,
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
            );
            let _ = eglDestroySurface(display, surface);
            let _ = eglDestroyContext(display, context);
        }
    }
}

fn choose_egl_config(
    display: EglDisplay,
    renderable_bit: EglInt,
    client_version: EglInt,
) -> Option<(EglConfig, EglInt)> {
    let attribs = [
        EGL_SURFACE_TYPE,
        EGL_WINDOW_BIT,
        EGL_RENDERABLE_TYPE,
        renderable_bit,
        EGL_RED_SIZE,
        8,
        EGL_GREEN_SIZE,
        8,
        EGL_BLUE_SIZE,
        8,
        EGL_ALPHA_SIZE,
        8,
        EGL_NONE,
    ];
    let mut config: EglConfig = core::ptr::null_mut();
    let mut num_configs: EglInt = 0;
    let ok =
        unsafe { eglChooseConfig(display, attribs.as_ptr(), &mut config, 1, &mut num_configs) }
            == EGL_TRUE;
    if ok && num_configs > 0 && !config.is_null() {
        Some((config, client_version))
    } else {
        None
    }
}

struct WindowEntry {
    addr: usize,
    width: i32,
    height: i32,
    cpu_geometry_ok: bool,
    egl: Option<EglWindowState>,
}

static WINDOWS: OnceLock<Mutex<BTreeMap<JLong, WindowEntry>>> = OnceLock::new();

fn windows() -> &'static Mutex<BTreeMap<JLong, WindowEntry>> {
    WINDOWS.get_or_init(|| Mutex::new(BTreeMap::new()))
}

pub(crate) unsafe fn attach(env: JniEnvPtr, handle: JLong, surface: JObject) -> bool {
    release(handle);
    if env.is_null() || surface.is_null() {
        return false;
    }
    let win = unsafe { ANativeWindow_fromSurface(env, surface) };
    if win.is_null() {
        return false;
    }
    let mut map = windows().lock().unwrap_or_else(|p| p.into_inner());
    map.insert(
        handle,
        WindowEntry {
            addr: win as usize,
            width: 0,
            height: 0,
            cpu_geometry_ok: false,
            egl: None,
        },
    );
    true
}

pub(crate) fn set_geometry(handle: JLong, width: i32, height: i32) {
    if width <= 0 || height <= 0 {
        return;
    }
    let mut map = windows().lock().unwrap_or_else(|p| p.into_inner());
    if let Some(entry) = map.get_mut(&handle) {
        entry.width = width;
        entry.height = height;
        entry.cpu_geometry_ok = false;
    }
}

/// Presents a real pixel frame via EGL/GLES3 (`glClear` + `eglSwapBuffers`) or
/// `CpuFallback` (`ANativeWindow_lock` + `unlockAndPost`).
///
/// Never returns `Ok(())` without submitting pixels; tears down any active
/// `EGLSurface` before falling back to CPU `ANativeWindow_lock`.
pub(crate) fn present_frame(
    handle: JLong,
    backend: AndroidRenderBackend,
    argb: u32,
) -> Result<(), SurfacePresentError> {
    let mut map = windows().lock().unwrap_or_else(|p| p.into_inner());
    let Some(entry) = map.get_mut(&handle) else {
        return Err(SurfacePresentError::SurfaceLost);
    };
    if entry.width <= 0 || entry.height <= 0 {
        return Err(SurfacePresentError::NotReady);
    }
    let win = entry.addr as *mut ANativeWindow;

    match backend {
        AndroidRenderBackend::Unselected | AndroidRenderBackend::Vulkan => {
            Err(SurfacePresentError::BackendUnavailable)
        }
        AndroidRenderBackend::Gles3 => {
            if entry.egl.is_none() {
                entry.egl = EglWindowState::create(win);
            }
            let Some(egl) = entry.egl else {
                return Err(SurfacePresentError::BackendUnavailable);
            };
            if egl.present_clear(entry.width, entry.height, argb) {
                Ok(())
            } else {
                if let Some(stale) = entry.egl.take() {
                    stale.destroy();
                }
                Err(SurfacePresentError::BackendUnavailable)
            }
        }
        AndroidRenderBackend::CpuFallback => {
            if let Some(egl) = entry.egl.take() {
                egl.destroy();
            }
            if !entry.cpu_geometry_ok {
                let rc = unsafe {
                    ANativeWindow_setBuffersGeometry(
                        win,
                        entry.width,
                        entry.height,
                        WINDOW_FORMAT_RGBA_8888,
                    )
                };
                entry.cpu_geometry_ok = rc == 0;
                if !entry.cpu_geometry_ok {
                    return Err(SurfacePresentError::NotReady);
                }
            }
            let mut buffer = ANativeWindowBuffer {
                width: 0,
                height: 0,
                stride: 0,
                format: 0,
                bits: core::ptr::null_mut(),
                reserved: [0; 6],
            };
            if unsafe { ANativeWindow_lock(win, &mut buffer, core::ptr::null_mut()) } != 0 {
                return Err(SurfacePresentError::LockOrPostFailed);
            }
            let format_ok = buffer.format == WINDOW_FORMAT_RGBA_8888
                && !buffer.bits.is_null()
                && buffer.width > 0
                && buffer.height > 0
                && buffer.stride >= buffer.width;
            if format_ok {
                let a = ((argb >> 24) & 0xFF) as u8;
                let r = ((argb >> 16) & 0xFF) as u8;
                let g = ((argb >> 8) & 0xFF) as u8;
                let b = (argb & 0xFF) as u8;
                let rgba_le = u32::from_le_bytes([r, g, b, a]);
                let (width, height, stride) = (
                    buffer.width as usize,
                    buffer.height as usize,
                    buffer.stride as usize,
                );
                let pixels = buffer.bits as *mut u32;
                for row in 0..height {
                    let slice =
                        unsafe { core::slice::from_raw_parts_mut(pixels.add(row * stride), width) };
                    slice.fill(rgba_le);
                }
            }
            let post_ok = unsafe { ANativeWindow_unlockAndPost(win) == 0 };
            if format_ok && post_ok {
                Ok(())
            } else {
                Err(SurfacePresentError::LockOrPostFailed)
            }
        }
    }
}

pub(crate) fn native_window_ptr(handle: JLong) -> Option<*mut c_void> {
    let map = windows().lock().unwrap_or_else(|p| p.into_inner());
    let entry = map.get(&handle)?;
    if entry.addr == 0 {
        None
    } else {
        Some(entry.addr as *mut c_void)
    }
}

#[derive(Clone, Debug)]
struct AndroidRawWindow(NonNull<c_void>);

// SAFETY: `ANativeWindow` pointers are ref-counted NDK handles whose lifetime is
// strictly bounded by `surfaceDestroyed`, where `WgpuRenderer` is dropped before
// `ANativeWindow_release`.
unsafe impl Send for AndroidRawWindow {}
unsafe impl Sync for AndroidRawWindow {}

impl HasWindowHandle for AndroidRawWindow {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let handle = AndroidNdkWindowHandle::new(self.0);
        // SAFETY: `self.0` is a live `ANativeWindow*` owned by `WINDOWS` for the
        // duration of the returned `WgpuRenderer`.
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::AndroidNdk(handle)) })
    }
}

impl HasDisplayHandle for AndroidRawWindow {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        let handle = AndroidDisplayHandle::new();
        // SAFETY: Android's display handle is a zero-sized marker with no borrowed pointers.
        Ok(unsafe { DisplayHandle::borrow_raw(RawDisplayHandle::Android(handle)) })
    }
}

/// Creates a live `ui::WgpuRenderer` bound to the `ANativeWindow*` for `handle`.
pub(crate) fn create_wgpu_renderer(
    gpu_context: GpuContext,
    native_window: *mut c_void,
    width_px: u32,
    height_px: u32,
) -> anyhow::Result<WgpuRenderer> {
    let ptr =
        NonNull::new(native_window).ok_or_else(|| anyhow::anyhow!("null ANativeWindow pointer"))?;
    let raw_win = AndroidRawWindow(ptr);
    let config = WgpuSurfaceConfig {
        size: size(
            DevicePixels(width_px.max(1) as i32),
            DevicePixels(height_px.max(1) as i32),
        ),
        transparent: false,
        preferred_present_mode: None,
    };
    WgpuRenderer::new(gpu_context, &raw_win, config, None)
}

pub(crate) fn release(handle: JLong) {
    let prev = {
        let mut map = windows().lock().unwrap_or_else(|p| p.into_inner());
        map.remove(&handle)
    };
    if let Some(mut entry) = prev {
        if let Some(egl) = entry.egl.take() {
            egl.destroy();
        }
        unsafe {
            ANativeWindow_release(entry.addr as *mut ANativeWindow);
        }
    }
}
