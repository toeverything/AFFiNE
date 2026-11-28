//! `wasm32-unknown-unknown` Web Desktop mount entry and configuration.
//!
//! Provides a drop-in desktop shell mount (`wasm_desktop_main`) that replaces
//! single-document `PlaygroundView` on desktop viewports while leaving
//! `packages/frontend/hosts/web` untouched until integration.

use ui_tokens::ThemeMode;

use crate::workbench::DesktopAppState;

/// Configuration parsed from host query parameters or host bridge for Web Desktop boot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WebDesktopMountOptions {
    pub theme: ThemeMode,
    pub initial_doc_id: Option<String>,
    pub split_view: bool,
    pub today_date: String,
}

impl Default for WebDesktopMountOptions {
    fn default() -> Self {
        Self {
            theme: ThemeMode::Light,
            initial_doc_id: None,
            split_view: false,
            today_date: "2026-11-28".to_string(),
        }
    }
}

impl WebDesktopMountOptions {
    /// Build a ready-to-render [`DesktopAppState`] from mount options.
    pub fn build_state(&self) -> DesktopAppState {
        let mut state = DesktopAppState::seed_showcase(self.theme, &self.today_date);
        if let Some(doc_id) = &self.initial_doc_id {
            state.open_doc_in_active_pane(doc_id);
        }
        if self.split_view {
            state.open_split_edgeless_for_active_doc();
        }
        state
    }
}

/// Register a fetched static font payload before calling [`wasm_desktop_main`].
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn register_web_desktop_font(bytes: Vec<u8>) -> Result<(), wasm_bindgen::JsError> {
    blocksuite_editor::theme::register_web_font_bytes(bytes)
        .map_err(|err| wasm_bindgen::JsError::new(&format!("{err:#}")))
}

/// Mount the full multi-document [`crate::workbench::DesktopShellView`] on WebAssembly.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn wasm_desktop_main(dark: bool, split_view: bool) -> Result<(), wasm_bindgen::JsError> {
    use ui::AppContext as _;

    blocksuite_editor::theme::check_web_fonts()
        .map_err(|err| wasm_bindgen::JsError::new(&format!("{err:#}")))?;

    let options = WebDesktopMountOptions {
        theme: if dark {
            ThemeMode::Dark
        } else {
            ThemeMode::Light
        },
        split_view,
        ..WebDesktopMountOptions::default()
    };
    let platform = std::rc::Rc::new(ui::WebPlatform::new(false));
    ui::Application::with_platform(platform).run(move |cx| {
        if let Err(err) = crate::register_desktop_fonts(cx) {
            panic!("failed to register desktop fonts on web: {err:#}");
        }
        let state = options.build_state();
        if let Err(err) = cx.open_window(ui::WindowOptions::default(), |_, cx| {
            cx.new(|cx| crate::workbench::DesktopShellView::new(state, cx))
        }) {
            panic!("failed to open desktop web window: {err:#}");
        }
    });
    Ok(())
}
