//! API 26+ Android `AutofillManager` virtual view structure and value write-back
//! state machine, with deterministic API 24/25 degradation.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::atomic::{Ordering, compiler_fence};

use serde::Serialize;

use crate::should_expose_autofill;

/// Sensitive string buffer that zeroes its backing bytes on drop without unsafe code.
#[derive(Clone, PartialEq, Eq)]
struct ZeroizingString {
    bytes: Vec<u8>,
}

impl ZeroizingString {
    fn from_str(text: &str) -> Self {
        Self {
            bytes: text.as_bytes().to_vec(),
        }
    }

    fn as_str(&self) -> &str {
        std::str::from_utf8(&self.bytes).unwrap_or("")
    }
}

impl Drop for ZeroizingString {
    fn drop(&mut self) {
        for b in &mut self.bytes {
            *b = 0;
        }
        compiler_fence(Ordering::SeqCst);
    }
}

/// Semantic autofill field category exposed as virtual nodes on API 26+.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[repr(i32)]
pub enum AutofillFieldKind {
    Username = 0,
    Email = 1,
    Password = 2,
    OneTimeCode = 3,
}

impl AutofillFieldKind {
    /// Converts a raw JNI integer code into an [`AutofillFieldKind`].
    pub const fn from_code(code: i32) -> Option<Self> {
        match code {
            0 => Some(Self::Username),
            1 => Some(Self::Email),
            2 => Some(Self::Password),
            3 => Some(Self::OneTimeCode),
            _ => None,
        }
    }

    /// Returns the Android `View.AUTOFILL_HINT_*` constant string for this field.
    pub const fn android_hint(self) -> &'static str {
        match self {
            Self::Username => "username",
            Self::Email => "emailAddress",
            Self::Password => "password",
            Self::OneTimeCode => "smsOTPCode",
        }
    }
}

/// Screen pixel rectangle for an autofill virtual node.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct AutofillRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl AutofillRect {
    /// Normalizes bounds so `right >= left` and `bottom >= top`.
    pub const fn normalized(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        let (l, r) = if left <= right {
            (left, right)
        } else {
            (right, left)
        };
        let (t, b) = if top <= bottom {
            (top, bottom)
        } else {
            (bottom, top)
        };
        Self {
            left: l,
            top: t,
            right: r,
            bottom: b,
        }
    }
}

/// Virtual autofill node registered by the host UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AutofillFieldNode {
    pub autofill_id: i32,
    pub kind: AutofillFieldKind,
    pub hint: &'static str,
    pub bounds: AutofillRect,
    pub masked: bool,
    pub value_len: usize,
    pub focused: bool,
}

/// Notification emitted for the platform `AutofillManager` adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AutofillEvent {
    ViewEntered { autofill_id: i32 },
    ViewExited { autofill_id: i32 },
    ValueChanged { autofill_id: i32, value_len: usize },
    Commit,
    Cancel,
}

#[derive(Serialize)]
struct VirtualStructurePayload<'a> {
    enabled: bool,
    sdk_int: u32,
    focused_id: Option<i32>,
    commit_count: u64,
    fields: Vec<&'a AutofillFieldNode>,
}

/// Host-side autofill state gated strictly at `sdk_int >= 26`.
#[derive(Clone, PartialEq, Eq)]
pub struct AutofillState {
    sdk_int: u32,
    fields: BTreeMap<i32, AutofillFieldNode>,
    filled_values: BTreeMap<i32, ZeroizingString>,
    focused_id: Option<i32>,
    commit_count: u64,
}

impl fmt::Debug for AutofillState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AutofillState")
            .field("sdk_int", &self.sdk_int)
            .field("fields", &self.fields)
            .field("filled_value_count", &self.filled_values.len())
            .field("focused_id", &self.focused_id)
            .field("commit_count", &self.commit_count)
            .finish()
    }
}

impl Default for AutofillState {
    fn default() -> Self {
        Self::new(0)
    }
}

impl AutofillState {
    /// Creates an autofill state machine configured for `sdk_int`.
    pub fn new(sdk_int: u32) -> Self {
        Self {
            sdk_int,
            fields: BTreeMap::new(),
            filled_values: BTreeMap::new(),
            focused_id: None,
            commit_count: 0,
        }
    }

    /// Updates the device API level. Clears virtual state when below API 26.
    pub fn set_sdk_int(&mut self, sdk_int: u32) -> bool {
        self.sdk_int = sdk_int;
        if !self.is_enabled() {
            self.fields.clear();
            self.filled_values.clear();
            self.focused_id = None;
            return false;
        }
        true
    }

