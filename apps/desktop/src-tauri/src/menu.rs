use tauri::{CustomMenuItem, Manager, Menu, MenuItem, Submenu, WindowMenuEvent};

#[cfg(target_os = "macos")]
use tauri::AboutMetadata;

// --- Menu
pub fn init() -> Menu {
  let name = "AFFiNE";
  let app_menu = Submenu::new(
    name,
    Menu::with_items([
      #[cfg(target_os = "macos")]
      MenuItem::About(name.into(), AboutMetadata::default()).into(),
      MenuItem::Services.into(),
      MenuItem::Hide.into(),
      MenuItem::HideOthers.into(),
      MenuItem::ShowAll.into(),
      MenuItem::Separator.into(),
      MenuItem::Quit.into(),
    ]),
  );

  let edit_menu = Submenu::new(
    "Edit",
    Menu::new()
      .add_native_item(MenuItem::Undo)
      .add_native_item(MenuItem::Redo)
      .add_native_item(MenuItem::Separator)
      .add_native_item(MenuItem::Cut)
      .add_native_item(MenuItem::Copy)
      .add_native_item(MenuItem::Paste)
      .add_native_item(MenuItem::SelectAll),
  );

  let view_menu = Submenu::new(
    "View",
    Menu::new()
      .add_item(CustomMenuItem::new("go_back".to_string(), "Go Back").accelerator("CmdOrCtrl+["))
      .add_item(
        CustomMenuItem::new("go_forward".to_string(), "Go Forward").accelerator("CmdOrCtrl+]"),
      )
      .add_native_item(MenuItem::Separator)
      .add_item(
        CustomMenuItem::new("zoom_0".to_string(), "Zoom to Actual Size").accelerator("CmdOrCtrl+0"),
      )
      .add_item(CustomMenuItem::new("zoom_out".to_string(), "Zoom Out").accelerator("CmdOrCtrl+-"))
      .add_item(CustomMenuItem::new("zoom_in".to_string(), "Zoom In").accelerator("CmdOrCtrl+Plus"))
      .add_native_item(MenuItem::Separator)
      .add_item(
        CustomMenuItem::new("reload".to_string(), "Refresh the Screen").accelerator("CmdOrCtrl+R"),
      ),
  );

  let window_menu = Submenu::new(
    "Window",
    Menu::new()
      .add_item(CustomMenuItem::new(
        "official_website".to_string(),
        "About AFFiNE",
      ))
      .add_native_item(MenuItem::Separator)
      .add_native_item(MenuItem::Minimize)
      .add_native_item(MenuItem::Zoom),
  );

  let help_menu = Submenu::new(
    "Help",
    Menu::new()
      .add_item(CustomMenuItem::new("update_log".to_string(), "Update Log"))
      .add_item(CustomMenuItem::new("report_bug".to_string(), "Report Bug"))
      .add_item(
        CustomMenuItem::new("dev_tools".to_string(), "Toggle Developer Tools")
          .accelerator("CmdOrCtrl+Shift+I"),
      ),
  );

  Menu::new()
    .add_submenu(app_menu)
    .add_submenu(window_menu)
    .add_submenu(edit_menu)
    .add_submenu(view_menu)
    .add_submenu(help_menu)
}

// --- Menu Event
pub fn menu_handler(event: WindowMenuEvent<tauri::Wry>) {
  let win = Some(event.window()).unwrap();
  let app = win.app_handle();
  let menu_id = event.menu_item_id();

  match menu_id {
    // App
    "restart" => tauri::api::process::restart(&app.env()),
    // Window
    // View
    "zoom_0" => win.eval("window.__zoom0 && window.__zoom0()").unwrap(),
    "zoom_out" => win.eval("window.__zoomOut && window.__zoomOut()").unwrap(),
    "zoom_in" => win.eval("window.__zoomIn && window.__zoomIn()").unwrap(),
    "reload" => win.eval("window.location.reload()").unwrap(),
    "go_back" => win.eval("window.history.go(-1)").unwrap(),
    "go_forward" => win.eval("window.history.go(1)").unwrap(),
    "dev_tools" => {
      win.open_devtools();
      win.close_devtools();
    }
    _ => {}
  }
}
