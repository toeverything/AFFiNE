use std::sync::Arc;

use blocksuite_playground_doc::awareness::{AwarenessPayload, TextRangePoint, TextSelectionState};
use ui::prelude::*;

use crate::{
    block_flow::{ImageSlot, RemotePoint, RemotePresence, RemoteSelection, decode_image},
    room_client::{
        RoomCommand, RoomConfig, RoomEffects, RoomEvent, RoomLink, RoomProtocol, RoomStatus,
    },
    theme::Palette,
};

use super::*;

/// Images whose blob is still missing after this many fetches show as unavailable.
const BLOB_MISSES_SHOWN_UNAVAILABLE: u32 = 3;
/// Longest wait between two fetches of a blob the relay does not have yet.
const BLOB_RETRY_MAX_MS: u64 = 4_000;

/// Wait before fetching a blob again after `misses` consecutive misses: 500 ms, doubling
/// up to [`BLOB_RETRY_MAX_MS`].
pub(crate) fn blob_retry_backoff_ms(misses: u32) -> u64 {
    (250_u64 << misses.clamp(1, 5)).min(BLOB_RETRY_MAX_MS)
}

/// Fetch of a room blob the page references but the document state does not hold yet.
/// It is retried for as long as the page references the blob: an uploader writes the
/// `sourceId` into the document before its upload finishes, and the relay announces no
/// completed upload.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct BlobFetchState {
    pub(crate) in_flight: bool,
    /// Consecutive fetches that found no blob.
    pub(crate) misses: u32,
    /// Scheduler time of the next fetch, once none is in flight.
    pub(crate) next_retry_ms: u64,
}

pub(crate) struct RoomRuntime {
    pub(crate) config: RoomConfig,
    pub(crate) protocol: RoomProtocol,
    pub(crate) link: RoomLink,
    pub(crate) error: Option<String>,
}

impl PlaygroundView {
    /// Connection state of the live room, `None` for the showcase document.
    pub fn room_status(&self) -> Option<RoomStatus> {
        self.room.as_ref().map(|room| room.protocol.status())
    }

    /// Handle every room event already delivered by the transport; returns how many.
    ///
    /// The view also handles events as they arrive on its own; hosts that step the
    /// application manually call this to apply what is queued right now.
    pub fn pump_room(&mut self, cx: &mut Context<Self>) -> usize {
        let Some(events) = self.room.as_ref().map(|room| room.link.events().clone()) else {
            return 0;
        };
        let mut handled = 0;
        while let Ok(event) = events.try_recv() {
            self.handle_room_event(event, cx);
            handled += 1;
        }
        handled
    }

    pub(crate) fn now_ms(&self, cx: &Context<Self>) -> f64 {
        cx.background_executor()
            .now()
            .saturating_duration_since(self.origin_time)
            .as_secs_f64()
            * 1000.0
    }

    pub(crate) fn handle_room_event(&mut self, event: RoomEvent, cx: &mut Context<Self>) {
        let now_ms = self.now_ms(cx) as u64;
        let Some(room) = self.room.as_mut() else {
            return;
        };
        let mut blob_arrived = false;
        let effects = match event {
            RoomEvent::Opened => {
                let effects = room.protocol.on_open(&mut self.state, now_ms);
                // A fresh connection fetches every missing blob again right away.
                for (source_id, fetch) in &mut self.blob_fetches {
                    fetch.misses = 0;
                    fetch.next_retry_ms = now_ms;
                    if !fetch.in_flight {
                        fetch.in_flight = true;
                        room.link.send(RoomCommand::FetchBlob(source_id.clone()));
                    }
                    if matches!(self.images.get(source_id), Some(ImageSlot::Unavailable)) {
                        self.images.insert(source_id.clone(), ImageSlot::Loading);
                        self.env_rev += 1;
                    }
                }
                effects
            }
            RoomEvent::Frame(frame) => room.protocol.on_frame(&mut self.state, &frame, now_ms),
            RoomEvent::Closed(reason) => Ok(room.protocol.on_close(reason)),
            RoomEvent::Blob {
                source_id,
                bytes: Some(bytes),
            } => {
                // Present bytes are decoded once; bytes that are no image stay unavailable
                // and are never fetched again.
                self.blob_fetches.remove(&source_id);
                let slot = decode_image(&bytes).map_or(ImageSlot::Unavailable, ImageSlot::Ready);
                self.state.blobs.insert(source_id.clone(), Arc::new(bytes));
                self.images.insert(source_id, slot);
                self.env_rev += 1;
                blob_arrived = true;
                Ok(RoomEffects::default())
            }
            RoomEvent::Blob {
                source_id,
                bytes: None,
            } => {
                if let Some(fetch) = self.blob_fetches.get_mut(&source_id) {
                    fetch.in_flight = false;
                    fetch.misses = fetch.misses.saturating_add(1);
                    fetch.next_retry_ms =
                        now_ms.saturating_add(blob_retry_backoff_ms(fetch.misses));
                    // The frame says so after a few misses; the fetch keeps retrying.
                    if fetch.misses >= BLOB_MISSES_SHOWN_UNAVAILABLE
                        && !matches!(self.images.get(&source_id), Some(ImageSlot::Unavailable))
                    {
                        self.images.insert(source_id, ImageSlot::Unavailable);
                        self.env_rev += 1;
                    }
                }
                Ok(RoomEffects::default())
            }
        };
        match effects {
            Ok(effects) => {
                room.error = None;
                for frame in effects.outbound {
                    room.link.send(RoomCommand::Send(frame));
                }
                if effects.doc_changed {
                    self.capture_reading_anchor();
                    self.refresh_document();
                    self.resolve_remote_selection(cx);
                }
            }
            Err(err) => room.error = Some(err.to_string()),
        }
        if blob_arrived {
            let pdf_attachments = self.active_pdf_attachments();
            self.refresh_pdf_previews(&pdf_attachments);
        }
        cx.notify();
    }