    /// Returns `true` when Android `AutofillManager` is supported (`sdk_int >= 26`).
    pub const fn is_enabled(&self) -> bool {
        should_expose_autofill(self.sdk_int)
    }

    /// Returns the currently focused virtual field ID, if any.
    pub const fn focused_id(&self) -> Option<i32> {
        self.focused_id
    }

    /// Returns the number of committed autofill sessions.
    pub const fn commit_count(&self) -> u64 {
        self.commit_count
    }

    /// Registers or updates a virtual login field. Returns `false` on API < 26.
    pub fn upsert_field(
        &mut self,
        autofill_id: i32,
        kind: AutofillFieldKind,
        bounds: AutofillRect,
        masked: bool,
        value_len: usize,
    ) -> bool {
        if !self.is_enabled() || autofill_id <= 0 {
            return false;
        }
        let focused = self.focused_id == Some(autofill_id);
        self.fields.insert(
            autofill_id,
            AutofillFieldNode {
                autofill_id,
                kind,
                hint: kind.android_hint(),
                bounds,
                masked,
                value_len,
                focused,
            },
        );
        true
    }

    /// Removes a virtual field and clears focus if it was focused.
    pub fn remove_field(&mut self, autofill_id: i32) -> bool {
        if !self.is_enabled() {
            return false;
        }
        if self.focused_id == Some(autofill_id) {
            self.focused_id = None;
        }
        self.filled_values.remove(&autofill_id);
        self.fields.remove(&autofill_id).is_some()
    }

    /// Moves autofill focus to `next_id`, returning `ViewExited`/`ViewEntered` events.
    pub fn focus_field(&mut self, next_id: Option<i32>) -> Vec<AutofillEvent> {
        if !self.is_enabled() {
            return Vec::new();
        }
        let valid_next = next_id.filter(|id| self.fields.contains_key(id));
        if self.focused_id == valid_next {
            return Vec::new();
        }
        let mut events = Vec::with_capacity(2);
        if let Some(prev_id) = self.focused_id.take() {
            if let Some(node) = self.fields.get_mut(&prev_id) {
                node.focused = false;
            }
            events.push(AutofillEvent::ViewExited {
                autofill_id: prev_id,
            });
        }
        if let Some(id) = valid_next {
            if let Some(node) = self.fields.get_mut(&id) {
                node.focused = true;
            }
            self.focused_id = Some(id);
            events.push(AutofillEvent::ViewEntered { autofill_id: id });
        }
        events
    }

    /// Synchronizes the field's real current text without exposing plaintext in
    /// `virtual_structure_json()`. Clearing to empty removes the cached value so
    /// `ViewStructure` never emits synthetic placeholders.
    pub fn set_field_text(&mut self, autofill_id: i32, text: &str) -> bool {
        if !self.is_enabled() {
            return false;
        }
        let Some(node) = self.fields.get_mut(&autofill_id) else {
            return false;
        };
        node.value_len = text.encode_utf16().count();
        if text.is_empty() {
            self.filled_values.remove(&autofill_id);
        } else {
            self.filled_values
                .insert(autofill_id, ZeroizingString::from_str(text));
        }
        true
    }

    /// Applies an autofill value delivered by Android `autofill(SparseArray<AutofillValue>)`.
    pub fn apply_autofill_value(&mut self, autofill_id: i32, value: &str) -> bool {
        self.set_field_text(autofill_id, value)
    }

    /// Reads the latest autofilled text for `autofill_id`, if present.
    pub fn filled_value(&self, autofill_id: i32) -> Option<&str> {
        if !self.is_enabled() {
            return None;
        }
        self.filled_values
            .get(&autofill_id)
            .map(ZeroizingString::as_str)
    }

    /// Reads the latest value for the first registered field matching `kind`.
    pub fn filled_value_by_kind(&self, kind: AutofillFieldKind) -> Option<&str> {
        if !self.is_enabled() {
            return None;
        }
        self.fields
            .values()
            .find(|node| node.kind == kind)
            .and_then(|node| self.filled_value(node.autofill_id))
    }

    /// Marks the active autofill context as committed, clears field focus, and
    /// wipes cached plaintext values.
    pub fn commit(&mut self) -> bool {
        if !self.is_enabled() {
            return false;
        }
        if let Some(prev_id) = self.focused_id.take()
            && let Some(node) = self.fields.get_mut(&prev_id)
        {
            node.focused = false;
        }
        self.filled_values.clear();
        self.commit_count = self.commit_count.saturating_add(1);
        true
    }

