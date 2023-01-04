#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod commands;
mod state;
use state::AppState;
use tokio::sync::Mutex;
use tauri::TitleBarStyle;

#[tokio::main]
async fn main() {
  tauri::async_runtime::set(tokio::runtime::Handle::current());
  let preload = include_str!("../../public/preload/index.js");
  tauri::Builder::default()
    .manage(AppState(Mutex::new(
      state::AppStateRaw::new().await.unwrap(),
    )))
    // manually create window here, instead of in the tauri.conf.json, to add `initialization_script` here
    .setup(move |app| {
      let _window =
        tauri::WindowBuilder::new(app, "label", tauri::WindowUrl::App("index.html".into()))
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
