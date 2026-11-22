use crate::model::{Difference, DynamicRule};
use anyhow::{Result, ensure};
use regex::Regex;
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

/// A single bijection survives every protocol, database and side-effect comparison.
/// Neither side may map one value to two values, including identical fields at
/// different JSON pointers. Dynamic rules are explicit; ordinary data stays exact.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub enum TextPart {
    Literal(String),
    Symbol(String),
}
pub struct Normalizer {
    rules: Vec<(Regex, String)>,
    left: BTreeMap<String, (String, String)>,
    right: BTreeMap<String, (String, String)>,
    next: BTreeMap<String, usize>,
    pub differences: Vec<Difference>,
}
impl Normalizer {
    pub fn new(rules: &[DynamicRule]) -> Result<Self> {
        Ok(Self {
            rules: rules
                .iter()
                .map(|r| {
                    ensure!(
                        ["id", "ts", "token"].contains(&r.kind.as_str()),
                        "unknown dynamic kind {}",
                        r.kind
                    );
                    Ok((Regex::new(&r.path)?, r.kind.clone()))
                })
                .collect::<Result<_>>()?,
            left: BTreeMap::new(),
            right: BTreeMap::new(),
            next: BTreeMap::new(),
            differences: Vec::new(),
        })
    }
    fn difference(&mut self, path: &str, reason: &str, left: &Value, right: &Value) {
        self.differences.push(Difference {
            path: path.into(),
            reason: reason.into(),
            left: left.clone(),
            right: right.clone(),
        });
    }
    fn bind(&mut self, path: &str, kind: &str, left: &Value, right: &Value) {
        if left.is_null() && right.is_null() {
            return;
        }
        if !matches!(
            (left, right),
            (Value::String(_), Value::String(_)) | (Value::Number(_), Value::Number(_))
        ) {
            self.difference(path, "dynamic scalar type mismatch", left, right);
            return;
        }
        let l = format!("{kind}:{left}");
        let r = format!("{kind}:{right}");
        if let Some((expected, _)) = self.left.get(&l) {
            if expected != &r {
                self.difference(
                    path,
                    "bijection: left value was already paired with another right value",
                    left,
                    right,
                );
            }
            return;
        }
        if let Some((expected, _)) = self.right.get(&r) {
            if expected != &l {
                self.difference(
                    path,
                    "bijection: right value was already paired with another left value",
                    left,
                    right,
                );
            }
            return;
        }
        let n = self.next.entry(kind.into()).or_default();
        *n += 1;
        let symbol = format!("<{kind}_{n}>");
        self.left.insert(l.clone(), (r.clone(), symbol.clone()));
        self.right.insert(r, (l, symbol));
    }
    pub fn compare(&mut self, path: &str, left: &Value, right: &Value) {
        match (left, right) {
            (Value::Object(l), Value::Object(r)) => {
                for key in l.keys().chain(r.keys()).collect::<BTreeSet<_>>() {
                    let p = format!("{path}/{}", key.replace('~', "~0").replace('/', "~1"));
                    match (l.get(key), r.get(key)) {
                        (Some(a), Some(b)) => self.compare(&p, a, b),
                        _ => self.difference(
                            &p,
                            "missing field",
                            l.get(key).unwrap_or(&Value::Null),
                            r.get(key).unwrap_or(&Value::Null),
                        ),
                    }
                }
            }
            (Value::Array(l), Value::Array(r)) => {
                if l.len() != r.len() {
                    self.difference(path, "array length", &json!(l.len()), &json!(r.len()));
                }
                for (i, (a, b)) in l.iter().zip(r).enumerate() {
                    self.compare(&format!("{path}/{i}"), a, b);
                }
            }
            _ => {
                let kind = self
                    .rules
                    .iter()
                    .find(|(re, _)| re.is_match(path))
                    .map(|(_, k)| k.clone());
                if let Some(kind) = kind {
                    if kind == "ts" {
                        self.timestamp(path, left, right);
                        return;
                    }
                    self.bind(path, &kind, left, right);
                    return;
                }
                // Implicit reuse is limited to ID/token strings. A timestamp
                // numerically equal to a quota must never normalize that quota.
                if left.is_string() && right.is_string() {
                    for kind in ["id", "token"] {
                        if self.left.contains_key(&format!("{kind}:{left}"))
                            || self.right.contains_key(&format!("{kind}:{right}"))
                        {
                            self.bind(path, kind, left, right);
                            return;
                        }
                    }
                }
                match (left, right) {
                    (Value::String(l), Value::String(r)) => {
                        if self.text(l, true) != self.text(r, false) {
                            self.difference(path, "value", left, right);
                        }
                    }
                    _ if left != right => self.difference(path, "value or type", left, right),
                    _ => {}
                }
            }
        }
    }
    /// Independent processes may legitimately collide on one timestamp and not another.
    fn timestamp(&mut self, path: &str, left: &Value, right: &Value) {
        if left.is_null() && right.is_null() {
            return;
        }
        let valid = match (left, right) {
            (Value::Number(l), Value::Number(r)) => {
                l.is_f64() == r.is_f64()
                    && [l, r]
                        .iter()
                        .all(|v| v.as_f64().is_some_and(|n| n.is_finite() && n >= 0.0))
            }
            (Value::String(l), Value::String(r)) => [l, r]
                .iter()
                .all(|s| chrono::DateTime::parse_from_rfc3339(s).is_ok()),
            _ => false,
        };
        if !valid {
            self.difference(path, "timestamp type, nullability or format", left, right);
        }
    }
    /// Keep literals and learned symbols distinct, including in URLs and SMTP HTML.
    pub fn text(&self, value: &str, left: bool) -> Vec<TextPart> {
        let entries = if left { &self.left } else { &self.right };
        let mut replacements: Vec<_> = entries
            .iter()
            .filter_map(|(key, (_, symbol))| {
                let (_, raw) = key.split_once(':')?;
                serde_json::from_str::<Value>(raw)
                    .ok()
                    .and_then(|v| v.as_str().map(|s| (s.to_owned(), symbol.clone())))
            })
            .filter(|(s, _)| s.len() >= 8)
            .collect();
        replacements.sort_by(|a, b| b.0.len().cmp(&a.0.len()).then(a.0.cmp(&b.0)));
        let mut result = Vec::new();
        let mut literal = String::new();
        let mut rest = value;
        while !rest.is_empty() {
            if let Some((raw, symbol)) = replacements.iter().find(|(raw, _)| rest.starts_with(raw))
            {
                if !literal.is_empty() {
                    result.push(TextPart::Literal(std::mem::take(&mut literal)));
                }
                result.push(TextPart::Symbol(symbol.clone()));
                rest = &rest[raw.len()..];
            } else {
                let c = rest.chars().next().expect("nonempty");
                literal.push(c);
                rest = &rest[c.len_utf8()..];
            }
        }
        if !literal.is_empty() {
            result.push(TextPart::Literal(literal));
        }
        result
    }
    pub fn symbols(&self) -> Value {
        json!(
            self.left
                .iter()
                .map(|(left, (right, symbol))| json!({"left":left,"right":right,"symbol":symbol}))
                .collect::<Vec<_>>()
        )
    }
    /// Stable sort key for unordered DB row sets. Already paired primary keys
    /// retain identity; unpaired dynamic values are placeholders only during ordering.
    pub fn sort_key(&self, path: &str, value: &Value, left: bool) -> String {
        let entries = if left { &self.left } else { &self.right };
        if let Some((_, kind)) = self.rules.iter().find(|(re, _)| re.is_match(path)) {
            if let Some((_, symbol)) = entries.get(&format!("{kind}:{value}")) {
                return format!("symbol:{symbol}");
            }
            return "<unpaired>".into();
        }
        match value {
            Value::Object(o) => serde_json::to_string(
                &o.iter()
                    .map(|(k, v)| {
                        (
                            k,
                            self.sort_key(
                                &format!("{path}/{}", k.replace('~', "~0").replace('/', "~1")),
                                v,
                                left,
                            ),
                        )
                    })
                    .collect::<BTreeMap<_, _>>(),
            )
            .expect("string map"),
            Value::Array(a) => serde_json::to_string(
                &a.iter()
                    .enumerate()
                    .map(|(i, v)| self.sort_key(&format!("{path}/{i}"), v, left))
                    .collect::<Vec<_>>(),
            )
            .expect("string array"),
            _ => ["id", "token"]
                .iter()
                .find_map(|kind| {
                    entries
                        .get(&format!("{kind}:{value}"))
                        .map(|(_, s)| format!("symbol:{s}"))
                })
                .unwrap_or_else(|| {
                    serde_json::to_string(&self.text(&value.to_string(), left))
                        .expect("text tokens")
                }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nullable_ids_stay_null_and_never_alias_a_present_value() {
        let mut n = Normalizer::new(&[DynamicRule {
            path: "/id$".into(),
            kind: "id".into(),
        }])
        .unwrap();
        n.compare("/id", &Value::Null, &Value::Null);
        assert!(n.differences.is_empty());
        n.compare("/id", &Value::Null, &json!("present"));
        assert_eq!(n.differences.len(), 1);
    }
    #[test]
    fn timestamp_fields_never_mask_nondynamic_numeric_limits_or_static_dates() {
        let rules = [DynamicRule {
            path: "/timestamp$".into(),
            kind: "ts".into(),
        }];
        for (l, r) in [
            (json!(1000), json!(2000)),
            (json!("2026-01-01T00:00:00Z"), json!("2026-02-01T00:00:00Z")),
        ] {
            let mut n = Normalizer::new(&rules).unwrap();
            n.compare("/timestamp", &l, &r);
            n.compare("/quota", &l, &r);
            assert_eq!(n.differences.len(), 1);
            assert_eq!(n.differences[0].path, "/quota");
        }
    }
    #[test]
    fn detects_both_directions_of_aliasing_across_trees_and_scalar_types() {
        let rules = [DynamicRule {
            path: "/(id|other)$".into(),
            kind: "id".into(),
        }];
        for (l, r) in [
            (json!({"id":"a","other":"a"}), json!({"id":"x","other":"y"})),
            (json!({"id":"a","other":"b"}), json!({"id":"x","other":"x"})),
            (json!({"id":"a"}), json!({"id":1})),
        ] {
            let mut n = Normalizer::new(&rules).unwrap();
            n.compare("", &l, &r);
            assert!(!n.differences.is_empty());
        }
        let mut n = Normalizer::new(&rules).unwrap();
        n.compare("/protocol/id", &json!("a"), &json!("x"));
        n.compare("/database/workspaceId", &json!("a"), &json!("y"));
        assert_eq!(n.differences[0].path, "/database/workspaceId");
    }
}

#[cfg(test)]
mod semantic_regressions {
    use super::*;
    #[test]
    fn timestamp_collisions_are_valid_but_invalid_types_and_formats_are_not() {
        let rules = [DynamicRule {
            path: "/timestamp$".into(),
            kind: "ts".into(),
        }];
        let mut n = Normalizer::new(&rules).unwrap();
        n.compare("/first/timestamp", &json!(1000), &json!(2000));
        n.compare("/second/timestamp", &json!(1000), &json!(2001));
        n.compare(
            "/date/timestamp",
            &json!("2026-01-01T00:00:00Z"),
            &json!("2026-01-02T00:00:00+00:00"),
        );
        assert!(n.differences.is_empty());
        for (l, r) in [
            (json!("invalid"), json!("2026-01-01T00:00:00Z")),
            (json!(1), json!("2026-01-01T00:00:00Z")),
            (Value::Null, json!(1)),
            (json!(-1), json!(1)),
        ] {
            let mut n = Normalizer::new(&rules).unwrap();
            n.compare("/timestamp", &l, &r);
            assert_eq!(n.differences.len(), 1);
        }
    }
    #[test]
    fn placeholder_literals_cannot_impersonate_paired_identifiers() {
        let mut n = Normalizer::new(&[DynamicRule {
            path: "/id$".into(),
            kind: "id".into(),
        }])
        .unwrap();
        n.compare(
            "/id",
            &json!("left-random-identifier"),
            &json!("right-random-identifier"),
        );
        n.compare(
            "/html",
            &json!("<p>left-random-identifier</p>"),
            &json!("<p><id_1></p>"),
        );
        assert_eq!(n.differences.len(), 1);
        assert_eq!(n.differences[0].path, "/html");
    }
}
