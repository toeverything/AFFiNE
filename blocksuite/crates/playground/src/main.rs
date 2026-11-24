#[cfg(target_os = "macos")]
fn main() {
    use ui::prelude::*;

    let options = match playground::PlaygroundOptions::from_args(std::env::args().skip(1)) {
        Ok(options) => options,
        Err(err) => {
            eprintln!(
                "{err:#}\nusage: native-playground [--theme light|dark] [--mode page|edgeless] \
                 [--room <room> [--relay <ws_url>]]"
            );
            std::process::exit(2);
        }
    };

    let platform = std::rc::Rc::new(ui::MacPlatform::new(false));
    ui::Application::with_platform(platform).run(move |cx| {
        if let Err(err) = playground::register_bundled_fonts(cx) {
            eprintln!("failed to register bundled fonts: {err:#}");
        }
        let _ = cx.open_window(ui::WindowOptions::default(), |_, cx| {
            cx.new(|cx| playground::PlaygroundView::with_options(options, cx))
        });
    });
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!(
        "native-playground interactive desktop windowing is supported on macOS and Web (wasm32). \
         On Linux, run headless rendering via `cargo run --bin bs-harness --features harness -- render`."
    );
}
