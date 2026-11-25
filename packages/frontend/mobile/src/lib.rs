//! L4 pure-Rust mobile product shell for AFFiNE (`affine-mobile`).
//!
//! Renders the 4-TabBar shell (`Home`, `Explorer`, `Journals`, `Search`), `Settings`
//! (10 groups, without `enable_editor_rtl`), `Page` header with `Breadcrumb` + `Location & Trail Sheet`
//! + independent `Backlinks` pill/sheet, `MobileBackCoordinator`, and production frame-1
//! `AccessibilityTree` export.

#![forbid(unsafe_code)]

pub mod a11y;
pub mod showcase;
pub mod state;
mod state_ops;
pub mod strings;
pub mod views;

use std::borrow::Cow;

use ui::App;
use ui_tokens::{bundled_font_bytes, bundled_script_font_bytes};

pub use a11y::{
    InMemoryPlatformAccessibility, MobileA11yAction, SafeAreaMetrics, build_accessibility_tree,
    perform_a11y_action, perform_a11y_action_with_viewport, validate_accessibility_tree,
};
pub use showcase::seed_showcase_state;
pub use state::{
    BackOutcome, MobileAppState, MobileBackCoordinator, MobileCollection, MobileDocRecord,
    MobileRoute, MobileSheet, MobileTab, SettingRowInteraction, SettingsGroupId, SettingsState,
    ThemePreference, WorkspaceData, WorkspaceSummary,
};
pub use state_ops::{decode_scoped_doc_target, encode_scoped_doc_target};
pub use strings::{MobileLocale, MobileStrings};
pub use views::MobileShellView;

#[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
const LINUX_CJK_FONT_CANDIDATES: [&str; 4] = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
];

/// Register bundled Inter, IBM Plex Mono, Noto Sans Arabic, and Noto Sans Hebrew fonts.
///
/// On native Linux (where headless `CosmicTextSystem::new_without_system_fonts` skips host font
/// scanning), also loads the first available system CJK fallback font so `zh-Hans` glyphs render
/// without bundling a CJK font into mobile binaries.
pub fn register_mobile_fonts(cx: &App) -> anyhow::Result<()> {
    let base_fonts = bundled_font_bytes()
        .into_iter()
        .chain(bundled_script_font_bytes())
        .map(Cow::Borrowed);

    #[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
    let fonts: Vec<Cow<'static, [u8]>> = {
        let mut list: Vec<Cow<'static, [u8]>> = base_fonts.collect();
        for path in LINUX_CJK_FONT_CANDIDATES {
            if let Ok(bytes) = std::fs::read(path)
                && !bytes.is_empty()
            {
                list.push(Cow::Owned(bytes));
                break;
            }
        }
        list
    };
    #[cfg(not(all(target_os = "linux", not(target_arch = "wasm32"))))]
    let fonts: Vec<Cow<'static, [u8]>> = base_fonts.collect();

    cx.text_system().add_fonts(fonts)
}
