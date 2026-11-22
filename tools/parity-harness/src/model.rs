use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub base_url: String,
    #[serde(default)]
    pub postgres: Option<String>,
    #[serde(default)]
    pub redis: Option<String>,
    #[serde(default)]
    pub smtp_bind: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Scenario {
    pub left_target: Target,
    pub right_target: Target,
    pub steps: Vec<Step>,
    #[serde(default)]
    pub dynamic: Vec<DynamicRule>,
    #[serde(default = "timeout")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub table_keys: BTreeMap<String, Vec<String>>,
    #[serde(default = "default_ignore_tables")]
    pub ignore_tables: Vec<String>,
    #[serde(default)]
    pub expected_smtp_count: Option<usize>,
    #[serde(default = "headers")]
    pub compare_headers: Vec<String>,
    /// Checks each side must pass on its own, so that two sides failing the
    /// same way (both rejecting a write, both missing an effect) are not equal.
    #[serde(default)]
    pub require: Vec<Requirement>,
}

/// A JSON pointer into one side's recorded observations (`/protocol/<i>/...`,
/// `/database/<schema.table>`, `/effects/smtp`, `/effects/redis`) and what must
/// hold there.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Requirement {
    pub path: String,
    #[serde(flatten)]
    pub check: Check,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Check {
    /// The value equals this one exactly.
    Equals(Value),
    /// The array has exactly this many elements.
    Length(usize),
    /// Some array element contains every field of this object (recursively).
    Contains(Value),
}
fn timeout() -> u64 {
    5000
}
fn headers() -> Vec<String> {
    [
        "content-type",
        "cache-control",
        "location",
        "set-cookie",
        "access-control-allow-origin",
        "access-control-allow-credentials",
        "www-authenticate",
    ]
    .map(String::from)
    .to_vec()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DynamicRule {
    /// Regex over the complete JSON pointer in the final observations.
    pub path: String,
    /// A stable semantic domain, e.g. id, ts or token.
    pub kind: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Step {
    pub name: String,
    #[serde(flatten)]
    pub request: Request,
    /// Variable name -> JSON pointer in this step's observation (e.g. /body/id).
    #[serde(default)]
    pub extract: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    Http {
        method: String,
        path: String,
        #[serde(default)]
        headers: BTreeMap<String, String>,
        #[serde(default)]
        body: Option<Value>,
        #[serde(default)]
        raw_base64: Option<String>,
        #[serde(default)]
        multipart: Vec<Part>,
    },
    Graphql {
        query: String,
        #[serde(default)]
        variables: Value,
        #[serde(default = "graphql_path")]
        path: String,
        #[serde(default)]
        headers: BTreeMap<String, String>,
    },
    Sse {
        path: String,
        #[serde(default)]
        headers: BTreeMap<String, String>,
        event_count: usize,
    },
    Socketio {
        #[serde(default = "socketio_path")]
        path: String,
        #[serde(default)]
        namespace: String,
        #[serde(default)]
        headers: BTreeMap<String, String>,
        #[serde(default = "socketio_transports")]
        transports: Vec<String>,
        #[serde(default)]
        auth: Value,
        actions: Vec<Value>,
        /// Server-pushed events to report, by name; all when absent. Pushes
        /// whose arrival races the end of the step (cluster echoes of
        /// background work) are left out here; `wait_event` still sees them.
        #[serde(default)]
        record_events: Option<Vec<String>>,
    },
    Websocket {
        path: String,
        #[serde(default)]
        headers: BTreeMap<String, String>,
        frames: Vec<Frame>,
    },
}
fn graphql_path() -> String {
    "/graphql".into()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Part {
    pub name: String,
    pub filename: Option<String>,
    pub mime: Option<String>,
    pub base64: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum Frame {
    SendText { text: String },
    SendJson { value: Value },
    SendBinary { base64: String },
    Receive { count: usize },
}

#[derive(Clone, Debug, Serialize)]
pub struct Difference {
    pub path: String,
    pub reason: String,
    pub left: Value,
    pub right: Value,
}
#[derive(Debug, Serialize)]
pub struct Report {
    pub symbols: Value,
    pub differences: Vec<Difference>,
    pub left: Value,
    pub right: Value,
}
impl Report {
    pub fn is_equal(&self) -> bool {
        self.differences.is_empty()
    }
}

pub fn default_ignore_tables() -> Vec<String> {
    ["_prisma_migrations", "native_schema_migrations"]
        .map(String::from)
        .to_vec()
}

fn socketio_path() -> String {
    "/socket.io/".into()
}
fn socketio_transports() -> Vec<String> {
    ["polling", "websocket"].map(String::from).to_vec()
}