    /// Cancels the active autofill session, clears focus, and wipes cached plaintext values.
    pub fn cancel(&mut self) -> bool {
        if !self.is_enabled() {
            return false;
        }
        if let Some(prev_id) = self.focused_id.take()
            && let Some(node) = self.fields.get_mut(&prev_id)
        {
            node.focused = false;
        }
        self.filled_values.clear();
        true
    }

    /// Clears all registered virtual fields, focus, and cached plaintext values
    /// (called on page navigation or form unmount).
    pub fn clear_fields(&mut self) {
        self.fields.clear();
        self.filled_values.clear();
        self.focused_id = None;
    }

    /// Serializes the virtual view structure to JSON for Kotlin `ViewStructure` population.
    pub fn virtual_structure_json(&self) -> String {
        let payload = VirtualStructurePayload {
            enabled: self.is_enabled(),
            sdk_int: self.sdk_int,
            focused_id: if self.is_enabled() {
                self.focused_id
            } else {
                None
            },
            commit_count: self.commit_count,
            fields: if self.is_enabled() {
                self.fields.values().collect()
            } else {
                Vec::new()
            },
        };
        serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autofill_degrades_safely_below_api_26_and_roundtrips_at_api_26_plus() {
        for sdk in [24_u32, 25] {
            let mut state = AutofillState::new(sdk);
            assert!(!state.is_enabled());
            assert!(!state.upsert_field(
                1,
                AutofillFieldKind::Username,
                AutofillRect::normalized(10, 20, 300, 80),
                false,
                0,
            ));
            assert!(state.focus_field(Some(1)).is_empty());
            assert!(!state.apply_autofill_value(1, "alice@affine.pro"));
            assert_eq!(state.filled_value(1), None);
            assert!(!state.commit());
            assert!(state.virtual_structure_json().contains("\"enabled\":false"));
        }

        for sdk in [26_u32, 33, 35] {
            let mut state = AutofillState::new(sdk);
            assert!(state.is_enabled());
            assert!(state.upsert_field(
                101,
                AutofillFieldKind::Email,
                AutofillRect::normalized(20, 100, 900, 180),
                false,
                0,
            ));
            assert!(state.upsert_field(
                102,
                AutofillFieldKind::Password,
                AutofillRect::normalized(20, 200, 900, 280),
                true,
                0,
            ));
            assert!(state.upsert_field(
                103,
                AutofillFieldKind::OneTimeCode,
                AutofillRect::normalized(20, 300, 900, 380),
                false,
                0,
            ));

            assert_eq!(
                state.focus_field(Some(101)),
                vec![AutofillEvent::ViewEntered { autofill_id: 101 }]
            );
            assert_eq!(
                state.focus_field(Some(102)),
                vec![
                    AutofillEvent::ViewExited { autofill_id: 101 },
                    AutofillEvent::ViewEntered { autofill_id: 102 },
                ]
            );
            assert!(state.apply_autofill_value(101, "user@affine.pro"));
            assert!(state.apply_autofill_value(102, "s3cr3t!"));
            assert_eq!(state.filled_value(101), Some("user@affine.pro"));
            assert_eq!(state.filled_value(102), Some("s3cr3t!"));

            let debug_repr = format!("{state:?}");
            assert!(!debug_repr.contains("s3cr3t!"));
            assert!(!debug_repr.contains("user@affine.pro"));

            let json = state.virtual_structure_json();
            assert!(json.contains("\"enabled\":true"));
            assert!(json.contains("\"emailAddress\""));
            assert!(json.contains("\"password\""));
            assert!(json.contains("\"smsOTPCode\""));
            assert!(!json.contains("s3cr3t!"));

            assert!(state.commit());
            assert_eq!(state.commit_count(), 1);
            assert_eq!(state.focused_id(), None);
            assert_eq!(state.filled_value(101), None);
            assert_eq!(state.filled_value(102), None);

            assert!(state.set_field_text(102, "temp-pass"));
            assert_eq!(state.filled_value(102), Some("temp-pass"));
            assert!(state.cancel());
            assert_eq!(state.filled_value(102), None);
            state.clear_fields();
            assert!(state.virtual_structure_json().contains("\"fields\":[]"));
        }
    }
}
