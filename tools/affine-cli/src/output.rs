//! JSON output helpers. Every command returns a `serde_json::Value`; `main` prints it as
//! compact JSON by default or pretty-printed under `--pretty`.
//!
//! Commands can also record non-fatal warnings (`warn`); `main` attaches them to the printed
//! object as a `"warnings": [..]` array so callers parsing stdout see them in-band.

use std::sync::Mutex;

use serde_json::Value;

static WARNINGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Record a non-fatal warning for the current invocation.
pub fn warn(msg: impl Into<String>) {
    WARNINGS.lock().unwrap_or_else(|e| e.into_inner()).push(msg.into());
}

/// Drain the warnings recorded so far.
pub fn take_warnings() -> Vec<String> {
    std::mem::take(&mut *WARNINGS.lock().unwrap_or_else(|e| e.into_inner()))
}

/// Attach pending warnings to `value` (objects only; list outputs never carry warnings today).
pub fn attach_warnings(value: &mut Value) {
    let warnings = take_warnings();
    if warnings.is_empty() {
        return;
    }
    if let Value::Object(map) = value {
        map.insert("warnings".to_string(), Value::from(warnings));
    }
}

pub fn print_value(value: &Value, pretty: bool) {
    let s = if pretty {
        serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
    } else {
        value.to_string()
    };
    println!("{s}");
}
