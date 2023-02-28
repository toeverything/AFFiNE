#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod commands;
mod state;
mod menu;
use dotenvy::dotenv;
use state::AppState;
use std::env;
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
  tauri::async_runtime::set(tokio::runtime::Handle::current());
  dotenv().ok();
  let preload = include_str!("../../public/preload/index.js");
  let is_dev = env::var("NODE_ENV").unwrap_or_default() == "development";
  // this only work in production mode, in dev mode, we load `devPath` in tauri.conf.json
  let initial_path = if is_dev {
    // just a place holder here
    "index.html"
  } else {
    "affine-out/index.html"
  };
  tauri::Builder::default()
    .manage(AppState(Mutex::new(
      state::AppStateRaw::new().await.unwrap(),
    )))
    // manually create window here, instead of in the tauri.conf.json, to add `initialization_script` here
    .setup(move |app| {
      let _window =
        tauri::WindowBuilder::new(app, "label", tauri::WindowUrl::App(initial_path.into()))
          .title("AFFiNE")
          .inner_size(1000.0, 800.0)
          .initialization_script(&preload);
      // fix `title_bar_style` found for struct `WindowBuilder` in the current scope
      #[cfg(target_os = "macos")]
      let _window = _window
        .hidden_title(true)
        .title_bar_style(TitleBarStyle::Overlay);
      let _window = _window.build()?;
      #[cfg(debug_assertions)]
      _window.open_devtools();
      Ok(())
    })
    .invoke_handler(commands::invoke_handler())
    .menu(menu::init())
    .on_menu_event(menu::menu_handler)
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
