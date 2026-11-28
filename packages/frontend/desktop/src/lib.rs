//! L4 pure-Rust Web Desktop & Electron desktop application shell (`affine-desktop`).
//!
//! Owns the multi-pane `Workbench`, collapsible/resizable `AppSidebar`, multi-tab
//! Split View with live shared `affine-store` + `blocksuite-playground-doc` Page/Edgeless
//! synchronization and per-pane `NavHistory`, `Cmd/Ctrl+K` `QuickSearch`, centered
//! `PeekView`, physically isolated `ComposerDraftStore`, and `wasm32` mount entry.

#![forbid(unsafe_code)]

pub mod doc_store;
pub mod draft_store;
pub mod editor_host;
pub mod pane_render;
pub mod peek_view;
pub mod quick_search;
pub mod settings_modal;
pub mod showcase;
pub mod sidebar;
mod sidebar_tree;
pub mod split_view;
#[cfg(not(target_family = "wasm"))]
pub mod sqlite_loader;
pub mod state;
pub mod views_extra;
pub mod wasm_entry;
pub mod workbench;

#[cfg(not(target_arch = "wasm32"))]
use std::borrow::Cow;

use blocksuite_editor::theme::PlaygroundTheme;
use ui::{App, Hsla, Styled};
use ui_tokens::{DARK_THEME, LIGHT_THEME, Rgba, ThemeMode};
#[cfg(not(target_arch = "wasm32"))]
use ui_tokens::{bundled_font_bytes, bundled_script_font_bytes};

pub use doc_store::{
    DesktopCollection, DesktopDocMeta, DesktopDocStore, DesktopWorkspace, WorkspaceKind,
};
#[cfg(not(target_family = "wasm"))]
pub use draft_store::DiskDraftBackend;
pub use draft_store::{
    AttachmentMeta, ComposerDraft, ComposerDraftStore, ContentHash, DesktopDraftBackend,
    DraftImportReport, DraftImportSource, DraftStorageBackend, DraftStoreError, DraftStoreResult,
    DraftStoreSnapshot, ElectronDualSourceDraftImporter, LegacyDraftAttachment, LegacyDraftRecord,
    MemoryDraftBackend, WebDesktopLegacyDraftImporter, validate_isolated_namespace,
};
pub use editor_host::DesktopEditorHost;
pub use peek_view::{PeekAction, PeekViewState};
pub use quick_search::{QuickCommandId, QuickSearchItem, QuickSearchState};
pub use sidebar::{SidebarSection, SidebarState};
pub use split_view::{DesktopRoute, DocViewMode, PaneId, PaneState, SplitLayout, TabItem};
pub use state::ThemePreference;
pub use wasm_entry::WebDesktopMountOptions;
#[cfg(target_arch = "wasm32")]
pub use wasm_entry::{register_web_desktop_font, wasm_desktop_main};
pub use workbench::{DesktopAppState, DesktopModal, DesktopShellView, DocInspectorTab};