    pub(crate) fn tick_room(&mut self, cx: &mut Context<Self>) {
        let now_ms = self.now_ms(cx) as u64;
        let Some(room) = self.room.as_mut() else {
            return;
        };
        if let Ok(effects) = room.protocol.tick(&mut self.state, now_ms) {
            for frame in effects.outbound {
                room.link.send(RoomCommand::Send(frame));
            }
            if effects.awareness_changed {
                cx.notify();
            }
        }
        // Fetch missing blobs again once their backoff ran out, unless the room is offline.
        if !matches!(room.protocol.status(), RoomStatus::Offline(_)) {
            for (source_id, fetch) in &mut self.blob_fetches {
                if !fetch.in_flight && now_ms >= fetch.next_retry_ms {
                    fetch.in_flight = true;
                    room.link.send(RoomCommand::FetchBlob(source_id.clone()));
                }
            }
        }
    }

    /// Remote collaborators of the shown page, ordered by client id.
    pub(crate) fn remote_presences(&self, palette: &Palette) -> Vec<RemotePresence> {
        const FALLBACK_COLORS: [&str; 8] = [
            "--affine-multi-players-purple",
            "--affine-multi-players-magenta",
            "--affine-multi-players-red",
            "--affine-multi-players-orange",
            "--affine-multi-players-green",
            "--affine-multi-players-blue",
            "--affine-multi-players-brown",
            "--affine-multi-players-grey",
        ];
        let awareness = &self.state.awareness;
        awareness
            .active_remote_clients()
            .into_iter()
            .filter_map(|client_id| {
                let payload = awareness.get_payload(client_id)?;
                let color = self.theme.css_color(&payload.color).unwrap_or_else(|| {
                    let fallback = FALLBACK_COLORS[(client_id % 8) as usize];
                    self.theme.css_var(fallback).unwrap_or(palette.brand)
                });
                Some(RemotePresence {
                    client_id,
                    name: payload.user.name.clone(),
                    color,
                    selection: self.text_selection(&payload),
                })
            })
            .collect()
    }

    /// The collaborator's text selection in the shown page, if it has one.
    fn text_selection(&self, payload: &AwarenessPayload) -> Option<RemoteSelection> {
        let page_id = self.page_id.as_deref()?;
        // BlockSuite keys `selectionV2` by `${store.id}:${nanoid()}`, and a bare page id is
        // accepted too. JS matches entries with `startsWith(store.id)`; splitting at the
        // last colon is deliberately stricter, so `doc:home` never picks up the selections
        // of `doc:home2` or `doc:home:archive`, and a selection in another page is never
        // shown in this one.
        let selection = payload
            .selection_v2
            .iter()
            .filter(|(key, _)| {
                key.as_str() == page_id
                    || key
                        .rsplit_once(':')
                        .is_some_and(|(store, id)| store == page_id && !id.is_empty())
            })
            .flat_map(|(_, selections)| selections)
            .filter_map(|value| serde_json::from_value::<TextSelectionState>(value.clone()).ok())
            .find(|selection| selection.kind == "text")?;
        let remote_point = |point: TextRangePoint| RemotePoint {
            block_id: point.block_id,
            index: usize::try_from(point.index).unwrap_or(usize::MAX),
            length: usize::try_from(point.length).unwrap_or(0),
        };
        Some(RemoteSelection {
            from: remote_point(selection.from),
            to: selection.to.map(remote_point),
            reverse: selection.reverse.unwrap_or(false),
        })
    }
}

#[cfg(target_family = "wasm")]
fn web_options() -> PlaygroundOptions {
    let mut options = PlaygroundOptions::default();
    let Some(window) = web_sys::window() else {
        return options;
    };
    let location = window.location();
    let Some(params) = location
        .search()
        .ok()
        .and_then(|search| web_sys::UrlSearchParams::new_with_str(&search).ok())
    else {
        return options;
    };
    if let Some(theme) = params.get("theme").and_then(|v| PlaygroundTheme::parse(&v)) {
        options.theme = theme;
    }
    if let Some(mode) = params.get("mode").and_then(|v| PlaygroundMode::parse(&v)) {
        options.mode = mode;
    }
    if let Some(room) = params.get("room").filter(|room| !room.is_empty()) {
        // `?ws=` names the relay; without it the page's own origin serves the room.
        let relay = params.get("ws").filter(|ws| !ws.is_empty()).or_else(|| {
            let protocol = location.protocol().ok()?;
            let host = location.host().ok()?;
            let scheme = if protocol == "https:" { "wss" } else { "ws" };
            Some(format!("{scheme}://{host}"))
        });
        options.room = Some(RoomConfig::new(&room, relay.as_deref()));
    }
    options
}

#[cfg(target_family = "wasm")]
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn wasm_main() {
    console_error_panic_hook::set_once();
    let platform = std::rc::Rc::new(ui::WebPlatform::new(false));
    ui::Application::with_platform(platform).run(|cx| {
        if let Err(err) = register_bundled_fonts(cx) {
            panic!("failed to register bundled fonts on web: {err:#}");
        }
        let options = web_options();
        if let Err(err) = cx.open_window(ui::WindowOptions::default(), |_, cx| {
            cx.new(|cx| PlaygroundView::with_options(options, cx))
        }) {
            panic!("failed to open playground web window: {err:#}");
        }
    });
}
