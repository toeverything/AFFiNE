use std::{cell::RefCell, rc::Rc};

use wasm_bindgen::{JsCast, closure::Closure};
use web_sys::{BinaryType, CloseEvent, MessageEvent, WebSocket};

use super::{RoomCommand, RoomConfig, RoomEvent, RoomFrame, RoomLink};

const RECONNECT_MIN_MS: i32 = 250;
const RECONNECT_MAX_MS: i32 = 5_000;

struct WebTransport {
    config: RoomConfig,
    events: async_channel::Sender<RoomEvent>,
    socket: RefCell<Option<WebSocket>>,
    backoff_ms: RefCell<i32>,
    closed: RefCell<bool>,
}

/// Connect to the room with a browser `WebSocket` carrying binary `ArrayBuffer`
/// frames. The transport reconnects with backoff until the link is dropped.
pub fn connect(config: RoomConfig) -> RoomLink {
    let (events_tx, events_rx) = async_channel::unbounded();
    let transport = Rc::new(WebTransport {
        config,
        events: events_tx,
        socket: RefCell::new(None),
        backoff_ms: RefCell::new(RECONNECT_MIN_MS),
        closed: RefCell::new(false),
    });
    open(&transport);
    RoomLink::from_parts(events_rx, move |command| match command {
        RoomCommand::Send(frame) => {
            if let Some(socket) = transport.socket.borrow().as_ref()
                && socket.ready_state() == WebSocket::OPEN
            {
                let _ = match &frame {
                    RoomFrame::Binary(bytes) => socket.send_with_u8_array(bytes),
                    RoomFrame::Text(text) => socket.send_with_str(text),
                };
            }
        }
        RoomCommand::FetchBlob(source_id) => fetch_blob(&transport, source_id),
        RoomCommand::Close => {
            *transport.closed.borrow_mut() = true;
            let socket = transport.socket.borrow_mut().take();
            if let Some(socket) = socket {
                let _ = socket.close();
            }
        }
    })
}

fn open(transport: &Rc<WebTransport>) {
    if *transport.closed.borrow() {
        return;
    }
    let socket = match WebSocket::new(&transport.config.ws_url) {
        Ok(socket) => socket,
        Err(err) => {
            let _ = transport
                .events
                .try_send(RoomEvent::Closed(format!("cannot open WebSocket: {err:?}")));
            schedule_reconnect(transport);
            return;
        }
    };
    socket.set_binary_type(BinaryType::Arraybuffer);

    let on_open = {
        let transport = transport.clone();
        Closure::<dyn FnMut()>::new(move || {
            *transport.backoff_ms.borrow_mut() = RECONNECT_MIN_MS;
            let _ = transport.events.try_send(RoomEvent::Opened);
        })
    };
    socket.set_onopen(Some(on_open.as_ref().unchecked_ref()));
    on_open.forget();

    let on_message = {
        let transport = transport.clone();
        Closure::<dyn FnMut(MessageEvent)>::new(move |event: MessageEvent| {
            let data = event.data();
            let frame = if let Some(text) = data.as_string() {
                RoomFrame::Text(text)
            } else if data.is_instance_of::<js_sys::ArrayBuffer>() {
                RoomFrame::Binary(js_sys::Uint8Array::new(&data).to_vec())
            } else {
                return;
            };
            let _ = transport.events.try_send(RoomEvent::Frame(frame));
        })
    };
    socket.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
    on_message.forget();

    let on_close = {
        let transport = transport.clone();
        Closure::<dyn FnMut(CloseEvent)>::new(move |event: CloseEvent| {
            transport.socket.borrow_mut().take();
            if *transport.closed.borrow() {
                return;
            }
            let reason = match event.reason() {
                reason if reason.is_empty() => format!("connection closed ({})", event.code()),
                reason => reason,
            };
            let _ = transport.events.try_send(RoomEvent::Closed(reason));
            schedule_reconnect(&transport);
        })
    };
    socket.set_onclose(Some(on_close.as_ref().unchecked_ref()));
    on_close.forget();

    *transport.socket.borrow_mut() = Some(socket);
}

fn schedule_reconnect(transport: &Rc<WebTransport>) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let delay = *transport.backoff_ms.borrow();
    *transport.backoff_ms.borrow_mut() = (delay * 2).min(RECONNECT_MAX_MS);
    let transport = transport.clone();
    let retry = Closure::once_into_js(move || open(&transport));
    let _ =
        window.set_timeout_with_callback_and_timeout_and_arguments_0(retry.unchecked_ref(), delay);
}

fn fetch_blob(transport: &Rc<WebTransport>, source_id: String) {
    let url = transport.config.blob_url(&source_id);
    let events = transport.events.clone();
    wasm_bindgen_futures::spawn_local(async move {
        let bytes = fetch_bytes(&url).await;
        let _ = events.try_send(RoomEvent::Blob { source_id, bytes });
    });
}

async fn fetch_bytes(url: &str) -> Option<Vec<u8>> {
    let window = web_sys::window()?;
    let response = wasm_bindgen_futures::JsFuture::from(window.fetch_with_str(url))
        .await
        .ok()?
        .dyn_into::<web_sys::Response>()
        .ok()?;
    if !response.ok() {
        return None;
    }
    let buffer = wasm_bindgen_futures::JsFuture::from(response.array_buffer().ok()?)
        .await
        .ok()?;
    Some(js_sys::Uint8Array::new(&buffer).to_vec())
}