pub(crate) const SIDEBAR_TOGGLE_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7.5 3.5V16.5" stroke="currentColor" stroke-width="1.5"/></svg>"#;
pub(crate) const SEARCH_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M13.2 13.2L17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>"#;
pub(crate) const PLUS_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path d="M10 4.5V15.5M4.5 10H15.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>"#;
pub(crate) const DOC_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path d="M5.5 3.5H11.5L15 7V16.5H5.5V3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 3.5V7.5H15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>"#;
pub(crate) const EDGELESS_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect x="3.5" y="4" width="6.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/><circle cx="14" cy="13.5" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 7H14V10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(crate) const STAR_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path d="M10 3L12.1 7.3L16.8 8L13.4 11.3L14.2 16L10 13.8L5.8 16L6.6 11.3L3.2 8L7.9 7.3L10 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>"#;
pub(crate) const STAR_FILLED_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2.5L12.3 7.2L17.5 7.9L13.7 11.6L14.6 16.8L10 14.3L5.4 16.8L6.3 11.6L2.5 7.9L7.7 7.2L10 2.5Z"/></svg>"#;
pub(crate) const JOURNAL_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect x="3.5" y="4.5" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 8.5H16.5M7 2.8V5.2M13 2.8V5.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>"#;
pub(crate) const FOLDER_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path d="M3 5.5H8L9.6 7.5H17V15.5H3V5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>"#;
pub(crate) const COLLECTION_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/><rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.5"/></svg>"#;
pub(crate) const TAG_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path d="M3.5 10.2V4.5H9.2L16.5 11.8L10.8 17.5L3.5 10.2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="7" cy="7.8" r="1" fill="currentColor"/></svg>"#;
pub(crate) const TRASH_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><path d="M4.5 6H15.5M7.5 6V4.2H12.5V6M6 6L6.7 16H13.3L14 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(crate) const SETTINGS_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.6" stroke="currentColor" stroke-width="1.5"/><path d="M10 3.2V5M10 15V16.8M3.2 10H5M15 10H16.8M5.2 5.2L6.5 6.5M13.5 13.5L14.8 14.8M14.8 5.2L13.5 6.5M6.5 13.5L5.2 14.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>"#;
pub(crate) const SPLIT_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10 4V16" stroke="currentColor" stroke-width="1.5"/></svg>"#;
pub(crate) const INFO_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.8" stroke="currentColor" stroke-width="1.5"/><path d="M10 9V13.5M10 6.7V6.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>"#;
pub(crate) const CHEVRON_LEFT_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(crate) const CHEVRON_RIGHT_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(crate) const CHEVRON_DOWN_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>"#;
pub(crate) const CLOSE_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>"#;
pub(crate) const PEEK_ICON_SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="6.5" y="7" width="7" height="6" rx="1" stroke="currentColor" stroke-width="1.4"/></svg>"#;

/// Resolved color palette for the AFFiNE Web Desktop shell.
#[derive(Clone, Copy, Debug)]
pub struct DesktopPalette {
    pub bg_canvas: Hsla,
    pub bg_sidebar: Hsla,
    pub bg_surface: Hsla,
    pub bg_elevated: Hsla,
    pub bg_hover: Hsla,
    pub bg_active: Hsla,
    pub bg_pill: Hsla,
    pub text_primary: Hsla,
    pub text_secondary: Hsla,
    pub text_muted: Hsla,
    pub border: Hsla,
    pub border_strong: Hsla,
    pub accent: Hsla,
    pub accent_soft: Hsla,
    pub danger: Hsla,
    pub danger_soft: Hsla,
    pub success: Hsla,
    pub scrim: Hsla,
}

fn rgba_to_hsla(c: Rgba) -> Hsla {
    ui::Rgba {
        r: f32::from(c.r) / 255.0,
        g: f32::from(c.g) / 255.0,
        b: f32::from(c.b) / 255.0,
        a: f32::from(c.a) / 255.0,
    }
    .into()
}

pub fn playground_theme_for(mode: ThemeMode) -> PlaygroundTheme {
    match mode {
        ThemeMode::Light => PlaygroundTheme::Light,
        ThemeMode::Dark => PlaygroundTheme::Dark,
    }
}

