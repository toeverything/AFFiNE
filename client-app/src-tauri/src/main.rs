#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod commands;
mod state;
use dotenvy::dotenv;
use state::AppState;
use std::env;
use tauri::TitleBarStyle;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
  tauri::async_runtime::set(tokio::runtime::Handle::current());
  dotenv().ok();
  let preload = include_str!("../../public/preload/index.js");
  let is_dev = env::var("NODE_ENV").unwrap_or_default() == "development";
  let initial_path = if is_dev {
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
          .title_bar_style(TitleBarStyle::Overlay)
          .hidden_title(true)
          .initialization_script(&preload)
          .build()?;
      Ok(())
    })
    .invoke_handler(commands::invoke_handler())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
