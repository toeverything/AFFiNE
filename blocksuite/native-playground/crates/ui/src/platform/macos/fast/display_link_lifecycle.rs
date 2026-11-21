use std::{cell::RefCell, rc::Rc};

use crate::platform::apple::display_link::MetalFrameSource;
use parking_lot::Mutex;

use crate::platform::macos::window::{FrameSource, MacWindowState};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OcclusionAction {
    PauseMetal,
    ResumeMetal,
    Start,
    Stop,
    None,
}

fn occlusion_action(is_metal: bool, is_attached: bool, is_visible: bool) -> OcclusionAction {
    match (is_metal, is_attached, is_visible) {
        (true, true, true) => OcclusionAction::ResumeMetal,
        (true, true, false) => OcclusionAction::PauseMetal,
        (true, false, true) | (false, _, true) => OcclusionAction::Start,
        (true, false, false) => OcclusionAction::None,
        (false, _, false) => OcclusionAction::Stop,
    }
}

/// visibility changes don't need a sync draw. keep the metal source paused
/// while hidden; sync redraws still stop it first.
pub(crate) fn visibility_changed(
    state: &mut MacWindowState,
    window_state: &Rc<Mutex<MacWindowState>>,
    is_visible: bool,
) {
    let action = match &state.frame_source {
        FrameSource::Metal(frames) => occlusion_action(true, frames.is_attached(), is_visible),
        FrameSource::DisplayLink(_) => occlusion_action(false, false, is_visible),
    };

    apply_action(state, window_state, action);
}

fn apply_action(
    state: &mut MacWindowState,
    window_state: &Rc<Mutex<MacWindowState>>,
    action: OcclusionAction,
) {
    match (action, &state.frame_source) {
        (OcclusionAction::PauseMetal, FrameSource::Metal(frames)) => frames.set_paused(true),
        (OcclusionAction::ResumeMetal, FrameSource::Metal(frames)) => frames.set_paused(false),
        (OcclusionAction::Start, _) => state.start_display_link(window_state),
        (OcclusionAction::Stop, _) => state.stop_display_link(),
        (OcclusionAction::None, _) => {}
        _ => unreachable!("display-link action must match its source"),
    }
}

pub(crate) fn set_metal_frames_paused(source: &RefCell<Option<MetalFrameSource>>, paused: bool) {
    if let Some(source) = source.borrow().as_ref() {
        source.set_paused(paused);
    }
}