pub fn palette_for(mode: ThemeMode) -> DesktopPalette {
    let t = match mode {
        ThemeMode::Light => &LIGHT_THEME,
        ThemeMode::Dark => &DARK_THEME,
    };
    let is_dark = mode == ThemeMode::Dark;
    DesktopPalette {
        bg_canvas: rgba_to_hsla(t.background_primary),
        bg_sidebar: if is_dark {
            ui::hsla(0.0, 0.0, 0.11, 1.0)
        } else {
            ui::hsla(0.0, 0.0, 0.965, 1.0)
        },
        bg_surface: rgba_to_hsla(t.background_secondary),
        bg_elevated: if is_dark {
            ui::hsla(0.0, 0.0, 0.16, 1.0)
        } else {
            ui::hsla(0.0, 0.0, 1.0, 1.0)
        },
        bg_hover: if is_dark {
            ui::hsla(0.0, 0.0, 1.0, 0.06)
        } else {
            ui::hsla(0.0, 0.0, 0.0, 0.045)
        },
        bg_active: if is_dark {
            ui::hsla(0.58, 0.72, 0.54, 0.22)
        } else {
            ui::hsla(0.58, 0.85, 0.52, 0.12)
        },
        bg_pill: if is_dark {
            ui::hsla(0.0, 0.0, 1.0, 0.08)
        } else {
            ui::hsla(0.0, 0.0, 0.0, 0.05)
        },
        text_primary: rgba_to_hsla(t.text_primary),
        text_secondary: rgba_to_hsla(t.text_secondary),
        text_muted: if is_dark {
            ui::hsla(0.0, 0.0, 0.56, 1.0)
        } else {
            ui::hsla(0.0, 0.0, 0.46, 1.0)
        },
        border: rgba_to_hsla(t.border),
        border_strong: if is_dark {
            ui::hsla(0.0, 0.0, 1.0, 0.18)
        } else {
            ui::hsla(0.0, 0.0, 0.0, 0.14)
        },
        accent: rgba_to_hsla(t.primary),
        accent_soft: if is_dark {
            ui::hsla(0.58, 0.75, 0.55, 0.18)
        } else {
            ui::hsla(0.58, 0.85, 0.52, 0.10)
        },
        danger: ui::hsla(0.0, 0.76, 0.56, 1.0),
        danger_soft: if is_dark {
            ui::hsla(0.0, 0.72, 0.52, 0.18)
        } else {
            ui::hsla(0.0, 0.76, 0.56, 0.10)
        },
        success: ui::hsla(0.39, 0.62, 0.44, 1.0),
        scrim: if is_dark {
            ui::hsla(0.0, 0.0, 0.0, 0.58)
        } else {
            ui::hsla(0.0, 0.0, 0.08, 0.34)
        },
    }
}

pub(crate) trait DesktopFlexExt: Styled {
    fn justify_between(mut self) -> Self {
        self.style().justify_content = Some(ui::JustifyContent::SpaceBetween);
        self
    }

    fn h_full(mut self) -> Self {
        self.style().size.height = Some(ui::relative(1.0).into());
        self
    }

    fn items_start(mut self) -> Self {
        self.style().align_items = Some(ui::AlignItems::FlexStart);
        self
    }

    fn items_stretch(mut self) -> Self {
        self.style().align_items = Some(ui::AlignItems::Stretch);
        self
    }

    fn min_w_0(mut self) -> Self {
        self.style().min_size.width = Some(ui::px(0.0).into());
        self
    }

    fn border_t_1(mut self) -> Self {
        self.style().border_widths.top = Some(ui::px(1.0).into());
        self
    }

    fn border_l_1(mut self) -> Self {
        self.style().border_widths.left = Some(ui::px(1.0).into());
        self
    }

    fn border_r_1(mut self) -> Self {
        self.style().border_widths.right = Some(ui::px(1.0).into());
        self
    }
}

impl<T: Styled> DesktopFlexExt for T {}

#[cfg(all(target_os = "linux", not(target_arch = "wasm32")))]
const LINUX_CJK_FONT_CANDIDATES: [&str; 4] = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
];

/// Register bundled Inter, IBM Plex Mono, and script fallback fonts.
#[cfg(not(target_arch = "wasm32"))]
pub fn register_desktop_fonts(cx: &App) -> anyhow::Result<()> {
    let base_fonts = bundled_font_bytes()
        .into_iter()
        .chain(bundled_script_font_bytes())
        .map(Cow::Borrowed);

    #[cfg(target_os = "linux")]
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
    #[cfg(not(target_os = "linux"))]
    let fonts: Vec<Cow<'static, [u8]>> = base_fonts.collect();

    cx.text_system().add_fonts(fonts)
}

/// Register web-fetched fonts queued via `register_web_desktop_font`.
#[cfg(target_arch = "wasm32")]
pub fn register_desktop_fonts(cx: &App) -> anyhow::Result<()> {
    blocksuite_editor::theme::register_bundled_fonts(cx)
}
