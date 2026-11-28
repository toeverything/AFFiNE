//! Lazy off-UI-thread OS fallback font resolution for native `Mermaid` and `Typst`
//! code previews (`block_flow/native_providers.rs`).
//!
//! Keeps synchronous UI-thread RaTeX math rendering (`shared_font_pool()`) 100% free of
//! system `.ttc` disk reads, while dynamically resolving CJK and Emoji/Symbol fonts via
//! CoreText on macOS/iOS and platform font paths on Android/Linux inside background workers.

use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
};

use blocksuite_preview::{FontPool, SvgRasterizer};

use super::preview::shared_font_pool;

#[cfg(feature = "preview-typst")]
static NEW_CM_MATH_OTF: &[u8] = include_bytes!("../../assets/fonts/NewCMMath-Book.otf");

struct CodePreviewFontState {
    pool: FontPool,
    rasterizer: Arc<SvgRasterizer>,
    loaded_paths: HashSet<PathBuf>,
    #[cfg(target_os = "linux")]
    scanned_linux: bool,
}

fn code_preview_font_state() -> &'static Mutex<CodePreviewFontState> {
    static STATE: OnceLock<Mutex<CodePreviewFontState>> = OnceLock::new();
    STATE.get_or_init(|| {
        let mut pool = shared_font_pool().clone();
        #[cfg(feature = "preview-typst")]
        if pool.register_font_bytes(NEW_CM_MATH_OTF.to_vec()).is_ok() {
            pool.set_math_family("New Computer Modern Math");
        }
        let rasterizer = Arc::new(SvgRasterizer::new(&pool));
        Mutex::new(CodePreviewFontState {
            pool,
            rasterizer,
            loaded_paths: HashSet::new(),
            #[cfg(target_os = "linux")]
            scanned_linux: false,
        })
    })
}

/// Returns a snapshot `(FontPool, Arc<SvgRasterizer>)` for background `Mermaid` / `Typst`
/// rendering, lazily loading OS fallback fonts off the UI thread ONLY for non-ASCII codepoints
/// actually missing from the bundled font pool.
pub(super) fn acquire_code_preview_fonts(source: &str) -> (FontPool, Arc<SvgRasterizer>) {
    let mut guard = code_preview_font_state()
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    if !source.is_ascii() {
        let mut missing: Vec<char> = Vec::new();
        for ch in source.chars() {
            if !ch.is_ascii()
                && !ch.is_whitespace()
                && !guard.pool.has_glyph(ch)
                && !missing.contains(&ch)
            {
                missing.push(ch);
            }
        }
        if !missing.is_empty() && load_missing_os_fonts_into(&mut guard, &missing) {
            guard.rasterizer = Arc::new(SvgRasterizer::new(&guard.pool));
        }
    }
    (guard.pool.clone(), Arc::clone(&guard.rasterizer))
}

pub(super) fn is_cjk_or_kana_or_hangul(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3000..=0x30FF
            | 0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xAC00..=0xD7AF
            | 0xF900..=0xFAFF
            | 0xFF00..=0xFFEF
    )
}

fn try_register_font_file(state: &mut CodePreviewFontState, path: PathBuf) -> bool {
    if !state.loaded_paths.insert(path.clone()) {
        return false;
    }
    if let Ok(bytes) = std::fs::read(&path) {
        return state.pool.register_font_bytes(bytes).is_ok();
    }
    false
}

