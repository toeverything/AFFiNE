//! JSON output helpers. Every command returns a `serde_json::Value`; `main` prints it as
//! compact JSON by default or pretty-printed under `--pretty`.

use serde_json::Value;

pub fn print_value(value: &Value, pretty: bool) {
    let s = if pretty {
        serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
    } else {
        value.to_string()
    };
    println!("{s}");
}
