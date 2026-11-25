#![cfg(feature = "harness")]

use std::{cell::RefCell, rc::Rc};

use ui::{
    Application, Bounds, Context, HeadlessPlatform, IntoElement, MouseButton, MouseDownEvent,
    MouseUpEvent, PlatformInput, Render, TouchEvent, TouchId, TouchPhase, Window, WindowBounds,
    WindowHandle, WindowOptions, div, point, prelude::*, px, size,
};

struct TouchProbeView {
    downs: Rc<RefCell<Vec<usize>>>,
    ups: Rc<RefCell<Vec<usize>>>,
}

impl Render for TouchProbeView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let downs = self.downs.clone();
        let ups = self.ups.clone();
        div()
            .size_full()
            .on_mouse_down(MouseButton::Left, move |ev: &MouseDownEvent, _, _| {
                downs.borrow_mut().push(ev.click_count);
            })
            .on_mouse_up(MouseButton::Left, move |ev: &MouseUpEvent, _, _| {
                ups.borrow_mut().push(ev.click_count);
            })
    }
}

#[test]
fn touch_gestures_opt_in_off_wasm_and_double_tap_dispatches_two_clicks_not_three() {
    let platform = HeadlessPlatform::new(390, 844, 1.0);
    let downs = Rc::new(RefCell::new(Vec::new()));
    let ups = Rc::new(RefCell::new(Vec::new()));
    let handle_cell: Rc<RefCell<Option<WindowHandle<TouchProbeView>>>> =
        Rc::new(RefCell::new(None));
    let handle_out = handle_cell.clone();
    let d = downs.clone();
    let u = ups.clone();
    let app = Application::with_platform(platform.clone()).run_embedded(move |cx| {
        let window = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(390.0), px(844.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| cx.new(|_| TouchProbeView { downs: d, ups: u }),
            )
            .expect("open headless window");
        *handle_out.borrow_mut() = Some(window);
    });
    let window = handle_cell.borrow_mut().take().expect("window handle");
    let headless = platform.windows().into_iter().next().expect("headless win");
    headless.request_frame();

    let tap_pos = point(px(120.0), px(200.0));
    let send_tap = |id: u64| {
        headless.dispatch_input(PlatformInput::Touch(TouchEvent {
            id: TouchId(id),
            phase: TouchPhase::Started,
            position: tap_pos,
            predicted_position: None,
            force: None,
        }));
        headless.dispatch_input(PlatformInput::Touch(TouchEvent {
            id: TouchId(id),
            phase: TouchPhase::Ended,
            position: tap_pos,
            predicted_position: None,
            force: None,
        }));
    };

    // Non-wasm windows disable touch gesture bridging by default.
    send_tap(1);
    assert!(
        downs.borrow().is_empty() && ups.borrow().is_empty(),
        "non-wasm window must not bridge touch taps until opted in"
    );

    // After enabling touch gestures, two physical taps must emit click_count [1, 2] (not [1, 2, 2]).
    app.update(|cx| {
        window
            .update(cx, |_, window, _| {
                window.set_touch_gestures_enabled(true);
            })
            .expect("enable touch gestures");
    });

    send_tap(2);
    send_tap(3);

    assert_eq!(*downs.borrow(), vec![1, 2]);
    assert_eq!(*ups.borrow(), vec![1, 2]);
}