fn load_missing_os_fonts_into(state: &mut CodePreviewFontState, missing: &[char]) -> bool {
    let mut changed = false;

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        for &ch in missing {
            if state.pool.has_glyph(ch) {
                continue;
            }
            if let Some(path) = resolve_apple_font_path_for_char(ch)
                && try_register_font_file(state, path)
            {
                changed = true;
            }
            if !state.pool.has_glyph(ch) && is_cjk_or_kana_or_hangul(ch) {
                for name in [
                    "STHeitiSC-Medium",
                    "HiraginoSans-W3",
                    "HiraginoSansGB-W3",
                    "HiraMinProN-W3",
                    "Songti SC",
                ] {
                    if let Some(path) = resolve_apple_named_font_path(name)
                        && try_register_font_file(state, path)
                    {
                        changed = true;
                        if state.pool.has_glyph(ch) {
                            break;
                        }
                    }
                }
                if !state.pool.has_glyph(ch) {
                    for p in [
                        "/System/Library/Fonts/STHeiti Medium.ttc",
                        "/System/Library/Fonts/Hiragino Sans GB.ttc",
                        "/System/Library/Fonts/Supplemental/Songti.ttc",
                        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
                    ] {
                        if try_register_font_file(state, PathBuf::from(p)) {
                            changed = true;
                            if state.pool.has_glyph(ch) {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "android")]
    {
        const CJK_CANDIDATES: &[&str] = &[
            "/system/fonts/NotoSansCJK-Regular.ttc",
            "/system/fonts/DroidSansFallback.ttf",
        ];
        const SYM_CANDIDATES: &[&str] = &[
            "/system/fonts/NotoColorEmoji.ttf",
            "/system/fonts/NotoSansSymbols-Regular-Subsetted.ttf",
            "/system/fonts/NotoSansSymbols-Regular-Subsetted2.ttf",
        ];
        if missing
            .iter()
            .any(|&c| is_cjk_or_kana_or_hangul(c) && !state.pool.has_glyph(c))
        {
            for p in CJK_CANDIDATES {
                if try_register_font_file(state, PathBuf::from(p)) {
                    changed = true;
                }
            }
        }
        if missing.iter().any(|&c| !state.pool.has_glyph(c)) {
            for p in SYM_CANDIDATES {
                if try_register_font_file(state, PathBuf::from(p)) {
                    changed = true;
                }
            }
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
    {
        const CJK_CANDIDATES: &[&str] = &[
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        ];
        const SYM_CANDIDATES: &[&str] = &[
            "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ];
        if missing
            .iter()
            .any(|&c| is_cjk_or_kana_or_hangul(c) && !state.pool.has_glyph(c))
        {
            for p in CJK_CANDIDATES {
                if try_register_font_file(state, PathBuf::from(p)) {
                    changed = true;
                    if missing
                        .iter()
                        .all(|&c| !is_cjk_or_kana_or_hangul(c) || state.pool.has_glyph(c))
                    {
                        break;
                    }
                }
            }
        }
        if missing.iter().any(|&c| !state.pool.has_glyph(c)) {
            for p in SYM_CANDIDATES {
                if try_register_font_file(state, PathBuf::from(p)) {
                    changed = true;
                }
            }
        }
        #[cfg(target_os = "linux")]
        if !state.scanned_linux && missing.iter().any(|&c| !state.pool.has_glyph(c)) {
            state.scanned_linux = true;
            if scan_linux_fallback_fonts(state, missing) {
                changed = true;
            }
        }
    }

    changed
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn resolve_apple_font_path_for_char(ch: char) -> Option<PathBuf> {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CFRange {
        location: isize,
        length: isize,
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCharacters(
            alloc: *const c_void,
            chars: *const u16,
            num_chars: isize,
        ) -> *const c_void;
        fn CFURLGetFileSystemRepresentation(
            url: *const c_void,
            resolve_against_base: bool,
            buffer: *mut u8,
            max_buf_len: isize,
        ) -> bool;
        fn CFRelease(cf: *const c_void);
    }

    #[link(name = "CoreText", kind = "framework")]
    unsafe extern "C" {
        static kCTFontURLAttribute: *const c_void;
        fn CTFontCreateUIFontForLanguage(
            ui_type: u32,
            size: f64,
            language: *const c_void,
        ) -> *const c_void;
        fn CTFontCreateForString(
            current_font: *const c_void,
            string: *const c_void,
            range: CFRange,
        ) -> *const c_void;
        fn CTFontCopyAttribute(font: *const c_void, attribute: *const c_void) -> *const c_void;
    }

    let mut utf16 = [0u16; 2];
    let units = ch.encode_utf16(&mut utf16);
    #[allow(unsafe_code)]
    // SAFETY: CoreFoundation/CoreText C functions follow Create/Copy ownership rules; every
    // non-null CFTypeRef created or copied here is released before returning.
    unsafe {
        let base_font = CTFontCreateUIFontForLanguage(2, 16.0, std::ptr::null());
        if base_font.is_null() {
            return None;
        }
        let cf_str =
            CFStringCreateWithCharacters(std::ptr::null(), units.as_ptr(), units.len() as isize);
        if cf_str.is_null() {
            CFRelease(base_font);
            return None;
        }
        let matched = CTFontCreateForString(
            base_font,
            cf_str,
            CFRange {
                location: 0,
                length: units.len() as isize,
            },
        );
        CFRelease(cf_str);
        CFRelease(base_font);
        if matched.is_null() {
            return None;
        }
        let url = CTFontCopyAttribute(matched, kCTFontURLAttribute);
        CFRelease(matched);
        if url.is_null() {
            return None;
        }
        let mut buf = [0u8; 2048];
        let ok = CFURLGetFileSystemRepresentation(url, true, buf.as_mut_ptr(), buf.len() as isize);
        CFRelease(url);
        if !ok {
            return None;
        }
        let nul = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        let path_str = std::str::from_utf8(&buf[..nul]).ok()?;
        Some(PathBuf::from(path_str))
    }
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn resolve_apple_named_font_path(postscript_or_family: &str) -> Option<PathBuf> {
    use std::ffi::c_void;

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCharacters(
            alloc: *const c_void,
            chars: *const u16,
            num_chars: isize,
        ) -> *const c_void;
        fn CFURLGetFileSystemRepresentation(
            url: *const c_void,
            resolve_against_base: bool,
            buffer: *mut u8,
            max_buf_len: isize,
        ) -> bool;
        fn CFRelease(cf: *const c_void);
    }

    #[link(name = "CoreText", kind = "framework")]
    unsafe extern "C" {
        static kCTFontURLAttribute: *const c_void;
        fn CTFontCreateWithName(
            name: *const c_void,
            size: f64,
            matrix: *const c_void,
        ) -> *const c_void;
        fn CTFontCopyAttribute(font: *const c_void, attribute: *const c_void) -> *const c_void;
    }

    let units: Vec<u16> = postscript_or_family.encode_utf16().collect();
    #[allow(unsafe_code)]
    // SAFETY: CoreFoundation/CoreText Create/Copy handles are checked for null and released.
    unsafe {
        let cf_name =
            CFStringCreateWithCharacters(std::ptr::null(), units.as_ptr(), units.len() as isize);
        if cf_name.is_null() {
            return None;
        }
        let font = CTFontCreateWithName(cf_name, 16.0, std::ptr::null());
        CFRelease(cf_name);
        if font.is_null() {
            return None;
        }
        let url = CTFontCopyAttribute(font, kCTFontURLAttribute);
        CFRelease(font);
        if url.is_null() {
            return None;
        }
        let mut buf = [0u8; 2048];
        let ok = CFURLGetFileSystemRepresentation(url, true, buf.as_mut_ptr(), buf.len() as isize);
        CFRelease(url);
        if !ok {
            return None;
        }
        let nul = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        let path_str = std::str::from_utf8(&buf[..nul]).ok()?;
        Some(PathBuf::from(path_str))
    }
}

#[cfg(target_os = "linux")]
fn scan_linux_fallback_fonts(state: &mut CodePreviewFontState, missing: &[char]) -> bool {
    use std::os::unix::fs::MetadataExt;

    let mut changed = false;
    let mut visited_dirs: HashSet<(u64, u64)> = HashSet::new();
    let mut stack = vec![PathBuf::from("/usr/share/fonts")];
    while let Some(dir) = stack.pop() {
        if missing.iter().all(|&c| state.pool.has_glyph(c)) {
            break;
        }
        let Ok(meta) = std::fs::metadata(&dir) else {
            continue;
        };
        if !visited_dirs.insert((meta.dev(), meta.ino())) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else {
                continue;
            };
            if ft.is_symlink() {
                continue;
            }
            let path = entry.path();
            if ft.is_dir() {
                stack.push(path);
                continue;
            }
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let lower = name.to_ascii_lowercase();
            let wants_cjk = missing
                .iter()
                .any(|&c| is_cjk_or_kana_or_hangul(c) && !state.pool.has_glyph(c));
            let is_cjk = wants_cjk
                && (lower.contains("notosanscjk")
                    || lower.contains("notoserifcjk")
                    || lower.contains("droidsansfallback")
                    || lower.contains("wenquanyi")
                    || lower.contains("wqy-"));
            let is_sym = missing.iter().any(|&c| !state.pool.has_glyph(c))
                && (lower.contains("notocoloremoji")
                    || lower.contains("symbola")
                    || lower == "dejavusans.ttf");
            if (is_cjk || is_sym) && try_register_font_file(state, path) {
                changed = true;
            }
        }
    }
    changed
}
